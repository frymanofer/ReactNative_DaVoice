/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import RNFS from 'react-native-fs';
import { GEMINI_API_KEY } from './local.config';

import React, { useEffect, useState, useRef } from 'react';

import { Platform, PermissionsAndroid, Linking, Alert, Share, NativeModules } from 'react-native';
//import { check, request, openSettings, PERMISSIONS, RESULTS } from 'react-native-permissions';

import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
  AppState,
  InputAccessoryView,
  Keyboard,
  InteractionManager,
  Image,
} from 'react-native';

const ARIANA = 0;
const RICH = 1;

const SPEAKER = 0;

const RICH_SPEAKER_SPEED = 1.06;
const ARIANA_SPEAKER_SPEED = 0.88; //0.75;
// const SPEAKER_SPEED = ARIANA_SPEAKER_SPEED;
//const SPEAKER_SPEED = 0.75;
// const SPEAKER_SPEED_ = 0.85;
const SPEAKER_SPEED = 1.0;// 0.85;
const SV_MATCH_HOLD_MS = 500;
const SV_ONBOARDING_SAMPLE_COUNT = 5;
const ANDROID_SV_UI_MATCH_THRESHOLD = 0.5;
const TTS_INPUT_ACCESSORY_ID = 'ttsInputAccessory';
type TTSVoiceChoice = 'Ariana' | 'Rich';
type TTSQualityChoice = 'lite' | 'heavy';
type AppModeChoice = 'tts_test' | 'full_ai_chat';
type SVPromptChoice = 'use_existing' | 'redo_onboarding' | 'skip';

type GeminiChatMessage = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

type AIChatHistoryMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

type SVEnrollmentUIHooks = {
  onStart?: (targetSamples: number) => void;
  onProgress?: (collected: number, target: number) => void;
  onComplete?: (targetSamples: number) => void;
  onFinalizing?: () => void;
};

type GeminiRequestLogMeta = {
  requestId: number;
  userText: string;
};

type GeminiTextPartDebug = {
  index: number;
  text: string;
  length: number;
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_SYSTEM_PROMPT =
  'You are a helpful voice assistant inside a React Native demo app. Reply conversationally, keep answers concise for spoken playback, and avoid markdown. For time-sensitive facts like current leaders, dates, news, prices, or recent events, answer cautiously and say when you may be unsure rather than asserting a stale fact.';
const GEMINI_MAX_OUTPUT_TOKENS = 512;
const GEMINI_THINKING_BUDGET = 256;
const AI_CHAT_MIN_REQUEST_GAP_MS = 4000;
const AI_CHAT_RATE_LIMIT_BACKOFF_MS = 30000;

function getSVUIMatch(score: number, nativeIsMatch: boolean): boolean {
  if (Platform.OS === 'android') {
    return Number.isFinite(score) && score >= ANDROID_SV_UI_MATCH_THRESHOLD;
  }
  return nativeIsMatch;
}

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
}

function normalizeTextForSpeech(text: string): string {
  return text
    .replace(/\s*\n+\s*/g, (match, offset, source) => {
      const before = source.slice(0, offset).trimEnd();
      const after = source.slice(offset + match.length).trimStart();
      const beforeChar = before.slice(-1);
      const afterChar = after.slice(0, 1);
      const hasBoundaryPunctuation = /[.!?,:;]$/.test(before) || /^[.!?,:;]/.test(after);
      return hasBoundaryPunctuation ? ' ' : '. ';
    })
    .replace(/\s+([.!?,:;])/g, '$1')
    .replace(/([.!?,:;]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function generateGeminiReply(
  history: GeminiChatMessage[],
  meta: GeminiRequestLogMeta,
): Promise<string> {
  const transcriptPreview =
    meta.userText.length > 120 ? `${meta.userText.slice(0, 120)}...` : meta.userText;
  console.log(
    `[AIChat] Gemini request #${meta.requestId} start`,
    {
      model: GEMINI_MODEL,
      historyMessages: history.length,
      transcriptPreview,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      thinkingBudget: GEMINI_THINKING_BUDGET,
    },
  );

  console.log(
    `[AIChat] Gemini request #${meta.requestId} full history`,
    JSON.stringify(history, null, 2),
  );

  const requestBody = {
    system_instruction: {
      parts: [{ text: GEMINI_SYSTEM_PROMPT }],
    },
    contents: history,
    tools: [
      {
        google_search: {},
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      thinkingConfig: {
        thinkingBudget: GEMINI_THINKING_BUDGET,
      },
    },
  };

  console.log(
    `[AIChat] Gemini request #${meta.requestId} request body`,
    JSON.stringify(requestBody, null, 2),
  );

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json();
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0];
  const firstParts = Array.isArray(firstCandidate?.content?.parts)
    ? firstCandidate.content.parts
    : [];
  const groundingMetadata = firstCandidate?.groundingMetadata ?? null;
  const firstPartTexts: GeminiTextPartDebug[] = firstParts.map((part: any, index: number) => {
    const text = typeof part?.text === 'string' ? part.text : '';
    return {
      index,
      text,
      length: text.length,
    };
  });

  console.log(
    `[AIChat] Gemini request #${meta.requestId} raw payload`,
    JSON.stringify(payload, null, 2),
  );
  console.log(
    `[AIChat] Gemini request #${meta.requestId} payload summary`,
    {
      status: response.status,
      candidateCount: candidates.length,
      firstCandidateFinishReason: firstCandidate?.finishReason ?? null,
      firstCandidateTokenCount:
        firstCandidate?.tokenCount ??
        payload?.usageMetadata?.candidatesTokenCount ??
        null,
      firstCandidatePartCount: firstParts.length,
      groundingMetadata,
      usageMetadata: payload?.usageMetadata ?? null,
      promptFeedback: payload?.promptFeedback ?? null,
    },
  );
  console.log(
    `[AIChat] Gemini request #${meta.requestId} first candidate parts`,
    JSON.stringify(firstPartTexts, null, 2),
  );

  if (!response.ok) {
    console.log(
      `[AIChat] Gemini request #${meta.requestId} error`,
      {
        status: response.status,
        transcriptPreview,
      },
    );
    const message =
      payload?.error?.message ||
      `Gemini request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = extractGeminiText(payload);
  console.log(
    `[AIChat] Gemini request #${meta.requestId} extracted text`,
    {
      extractedText: text,
      extractedLength: text.length,
    },
  );
  if (!text) {
    console.log(
      `[AIChat] Gemini request #${meta.requestId} empty response`,
      {
        status: response.status,
        transcriptPreview,
      },
    );
    throw new Error('Gemini returned an empty response.');
  }
  console.log(
    `[AIChat] Gemini request #${meta.requestId} success`,
    {
      status: response.status,
      responseLength: text.length,
    },
  );
  return text;
}

const waitForNextInteraction = () =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // 1) Check RECORD_AUDIO
    const has = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (has) return true;

    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    if (status === PermissionsAndroid.RESULTS.GRANTED) return true;

    // Handle “never ask again”
    if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      Alert.alert(
        'Microphone permission required',
        'Please enable microphone permission in Settings.',
        [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel', style: 'cancel' }]
      );
    }
    return false;
  } else {
    /*   // iOS: request explicitly
       const mic = await check(PERMISSIONS.IOS.MICROPHONE);
       if (mic === RESULTS.GRANTED) return true;
   
       if (mic === RESULTS.BLOCKED) {
         Alert.alert('Microphone permission required', 'Enable it in Settings.', [
           { text: 'Open Settings', onPress: () => openSettings() },
           { text: 'Cancel', style: 'cancel' },
         ]);
         return false;
       }
   
       const micReq = await request(PERMISSIONS.IOS.MICROPHONE);
       if (micReq !== RESULTS.GRANTED) return false;
   
       // Optional but usually needed for dictation/STT APIs:
       const sr = await check(PERMISSIONS.IOS.SPEECH_RECOGNITION);
       if (sr === RESULTS.GRANTED) return true;
   
       const srReq = await request(PERMISSIONS.IOS.SPEECH_RECOGNITION);
       return srReq === RESULTS.GRANTED;*/
  }
}

// Below is a part of Speech Feature to play mp3 and WAV file within the same Audio framework.
// You call Speech.playWav with any mp3/wav etc' file you need 
const moonRocksSound = require('./assets/cashRegisterSound.mp3');
const subtractMoonRocksSound = require('./assets/bellServiceDeskPressXThree.mp3');

const ttsModelFast = require('./assets/models/model_ex_ariana_fast.dm');
const ttsModelSlow = require('./assets/models/model_ex_ariana.dm');
const ttsModelRichFast = require('./assets/models/model_ex_rich_fast.dm');
const ttsModelRichSlow = require('./assets/models/model_ex_rich.dm');

// This is how you send the speech library the tts model.
// const ttsModel = require('./assets/models/model_ex.dm');
//const ttsModel = 'model.onnx';

// If you want to use only TTS:
import { DaVoiceTTSInstance } from 'react-native-davoice';
let tts = new DaVoiceTTSInstance();
// If you want to use only STT
//import STT from 'react-native-davoice/stt';
import Speech from 'react-native-davoice/speech';
// import Speech from '@react-native-voice/voice';

// import KeyWordRNBridge from 'react-native-wakeword';
import { KeyWordRNBridgeInstance } from 'react-native-wakeword';
import {
  createKeyWordRNBridgeInstance,
  hasIOSMicPermissions,
  requestIOSMicPermissions,
  hasIOSSpeechRecognitionPermissions,
  requestIOSSpeechRecognitionPermissions
} from 'react-native-wakeword';

// If you created audioRoutingConfig.ts in the lib:
import { setWakewordAudioRoutingConfig } from 'react-native-wakeword';
import type { AudioRoutingConfig } from 'react-native-wakeword';
import {
  createSpeakerVerificationInstance,
  createSpeakerVerificationMicController,
  onSpeakerVerificationOnboardingProgress,
  onSpeakerVerificationOnboardingDone,
  onSpeakerVerificationVerifyResult,
  onSpeakerVerificationError,
} from 'react-native-wakeword';

async function writeEnrollmentJsonToFile(enrollmentJson: string, filename = 'sv_enrollment.json') {
  const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
  await RNFS.writeFile(path, enrollmentJson, 'utf8');
  console.log('[SVJS] wrote enrollment json to', path, 'len=', enrollmentJson.length);
  return path;
}

async function loadEnrollmentJsonFromFile(filename = 'sv_enrollment.json') {
  const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
  const exists = await RNFS.exists(path);
  console.log('loadEnrollmentJsonFromFile() path == ', path);

  if (!exists) {
    console.log('[SVJS] no saved enrollment json at', path);
    return null;
  }

  const enrollmentJson = await RNFS.readFile(path, 'utf8');
  if (!enrollmentJson || enrollmentJson.length < 10) {
    console.warn('[SVJS] saved enrollment json invalid at', path);
    return null;
  }

  console.log('[SVJS] loaded enrollment json from', path, 'len=', enrollmentJson.length);
  return enrollmentJson;
}

// ✅ NEW: endless/continuous mic verification (FIXED: uses native endless mode)
async function startEndlessVerificationWithEnrollmentFix(
  enrollmentJson,
  setUiMessage,
  opts
) {
  if (!enrollmentJson || typeof enrollmentJson !== 'string') {
    throw new Error('[SVJS] startEndlessVerificationWithEnrollmentFix: enrollmentJson is missing');
  }

  const hopSeconds = Number(opts?.hopSeconds ?? 0.25);
  const stopOnMatch = !!opts?.stopOnMatch;
  const waitFirstResult = !!opts?.waitFirstResult;
  const firstResultTimeoutMs = Number(opts?.firstResultTimeoutMs ?? 3000);
  const onStopReady = opts?.onStopReady;
  const onScore = opts?.onScore;
  const matchHoldMs = Number(opts?.matchHoldMs ?? SV_MATCH_HOLD_MS);

  const micConfig = {
    modelPath: 'speaker_model.dm',
    options: {
      decisionThreshold: 0.35,
      //tailSeconds: 2.0,
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  const controllerId = `svVerifyMicFix_${Date.now()}`;
  const ctrl = await createSpeakerVerificationMicController(controllerId);
  await ctrl.create(JSON.stringify(micConfig));
  await ctrl.setEnrollmentJson(enrollmentJson);

  // First-result gate
  let firstDone = false;
  let firstResolve: any = null;
  let firstReject: any = null;
  const firstResultPromise = new Promise((resolve, reject) => {
    firstResolve = resolve;
    firstReject = reject;
  });
  const firstTimeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ timeout: true }), firstResultTimeoutMs)
  );

  let stoppedResolve: any = null;
  const stoppedPromise = new Promise<void>((resolve) => {
    stoppedResolve = resolve;
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try { offR?.(); } catch { }
    try { offE?.(); } catch { }
    try { await ctrl.stop?.(); } catch { }
    try { await ctrl.destroy?.(); } catch { }
    if (!firstDone) {
      firstDone = true;
      try { firstResolve({ stopped: true }); } catch { }
    }
    try { stoppedResolve?.(); } catch { }
  };

  const offE = onSpeakerVerificationError((e) => {
    if (e?.controllerId && e.controllerId !== controllerId) return;
    console.log('[SVJS-FIX] SV ERROR event:', e);
    setUiMessage?.(`⚠️ SV error: ${e?.error ?? JSON.stringify(e)}`);

    if (!firstDone) {
      firstDone = true;
      try { firstReject(new Error(e?.error ?? 'SV_ERROR')); } catch { }
    }
    stop(); // stop on error
  });

  const offR = onSpeakerVerificationVerifyResult((e) => {
    if (e?.controllerId && e.controllerId !== controllerId) return;

    const best = Number(e?.scoreBest ?? e?.bestScore ?? e?.score ?? NaN);
    const ok = !!e?.isMatch;
    const nowMs = Date.now();
    const hasBest = Number.isFinite(best);
    if (ok) {
      matchHoldUntilMs = nowMs + matchHoldMs;
      holdBestScore = hasBest ? best : holdBestScore;
    }
    const inHoldWindow = nowMs < matchHoldUntilMs;
    if (!ok && inHoldWindow && hasBest) {
      holdBestScore = Number.isFinite(holdBestScore) ? Math.max(holdBestScore, best) : best;
    }

    const showAsMatch = ok || inHoldWindow;
    const scoreToShow = showAsMatch && Number.isFinite(holdBestScore) ? holdBestScore : best;
    const uiShowAsMatch = getSVUIMatch(scoreToShow, showAsMatch);
    console.log('[SVJS-FIX] SV VERIFY:', e);
    setUiMessage?.(`🔐 Speaker Identificaiton Match=${uiShowAsMatch ? '✅' : '❌'}`);
    //setUiMessage?.(`🔐 SV(best=${Number.isFinite(scoreToShow) ? scoreToShow.toFixed(3) : 'n/a'}) match=${showAsMatch ? '✅' : '❌'}`);
    onScore?.(scoreToShow, uiShowAsMatch);

    if (!firstDone) {
      firstDone = true;
      try { firstResolve(e); } catch { }
    }

    // Native endless mode keeps emitting; only stop here if requested.
    if (stopOnMatch && ok) stop();
  });
  let matchHoldUntilMs = -1_000_000_000;
  let holdBestScore = Number.NaN;

  setUiMessage?.(`🎙️ Verify Speaker Identification Now`);//  (hop=${hopSeconds}s)`);

  // ✅ KEY FIX: use native endless mode (mic stays open, emits every hopSeconds)
  await ctrl.startEndlessVerifyFromMic(hopSeconds, stopOnMatch, true);

  // Pass stop function out so caller can stop from UI
  onStopReady?.(stop);

  if (waitFirstResult) {
    try {
      await Promise.race([firstResultPromise, firstTimeoutPromise]);
    } catch {
      // ignore here; error handler already stopped
    }
  }

  return stop;
}

