// When a pause ends the driver's request (2026-11-25 iPhone log: "Look at", "Please", "Yeah, it's" were sent after the
// end-of-speech silence while the driver was still talking, and the agent answered "Sorry, I didn't catch that" over them).
// Words that cannot end a request ("Set the", "Open", "Can you", "Please") get a longer pause before they are sent; a finished
// request ("Open the window", "Yes", "Stop") is sent after the normal end-of-speech silence.
// The same rule is in the Flutter, Kotlin and Cordova / Capacitor car agents.

/** Extra wait when the words so far cannot end a request (ms). */
export const UNFINISHED_EXTRA_MS = 2000;

const fold = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

type Words = { last: Set<string>; lastTwo: Set<string>; alone: Set<string> };

const EN: Words = {
  // a request never ends on these ("Set the", "Look at", "Open all the doors and")
  last: new Set(['the', 'a', 'an', 'to', 'at', 'of', 'on', 'in', 'into', 'onto', 'for', 'with', 'from', 'by', 'about', 'and', 'or', 'but',
    'my', 'your', 'our', 'their', 'his', 'her', 'its', 'is', 'are', 'was', 'can', 'could', 'would', 'will', 'should', 'please', 'than']),
  // fold() splits "it's" into "it s"
  lastTwo: new Set(['can you', 'could you', 'would you', 'will you', 'it s', 'that s', 'there s', 'i want', 'i d like', 'i would like',
    'set the', 'turn the', 'turn on', 'turn off', 'turn up', 'turn down']),
  // said alone, these start a request
  alone: new Set(['open', 'close', 'shut', 'set', 'turn', 'put', 'make', 'play', 'lock', 'unlock', 'raise', 'lower', 'increase', 'decrease',
    'navigate', 'take', 'find', 'switch', 'tune', 'change', 'hey', 'so', 'um', 'uh', 'and']),
};

const PT: Words = {
  last: new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'em', 'para', 'pra', 'pro', 'por', 'com',
    'e', 'ou', 'mas', 'um', 'uma', 'meu', 'minha', 'seu', 'sua', 'que', 'ao', 'pelo', 'pela']),
  lastTwo: new Set(['voce pode', 'vc pode', 'por favor', 'eu quero', 'eu queria', 'liga o', 'liga a']),
  alone: new Set(['abre', 'fecha', 'coloca', 'poe', 'bota', 'aumenta', 'diminui', 'abaixa', 'baixa', 'sobe', 'toca', 'muda', 'troca',
    'tranca', 'destranca', 'navega', 'leva', 'ei', 'entao', 'e']),
};

/** The words so far cannot end a request ("Set the", "Can you", "Please"). Languages other than English / Portuguese: never. */
export function looksUnfinished(text: string, language: string): boolean {
  const words = fold(text).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const set = language === 'en' ? EN : language.startsWith('pt') ? PT : null;
  if (!set) return false;
  const last = words[words.length - 1];
  if (words.length === 1) {
    // "Please" alone (en); "Por favor" is two words
    if (set.alone.has(last) || (set === EN && last === 'please')) return true;
  }
  if (words.length >= 2 && set.lastTwo.has(`${words[words.length - 2]} ${last}`)) {
    // "por favor" ends many requests ("Fecha a janela, por favor"): unfinished only when it is all that was said
    return !(set === PT && last === 'favor' && words.length > 2);
  }
  // "yes please" / "close it please": a request may end on "please"
  if (last === 'please') return false;
  return set.last.has(last);
}

/** The silence that ends this request: the end-of-speech setting, longer when the words so far cannot end a request. */
export function silenceFor(text: string, baseMs: number, language: string): number {
  return looksUnfinished(text, language) ? baseMs + UNFINISHED_EXTRA_MS : baseMs;
}
