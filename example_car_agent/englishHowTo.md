# DaVoice: AI Car Voice Agent: how-to (React Native)

> **For** developers who run this example, change it, or add its voice features to their own React Native app.
> Paths are relative to `example_car_agent/`. Packages: `react-native-wakeword` 1.1.171, `react-native-davoice` 1.0.142,
> `react-native-davoice-llm` 1.0.20. Last update: 2026-11-22. Brazilian Portuguese: `portugueseHowTo.md`. The Flutter and native
> Android car agents have the same guide (`englishHowTo.md` in each).

The app is a car voice assistant that runs entirely on the phone: **wake word → (optional) speaker verification → speech to text
(STT) → the DaVoice Automotive Agent (a 0.6B language model on the phone) → an action on a simulated car → text to speech (TTS)**.
Nothing you say leaves the phone. The car is simulated; the app does not control a real vehicle.

- **Part A** — use the app and change it.
- **Part B** — add each capability to **your own** app: the wake word, speaker-verification onboarding, STT and TTS, speaker
  verification with STT and the wake word, and a complete voice-to-voice flow. Each step has code you can copy.

| Package | What for |
|---|---|
| `react-native-wakeword` | wake word, speaker verification (enrollment and live checking) |
| `react-native-davoice` | STT and TTS (`Speech`), voices, voice cloning, which speaker said each sentence |
| `react-native-davoice-llm` | the on-device model and `Agent` (only for the car agent itself; Part B does not need it) |
| `react-native-fs` | files: the voice signature, downloaded voices and models |

---

# Part A — Use and change this app

## A1. Run it

```bash
cd example_car_agent
npm install
cd ios && pod install && cd ..
npx react-native run-android        # or: npx react-native run-ios
```

- Debug builds load JavaScript from Metro (`npx react-native start`; Android on USB: `adb reverse tcp:8081 tcp:8081`). Code
  changes need only a reload (`r` in Metro). **Changes to bundled files** (wake-word models, the STT hint lists, native code) need a
  rebuild and reinstall.
- Release build (Android): `cd android && ./gradlew :app:assembleRelease` (store bundle: `bundleRelease`).
- Logs (Android): `adb logcat | grep ReactNativeJS`; the agent's own log: `adb logcat | grep DavoiceChat`.
- The DaVoice license keys in this example are demo keys. For your own app, ask info@davoice.io.

## A2. Startup flow

1. **Language** (11 languages). Its voice downloads the first time (136–170 MB).
2. **Microphone permission.**
3. **Voice.** A built-in voice, a voice you cloned earlier, or clone a new one.
4. **Speaker verification** (A4): create a voice signature, use the saved one, or skip.
5. **Wake word.** Say **"Hey DaVoice"**. (Debug builds: the dev button does the same.) The model downloads in the background
   (382 MB the first time, plus a 430 MB pre-warmed state, so the first answer is fast).
6. **The car screen.** With the default settings, every request starts with "Hey DaVoice" (A3). The line at the bottom always says
   what to do: **"Say “Hey DaVoice” before each request"** while waiting, **"Listening… say your request"** after the wake word.

**Back** returns to the wake-word screen. **Reset** starts a new conversation and resets the car.

## A3. Settings (the gear)

The gear is on every screen (top right; on the car screen, in the top bar). Changes are a draft until you tap **Save**; **Cancel**
or a tap outside drops them. Saved settings stay on the phone.

| Setting | Choices | What it does |
|---|---|---|
| **Turns** | **Take turns** (default) / Interrupt | Take turns: listening pauses while the agent answers. Interrupt: you can talk over the agent; it uses echo cancellation (experimental on Android). |
| **Start each request with** | **Wake word** / Just talk | Wake word: say "Hey DaVoice" before each request. Just talk: no wake word after the first one. |
| End of speech | 1–3 s (2 s) | Silence that ends your request. |
| Listen after the wake word | 4–15 s (8 s) | How long it waits for your request after "Hey DaVoice". |
| Follow-up without the wake word | Off, 5–30 s (8 s) | **Only after the agent asks a question** ("Which window?"): how long it waits for your answer without the wake word. |
| Pre-fetch | Off, 0.5–3 s (2 s) | Keeps the audio from just before listening started, so "Hey DaVoice, open the window" said in one breath is not cut. The wake phrase itself never reaches the model. |
| Wake word stops the agent | **Off** / On | On: saying "Hey DaVoice" while the agent talks stops it and you can speak. |
| Stop listening after (Just talk) | Never, 15 s–2 min | After this much silence it waits for the wake word or a tap. |
| Model, Local confidence (car screen) | — | The on-device model, and the confidence below which a command does not run (A6). |

