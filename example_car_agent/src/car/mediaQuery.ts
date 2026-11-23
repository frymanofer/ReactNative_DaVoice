// What to play = the driver's own words when the model copied them wrong (2026-11-22 phone: "Play Pretty Woman" -> play_media
// {query: "Perma Woman"}, after a few earlier turns; reproduced on the Mac with the same model; "Can you play pretty woman on the
// radio please?" -> "woman"). The model's query is kept when it is what was said, or when it is not a copy of the driver's words
// at all ("Play something relaxing" -> "relaxing music"). Same rules in the Flutter car app (lib/car/media_query.dart, shared
// fixture __tests__/fixtures/media_query.json).

// the words before the title (the first one: a title may hold one, "Play Let Me Play")
const PLAY_VERB = /(?<![\p{L}])(?:play|put on|listen to|toca|toque|tocar|coloca|coloque|bota|poe|põe|quero ouvir|ouvir)(?![\p{L}])/iu;
// words after the title that are not part of it
const TRAILING = /(?:\s+(?:on the radio|on spotify|in the car|for me|please|now|right now|no radio|no rádio|no spotify|pra mim|para mim|por favor|agora))+\s*$/i;
// words a copy may leave out or add without changing what is played
const SMALL = new Set(['a', 'o', 'as', 'os', 'the', 'some', 'um', 'uma', 'me', 'de', 'do', 'da', 'song', 'musica', 'cancao']);

const norm = (w: string): string => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const words = (s: string): string[] => s.split(/\s+/).map(norm).filter(Boolean);

/** The title the driver said after the play verb (their own spelling), or null. */
export function spokenTitle(userText: string): string | null {
  const m = PLAY_VERB.exec(userText);
  if (!m) return null;
  const start = m.index + m[0].length;
  const span = userText.slice(start).replace(/[?.!]+\s*$/, '').replace(TRAILING, '').replace(/^[\s,]+|[\s,]+$/g, '');
  return words(span).length ? span : null;
}

function titleCase(s: string): string {
  return s === s.toLowerCase() ? s.replace(/(^|\s)(\p{L})/gu, (_m, sp, c) => sp + c.toUpperCase()) : s;
}

/** The query to play: the model's, or the driver's words when the model's is a damaged copy of them. */
export function groundMediaQuery(query: string, userText: string): string {
  const span = spokenTitle(userText);
  if (!span) return query;
  const q = words(query).filter((w) => !SMALL.has(w));
  const s = words(span).filter((w) => !SMALL.has(w));
  if (!q.length || !s.length || q.join(' ') === s.join(' ')) return query;
  const exact = q.filter((w) => s.includes(w)).length;
  if (exact === 0) return query; // not a copy of what was said
  // (a) words left out: every query word was said, some said words are missing ("woman" for "pretty woman")
  const leftOut = exact === q.length && s.length > q.length;
  // (b) words misspelt: as many words, at least half exact, the others start with the same letter ("Perma Woman")
  const misspelt = q.length === s.length && exact * 2 >= q.length && q.every((w, i) => s.includes(w) || w[0] === s[i][0]);
  return leftOut || misspelt ? titleCase(span) : query;
}
