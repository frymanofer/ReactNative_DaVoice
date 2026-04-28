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
  InputAccessoryView,
  Keyboard,
  InteractionManager,
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
  TTSQualityChoice,
  TTSVoiceChoice,
} from './src/appflow';
import {
  initializeSpeechLibrary as initializeSpeechLibraryBase,
  promptForTTSModelChoice as promptForTTSModelChoiceBase,
  waitForNextInteraction as waitForNextInteractionBase,
  withTimeout,
} from './src/initialization';
import { getAdjustedSpeed, mergeSmartKeepPunct, registerSpeechHandlers } from './src/stt';
import {
  runSpeakerVerificationStartupFlow,
} from './src/speaker_verification/onboarding';
import {
  ARIANA_SPEAKER_SPEED,
  playWakewordIntroSpeech,
  RICH_SPEAKER_SPEED,
  SPEAKER,
  ttsModelFast,
  ttsModelRichFast,
  ttsModelRichSlow,
  ttsModelSlow,
} from './src/tts';
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
  shareWakewordRecordings,
} from './src/wakeword';

const TTS_INPUT_ACCESSORY_ID = 'ttsInputAccessory';
const waitForNextInteraction = () => waitForNextInteractionBase(InteractionManager);
let calledOnce = false;

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
  const suppressAndroidPartialResultsRef = useRef(false);

  const sidRef = useRef<any>(null);
  const [didInitSID, setDidInitSID] = useState(false);

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
  const speechSessionUIAllowedRef = useRef(false);
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
  const pendingWakeWordPrefixRef = useRef<string | null>(null);
  const aiChatStreamingSupportedRef = useRef(true);
  const aiChatSpeechQueueRef = useRef<string[]>([]);
  const aiChatPendingSentenceBufferRef = useRef('');
  const aiChatStreamingActiveRef = useRef(false);
  const aiChatStreamGenerationDoneRef = useRef(false);
  const aiChatStreamSpeakingRef = useRef(false);

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

  const finishAIChatSpeechFlow = async () =>
    finishAIChatSpeechFlowBase({
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

  const speakNextAIChatSentence = async () =>
    speakNextAIChatSentenceBase({
      Speech,
      aiChatStreamSpeakingRef,
      aiChatSpeechQueueRef,
      setCurrentSpeechSentence,
      setAiChatStatus,
      getSelectedSpeakerSpeed,
      aiChatStreamGenerationDoneRef,
      aiChatPendingSentenceBufferRef,
      SPEAKER,
      finishAIChatSpeechFlow,
    });

  const enqueueAIChatSpeechFromDelta = async (deltaText: string, aggregateText: string) =>
    enqueueAIChatSpeechFromDeltaBase({
      deltaText,
      aggregateText,
      aiChatPendingSentenceBufferRef,
      aiChatSpeechQueueRef,
      speakNextAIChatSentence,
      setAiChatResponse,
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
    );
    Speech.onFinishedSpeaking = async () => {
      console.log('onFinishedSpeaking(): ✅ Finished speaking (last WAV done).');
      if (aiChatStreamingActiveRef.current) {
        aiChatStreamSpeakingRef.current = false;
        await speakNextAIChatSentence();
        return;
      }
      if (aiChatAwaitingSpeechFinishRef.current) {
        aiChatAwaitingSpeechFinishRef.current = false;
        await finishAIChatSpeechFlow();
      }
    };
    await Speech.pauseSpeechRecognition();
  }

  async function promptForTTSModelChoice() {
    return promptForTTSModelChoiceBase({
      setShowTTSModelPrompt,
      ttsModelChoiceResolverRef,
      setTtsQualityChoice,
      setTtsVoiceChoice,
      selectedTTSVoiceRef,
      selectedTTSModelRef,
      ttsModelRichFast,
      ttsModelRichSlow,
      ttsModelFast,
      ttsModelSlow,
      waitForNextInteraction,
    });
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
    if (now < aiChatBlockedUntilRef.current) {
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
    setAiChatStatus('Sending transcript to Gemini...');
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

      let aiReply = '';
      const shouldUseStreaming = GEMINI_ENABLE_STREAMING && aiChatStreamingSupportedRef.current;
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

      if (aiChatRequestIdRef.current !== requestId) return;

      geminiConversationRef.current = [
        ...nextHistory,
        { role: 'model' as const, parts: [{ text: aiReply }] },
      ];

      setAiChatResponse(aiReply);
      setAiChatMessages((prev) =>
        prev.map((message) =>
          message.id === `model-${requestId}`
            ? { ...message, text: aiReply }
            : message
        )
      );

      if (shouldUseStreaming && aiChatStreamingActiveRef.current) {
        aiChatStreamGenerationDoneRef.current = true;
        aiChatAwaitingSpeechFinishRef.current = true;
        await speakNextAIChatSentence();
      } else {
        aiChatStreamingActiveRef.current = false;
        setCurrentSpeechSentence(`Gemini: ${aiReply}`);
        setAiChatStatus('Speaking Gemini reply...');
        aiChatAwaitingSpeechFinishRef.current = true;
        await Speech.speak(normalizeTextForSpeech(aiReply), SPEAKER, getSelectedSpeakerSpeed());
      }
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      const friendlyMessage = buildFriendlyGeminiErrorMessage(message);
      console.log('[AIChat] Gemini error:', message);
      aiChatStreamingActiveRef.current = false;
      aiChatStreamGenerationDoneRef.current = false;
      aiChatStreamSpeakingRef.current = false;
      aiChatAwaitingSpeechFinishRef.current = false;
      if (/quota|rate limit|429|too many requests/i.test(message)) {
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
      setCurrentSpeechSentence(`Gemini: ${friendlyMessage}`);
      setAiChatStatus('Speaking demo status update...');
      aiChatAwaitingSpeechFinishRef.current = true;
      try {
        await Speech.speak(
          normalizeTextForSpeech(friendlyMessage),
          SPEAKER,
          getSelectedSpeakerSpeed(),
        );
      } catch (speechError) {
        console.log('[AIChat] failed to speak Gemini fallback message:', speechError);
        aiChatAwaitingSpeechFinishRef.current = false;
        await finishAIChatSpeechFlow();
      }
    } finally {
      if (aiChatRequestIdRef.current === requestId) {
        if (!aiChatAwaitingSpeechFinishRef.current && aiChatInFlightRef.current) {
          lastProcessedRef.current = '';
          aiChatInFlightRef.current = false;
          setIsAIChatLoading(false);
          console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in processAIChatTurn.finally');
          await Speech.unPauseSpeechRecognition(-1);
          console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in processAIChatTurn.finally');
        }
      }
    }
  };

  const getSelectedSpeakerSpeed = (): number =>
    selectedTTSVoiceRef.current === 'Rich' ? RICH_SPEAKER_SPEED : ARIANA_SPEAKER_SPEED;
  registerSpeechHandlers({
    Speech,
    suppressAndroidPartialResultsRef,
    showAppModePrompt,
    isTTSTestMode,
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
          waitForNextInteraction,
          setMessage,
          setCurrentSpeechSentence,
          setIsSpeakerIdentificationActive,
          speechLibraryInitializedRef,
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
      if (selectedAppModeRef.current === 'full_ai_chat') {
        setAiChatStatus('Preparing chat mode...');
        setAiChatTranscript('');
        setAiChatResponse('');
        await enterFullAIChatMode();
        return;
      }

      const selectedSpeakerName: 'Rich' | 'Ariana' = selectedTTSVoiceRef.current;
      await playWakewordIntroSpeech({
        Speech,
        beginSpeechUiEpoch,
        setMessageGuarded,
        setIntroSpeakerName,
        setIntroScript,
        setCurrentSpeechSentenceGuarded,
        setIntroSpeakingGuarded,
        selectedSpeakerName,
        getSelectedSpeakerSpeed,
        SPEAKER,
        waitForNextInteraction,
        resetSpeechTranscriptState,
        sleep,
        clearSpeechSentenceUI,
      });

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
      let svChoice: SVPromptChoice = 'skip';
      try {
        await promptForTTSModelChoice();
        const startupFlow = await runSpeakerVerificationStartupFlow({
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
      } catch (error) {
        return;
      }

      try {
        const { speechInitCompleted } = await initializeWakewordBootstrap({
          PlatformOS: Platform.OS,
          defaultAudioRoutingConfig,
          setMessage,
          keywordCallback,
          listenerRef,
          myInstanceRef,
          keywordLicense:
            'MTc4MDI2MTIwMDAwMA==-d3EkPrSbdRWcuiei/cHMRLBhUw9T/NAlbRR3vfrcDu8=',
          speechLicense:
            'MTc4MDI2MTIwMDAwMA==-d3EkPrSbdRWcuiei/cHMRLBhUw9T/NAlbRR3vfrcDu8=',
          Speech,
          svChoice,
          enrollmentJsonPath: enrollmentJsonPathRef.current,
          sleep,
          initializeSpeechLibrary,
          withTimeout,
          suppressAndroidPartialResultsRef,
          speechLibraryInitializedRef,
        });

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
    setSpeechSessionUIActive(false);
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
    setSpeechSessionUIActive(false);
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
    setSpeechSessionUIActive(false);
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
      console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) in exitTTSTestMode');
      await Speech.unPauseSpeechRecognition(-1);
      console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) in exitTTSTestMode');
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

  const shareLatestRecordings = async () =>
    shareWakewordRecordings({
      latestWakewordRecordingPaths,
      setIsMenuOpen,
    });

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

  const aiChatTitle = 'Limited Gemini 3.1 Flash Lite Chat';

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
                  setSpeechSessionUIActive(false);
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
