import { Platform } from 'react-native';

export type TTSVoiceChoice = 'Ariana' | 'Rich';
export type TTSQualityChoice = 'lite' | 'heavy';
export type AppModeChoice = 'tts_test' | 'full_ai_chat';
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
