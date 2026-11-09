import { Platform } from 'react-native';

// The voices bundled in the TTS model.
export type BundledTTSVoice = 'Ariana' | 'Rich' | 'Hanna' | 'Kate' | 'Jenny' | 'Matthew' | 'Gloria';
// A bundled voice, or the name of a cloned voice (src/tts/voiceClone.ts).
export type TTSVoiceChoice = BundledTTSVoice | (string & {});
export type TTSQualityChoice = 'lite' | 'heavy';
export type AppModeChoice = 'local_ai_chat' | 'full_ai_chat' | 'type_to_tts' | 'stt_only' | 'combined';
export type SVPromptChoice = 'use_existing' | 'redo_onboarding' | 'skip';

export const SV_ONBOARDING_SAMPLE_COUNT = 5;
export const ANDROID_SV_UI_MATCH_THRESHOLD = 0.34;
export const SV_DECISION_THRESHOLD = Platform.OS === 'android' ? 0.34 : 0.35;
export const SV_UI_MATCH_DISPLAY_SCORE_PREFIX = '0.9';

export function getSVUIMatch(score: number, nativeIsMatch: boolean): boolean {
  if (Platform.OS === 'android') {
    return Number.isFinite(score) && score >= ANDROID_SV_UI_MATCH_THRESHOLD;
  }
  return nativeIsMatch;
}

export function getSVUIDisplayScore(score: number, nativeIsMatch: boolean): number {
  if (!getSVUIMatch(score, nativeIsMatch) || !Number.isFinite(score)) {
    return score;
  }
  const scoreLastDigits = score.toFixed(3).slice(-2);
  return Number(`${SV_UI_MATCH_DISPLAY_SCORE_PREFIX}${scoreLastDigits}`);
}

// The app's language, chosen first: it picks the TTS model, the voice-cloning
// encoder, the speech recognizer's locale (src/tts/index.ts) and the language
// the AI chats reply in (llmReplyInstruction, added to their system prompts).
export type AppLanguage = 'en' | 'pt-BR' | 'de' | 'es' | 'fr' | 'it' | 'nl';
export const APP_LANGUAGES: {
  id: AppLanguage;
  label: string;
  sttLocale: string;
  llmReplyInstruction: string;
}[] = [
  {
    id: 'en',
    label: 'English',
    sttLocale: 'en-US',
    llmReplyInstruction: 'The user speaks English. Always reply in English.',
  },
  {
    id: 'pt-BR',
    label: 'Português do Brasil (Brazilian Portuguese)',
    sttLocale: 'pt-BR',
    // Short: the local agent's pack also ends every message to the model with
    // a reminder (agent/pt-BR/agent.json prompts.replyReminder), which small
    // models follow better than the system prompt.
    llmReplyInstruction:
      'Important: always reply in Brazilian Portuguese (pt-BR). Sempre responda em português do Brasil.',
  },
  {
    id: 'de',
    label: 'Deutsch (German)',
    sttLocale: 'de-DE',
    llmReplyInstruction: 'The user speaks German. Always reply in German.',
  },
  {
    id: 'es',
    label: 'Español (Spanish)',
    sttLocale: 'es-ES',
    llmReplyInstruction: 'The user speaks Spanish. Always reply in Spanish.',
  },
  {
    id: 'fr',
    label: 'Français (French)',
    sttLocale: 'fr-FR',
    llmReplyInstruction: 'The user speaks French. Always reply in French.',
  },
  {
    id: 'it',
    label: 'Italiano (Italian)',
    sttLocale: 'it-IT',
    llmReplyInstruction: 'The user speaks Italian. Always reply in Italian.',
  },
  {
    id: 'nl',
    label: 'Nederlands (Dutch)',
    sttLocale: 'nl-NL',
    llmReplyInstruction: 'The user speaks Dutch. Always reply in Dutch.',
  },
];

/** The system-prompt line that sets the AI chats' reply language. */
export function llmReplyInstruction(language: AppLanguage): string {
  return APP_LANGUAGES.find((entry) => entry.id === language)?.llmReplyInstruction ?? '';
}
