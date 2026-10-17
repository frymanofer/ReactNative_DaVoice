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
    (OFFICE_WORDS.test(t) && WHO_QUESTION.test(t))
  );
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