// ✅ NEW: endless/continuous mic verification (returns stop() to cleanup)
async function startEndlessVerificationWithEnrollment(
  enrollmentJson,
  setUiMessage,
  opts
) {
  if (!enrollmentJson || typeof enrollmentJson !== 'string') {
    throw new Error('[SVJS] startEndlessVerificationWithEnrollment: enrollmentJson is missing');
  }

  const hopSeconds = Number(opts?.hopSeconds ?? 0.25);
  const stopOnMatch = !!opts?.stopOnMatch;
  const waitFirstResult = !!opts?.waitFirstResult;
  const firstResultTimeoutMs = Number(opts?.firstResultTimeoutMs ?? 3000);
  const onStopReady = opts?.onStopReady;
  const onScore = opts?.onScore;

  const micConfig = {
    modelPath: 'speaker_model.dm',
    options: {
      decisionThreshold: 0.35,
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  const controllerId = `svVerifyMic_${Date.now()}`;
  const ctrl = await createSpeakerVerificationMicController(controllerId);
  await ctrl.create(JSON.stringify(micConfig));
  await ctrl.setEnrollmentJson(enrollmentJson);

  // First-result gate
  let firstDone = false;
  let firstResolve: any = null;
  let firstReject: any = null;
  const firstResultPromise = new Promise((resolve, reject) => {
    firstResolve = resolve;
    firstReject = reject;
  });
  const firstTimeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ timeout: true }), firstResultTimeoutMs)
  );

  let stoppedResolve: any = null;
  const stoppedPromise = new Promise<void>((resolve) => {
    stoppedResolve = resolve;
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try { offR?.(); } catch { }
    try { offE?.(); } catch { }
    try { await ctrl.stop?.(); } catch { }
    try { await ctrl.destroy?.(); } catch { }
    if (!firstDone) {
      firstDone = true;
      try { firstResolve({ stopped: true }); } catch { }
    }
    try { stoppedResolve?.(); } catch { }
  };

  const offE = onSpeakerVerificationError((e) => {
    if (e?.controllerId && e.controllerId !== controllerId) return;
    console.log('[SVJS] SV ERROR event:', e);
    setUiMessage?.(`⚠️ SV error: ${e?.error ?? JSON.stringify(e)}`);

    if (!firstDone) {
      firstDone = true;
      try { firstReject(new Error(e?.error ?? 'SV_ERROR')); } catch { }
    }

    stop(); // stop on error
  });

  const offR = onSpeakerVerificationVerifyResult((e) => {
    if (e?.controllerId && e.controllerId !== controllerId) return;

    const best = Number(e?.scoreBest ?? e?.bestScore ?? e?.score ?? NaN);
    const ok = !!e?.isMatch;
    console.log('[SVJS] SV VERIFY:', e);
    setUiMessage?.(`🔐 SV best=${Number.isFinite(best) ? best.toFixed(3) : 'n/a'} match=${ok ? '✅' : '❌'}`);
    onScore?.(best, ok);

    if (!firstDone) {
      firstDone = true;
      try { firstResolve(e); } catch { }
    }

    // allow next cycle
    inFlight = false;

    if (stopOnMatch && ok) {
      stop();
      return;
    }

    // hop delay then start next verify (resetState=true for fresh audio each cycle)
    setTimeout(() => {
      kick(true).catch((err) => {
        console.log('[SVJS] kick failed:', err);
        stop();
      });
    }, Math.max(0.05, hopSeconds) * 1000);
  });

  let inFlight = false;
  const kick = async (resetState: boolean) => {
    if (stopped) return;
    if (inFlight) return;
    inFlight = true;
    try {
      await ctrl.startVerifyFromMic(resetState);
    } catch (e) {
      inFlight = false;
      if (!firstDone) {
        firstDone = true;
        try { firstReject(e); } catch { }
      }
      throw e;
    }
  };

  setUiMessage?.(`🎙️ SV continuous verify started (hop=${hopSeconds}s)`);
  await kick(true); // first call resets state; subsequent calls keep buffer

  // Pass stop function out before blocking, so caller can stop from UI
  onStopReady?.(stop);

  // Optionally wait before returning
  if (waitFirstResult) {
    try {
      await Promise.race([firstResultPromise, firstTimeoutPromise]);
    } catch {
      // ignore here; error handler already stopped
    }
    await stoppedPromise;     // blocks forever until stop() runs
  }

  return stop;
}

// ✅ NEW: mic-verify helper (THIS is what your code was calling)
async function verifyFromMicWithEnrollment(
  enrollmentJson: string,
  setUiMessage?: (s: string) => void
) {
  if (!enrollmentJson || typeof enrollmentJson !== 'string') {
    throw new Error('[SVJS] verifyFromMicWithEnrollment: enrollmentJson is missing');
  }

  const micConfig = {
    modelPath: 'speaker_model.dm',
    options: {
      decisionThreshold: 0.35,
      // tailSeconds: 2.0,
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  const controllerId = 'svVerifyMic1';
  const ctrl = await createSpeakerVerificationMicController(controllerId);
  await ctrl.create(JSON.stringify(micConfig));
  await ctrl.setEnrollmentJson(enrollmentJson);

  const TIMEOUT_MS = 60_000;

  try {
    const res = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => {
        offR?.(); offE?.();
        reject(new Error('NO_SPEECH_TIMEOUT'));
      }, TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(t);
        offR?.(); offE?.();
      };

      const offE = onSpeakerVerificationError((e) => {
        if (e?.controllerId && e.controllerId !== controllerId) return;
        cleanup();
        reject(new Error(`[SVJS] SV ERROR event: ${JSON.stringify(e)}`));
      });

      const offR = onSpeakerVerificationVerifyResult((e) => {
        if (e?.controllerId && e.controllerId !== controllerId) return;
        cleanup();
        resolve(e);
      });

      ctrl.startVerifyFromMic(true).catch((err) => {
        cleanup();
        reject(err);
      });
    });

    return res;
  } finally {
    try { await ctrl.stop?.(); } catch { }
    try { await ctrl.destroy?.(); } catch { }
  }
}

async function runVerificationWithEnrollment(
  enrollmentJson: string,
  setUiMessage?: (s: string) => void
) {
  if (!enrollmentJson || typeof enrollmentJson !== 'string') {
    throw new Error('[SVJS] runVerificationWithEnrollment: enrollmentJson is missing');
  }

  const micConfig = {
    modelPath: 'speaker_model.dm',
    options: {
      decisionThreshold: 0.35,
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  // 1) Persist enrollmentJson so native can load it like a normal file
  const enrollmentPath = await writeEnrollmentJsonToFile(enrollmentJson, 'davoice_enrollment_runtime.json');

  // 2) Create a SpeakerVerification engine instance (NOT the mic controller)
  const sv = await createSpeakerVerificationInstance('svVerify1');
  await sv.create(
    micConfig.modelPath,
    enrollmentPath,               // <-- IMPORTANT: use the file path we just wrote
    micConfig.options
  );

  /*
  // ---------- (A) Verify WAV files ----------
  const wavs = [
    '1.wav',
    '2.wav',
    '3.wav',
    '4.wav',
    '5.wav',
  ];

  setUiMessage?.('🔐 Verifying WAV files...');
  for (const wav of wavs) {
    try {
      const out = await sv.verifyWavStreaming(wav, true); // resetState=true
      console.log('[SVJS] verifyWav:', wav, out);
      setUiMessage?.(`🔐 WAV: ${wav} → score=${out?.bestScore ?? out?.score ?? 'n/a'}`);
    } catch (e) {
      console.log('[SVJS] verifyWav FAILED:', wav, e);
      setUiMessage?.(`⚠️ WAV verify failed: ${wav}`);
    }
  }
*/
  // ---------- (B) 3 mic trials, wait up to 60s each ----------
  const lines: string[] = [];
  let lastScore: any = null;
  const extractScore = (res: any) => {
    // your log shows: scoreBest / scoreMean / scoreWorst
    return res?.scoreBest ?? res?.bestScore ?? res?.score ?? null;
  };
  const fmt = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(3) : 'n/a';
  };
  const render = (trial: number) => {
    const header = `🎙️ Mic verify trial ${trial}/3 — speak now (up to 60s)...`;
    const last = `last score: ${fmt(lastScore)}`;
    return [header, ...lines, last].join('\n');
  };

  for (let t = 1; t <= 3; t++) {
    // Always show what we have so far (previous score if exists)
    // Always show previous scores + last score BEFORE starting the mic trial
    setUiMessage?.(render(t));
    try {
      const res = await verifyFromMicWithEnrollment(enrollmentJson, setUiMessage);
      console.log('[SVJS] mic verify result:', res);
      const score = extractScore(res);
      lastScore = score;
      lines.push(`verification #${t} score: ${fmt(score)}`);
      // Keep showing history (and last score)
      setUiMessage?.(render(Math.min(t + 1, 3)));
    } catch (e: any) {
      if (String(e?.message || e).includes('NO_SPEECH_TIMEOUT')) {
        lines.push(`verification #${t} score: n/a`);
        setUiMessage?.(render(Math.min(t + 1, 3)));
        continue;
      }
      lines.push(`verification #${t} score: n/a`);
      setUiMessage?.(render(Math.min(t + 1, 3)));
      console.log('[SVJS] mic verify ERROR:', e);
    }
  }
  // Final summary (exact format you asked)
  setUiMessage?.(lines.join('\n'));
  await sv.destroy();
}

async function runSpeakerVerifyEnrollment(
  setUiMessage?: (s: string) => void,
  sampleCount: number = SV_ONBOARDING_SAMPLE_COUNT,
  uiHooks?: SVEnrollmentUIHooks,
): Promise<string> {
  const targetSamples = Math.max(1, Math.floor(sampleCount));
  const micConfig = {
    modelPath: 'speaker_model.dm',
    options: {
      decisionThreshold: 0.35,
      // TODO IOS IGNORES tailSeconds!!! AND ANDROID DOES NOT!!!
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
    },
  };

  const ctrl = await createSpeakerVerificationMicController('svMic1');
  setUiMessage?.('Speaker verification: preparing mic controller...');
  uiHooks?.onStart?.(targetSamples);

  console.log('[SVJS] create mic controller...');
  await ctrl.create(JSON.stringify(micConfig));

  let collected = 0;
  let target = targetSamples;
  let enrollmentJson: string | null = null;

  const waitForNextSVStep = (controllerId: string, beforeCollected: number, timeoutMs = 25000) => {
    return new Promise<{ type: 'progress' | 'done'; ev: any }>((resolve, reject) => {
      const t = setTimeout(() => {
        offP?.();
        offD?.();
        offE?.();
        reject(new Error(`[SVJS] timeout waiting for progress/done (before=${beforeCollected})`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(t);
        offP?.();
        offD?.();
        offE?.();
      };

      const offE = onSpeakerVerificationError((e) => {
        if (e?.controllerId !== controllerId) return;
        cleanup();
        reject(new Error(`[SVJS] SV ERROR event: ${JSON.stringify(e)}`));
      });

      const offP = onSpeakerVerificationOnboardingProgress((e) => {
        if (e?.controllerId !== controllerId) return;
        const c = Number(e?.collected ?? 0);
        if (c > beforeCollected) {
          cleanup();
          resolve({ type: 'progress', ev: e });
        }
      });

      const offD = onSpeakerVerificationOnboardingDone((e) => {
        if (e?.controllerId !== controllerId) return;
        cleanup();
        resolve({ type: 'done', ev: e });
      });
    });
  };

  const offErr = onSpeakerVerificationError((e) => {
    console.log('[SVJS] ERROR event:', e);
  });

  const offProg = onSpeakerVerificationOnboardingProgress((e) => {
    if (e?.controllerId !== 'svMic1') return;
    console.log('[SVJS] PROGRESS event:', e);
    collected = Number(e?.collected ?? collected);
    target = Number(e?.target ?? target);
    uiHooks?.onProgress?.(collected, target);
  });

  const donePromise = new Promise<void>((resolve, reject) => {
    let finished = false;
    const offDone = onSpeakerVerificationOnboardingDone((e) => {
      if (e?.controllerId !== 'svMic1') return;
      if (finished) return;
      finished = true;
      console.log('[SVJS] DONE event:', e);
      enrollmentJson = e?.enrollmentJson ?? e?.enrollment ?? e?.json ?? null;
      offDone?.();
      resolve();
    });
    setTimeout(() => {
      if (finished) return;
      finished = true;
      offDone?.();
      reject(new Error('[SVJS] timeout waiting for onboarding done'));
    }, 60000);
  });

  setUiMessage?.(`Speaker verification: onboarding started. Collecting ${targetSamples} samples.`);
  await ctrl.beginOnboarding?.('davoice', targetSamples, true);

  for (let i = 1; i <= targetSamples; i++) {
    console.log('[SVJS] requesting embedding', i, '/', targetSamples);
    setUiMessage?.(`Speaker verification: collecting sample ${i}/${targetSamples}...`);

    const before = collected;
    const stepPromise = waitForNextSVStep('svMic1', before, 30000);
    await ctrl.getNextEmbeddingFromMic();
    const step = await stepPromise;

    if (step.type === 'done') {
      const e = step.ev;
      enrollmentJson = e?.enrollmentJson ?? e?.enrollment ?? e?.json ?? enrollmentJson;
      setUiMessage?.('Speaker verification: onboarding completed.');
      uiHooks?.onComplete?.(targetSamples);
      break;
    }

    setUiMessage?.(`Speaker verification: collected ${Math.min(collected, targetSamples)}/${targetSamples} samples.`);
  }

  setUiMessage?.('Speaker verification: finalizing speaker profile...');
  uiHooks?.onFinalizing?.();
  await donePromise;

  if (!enrollmentJson || typeof enrollmentJson !== 'string' || enrollmentJson.length < 10) {
    offProg?.();
    offErr?.();
    try { await ctrl.destroy?.(); } catch { }
    throw new Error('[SVJS] onboarding done but enrollmentJson is empty/invalid');
  }

  console.log('[SVJS] enrollmentJson len=', enrollmentJson.length);
  await ctrl.setEnrollmentJson(enrollmentJson);
  setUiMessage?.('Speaker verification: speaker profile saved.');

  offProg?.();
  offErr?.();

  // recommended: close mic-controller to avoid fighting resources during verification
  try { await ctrl.destroy?.(); } catch { }

  return enrollmentJson;
}

/* New Speaker verification  
async function runSpeakerVerifyEnrollment() {
  // 1) Create instance
  const sv = await createSpeakerVerificationInstance('sv1');

  // 2) Create native engine (bundle resource names)
  const createRes = await sv.create(
    'speaker_model.dm',
    'davoice_enrollment.json',
    {
      decisionThreshold: 0.35,
      tailSeconds: 2.0,
      frameSize: 1280,
      maxTailSeconds: 3.0,
      cmn: true,
      expectedLayoutBDT: false,
      // logLevel: 5, // trace
    }
  );
  console.log('SV createRes:', createRes);

  // 4) Cleanup
  await sv.destroy();
}
*/
// Ducking / Unducking
import { disableDucking, enableDucking } from 'react-native-wakeword';

// 
// 
// --> *** IMPORTANT IOS AUDIO SESSION CONFIG ***
// Set Audio session for IOS!!!!
// 
// 
const defaultAudioRoutingConfig: AudioRoutingConfig = {
  // Fallback when no special port match
  default: {
    category: 'playAndRecord',
    mode: 'default',
    options: [
      'mixWithOthers',
      'allowBluetooth',
      'allowBluetoothA2DP',
      'allowAirPlay',
      'defaultToSpeaker',
    ],
    preferredInput: 'none',
  },
  byOutputPort: {
    // 1. CarPlay: run in CarPlay
    carAudio: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
        'overrideMutedMicrophoneInterruption',
      ],
      preferredInput: 'none', // use CarPlay mic
    },

    // 2. Built-in receiver (earpiece): force speaker so user hears responses
    builtInReceiver: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
        'defaultToSpeaker',
      ],
      preferredInput: 'none',
    },

    // ✅ NEW: when we’re already on built-in speaker, keep SAME config
    builtInSpeaker: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
        'defaultToSpeaker',
      ],
      preferredInput: 'none',
    },

    // **** PLEASE NOTE - YOU MAY WANT TO KEEP SPOTIFY ON HD SOUND AND NOT ENABLE MIC WHILE IN A2DP **********
    // 3. Bluetooth A2DP (Spotify etc) – capture from phone mic
    bluetoothA2DP: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
      ],
      preferredInput: 'builtInMic',
    },

    // 4. Bluetooth HFP – call-like; you can later change this if needed
    bluetoothHFP: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
      ],
      preferredInput: 'none', // use HFP mic by default
    },

    // 5. Wired headphones – play in ears, mic from phone
    headphones: {
      category: 'playAndRecord',
      mode: 'default',
      options: [
        'mixWithOthers',
        'allowBluetooth',
        'allowBluetoothA2DP',
        'allowAirPlay',
      ],
      preferredInput: 'none',
    },
  },
};

