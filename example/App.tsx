/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef } from 'react';

import { Platform } from 'react-native';
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
  Alert,
  InputAccessoryView,
  Keyboard,
  Image,
  type DimensionValue,
} from 'react-native';
import Speech from 'react-native-davoice/speech';
import { KeyWordRNBridgeInstance } from 'react-native-wakeword';
import {
  hasIOSMicPermissions,
  requestIOSMicPermissions,
  hasIOSSpeechRecognitionPermissions,
  requestIOSSpeechRecognitionPermissions,
} from 'react-native-wakeword';
import {
  AI_CHAT_MIN_REQUEST_GAP_MS,
  AI_CHAT_RATE_LIMIT_BACKOFF_MS,
  AI_CHAT_STRIP_WAKE_WORD_PREFIX,
  AIChatHistoryMessage,
  enqueueAIChatSpeechFromDelta as enqueueAIChatSpeechFromDeltaBase,
  finishAIChatSpeechFlow as finishAIChatSpeechFlowBase,
  GEMINI_ENABLE_STREAMING,
  GeminiChatMessage,
  generateGeminiReply,
  generateGeminiReplyStream,
  normalizeTextForSpeech,
  resetAIChatSession as resetAIChatSessionBase,
  speakNextAIChatSentence as speakNextAIChatSentenceBase,
  stripWakeWordPrefix,
} from './src/aichat';
import {
  AppModeChoice,
  SV_ONBOARDING_SAMPLE_COUNT,
  SVPromptChoice,
  TTSVoiceChoice,
} from './src/appflow';
import { LocalLLMProvider } from './src/aichat/provider';
import ModelPicker from './src/local_llm/ModelPicker';
import { getSelectedModel, listModels } from './src/local_llm/ModelRegistry';
import { deleteUnusedModelFiles } from './src/local_llm/ModelManager';
import { isModelReady } from './src/local_llm/LocalLLMLoader';
import { connectMcpServer } from 'react-native-davoice-llm';
import type { ToolDefinition } from 'react-native-davoice-llm';
import CaloriesCard from './src/calories/CaloriesCard';
// MCP_SERVER_URL / MCP_SERVER_TOKEN for Local AI Chat, from the git-ignored
// local.config.ts (web search and USDA keys are read in src/agent/LocalAgent.ts).
import * as LocalConfig from './local.config';
import {
  initializeSpeechLibrary as initializeSpeechLibraryBase,
  promptForTTSModelChoice as promptForTTSModelChoiceBase,
  waitForIdle,
  withTimeout,
} from './src/initialization';
import { getAdjustedSpeed, mergeSmartKeepPunct, registerSpeechHandlers } from './src/stt';
import {
  runSpeakerVerificationStartupFlow,
} from './src/speaker_verification/onboarding';
import { getTTSVoiceConfig, playWakewordIntroSpeech, SPEAKER } from './src/tts';
import {
  attachKeywordListenerOnce,
  AudioPermissionComponent,
  captureWakewordDetection,
  cleanDetectedWakeWord,
  defaultAudioRoutingConfig,
  detachKeywordListener,
  formatWakeWord,
  initializeWakewordBootstrap,
  instanceConfigs,
  prepareWakewordSpeechSession,
  resumeWakewordDetection,
  shareWakewordRecordings,
} from './src/wakeword';

const DEFAULT_TTS_VOICE: TTSVoiceChoice = 'Rich';
const TTS_VOICE_OPTIONS: TTSVoiceChoice[] = ['Ariana', 'Rich', 'Hanna', 'Kate', 'Jenny', 'Matthew', 'Gloria'];

const SPEECH_INIT_TIMEOUT_MS = 120000;
// Id of the app's single enrolled speaker (live speaker-verification API).
const SV_SPEAKER_ID = 'user';
const TTS_INPUT_ACCESSORY_ID = 'ttsInputAccessory';
const FULL_AI_CHAT_STT_OPTIONS = {
  EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
  EXTRA_MAX_RESULTS: 5,
  EXTRA_PARTIAL_RESULTS: true,
  EXTRA_PREFER_OFFLINE: false,
  REQUEST_PERMISSIONS_AUTO: true,
};
// Same demo license used for keyword/speech elsewhere in this file — the
// LicenseManager secret/algorithm is identical across every DaVoice native
// library, so one license key validates for all of them (see the
// local-llm-scaffold memory notes).
const LOCAL_LLM_DEMO_LICENSE =
  'MTc5MzQ4NDAwMDAwMA==-cpeHAmR/9wRKvv9rBJ+36JqMUxmXR3RIpi5lK67VsUQ=';
let calledOnce = false;