## A4. Speaker verification

The app records a **voice signature** of the owner: you read 5 short sentences aloud (`SV_ONBOARDING_SAMPLE_COUNT` in
`src/appflow.ts`). It is saved to `Documents/sv_enrollment.json` and switched on **live** in the wake word and in STT, so:

- the wake word answers only the enrolled voice;
- every STT result says who spoke (`speakerIds`, `speakerId`);
- **doors**: `open_door` and `unlock_car` run only when the owner's voice was verified in that request
  (`src/speaker_verification/currentSpeaker.ts`, `src/agent/LocalAgent.ts`).

If a sample is not heard (each may take up to 60 s), the screen comes back with a notice; you can try again or skip.

## A5. What to say

- **Windows:** "open the windows", "close the rear right window", "open the passenger window halfway".
- **Climate:** "set the temperature to 22", "two degrees warmer", "20 for the driver and 23 for the passenger", "fan to three".
- **Seats, doors, media, navigation:** "turn on my seat heating", "lock the car", "turn the volume up", "take me home".
- **Two commands at once:** "close the windows and lock the car". **Undo:** "undo that".
- **Follow-ups:** after "open the driver's window": "now the passenger one". **Incomplete:** "open a window" → "Which window?"
  (answer without the wake word: it was a question).
- Brazilian Portuguese works the same: "abre os vidros", "fecha eles", "coloca vinte e dois".

## A6. How a request works (the car agent)

1. **Scope.** Only plain car commands reach the model; general questions get a short answer (`general_questions.config.ts`),
   unclear speech is asked again, background speech is ignored.
2. **The model** writes a tool call (for example `set_window {"window": "all", "position": "open"}`).
3. **Local confidence** (if on): a call the model is not sure enough of never runs.
4. **Checks.** Every call is checked against your own words before it runs (wrong object, on/off flips, numbers you never said).
5. **The car** runs the action and the reply is spoken (`src/car/carTools.ts`).

The model's status: a test checkpoint. On 128 sentences it never saw, 86% of car commands ended in exactly the right action and 2
turns ran a wrong one; it is a preview of the pipeline, not final accuracy.

## A7. Common changes

| To change | Where |
|---|---|
| **The wake word** | `modelName` in `src/wakeword/index.ts`. Bundled: `hey_davoice_model_28_06042026.dm` (default), `hello_davoice_model_28_17082026.dm`, `hey_coach_model_28_22012026b.dm`. A new model goes in `assets/models/` **and** `android/app/src/main/assets/` **and** the iOS project (Copy Bundle Resources). Sensitivity: `threshold` / `bufferCnt` in `instanceConfigs`. Add its sound-alikes to `SOUNDS_LIKE` in `src/conversation/wakePhrase.ts` (see B5.4). |
| Conversation defaults | `DEFAULT_CONVERSATION_SETTINGS` in `src/conversation/settings.ts` |
| Words STT should prefer | `assets/stt_bias_conf/words_flattened.txt` (and `.pt-BR.txt`): one phrase per line, ending with a comma. Rebuild. |
| Audio routing (iOS route, ducking, echo cancellation) | `defaultAudioRoutingConfig` in `src/wakeword/index.ts` |
| Languages and voices | `language_packs.json`; voices and speeds in `src/tts/index.ts` |
| Speaker verification | sample count and threshold in `src/appflow.ts`; sentences in `src/speaker_verification/enrollmentSentences.ts` |
| What the car does and says | `src/car/carTools.ts`. Keep `src/car/carToolDefinitions.h3d.json` as is: it is the wording the model was trained with. |
| The agent's persona and messages | `agent_automotive/agent.json` (`pt-BR/` for Portuguese) |
| General questions | `general_questions.config.ts` |
| The model list | `src/local_llm/constants.ts` |

## A8. Where the code is

