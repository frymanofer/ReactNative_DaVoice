// Decides, without the model, whether a question depends on facts newer than
// the model's training (office holders, news, prices, "latest", recent years).
// A 1.5B model can't reliably judge that itself, and a regex costs nothing, so
// the answer is instant and the same every time.

const TIME_WORDS =
  /\b(current|currently|latest|recent|recently|newest|nowadays|today|tonight|tomorrow|yesterday|right now|at the moment|as of now|this (week|month|year)|these days)\b/i;

/** Roles whose holder changes. Only with a "who" style question, so "tell me a
 * story about a king" doesn't search. */
const OFFICE_WORDS =
  /\b(president|vice president|prime minister|chancellor|king|queen|pope|ceo|chief executive|leader|mayor|governor|minister|secretary of state|head of state|chairman|coach of|owner of|richest)\b/i;
const WHO_QUESTION = /\b(who|whom|whose|name of|is the)\b/i;
/** "Is Joe Biden the president?", "Is he still the CEO?": yes/no questions about
 * an office holder need today's answer too. */
const YES_NO_QUESTION = /^\s*(is|was|are|were|does|did|has|have)\b|\bstill\b/i;
/** "Who runs the US?", "who is in charge of Apple". */
const WHO_RUNS = /\bwho('s| is)? (runs|leads|governs|rules|heads|is running|is leading|is in charge|in charge)\b/i;

const NEWSY =
  /\b(news|headlines|weather|forecast|temperature outside|stock|share price|exchange rate|bitcoin|price of|how much does .* cost|score|standings|who won|winner of|champion|election|elected|release date|just released|happening)\b/i;

/** A recent or future year (2023 and later). */
const RECENT_YEAR = /\b20(2[3-9]|[3-9]\d)\b/;

export function needsWebSearch(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    TIME_WORDS.test(t) ||
    NEWSY.test(t) ||
    RECENT_YEAR.test(t) ||
    WHO_RUNS.test(t) ||
    (OFFICE_WORDS.test(t) && (WHO_QUESTION.test(t) || YES_NO_QUESTION.test(t)))
  );
}

// Wikipedia page for "who holds this office" questions. Wikipedia's keyword
// search matches the question's own words, so "Is Joe Biden the president?"
// finds an article about Biden's 2024 campaign and "Who runs the US?" a
// highway; the office's own page names the current holder in its intro.

const OFFICE_TITLES: Array<[RegExp, string]> = [
  [/\bvice president\b/i, 'Vice President'],
  [/\bprime minister\b/i, 'Prime Minister'],
  [/\bpresident\b/i, 'President'],
  [/\bchancellor\b/i, 'Chancellor'],
  [/\bmayor\b/i, 'Mayor'],
  [/\bgovernor\b/i, 'Governor'],
  [/\bking\b/i, 'King'],
  [/\bqueen\b/i, 'Queen'],
];

