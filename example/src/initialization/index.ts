import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import type SpeechType from 'react-native-davoice/speech';
import type { TTSQualityChoice, TTSVoiceChoice } from '../appflow';

export const waitForNextInteraction = (InteractionManager: typeof import('react-native').InteractionManager) =>
  new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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
    return true;
  }
}

export async function initializeSpeechLibrary(
  Speech: typeof SpeechType,
  selectedTTSModel: any,
  enrollmentJsonPath?: string | null,
) {
  console.log('Calling Speech.initAll');
  if (typeof enrollmentJsonPath === 'string' && enrollmentJsonPath.length > 0) {
    console.log('Calling Speech.initAll with enrollmentJson:', enrollmentJsonPath);
    await Speech.initAll({
      locale: 'en-US',
      model: selectedTTSModel,
      onboardingJsonPath: enrollmentJsonPath,
    });
  } else {
    console.log('Calling Speech.initAll WITHOUT');
    await Speech.initAll({ locale: 'en-US', model: selectedTTSModel });
  }
}

export async function promptForTTSModelChoice({
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
}: {
  setShowTTSModelPrompt: (value: boolean) => void;
  ttsModelChoiceResolverRef: { current: null | ((choice: { quality: TTSQualityChoice; voice: TTSVoiceChoice }) => void) };
  setTtsQualityChoice: (value: TTSQualityChoice) => void;
  setTtsVoiceChoice: (value: TTSVoiceChoice) => void;
  selectedTTSVoiceRef: { current: TTSVoiceChoice };
  selectedTTSModelRef: { current: any };
  ttsModelRichFast: any;
  ttsModelRichSlow: any;
  ttsModelFast: any;
  ttsModelSlow: any;
  waitForNextInteraction: () => Promise<void>;
}) {
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