| Part | Files |
|---|---|
| Startup flow, screens | `App.tsx`, `src/redesign/` |
| Wake word, audio routing | `src/wakeword/index.ts` |
| Speaker verification | `src/speaker_verification/` |
| STT, TTS, voices, language packs | `src/stt/index.ts`, `src/tts/`, `src/initialization/index.ts` |
| **Conversation modes** (who listens when) | `src/conversation/` (pure TypeScript, no app dependencies) |
| The agent, the model | `src/agent/`, `src/aichat/`, `src/local_llm/`, `agent_automotive/` |
| The simulated car | `src/car/` |

---

# Part B — Add these capabilities to your own React Native app

Each section stands on its own: take only what you need. B5 puts everything together into a complete voice-to-voice flow.

## B0. Setup (once)

**1. Install**

```bash
npm install react-native-wakeword@1.1.171 react-native-davoice@1.0.142 react-native-fs
cd ios && pod install && cd ..
```

**2. Android: the packages' native libraries.** In `android/build.gradle`:

```gradle
allprojects {
  repositories {
    maven { url "${project(":react-native-wakeword").projectDir}/libs" }
    maven { url "${project(":react-native-davoice").projectDir}/libs" }
  }
}
```

**3. Permissions.**
- Android: `RECORD_AUDIO` (ask at run time before starting anything; `PermissionsAndroid.request`).
- iOS `Info.plist`: `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`. To keep listening in the background,
  also `UIBackgroundModes` → `audio`.

**4. Model files.**

| File | Where |
|---|---|
| Wake word (e.g. `hey_davoice_model_28_06042026.dm`), speaker verification (`sv.dm`) | Android: `android/app/src/main/assets/`. iOS: add to the Xcode project (Copy Bundle Resources). You refer to them by file name. |
| TTS voice model (e.g. a `model_ex2_*.dm`) | `require('./assets/models/<file>.dm')`, or a file path if you download it. Add `'dm'` to Metro's `resolver.assetExts` (see `metro.config.js`). |

**5. Licenses.** One key for the wake word (`setKeywordDetectionLicense`), one for speech (`Speech.setLicense`). Ask info@davoice.io.

### The rules that make it work

These come from production apps. Most voice bugs are a broken rule.

1. **Pauses are gentle; the microphone keeps running.** Use only:
   - STT: `Speech.pauseSpeechRecognition()` / `Speech.unPauseSpeechRecognition(-1, preFetchMs, timeoutMs)`;
   - wake word: `pauseDetection(false)` / `unPauseDetection()`.

   **Never** use `Speech.stop()` or `Speech.cancel()` to end a turn: on Android the recognizer restarts by itself and keeps
   transcribing.
2. **One listener decides at a time.** While STT listens, the wake word is paused, unless you use it as a stop word (B5.6). While
   the wake word listens, STT is paused.
3. **Release the microphone (`pauseDetection(true)` on Android) only for another recorder**: speaker-verification enrollment,
   voice-clone recording. Take it back afterwards with `unPauseDetection()`.
4. **The audio routing comes first**: set the same routing config on the wake word and on `Speech` **before** creating the wake
   word and before `Speech.initAll`.
5. **Start-up order:** wake word created and started → paused → `Speech.initAll` → STT paused → wake word unpaused.
6. **Pre-fetch only after the wake word** (2000 ms keeps "Hey DaVoice, open the window" said in one breath), then **strip the wake
   phrase** before using the text (B5.4). After a reply, a tap or a stop word: pre-fetch **0** (otherwise the agent's own voice or
   the stop phrase is replayed into the new turn).
7. **Ignore what is heard when it is not the user's turn**: while waiting for the wake word, while thinking, while the agent
   speaks (unless interrupting is on). Late callbacks happen.
8. **Speaker verification is switched on and off live** (`addSpeaker` / `setSpeakers([])`): no restart of the wake word or STT.

## B1. Wake word

```ts
import { createKeyWordRNBridgeInstance, setWakewordAudioRoutingConfig } from 'react-native-wakeword';

const MODEL = 'hey_davoice_model_28_06042026.dm';        // in the native bundle (B0.4)

export async function createWakeWord(onWakeWord: (keyword: string) => void) {
  await setWakewordAudioRoutingConfig(audioRoutingConfig);        // rule 4 (B3 shows the config)
  const ww = await createKeyWordRNBridgeInstance('wakeword', false);
  await ww.createInstanceMulti([MODEL], [0.999], [3], [1000]);    // models, thresholds, buffer counts, ms between callbacks
  ww.onKeywordDetectionEvent((keyword: string) => onWakeWord(keyword));   // e.g. "Hey Davoice Model 28 06042026"
  if (!(await ww.setKeywordDetectionLicense(WAKEWORD_LICENSE))) throw new Error('wake word license');
  await ww.startKeywordDetection(0.999, true);
  return ww;
}
```

