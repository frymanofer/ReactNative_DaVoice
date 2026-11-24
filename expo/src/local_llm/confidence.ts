import { basicMessage } from '../car/basicLanguage';
/**
 * Local confidence (agent core configure "confidence"): an application-developer choice, adjustable at runtime.
 *
 * The on-device model's tool call carries a score (the product of the probabilities of the tokens it wrote). With the filter ON, a
 * call scoring below the threshold does not run, and the fallback decides what happens instead:
 *   - clarify: the user is asked to say it again;
 *   - remote:  the request goes to the text-only remote assistant (it never runs car tools);
 *   - decline: the user hears that nothing was changed.
 * With the filter OFF the threshold is ignored. Either way the core's deterministic checks (scope, call guards, never-act, seat rule)
 * still apply, and the score of each action is shown. The score is model-derived, NOT a guaranteed probability of being right.
 */

export type ConfidenceFallback = 'clarify' | 'remote' | 'decline';

export interface ConfidenceSettings {
  enabled: boolean;
  /** 0.0 .. 1.0 in steps of 0.05 */
  threshold: number;
  fallback: ConfidenceFallback;
}

/** OFF by default (the existing behaviour), threshold 0.90, CLARIFY (needs no remote assistant). */
export const DEFAULT_CONFIDENCE: ConfidenceSettings = { enabled: false, threshold: 0.9, fallback: 'clarify' };

export const CONFIDENCE_STEP = 0.05;

export const CONFIDENCE_FALLBACKS: { value: ConfidenceFallback; label: string; detail: string }[] = [
  { value: 'clarify', label: 'Clarify', detail: 'ask the driver to say it again' },
  { value: 'remote', label: 'Remote', detail: 'text-only answer, never a car action' },
  { value: 'decline', label: 'Decline', detail: 'say nothing was changed' },
];

/** Rounds to the 0.05 grid and clamps to 0..1 (no float noise: 0.9 stays 0.9). */
export function snapThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONFIDENCE.threshold;
  const v = Math.min(1, Math.max(0, value));
  return Math.round(v / CONFIDENCE_STEP) * 5 / 100;
}

/** "0.90 / 90%" */
export function formatThreshold(value: number): string {
  const v = snapThreshold(value);
  return `${v.toFixed(2)} / ${Math.round(v * 100)}%`;
}

/** A stored value of any earlier form -> settings. 2026-11-17 stored a number (0 = off, > 0 = on with that minimum, remote). */
export function parseConfidenceSettings(raw: unknown): ConfidenceSettings {
  if (typeof raw === 'number') {
    return raw > 0 ? { enabled: true, threshold: snapThreshold(raw), fallback: 'remote' } : { ...DEFAULT_CONFIDENCE };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Partial<Record<keyof ConfidenceSettings, unknown>>;
    const fallback = CONFIDENCE_FALLBACKS.some((f) => f.value === o.fallback) ? (o.fallback as ConfidenceFallback) : DEFAULT_CONFIDENCE.fallback;
    return {
      enabled: o.enabled === true,
      threshold: typeof o.threshold === 'number' ? snapThreshold(o.threshold) : DEFAULT_CONFIDENCE.threshold,
      fallback,
    };
  }
  return { ...DEFAULT_CONFIDENCE };
}

const MESSAGES: Record<'en' | 'pt-BR', { clarify: string; decline: string; noRemote: string }> = {
  en: {
    clarify: "I'm not sure I understood that. Could you say it again in other words?",
    decline: "I'm not sure enough about that one, so I didn't change anything.",
    noRemote: "I'm not sure enough to do that here, and no remote assistant is set up, so I didn't change anything.",
  },
  'pt-BR': {
    clarify: 'Não tenho certeza se entendi. Pode repetir de outro jeito?',
    decline: 'Não tenho certeza suficiente sobre esse comando, então não mudei nada.',
    noRemote: 'Não tenho certeza suficiente para fazer isso aqui e não há um assistente remoto configurado, então não mudei nada.',
  },
};

/** What the agent core gets (configure {"confidence": ...}); the threshold is sent even when OFF, so switching ON restores it. */
export function toCoreConfidence(s: ConfidenceSettings, language: string): Record<string, unknown> {
  const tuned = language.toLowerCase().startsWith('pt') ? MESSAGES['pt-BR'] : MESSAGES.en;
  // Basic languages (src/car/basicLanguage.ts) have their own sentences
  const m = {
    clarify: basicMessage(language, 'lowClarify') ?? tuned.clarify,
    decline: basicMessage(language, 'lowDecline') ?? tuned.decline,
    noRemote: basicMessage(language, 'lowNoRemote') ?? tuned.noRemote,
  };
  return { enabled: s.enabled, min: snapThreshold(s.threshold), fallback: s.fallback, messages: m };
}

/** What happened to a request (core result "outcome"), for display. */
export type TurnOutcome = 'executed' | 'clarified' | 'declined' | 'remote' | 'ignored' | 'answered';

export const OUTCOME_LABEL: Record<TurnOutcome, string> = {
  executed: 'Executed',
  clarified: 'Clarified',
  declined: 'Declined',
  remote: 'Routed to remote',
  ignored: 'Ignored',
  answered: 'Answered',
};

export interface TurnConfidence {
  /** the model's score for its action, or null when none was measured */
  value: number | null;
  /** the filter held the action back */
  low: boolean;
  /** the filter was on and the score could not be measured */
  unavailable: boolean;
}

/** Reads the core result's {"confidence": {...}, "outcome": ...}; older cores have neither. */
export function readTurn(result: unknown): { outcome?: TurnOutcome; confidence?: TurnConfidence } {
  const r = (result ?? {}) as { outcome?: unknown; confidence?: { value?: unknown; low?: unknown; unavailable?: unknown } };
  const outcome = typeof r.outcome === 'string' && r.outcome in OUTCOME_LABEL ? (r.outcome as TurnOutcome) : undefined;
  const c = r.confidence;
  const confidence = c && typeof c === 'object'
    ? { value: typeof c.value === 'number' ? c.value : null, low: c.low === true, unavailable: c.unavailable === true }
    : undefined;
  return { ...(outcome ? { outcome } : {}), ...(confidence ? { confidence } : {}) };
}

/** "Model score 0.93 (93%)" / "Model score unavailable" */
export function formatScore(c: TurnConfidence | undefined): string {
  if (!c) return '';
  if (c.value === null) return c.unavailable ? 'Model score unavailable' : '';
  return `Model score ${c.value.toFixed(2)} (${Math.round(c.value * 100)}%)`;
}
