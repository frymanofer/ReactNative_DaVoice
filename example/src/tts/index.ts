// Below is a part of Speech Feature to play mp3 and WAV file within the same Audio framework.
// You call Speech.playWav with any mp3/wav etc' file you need

export const ARIANA = 0;
export const RICH = 1;

export const SPEAKER = 0;

export const RICH_SPEAKER_SPEED = 1.06;
export const ARIANA_SPEAKER_SPEED = 0.88; //0.75;
// const SPEAKER_SPEED = ARIANA_SPEAKER_SPEED;
//const SPEAKER_SPEED = 0.75;
// const SPEAKER_SPEED_ = 0.85;
export const SPEAKER_SPEED = 1.0;// 0.85;

export const moonRocksSound = require('../../assets/cashRegisterSound.mp3');
export const subtractMoonRocksSound = require('../../assets/bellServiceDeskPressXThree.mp3');

export const ttsModelFast = require('../../assets/models/model_ex_ariana_fast_davoice_phoneme.dm');
export const ttsModelSlow = require('../../assets/models/model_ex_ariana_fast_davoice_phoneme.dm');
// const ttsModelFast = require('./assets/models/model_ex_ariana_fast.dm');
// const ttsModelSlow = require('./assets/models/model_ex_ariana.dm');
export const ttsModelRichFast = require('../../assets/models/model_ex_rich_fast_davoice_phoneme.dm');
export const ttsModelRichSlow = require('../../assets/models/model_ex_rich_fast_davoice_phoneme.dm');
// const ttsModelRichFast = require('./assets/models/model_ex_rich_fast.dm');
// const ttsModelRichSlow = require('./assets/models/model_ex_rich.dm');

// This is how you send the speech library the tts model.
// const ttsModel = require('./assets/models/model_ex.dm');
//const ttsModel = 'model.onnx';

// If you want to use only TTS:
// import { DaVoiceTTSInstance } from 'react-native-davoice';
// let tts = new DaVoiceTTSInstance();
// If you want to use only STT
//import STT from 'react-native-davoice/stt';

export async function playWakewordIntroSpeech({
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
}: any) {
  const speechUiEpoch = beginSpeechUiEpoch();
  await Speech.pauseSpeechRecognition();
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
  console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) after intro speech');
  await Speech.unPauseSpeechRecognition(-1);
  console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) after intro speech');

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
  console.log('[STT_UNPAUSE_TRACE] before Speech.unPauseSpeechRecognition(-1) after waitForNextInteraction');
  await Speech.unPauseSpeechRecognition(-1);
  console.log('[STT_UNPAUSE_TRACE] after Speech.unPauseSpeechRecognition(-1) after waitForNextInteraction');
  await sleep(500);
  clearSpeechSentenceUI(speechUiEpoch);

  return { speechUiEpoch, introLine };
}