/*
Ducking/Unducking TEMPORARY code until background timers are
enabled!!
 */

let unDuckingTimerId: any = null;
let unDuckingExpiration = 0;

export const scheduleUnDucking = async seconds => {
  const now = Date.now();
  if (seconds <= 2) {
    seconds = 2;
  }
  const newExpiration = now + seconds * 1000;

  // If a timer exists and it's already longer, skip
  if (unDuckingTimerId && newExpiration <= unDuckingExpiration) {
    return;
  }

  // Cancel any existing timer
  if (unDuckingTimerId) {
    clearTimeout(unDuckingTimerId);
    unDuckingTimerId = null;
  }

  unDuckingExpiration = newExpiration;

  const delay = newExpiration - now;
  unDuckingTimerId = setTimeout(async () => {
    if (unDuckingTimerId == null) {
      // Rat race for unducking.
      unDuckingTimerId = null;
      unDuckingExpiration = 0;
      return;
    }
    unDuckingTimerId = null;
    unDuckingExpiration = 0;
    await disableDucking();
  }, delay);
};

export const enableDuckingAndClearUnDucking = async () => {
  await enableDucking();
  if (unDuckingTimerId) {
    clearTimeout(unDuckingTimerId);
    unDuckingTimerId = null;
  }
  unDuckingExpiration = 0;
};

// Before playing wav file:
// await enableDuckingAndClearUnDucking();
// After playing wav file:
// await scheduleUnDucking()

// ******* END Ducking / Unducking ********

const sidId = 'sid1';
const sidScoreAccept = 0.65; // tweak to your taste

let calledOnce = false;

interface instanceConfig {
  id: string;
  modelName: string;
  threshold: number;
  bufferCnt: number;
  sticky: boolean;
  msBetweenCallbacks: number;
}

const modelName = 'hey_coach_model_28_22012026b.onnx';
//const modelName = 'hey_lookdeep' + (Platform.OS === 'ios' ? '.onnx' : '.dm');
//const modelName = 'ayuda_model_28_05022026' + (Platform.OS === 'ios' ? '.onnx' : '.dm');
// Create an array of instance configurations
const instanceConfigs: instanceConfig[] = [
  { id: 'multi_model_instance', modelName, threshold: 0.999, bufferCnt: 3, sticky: false, msBetweenCallbacks: 1000 },
  // Ayuda:
  //   { id: 'multi_model_instance', modelName, threshold: 0.95, bufferCnt: 3, sticky: false, msBetweenCallbacks: 1000 },
];

