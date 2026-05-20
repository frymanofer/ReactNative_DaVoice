import RNFS from 'react-native-fs';
import { Alert, NativeModules, Platform, Share } from 'react-native';
import type SpeechType from 'react-native-davoice/speech';
import { disableDucking, enableDucking, createKeyWordRNBridgeInstance, setWakewordAudioRoutingConfig } from 'react-native-wakeword';
import type { AudioRoutingConfig, KeyWordRNBridgeInstance } from 'react-native-wakeword';
import type { AppModeChoice } from '../appflow';
import { ensureMicPermission } from '../initialization';

// Ducking / Unducking

/*
Ducking/Unducking TEMPORARY code until background timers are
enabled!!
 */

let unDuckingTimerId: any = null;
let unDuckingExpiration = 0;

export const scheduleUnDucking = async (seconds: number) => {
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

//
//
// --> *** IMPORTANT IOS AUDIO SESSION CONFIG ***
// Set Audio session for IOS!!!!
//
//
export const defaultAudioRoutingConfig: AudioRoutingConfig = {
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

export interface InstanceConfig {
  id: string;
  modelName: string;
  threshold: number;
  bufferCnt: number;
  sticky: boolean;
  msBetweenCallbacks: number;
}

export const modelName = 'hey_coach_model_28_22012026b.onnx';
//const modelName = 'hey_lookdeep' + (Platform.OS === 'ios' ? '.onnx' : '.dm');
//const modelName = 'ayuda_model_28_05022026' + (Platform.OS === 'ios' ? '.onnx' : '.dm');
// Create an array of instance configurations
export const instanceConfigs: InstanceConfig[] = [
  { id: 'multi_model_instance', modelName, threshold: 0.999, bufferCnt: 3, sticky: false, msBetweenCallbacks: 1000 },
  // Ayuda:
  //   { id: 'multi_model_instance', modelName, threshold: 0.95, bufferCnt: 3, sticky: false, msBetweenCallbacks: 1000 },
];

// Helper function to format the ONNX file name
export const formatWakeWord = (fileName: string) => {
  return fileName
    .replace(/(_model.*|_\d+.*)\.onnx$/, '')
    .replace(/_/g, ' ')
    .replace('.onnx', '')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const AudioPermissionComponent = async () => {
  return ensureMicPermission();
};

// --- instance creation (kept exactly as in your code) ---
export async function addInstance(conf: InstanceConfig): Promise<KeyWordRNBridgeInstance> {
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

export async function addInstanceMulti(conf: InstanceConfig): Promise<KeyWordRNBridgeInstance> {
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

export async function attachKeywordListenerOnce(
  listenerRef: { current: any },
  instance: KeyWordRNBridgeInstance,
  formatPhrase: (phrase: string) => string,
  callback: (phrase: string) => void,
) {
  const curr = listenerRef.current;
  if (curr && typeof curr.remove === 'function') {
    try {
      await curr.remove();
    } catch (e) {
      console.warn('listener.remove failed (ignored):', e);
    }
  }
  listenerRef.current = null;

  const sub = instance.onKeywordDetectionEvent((phrase: string) => {
    const nice = formatPhrase(phrase);
    console.log(`Instance ${instance.instanceId} detected: ${nice} with phrase`, nice);
    callback(nice);
  });
  console.log('eventListener == ', sub);
  listenerRef.current = sub;
  return sub;
}

export async function detachKeywordListener(listenerRef: { current: any }) {
  const curr = listenerRef.current;
  if (curr && typeof curr.remove === 'function') {
    try {
      await curr.remove();
    } catch (e) {
      console.warn('listener.remove failed (ignored):', e);
    }
  }
  listenerRef.current = null;
}

export async function startWakewordDetection({
  instance,
  svChoice,
  enrollmentJsonPath,
  sleep,
}: {
  instance: KeyWordRNBridgeInstance;
  svChoice: string;
  enrollmentJsonPath?: string | null;
  sleep: (ms: number) => Promise<void>;
}) {
  /* Below code with enableDucking/disableDucking and startKeywordDetection(xxx, false, ...) - where
  false is the second argument is used to initialze other audio sessions before wake word to duck others etc'
  You can aslo make wake word use the same settings and not chaning audio session.
  // await disableDucking();
  // await enableDucking();
  // await inst.startKeywordDetection(instanceConfigs[0].threshold, false);
  */

  if (svChoice !== 'skip' && typeof enrollmentJsonPath === 'string' && enrollmentJsonPath.length > 0) {
    console.log('startKeywordDetection with SV:', enrollmentJsonPath);
    await instance.startKeywordDetection(
      instanceConfigs[0].threshold,
      enrollmentJsonPath || '',
      true,
    );
  } else {
    console.log('startKeywordDetection without SV:');
    await instance.startKeywordDetection(instanceConfigs[0].threshold, true);
  }
  await instance.pauseDetection(false);
  await sleep(100);
  console.log('Post pauseDetection');
}

export async function resumeWakewordDetection(instance: KeyWordRNBridgeInstance) {
  try {
    console.log('calling unPauseDetection after speech init path');
    await instance.unPauseDetection();
    console.log('Post pauseDetection 3');
  } catch (unpauseError) {
    console.error('Failed to unpause keyword detection:', unpauseError);
  }
}

export async function initializeWakewordBootstrap({
  PlatformOS,
  defaultAudioRoutingConfig,
  setMessage,
  keywordCallback,
  listenerRef,
  myInstanceRef,
  keywordLicense,
  speechLicense,
  Speech,
  svChoice,
  enrollmentJsonPath,
  sleep,
  initializeSpeechLibrary,
  withTimeout,
  suppressAndroidPartialResultsRef,
  speechLibraryInitializedRef,
}: {
  PlatformOS: string;
  defaultAudioRoutingConfig: AudioRoutingConfig;
  setMessage: (value: string) => void;
  keywordCallback: (phrase: string) => void;
  listenerRef: { current: any };
  myInstanceRef: { current: KeyWordRNBridgeInstance | null };
  keywordLicense: string;
  speechLicense: string;
  Speech: typeof SpeechType;
  svChoice: string;
  enrollmentJsonPath?: string | null;
  sleep: (ms: number) => Promise<void>;
  initializeSpeechLibrary: (enrollmentJsonPath?: string | null) => Promise<void>;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
  suppressAndroidPartialResultsRef: { current: boolean };
  speechLibraryInitializedRef: { current: boolean };
}) {
  // 🔹 *** NEW ***: configure routing once (iOS only) BEFORE creating instances
  if (PlatformOS === 'ios') {
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
    return { speechInitCompleted: false };
  }

  // --> Attach the callback !!!!
  const inst = myInstanceRef.current!;
  await attachKeywordListenerOnce(listenerRef, inst, formatWakeWord, keywordCallback);

  const isLicensed = await inst.setKeywordDetectionLicense(keywordLicense);
  if (!isLicensed) {
    console.error('No License!!! - setKeywordDetectionLicense returned', isLicensed);
    setMessage('Lincese not valid: Please contact info@davoice.io for a new license');
    return { speechInitCompleted: false };
  }

  const isSpeechLicensed = await Speech.setLicense(speechLicense);
  if (!isSpeechLicensed) {
    console.error('No License!!! - Speech.setLicense returned', isSpeechLicensed);
    setMessage('Lincese not valid: Please contact info@davoice.io for a new license');
    return { speechInitCompleted: false };
  }

  await startWakewordDetection({
    instance: inst,
    svChoice,
    enrollmentJsonPath,
    sleep,
  });

  let speechInitCompleted = false;
  try {
    suppressAndroidPartialResultsRef.current = true;
    setMessage('Initializing speech engine...');
    console.log('Before initializeSpeechLibrary');
    await withTimeout(
      initializeSpeechLibrary(
        typeof enrollmentJsonPath === 'string' && enrollmentJsonPath.length > 0
          ? enrollmentJsonPath
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
    } finally {
      suppressAndroidPartialResultsRef.current = false;
    }
    // console.log('Post pauseDetection 2');
  } catch (e) {
    suppressAndroidPartialResultsRef.current = false;
    speechLibraryInitializedRef.current = false;
    console.error('Speech initialization failed or hung:', e);
    setMessage('Speech init stalled. Wakeword detection was resumed, but speech may need a retry.');
  } finally {
    await resumeWakewordDetection(inst);
  }

  return { inst, speechInitCompleted };
}

const toFileUrl = (path: string): string => (path.startsWith('file://') ? path : `file://${path}`);

export async function shareWakewordRecordings({
  latestWakewordRecordingPaths,
  setIsMenuOpen,
}: {
  latestWakewordRecordingPaths: string[];
  setIsMenuOpen: (value: boolean) => void;
}) {
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
}

export async function prepareWakewordSpeechSession({
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
}: any) {
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
    setSpeechSessionUIActive(false);
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

  setSpeechSessionUIActive(true);
  setCurrentSpeechSentence('');
  enrollmentJson = enrollmentJsonRef.current ?? enrollmentJson;
  setIsSpeakerIdentificationActive(typeof enrollmentJson === 'string' && enrollmentJson.length > 0);
  console.log('[keywordCallback] Speech already initialized');
  if (!speechLibraryInitializedRef.current) {
    console.warn('[keywordCallback] Speech library was not initialized during startup.');
  }

  return enrollmentJson;
}

export async function captureWakewordDetection({
  instance,
  stopWakeWord,
  sleep,
  setLatestWakewordRecordingPaths,
}: any) {
  let wavFilePath = '';
  let recordedWavPaths: string[] = [];

  // 2) Stop Detection (native)
  try {
    if (stopWakeWord) {
      await instance.stopKeywordDetection(/* FR add if stop microphone or */);
    } else {
      await instance.pauseDetection(false);///* FR add if stop microphone or */);
    }

    wavFilePath = await instance.getRecordingWav();
    if (Platform.OS === 'android') {
      recordedWavPaths = await instance.getRecordingWavArray();
    }
    console.log('paths == ', recordedWavPaths);
  } catch {}

  const pathsForSharing =
    Platform.OS === 'android'
      ? (recordedWavPaths.length > 0 ? recordedWavPaths : [wavFilePath]).filter(Boolean)
      : [wavFilePath].filter(Boolean);
  if (pathsForSharing.length > 0) {
    setLatestWakewordRecordingPaths(pathsForSharing);
  }
  await sleep(1000);

  return { wavFilePath, recordedWavPaths, pathsForSharing };
}

export function cleanDetectedWakeWord(keywordIndex: any) {
  console.log('detected keyword: ', keywordIndex);
  const keywordText = String(keywordIndex ?? '');
  const keywordWords = keywordText.trim().split(/\s+/).filter(Boolean);
  const modelWordIndex = keywordWords.findIndex((w) => w.toLowerCase() === 'model');
  const cleanWakeWord =
    modelWordIndex >= 0
      ? keywordWords.slice(0, modelWordIndex).join(' ')
      : keywordText;
  return { keywordText, keywordWords, cleanWakeWord };
}
