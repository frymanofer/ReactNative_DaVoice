// Below is a part of Speech Feature to play mp3 and WAV file within the same Audio framework.
// You call Speech.playWav with any mp3/wav etc' file you need

export const ARIANA = 0;
export const RICH = 1;

export const SPEAKER = 0;

export const RICH_SPEAKER_SPEED = 0.85;
export const ARIANA_SPEAKER_SPEED = 0.88; //0.75;
export const HANNA_SPEAKER_SPEED = 0.9;

export const RICH_SPEAKER_SPEED_NEW_MODEL = 0.95;
export const ARIANA_SPEAKER_SPEED_NEW_MODEL = 1.0;
export const HANNA_SPEAKER_SPEED_NEW_MODEL = 1.0;
export const KATE_SPEAKER_SPEED_NEW_MODEL = 1.0;
export const CLONED_VOICE_SPEED = 1.0;

// const SPEAKER_SPEED = ARIANA_SPEAKER_SPEED;
//const SPEAKER_SPEED = 0.75;
// const SPEAKER_SPEED_ = 0.85;
//export const SPEAKER_SPEED = 0.9;// 0.85;
export const SPEAKER_SPEED = 1.0;// 0.85;

export const moonRocksSound = require('../../assets/cashRegisterSound.mp3');
export const subtractMoonRocksSound = require('../../assets/bellServiceDeskPressXThree.mp3');

import type { AppLanguage, BundledTTSVoice, TTSVoiceChoice } from '../appflow';
import { narrationFor } from '../narration';

const ttsModels: Record<AppLanguage, any> = {
  en: require('../../assets/models/model_ex2_rich_kate.dm'),
  'pt-BR': require('../../assets/models/model_ex2_portuguese_brv1.dm'),
  // Portugal Portuguese: its own model (folder portuguese_pt -> Portugal text rules).
  'pt-PT': require('../../assets/models/model_ex2_portuguese_pt.dm'),
  de: require('../../assets/models/model_ex2_german.dm'),
  es: require('../../assets/models/model_ex2_spanish.dm'),
  fr: require('../../assets/models/model_ex2_french.dm'),
  it: require('../../assets/models/model_ex2_italian.dm'),
  nl: require('../../assets/models/model_ex2_dutch.dm'),
  // TTS v1 (Piper + voice converter). !!! DEV ONLY: its base Piper voice is non-commercial;
  // rebuild with a licensed voice (TTS2/TTSv1/tools/build_hebrew.py --model) before shipping.
  // NOT BUNDLED (2026-11-10: Hebrew hidden from the language screen; a require() here would ship the 125 MB file).
  // To bring Hebrew back: restore `require('../../assets/models/model_v1_hebrew.dm')` and remove `hidden` in src/appflow.ts.
  he: null,
};
const BRAZILIAN_SPEAKER_SPEED = 1.0;

// Voice encoder for Speech.createVoiceClone(audioPath, outputPath, getVoiceEmbedder()):
// turns a recording (wav/mp3/m4a/...) into a <name>.emd voice for the language's
// model; Speech.setExternalVoicesPath(folder) then makes it selectable.
const voiceEmbedders: Record<AppLanguage, any> = {
  en: require('../../assets/models/embedder_en.dm'),
  'pt-BR': require('../../assets/models/embedder_brv1.dm'),
  // Must match model_ex2_portuguese_pt.dm; brv1 voices do not fit it (and vice versa).
  'pt-PT': require('../../assets/models/embedder_pt_pt.dm'),
  de: require('../../assets/models/embedder_de.dm'),
  es: require('../../assets/models/embedder_es.dm'),
  fr: require('../../assets/models/embedder_fr.dm'),
  it: require('../../assets/models/embedder_it.dm'),
  nl: require('../../assets/models/embedder_nl.dm'),
  // The v1 voice embedder: its voices fit only the v1 (Hebrew) model.
  // NOT BUNDLED (see ttsModels.he): restore `require('../../assets/models/embedder_he.dm')` with it.
  he: null,
};

// The app's language (the language screen sets it before the speech library loads).
let ttsLanguage: AppLanguage = 'en';
export function setTTSLanguage(language: AppLanguage) {
  ttsLanguage = language;
}
export function getTTSLanguage(): AppLanguage {
  return ttsLanguage;
}
export function getVoiceEmbedder() {
  return voiceEmbedders[ttsLanguage] ?? voiceEmbedders.en;   // a language whose files aren't bundled (he) falls back to English
}

