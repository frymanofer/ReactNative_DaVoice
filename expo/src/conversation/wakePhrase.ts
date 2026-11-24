// The wake phrase at the start of a transcript (the wake-word mode: pre-fetched audio keeps "Hey DaVoice" in front of the request).
// Flutter: dropWakePhrase in lib/conversation/conversation_controller.dart; native: conversation/ConversationController.kt. Shared
// cases: fixtures/conversation_wake_phrase.json.

/**
 * How speech recognition also writes each wake-phrase word, as word sequences (on the phone: "Hey couch", "A coach", "Hey the
 * voice", "Hey da voice", "Hello voice").
 */
const SOUNDS_LIKE: Record<string, string[][]> = {
  hey: [['hey'], ['hi'], ['hay'], ['hei'], ['a'], ['okay'], ['ok']],
  hello: [['hello'], ['hallo'], ['hullo'], ['hola'], ['allo'], ['hey'], ['hi']],
  coach: [['coach'], ['couch'], ['koch'], ['coachs'], ['coaches']],
  davoice: [
    ['davoice'], ['da', 'voice'], ['the', 'voice'], ['de', 'voice'], ['devoice'], ['divoice'], ['dvoice'], ['d', 'voice'],
    ['davoices'], ['the', 'voices'], ['voice'], ['voices'], ['davos'], ['davis'],
  ],
};
/** A first word that counts alone ("Hey, open the window"); "a" or "ok" only count in front of the next word of the phrase. */
const ALONE: Record<string, string[]> = { hey: ['hey', 'hi', 'hay', 'hei'], hello: ['hello', 'hallo', 'hullo'] };

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const forms = (phraseWord: string): string[][] => SOUNDS_LIKE[phraseWord] ?? [[phraseWord]];
const alone = (word: string, phraseWord: string) => (ALONE[phraseWord] ?? [phraseWord]).includes(norm(word));

/**
 * The transcript without the wake phrase that leads it, so the model never gets it: "Hey DaVoice, open the window" -> "open the
 * window". Also part of the phrase ("DaVoice, lock the car", "The voice, lock the car", "Hey, open the window"), the way
 * recognition mishears it ("Hey the voice", "Hey couch"), and the phrase said twice. Only wake words ("Hey DaVoice.", "The voice",
 * "Hey") -> '' (the request is still to come). Words are compared whole: "Coaching tips", "Heyday", "a car" stay as they are.
 */
export function dropWakePhrase(text: string, wakePhrase: string): string {
  const phrase = wakePhrase.split(/\s+/).map(norm).filter(Boolean);
  const words = [...text.matchAll(/[\p{L}\p{N}']+/gu)].map((m) => ({ w: norm(m[0]), end: (m.index ?? 0) + m[0].length }));
  if (words.length === 0) return '';
  if (phrase.length === 0) return text.trim();
  let at = 0; // words consumed
  for (let round = 0; round < 3 && at < words.length; round += 1) {
    const taken = leadingPhrase(words.slice(at).map((x) => x.w), phrase);
    if (taken === 0) break;
    at += taken;
  }
  if (at === 0) return text.trim();
  if (at >= words.length) return '';
  return text.slice(words[at - 1].end).replace(/^[\s,.!?;:'"“”‘’-]+/u, '').trim();
}

/** How many words phrase[from..] takes at the start of words (each phrase word in one of its forms), or -1. Longest first. */
function matchFrom(words: string[], phrase: string[], from: number, at = 0): number {
  if (from === phrase.length) return at;
  let best = -1;
  for (const form of forms(phrase[from])) {
    if (form.every((w, i) => words[at + i] === w)) best = Math.max(best, matchFrom(words, phrase, from + 1, at + form.length));
  }
  return best;
}

/** How many leading words are the wake phrase: all of it, its end ("davoice", "the voice"), or its first word alone ("hey"). */
function leadingPhrase(words: string[], phrase: string[]): number {
  for (let start = 0; start < phrase.length; start += 1) {
    const taken = matchFrom(words, phrase, start);
    if (taken > 0) return taken;
  }
  if (phrase.length > 1 && alone(words[0], phrase[0])) return 1;
  return 0;
}
