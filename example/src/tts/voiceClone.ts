// Voice cloning: turn a short recording (microphone or an audio file) into a
// voice the TTS model can speak with.
//
// Speech.createVoiceClone(audio, `${CLONED_VOICES_PATH}/<Name>.emd`, voiceEmbedder)
// writes <Name>.emd; Speech.setExternalVoicesPath(CLONED_VOICES_PATH) makes every
// .emd in the folder a selectable voice (Speech.changeVoice(name)), after the
// voices bundled in the model.

import { NativeModules } from 'react-native';
import RNFS from 'react-native-fs';
import Speech from 'react-native-davoice/speech';
import type { VoiceCloneResult } from 'react-native-davoice/speech';
import { voiceEmbedder } from './index';

/**
 * The cloned voices folder: new voices are saved here, and the app looks here
 * for cloned voices. One path for both. Change it to keep voices elsewhere.
 */
export const CLONED_VOICES_PATH = `${RNFS.DocumentDirectoryPath}/cloned_voices`;

/** The microphone recording, before it becomes a voice (replaced each time). */
const RECORDING_PATH = `${RNFS.CachesDirectoryPath}/voice_clone_recording.wav`;

/** How long to record: about 10 seconds of natural speech gives a good voice. */
export const RECOMMENDED_RECORDING_SECONDS = 10;
export const MAX_RECORDING_SECONDS = 30;

/**
 * Voice volume (Speech.createVoiceClone's `volume`), in percent: 100% keeps the
 * recording's loudness, 120% makes the voice 20% louder (volume 1.2), 80% 20%
 * quieter (0.8). The clone screen steps it by VOICE_VOLUME_STEP.
 */
export const DEFAULT_VOICE_VOLUME_PERCENT = 100;
export const MIN_VOICE_VOLUME_PERCENT = 50;
export const MAX_VOICE_VOLUME_PERCENT = 200;
export const VOICE_VOLUME_STEP = 10;

/** A text to read aloud while recording (about 10 seconds). */
export const VOICE_CLONE_READING_TEXT =
  'Hello! This is my voice. I am recording a short sample, so that my assistant can speak just like me. ' +
  'Today is a good day to try something new, and I am happy to hear how it sounds.';

type VoiceRecorderModule = {
  start(path: string): Promise<string>;
  status(): Promise<{ recording: boolean; seconds: number; peak: number }>;
  stop(): Promise<{ path: string; seconds: number }>;
  cancel(): Promise<void>;
  pickAudioFile(): Promise<{ path: string; name: string } | null>;
};

// The app's own native module (android/.../VoiceRecorderModule.kt,
// ios/ExampleApp/VoiceRecorder.m): microphone recording and the file picker.
function recorder(): VoiceRecorderModule {
  const module = NativeModules.VoiceRecorder as VoiceRecorderModule | undefined;
  if (!module) throw new Error('The voice recorder is not available in this build.');
  return module;
}

/**
 * Makes the cloned voices in CLONED_VOICES_PATH selectable. Call after every
 * Speech.initAll() (a reload forgets the folder). Resolves their names.
 */
export async function loadClonedVoices(): Promise<string[]> {
  try {
    if (!(await RNFS.exists(CLONED_VOICES_PATH))) await RNFS.mkdir(CLONED_VOICES_PATH);
    const names = await Speech.setExternalVoicesPath(CLONED_VOICES_PATH);
    console.log('[VoiceClone] cloned voices:', names);
    return names;
  } catch (error) {
    console.warn('[VoiceClone] loading cloned voices failed:', error);
    return [];
  }
}

/**
 * Why `name` can't be a new voice's name, or null when it can. The name is the
 * file name: letters, digits, spaces and dashes; no "_" (that marks a style of
 * a voice, e.g. Kate_whisper); not a bundled voice (the bundled one would win).
 */
export function voiceNameProblem(name: string, bundledVoices: readonly string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name for the new voice.';
  if (trimmed.length > 30) return 'Use at most 30 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(trimmed)) {
    return 'Use letters, digits, spaces and dashes only, starting with a letter or digit.';
  }
  if (bundledVoices.some((voice) => voice.toLowerCase() === trimmed.toLowerCase())) {
    return `"${trimmed}" is a built-in voice. Pick another name.`;
  }
  return null;
}

export async function startVoiceRecording(): Promise<void> {
  await RNFS.unlink(RECORDING_PATH).catch(() => undefined);
  await recorder().start(RECORDING_PATH);
}

export function getVoiceRecordingStatus() {
  return recorder().status();
}

/** Stops the microphone recording; resolves the WAV file and its length. */
export function stopVoiceRecording() {
  return recorder().stop();
}

export async function cancelVoiceRecording(): Promise<void> {
  try {
    await recorder().cancel();
  } catch {
    // nothing was recording
  }
}

/**
 * Lets the user pick an audio file (wav, mp3, m4a, ...). Resolves a local copy
 * the TTS library can read, or null when the user cancels.
 */
export async function pickVoiceAudioFile(): Promise<{ path: string; name: string } | null> {
  return (await recorder().pickAudioFile()) ?? null;
}

/**
 * Creates the voice `name` from `audioPath`, saved in CLONED_VOICES_PATH.
 * `volume`: 1 keeps the recording's loudness, 1.2 is 20% louder, 0.8 20% quieter.
 */
export async function createClonedVoice(audioPath: string, name: string, volume = 1): Promise<VoiceCloneResult> {
  if (!(await RNFS.exists(CLONED_VOICES_PATH))) await RNFS.mkdir(CLONED_VOICES_PATH);
  // Same name (voice names ignore case): the new voice replaces the old one.
  const fileName = `${name.trim()}.emd`.toLowerCase();
  for (const item of await RNFS.readDir(CLONED_VOICES_PATH)) {
    if (item.isFile() && item.name.toLowerCase() === fileName) await RNFS.unlink(item.path);
  }
  // Make sure the folder is the library's external voices folder, so the new
  // voice is selectable right away.
  await Speech.setExternalVoicesPath(CLONED_VOICES_PATH);
  const result = await Speech.createVoiceClone(
    audioPath,
    `${CLONED_VOICES_PATH}/${name.trim()}.emd`,
    voiceEmbedder,
    volume,
  );
  console.log(`[VoiceClone] created "${result.voice}" (volume ${volume})`);
  return result;
}

/**
 * Deletes the cloned voice `name` (its .emd and its styles, <name>_<style>.emd)
 * from CLONED_VOICES_PATH. Resolves the cloned voices that remain.
 */
export async function deleteClonedVoice(name: string): Promise<string[]> {
  const voice = name.trim().toLowerCase();
  if (await RNFS.exists(CLONED_VOICES_PATH)) {
    for (const item of await RNFS.readDir(CLONED_VOICES_PATH)) {
      const file = item.name.toLowerCase();
      if (item.isFile() && (file === `${voice}.emd` || (file.startsWith(`${voice}_`) && file.endsWith('.emd')))) {
        await RNFS.unlink(item.path);
      }
    }
  }
  console.log(`[VoiceClone] deleted "${name}"`);
  return loadClonedVoices();
}
