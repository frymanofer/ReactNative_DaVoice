// Interrupt mode: is speech heard while the agent talks the user interrupting, or only the agent's own voice
// leaking past echo cancellation? Pure: the caller passes the recognizer's text and what the agent is saying.
//
// Echo cancellation is not perfect, so a word of the agent's own sentence can still reach the recognizer. A word
// the agent is not saying can only have come from the user, and one is enough; a window made only of the agent's
// words is echo.
//
// Flutter: lib/conversation/barge_in.dart, the same rule and the same fixture (conversation_barge_in.json).

export type BargeInDecision = 'interrupt' | 'echo' | 'empty';

export function bargeInWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

export function resolveBargeIn(heard: string, agentText: string): BargeInDecision {
  const words = bargeInWords(heard);
  if (words.length === 0) return 'empty';
  const agentWords = new Set(bargeInWords(agentText));
  return words.every((w) => agentWords.has(w)) ? 'echo' : 'interrupt';
}