export function getTTSVoiceConfig(voice: TTSVoiceChoice, useTTS2Only: boolean) {
  const model = ttsModels[ttsLanguage] ?? ttsModels.en;   // a language whose files aren't bundled (he) falls back to English
  // Every voice, including a cloned voice, belongs to the selected language model.
  if (ttsLanguage !== 'en') {
    return { model, speed: ttsLanguage === 'pt-BR' || ttsLanguage === 'pt-PT' ? BRAZILIAN_SPEAKER_SPEED : CLONED_VOICE_SPEED, usesTTS2: true };
  }
  if (useTTS2Only) {
    const speeds: Record<BundledTTSVoice, number> = {
      Ariana: ARIANA_SPEAKER_SPEED_NEW_MODEL,
      Rich: RICH_SPEAKER_SPEED_NEW_MODEL,
      Hanna: HANNA_SPEAKER_SPEED_NEW_MODEL,
      Kate: KATE_SPEAKER_SPEED_NEW_MODEL,
      Jenny: KATE_SPEAKER_SPEED_NEW_MODEL,
      Matthew: KATE_SPEAKER_SPEED_NEW_MODEL,
      Gloria: KATE_SPEAKER_SPEED_NEW_MODEL,
    };
    return { model, speed: speeds[voice as BundledTTSVoice] ?? CLONED_VOICE_SPEED, usesTTS2: true };
  }
  const voices: Record<BundledTTSVoice, { model: any; speed: number; usesTTS2: boolean }> = {
    Rich: { model, speed: RICH_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Kate: { model, speed: KATE_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Jenny: { model, speed: KATE_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Matthew: { model, speed: KATE_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Gloria: { model, speed: KATE_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    // Every voice is a speaker of the shared model.
    Ariana: { model, speed: ARIANA_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Hanna: { model, speed: HANNA_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
  };
  // A cloned voice (an .emd in the cloned voices folder) is a voice of the shared model too.
  return voices[voice as BundledTTSVoice] ?? { model, speed: CLONED_VOICE_SPEED, usesTTS2: true };
}

export async function playWakewordIntroSpeech({
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
}: any) {
  const speak = speakText ?? Speech.speak.bind(Speech);
  const speechUiEpoch = beginSpeechUiEpoch();
  await Speech.pauseSpeechRecognition();
  const introLine = narrationFor(ttsLanguage).introduction(String(selectedSpeakerName))[0];
  // setMessageGuarded(speechUiEpoch, `${selectedSpeakerName} is speaking...`);
  // setIntroSpeakerName(selectedSpeakerName);
  // setIntroScript(introLine);
  // setCurrentSpeechSentenceGuarded(speechUiEpoch, "Into Message: " + introLine);
  // setIntroSpeakingGuarded(speechUiEpoch, true);

  // try {
  //   await Speech.speak(introLine, SPEAKER, getSelectedSpeakerSpeed());
  // } finally {
  //   setIntroSpeakingGuarded(speechUiEpoch, false);
  // }
  // console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) after intro speech');
  // await Speech.unPauseSpeechRecognition(-1);
  // console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) after intro speech');

  // Hi! Welcome to Lunafit! My name is Ariana. Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals. It's about owning your journey!
  // Hi, Welcome to Lunafit, My name is Ariana, Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals, It's about owning your journey!
  /*
  await speak("Hi, Welcome to Lunafit, My name is Ariana, Besides tracking, LunaFit also gives you personalized plans for all those pillars and helps you crush your health and fitness goals, It's about owning your journey!");
  await speak("Hello, as an AI , I don't have feelings , but I'm here and ready to help you with anything you need. Today, how can I assist you?", SPEAKER, SPEAKER_SPEED);
  await speak("let me demonstrate. Are you ready.", SPEAKER, SPEAKER_SPEED);
  await speak("Hey, how are you?", SPEAKER, SPEAKER_SPEED);
  await speak("Hi guys, how are you?", SPEAKER, SPEAKER_SPEED);
  await speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
  await speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
  await speak("Hello. how are you?", SPEAKER, SPEAKER_SPEED);
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
  await waitForIdle();
  resetSpeechTranscriptState();
  console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) after waitForIdle');
  await Speech.unPauseSpeechRecognition(-1);
  console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) after waitForIdle');
  await sleep(500);
  clearSpeechSentenceUI(speechUiEpoch);

  return { speechUiEpoch, introLine };
}