- **Pause / resume** (rule 1): `await ww.pauseDetection(false)` / `await ww.unPauseDetection()`.
- **Sensitivity:** threshold (0–1, higher = fewer false triggers) and buffer count (consecutive frames needed). This app uses
  0.999 / 3.
- **Shut down:** `await ww.stopKeywordDetection(); await ww.destroyInstance();` and remove the subscription.
- **The phrase to show the user:** the model's file name without `_model…` (`formatWakeWord` in `src/wakeword/index.ts` →
  "Hey DaVoice").
- **Wake word alone** (no STT): this is all you need; call your action in `onWakeWord`.

## B2. Speaker-verification onboarding (the voice signature)

The user reads a few sentences; the result is an **enrollment JSON** you save and enroll later (B4). Copy
`src/speaker_verification/onboarding.ts` (`runSpeakerVerifyEnrollment`), or use this core:

```ts
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import {
  createSpeakerVerificationMicController, onSpeakerVerificationOnboardingProgress,
  onSpeakerVerificationOnboardingDone, onSpeakerVerificationError,
} from 'react-native-wakeword';

export async function recordVoiceSignature(samples = 5, onProgress?: (collected: number) => void): Promise<string> {
  const ctrl = await createSpeakerVerificationMicController('svMic');
  const subs: Array<() => void> = [];
  try {
    await ctrl.create(JSON.stringify({
      modelPath: 'sv.dm',
      options: { decisionThreshold: Platform.OS === 'android' ? 0.34 : 0.35, tailSeconds: 2.0, frameSize: 1280,
                 maxTailSeconds: 3.0, cmn: true, expectedLayoutBDT: false },
    }));
    let collected = 0;
    let json: string | null = null;
    const done = new Promise<void>((resolve, reject) => {
      subs.push(onSpeakerVerificationOnboardingDone((e: any) => {
        if (e?.controllerId !== 'svMic') return;
        json = e.enrollmentJson ?? e.enrollment ?? e.json ?? null;
        resolve();
      }));
      subs.push(onSpeakerVerificationError((e: any) => e?.controllerId === 'svMic' && reject(new Error(String(e?.error)))));
    });
    await ctrl.beginOnboarding('davoice', samples, true);
    for (let i = 0; i < samples && !json; i++) {
      // show sentence i on screen, then wait for that sample (allow up to 60 s: people read slowly)
      const sample = new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('no sample')), 60000);
        const off = onSpeakerVerificationOnboardingProgress((e: any) => {
          if (e?.controllerId !== 'svMic' || Number(e?.collected) <= collected) return;
          collected = Number(e.collected); clearTimeout(t); off(); onProgress?.(collected); resolve();
        });
      });
      await ctrl.getNextEmbeddingFromMic();
      await Promise.race([sample, done]);
    }
    await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('no profile')), 30000))]);
    if (!json || (json as string).length < 10) throw new Error('empty enrollment');
    const path = `${RNFS.DocumentDirectoryPath}/sv_enrollment.json`;
    await RNFS.writeFile(path, json, 'utf8');
    return path;
  } finally {
    subs.forEach((off) => off());
    await ctrl.destroy();            // always: an open controller keeps recording and fights the wake word and STT
  }
}
```

**Around the recording** (rules 1–3): STT paused, and the wake word gives the microphone to the recorder:

```ts
await Speech.pauseSpeechRecognition();
await ww.pauseDetection(Platform.OS === 'android');   // Android: release the microphone for the recorder
try {
  enrollmentPath = await recordVoiceSignature(5, setProgress);
} catch {
  // show the choice again with a notice ("Try again in a quiet place, or skip"), never "restart the app"
} finally {
  await ww.unPauseDetection();
}
```

- Show one sentence per sample. Natural sentences that include the wake phrase work best (`enrollmentSentences.ts`).
- Next start: if `sv_enrollment.json` exists, offer "Use my saved voice signature" instead of recording again.