const PLACES: Array<[RegExp, string]> = [
  [/\b(u\.?s\.?a?|united states( of america)?|america|american|america's)(?=\W|$)/i, 'the United States'],
  [/\b(u\.?k\.?|united kingdom|great britain|britain|british|england)(?=\W|$)/i, 'the United Kingdom'],
  [/\b(france|french)\b/i, 'France'],
  [/\b(germany|german)\b/i, 'Germany'],
  [/\b(canada|canadian)\b/i, 'Canada'],
];

function titleCase(words: string): string {
  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * The Wikipedia page that names the current holder of the office a question
 * asks about, e.g. "Is Joe Biden the president?" → "President of the United
 * States", "who runs the UK" → "Prime Minister of the United Kingdom", "the
 * mayor of London" → "Mayor of London". null when there's no such office.
 */
export function officeHolderPage(question: string): string | null {
  const text = question.trim();
  if (/\bpope\b/i.test(text)) return 'Pope';
  const office = OFFICE_TITLES.find(([pattern]) => pattern.test(text))?.[1];
  const place = PLACES.find(([pattern]) => pattern.test(text))?.[1];
  if (!office) {
    if (!WHO_RUNS.test(text)) return null;
    if (place === 'the United States') return 'President of the United States';
    if (place === 'the United Kingdom') return 'Prime Minister of the United Kingdom';
    return null;
  }
  if (place) return `${office} of ${place}`;
  // "mayor of London", "governor of California": the words after "of".
  const after = text.match(
    /\bof\s+(?:the\s+)?([a-z][a-z .'-]*?)\s*(?:[?.!,]|$|\b(?:right now|now|today|currently|these days|at the moment)\b)/i,
  )?.[1];
  if (after) return `${office} of ${titleCase(after.trim())}`;
  // A president with no country: the user most likely means the US one.
  if (office === 'President' || office === 'Vice President') return `${office} of the United States`;
  return null;
}

/**
 * The neutral question the model answers instead of a yes/no or "who runs"
 * question about an office holder, e.g. "Is Joe Biden the president?" → "Who
 * is the president of the United States today?". A 1.5B model repeats a name
 * from the question even when the search results say otherwise; "The president
 * is Donald Trump" answers the original question correctly too. null for other
 * questions ("How old is the president?" keeps its words).
 */
export function officeHolderQuestion(question: string): string | null {
  const page = officeHolderPage(question);
  if (!page) return null;
  const asksWho = /^\s*(who|who's)\b/i.test(question);
  if (!YES_NO_QUESTION.test(question) && !WHO_RUNS.test(question) && !asksWho) return null;
  // "Prime Minister of the United Kingdom" → "the prime minister of the United Kingdom".
  const office = `the ${page.replace(/^.*?(?= of |$)/, (title) => title.toLowerCase())}`;
  return `Who is ${office} today?`;
}

// Spoken while the search runs, to cover the network delay, and when it
// failed. Each is one plain sentence (the TTS sentence splitter speaks it as
// one piece); no "Mmm"/"Hmm", which the TTS voices don't pronounce well.

const GENERAL_FILLERS = [
  'Well, that is a good question, let me search.',
  'That is a good question, please let me do some digging.',
  'Good question, let me look that up for you.',
  'Let me check the latest information on that.',
  'Give me a second, I will look that up.',
  'Great question, let me find out.',
];

/** Phrases for a kind of question, checked in order; the first match wins. */
const TOPIC_FILLERS: Array<{ pattern: RegExp; fillers: string[] }> = [
  {
    pattern: /\b(weather|forecast|temperature|rain|snow|sunny)\b/i,
    fillers: [
      'Let me check the latest forecast.',
      'Good question, let me look at the weather for you.',
      'Let me see what the weather looks like.',
    ],
  },
  {
    pattern: /\b(price|cost|stock|shares?|exchange rate|bitcoin|crypto|dollar|euro|market)\b/i,
    fillers: [
      'Prices change all the time, let me check the latest numbers.',
      'Let me look up the current figures for you.',
      'Good question, let me check the latest market data.',
    ],
  },
  {
    pattern: /\b(score|scores|won|winner|win|match|game|champion|championship|league|cup|standings|tournament)\b/i,
    fillers: [
      'Let me check the latest results.',
      'Good question, let me look up how that turned out.',
      'Let me see what the latest scores say.',
    ],
  },
  {
    pattern: /\b(news|headlines|happening|happened|announced|released|election|elected)\b/i,
    fillers: [
      'Let me check the latest news on that.',
      'Good question, let me see what is new.',
      'Let me look up the most recent reports.',
    ],
  },
  {
    pattern: /\b(who|whom|whose|president|prime minister|ceo|pope|king|queen|leader|minister|mayor|governor|chancellor)\b/i,
    fillers: [
      'That can change over time, so let me check who it is right now.',
      'Good question, let me make sure I have the latest on that.',
      'Let me check who holds that role today.',
    ],
  },
];

let lastFiller = '';

function pickFrom(fillers: string[], random: () => number): string {
  // Never the same phrase twice in a row.
  const choices = fillers.length > 1 ? fillers.filter((f) => f !== lastFiller) : fillers;
  lastFiller = choices[Math.floor(random() * choices.length)];
  return lastFiller;
}

/**
 * A phrase to say while searching for `question`: usually one that fits the
 * kind of question (weather, prices, results, news, people), sometimes a
 * general one, so repeated questions don't sound scripted.
 */
export function pickSearchFiller(question: string, random: () => number = Math.random): string {
  const topic = TOPIC_FILLERS.find(({ pattern }) => pattern.test(question));
  const pool = topic && random() < 0.7 ? topic.fillers : GENERAL_FILLERS;
  return pickFrom(pool, random);
}

const ONLINE_TOOL_FILLERS = [
  'Let me check that online.',
  "One moment, I'm getting that from the server.",
  'Give me a second to look that up.',
  'Let me fetch that for you.',
];

/** Said while a tool that goes online (a remote MCP server) runs. */
export function pickOnlineToolFiller(random: () => number = Math.random): string {
  return pickFrom(ONLINE_TOOL_FILLERS, random);
}

const SEARCH_FAILED_FILLERS = [
  "Sorry, I can't reach the internet right now.",
  'I could not connect to the internet just now.',
  "It looks like I'm offline at the moment.",
];

/** Said when the search failed (offline, timeout); the model then answers from
 * its training data. Said by the app, not the model, so it's never left out. */
export function pickSearchFailedFiller(random: () => number = Math.random): string {
  return SEARCH_FAILED_FILLERS[Math.floor(random() * SEARCH_FAILED_FILLERS.length)];
}