function App(): React.JSX.Element {
  // true: shared TTS2 model; false: per-speaker models, reloaded on voice changes.
  const useTTS2Only = useRef(false);
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
    null | ((choice: { voice: TTSVoiceChoice }) => void)
  >(null);
  const appModeChoiceResolverRef = useRef<null | ((choice: AppModeChoice) => void)>(null);
  const [ttsVoiceChoice, setTtsVoiceChoice] = useState<TTSVoiceChoice>(DEFAULT_TTS_VOICE);
  const [appModeChoice, setAppModeChoice] = useState<AppModeChoice>('combined');
  const selectedTTSVoiceRef = useRef<TTSVoiceChoice>(DEFAULT_TTS_VOICE);
  const selectedTTSModelRef = useRef(getTTSVoiceConfig(DEFAULT_TTS_VOICE, useTTS2Only.current).model);
  const selectedAppModeRef = useRef<AppModeChoice>('combined');
  const enrollmentJsonRef = useRef<string | null>(null);
  const enrollmentJsonPathRef = useRef<string | null>(null);
  const [lastSVScore, setLastSVScore] = useState<{ score: number; isMatch: boolean } | null>(null);
  const lastSVScoreTimeRef = useRef<number | null>(null);
  const [svElapsed, setSvElapsed] = useState<string>('N/A');
  const svElapsedIntervalRef = useRef<any>(null);
  const initStartedRef = useRef(false);
  const speechLibraryInitializedRef = useRef(false);
  const suppressAndroidPartialResultsRef = useRef(false);

  const sidRef = useRef<any>(null);
  const [didInitSID, setDidInitSID] = useState(false);

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  const applyTTSTextPolicy = (text: string): string => {
    let ttsText = text.replace(/\bDaVoice's\b/g, 'the voice').replace(/\bDaVoice\b/g, 'The Voice');
    return ttsText;
  };

  const speakText = (text: string, speaker: number = SPEAKER, speed?: number) =>
    Speech.speak(applyTTSTextPolicy(text), speaker, speed);

  const svOnboardingProgress = Math.max(
    0,
    Math.min(1, svOnboardingTarget > 0 ? svOnboardingCollected / svOnboardingTarget : 0),
  );

  // --- listener helpers (single-owner) ---
  const detachListener = async () => detachKeywordListener(listenerRef);

  const attachListenerOnce = async (
    instance: KeyWordRNBridgeInstance,
    callback: (phrase: string) => void
  ) => {
    return attachKeywordListenerOnce(listenerRef, instance, formatWakeWord, callback);
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
  const [message, setMessage] = useState('Preparing voice demo...');
  const [isSpeechSessionActive, setIsSpeechSessionActive] = useState(false);
  const [currentSpeechSentence, setCurrentSpeechSentence] = useState('');
  const [isIntroSpeaking, setIsIntroSpeaking] = useState(false);
  const [introSpeakerName, setIntroSpeakerName] = useState<TTSVoiceChoice>(DEFAULT_TTS_VOICE);
  const [introScript, setIntroScript] = useState('');
  const [isSpeakerIdentificationActive, setIsSpeakerIdentificationActive] = useState(false);
  const [isTTSTestMode, setIsTTSTestMode] = useState(false);
  const [isFullAIChatMode, setIsFullAIChatMode] = useState(false);
  const [ttsInputText, setTtsInputText] = useState('');
  const [isManualTTSSpeaking, setIsManualTTSSpeaking] = useState(false);
  const [isSTTOnlyMode, setIsSTTOnlyMode] = useState(false);
  const [isCombinedMode, setIsCombinedMode] = useState(false);
  const [lastSentSentence, setLastSentSentence] = useState('');
  const startupInProgressRef = useRef(true);
  const narrationActiveRef = useRef(false);
  const suppressNarrationWakewordStopRef = useRef(false);
  const narrationInterruptedRef = useRef(false);
  const creatingSpeakerSignatureRef = useRef(false);
  const narrationSpeechPendingRef = useRef(false);
  const narrationStopPromiseRef = useRef<Promise<void> | null>(null);
  const skipNarrationRef = useRef(false);
  const [skipNarration, setSkipNarration] = useState(false);
  const [aiChatLiveTranscript, setAiChatLiveTranscript] = useState('');
  const [aiChatTranscript, setAiChatTranscript] = useState('');
  const [aiChatResponse, setAiChatResponse] = useState('');
  const [aiChatStatus, setAiChatStatus] = useState('Waiting for your voice...');
  const [aiChatMessages, setAiChatMessages] = useState<AIChatHistoryMessage[]>([]);
  const [isAIChatHistoryVisible, setIsAIChatHistoryVisible] = useState(false);
  const [isAIChatLoading, setIsAIChatLoading] = useState(false);
  const [isAIChatHelpVisible, setIsAIChatHelpVisible] = useState(false);
  const [isModelPickerVisible, setIsModelPickerVisible] = useState(false);
  const [localModelName, setLocalModelName] = useState('');
  const [localModelStatus, setLocalModelStatus] = useState('');
  // Latest status for async chat turns (the state value can be stale inside them).
  const localModelStatusRef = useRef('');
  localModelStatusRef.current = localModelStatus;
  const localModelWarmUpSeqRef = useRef(0);

  useEffect(() => {
    getSelectedModel()
      .then((model) => setLocalModelName(model.displayName))
      .catch(() => undefined);
  }, []);
  const [isTTSTestHelpVisible, setIsTTSTestHelpVisible] = useState(false);
  const [isAndroidKeyboardVisible, setIsAndroidKeyboardVisible] = useState(false);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [latestWakewordRecordingPaths, setLatestWakewordRecordingPaths] = useState<string[]>([]);
  const lastPartialTimeRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSessionUIAllowedRef = useRef(false);
  const isGoingBackRef = useRef(false);
  const modeAlreadyEnteredRef = useRef(false);
  let vadCBintervalID: any = null;
  const silenceThresholdMsRef = useRef(2000);
  const lastTranscriptRef = useRef('');
  const lastProcessedRef = useRef('');
  const speechUiEpochRef = useRef(0);
  const aiChatInFlightRef = useRef(false);
  const aiChatAwaitingSpeechFinishRef = useRef(false);
  const aiChatRequestIdRef = useRef(0);
  const geminiConversationRef = useRef<GeminiChatMessage[]>([]);
  const localLLMProviderRef = useRef<LocalLLMProvider | null>(null);
  // The streamed reply's full text, shown once it has all been spoken.
  const aiChatFullReplyRef = useRef('');
  // Sentences handed to the speech library and not yet finished (it queues them).
  const aiChatSpeechChainRef = useRef<Promise<void>>(Promise.resolve());
  const aiChatSpeechPendingRef = useRef(0);
  const getLocalLLMProvider = (): LocalLLMProvider => {
    if (!localLLMProviderRef.current) {
      // The agent (web search, fillers, the calorie tracker's tools) is set
      // up in src/agent/LocalAgent.ts.
      localLLMProviderRef.current = new LocalLLMProvider('demo_user', LOCAL_LLM_DEMO_LICENSE);
    }
    return localLLMProviderRef.current;
  };

  // While the user is still talking, feed each partial transcript to the
  // local model's prefill, so when the silence timeout sends the turn only
  // the last few words remain to be processed. Runs in parallel with speech
  // recognition; the native side keeps only the newest request.
  useEffect(() => {
    if (!isFullAIChatMode || selectedAppModeRef.current !== 'local_ai_chat') return;
    if (aiChatInFlightRef.current) return;
    const partial = aiChatLiveTranscript.trim();
    if (!partial) return;
    void getLocalLLMProvider().prefillForTurn(aiChatMessages, partial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiChatLiveTranscript]);
  const lastAIChatSubmitAtRef = useRef(0);
  const aiChatBlockedUntilRef = useRef(0);
  const lastAIChatSubmittedTextRef = useRef('');
  const geminiNetworkRequestCountRef = useRef(0);
  const pendingWakeWordPrefixRef = useRef<string | null>(null);
  const aiChatStreamingSupportedRef = useRef(true);
  const aiChatSpeechQueueRef = useRef<string[]>([]);
  const aiChatPendingSentenceBufferRef = useRef('');
  const aiChatStreamingActiveRef = useRef(false);
  const aiChatStreamGenerationDoneRef = useRef(false);
  const aiChatStreamSpeakingRef = useRef(false);
  const voiceDemoBootstrapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function setSpeechSessionUIActive(active: boolean) {
    speechSessionUIAllowedRef.current = active;
    setIsSpeechSessionActive(active);
  }

  async function stopFullAIChatMicrophone() {
    if (Platform.OS === 'android') {
      try {
        await Speech.stop();
      } catch (error) {
        console.log('[AIChat] stop before chat turn failed (ignored):', error);
      }
      try {
        await Speech.cancel();
      } catch (error) {
        console.log('[AIChat] cancel before chat turn failed (ignored):', error);
      }
      return;
    }

    try {
      await Speech.pauseSpeechRecognition();
    } catch (error) {
      console.log('[AIChat] pauseSpeechRecognition before chat turn failed (ignored):', error);
    }
  }

  async function restartFullAIChatMicrophone(reason: string) {
    if (Platform.OS !== 'android') {
      console.log(`[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in ${reason}`);
      await Speech.unPauseSpeechRecognition(-1);
      console.log(`[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in ${reason}`);
      return;
    }

    setSpeechSessionUIActive(true);
    setAiChatStatus('Starting microphone...');
    setCurrentSpeechSentence('Starting microphone...');
    suppressAndroidPartialResultsRef.current = true;
    resetSpeechTranscriptState();

    try {
      console.log(`[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in ${reason}`);
      await Speech.unPauseSpeechRecognition(-1);
      console.log(`[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in ${reason}`);

      await sleep(300);
      const recognizing = await Speech.isRecognizing();
      console.log('[AIChat] microphone restart result', { reason, recognizing });
      setAiChatStatus('Listening...');
      setCurrentSpeechSentence('Listening...');
    } catch (error) {
      console.log('[AIChat] failed to restart speech recognition:', { reason, error });
      setAiChatStatus('Microphone did not reopen. Please tap Back and try again.');
    } finally {
      setTimeout(() => {
        suppressAndroidPartialResultsRef.current = false;
      }, 400);
    }
  }

  const finishAIChatSpeechFlow = async () => {
    // Everything was spoken: show the reply with its original formatting.
    if (aiChatFullReplyRef.current) {
      setAiChatResponse(aiChatFullReplyRef.current);
      aiChatFullReplyRef.current = '';
    }
    if (Platform.OS === 'android') {
      aiChatStreamingActiveRef.current = false;
      aiChatStreamGenerationDoneRef.current = false;
      aiChatStreamSpeakingRef.current = false;
      aiChatPendingSentenceBufferRef.current = '';
      aiChatSpeechQueueRef.current = [];
      aiChatAwaitingSpeechFinishRef.current = false;
      lastProcessedRef.current = '';
      aiChatInFlightRef.current = false;
      setIsAIChatLoading(false);
      resetSpeechTranscriptState();
      await restartFullAIChatMicrophone('finishAIChatSpeechFlow');
    } else {
      return finishAIChatSpeechFlowBase({
        Speech,
        aiChatStreamingActiveRef,
        aiChatStreamGenerationDoneRef,
        aiChatStreamSpeakingRef,
        aiChatPendingSentenceBufferRef,
        aiChatSpeechQueueRef,
        aiChatAwaitingSpeechFinishRef,
        lastProcessedRef,
        aiChatInFlightRef,
        setIsAIChatLoading,
        resetSpeechTranscriptState,
        setAiChatStatus,
      });
    }
  };

  const speakNextAIChatSentence = async () =>
    speakNextAIChatSentenceBase({
      Speech,
      speakText,
      aiChatStreamSpeakingRef,
      aiChatSpeechQueueRef,
      setCurrentSpeechSentence,
      setAiChatStatus,
      getSelectedSpeakerSpeed,
      aiChatStreamGenerationDoneRef,
      aiChatPendingSentenceBufferRef,
      SPEAKER,
      finishAIChatSpeechFlow,
      // The reply on screen grows a sentence at a time as each one goes to TTS.
      revealSpokenText: (sentence: string) =>
        setAiChatResponse((shown) => (shown ? `${shown} ${sentence}` : sentence)),
      aiChatSpeechChainRef,
      aiChatSpeechPendingRef,
      aiChatRequestIdRef,
      speakerLabel: selectedAppModeRef.current === 'local_ai_chat' ? 'Local AI' : 'Gemini',
    });

  // Says a short phrase while the local AI waits on something online (a food
  // lookup, a remote MCP tool), queued like any reply sentence.
  const sayWhileWaitingOnline = (filler: string) => {
    aiChatSpeechQueueRef.current.push(filler);
    void speakNextAIChatSentence();
  };

  const enqueueAIChatSpeechFromDelta = async (deltaText: string, aggregateText: string) =>
    enqueueAIChatSpeechFromDeltaBase({
      deltaText,
      aggregateText,
      aiChatPendingSentenceBufferRef,
      aiChatSpeechQueueRef,
      speakNextAIChatSentence,
    });

  const resetAIChatSession = () =>
    resetAIChatSessionBase({
      geminiConversationRef,
      aiChatInFlightRef,
      aiChatAwaitingSpeechFinishRef,
      aiChatRequestIdRef,
      geminiNetworkRequestCountRef,
      lastAIChatSubmitAtRef,
      aiChatBlockedUntilRef,
      lastAIChatSubmittedTextRef,
      aiChatSpeechQueueRef,
      aiChatPendingSentenceBufferRef,
      aiChatStreamingActiveRef,
      aiChatStreamGenerationDoneRef,
      aiChatStreamSpeakingRef,
      setAiChatLiveTranscript,
      setAiChatTranscript,
      setAiChatResponse,
      setAiChatStatus,
      setAiChatMessages,
      setIsAIChatHistoryVisible,
      setIsAIChatLoading,
    });

  const buildFriendlyGeminiErrorMessage = (rawMessage: string) => {
    if (/quota|rate limit|429|too many requests/i.test(rawMessage)) {
      return 'This demo uses Google Gemini as its backend LLM. Gemini is currently experiencing rate limits or heavy demand, so it cannot answer right now. Please try again in about 30 seconds.';
    }

    if (/busy|overloaded|unavailable|timeout|temporar/i.test(rawMessage)) {
      return 'This demo uses Google Gemini as its backend LLM. Gemini is temporarily busy right now, so the demo could not get a reply. Please try again in a moment.';
    }

    return 'This demo uses Google Gemini as its backend LLM. Gemini is temporarily unavailable right now, so the demo could not get a reply. Please try again in a moment.';
  };

  async function initializeSpeechLibrary(enrollmentJsonPath?: string | null) {
    await initializeSpeechLibraryBase(
      Speech,
      selectedTTSModelRef.current,
      enrollmentJsonPath,
      SV_SPEAKER_ID,
    );
    console.log('[STT_DIAG] initialized', { withSV: !!enrollmentJsonPath,
      native: await Speech.sttHealthSnapshot(), listeners: Speech.sttListenerDiag() });
    await applySelectedTTSVoice();
    Speech.onFinishedSpeaking = async () => {
      console.log('onFinishedSpeaking(): ✅ Finished speaking (last WAV done).');
      // Streamed replies finish when every queued sentence has been spoken
      // (speakNextAIChatSentence tracks them).
      if (aiChatStreamingActiveRef.current) return;
      if (aiChatAwaitingSpeechFinishRef.current) {
        aiChatAwaitingSpeechFinishRef.current = false;
        await finishAIChatSpeechFlow();
      }
    };
    await Speech.pauseSpeechRecognition();
  }

  async function applySelectedTTSVoice() {
    if (!getTTSVoiceConfig(selectedTTSVoiceRef.current, useTTS2Only.current).usesTTS2) return;
    const voice = selectedTTSVoiceRef.current;
    const result = await Speech.changeVoice(voice);
    if (result !== 0) {
      console.warn(`[TTS] Speech.changeVoice("${voice}") failed or is unsupported on this platform.`);
    }
  }

  async function promptForTTSModelChoice() {
    const choice = await promptForTTSModelChoiceBase({
      setShowTTSModelPrompt,
      ttsModelChoiceResolverRef,
      setTtsVoiceChoice,
      waitForIdle,
    });
    const previousModel = selectedTTSModelRef.current;
    selectedTTSVoiceRef.current = choice.voice;
    selectedTTSModelRef.current = getTTSVoiceConfig(choice.voice, useTTS2Only.current).model;
    if (selectedTTSModelRef.current !== previousModel && speechLibraryInitializedRef.current) {
      // Finish replacing the model before the chosen speaker narrates the next step.
      await reloadSpeechLibraryForSelectedVoice(enrollmentJsonPathRef.current);
    } else if (speechLibraryInitializedRef.current) {
      await applySelectedTTSVoice();
    }
    return choice;
  }

  async function speakStartupNarration(
    lines: string[],
    { interruptOnWakeword = true }: { interruptOnWakeword?: boolean } = {},
  ) {
    narrationActiveRef.current = true;
    suppressNarrationWakewordStopRef.current = !interruptOnWakeword;
    narrationInterruptedRef.current = false;
    try {
      try {
        await Speech.pauseSpeechRecognition();
      } catch (e) {
        console.warn('pauseSpeechRecognition before startup narration failed (ignored):', e);
      }
      await applySelectedTTSVoice();
      if (!skipNarrationRef.current) {
        for (const line of lines) {
          if (skipNarrationRef.current || narrationInterruptedRef.current) break;
          setMessage(line);
          narrationSpeechPendingRef.current = true;
          try {
            await speakText(line, SPEAKER, getSelectedSpeakerSpeed());
          } catch (error) {
            if (!skipNarrationRef.current && !narrationInterruptedRef.current) throw error;
          } finally {
            // stopSpeaking releases the JS speak waiter before native stop completes.
            await narrationStopPromiseRef.current;
            narrationSpeechPendingRef.current = false;
          }
        }
      }
    } finally {
      // Consume queued playback-tail detections before allowing screen navigation.
      await sleep(500);
      narrationActiveRef.current = false;
      suppressNarrationWakewordStopRef.current = false;
    }
  }

  async function stopCurrentNarration() {
    if (narrationStopPromiseRef.current) {
      await narrationStopPromiseRef.current;
      return;
    }
    // Early Skip or a wake word while idle must not stop an initializing model.
    if (!narrationSpeechPendingRef.current) return;
    narrationInterruptedRef.current = true;
    const stopPromise = Promise.resolve().then(async () => {
      try {
        await Speech.stopSpeaking();
      } catch (error) {
        console.warn('[Narration] Failed to stop playback:', error);
      }
    });
    narrationStopPromiseRef.current = stopPromise;
    try {
      await stopPromise;
    } finally {
      if (narrationStopPromiseRef.current === stopPromise) {
        narrationStopPromiseRef.current = null;
      }
    }
  }

  async function handleSkipNarration() {
    if (skipNarrationRef.current) return;
    skipNarrationRef.current = true;
    setSkipNarration(true);
    await stopCurrentNarration();
  }

  // Live speaker verification: enroll (or clear) the speaker in the running wake
  // word and STT. No Speech.destroyAll()/initAll() and no stopKeywordDetection()
  // -- both libraries apply the change immediately.
  async function applySpeakerVerificationChoice(svChoice: SVPromptChoice) {
    const jsonPath = enrollmentJsonPathRef.current;
    const enable = svChoice !== 'skip' && typeof jsonPath === 'string' && jsonPath.length > 0;
    const inst = myInstanceRef.current;
    if (enable) {
      console.log('[SV] live addSpeaker', SV_SPEAKER_ID, jsonPath);
      if (inst) {
        const wakewordIds = await inst.addSpeaker(SV_SPEAKER_ID, jsonPath);
        console.log('[SV] wake word speakers:', wakewordIds);
      }
      const sttIds = await Speech.addSpeaker(SV_SPEAKER_ID, jsonPath);
      console.log('[SV] STT speakers:', sttIds);
    } else {
      // Skip: make sure no speaker from an earlier run stays enrolled.
      console.log('[SV] skipped; clearing speakers');
      if (inst) await inst.setSpeakers([]);
      await Speech.setSpeakers([]);
    }
  }

  async function reloadSpeechLibraryForSelectedVoice(enrollmentJsonPath?: string | null) {
    const inst = myInstanceRef.current;
    if (inst) await inst.pauseDetection(false);

    try {
      suppressAndroidPartialResultsRef.current = true;
      setMessage('Loading selected preferences...');
      try {
        await Speech.stopSpeaking();
      } catch {}
      await Speech.destroyAll();
      await withTimeout(
        initializeSpeechLibrary(enrollmentJsonPath),
        SPEECH_INIT_TIMEOUT_MS,
        'Speech.initAll selected voice',
      );
    } finally {
      suppressAndroidPartialResultsRef.current = false;
      if (inst) await inst.unPauseDetection();
    }
  }

  const processAIChatTurn = async (rawText: string) => {
    const sanitizedInput =
      AI_CHAT_STRIP_WAKE_WORD_PREFIX &&
      typeof pendingWakeWordPrefixRef.current === 'string' &&
      pendingWakeWordPrefixRef.current.length > 0
        ? stripWakeWordPrefix(rawText, pendingWakeWordPrefixRef.current)
        : rawText;
    pendingWakeWordPrefixRef.current = null;
    const userText = sanitizedInput.trim();
    if (!userText || aiChatInFlightRef.current) return;

    const now = Date.now();
    // Gemini's rate-limit cooldown doesn't apply to the on-device model.
    if (selectedAppModeRef.current !== 'local_ai_chat' && now < aiChatBlockedUntilRef.current) {
      const waitSeconds = Math.ceil((aiChatBlockedUntilRef.current - now) / 1000);
      setAiChatStatus(
        `This demo uses Google Gemini as its backend LLM. Gemini is cooling down after rate limiting. Please try again in ${waitSeconds}s.`,
      );
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
    setAiChatStatus(
      selectedAppModeRef.current === 'local_ai_chat' ? 'Sending transcript to the local AI...' : 'Sending transcript to Gemini...',
    );
    setAiChatResponse('');
    aiChatFullReplyRef.current = '';
    aiChatSpeechChainRef.current = Promise.resolve();
    aiChatSpeechPendingRef.current = 0;
    setAiChatMessages((prev) => [
      ...prev,
      {
        id: `user-${requestId}`,
        role: 'user',
        text: userText,
      },
      {
        id: `model-${requestId}`,
        role: 'model',
        text: '',
      },
    ]);
    setIsAIChatLoading(true);

    try {
      await Speech.pauseSpeechRecognition();

      const useLocalLLM = selectedAppModeRef.current === 'local_ai_chat';

      let aiReply = '';
      // nextHistory only applies to the Gemini path below (the local LLM
      // keeps its own history via aiChatMessages).
      let shouldUseStreaming = false;
      let nextHistory: GeminiChatMessage[] | null = null;

      const localModel = useLocalLLM ? await getSelectedModel() : null;
      if (localModel && !isModelReady(localModel.id)) {
        // The model is still downloading or loading. Say so right away
        // instead of holding the turn (and the mic) until it is ready.
        const status = localModelStatusRef.current;
        const progress = /^Downloading (\d+)%/.exec(status);
        if (status.startsWith('Failed')) {
          warmUpLocalModel(aiChatMessages); // retry the download/load
          aiReply = `The on-device model, ${localModel.displayName}, failed to load, so I am trying again. Please ask me again in a moment.`;
        } else if (progress) {
          aiReply = `The on-device model, ${localModel.displayName}, is still downloading. It is ${progress[1]} percent done. Please ask me again when it is ready.`;
        } else {
          aiReply = `The on-device model, ${localModel.displayName}, is still loading. Please ask me again in a moment.`;
        }
      } else if (useLocalLLM) {
        setAiChatStatus('Generating local AI reply...');
        // Downloads (if needed) + licenses + loads the on-device model, then
        // generates a reply. Any failure here — model not yet downloaded/
        // hosted, license rejected, engine not vendored — is caught below and
        // spoken aloud via TTS instead of silently failing.
        //
        // Streams tokens into the same sentence queue the Gemini streaming
        // path uses, so TTS starts on the first complete sentence instead of
        // waiting for the whole reply to be generated.
        shouldUseStreaming = true;
        aiChatStreamingActiveRef.current = true;
        aiChatStreamGenerationDoneRef.current = false;
        aiChatStreamSpeakingRef.current = false;
        aiChatPendingSentenceBufferRef.current = '';
        aiChatSpeechQueueRef.current = [];
        // The agent searches the web for time-sensitive questions ("who is
        // the president...") and looks up unknown foods online; meanwhile it
        // sends a short filler to say, so the wait isn't silent. Fillers
        // aren't part of the reply or the history.
        const turn = await getLocalLLMProvider().generateReplyStream(
          aiChatMessages,
          userText,
          async (delta, done) => {
            if (done || !delta || aiChatRequestIdRef.current !== requestId) return;
            aiReply += delta;
            const aggregateText = aiReply;
            setAiChatStatus('Streaming local AI reply...');
            setAiChatMessages((prev) =>
              prev.map((message) =>
                message.id === `model-${requestId}` ? { ...message, text: aggregateText } : message
              )
            );
            await enqueueAIChatSpeechFromDelta(delta, aggregateText);
          },
          (event) => {
            if (aiChatRequestIdRef.current !== requestId) return;
            if (event.type === 'filler') {
              // Search fillers start the reply's speech queue; tool fillers
              // ("Sure, let me log that."), lookups and MCP tools are queued
              // like a sentence.
              if (event.reason === 'webSearch' || event.reason === 'webSearchFailed') {
                void enqueueAIChatSpeechFromDelta(event.text, event.text);
              } else {
                sayWhileWaitingOnline(event.text);
              }
            } else if (event.type === 'status' && event.status === 'searching') {
              setAiChatStatus('Searching the web...');
            } else if (event.type === 'webSearch') {
              setAiChatStatus(
                event.failed
                  ? 'Could not search online; answering from memory...'
                  : `Searched online (${event.source}); generating reply...`,
              );
            }
          },
        );
        if (turn.toolMessages.length > 0) {
          setAiChatMessages((prev) =>
            prev.map((message) =>
              message.id === `model-${requestId}` ? { ...message, toolMessages: turn.toolMessages } : message,
            ),
          );
        }
        console.log(`[AIChat][LOCAL_LLM] "${userText}"${turn.webSearch ? ` (searched ${turn.webSearch.source})` : ''}`);
        console.log('[AIChat][LOCAL_LLM][FULL_REPLY_BEGIN]');
        console.log(aiReply);
        console.log('[AIChat][LOCAL_LLM][FULL_REPLY_END]');
      } else {
        nextHistory = [
          ...geminiConversationRef.current,
          { role: 'user' as const, parts: [{ text: userText }] },
        ];
        const networkRequestId = geminiNetworkRequestCountRef.current + 1;
        geminiNetworkRequestCountRef.current = networkRequestId;
        console.log(
          `[AIChat] preparing Gemini request #${networkRequestId} for turn #${requestId}`,
          { userText }
        );

        shouldUseStreaming = GEMINI_ENABLE_STREAMING && aiChatStreamingSupportedRef.current;
        if (shouldUseStreaming) {
          aiChatStreamingActiveRef.current = true;
          aiChatStreamGenerationDoneRef.current = false;
          aiChatStreamSpeakingRef.current = false;
          aiChatPendingSentenceBufferRef.current = '';
          aiChatSpeechQueueRef.current = [];
          let streamDeliveredChunks = false;
          setAiChatStatus('Streaming Gemini reply...');

          const streamResult = await generateGeminiReplyStream(
            nextHistory,
            {
              requestId: networkRequestId,
              userText,
            },
            async (deltaText, aggregateText) => {
              if (aiChatRequestIdRef.current !== requestId) return;
              streamDeliveredChunks = true;
              setAiChatStatus('Streaming Gemini reply...');
              setAiChatMessages((prev) =>
                prev.map((message) =>
                  message.id === `model-${requestId}`
                    ? { ...message, text: aggregateText }
                    : message
                )
              );
              await enqueueAIChatSpeechFromDelta(deltaText, aggregateText);
            },
          );
          aiReply = streamResult.text;
          if (!streamResult.usedStreaming) {
            aiChatStreamingSupportedRef.current = false;
            aiChatStreamingActiveRef.current = false;
          }

          if (!streamDeliveredChunks && aiReply) {
            if (streamResult.usedStreaming) {
              await enqueueAIChatSpeechFromDelta(aiReply, aiReply);
              setAiChatMessages((prev) =>
                prev.map((message) =>
                  message.id === `model-${requestId}`
                    ? { ...message, text: aiReply }
                    : message
                )
              );
            }
          }
        } else {
          aiReply = await generateGeminiReply(nextHistory, {
            requestId: networkRequestId,
            userText,
          });
        }

        console.log(`[AIChat] Gemini reply #${networkRequestId}:`, aiReply);
        console.log('[AIChat][FULL_REPLY_BEGIN]');
        console.log(aiReply);
        console.log('[AIChat][FULL_REPLY_END]');
      }

      if (aiChatRequestIdRef.current !== requestId) return;

      if (nextHistory) {
        geminiConversationRef.current = [
          ...nextHistory,
          { role: 'model' as const, parts: [{ text: aiReply }] },
        ];
      }

      setAiChatMessages((prev) =>
        prev.map((message) =>
          message.id === `model-${requestId}`
            ? { ...message, text: aiReply }
            : message
        )
      );

      if (shouldUseStreaming && aiChatStreamingActiveRef.current) {
        // Sentences appear as they are spoken; the full text when speech ends.
        aiChatFullReplyRef.current = aiReply;
        aiChatStreamGenerationDoneRef.current = true;
        aiChatAwaitingSpeechFinishRef.current = true;
        await speakNextAIChatSentence();
      } else {
        aiChatStreamingActiveRef.current = false;
        setAiChatResponse(aiReply);
        const replySpeakerLabel = useLocalLLM ? 'Local AI' : 'Gemini';
        setCurrentSpeechSentence(`${replySpeakerLabel}: ${aiReply}`);
        setAiChatStatus(`Speaking ${replySpeakerLabel} reply...`);
        aiChatAwaitingSpeechFinishRef.current = true;
        await speakText(normalizeTextForSpeech(aiReply), SPEAKER, getSelectedSpeakerSpeed());
      }
    } catch (error) {
      const useLocalLLM = selectedAppModeRef.current === 'local_ai_chat';
      const message = String((error as any)?.message ?? error);
      // Local LLM errors (not-yet-hosted model, rejected license, engine not
      // vendored, etc.) are read aloud verbatim rather than run through
      // Gemini's quota/rate-limit-specific friendly-message mapping — the
      // user explicitly wants "if there is an error the TTS will say the
      // error" for this mode.
      const friendlyMessage = useLocalLLM
        ? `Local AI chat error: ${message}`
        : buildFriendlyGeminiErrorMessage(message);
      console.log(useLocalLLM ? '[AIChat] Local LLM error:' : '[AIChat] Gemini error:', message);
      aiChatStreamingActiveRef.current = false;
      aiChatStreamGenerationDoneRef.current = false;
      aiChatStreamSpeakingRef.current = false;
      aiChatAwaitingSpeechFinishRef.current = false;
      if (!useLocalLLM && /quota|rate limit|429|too many requests/i.test(message)) {
        aiChatBlockedUntilRef.current = Date.now() + AI_CHAT_RATE_LIMIT_BACKOFF_MS;
        setAiChatStatus('Gemini is rate limited right now. Please try again in about 30 seconds.');
      }
      setAiChatResponse(friendlyMessage);
      setAiChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === `model-${requestId}`
            ? { ...msg, text: friendlyMessage }
            : msg
        )
      );
      const errorSpeakerLabel = useLocalLLM ? 'Local AI' : 'Gemini';
      setCurrentSpeechSentence(`${errorSpeakerLabel}: ${friendlyMessage}`);
      setAiChatStatus('Speaking demo status update...');
      aiChatAwaitingSpeechFinishRef.current = true;
      try {
        await speakText(
          normalizeTextForSpeech(friendlyMessage),
          SPEAKER,
          getSelectedSpeakerSpeed(),
        );
      } catch (speechError) {
        console.log('[AIChat] failed to speak fallback message:', speechError);
        aiChatAwaitingSpeechFinishRef.current = false;
        await finishAIChatSpeechFlow();
      }
    } finally {
      if (aiChatRequestIdRef.current === requestId) {
        if (!aiChatAwaitingSpeechFinishRef.current && aiChatInFlightRef.current) {
          lastProcessedRef.current = '';
          aiChatInFlightRef.current = false;
          setIsAIChatLoading(false);
          if (Platform.OS === 'android') {
            await restartFullAIChatMicrophone('processAIChatTurn.finally');
          } else {
            console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in processAIChatTurn.finally');
            await Speech.unPauseSpeechRecognition(-1);
            console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in processAIChatTurn.finally');
          }
        }
      }
    }
  };

  const getSelectedSpeakerSpeed = (): number =>
    getTTSVoiceConfig(selectedTTSVoiceRef.current, useTTS2Only.current).speed;
  const isFirstKeywordCallbackRef = useRef(true);
  registerSpeechHandlers({
    Speech,
    speakText,
    suppressAndroidPartialResultsRef,
    showAppModePrompt,
    isTTSTestMode,
    isSpeakerVerificationActive: showSVPrompt || showSVStatusScreen || svStatusPhase !== 'idle',
    isAwaitingWakeWord: isFirstKeywordCallbackRef.current,
    isSpeechResultsAllowed: isCombinedMode || isSTTOnlyMode || isFullAIChatMode,
    isSTTOnlyMode,
    setLastSentSentence,
    aiChatInFlightRef,
    speechSessionUIAllowedRef,
    setIsSpeechSessionActive,
    lastTranscriptRef,
    lastPartialTimeRef,
    setCurrentSpeechSentence,
    setAiChatLiveTranscript,
    timeoutRef,
    isFullAIChatMode,
    lastProcessedRef,
    processAIChatTurn,
    beginSpeechUiEpoch,
    setCurrentSpeechSentenceGuarded,
    getSelectedSpeakerSpeed,
    SPEAKER,
    resetSpeechTranscriptState,
    sleep,
    clearSpeechSentenceUI,
    silenceThresholdMsRef,
    setAiChatTranscript,
  });
  let callbackTimes = 0;
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
      if (creatingSpeakerSignatureRef.current) return;
      if (startupInProgressRef.current || narrationActiveRef.current) {
        // Before the wake-word test, detection only interrupts current narration.
        if (suppressNarrationWakewordStopRef.current) return;
        await stopCurrentNarration();
        return;
      }
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

      const { wavFilePath, recordedWavPaths } = await captureWakewordDetection({
        instance,
        stopWakeWord,
        sleep,
        setLatestWakewordRecordingPaths,
      });

      const { keywordText, cleanWakeWord } = cleanDetectedWakeWord(keywordIndex);
      pendingWakeWordPrefixRef.current = cleanWakeWord;
      setMessage(`WakeWord '${cleanWakeWord}' DETECTED`);
      setIsFlashing(true);

      /***** SPEAKER VERIFICATION CODE ONLY *****/
      try {
        await prepareWakewordSpeechSession({
          isFirstCall,
          enrollmentJsonRef,
          setShowSVPrompt,
          setSvRunning,
          svElapsedIntervalRef,
          setAppModeChoice,
          setSpeechSessionUIActive,
          clearSpeechSentenceUI,
          Speech,
          setShowAppModePrompt,
          appModeChoiceResolverRef,
          selectedAppModeRef,
          waitForIdle,
          setCurrentSpeechSentence,
          setIsSpeakerIdentificationActive,
          speechLibraryInitializedRef,
          speakModeSelectionNarration: async () => {
            await speakStartupNarration([`${cleanWakeWord} detected.`]);
            setMessage(`WakeWord '${cleanWakeWord}' DETECTED`);
            await speakStartupNarration([
              'Now you can test the voice capabilities in five different ways. You can select a Local AI Chat that runs fully on this device, a full AI Chat using remote Gemini, or simply test Speech to Text and Text to Speech individually or a combination of both.',
            ]);
          },
        });

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

      // onPress already entered the mode immediately (flash-free path) — skip intro speech
      // and auto-dispatch so we don't double-enter or interfere with the active mode's STT.
      if (modeAlreadyEnteredRef.current) {
        modeAlreadyEnteredRef.current = false;
        return;
      }

      if (selectedAppModeRef.current === 'full_ai_chat' || selectedAppModeRef.current === 'local_ai_chat') {
        setAiChatStatus('Preparing chat mode...');
        setAiChatTranscript('');
        setAiChatResponse('');
        await enterFullAIChatMode();
        return;
      }

      const selectedSpeakerName: TTSVoiceChoice = selectedTTSVoiceRef.current;
      await playWakewordIntroSpeech({
        Speech,
        speakText,
        beginSpeechUiEpoch,
        setMessageGuarded,
        setIntroSpeakerName,
        setIntroScript,
        setCurrentSpeechSentenceGuarded,
        setIntroSpeakingGuarded,
        selectedSpeakerName,
        getSelectedSpeakerSpeed,
        SPEAKER,
        waitForIdle,
        resetSpeechTranscriptState,
        sleep,
        clearSpeechSentenceUI,
      });

      // Auto-dispatch into the selected mode — only reached on subsequent wake word detections.
      const mode = selectedAppModeRef.current;
      if (mode === 'stt_only') { await enterSTTOnlyMode(); return; }
      if (mode === 'type_to_tts') { await enterTTSTestMode(); return; }
      await enterCombinedMode();

      /*
      setTimeout(async () => {
        await Speech.pauseSpeechRecognition();
         await speakText(introLine, SPEAKER, SPEAKER_SPEED);
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
      let svChoice: SVPromptChoice = 'skip';

      try {
        if (Platform.OS === 'android') {
          if (voiceDemoBootstrapTimeoutRef.current) {
            clearTimeout(voiceDemoBootstrapTimeoutRef.current);
          }
          voiceDemoBootstrapTimeoutRef.current = setTimeout(() => {
            console.warn('[Demo] voice demo bootstrap is still running');
            setMessage('Still preparing the voice demo...');
          }, 60000);
        }

        const { speechInitCompleted, failureReason } = await initializeWakewordBootstrap({
          PlatformOS: Platform.OS,
          defaultAudioRoutingConfig,
          setMessage,
          keywordCallback,
          listenerRef,
          myInstanceRef,
          keywordLicense:
            'MTc5MzQ4NDAwMDAwMA==-cpeHAmR/9wRKvv9rBJ+36JqMUxmXR3RIpi5lK67VsUQ=',
          speechLicense:
            'MTc5MzQ4NDAwMDAwMA==-cpeHAmR/9wRKvv9rBJ+36JqMUxmXR3RIpi5lK67VsUQ=',
          Speech,
          svChoice,
          enrollmentJsonPath: enrollmentJsonPathRef.current,
          sleep,
          initializeSpeechLibrary,
          speechInitTimeoutMs: SPEECH_INIT_TIMEOUT_MS,
          withTimeout,
          suppressAndroidPartialResultsRef,
          speechLibraryInitializedRef,
        });

        if (Platform.OS === 'android') {
          if (voiceDemoBootstrapTimeoutRef.current) {
            clearTimeout(voiceDemoBootstrapTimeoutRef.current);
            voiceDemoBootstrapTimeoutRef.current = null;
          }
        }

        if (!speechInitCompleted) {
          if (failureReason === 'invalid-license') {
            return;
          }
          setMessage('Speech setup failed. Restart the app to retry.');
          return;
        }

        // Bootstrap already resumed detection after loading the speech packages.
        const narratorVoice = selectedTTSVoiceRef.current;
        const otherVoices = TTS_VOICE_OPTIONS
          .filter((voice) => voice !== narratorVoice)
          .join(' or ');

        /*if (narratorVoice === 'Rich') { 
          await speakStartupNarration([
            `Hey there. My name is ${voiceToUse}`,
            `In this application we will use my cloned voice, in order to showcase our voice AI agent capabilities.`, 
            `Don't worry. I will be your personal guide to walk you through this demonstration step by step.`,
            `First, please choose which voice you want to use. You can stay with me, ${narratorVoice}, or switch to ${otherVoices}.`,
          ]);
        } else {*/
          await speakStartupNarration([
            `Hey there, My name is ${narratorVoice}. In this application we will use my cloned voice in order to showcase our voice AI agent capabilities.`, 
            `Don't worry. I will be your personal guide to walk you through this demonstration step by step.`,
            `First, please choose which voice you want to use. You can stay with me, ${narratorVoice}, or switch to ${otherVoices}.`,
          ]);
        /*}*/
/*
        await speakStartupNarration([
          `Hey there,, my name is ${narratorVoice}. In this application we will use my cloned voice to walk you through this demonstration step by step.`,
          `First,, please choose which voice you want to use? You can stay with me,, ${narratorVoice},, or switch to ${alternativeVoice}?`,
        ]);

        await speakStartupNarration([
          `Hey there! My name is ${narratorVoice}! In this application we will use my cloned voice to walk you through this demonstration step by step.`,
          `First, please choose which voice you want to use? You can stay with me, ${narratorVoice}, or switch to ${alternativeVoice}?`,
        ]);

*/
        await promptForTTSModelChoice();

        await speakStartupNarration([
          `You selected ${selectedTTSVoiceRef.current}.`,
          'The next phase, is setting speaker verification. You can create a new speaker signature, use a saved one, or skip this step.',
        ]);

        // Pause STT before verification; wake-word detection stays active except
        // while a new speaker signature is being recorded.
        try {
          await Speech.pauseSpeechRecognition();
        } catch (e) {
          console.warn('pauseSpeechRecognition before speaker verification failed (ignored):', e);
        }

        const startupFlow = await runSpeakerVerificationStartupFlow({
          beforeEnrollment: async () => {
            creatingSpeakerSignatureRef.current = true;
            await myInstanceRef.current?.pauseDetection(false);//Platform.OS === 'android' ? true : false);
          },
          afterEnrollment: async () => {
            try {
              await myInstanceRef.current?.unPauseDetection();
            } finally {
              creatingSpeakerSignatureRef.current = false;
            }
          },
          setMessage,
          enrollmentJsonRef,
          enrollmentJsonPathRef,
          setSvPromptHasSavedEnrollment,
          setShowSVPrompt,
          svChoiceResolverRef,
          setShowSVStatusScreen,
          setSvStatusCanContinue,
          setSvOnboardingCollected,
          setSvOnboardingTarget,
          setSvStatusPhase,
          setLastSVScore,
          lastSVScoreTimeRef,
          setSvElapsed,
          svElapsedIntervalRef,
          setSvRunning,
          svStopRef,
          svContinueResolverRef,
        });
        svChoice = startupFlow.svChoice;

        // Enroll the speaker into the already-running wake word and STT (live API).
        try {
          await applySpeakerVerificationChoice(svChoice);
        } catch (e) {
          console.error('[SV] applying speaker verification failed:', e);
          setMessage('Speaker verification could not be enabled. Continuing without it.');
          svChoice = 'skip';
        }

        await speakStartupNarration([
          svChoice === 'skip' ? 'Speaker verification skipped.' : 'Speaker verification is ready!',
          `Now please say the wake word ${wakeWords} to continue.`,
        ], { interruptOnWakeword: false });
        startupInProgressRef.current = false;
        setMessage(`Say the wake word "${wakeWords}" to continue.`);

      } catch (error) {
        if (Platform.OS === 'android') {
          if (voiceDemoBootstrapTimeoutRef.current) {
            clearTimeout(voiceDemoBootstrapTimeoutRef.current);
            voiceDemoBootstrapTimeoutRef.current = null;
          }
          setMessage('Voice setup failed. Restart the app to retry.');
        }
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

  useEffect(() => {
    return () => {
      if (voiceDemoBootstrapTimeoutRef.current) {
        clearTimeout(voiceDemoBootstrapTimeoutRef.current);
        voiceDemoBootstrapTimeoutRef.current = null;
      }
    };
  }, []);

  const enterTTSTestMode = async () => {
    beginSpeechUiEpoch();
    resetSpeechTranscriptState();
    resetAIChatSession();
    clearSpeechSentenceUI();
    setSpeechSessionUIActive(false);
    setIsFullAIChatMode(false);
    setIsAIChatHistoryVisible(false);
    setIsSTTOnlyMode(false);
    setIsCombinedMode(false);
    setMessage('Type to TTS');
    setIsTTSTestMode(true);
  };

  const enterSTTOnlyMode = async () => {
    beginSpeechUiEpoch();
    resetSpeechTranscriptState();
    resetAIChatSession();
    clearSpeechSentenceUI();
    setLastSentSentence('');
    setSpeechSessionUIActive(true);
    setIsFullAIChatMode(false);
    setIsAIChatHistoryVisible(false);
    setIsTTSTestMode(false);
    setIsCombinedMode(false);
    setIsSTTOnlyMode(true);
    try {
      console.log('[STT_DIAG] STT-only resume requested');
      const result = await Speech.unPauseSpeechRecognition(-1);
      console.log('[STT_DIAG] STT-only resume', { result,
        native: await Speech.sttHealthSnapshot(), listeners: Speech.sttListenerDiag() });
    } catch (error) { console.error('[STT_DIAG] STT-only resume failed', error); }
  };

  const enterCombinedMode = async () => {
    beginSpeechUiEpoch();
    resetSpeechTranscriptState();
    resetAIChatSession();
    clearSpeechSentenceUI();
    setSpeechSessionUIActive(true);
    setIsFullAIChatMode(false);
    setIsAIChatHistoryVisible(false);
    setIsTTSTestMode(false);
    setIsSTTOnlyMode(false);
    setIsCombinedMode(true);
    try {
      console.log('[STT_DIAG] combined resume requested');
      const result = await Speech.unPauseSpeechRecognition(-1);
      console.log('[STT_DIAG] combined resume', { result,
        native: await Speech.sttHealthSnapshot(), listeners: Speech.sttListenerDiag() });
    } catch (error) { console.error('[STT_DIAG] combined resume failed', error); }
  };

  const goBackToModeSelection = async () => {
    if (isGoingBackRef.current) return;
    isGoingBackRef.current = true;
    try {
      beginSpeechUiEpoch();
      resetSpeechTranscriptState();
      resetAIChatSession();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      Keyboard.dismiss();
      clearSpeechSentenceUI();
      try { await Speech.stopSpeaking(); } catch {}
      setSpeechSessionUIActive(false);
      setIsSpeakerIdentificationActive(false);
      setIsIntroSpeaking(false);
      setIntroScript('');
      setIsManualTTSSpeaking(false);
      setIsFullAIChatMode(false);
      setIsAIChatHistoryVisible(false);
      setIsTTSTestMode(false);
      setIsSTTOnlyMode(false);
      setIsCombinedMode(false);
      setLastSentSentence('');
      setTtsInputText('');
      setAppModeChoice(selectedAppModeRef.current);
      setMessage('Choose what you want to test next.');
      setShowAppModePrompt(true);
      try {
        await Speech.pauseSpeechRecognition();
      } catch {}
    } finally {
      isGoingBackRef.current = false;
    }
  };

  // Loads the selected on-device model in the background as soon as Local AI
  // Chat opens (or the model changes), never in the middle of a turn. Only
  // the latest warm-up updates the status, if the user switches models
  // quickly.
  // Optional remote MCP server (MCP_SERVER_URL / MCP_SERVER_TOKEN in the
  // git-ignored local.config.ts): its tools join the calorie tools. Connected
  // once, before the first warm-up, because the tool list is part of the
  // system prompt the engine caches. A failure only logs; the app tools work.
  const mcpToolsRef = useRef<Promise<ToolDefinition[]> | null>(null);
  const loadMcpTools = (): Promise<ToolDefinition[]> => {
    if (!mcpToolsRef.current) {
      const config = LocalConfig as { MCP_SERVER_URL?: string; MCP_SERVER_TOKEN?: string };
      const url = config.MCP_SERVER_URL?.trim();
      mcpToolsRef.current = !url
        ? Promise.resolve([])
        : connectMcpServer({
            url,
            headers: config.MCP_SERVER_TOKEN ? { Authorization: `Bearer ${config.MCP_SERVER_TOKEN}` } : undefined,
            timeoutMs: 8000,
          })
            .then((server) => {
              console.log(`[AIChat] MCP server connected (${server.client.protocolEra}): ${server.tools.map((t) => t.name).join(', ')}`);
              return server.tools;
            })
            .catch((error) => {
              console.log('[AIChat] MCP server unavailable:', String(error?.message ?? error));
              return [];
            });
    }
    return mcpToolsRef.current;
  };

  const warmUpLocalModel = (history: AIChatHistoryMessage[] = []) => {
    const seq = ++localModelWarmUpSeqRef.current;
    const isLatest = () => seq === localModelWarmUpSeqRef.current;
    setLocalModelStatus('Loading...');
    loadMcpTools()
      .then(async (mcpTools) => {
        // They run on a remote server: the agent says a filler while they run.
        if (mcpTools.length > 0) await getLocalLLMProvider().setExternalTools(mcpTools);
        return getLocalLLMProvider().warmUp(history, (fraction) => {
          if (isLatest()) setLocalModelStatus(`Downloading ${Math.round(fraction * 100)}%`);
        });
      })
      .then(async (model) => {
        if (!isLatest()) return;
        setLocalModelName(model.displayName);
        setLocalModelStatus('Ready');
        const deleted = await deleteUnusedModelFiles(await listModels());
        if (deleted.length > 0) console.log('[AIChat] deleted unused model files:', deleted);
      })
      .catch((error) => {
        console.log('[AIChat] local model warm-up failed:', error);
        if (isLatest()) setLocalModelStatus(`Failed: ${String(error?.message ?? error)}`);
      });
  };

  const enterFullAIChatMode = async () => {
    if (selectedAppModeRef.current === 'local_ai_chat') {
      warmUpLocalModel();
    }
    beginSpeechUiEpoch();
    //resetSpeechTranscriptState();
    resetAIChatSession();
    // if (timeoutRef.current) {
    //   clearTimeout(timeoutRef.current);
    //   timeoutRef.current = null;
    // }
    clearSpeechSentenceUI();
    setSpeechSessionUIActive(Platform.OS === 'android' ? true : false);
    setShowAppModePrompt(false);
    setShowTTSModelPrompt(false);
    setShowSVPrompt(false);
    setShowSVStatusScreen(false);
    setIsIntroSpeaking(false);
    setIntroScript('');
    setIsTTSTestMode(false);
    setIsAIChatHistoryVisible(false);
    setIsFullAIChatMode(true);
    setMessage(
      selectedAppModeRef.current === 'local_ai_chat'
        ? 'Local AI Chat is active. Start speaking.'
        : 'Full AI Chat is active. Start speaking.',
    );

    if (Platform.OS === 'android') {
      // TEMPORARY AUDIO-SESSION TEST: keep wakeword active while STT starts.
      const inst = myInstanceRef.current;
      // if (inst) {
      //   await inst.pauseDetection(true);
      // }
      void inst;

      try {
        await Promise.race([
          waitForIdle(),
          sleep(250),
        ]);
        await restartFullAIChatMicrophone('enterFullAIChatMode');
      } catch (error) {
        console.log('[AIChat] failed to enter Full AI Chat mode:', error);
        setAiChatStatus('Microphone did not reopen. Please tap Back and try again.');
      }
    } else {
      setAiChatStatus('Listening...');
      setCurrentSpeechSentence('Listening...');
      try {
        await Speech.pauseSpeechRecognition();
      } catch (error) {
        console.log('[AIChat] failed to pause speech recognition before chat reset:', error);
      }
      // await Speech.speak("Hello, I am rich!", SPEAKER, getSelectedSpeakerSpeed());

      try {
        await waitForIdle();
        resetSpeechTranscriptState();
        console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in exitTTSTestMode');
        await Speech.unPauseSpeechRecognition(-1);
        console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in exitTTSTestMode');
        await sleep(300);
      } catch (error) {
        console.log('[AIChat] failed to unpause speech recognition:', error);
        setAiChatStatus('Microphone did not reopen. Please tap Back and try again.');
      }
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
      await speakText(text, SPEAKER, getSelectedSpeakerSpeed());
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

  const shareLatestRecordings = async () =>
    shareWakewordRecordings({
      latestWakewordRecordingPaths,
      setIsMenuOpen,
    });

  const shouldShowFullAIChatScreen =
    isFullAIChatMode ||
    (
      (selectedAppModeRef.current === 'full_ai_chat' || selectedAppModeRef.current === 'local_ai_chat') &&
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
    const fillHeight: DimensionValue = `${Math.max(8, Math.round(svOnboardingProgress * 100))}%`;
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

  const isLocalAIChat = selectedAppModeRef.current === 'local_ai_chat';
  const aiChatTitle = isLocalAIChat
    ? 'Local AI Chat (on-device)'
    : '*Limited* **Gemini 3.1** Flash Lite Chat';

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
                  {isLocalAIChat
                    ? 'Speak naturally and the app will send your STT text to the on-device LLM, then speak the reply with the selected voice. Runs fully offline once the model is downloaded and loaded; any error is read aloud.'
                    : 'Speak naturally and the app will send your STT text to Gemini 2.5 Flash, then speak the reply with the selected voice.'}
                </Text>
              )}
              {isLocalAIChat && (
                <View style={[styles.speechSummaryBlock, styles.localModelRow]}>
                  <View style={styles.localModelInfo}>
                    <Text style={styles.speechSentenceLabel}>Model</Text>
                    <Text style={styles.speechSentenceText}>{localModelName || '...'}</Text>
                    {!!localModelStatus && (
                      <Text style={styles.speechSentenceLabel}>{localModelStatus}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.localModelChangeButton}
                    activeOpacity={0.7}
                    onPress={() => setIsModelPickerVisible(true)}>
                    <Text style={styles.localModelChangeText}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
              {isLocalAIChat && <CaloriesCard />}
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
                <Text style={styles.speechSentenceLabel}>{isLocalAIChat ? 'Local AI Reply' : 'Gemini Reply'}</Text>
                <Text style={styles.speechSentenceText}>
                  {aiChatResponse || (isLocalAIChat ? 'The local AI reply will appear here.' : 'Gemini response will appear here.')}
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
        <ModelPicker
          visible={isModelPickerVisible}
          isBusy={isAIChatLoading}
          onClose={() => setIsModelPickerVisible(false)}
          onModelSelected={(model) => {
            setLocalModelName(model.displayName);
            warmUpLocalModel(aiChatMessages);
          }}
        />
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
                  setSpeechSessionUIActive(false);
                  setCurrentSpeechSentence('');
                  setIsSpeakerIdentificationActive(false);
                  setShowSVStatusScreen(false);
                  setSvStatusCanContinue(false);
                  setSvRunning(false);
                  setMessage(`Say the wake word "${wakeWords}" to continue.`);
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
            <Text style={styles.svPromptTitle}>Choose Your Voice</Text>
            <Text style={styles.svPromptSubtitle}>
              Select a voice from model_ex2_rich_kate.dm before the demo starts.
            </Text>
            <View style={styles.ttsOptionSection}>
              <Text style={styles.ttsOptionLabel}>Voice</Text>
              <View style={styles.ttsVoiceGrid}>
                {TTS_VOICE_OPTIONS.map((voice) => (
                  <TouchableOpacity
                    key={voice}
                    style={[
                      styles.svButton,
                      styles.ttsVoiceButton,
                      ttsVoiceChoice === voice ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => setTtsVoiceChoice(voice)}>
                    <Text style={styles.svButtonText}>{voice}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.svButtonRow}>
              <TouchableOpacity
                style={[styles.svButton, styles.ttsContinueButton]}
                activeOpacity={0.7}
                onPress={() => {
                  ttsModelChoiceResolverRef.current?.({
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
            <Text style={styles.svPromptTitle}>Choose Mode</Text>
            <View style={styles.appModeStack}>
              {(
                [
                  { key: 'local_ai_chat', label: 'Local AI Chat',        desc: 'STT → on-device LLM → TTS' },
                  { key: 'full_ai_chat',  label: 'Full AI Chat',         desc: 'STT → Gemini → TTS' },
                  { key: 'combined',      label: 'Combined STT + TTS',   desc: 'Speak → hear it back' },
                  { key: 'stt_only',      label: 'STT Only',             desc: 'Show transcript, no playback' },
                  { key: 'type_to_tts',   label: 'Type to TTS',          desc: 'Type text → hear it spoken' },
                ] as const
              ).map(({ key, label, desc }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.appModeButton, appModeChoice === key ? styles.ttsOptionButtonSelected : styles.ttsOptionButtonIdle]}
                  activeOpacity={0.7}
                  onPress={async () => {
                    setAppModeChoice(key);
                    if (appModeChoiceResolverRef.current) {
                      appModeChoiceResolverRef.current(key);
                      appModeChoiceResolverRef.current = null;
                      // Enter the mode immediately so setShowAppModePrompt(false) and
                      // the mode flag batch into one render — no home-screen flash.
                      selectedAppModeRef.current = key;
                      modeAlreadyEnteredRef.current = true;
                      setShowAppModePrompt(false);
                      if (key === 'full_ai_chat' || key === 'local_ai_chat') {
                        setAiChatStatus('Preparing chat mode...');
                        setAiChatTranscript('');
                        setAiChatResponse('');
                        await enterFullAIChatMode();
                        return;
                      }
                      if (key === 'stt_only') { await enterSTTOnlyMode(); return; }
                      if (key === 'type_to_tts') { await enterTTSTestMode(); return; }
                      await enterCombinedMode();
                      return;
                    }
                    selectedAppModeRef.current = key;
                    setShowAppModePrompt(false);
                    if (key === 'full_ai_chat' || key === 'local_ai_chat') { await enterFullAIChatMode(); return; }
                    if (key === 'stt_only') { await enterSTTOnlyMode(); return; }
                    if (key === 'type_to_tts') { await enterTTSTestMode(); return; }
                    await enterCombinedMode();
                  }}>
                  <Text style={styles.svButtonText}>{label}</Text>
                  <Text style={styles.appModeDescription}>{desc}</Text>
                </TouchableOpacity>
              ))}
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

  if (isSTTOnlyMode) {
    return (
      <View style={styles.linearGradient}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[styles.screenScrollContent, { paddingTop: contentTopPadding }]}>
          {renderScreenLogo()}
          <View style={[styles.svPromptCard, styles.ttsTestScreenCard]}>
            <Text style={styles.svPromptTitle}>STT Only</Text>
            <View style={styles.speechSummaryBlock}>
              <Text style={styles.speechSentenceLabel}>Building</Text>
              <Text style={styles.speechSentenceText}>{currentSpeechSentence || 'Listening...'}</Text>
            </View>
            <View style={styles.speechSummaryBlock}>
              <Text style={styles.speechSentenceLabel}>Last sent</Text>
              <Text style={styles.speechSentenceText}>{lastSentSentence || '–'}</Text>
            </View>
            <View style={styles.ttsTestActionRow}>
              <TouchableOpacity
                style={[styles.svButton, styles.svButtonNo, styles.ttsTestBackButton]}
                activeOpacity={0.7}
                onPress={goBackToModeSelection}>
                <Text style={styles.svButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isCombinedMode) {
    return (
      <View style={styles.linearGradient}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[styles.screenScrollContent, { paddingTop: contentTopPadding }]}>
          {renderScreenLogo()}
          <View style={[styles.svPromptCard, styles.ttsTestScreenCard]}>
            <Text style={styles.svPromptTitle}>Combined STT + TTS</Text>
            <View style={styles.speechSummaryBlock}>
              <Text style={styles.speechSentenceLabel}>Current sentence</Text>
              <Text style={styles.speechSentenceText}>{currentSpeechSentence || 'Listening...'}</Text>
            </View>
            <View style={styles.ttsTestActionRow}>
              <TouchableOpacity
                style={[styles.svButton, styles.svButtonNo, styles.ttsTestBackButton]}
                activeOpacity={0.7}
                onPress={goBackToModeSelection}>
                <Text style={styles.svButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
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
                {!skipNarration && (
                  <TouchableOpacity
                    style={styles.skipNarrationButton}
                    activeOpacity={0.7}
                    onPress={handleSkipNarration}>
                    <Text style={styles.skipNarrationButtonText}>Skip Narration</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {shouldShowSpeechSessionCard && (
            <View style={styles.ttsPromptWrapper}>
              <View style={styles.svPromptCard}>
                <Text style={styles.svPromptTitle}>
                  {isIntroSpeaking ? `${displayedSpeakerName} is speaking...` : 'Ready'}
                </Text>
                {isIntroSpeaking && !skipNarration && (
                  <TouchableOpacity
                    style={styles.skipNarrationButton}
                    activeOpacity={0.7}
                    onPress={handleSkipNarration}>
                    <Text style={styles.skipNarrationButtonText}>Skip Narration</Text>
                  </TouchableOpacity>
                )}
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
                      onPress={async () => {
                        const mode = selectedAppModeRef.current;
                        if (mode === 'full_ai_chat' || mode === 'local_ai_chat') { await enterFullAIChatMode(); return; }
                        if (mode === 'stt_only') { await enterSTTOnlyMode(); return; }
                        if (mode === 'type_to_tts') { await enterTTSTestMode(); return; }
                        await enterCombinedMode();
                      }}>
                      <Text style={styles.svButtonText}>Continue</Text>
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
  localModelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  localModelInfo: {
    flex: 1,
  },
  localModelChangeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  localModelChangeText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
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
  ttsVoiceButton: {
    width: '47%',
    paddingHorizontal: 8,
  },
  ttsVoiceGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
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
    ...StyleSheet.absoluteFill,
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
  skipNarrationButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  skipNarrationButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default App;