## B3. STT and TTS

**Start-up** (rules 4 and 5, after the wake word of B1 was created and started):

```ts
import Speech from 'react-native-davoice/speech';

export const audioRoutingConfig = { /* copy defaultAudioRoutingConfig from src/wakeword/index.ts (iOS routes, ducking) */ };

await Speech.setAudioRoutingConfig(audioRoutingConfig);
if (!(await Speech.setLicense(SPEECH_LICENSE))) throw new Error('speech license');
await ww.pauseDetection(false);
await Speech.initAll({ locale: 'en-US', model: require('./assets/models/<your voice model>.dm') });   // or a downloaded file's path
await Speech.pauseSpeechRecognition();       // STT starts paused; the wake word decides when it opens
await ww.unPauseDetection();
```

**Listen and get the text**

```ts
await Speech.unPauseSpeechRecognition(-1, preFetchMs, 2500);   // -1: until paused; preFetchMs: see rule 6
Speech.onSpeechPartialResults = (e) => onHeard(e.value?.[0] ?? '');
Speech.onSpeechResults = (e) => onHeard(e.value?.[0] ?? '');
// ... when the user stopped talking (B5.3):
await Speech.pauseSpeechRecognition();
```

- **End of speech** is yours to decide: restart a timer on every partial result; when it runs out (2 s), the request is complete.
- **Android:** results come in segments (the recognizer restarts between phrases). Merge each new segment with the text so far
  (`mergeSmartKeepPunct` in `src/stt/index.ts`), and ignore partial results for ~400 ms after an unpause (they belong to before).
- **Hint words:** STT prefers the phrases in `words_flattened.txt` (Android assets / iOS bundle; see this app). Put your wake
  phrase and domain words there.

**Speak**

```ts
await Speech.changeVoice('Rich');            // a voice of the loaded model (Speech.getAllVoices())
Speech.onFinishedSpeaking = () => { /* everything queued has been spoken: the next turn (B5) */ };
await Speech.speak('I opened the driver window.', 0, 1.0);   // text, speaker id, speed; sentences queue up
await Speech.stopSpeaking();                 // stop now (interrupt / stop word)
```

- Speak long replies sentence by sentence as they arrive: the first sentence starts sooner.
- Don't rewrite numbers or names for speech; the TTS library does it.

## B4. Speaker verification with STT and the wake word

Switch it on **live** (rule 8), with the JSON path from B2:

```ts
const OWNER = 'owner';
await ww.addSpeaker(OWNER, enrollmentPath);       // the wake word answers only this voice
await Speech.addSpeaker(OWNER, enrollmentPath);   // STT results say who spoke
// off:
await ww.setSpeakers([]);
await Speech.setSpeakers([]);
```

(At start-up you can also pass it to `Speech.initAll({ ..., onboardingJsonPath: enrollmentPath, speakerId: OWNER })`.)

**Using it:** every STT result carries `speakerIds` / `speakerId` (only while verification is on). Collect them per request and
check before a sensitive action:

```ts
let heard = new Set<string>();
const note = (e: { speakerIds?: string[]; speakerId?: string }) => {
  (e.speakerIds ?? []).forEach((id) => heard.add(id));
  if (e.speakerId) heard.add(e.speakerId);
};
// in onSpeechPartialResults / onSpeechResults: note(e)
const ownerMayAct = () => heard.has(OWNER);       // e.g. unlock the doors only if true
// after each request: heard = new Set()
```

This is `src/speaker_verification/currentSpeaker.ts`.

## B5. A complete voice-to-voice flow in your app

### B5.1 Copy

| Copy | Why |
|---|---|
| `src/conversation/controller.ts`, `bargeIn.ts`, `settings.ts`, `wakePhrase.ts`, `hint.ts` | the turn logic: who listens when. Pure TypeScript, no dependencies; the same logic and test cases as the Flutter and Android apps. |
| `src/conversation/ConversationSettingsPanel.tsx`, `ConversationBar.tsx`, `store.ts` (optional) | the settings UI (draft + Save) and saving them |
| B1, B3 (and B2, B4 for speaker verification) | the engines |

### B5.2 The turns