// Helper function to format the ONNX file name
const formatWakeWord = (fileName: string) => {
  return fileName
    .replace(/(_model.*|_\d+.*)\.onnx$/, '')
    .replace(/_/g, ' ')
    .replace('.onnx', '')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const AudioPermissionComponent = async () => {
  return ensureMicPermission();
};

type DetectionCallback = (event: any) => void;

// --- instance creation (kept exactly as in your code) ---
async function addInstance(conf: instanceConfig): Promise<KeyWordRNBridgeInstance> {
  const id = conf.id;
  const instance = await createKeyWordRNBridgeInstance(id, false);
  if (!instance) {
    console.error(`Failed to create instance ${id}`);
  }
  console.log(`Instance ${id} created ${instance}`);
  await instance.createInstance(conf.modelName, conf.threshold, conf.bufferCnt);
  console.log(`Instance ${id} createInstance() called`);
  return instance;
}

async function addInstanceMulti(conf: instanceConfig): Promise<KeyWordRNBridgeInstance> {
  const id = conf.id;
  const instance = await createKeyWordRNBridgeInstance(id, false);
  if (!instance) {
    console.error(`Failed to create instance ${id}`);
  }
  console.log(`Instance ${id} created ${instance}`);

  const modelNames = instanceConfigs.map((c) => c.modelName);
  const thresholds = instanceConfigs.map((c) => c.threshold);
  const bufferCnts = instanceConfigs.map((c) => c.bufferCnt);
  const msBetweenCallbacks = instanceConfigs.map((c) => c.msBetweenCallbacks);

  await instance.createInstanceMulti(modelNames, thresholds, bufferCnts, msBetweenCallbacks);
  console.log(`Instance ${id} createInstance() called`);
  return instance;
}

function App(): React.JSX.Element {
  const [isFlashing, setIsFlashing] = useState(false);
  const wakeWords = instanceConfigs.map((config) => formatWakeWord(config.modelName)).join(', ');

  // --- FIX: persist across renders ---
  const myInstanceRef = useRef<KeyWordRNBridgeInstance | null>(null);
  const listenerRef = useRef<any>(null);
  const svStopRef = useRef<null | (() => Promise<void>)>(null);
  const [showSVPrompt, setShowSVPrompt] = useState(false);
  const [svPromptHasSavedEnrollment, setSvPromptHasSavedEnrollment] = useState(false);
  const [showSVStatusScreen, setShowSVStatusScreen] = useState(false);
  const [svStatusCanContinue, setSvStatusCanContinue] = useState(false);
  const [svStatusPhase, setSvStatusPhase] = useState<'idle' | 'onboarding' | 'verifying'>('idle');
  const [svOnboardingCollected, setSvOnboardingCollected] = useState(0);
  const [svOnboardingTarget, setSvOnboardingTarget] = useState(SV_ONBOARDING_SAMPLE_COUNT);
  const [showTTSModelPrompt, setShowTTSModelPrompt] = useState(false);
  const [showAppModePrompt, setShowAppModePrompt] = useState(false);
  const [svRunning, setSvRunning] = useState(false);
  const svChoiceResolverRef = useRef<null | ((choice: SVPromptChoice) => void)>(null);
  const svContinueResolverRef = useRef<null | (() => void)>(null);
  const ttsModelChoiceResolverRef = useRef<
    null | ((choice: { quality: TTSQualityChoice; voice: TTSVoiceChoice }) => void)
  >(null);
  const appModeChoiceResolverRef = useRef<null | ((choice: AppModeChoice) => void)>(null);
  const [ttsQualityChoice, setTtsQualityChoice] = useState<TTSQualityChoice>('lite');
  const [ttsVoiceChoice, setTtsVoiceChoice] = useState<TTSVoiceChoice>('Ariana');
  const [appModeChoice, setAppModeChoice] = useState<AppModeChoice>('tts_test');
  const selectedTTSVoiceRef = useRef<TTSVoiceChoice>('Ariana');
  const selectedTTSModelRef = useRef(ttsModelFast);
  const selectedAppModeRef = useRef<AppModeChoice>('tts_test');
  const enrollmentJsonRef = useRef<string | null>(null);
  const enrollmentJsonPathRef = useRef<string | null>(null);
  const [lastSVScore, setLastSVScore] = useState<{ score: number; isMatch: boolean } | null>(null);
  const lastSVScoreTimeRef = useRef<number | null>(null);
  const [svElapsed, setSvElapsed] = useState<string>('N/A');
  const svElapsedIntervalRef = useRef<any>(null);
  const initStartedRef = useRef(false);
  const speechLibraryInitializedRef = useRef(false);

  const sidRef = useRef<any>(null);
  const [didInitSID, setDidInitSID] = useState(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const svOnboardingProgress = Math.max(
    0,
    Math.min(1, svOnboardingTarget > 0 ? svOnboardingCollected / svOnboardingTarget : 0),
  );

  // --- listener helpers (single-owner) ---
  const detachListener = async () => {
    const curr = listenerRef.current;
    if (curr && typeof curr.remove === 'function') {
      try {
        await curr.remove();
      } catch (e) {
        console.warn('listener.remove failed (ignored):', e);
      }
    }
    listenerRef.current = null;
  };

  const attachListenerOnce = async (
    instance: KeyWordRNBridgeInstance,
    callback: (phrase: string) => void
  ) => {
    await detachListener(); // ensure single active subscription
    const sub = instance.onKeywordDetectionEvent((phrase: string) => {
      const nice = formatWakeWord(phrase);
      console.log(`Instance ${instance.instanceId} detected: ${nice} with phrase`, nice);
      callback(nice);
    });
    console.log('eventListener == ', sub);
    listenerRef.current = sub;
    return sub;
  };

  // // --- Speaker-ID flows (kept) ---
  // const initSpeakerIdWWD = async () => {
  //   try {
  //     const sidIdWWD = 'sidWWD';
  //     const sid = await createSpeakerIdInstance(sidIdWWD);
  //     await sid.createInstanceWWD();
  //     sidRef.current = sid;

  //     const hasDefault = await sid.initVerificationUsingCurrentConfig();
  //     if (!hasDefault) {
  //       setMessage('🎙️ Speaker setup: Please speak for ~3–5 seconds…');
  //       const ob = await sid.onboardFromMicrophoneWWD(3, 12000);
  //       setMessage(`✅ Enrolled (${ob.clusterSize} slices). Verifying…`);
  //       if (Platform.OS === 'android') await sleep(200);
  //     } else {
  //       setMessage('🔐 Found existing speaker profile. Verifying…');
  //     }

  //     const res = await sid.verifyFromMicrophoneWWD(6000);
  //     const ok = (res?.bestScore ?? 0) >= sidScoreAccept;
  //     console.log(`${ok ? '✅' : '❓'} Speaker score: ${res?.bestScore?.toFixed?.(3) ?? 'n/a'} (${res?.bestTargetLabel ?? 'n/a'})`);
  //     setMessage(`${ok ? '✅' : '❓'} Speaker score: ${res?.bestScore?.toFixed?.(3) ?? 'n/a'} (${res?.bestTargetLabel ?? 'n/a'})`);
  //   } catch (err) {
  //     console.error('[SpeakerId] init failed:', err);
  //     setMessage('⚠️ Speaker verification failed (see logs).');
  //   }
  // };

  // const initSpeakerId = async () => {
  //   try {
  //     const sid = await createSpeakerIdInstance(sidId);
  //     await sid.createInstance();
  //     sidRef.current = sid;

  //     const hasDefault = await sid.initVerificationUsingDefaults();

  //     if (!hasDefault) {
  //       setMessage('🎙️ Speaker setup: Please speak for ~3–5 seconds…');
  //       const ob = await sid.onboardFromMicrophone(12000);
  //       setMessage(`✅ Enrolled (${ob.clusterSize} slices). Verifying…`);
  //       if (Platform.OS === 'android') await sleep(200);
  //     } else {
  //       setMessage('🔐 Found existing speaker profile. Verifying…');
  //     }

  //     const res = await sid.verifyFromMicrophone(8000);
  //     const ok = (res?.bestScore ?? 0) >= sidScoreAccept;
  //     console.log(`${ok ? '✅' : '❓'} Speaker score: ${res?.bestScore?.toFixed?.(3) ?? 'n/a'} (${res?.bestTargetLabel ?? 'n/a'})`);
  //     setMessage(`${ok ? '✅' : '❓'} Speaker score: ${res?.bestScore?.toFixed?.(3) ?? 'n/a'} (${res?.bestTargetLabel ?? 'n/a'})`);
  //   } catch (err) {
  //     console.error('[SpeakerId] init failed:', err);
  //     setMessage('⚠️ Speaker verification failed (see logs).');
  //   }
  // };

  // permissions + appstate
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState === 'active') {
        try {
          if (Platform.OS === 'android') {
            const granted = await AudioPermissionComponent();
            setIsPermissionGranted(!!granted);
          } else {
            if (await hasIOSMicPermissions() != true) {
              await requestIOSMicPermissions(20000);
            }
            if (await hasIOSSpeechRecognitionPermissions() != true) {
              requestIOSSpeechRecognitionPermissions(20000)
            }
            // Keep iOS behavior unchanged by Android-first permission gating.
            setIsPermissionGranted(true);
          }
        } catch (error) {
          console.error('Error requesting permissions:', error);
          setIsPermissionGranted(Platform.OS !== 'android');
        }
      }
    };

    const appStateListener = AppState.addEventListener('change', handleAppStateChange);
    if (AppState.currentState === 'active') {
      handleAppStateChange('active' as any);
    }
    return () => {
      appStateListener.remove();
    };
  }, []);

  useEffect(() => {
    if (isPermissionGranted && !didInitSID) {
      // initSpeakerIdWWD();
      // initSpeakerId();
      setDidInitSID(true);
    }
  }, [isPermissionGranted]);

  // UI message + Speech state (kept)
  const [message, setMessage] = useState(`Full end-to-end voice demo app.\nSay the wake word "${wakeWords}" to continue.`);
  const [isSpeechSessionActive, setIsSpeechSessionActive] = useState(false);
  const [currentSpeechSentence, setCurrentSpeechSentence] = useState('');
  const [isIntroSpeaking, setIsIntroSpeaking] = useState(false);
  const [introSpeakerName, setIntroSpeakerName] = useState<'Rich' | 'Ariana'>('Ariana');
  const [introScript, setIntroScript] = useState('');
  const [isSpeakerIdentificationActive, setIsSpeakerIdentificationActive] = useState(false);
  const [isTTSTestMode, setIsTTSTestMode] = useState(false);
  const [isFullAIChatMode, setIsFullAIChatMode] = useState(false);
  const [ttsInputText, setTtsInputText] = useState('');
  const [isManualTTSSpeaking, setIsManualTTSSpeaking] = useState(false);
  const [aiChatLiveTranscript, setAiChatLiveTranscript] = useState('');
  const [aiChatTranscript, setAiChatTranscript] = useState('');
  const [aiChatResponse, setAiChatResponse] = useState('');
  const [aiChatStatus, setAiChatStatus] = useState('Waiting for your voice...');
  const [aiChatMessages, setAiChatMessages] = useState<AIChatHistoryMessage[]>([]);
  const [isAIChatHistoryVisible, setIsAIChatHistoryVisible] = useState(false);
  const [isAIChatLoading, setIsAIChatLoading] = useState(false);
  const [isAIChatHelpVisible, setIsAIChatHelpVisible] = useState(false);
  const [isTTSTestHelpVisible, setIsTTSTestHelpVisible] = useState(false);
  const [isAppModeHelpVisible, setIsAppModeHelpVisible] = useState(false);
  const [isAndroidKeyboardVisible, setIsAndroidKeyboardVisible] = useState(false);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [latestWakewordRecordingPaths, setLatestWakewordRecordingPaths] = useState<string[]>([]);
  const lastPartialTimeRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  let vadCBintervalID: any = null;
  const silenceThresholdMsRef = useRef(2000);
  const lastTranscriptRef = useRef('');
  const lastProcessedRef = useRef('');
  const speechUiEpochRef = useRef(0);
  const aiChatInFlightRef = useRef(false);
  const aiChatAwaitingSpeechFinishRef = useRef(false);
  const aiChatRequestIdRef = useRef(0);
  const geminiConversationRef = useRef<GeminiChatMessage[]>([]);
  const lastAIChatSubmitAtRef = useRef(0);
  const aiChatBlockedUntilRef = useRef(0);
  const lastAIChatSubmittedTextRef = useRef('');
  const geminiNetworkRequestCountRef = useRef(0);

  const SILENCE_TIMEOUT = 2000;
  function beginSpeechUiEpoch(): number {
    speechUiEpochRef.current += 1;
    return speechUiEpochRef.current;
  }

  function isSpeechUiEpochCurrent(epoch: number): boolean {
    return speechUiEpochRef.current === epoch;
  }

  function setCurrentSpeechSentenceGuarded(epoch: number, value: string) {
    if (!isSpeechUiEpochCurrent(epoch)) return;
    setCurrentSpeechSentence(value);
  }

  function setMessageGuarded(epoch: number, value: string) {
    if (!isSpeechUiEpochCurrent(epoch)) return;
    setMessage(value);
  }

  function setIntroSpeakingGuarded(epoch: number, value: boolean) {
    if (!isSpeechUiEpochCurrent(epoch)) return;
    setIsIntroSpeaking(value);
  }

  function resetSpeechTranscriptState() {
    lastTranscriptRef.current = '';
    lastProcessedRef.current = '';
  }

  function clearSpeechSentenceUI(epoch?: number) {
    if (epoch != null && !isSpeechUiEpochCurrent(epoch)) return;
    setCurrentSpeechSentence('');
  }

  const resetAIChatSession = () => {
    //resetSpeechTranscriptState();
    geminiConversationRef.current = [];
    aiChatInFlightRef.current = false;
    aiChatAwaitingSpeechFinishRef.current = false;
    aiChatRequestIdRef.current = 0;
    geminiNetworkRequestCountRef.current = 0;
    lastAIChatSubmitAtRef.current = 0;
    aiChatBlockedUntilRef.current = 0;
    lastAIChatSubmittedTextRef.current = '';
    setAiChatLiveTranscript('');
    setAiChatTranscript('');
    setAiChatResponse('');
    setAiChatStatus('Waiting for your voice...');
    setAiChatMessages([]);
    setIsAIChatHistoryVisible(false);
    setIsAIChatLoading(false);
  };

  async function initializeSpeechLibrary(enrollmentJsonPath?: string | null) {
    console.log('Calling Speech.initAll');
    if (typeof enrollmentJsonPath === 'string' && enrollmentJsonPath.length > 0) {
      console.log('Calling Speech.initAll with enrollmentJson:', enrollmentJsonPath);
      await Speech.initAll({
        locale: 'en-US',
        model: selectedTTSModelRef.current,
        onboardingJsonPath: enrollmentJsonPath,
      });
    } else {
      console.log('Calling Speech.initAll WITHOUT');
      await Speech.initAll({ locale: 'en-US', model: selectedTTSModelRef.current });
    }

    Speech.onFinishedSpeaking = async () => {
      console.log('onFinishedSpeaking(): ✅ Finished speaking (last WAV done).');
      if (aiChatAwaitingSpeechFinishRef.current) {
        aiChatAwaitingSpeechFinishRef.current = false;
        lastProcessedRef.current = '';
        aiChatInFlightRef.current = false;
        setIsAIChatLoading(false);
        resetSpeechTranscriptState();
        setAiChatStatus('Listening for your next question...');
        await Speech.unPauseSpeechRecognition(-1);
      }
    };
  }

  async function promptForTTSModelChoice() {
    setShowTTSModelPrompt(true);
    const selectedModelChoice = await new Promise<{ quality: TTSQualityChoice; voice: TTSVoiceChoice }>((resolve) => {
      ttsModelChoiceResolverRef.current = resolve;
    });
    setShowTTSModelPrompt(false);

    setTtsQualityChoice(selectedModelChoice.quality);
    setTtsVoiceChoice(selectedModelChoice.voice);
    selectedTTSVoiceRef.current = selectedModelChoice.voice;
    if (selectedModelChoice.voice === 'Rich') {
      selectedTTSModelRef.current =
        selectedModelChoice.quality === 'lite' ? ttsModelRichFast : ttsModelRichSlow;
    } else {
      selectedTTSModelRef.current =
        selectedModelChoice.quality === 'lite' ? ttsModelFast : ttsModelSlow;
    }

    await waitForNextInteraction();
    return selectedModelChoice;
  }

  const processAIChatTurn = async (rawText: string) => {
    const userText = rawText.trim();
    if (!userText || aiChatInFlightRef.current) return;

    const now = Date.now();
    if (now < aiChatBlockedUntilRef.current) {
      const waitSeconds = Math.ceil((aiChatBlockedUntilRef.current - now) / 1000);
      setAiChatStatus(`Gemini cooling down after rate limit. Try again in ${waitSeconds}s.`);
      return;
    }

    if (now - lastAIChatSubmitAtRef.current < AI_CHAT_MIN_REQUEST_GAP_MS) {
      const waitSeconds = Math.ceil(
        (AI_CHAT_MIN_REQUEST_GAP_MS - (now - lastAIChatSubmitAtRef.current)) / 1000,
      );
      setAiChatStatus(`Waiting ${waitSeconds}s before the next Gemini request.`);
      return;
    }

    if (
      userText === lastAIChatSubmittedTextRef.current &&
      now - lastAIChatSubmitAtRef.current < 15000
    ) {
      setAiChatStatus('Same transcript received again. Waiting for a new phrase.');
      return;
    }

    console.log('[AIChat] user transcript:', userText);
    aiChatInFlightRef.current = true;
    lastAIChatSubmitAtRef.current = now;
    lastAIChatSubmittedTextRef.current = userText;
    lastProcessedRef.current = userText;
    const requestId = aiChatRequestIdRef.current + 1;
    aiChatRequestIdRef.current = requestId;
    setAiChatTranscript(userText);
    setAiChatLiveTranscript(userText);
    setAiChatStatus('Sending transcript to Gemini...');
    setAiChatMessages((prev) => [
      ...prev,
      {
        id: `user-${requestId}`,
        role: 'user',
        text: userText,
      },
    ]);
    setIsAIChatLoading(true);

    try {
      await Speech.pauseSpeechRecognition();

      const nextHistory = [
        ...geminiConversationRef.current,
        { role: 'user' as const, parts: [{ text: userText }] },
      ];
      const networkRequestId = geminiNetworkRequestCountRef.current + 1;
      geminiNetworkRequestCountRef.current = networkRequestId;
      console.log(
        `[AIChat] preparing Gemini request #${networkRequestId} for turn #${requestId}`,
        { userText }
      );
      const aiReply = await generateGeminiReply(nextHistory, {
        requestId: networkRequestId,
        userText,
      });
      console.log(`[AIChat] Gemini reply #${networkRequestId}:`, aiReply);
      console.log('[AIChat][FULL_REPLY_BEGIN]');
      console.log(aiReply);
      console.log('[AIChat][FULL_REPLY_END]');

      if (aiChatRequestIdRef.current !== requestId) return;

      geminiConversationRef.current = [
        ...nextHistory,
        { role: 'model' as const, parts: [{ text: aiReply }] },
      ];

      setAiChatResponse(aiReply);
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `model-${requestId}`,
          role: 'model',
          text: aiReply,
        },
      ]);
      setCurrentSpeechSentence(`Gemini: ${aiReply}`);
      setAiChatStatus('Speaking Gemini reply...');
      aiChatAwaitingSpeechFinishRef.current = true;
      await Speech.speak(normalizeTextForSpeech(aiReply), SPEAKER, getSelectedSpeakerSpeed());
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      console.log('[AIChat] Gemini error:', message);
      aiChatAwaitingSpeechFinishRef.current = false;
      if (/quota|rate limit|429|too many requests/i.test(message)) {
        aiChatBlockedUntilRef.current = Date.now() + AI_CHAT_RATE_LIMIT_BACKOFF_MS;
        setAiChatStatus('Gemini rate limit hit. Cooling down for 30 seconds.');
      } else {
        setAiChatStatus(`Gemini error: ${message}`);
      }
    } finally {
      if (aiChatRequestIdRef.current === requestId) {
        if (!aiChatAwaitingSpeechFinishRef.current) {
          lastProcessedRef.current = '';
          aiChatInFlightRef.current = false;
          setIsAIChatLoading(false);
          await Speech.unPauseSpeechRecognition(-1);
        }
      }
    }
  };

  // Speech handlers (kept)
  Speech.onSpeechError = async (e) => {
    console.log('onSpeechError error ignored: ', e);
    if (String(e?.error?.code) === '11' || e?.error?.message === 'Unknown error') {
      console.log('onSpeechError error 11', e);
    } else if (e?.error?.code === '7' || e?.error?.message === 'No match') {
      console.log('onSpeechError error 7', e);
      //await Speech.start('en-US');
    }
  };
  // === minimal coalescer that PRESERVES punctuation ===

  // ASCII word spans (safe for your English prompts). If you need full Unicode,
  // swap the regex to /\p{L}+\p{M}*|\p{N}+/gu (ensure your JS engine supports it).
  const _wordSpans = (s) => {
    const spans = [];
    const re = /[A-Za-z0-9]+/g;
    let m;
    while ((m = re.exec(s))) {
      spans.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
    }
    return spans;
  };

  const _stripPunc = (s) =>
    (s || '').toLowerCase().replace(/[^A-Za-z0-9\s]+/g, '').replace(/\s+/g, ' ').trim();

  const _overlapCount = (aWords, bWords) => {
    const max = Math.min(aWords.length, bWords.length);
    for (let k = max; k >= 1; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) {
        if (aWords[aWords.length - k + i] !== bWords[i]) { ok = false; break; }
      }
      if (ok) return k;
    }
    return 0;
  };

  const mergeSmartKeepPunct = (prev, curr, minOverlap = 2) => {
    prev = (prev || '').trim();
    curr = (curr || '').trim();
    if (!prev) return curr;
    if (!curr) return prev;

    // Fast paths
    if (curr.startsWith(prev)) return curr;   // normal growth
    if (prev.startsWith(curr)) return prev;   // regression → keep longer

    // Punctuation-insensitive prefix (e.g., "Hey." → "Hey, how")
    const np = _stripPunc(prev);
    const nc = _stripPunc(curr);
    if (nc.startsWith(np)) return curr;

    // Word-overlap splice (compute on tokens, splice on ORIGINAL string)
    const pw = _wordSpans(prev).map(o => o.w);
    const cwSpans = _wordSpans(curr);
    const cw = cwSpans.map(o => o.w);

    const k = _overlapCount(pw, cw);
    if (k >= minOverlap) {
      // cut point = end of k-th word in ORIGINAL curr
      const cut = cwSpans[k - 1].end;
      const tail = curr.slice(cut); // keeps punctuation/spacing exactly

      // --- boundary de-dup JUST for merge-caused duplication of ?/! ---
      // If prev ends with ?/! run and tail begins with the same mark run,
      // drop the prev run and keep curr’s (so legit "???" from curr is preserved).
      const prevRun = prev.match(/[?!]+$/);
      const tailRun = tail.match(/^[?!]+/);
      let left = prev;
      if (
        prevRun && tailRun &&
        prevRun[0].length > 0 &&
        tailRun[0].length > 0 &&
        prevRun[0][0] === tailRun[0][0]
      ) {
        left = prev.slice(0, prev.length - prevRun[0].length);
      }

      const needSpace = left && /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(tail);
      return needSpace ? (left + ' ' + tail) : (left + tail);
    }

    // Fallback: pick the one with more info (normalized length), but keep original text
    return nc.length >= np.length ? curr : prev;
  };

  function getAdjustedSpeed(text: string, baseSpeed: number): number {
    /*const wordCount = text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    if (wordCount <= 4) {
      return baseSpeed * 0.5;
    }

    if (wordCount <= 8) {
      return baseSpeed * 0.8;
    }
*/
    return baseSpeed;
  }

  const getSelectedSpeakerSpeed = (): number =>
    selectedTTSVoiceRef.current === 'Rich' ? RICH_SPEAKER_SPEED : ARIANA_SPEAKER_SPEED;

  Speech.onSpeechStart = async () => {
    console.log('onSpeechStart: Speech started');
    setIsSpeechSessionActive(true);
  };

  Speech.onSpeechEnd = async () => {
    console.log('***Sentence ended***:', lastTranscriptRef.current);
    // Keep AIChat-like behavior: do not clear timeout or reset transcript here.
    // Timeout lifecycle is handled by onSpeechPartialResults/onSpeechResults.
    return;
  };

  Speech.onSpeechPartialResults = (e) => {
        console.log('onSpeechPartialResults: 1');

    if (showAppModePrompt || isTTSTestMode || aiChatInFlightRef.current) return;
    const curr = e.value?.[0];
    if (Platform.OS === 'ios') {
      if (curr && curr !== lastTranscriptRef.current) {
        lastTranscriptRef.current = curr;
        lastPartialTimeRef.current = Date.now();
        setCurrentSpeechSentence(curr);
        setAiChatLiveTranscript(curr);
        console.log('Partial:', curr);
      }
      return;
    }
    console.log('Partial:', curr);
    if (!curr || !curr.trim()) return;
    if (curr == undefined) {
      console.log('Partial is undefined!!!!!!');
      return;
    }
    const merged = mergeSmartKeepPunct(lastTranscriptRef.current, curr, 2);
    if (merged === lastTranscriptRef.current) return;

    lastTranscriptRef.current = merged;
    setCurrentSpeechSentence(merged);
    setAiChatLiveTranscript(merged);
    console.log('Partial:', merged);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const newText = lastTranscriptRef.current.trim();
      if (!newText || aiChatInFlightRef.current) return;
      if (isFullAIChatMode) {
        if (newText === lastProcessedRef.current) return;
        console.log('[AIChat] silence timeout reached, sending:', newText);
        await processAIChatTurn(newText);
        return;
      }

      const speechUiEpoch = beginSpeechUiEpoch();
      console.log('⏳ Silence timeout reached, speaking:', lastTranscriptRef.current);
      console.log('🗣️ Speaking:', newText);
      setCurrentSpeechSentenceGuarded(speechUiEpoch, "Speaking now:" + newText);
      await Speech.pauseSpeechRecognition();
      const adjustedSpeed = getAdjustedSpeed(newText, getSelectedSpeakerSpeed());
      await Speech.speak(newText, SPEAKER, adjustedSpeed);
      resetSpeechTranscriptState();
      await Speech.unPauseSpeechRecognition(-1);
      await sleep(300);
      clearSpeechSentenceUI(speechUiEpoch);
    }, silenceThresholdMsRef.current);
  };

