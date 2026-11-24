import type { ConversationPhase } from './controller';

/** The microphone line: what the conversation is doing now and how to go on. */
export function conversationHint(phase: ConversationPhase, wakePhrase: string, wakeWord: boolean): string {
  if (phase === 'asleep') return wakeWord ? `Say “${wakePhrase}” before each request` : `Say “${wakePhrase}” or tap to talk`;
  if (phase === 'listening') return wakeWord ? 'Listening… say your request' : 'Listening… just talk';
  if (phase === 'busy') return 'Answering… tap to stop';
  return `“${wakePhrase}” + your command`;
}

/** A tap on the microphone line does something (wakes the conversation, or stops the agent). */
export function conversationTapEnabled(phase: ConversationPhase): boolean {
  return phase === 'asleep' || phase === 'busy';
}
