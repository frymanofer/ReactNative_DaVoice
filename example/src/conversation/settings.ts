// Conversation mode settings (the settings sheet): how the user and the agent take turns.
//
// - interrupt: false = take turns (recognition is paused while the agent answers), true = the user can
//   talk over the agent. Interrupting keeps recognition on under the agent's voice, so it needs echo
//   cancellation (AEC): it turns AEC on for speech recognition, the wake word and text to speech.
// - wakeWord: true = each request starts with the wake word (after a reply that asks a question, a short window lets the
//   answer through without it), false = just talk: recognition stays on between requests.
// - Each of the two modes has its own timeouts. The wake-word mode can also keep the audio from just before
//   the speech recognizer opened (preFetchMs), so "Hey Coach, open the window" said in one breath keeps its
//   first words.
//
// The same JSON shape and the same rules are in the Flutter apps (lib/conversation/conversation_settings.dart).

export type WakeWordModeSettings = {
  /** Silence that ends the user's request (ms). */
  endOfSpeechMs: number;
  /** After the wake word (or a tap), how long to wait for the first words before going back to the wake word (ms). */
  listenMs: number;
  /** After a reply that asks a question, how long to listen for the answer without the wake word (ms). 0 = the wake word every time. */
  followUpMs: number;
  /** Audio kept from just before the recognizer opened after the wake word (ms). 0 = off. */
  preFetchMs: number;
  /** The wake word said while the agent is talking stops it and opens a new request. Off (default): the wake word detector stays
   * paused while the agent listens and answers, and listens only between requests. */
  stopWord: boolean;
};

export type FreeModeSettings = {
  /** Silence that ends the user's request (ms). */
  endOfSpeechMs: number;
  /** With nothing said for this long, recognition pauses until the wake word or a tap (ms). 0 = never. */
  idleMs: number;
};

export type ConversationSettings = {
  interrupt: boolean;
  wakeWord: boolean;
  wakeWordMode: WakeWordModeSettings;
  freeMode: FreeModeSettings;
};

/** Today's behaviour: take turns; after the first wake word, recognition stays on (no wake word). */
export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings = {
  interrupt: false,
  wakeWord: false,
  wakeWordMode: { endOfSpeechMs: 2000, listenMs: 8000, followUpMs: 8000, preFetchMs: 2000, stopWord: false },
  freeMode: { endOfSpeechMs: 2000, idleMs: 0 },
};

export type Choice = { value: number; label: string };

export const END_OF_SPEECH_CHOICES: Choice[] = [
  { value: 1000, label: '1 s' },
  { value: 1500, label: '1.5 s' },
  { value: 2000, label: '2 s' },
  { value: 2500, label: '2.5 s' },
  { value: 3000, label: '3 s' },
];
export const LISTEN_CHOICES: Choice[] = [
  { value: 4000, label: '4 s' },
  { value: 6000, label: '6 s' },
  { value: 8000, label: '8 s' },
  { value: 10000, label: '10 s' },
  { value: 15000, label: '15 s' },
];
export const FOLLOW_UP_CHOICES: Choice[] = [
  { value: 0, label: 'Off' },
  { value: 5000, label: '5 s' },
  { value: 8000, label: '8 s' },
  { value: 15000, label: '15 s' },
  { value: 30000, label: '30 s' },
];
export const PRE_FETCH_CHOICES: Choice[] = [
  { value: 0, label: 'Off' },
  { value: 500, label: '0.5 s' },
  { value: 1000, label: '1 s' },
  { value: 2000, label: '2 s' },
  { value: 3000, label: '3 s' },
];
export const IDLE_CHOICES: Choice[] = [
  { value: 0, label: 'Never' },
  { value: 15000, label: '15 s' },
  { value: 30000, label: '30 s' },
  { value: 60000, label: '1 min' },
  { value: 120000, label: '2 min' },
];

const LIMITS = {
  endOfSpeechMs: [500, 6000],
  listenMs: [2000, 60000],
  followUpMs: [0, 120000],
  preFetchMs: [0, 3000],
  idleMs: [0, 600000],
} as const;

function num(v: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Any stored or edited value -> complete, in-range settings (unknown keys dropped, missing ones defaulted). */
export function normalizeConversationSettings(raw: unknown): ConversationSettings {
  const d = DEFAULT_CONVERSATION_SETTINGS;
  const r = obj(raw);
  const w = obj(r.wakeWordMode);
  const f = obj(r.freeMode);
  return {
    interrupt: bool(r.interrupt, d.interrupt),
    wakeWord: bool(r.wakeWord, d.wakeWord),
    wakeWordMode: {
      endOfSpeechMs: num(w.endOfSpeechMs, d.wakeWordMode.endOfSpeechMs, LIMITS.endOfSpeechMs),
      listenMs: num(w.listenMs, d.wakeWordMode.listenMs, LIMITS.listenMs),
      followUpMs: num(w.followUpMs, d.wakeWordMode.followUpMs, LIMITS.followUpMs),
      preFetchMs: num(w.preFetchMs, d.wakeWordMode.preFetchMs, LIMITS.preFetchMs),
      stopWord: bool(w.stopWord, d.wakeWordMode.stopWord),
    },
    freeMode: {
      endOfSpeechMs: num(f.endOfSpeechMs, d.freeMode.endOfSpeechMs, LIMITS.endOfSpeechMs),
      idleMs: num(f.idleMs, d.freeMode.idleMs, LIMITS.idleMs),
    },
  };
}

/** The silence that ends a request in the selected mode. */
export function endOfSpeechMs(s: ConversationSettings): number {
  return s.wakeWord ? s.wakeWordMode.endOfSpeechMs : s.freeMode.endOfSpeechMs;
}

/** One line for the settings row ("Wake word · take turns"). */
export function describeConversation(s: ConversationSettings): string {
  return `${s.wakeWord ? 'Wake word' : 'Just talk'} · ${s.interrupt ? 'interrupt anytime' : 'take turns'}`;
}

type AecRouting = {
  AEC?: { mode: 'off' | 'duringTTS' | 'always' };
  WakewordAEC?: { regular: boolean; duringTTS: boolean };
};

/**
 * The iOS audio routing JSON for these settings: the app's routing (src/wakeword defaultAudioRoutingConfig) with
 * echo cancellation on for every listener when the user can interrupt, and unchanged otherwise. Native builds that
 * read the app-wide AEC key ignore WakewordAEC; older ones read WakewordAEC, kept equivalent.
 */
export function routingConfigForConversation<T extends AecRouting>(base: T, s: ConversationSettings): T {
  if (!s.interrupt) return base;
  return { ...base, AEC: { mode: 'always' }, WakewordAEC: { regular: true, duringTTS: true } };
}