| Phase | STT | Wake word | Leaves the phase when |
|---|---|---|---|
| **asleep** (wake-word mode) | paused | listening | the wake word → listening (pre-fetch 2 s) |
| **listening** | listening | paused | silence after speech → busy; nothing said for the listen window → asleep |
| **busy** (thinking, then speaking) | paused (interrupt mode: open under the voice) | paused (stop word on: listening while it speaks) | the reply was spoken → a question: listening (pre-fetch 0); otherwise → asleep |

In **just talk** mode there is no asleep phase between requests: after a reply, listening again.

### B5.3 Wire it

```ts
import { Platform } from 'react-native';
import Speech from 'react-native-davoice/speech';
import { ConversationController } from './conversation/controller';
import { DEFAULT_CONVERSATION_SETTINGS, endOfSpeechMs, type ConversationSettings } from './conversation/settings';
import { dropWakePhrase } from './conversation/wakePhrase';
import { conversationHint } from './conversation/hint';
import { mergeSmartKeepPunct } from './stt/merge';   // copy mergeSmartKeepPunct from src/stt/index.ts (Android segments)

const WAKE_PHRASE = 'Hey DaVoice';
let settings: ConversationSettings = DEFAULT_CONVERSATION_SETTINGS;
let transcript = '';
let silence: ReturnType<typeof setTimeout> | null = null;
let ignoreUntil = 0;           // Android: partial results right after an unpause
let fromWakeWord = false;      // this turn was opened by the wake word: strip the phrase (B5.4)
let spoken = '';               // what the agent said this turn (echo check, question check)

const conversation = new ConversationController(
  {
    openMic: async (preFetchMs) => {
      transcript = '';
      ignoreUntil = Date.now() + 400;
      await Speech.unPauseSpeechRecognition(-1, preFetchMs, 2500);
    },
    closeMic: async () => {
      if (silence) clearTimeout(silence);
      transcript = '';
      await Speech.pauseSpeechRecognition();            // gentle (rule 1)
    },
    armWakeWord: () => ww.unPauseDetection(),
    disarmWakeWord: () => ww.pauseDetection(false),
    stopReply: async () => { cancelYourAgent(); await Speech.stopSpeaking(); },
    onPhase: (phase) => showLine(conversationHint(phase, WAKE_PHRASE, settings.wakeWord)),  // "Say “Hey DaVoice” before each request"
  },
  settings,
);

// The conversation screen opens. Wake-word mode: it starts asleep (the wake word that opened the screen is not a request).
export async function startConversation() {
  if (!settings.wakeWord) await Speech.unPauseSpeechRecognition(-1, 0, 2500);
  conversation.enter();
}

// B1's callback
function onWakeWord() {
  fromWakeWord = true;
  conversation.wakeWord();       // asleep → listening (pre-fetch); while the agent speaks → stop word (if on); otherwise ignored
}

// B3's results
function onHeard(text: string) {
  text = text.trim();
  if (!text) return;
  if (Platform.OS === 'android' && Date.now() < ignoreUntil) return;
  if (conversation.phase === 'asleep' || conversation.phase === 'off') return;      // rule 7
  if (conversation.phase === 'busy' && !conversation.heardWhileBusy(text, spoken)) return;  // interrupt mode only
  conversation.userSpeech();
  transcript = Platform.OS === 'android' ? mergeSmartKeepPunct(transcript, text, 2) : text;
  if (silence) clearTimeout(silence);
  silence = setTimeout(endOfRequest, endOfSpeechMs(settings));
}

async function endOfRequest() {
  let text = transcript.trim();
  if (fromWakeWord && settings.wakeWord) {
    text = dropWakePhrase(text, WAKE_PHRASE);
    if (!text) return;           // only "Hey DaVoice" so far: wait for the request
  }
  fromWakeWord = false;
  transcript = '';
  await Speech.pauseSpeechRecognition();
  conversation.turnStarted();    // busy
  spoken = '';
  const reply = await yourAgent(text);        // your model, server or rules
  conversation.replySpeaking();  // interrupt mode opens STT under the voice; stop word on: the wake word listens
  spoken = reply;
  await Speech.speak(reply, 0, 1.0);
}

Speech.onFinishedSpeaking = () => conversation.replyFinished(spoken);   // a question → listening; otherwise → asleep

// Settings changed (Save): conversation.update(next) puts it to sleep at once when you switch to the wake word, and opens
// listening when you switch to just talk while asleep.
export function applySettings(next: ConversationSettings) {
  settings = next;
  conversation.update(next);
}

// A tap on the line: wakes it, or stops the agent and listens.
export const tapToTalk = () => conversation.tapToTalk();
// Leaving the screen: conversation.leave()  (the wake word listens again)
```