Speech.onSpeechResults = async (e) => {
  console.log('onSpeechResults: 1 ');

  if (showAppModePrompt || isTTSTestMode || aiChatInFlightRef.current) {
    console.log('onSpeechResults: leaving?????? ');
    return;
  }

  const current = e.value?.[0]?.trim();

  if (Platform.OS === 'android') {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    console.log('Results: ', e.value?.[0]);
    if (current) {
      lastTranscriptRef.current = mergeSmartKeepPunct(lastTranscriptRef.current, current, 2);
      setCurrentSpeechSentence(lastTranscriptRef.current);
      setAiChatLiveTranscript(lastTranscriptRef.current);
      setAiChatTranscript(lastTranscriptRef.current);
    }
    timeoutRef.current = setTimeout(async () => {
      const newText = lastTranscriptRef.current.trim();
      if (!newText || aiChatInFlightRef.current) return;
      if (isFullAIChatMode) {
        if (newText === lastProcessedRef.current) return;
        console.log('[AIChat] silence timeout reached, sending:', newText);
        await processAIChatTurn(newText);
        return;
      }
      await Speech.speak(newText, SPEAKER, getSelectedSpeakerSpeed());
    }, silenceThresholdMsRef.current);
    return;
  }

  console.log('Results: ', e.value?.[0]);
  if (!current || current === lastTranscriptRef.current) return;
  setCurrentSpeechSentence(current);
  setAiChatLiveTranscript(current);
  setAiChatTranscript(current);
  lastTranscriptRef.current = current;

  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  timeoutRef.current = setTimeout(async () => {
    const newText = lastTranscriptRef.current.trim();
    if (!newText || aiChatInFlightRef.current) return;
    if (isFullAIChatMode) {
      if (newText === lastProcessedRef.current) return;
      console.log('[AIChat] silence timeout reached, sending:', newText);
      await processAIChatTurn(newText);
      return;
    }

    const speechUiEpoch = beginSpeechUiEpoch();
    console.log('⏳ Silence timeout reached, speaking:', lastTranscriptRef.current);
    console.log('🗣️ Speaking:', newText);
    setCurrentSpeechSentenceGuarded(speechUiEpoch, 'Speaking now:' + newText);
    await Speech.pauseSpeechRecognition();
    const adjustedSpeed = getAdjustedSpeed(newText, getSelectedSpeakerSpeed());
    await Speech.speak(newText, SPEAKER, adjustedSpeed);
    resetSpeechTranscriptState();
    await Speech.unPauseSpeechRecognition(-1);
    await sleep(300);
    clearSpeechSentenceUI(speechUiEpoch);
  }, silenceThresholdMsRef.current);
};
  let callbackTimes = 0;
  const isFirstKeywordCallbackRef = useRef(true);
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onKeyboardShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height ?? 0);
      setIsAndroidKeyboardVisible(true);
    });

    const onKeyboardHide = Keyboard.addListener('keyboardDidHide', () => {
      setIsAndroidKeyboardVisible(false);
      setAndroidKeyboardHeight(0);
    });

    return () => {
      onKeyboardShow.remove();
      onKeyboardHide.remove();
    };
  }, []);

  useEffect(() => {


    const keywordCallbackDuringSpeech = async (keywordIndex: any) => {
      console.log("keywordCallbackDuringSpeech: #callbacks == ", callbackTimes);
      callbackTimes += 1;
    }

    // --> WAKE WORD CALLBACK ENTRY !!!!
    // *** === keyword callback === ***
    //
    // THIS IS THE PLACE TO PLAY WITH ASR/STT and TTS
    //
    const keywordCallback = async (keywordIndex: any) => {
      const isFirstCall = isFirstKeywordCallbackRef.current;
      console.log(
        `[keywordCallback] ${isFirstCall ? 'first call' : 'subsequent call'}`,
        { keywordIndex }
      );
      if (isFirstCall) {
        isFirstKeywordCallbackRef.current = false;
      }

      const instance = myInstanceRef.current;
      if (!instance) return;

      // Stop or Pause keyword detection.
      const stopWakeWord = false;
      callbackTimes = 1;
      // 1) Remove listener first (prevents late events)
      /** *** NEW *** do not detachListener when not stopping wake word **/
      if (stopWakeWord)
        await detachListener();

      let wavFilePath = '';
      let recordedWavPaths: string[] = [];

      // 2) Stop Detection (native)
      try {
        if (stopWakeWord)
          await instance.stopKeywordDetection(/* FR add if stop microphone or */);
        else
          await instance.pauseDetection(false);///* FR add if stop microphone or */);

        wavFilePath = await instance.getRecordingWav();
        if (Platform.OS === 'android') {
          recordedWavPaths = await instance.getRecordingWavArray();
        }
        console.log('paths == ', recordedWavPaths);
      } catch { }

      const pathsForSharing =
        Platform.OS === 'android'
          ? (recordedWavPaths.length > 0 ? recordedWavPaths : [wavFilePath]).filter(Boolean)
          : [wavFilePath].filter(Boolean);
      if (pathsForSharing.length > 0) {
        setLatestWakewordRecordingPaths(pathsForSharing);
      }
      await sleep(1000);

      console.log('detected keyword: ', keywordIndex);
      const keywordText = String(keywordIndex ?? '');
      const keywordWords = keywordText.trim().split(/\s+/).filter(Boolean);
      const modelWordIndex = keywordWords.findIndex((w) => w.toLowerCase() === 'model');
      const cleanWakeWord =
        modelWordIndex >= 0
          ? keywordWords.slice(0, modelWordIndex).join(' ')
          : keywordText;
      setMessage(`WakeWord '${cleanWakeWord}' DETECTED`);
      setIsFlashing(true);

      /***** SPEAKER VERIFICATION CODE ONLY *****/
      try {

        let enrollmentJson = enrollmentJsonRef.current;
        {
          console.log('[keywordCallback] Moving past SV onboarding');
          setShowSVPrompt(false);
          setSvRunning(false);
          if (svElapsedIntervalRef.current) {
            clearInterval(svElapsedIntervalRef.current);
            svElapsedIntervalRef.current = null;
          }
        }
        if (isFirstCall) {
          setAppModeChoice('tts_test');
          setIsSpeechSessionActive(false);
          clearSpeechSentenceUI();
          try {
            await Speech.pauseSpeechRecognition();
          } catch (error) {
            console.log('[AppMode] failed to pause speech recognition before mode prompt:', error);
          }
          setShowAppModePrompt(true);
          const selectedModeChoice = await new Promise<AppModeChoice>((resolve) => {
            appModeChoiceResolverRef.current = resolve;
          });
          setShowAppModePrompt(false);
          selectedAppModeRef.current = selectedModeChoice;
          await waitForNextInteraction();
        }

        setMessage('Preparing wake word and speech engine...');

        // await Speech.destroyAll();
        // await sleep(300);

        /***** END OF SPEAKER VERIFICATION CODE ONLY END *****/

        setIsSpeechSessionActive(true);
        setCurrentSpeechSentence('');
        enrollmentJson = enrollmentJsonRef.current ?? enrollmentJson;
        setIsSpeakerIdentificationActive(typeof enrollmentJson === 'string' && enrollmentJson.length > 0);
        console.log('[keywordCallback] Speech already initialized');
        if (!speechLibraryInitializedRef.current) {
          console.warn('[keywordCallback] Speech library was not initialized during startup.');
        }

        //await Speech.initAll({ locale:'en-US', model: ttsModel });
        // Spanish:
        // Spain: es-ES
        // Mexico: es-MX
        // US Spanish: es-US
        // Argentina: es-AR
        // Colombia: es-CO

      } catch (err) {
        console.error('Failed with SV or Speech Recognition:', err);
      }

      // const runWakeWordWithSpeech = true;
      // if (runWakeWordWithSpeech) {
      //         // re-attach listener then start detection
      //   await attachListenerOnce(instance, keywordCallbackDuringSpeech);
      //   await instance.startKeywordDetection(instanceConfigs[0].threshold, true);
      // }

      /**** You can play what activated the wake word ****/
      // const wavPathsToPlay =
      //   recordedWavPaths.length > 0
      //     ? recordedWavPaths.filter(Boolean)
      //     : [wavFilePath].filter(Boolean);

      // for (const path of wavPathsToPlay) {
      //   const exists = await RNFS.exists(path);
      //   if (!exists) {
      //     console.log('Skipping missing wav path:', path);
      //     continue;
      //   }
      //   console.log('Speech.playWav ', path);
      //   await Speech.playWav(path, false);
      //   await sleep(1500);
      // }
      /**** END: You can play what activated the wake word ****/

      // await Speech.playWav(moonRocksSound, false);
      if (selectedAppModeRef.current === 'full_ai_chat') {
        setAiChatStatus('Preparing chat mode...');
        setAiChatTranscript('');
        setAiChatResponse('');
        await enterFullAIChatMode();
        return;
      }

      const speechUiEpoch = beginSpeechUiEpoch();
      await Speech.pauseSpeechRecognition();
      const selectedSpeakerName: 'Rich' | 'Ariana' = selectedTTSVoiceRef.current;
      const introLine = "My name is " + selectedSpeakerName + ", I am one of the coaches in the Lunafit app! I love helping people reach their fitness goals!";
      setMessageGuarded(speechUiEpoch, `${selectedSpeakerName} is speaking...`);
      setIntroSpeakerName(selectedSpeakerName);
      setIntroScript(introLine);
      setCurrentSpeechSentenceGuarded(speechUiEpoch, "Into Message: " + introLine);
      setIntroSpeakingGuarded(speechUiEpoch, true);

      try {
        await Speech.speak(introLine, SPEAKER, getSelectedSpeakerSpeed());
      } finally {
        setIntroSpeakingGuarded(speechUiEpoch, false);
      }
      await Speech.unPauseSpeechRecognition(-1);

      // Hi! Welcome to Lunafit! My name is Ariana. Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals. It's about owning your journey!
      // Hi, Welcome to Lunafit, My name is Ariana, Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals, It's about owning your journey!
      /*
      await Speech.speak("Hi, Welcome to Lunafit, My name is Ariana, Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals, It's about owning your journey!");
      await Speech.speak("Hello, as an AI , I don't have feelings , but I'm here and ready to help you with anything you need. Today, how can I assist you?", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("let me demonstrate. Are you ready.", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("Hey, how are you?", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("Hi guys, how are you?", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
    */
      /*      await Speech.speak("Hello, how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello, how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello, how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello, how are you?", SPEAKER, SPEAKER_SPEED * 0.3);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED * 0.3);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.5);
      await Speech.speak("Hello! how are you?", SPEAKER, SPEAKER_SPEED * 0.3);
      await Speech.speak("Hello good people, how are you?", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you?", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you?", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you?", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you?", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      await Speech.speak("Hello good people, how are you.", SPEAKER, SPEAKER_SPEED * 0.8);
      */
      await waitForNextInteraction();
      resetSpeechTranscriptState();
      await Speech.unPauseSpeechRecognition(-1);
      await sleep(500);
      clearSpeechSentenceUI(speechUiEpoch);

      /*
      setTimeout(async () => {
        await Speech.pauseSpeechRecognition();
         await Speech.speak(introLine, SPEAKER, SPEAKER_SPEED);
        await Speech.unPauseSpeechRecognition(-1);
//      }, 45000);
      }, 20000);
      */

      // await Speech.speak("This is the first, \
      //   react native package with full voice support! \
      //   Luna fitness application is using this package. \
      //   Inside Luna Fitness application you will here things like: \
      //   Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals. It's about owning your journey!");

      // setTimeout(async () => {
      //   await Speech.pauseSpeechRecognition();
      //   setTimeout(async () => {
      //     try {
      //       await tts.initTTS({model: 'model2.onnx'});
      //       await tts.speak("five dot twenty three");
      //       await Speech.playWav(moonRocksSound, false);
      //     }
      //     catch (error) {
      //       console.log("Speech.speak RAISE ERROR", error);
      //     }
      //   }, 300);
      // }, 30000);
      // setTimeout(async () => {
      //   await Speech.unPauseSpeechRecognition(1);
      // }, 100000);
      //  Restart detection after timeout

    };

    const updateVoiceProps = async () => {
      const inst = myInstanceRef.current;
      if (!inst) return;
      try {
        const voiceProps = await inst.getVoiceProps();
        // use if needed
      } catch (error) {
        console.error('Error fetching voice properties:', error);
      }
    };

    // ************ INIT **************
    // --> STARTING POINT - INIT OF KEYWORD DETECTION !!!!
    const initializeKeywordDetection = async () => {
      let enrollmentJson = enrollmentJsonRef.current;
      console.log('initializeKeywordDetection() enrollmentJson == ', enrollmentJson);
      let svChoice = 'skip';
      try {
        await promptForTTSModelChoice();

        if (!enrollmentJson) {
          enrollmentJson = await loadEnrollmentJsonFromFile('sv_enrollment.json');
          console.log('initializeKeywordDetection() 2 enrollmentJson == ', enrollmentJson);

          if (enrollmentJson) {
            console.log('initializeKeywordDetection() 3 enrollmentJson == ', enrollmentJson);
            enrollmentJsonRef.current = enrollmentJson;
            enrollmentJsonPathRef.current = `${RNFS.DocumentDirectoryPath}/sv_enrollment.json`;
            console.log('initializeKeywordDetection() 4 enrollmentJsonPathRef.current == ', enrollmentJsonPathRef.current);
          }
        }
        const hasSavedEnrollment = typeof enrollmentJson === 'string' && enrollmentJson.length > 0;
        setSvPromptHasSavedEnrollment(hasSavedEnrollment);
        setShowSVPrompt(true);
        console.log('initializeKeywordDetection() 2');
        svChoice = await new Promise<SVPromptChoice>((resolve) => {
          console.log('initializeKeywordDetection() 3');
          svChoiceResolverRef.current = resolve;
          console.log('initializeKeywordDetection() 4');
        });
        console.log('initializeKeywordDetection() 5');
        setShowSVPrompt(false);
        setSvPromptHasSavedEnrollment(false);
        if (svChoice !== 'skip') {
          setShowSVStatusScreen(true);
          setSvStatusCanContinue(false);
          setSvOnboardingCollected(0);
          setSvOnboardingTarget(SV_ONBOARDING_SAMPLE_COUNT);
          console.log('initializeKeywordDetection() 6');
          console.log('initializeKeywordDetection() 7');
          if (svChoice === 'redo_onboarding' || !enrollmentJson) {
            /*** --> ENROLLMENT HERE ***/
            setSvStatusPhase('onboarding');
            enrollmentJson = await runSpeakerVerifyEnrollment(setMessage, SV_ONBOARDING_SAMPLE_COUNT, {
              onStart: (targetSamples) => {
                setSvOnboardingTarget(targetSamples);
                setSvOnboardingCollected(0);
              },
              onProgress: (collected, targetSamples) => {
                setSvOnboardingCollected(collected);
                setSvOnboardingTarget(targetSamples);
              },
              onComplete: (targetSamples) => {
                setSvOnboardingCollected(targetSamples);
                setSvOnboardingTarget(targetSamples);
              },
            });
            enrollmentJsonRef.current = enrollmentJson;
            enrollmentJsonPathRef.current = await writeEnrollmentJsonToFile(
              enrollmentJson,
              'sv_enrollment.json',
            );
          }
          setSvStatusPhase('verifying');
          console.log('initializeKeywordDetection() 8');
          // Reset score tracking and start elapsed timer
          setLastSVScore(null);
          console.log('initializeKeywordDetection() 9');
          lastSVScoreTimeRef.current = null;
          console.log('initializeKeywordDetection() 10');
          setSvElapsed('N/A');
          console.log('initializeKeywordDetection() 11');
          svElapsedIntervalRef.current = setInterval(() => {
            console.log('initializeKeywordDetection() 12');
            const t = lastSVScoreTimeRef.current;
            if (t === null) {
              setSvElapsed('N/A');
            } else {
              const sec = (Date.now() - t) / 1000;
              setSvElapsed(sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`);
            }
          }, 100);
          console.log('initializeKeywordDetection() 13');

          setSvRunning(true);
          console.log('initializeKeywordDetection() 14');
          // await runVerificationWithEnrollment(enrollmentJson, setMessage);
          //        svStopRef.current = await startEndlessVerificationWithEnrollment(enrollmentJson, setMessage, { hopSeconds: 0.5, stopOnMatch: false });
          svStopRef.current = await startEndlessVerificationWithEnrollmentFix(
            enrollmentJson,
            setMessage,
            {
              hopSeconds: 0.25, stopOnMatch: false, waitFirstResult: true, firstResultTimeoutMs: 3000,
              onStopReady: (stopFn: () => Promise<void>) => { svStopRef.current = stopFn; },
              onScore: (score: number, isMatch: boolean) => {
                const uiIsMatch = getSVUIMatch(score, isMatch);
                setLastSVScore({ score, isMatch: uiIsMatch });
                lastSVScoreTimeRef.current = Date.now();
                setSvStatusCanContinue(true);
              }
            }
          );
          await new Promise<void>((resolve) => {
            svContinueResolverRef.current = resolve;
          });
          console.log('initializeKeywordDetection()');
          // Cleanup timer when verification ends
          if (svElapsedIntervalRef.current) {
            clearInterval(svElapsedIntervalRef.current);
            svElapsedIntervalRef.current = null;
          }
          setSvRunning(false);
        }
        setShowSVStatusScreen(false);
        setSvStatusCanContinue(false);
        setSvStatusPhase('idle');
        setSvOnboardingCollected(0);
        svContinueResolverRef.current = null;
      } catch (error) {
        console.error('Error loading model:', error);
        setShowSVPrompt(false);
        setSvPromptHasSavedEnrollment(false);
        setShowSVStatusScreen(false);
        setSvStatusCanContinue(false);
        setSvStatusPhase('idle');
        setSvOnboardingCollected(0);
        svContinueResolverRef.current = null;
        setMessage(`Speaker verification debug mode failed: ${String((error as any)?.message ?? error)}`);
        return;
      }

      try {
        // 🔹 *** NEW ***: configure routing once (iOS only) BEFORE creating instances
        if (Platform.OS === 'ios') {
          try {
            await setWakewordAudioRoutingConfig(defaultAudioRoutingConfig);
          } catch (e) {
            console.warn('setWakewordAudioRoutingConfig failed (ignored):', e);
          }
        }

        // --> CREATE THE INSTANCE !!!!
        try {
          console.log('Adding element:', instanceConfigs[0]);
          const instance = await addInstanceMulti(instanceConfigs[0]);
          myInstanceRef.current = instance;
        } catch (error) {
          console.error('Error loading model:', error);
          return;
        }

        // --> Attach the callback !!!!
        const inst = myInstanceRef.current!;
        await attachListenerOnce(inst, keywordCallback);

        const isLicensed = await inst.setKeywordDetectionLicense(
          'MTc4MDI2MTIwMDAwMA==-d3EkPrSbdRWcuiei/cHMRLBhUw9T/NAlbRR3vfrcDu8='
        );
        if (!isLicensed) {
          console.error('No License!!! - setKeywordDetectionLicense returned', isLicensed);
          setMessage('Lincese not valid: Please contact info@davoice.io for a new license');
          return;
        }

        const isSpeechLicensed = await Speech.setLicense(
          'MTc4MDI2MTIwMDAwMA==-d3EkPrSbdRWcuiei/cHMRLBhUw9T/NAlbRR3vfrcDu8='
        );
        if (!isSpeechLicensed) {
          console.error('No License!!! - Speech.setLicense returned', isSpeechLicensed);
          setMessage('Lincese not valid: Please contact info@davoice.io for a new license');
          return;
        }

        /* Below code with enableDucking/disableDucking and startKeywordDetection(xxx, false, ...) - where
        false is the second argument is used to initialze other audio sessions before wake word to duck others etc'
        You can aslo make wake word use the same settings and not chaning audio session.
        // await disableDucking();
        // await enableDucking();
        // await inst.startKeywordDetection(instanceConfigs[0].threshold, false);
        */

        if (svChoice !== 'skip' && typeof enrollmentJsonPathRef.current === 'string' && enrollmentJsonPathRef.current.length > 0) {
          console.log("startKeywordDetection with SV:", enrollmentJsonPathRef.current);
          await inst.startKeywordDetection(instanceConfigs[0].threshold,
            enrollmentJsonPathRef.current || '', true);
        }
        else {
          console.log("startKeywordDetection without SV:");
          await inst.startKeywordDetection(instanceConfigs[0].threshold, true);
        }
        await inst.pauseDetection(false);
        await sleep(100);
        console.log('Post pauseDetection');

        let speechInitCompleted = false;
        try {
          setMessage('Initializing speech engine...');
          console.log('Before initializeSpeechLibrary');
          await withTimeout(
            initializeSpeechLibrary(
              typeof enrollmentJsonPathRef.current === 'string' && enrollmentJsonPathRef.current.length > 0
                ? enrollmentJsonPathRef.current
                : null,
            ),
            15000,
            'Speech.initAll',
          );
          speechLibraryInitializedRef.current = true;
          speechInitCompleted = true;
          console.log('After initializeSpeechLibrary');
          await sleep(1000);

          try {
            await Speech.pauseSpeechRecognition();
          } catch (e) {
            console.warn('Initial pauseSpeechRecognition failed (ignored):', e);
          }
          console.log('Post pauseDetection 2');
        } catch (e) {
          speechLibraryInitializedRef.current = false;
          console.error('Speech initialization failed or hung:', e);
          setMessage('Speech init stalled. Wakeword detection was resumed, but speech may need a retry.');
        } finally {
          try {
            console.log('calling unPauseDetection after speech init path');
            await inst.unPauseDetection();
            console.log('Post pauseDetection 3');
          } catch (unpauseError) {
            console.error('Failed to unpause keyword detection:', unpauseError);
          }
        }

        setMessage(`Full end-to-end voice demo app.\nSay the wake word "${wakeWords}" to continue.`);
        if (!speechInitCompleted) {
          return;
        }
        //await disableDucking();

        let ms = 5000;
        while (ms <= 10000) {
          setTimeout(async () => {
            // await Speech.speak('Hey, Look deep', 0);
          }, ms);
          ms += 2000;
        }

        // vadCBintervalID = setInterval(updateVoiceProps, 200);
      } catch (error) {
        console.error('Error during keyword detection initialization:', error);
      }
    };

    if (initStartedRef.current) return;
    if (!isPermissionGranted || !didInitSID) return;

    initStartedRef.current = true;
    if (!calledOnce) {
      calledOnce = true;
      if (Platform.OS === 'android') {
        setMessage('Preparing voice demo...');
      }
      console.log('Calling initializeKeywordDetection();');
      initializeKeywordDetection();
      console.log('After calling AudioPermissionComponent();');
    }

  }, [isPermissionGranted, didInitSID]);

  const enterTTSTestMode = async () => {
    beginSpeechUiEpoch();
    resetSpeechTranscriptState();
    resetAIChatSession();
    clearSpeechSentenceUI();
    setIsFullAIChatMode(false);
    setIsAIChatHistoryVisible(false);
    setMessage('TTS Test Mode');
    setIsTTSTestMode(true);
  };

  const goBackToModeSelection = async () => {
    beginSpeechUiEpoch();
    resetSpeechTranscriptState();
    resetAIChatSession();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    Keyboard.dismiss();
    clearSpeechSentenceUI();
    setIsSpeechSessionActive(false);
    setIsSpeakerIdentificationActive(false);
    setIsIntroSpeaking(false);
    setIntroScript('');
    setIsManualTTSSpeaking(false);
    setIsFullAIChatMode(false);
    setIsAIChatHistoryVisible(false);
    setIsTTSTestMode(false);
    setTtsInputText('');
    setAppModeChoice(selectedAppModeRef.current);
    setMessage('Choose what you want to test next.');
    setShowAppModePrompt(true);
    try {
      await Speech.pauseSpeechRecognition();
    } catch {
    }
  };

  const enterFullAIChatMode = async () => {
    beginSpeechUiEpoch();
    //resetSpeechTranscriptState();
    resetAIChatSession();
    // if (timeoutRef.current) {
    //   clearTimeout(timeoutRef.current);
    //   timeoutRef.current = null;
    // }
    clearSpeechSentenceUI();
    setShowAppModePrompt(false);
    setShowTTSModelPrompt(false);
    setShowSVPrompt(false);
    setShowSVStatusScreen(false);
    setIsIntroSpeaking(false);
    setIntroScript('');
    setIsTTSTestMode(false);
    setIsAIChatHistoryVisible(false);
    setIsFullAIChatMode(true);
    setMessage('Full AI Chat is active. Start speaking.');
    setAiChatStatus('Listening...');
    setCurrentSpeechSentence('Listening...');
    try {
      await Speech.pauseSpeechRecognition();
    } catch (error) {
      console.log('[AIChat] failed to pause speech recognition before chat reset:', error);
    }
    // await Speech.speak("Hello, I am rich!", SPEAKER, getSelectedSpeakerSpeed());

    try {
      await waitForNextInteraction();
      resetSpeechTranscriptState();
      await Speech.unPauseSpeechRecognition(-1);
      await sleep(300);
    } catch (error) {
      console.log('[AIChat] failed to unpause speech recognition:', error);
      setAiChatStatus('Microphone did not reopen. Please tap Back and try again.');
    }
  };

  const leaveFullAIChatMode = async () => {
    await goBackToModeSelection();
  };

  const speakManualTTS = async () => {
    const text = ttsInputText.trim();
    if (!text || isManualTTSSpeaking) return;
    const speechUiEpoch = beginSpeechUiEpoch();
    setIsManualTTSSpeaking(true);
    setCurrentSpeechSentenceGuarded(speechUiEpoch, `Speaking now: ${text}`);
    try {
      await Speech.speak(text, SPEAKER, getSelectedSpeakerSpeed());
      clearSpeechSentenceUI(speechUiEpoch);
    } finally {
      setIsManualTTSSpeaking(false);
    }
  };

  const clearManualTTSInput = () => {
    setTtsInputText('');
  };

  const speakFromKeyboardAccessory = async () => {
    await speakManualTTS();
    Keyboard.dismiss();
  };

  const toFileUrl = (path: string): string => (path.startsWith('file://') ? path : `file://${path}`);

  const shareLatestRecordings = async () => {
    setIsMenuOpen(false);

    if (latestWakewordRecordingPaths.length === 0) {
      Alert.alert('No recordings', 'No wake-word recordings are available yet.');
      return;
    }

    const existingPaths: string[] = [];
    for (const path of latestWakewordRecordingPaths) {
      try {
        if (await RNFS.exists(path)) existingPaths.push(path);
      } catch { }
    }

    if (existingPaths.length === 0) {
      Alert.alert('Missing files', 'Recorded files were not found on disk.');
      return;
    }

    if (Platform.OS === 'android') {
      const nativeShare = NativeModules.WakewordRecordingShare as
        | { shareRecordings: (paths: string[], title?: string) => Promise<boolean> }
        | undefined;
      if (!nativeShare?.shareRecordings) {
        Alert.alert('Share unavailable', 'Native share module is not available in this build.');
        return;
      }
      await nativeShare.shareRecordings(existingPaths, 'Share wake-word recordings');
      return;
    }

    if (Platform.OS === 'ios') {
      const lastPath = existingPaths[existingPaths.length - 1];
      await Share.share({
        title: 'Share wake-word recording',
        url: toFileUrl(lastPath),
      });
      return;
    }
  };

  const shouldShowFullAIChatScreen =
    isFullAIChatMode ||
    (
      selectedAppModeRef.current === 'full_ai_chat' &&
      !showAppModePrompt &&
      !showTTSModelPrompt &&
      !showSVPrompt &&
      !showSVStatusScreen &&
      !isTTSTestMode &&
      (isSpeechSessionActive || aiChatStatus !== 'Waiting for your voice...')
    );

  const { height: windowHeight } = useWindowDimensions();
  const topLayoutOffset = Math.round(windowHeight * 0.1);
  const logoTopOffset = 14 + topLayoutOffset;
  const contentTopPadding = 156 + topLayoutOffset;
  const menuTopOffset = 128 + topLayoutOffset;

  const renderScreenLogo = () => (
    <View pointerEvents="none" style={[styles.screenLogoWrap, { paddingTop: logoTopOffset }]}>
      <View style={styles.screenLogoBackdrop}>
        <View style={styles.screenLogoGlow} />
        <View style={styles.screenLogoPanel}>
          <Image
            source={require('./assets/images/logo.jpeg')}
            style={styles.screenLogo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.screenLogoFade} />
      </View>
    </View>
  );

  const renderPromptScreen = (
    content: React.ReactNode,
    options?: { keyboardShouldPersistTaps?: 'always' | 'never' | 'handled' },
  ) => (
    <View style={styles.linearGradient}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={[styles.screenScrollContent, { paddingTop: contentTopPadding }]}
        keyboardShouldPersistTaps={options?.keyboardShouldPersistTaps}>
        {renderScreenLogo()}
        {content}
      </ScrollView>
    </View>
  );

  const renderSVOnboardingMeter = () => {
    const fillHeight = `${Math.max(8, Math.round(svOnboardingProgress * 100))}%`;
    return (
      <View style={styles.svOnboardingHero}>
        <View style={styles.svOnboardingTextBlock}>
          <Text style={styles.svOnboardingEyebrow}>Voice Signature Setup</Text>
          <Text style={styles.svPromptTitle}>Capture your voice</Text>
          <Text style={styles.svPromptSubtitle}>
            Speak naturally for a couple of seconds each time. We&apos;ll fill the signature as each sample is saved.
          </Text>
          <View style={styles.svOnboardingCountPill}>
            <Text style={styles.svOnboardingCountText}>
              {svOnboardingCollected} of {svOnboardingTarget} samples captured
            </Text>
          </View>
        </View>
        <View style={styles.svProgressCircleFrame}>
          <View style={styles.svProgressCircleGlow} />
          <View style={styles.svProgressCircleOuter}>
            <View style={styles.svProgressCircleInner}>
              <View style={[styles.svProgressCircleFill, { height: fillHeight }]} />
              <View style={styles.svProgressCircleContent}>
                <Text style={styles.svProgressCirclePercent}>
                  {Math.round(svOnboardingProgress * 100)}%
                </Text>
                <Text style={styles.svProgressCircleLabel}>filled</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const aiChatTitle = 'Chat with Gemini 2.5 Flash';

  if (shouldShowFullAIChatScreen) {
    return (
      <View style={styles.linearGradient}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[styles.aiChatScrollContent, { paddingTop: contentTopPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          scrollEnabled>
            {renderScreenLogo()}
            <View style={[styles.svPromptCard, styles.ttsTestScreenCard]}>
              <View style={styles.helpHeaderRow}>
                <Text style={styles.svPromptTitle}>{aiChatTitle}</Text>
                <TouchableOpacity
                  style={styles.helpIconButton}
                  activeOpacity={0.7}
                  onPress={() => setIsAIChatHelpVisible((prev) => !prev)}>
                  <Text style={styles.helpIconText}>?</Text>
                </TouchableOpacity>
              </View>
              {isAIChatHelpVisible && (
                <Text style={styles.svPromptSubtitle}>
                  Speak naturally and the app will send your STT text to Gemini 2.5 Flash, then speak the reply with the selected voice.
                </Text>
              )}
              <View style={styles.speechSummaryBlock}>
                <Text style={styles.speechSentenceLabel}>Status</Text>
                <Text style={styles.speechSentenceText}>
                  {isAIChatLoading ? 'Working...' : aiChatStatus}
                </Text>
              </View>
              <View style={styles.speechSummaryBlock}>
                <Text style={styles.speechSentenceLabel}>Transcript</Text>
                <Text style={styles.aiChatLiveTranscriptText}>
                  {aiChatLiveTranscript ||
                    aiChatTranscript ||
                    'Start talking and your transcription will appear here in real time.'}
                </Text>
              </View>
              <View style={styles.speechSummaryBlock}>
                <Text style={styles.speechSentenceLabel}>Gemini Reply</Text>
                <Text style={styles.speechSentenceText}>
                  {aiChatResponse || 'Gemini response will appear here.'}
                </Text>
              </View>
              <View style={styles.ttsTestActionRow}>
                <TouchableOpacity
                  style={[styles.ttsSpeakButton, styles.aiChatResetButton]}
                  activeOpacity={0.7}
                  onPress={resetAIChatSession}>
                  <Text style={styles.ttsSpeakButtonText}>Reset Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.svButton, styles.svButtonNo, styles.ttsTestBackButton]}
                  activeOpacity={0.7}
                  onPress={leaveFullAIChatMode}>
                  <Text style={styles.svButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
        </ScrollView>
      </View>
    );
  }

  if (showSVPrompt) {
    return renderPromptScreen(
      <View style={styles.svPromptCard}>
            <Text style={styles.svPromptTitle}>
              {svPromptHasSavedEnrollment ? 'Use Saved Signature?' : 'Enable Speaker Verification?'}
            </Text>
            <Text style={styles.svPromptSubtitle}>
              {svPromptHasSavedEnrollment
                ? 'Use the saved speaker signature, redo onboarding to replace it, or skip speaker verification.'
                : 'Create a speaker signature now, or skip speaker verification.'}
            </Text>
            <View style={styles.svPromptActionStack}>
              <TouchableOpacity
                style={[styles.svButton, styles.svPromptActionButton, styles.svButtonYes]}
                activeOpacity={0.7}
                onPress={() => {
                  svChoiceResolverRef.current?.(
                    svPromptHasSavedEnrollment ? 'use_existing' : 'redo_onboarding',
                  );
                  svChoiceResolverRef.current = null;
                }}>
                <Text style={styles.svButtonText}>
                  {svPromptHasSavedEnrollment ? 'Use Existing' : 'Create Signature'}
                </Text>
              </TouchableOpacity>
              {svPromptHasSavedEnrollment && (
                <TouchableOpacity
                  style={[styles.svButton, styles.svPromptActionButton, styles.svButtonRedo]}
                  activeOpacity={0.7}
                  onPress={() => {
                    svChoiceResolverRef.current?.('redo_onboarding');
                    svChoiceResolverRef.current = null;
                  }}>
                  <Text style={styles.svButtonText}>Redo Onboarding</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.svButton, styles.svPromptActionButton, styles.svButtonNo]}
                activeOpacity={0.7}
                onPress={() => {
                  svChoiceResolverRef.current?.('skip');
                  svChoiceResolverRef.current = null;
                }}>
                  <Text style={styles.svButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
      </View>
    );
  }

  if (showSVStatusScreen) {
    return renderPromptScreen(
      <View style={styles.svPromptCard}>
            {svStatusPhase === 'onboarding' ? (
              <>
                {renderSVOnboardingMeter()}
                <View style={styles.svOnboardingMessageCard}>
                  <Text style={styles.svOnboardingMessageLabel}>Current Step</Text>
                  <Text style={styles.svOnboardingMessageText}>{message}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.svPromptTitle}>Speaker Verification Running</Text>
                <Text style={styles.svPromptSubtitle}>{message}</Text>
                <View style={styles.svStatusMetricsRow}>
                  <View style={styles.svStatusMetricCard}>
                    <Text style={styles.svScoreItemLabel}>Last Score</Text>
                    <Text style={styles.svScoreValue}>
                      {lastSVScore ? lastSVScore.score.toFixed(3) : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.svStatusMetricCard}>
                    <Text style={styles.svScoreItemLabel}>Match</Text>
                    <Text style={styles.svScoreValue}>
                      {lastSVScore ? (lastSVScore.isMatch ? 'YES' : 'NO') : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.svStatusMetricCard}>
                    <Text style={styles.svScoreItemLabel}>Since Last</Text>
                    <Text style={styles.svScoreValue}>{svElapsed}</Text>
                  </View>
                </View>
              </>
            )}
            {svStatusPhase !== 'onboarding' && (
              <TouchableOpacity
                style={[
                  styles.svButton,
                  styles.ttsContinueButton,
                  !svStatusCanContinue && styles.keyboardAccessoryButtonDisabled,
                ]}
                activeOpacity={0.7}
                disabled={!svStatusCanContinue}
                onPress={async () => {
                  if (svElapsedIntervalRef.current) {
                    clearInterval(svElapsedIntervalRef.current);
                    svElapsedIntervalRef.current = null;
                  }
                  if (svStopRef.current) {
                    try {
                      await svStopRef.current();
                    } finally {
                      svStopRef.current = null;
                    }
                  }
                  setIsSpeechSessionActive(false);
                  setCurrentSpeechSentence('');
                  setIsSpeakerIdentificationActive(false);
                  setShowSVStatusScreen(false);
                  setSvStatusCanContinue(false);
                  setSvRunning(false);
                  setMessage(`Full end-to-end voice demo app.\nSay the wake word "${wakeWords}" to continue.`);
                  svContinueResolverRef.current?.();
                  svContinueResolverRef.current = null;
                }}>
                <Text style={styles.svButtonText}>Continue</Text>
              </TouchableOpacity>
            )}
      </View>
    );
  }

  if (showTTSModelPrompt) {
    return renderPromptScreen(
      <View style={styles.svPromptCard}>
            <Text style={styles.svPromptTitle}>Choose Voice Model</Text>
            <View style={styles.ttsOptionSection}>
              <Text style={styles.ttsOptionLabel}>Quality</Text>
              <View style={styles.svButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.svButton,
                    ttsQualityChoice === 'lite' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setTtsQualityChoice('lite')}>
                  <Text style={styles.svButtonText}>Lite</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.svButton,
                    ttsQualityChoice === 'heavy' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setTtsQualityChoice('heavy')}>
                  <Text style={styles.svButtonText}>Heavy</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.ttsOptionSection}>
              <Text style={styles.ttsOptionLabel}>Voice</Text>
              <View style={styles.svButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.svButton,
                    ttsVoiceChoice === 'Ariana' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setTtsVoiceChoice('Ariana')}>
                  <Text style={styles.svButtonText}>Ariana</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.svButton,
                    ttsVoiceChoice === 'Rich' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setTtsVoiceChoice('Rich')}>
                  <Text style={styles.svButtonText}>Rich</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.svButtonRow}>
              <TouchableOpacity
                style={[styles.svButton, styles.ttsContinueButton]}
                activeOpacity={0.7}
                onPress={() => {
                  ttsModelChoiceResolverRef.current?.({
                    quality: ttsQualityChoice,
                    voice: ttsVoiceChoice,
                  });
                  ttsModelChoiceResolverRef.current = null;
                }}>
                <Text style={styles.svButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
      </View>
    );
  }

  if (showAppModePrompt) {
    return renderPromptScreen(
      <View style={styles.svPromptCard}>
            <View style={styles.helpHeaderRow}>
              <View style={styles.helpHeaderTitleWrap}>
                <Text style={styles.svPromptTitle}>Choose Next Area</Text>
              </View>
              <TouchableOpacity
                style={styles.helpIconButton}
                activeOpacity={0.7}
                onPress={() => setIsAppModeHelpVisible((prev) => !prev)}>
                <Text style={styles.helpIconText}>?</Text>
              </TouchableOpacity>
            </View>
            {isAppModeHelpVisible && (
              <Text style={styles.svPromptSubtitle}>
                After voice selection, choose what you want to test next. Gemini is optional, and manual TTS stays available as a separate path.
              </Text>
            )}
            <View style={styles.ttsOptionSection}>
              <Text style={styles.ttsOptionLabel}>Mode</Text>
              <View style={styles.appModeStack}>
                <TouchableOpacity
                  style={[
                    styles.appModeButton,
                    appModeChoice === 'full_ai_chat' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setAppModeChoice('full_ai_chat')}>
                  <Text style={styles.svButtonText}>Full AI Chat</Text>
                  <Text style={styles.appModeDescription}>
                    Use STT text as the Gemini prompt, then speak Gemini&apos;s reply with the selected TTS voice.
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.appModeButton,
                    appModeChoice === 'tts_test' ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setAppModeChoice('tts_test')}>
                  <Text style={styles.svButtonText}>Manual TTS Test</Text>
                  <Text style={styles.appModeDescription}>
                    Skip Gemini and keep the current text-to-speech playground.
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.svButtonRow}>
              <TouchableOpacity
                style={[styles.svButton, styles.ttsContinueButton]}
                activeOpacity={0.7}
                onPress={async () => {
                  if (appModeChoiceResolverRef.current) {
                    appModeChoiceResolverRef.current?.(appModeChoice);
                    appModeChoiceResolverRef.current = null;
                    return;
                  }

                  selectedAppModeRef.current = appModeChoice;
                  setShowAppModePrompt(false);

                  if (appModeChoice === 'full_ai_chat') {
                    await enterFullAIChatMode();
                    return;
                  }

                  await enterTTSTestMode();
                }}>
                <Text style={styles.svButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
      </View>
    );
  }

  if (isTTSTestMode) {
    return (
      <TouchableWithoutFeedback
        onPress={() => {
          Keyboard.dismiss();
          setIsMenuOpen(false);
        }}
        accessible={false}>
        <View
          style={styles.linearGradient}>
          <StatusBar
            barStyle="light-content"
            backgroundColor="transparent"
            translucent
          />
          <ScrollView
            style={styles.screenScroll}
            contentContainerStyle={[styles.screenScrollContent, { paddingTop: contentTopPadding }]}
            keyboardShouldPersistTaps="handled">
            {renderScreenLogo()}
            <View style={[styles.svPromptCard, styles.ttsTestScreenCard]}>
              <View style={styles.helpHeaderRow}>
                <Text style={styles.svPromptTitle}>TTS Test Mode</Text>
                <TouchableOpacity
                  style={styles.helpIconButton}
                  activeOpacity={0.7}
                  onPress={() => setIsTTSTestHelpVisible((prev) => !prev)}>
                  <Text style={styles.helpIconText}>?</Text>
                </TouchableOpacity>
              </View>
              {isTTSTestHelpVisible && (
                <Text style={styles.svPromptSubtitle}>
                  Write text to speak with the selected voice model.
                </Text>
              )}
              <TextInput
                style={styles.ttsInput}
                placeholder="Write text to speak..."
                placeholderTextColor="rgba(255, 255, 255, 0.55)"
                value={ttsInputText}
                onChangeText={setTtsInputText}
                multiline
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                inputAccessoryViewID={Platform.OS === 'ios' ? TTS_INPUT_ACCESSORY_ID : undefined}
              />
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID={TTS_INPUT_ACCESSORY_ID}>
                  <View style={styles.keyboardAccessory}>
                    <TouchableOpacity
                      style={[
                        styles.keyboardAccessoryButton,
                        styles.keyboardClearButton,
                      ]}
                      activeOpacity={0.7}
                      onPress={clearManualTTSInput}>
                      <Text style={styles.keyboardAccessoryButtonText}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.keyboardAccessoryButton,
                        styles.keyboardSpeakButton,
                        (isManualTTSSpeaking || !ttsInputText.trim()) &&
                        styles.keyboardAccessoryButtonDisabled,
                      ]}
                      activeOpacity={0.7}
                      disabled={isManualTTSSpeaking || !ttsInputText.trim()}
                      onPress={speakFromKeyboardAccessory}>
                      <Text style={styles.keyboardAccessoryButtonText}>
                        {isManualTTSSpeaking ? 'Speaking...' : 'Speak'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.keyboardAccessoryButton,
                        styles.keyboardDoneButton,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => Keyboard.dismiss()}>
                      <Text style={styles.keyboardAccessoryButtonText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              )}
                <View style={styles.ttsTestActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.ttsSpeakButton,
                      (isManualTTSSpeaking || !ttsInputText.trim()) && styles.ttsSpeakButtonDisabled,
                  ]}
                  activeOpacity={0.7}
                  disabled={isManualTTSSpeaking || !ttsInputText.trim()}
                  onPress={speakManualTTS}>
                  <Text style={styles.ttsSpeakButtonText}>
                    {isManualTTSSpeaking ? 'Speaking...' : 'Speak'}
                  </Text>
                </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.svButton, styles.svButtonNo, styles.ttsTestBackButton]}
                    activeOpacity={0.7}
                    onPress={goBackToModeSelection}>
                  <Text style={styles.svButtonText}>Back</Text>
                  </TouchableOpacity>
                </View>
              </View>
          </ScrollView>
          {Platform.OS === 'android' && isAndroidKeyboardVisible && (
            <View pointerEvents="box-none" style={styles.androidKeyboardAccessoryWrapper}>
              <View
                style={[
                  styles.keyboardAccessory,
                  styles.keyboardAccessoryAndroid,
                  { bottom: androidKeyboardHeight },
                ]}>
                <TouchableOpacity
                  style={[
                    styles.keyboardAccessoryButton,
                    styles.keyboardClearButton,
                  ]}
                  activeOpacity={0.7}
                  onPress={clearManualTTSInput}>
                  <Text style={styles.keyboardAccessoryButtonText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.keyboardAccessoryButton,
                    styles.keyboardSpeakButton,
                    (isManualTTSSpeaking || !ttsInputText.trim()) &&
                    styles.keyboardAccessoryButtonDisabled,
                  ]}
                  activeOpacity={0.7}
                  disabled={isManualTTSSpeaking || !ttsInputText.trim()}
                  onPress={speakFromKeyboardAccessory}>
                  <Text style={styles.keyboardAccessoryButtonText}>
                    {isManualTTSSpeaking ? 'Speaking...' : 'Speak'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.keyboardAccessoryButton,
                    styles.keyboardDoneButton,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => Keyboard.dismiss()}>
                  <Text style={styles.keyboardAccessoryButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  }

  const shouldShowSpeechSessionCard = isSpeechSessionActive;
  const displayedSpeakerName: TTSVoiceChoice =
    isIntroSpeaking ? introSpeakerName : selectedTTSVoiceRef.current;

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        Keyboard.dismiss();
        setIsMenuOpen(false);
      }}
      accessible={false}>
      <View
        style={styles.linearGradient}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        <View style={[styles.container, { paddingTop: contentTopPadding }]}>
          {renderScreenLogo()}
          <View style={[styles.topMenuContainer, { top: menuTopOffset }]}>
            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.7}
              onPress={() => setIsMenuOpen((prev) => !prev)}>
              <Text style={styles.menuButtonText}>☰</Text>
            </TouchableOpacity>
            {isMenuOpen && (
              <View style={styles.menuDropdown}>
                <TouchableOpacity
                  style={styles.menuItemButton}
                  activeOpacity={0.7}
                  onPress={shareLatestRecordings}>
                  <Text style={styles.menuItemText}>Share recordings</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {/* Main message card */}
          {!shouldShowSpeechSessionCard && (
            <View style={styles.ttsPromptWrapper}>
              <View
                style={[
                  styles.svPromptCard,
                  styles.homeScreenCard,
                  isFlashing && styles.messageCardFlashing,
                ]}>
                <Text style={styles.appLabel}>VOICE DEMO</Text>
                <Text style={styles.title}>{message}</Text>
              </View>
            </View>
          )}

          {shouldShowSpeechSessionCard && (
            <View style={styles.ttsPromptWrapper}>
              <View style={styles.svPromptCard}>
                <Text style={styles.svPromptTitle}>
                  {isIntroSpeaking ? `${displayedSpeakerName} is speaking...` : 'Manual TTS Test'}
                </Text>
                <View style={styles.speechSummaryBlock}>
                  <Text style={styles.speechSentenceLabel}>Speaker</Text>
                  <Text style={styles.speechSentenceText}>{displayedSpeakerName}</Text>
                </View>
                <View style={styles.speechSummaryBlock}>
                  <Text style={styles.speechSentenceLabel}>Current Sentence</Text>
                  <Text style={styles.speechSentenceText}>
                    {isIntroSpeaking ? introScript : currentSpeechSentence || 'Listening...'}
                  </Text>
                </View>
                <View style={styles.speechSummaryBlock}>
                  <Text style={styles.speechSentenceLabel}>Speaker Identification</Text>
                  <Text style={styles.speechSentenceText}>
                    {isSpeakerIdentificationActive ? 'ON' : 'OFF'}
                  </Text>
                </View>
                {!isIntroSpeaking && (
                  <View style={styles.ttsTestActionRow}>
                    <TouchableOpacity
                      style={[styles.svButton, styles.ttsContinueButton]}
                      activeOpacity={0.7}
                      onPress={
                        selectedAppModeRef.current === 'full_ai_chat'
                          ? enterFullAIChatMode
                          : enterTTSTestMode
                      }>
                      <Text style={styles.svButtonText}>
                        {selectedAppModeRef.current === 'full_ai_chat' ? 'Open Full AI Chat' : 'Continue'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.svButton, styles.svButtonNo, styles.ttsTestBackButton]}
                      activeOpacity={0.7}
                      onPress={goBackToModeSelection}>
                      <Text style={styles.svButtonText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  linearGradient: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  screenLogoWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 120,
    alignItems: 'center',
    paddingTop: 14,
  },
  screenLogoBackdrop: {
    width: '100%',
    alignItems: 'center',
  },
  screenLogoGlow: {
    position: 'absolute',
    top: 12,
    width: 320,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
    opacity: 0.55,
  },
  screenLogoPanel: {
    width: 304,
    height: 122,
    borderRadius: 28,
    backgroundColor: 'rgba(12, 18, 38, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#08101f',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 14,
  },
  screenLogo: {
    width: 270,
    height: 86,
  },
  screenLogoFade: {
    marginTop: -10,
    width: 332,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(102, 126, 234, 0.32)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 156,
    paddingBottom: 40,
  },
  topMenuContainer: {
    position: 'absolute',
    top: 128,
    right: 16,
    zIndex: 200,
    alignItems: 'flex-end',
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 22,
  },
  menuDropdown: {
    marginTop: 8,
    minWidth: 180,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 24, 39, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  menuItemButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuItemText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  messageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 28,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    alignItems: 'center',
  },
  messageCardFlashing: {
    backgroundColor: 'rgba(11, 18, 36, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  messageCardSVPromptFocus: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  appLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 3,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 32,
  },
  svPromptContainer: {
    marginTop: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 77, 77, 0.35)',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 100, 100, 0.5)',
  },
  svPromptScreen: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  screenScroll: {
    flex: 1,
    width: '100%',
  },
  screenScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 156,
    paddingBottom: 32,
  },
  fullWidth: {
    width: '100%',
  },
  aiChatScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 156,
    paddingBottom: 72,
  },
  aiChatHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  aiChatHeaderTextWrap: {
    flex: 1,
  },
  aiChatIconButton: {
    minWidth: 68,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  aiChatIconButtonGlyph: {
    fontSize: 18,
  },
  aiChatIconButtonLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  svPromptCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    backgroundColor: 'rgba(7, 12, 26, 0.92)',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  svPromptTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  helpHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  helpHeaderTitleWrap: {
    flex: 1,
  },
  helpIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  helpIconText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 16,
  },
  svPromptSubtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  svOnboardingHero: {
    width: '100%',
    alignItems: 'center',
  },
  svOnboardingTextBlock: {
    width: '100%',
    alignItems: 'center',
  },
  svOnboardingEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(143, 214, 255, 0.88)',
  },
  svOnboardingCountPill: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  svOnboardingCountText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  svProgressCircleFrame: {
    marginTop: 24,
    width: 176,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svProgressCircleGlow: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: 'rgba(64, 192, 255, 0.12)',
    transform: [{ scale: 1.15 }],
  },
  svProgressCircleOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 6,
  },
  svProgressCircleInner: {
    flex: 1,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 14, 28, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  svProgressCircleFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(68, 214, 182, 0.92)',
  },
  svProgressCircleContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  svProgressCirclePercent: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: '#ffffff',
  },
  svProgressCircleLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  svOnboardingMessageCard: {
    width: '100%',
    marginTop: 22,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  svOnboardingMessageLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.62)',
    marginBottom: 8,
  },
  svOnboardingMessageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#ffffff',
    fontWeight: '500',
    textAlign: 'center',
  },
  svStatusMetricsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 18,
    marginBottom: 18,
  },
  svStatusMetricCard: {
    flex: 1,
    minHeight: 82,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  speechSentenceCard: {
    marginTop: 18,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  ttsTestScreenCard: {
    alignItems: 'stretch',
  },
  ttsTestActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  ttsTestBackButton: {
    minWidth: 120,
  },
  speechSentenceCardTTSIOS: {
    marginTop: -80,
  },
  speechSentenceLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255, 255, 255, 0.65)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  speechSentenceText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#ffffff',
    fontWeight: '500',
  },
  aiChatTurnCard: {
    width: '100%',
    marginTop: 20,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  aiChatTurnLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
  },
  aiChatTurnTitle: {
    marginTop: 10,
    fontSize: 30,
    lineHeight: 36,
    color: '#ffffff',
    fontWeight: '800',
  },
  aiChatTurnText: {
    marginTop: 16,
    fontSize: 22,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '600',
    minHeight: 90,
  },
  aiChatTurnHint: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.68)',
  },
  aiChatLiveTranscriptText: {
    fontSize: 20,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '600',
    minHeight: 84,
  },
  homeScreenCard: {
    maxWidth: 460,
    paddingVertical: 32,
  },
  introScriptText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  sectionContainer: {
    width: '100%',
    marginTop: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  ttsPromptWrapper: {
    width: '100%',
    marginTop: 18,
  },
  speechSummaryBlock: {
    width: '100%',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  aiChatHistoryCard: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  aiChatHistoryStack: {
    width: '100%',
    gap: 10,
  },
  aiChatMessageBubble: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  aiChatMessageBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(52, 199, 89, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.35)',
  },
  aiChatMessageBubbleModel: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(46, 134, 222, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(46, 134, 222, 0.35)',
  },
  aiChatMessageRole: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.72)',
    marginBottom: 6,
  },
  aiChatMessageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#ffffff',
    fontWeight: '500',
  },
  svPromptText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 18,
  },
  svPromptActionStack: {
    width: '100%',
    marginTop: 18,
    gap: 12,
  },
  svButtonRow: {
    flexDirection: 'row',
    gap: 14,
  },
  svButton: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  svPromptActionButton: {
    width: '100%',
    minWidth: 0,
    paddingHorizontal: 18,
  },
  svButtonYes: {
    backgroundColor: '#34C759',
  },
  svButtonRedo: {
    backgroundColor: '#FF9500',
  },
  svButtonNo: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  svButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  ttsOptionSection: {
    width: '100%',
    marginBottom: 14,
  },
  appModeStack: {
    width: '100%',
    gap: 12,
  },
  appModeButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  appModeDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255, 255, 255, 0.78)',
  },
  ttsOptionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ttsOptionButtonSelected: {
    backgroundColor: '#34C759',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  ttsOptionButtonIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  ttsContinueButton: {
    backgroundColor: '#2E86DE',
    minWidth: 180,
  },
  svScoreContainer: {
    marginTop: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  svScoreLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  svScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 18,
  },
  svScoreItem: {
    alignItems: 'center',
  },
  svScoreItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  svScoreValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  svStopButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  svStopButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  ttsModeButton: {
    marginTop: 14,
    backgroundColor: '#2E86DE',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  ttsModeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ttsInput: {
    width: '100%',
    minHeight: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  ttsSpeakButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  ttsSpeakButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  ttsSpeakButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  aiChatResetButton: {
    minWidth: 120,
  },
  keyboardAccessory: {
    backgroundColor: '#1f2937',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  androidKeyboardAccessoryWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  keyboardAccessoryAndroid: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderTopWidth: 1,
  },
  keyboardAccessoryButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  keyboardAccessoryButtonDisabled: {
    opacity: 0.5,
  },
  keyboardClearButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  keyboardSpeakButton: {
    backgroundColor: '#34C759',
  },
  keyboardDoneButton: {
    backgroundColor: '#2E86DE',
  },
  keyboardAccessoryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default App;
