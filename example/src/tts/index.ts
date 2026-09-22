// Below is a part of Speech Feature to play mp3 and WAV file within the same Audio framework.
// You call Speech.playWav with any mp3/wav etc' file you need

export const ARIANA = 0;
export const RICH = 1;

export const SPEAKER = 0;

export const RICH_SPEAKER_SPEED = 0.85;
export const ARIANA_SPEAKER_SPEED = 0.88; //0.75;
export const HANNA_SPEAKER_SPEED = 0.9;

export const RICH_SPEAKER_SPEED_NEW_MODEL = 0.95;
export const ARIANA_SPEAKER_SPEED_NEW_MODEL = 1.0; //0.75;
export const HANNA_SPEAKER_SPEED_NEW_MODEL = 1.0;

// const SPEAKER_SPEED = ARIANA_SPEAKER_SPEED;
//const SPEAKER_SPEED = 0.75;
// const SPEAKER_SPEED_ = 0.85;
//export const SPEAKER_SPEED = 0.9;// 0.85;
export const SPEAKER_SPEED = 1.0;// 0.85;

export const moonRocksSound = require('../../assets/cashRegisterSound.mp3');
export const subtractMoonRocksSound = require('../../assets/bellServiceDeskPressXThree.mp3');

import type { TTSVoiceChoice } from '../appflow';

const sharedTTS2Model = require('../../assets/models/model_ex2_rich_hanna_ariana.dm');
const richTTS2Model = require('../../assets/models/model_ex2_rich.dm');
const arianaModel = require('../../assets/models/model_ex_ariana_fast_davoice_phoneme.dm');
const hannaModel = require('../../assets/models/model_ex_hanna_light_davoice_ph.dm');

export function getTTSVoiceConfig(voice: TTSVoiceChoice, useTTS2Only: boolean) {
  if (useTTS2Only) {
    const speeds = {
      Rich: RICH_SPEAKER_SPEED_NEW_MODEL,
      Ariana: ARIANA_SPEAKER_SPEED_NEW_MODEL,
      Hanna: HANNA_SPEAKER_SPEED_NEW_MODEL,
    };
    return { model: sharedTTS2Model, speed: speeds[voice], usesTTS2: true };
  }
  const voices = {
    Rich: { model: richTTS2Model, speed: RICH_SPEAKER_SPEED_NEW_MODEL, usesTTS2: true },
    Ariana: { model: arianaModel, speed: ARIANA_SPEAKER_SPEED, usesTTS2: false },
    Hanna: { model: hannaModel, speed: HANNA_SPEAKER_SPEED, usesTTS2: false },
  };
  return voices[voice];
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
  const introLine =
    `My name is ${selectedSpeakerName}, and I am one of the coaches in the Lunafit app. I love helping people reach their fitness goals.`;
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