### B5.4 Pre-fetch and the wake phrase

With pre-fetch, the transcript usually starts with the wake phrase. `dropWakePhrase(text, phrase)` removes it before the text goes
anywhere: "Hey DaVoice, open the window" → "open the window". It also removes:

- the end of the phrase alone: "DaVoice, …", "The voice, …", "Voice …";
- the way STT writes it: "Hey the voice", "Hey da voice", "Hey devoice", "Hi DaVoice";
- the phrase said twice;
- only the phrase ("Hey DaVoice.", "Hey") → `''`: wait for the request.

Words are compared whole ("Voicemail please" stays). For **your** wake phrase, add its sound-alikes to `SOUNDS_LIKE` in
`wakePhrase.ts` (each word → the word sequences STT writes for it), and put the phrase in the STT hint list (B3) so STT writes it
consistently. Strip it also from any text you process early (for example a model's prefill of partial results).

### B5.5 After the reply

- **Wake-word mode:** STT reopens (pause, then unpause with pre-fetch 0) **only if the reply asks a question** (`isQuestion` in
  `controller.ts`: it ends with "?"), for the follow-up window. Otherwise STT stays paused and the wake word listens.
- **Just talk:** STT reopens after every reply.

### B5.6 Stop word and interrupting

- **Stop word** (`wakeWordMode.stopWord`, default off): the wake word listens while the agent speaks; "Hey DaVoice" stops the reply
  (`stopReply`) and opens a fresh turn with pre-fetch 0. Ignore the wake word while the agent is still thinking.
- **Interrupt** (`interrupt`): STT stays open under the agent's voice. Words the agent is not saying stop it; words it is saying
  are its own echo (`bargeIn.ts`). It needs echo cancellation: on iOS, `routingConfigForConversation(audioRoutingConfig, settings)`
  adds `AEC: { mode: 'always' }` to the routing (set it on the wake word and `Speech` again); on Android, `Speech.setAECEnabled(true)`
  where supported. Experimental on Android.

### B5.7 Checklist

- [ ] Routing config set on both engines before they start; start-up order as in B3.
- [ ] Only gentle pauses; no `Speech.stop()` / `cancel()` in the flow.
- [ ] Wake-word mode starts asleep; the screen shows "Say “…” before each request".
- [ ] Pre-fetch only after the wake word; the wake phrase is stripped; "only the phrase" waits.
- [ ] Nothing heard while asleep or busy reaches your agent (unless interrupting).
- [ ] After a reply: a question → listening; otherwise → the wake word.
- [ ] Speaker verification: enrollment releases the microphone and always destroys its controller; switching it on is live.
- [ ] Test on a phone with the logs: every phase change is logged as `[Conversation] <phase>`.

### B5.8 Troubleshooting

| Symptom | Cause |
|---|---|
| It answers without the wake word | STT opened when the screen opened (rule 6), or a speech result while asleep was not ignored (rule 7), or `Speech.stop()` was used instead of a pause (rule 1). |
| The request starts with "Hey DaVoice" / "the voice" | The turn was not marked as opened by the wake word, or the phrase's sound-alikes are missing (B5.4). |
| The agent answers its own voice | Interrupting without echo cancellation, or pre-fetch > 0 after a reply. |
| Voice signature: "no sample" | The wake word still holds the microphone (B2: `pauseDetection(true)` on Android), or a noisy room. |
| The first request after the wake word is cut | Pre-fetch off, or the end-of-speech timer too short. |

---

## Quick test checklist (this app)

1. Fresh install → Brazilian Portuguese → pick a voice → skip speaker verification.
2. "Hey DaVoice" → the car screen opens; the line says "Say “Hey DaVoice” before each request".
3. "Hey DaVoice, abre os vidros" (one breath) → windows open; "Hey DaVoice, fecha eles" → closed; "Hey DaVoice, desfaz" → back.
4. "Hey DaVoice, abre um vidro" → "Which window?" → answer without the wake word.
5. Gear → Just talk → Save → talk without the wake word.
6. Back → wake-word screen → "Hey DaVoice" → the car screen again.
