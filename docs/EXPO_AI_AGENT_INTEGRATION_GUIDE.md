# Expo integration guide (for AI coding agents and developers)

This guide is for an AI coding agent (or a developer) working with the **Expo**
version of the DaVoice example: the `expo/` folder of this repository. It covers
three jobs:

1. [Run the `expo/` app](#part-a-run-the-expo-app) on your phone.
2. [Build it on EAS](#part-b-build-on-eas) (Expo's cloud build service).
3. [Add DaVoice capabilities to a different Expo app](#part-c-add-davoice-to-your-own-expo-app),
   one capability at a time, including on a different Expo SDK version.

The capabilities:

| Capability | Package | What it does |
|---|---|---|
| Wake word | `react-native-wakeword` | Always-on detection of a phrase ("Hey Coach") |
| Speaker verification | `react-native-wakeword` | Enroll a user's voice; wake word and speech recognition react only to that voice |
| Speech to text (STT) | `react-native-davoice` (`react-native-davoice/speech`) | Live on-device transcription with partial results |
| Text to speech (TTS) | `react-native-davoice` (`react-native-davoice/speech`) | On-device neural voices |
| Voice cloning | `react-native-davoice` + a small native module from `expo/plugins/` | Create a new TTS voice from a short recording |
| Local AI chat | `react-native-davoice-llm` | On-device LLM and agent: web search, tools, memory |

For the same capabilities in a **bare React Native** app (no Expo), read
[AI_AGENT_INTEGRATION_GUIDE.md](./AI_AGENT_INTEGRATION_GUIDE.md). That guide
has more detail on the runtime APIs; this one focuses on everything Expo-specific
and repeats the API essentials so you can work from this file alone.

---

## 0. Rules before you start

1. **Expo Go does not work.** All DaVoice packages contain native code. You need
   a development build (`expo-dev-client`) or an EAS build. Every native change
   needs `npx expo prebuild --clean` and a new build.
2. **Use only git-tracked files as reference.** Run `git ls-files expo`. Ignore
   anything untracked: notes, logs, backups, `old/`, `x`.
3. **Never copy secrets or license keys.** `expo/App.tsx` and
   `expo/licensekey.txt` contain a time-limited *demo* license. Never copy it
   into another app; put a placeholder there and tell the user to get their own
   key from DaVoice (`info@davoice.io`). API keys (Gemini, Tavily, Brave, USDA,
   MCP tokens) go in the git-ignored `local.config.ts`. EAS credentials go in the
   git-ignored `.eas.env`. Never commit either.
4. **Test on real devices.** Wake word, speaker verification, STT and the local
   LLM need a real microphone and real memory. Simulators are for UI only.
5. **Add one capability at a time and build after each.** Native setup errors
   are much easier to find that way.
6. **Use the versions in `expo/package.json`.** The DaVoice packages ship native
   binaries; the versions listed there are tested together.

---

## 1. What is in the `expo/` folder

| Path | What it is |
|---|---|
| `App.tsx` | The whole demo app: screens, prompts, and the order of calls between features. About 4,000 lines. Search it; don't read it top to bottom |
| `src/` | The feature modules (same code as `../example/src`, except `src/tts/index.ts`) |
| `app.config.js` | Expo config: identifiers, iOS permission texts, background audio, the memory entitlement, and the config plugins |
| `local.expo.config.example.js` | Template for your own identifiers, Apple team and EAS project (copy to the git-ignored `local.expo.config.js`) |
| `local.config.example.ts` | Template for your own API keys (copied to the git-ignored `local.config.ts` on `npm install`) |
| `plugins/withDaVoiceNativeAssets.js` | Config plugin: adds the DaVoice Maven repositories, copies models and files that native code loads **by file name** into the app |
| `plugins/withVoiceRecorder.js` + `plugins/voice-recorder/` | Config plugin: adds the app's own `VoiceRecorder` native module (microphone recording and audio-file picker for voice cloning) |
| `assets/models/local/` | Models loaded by file name: `model_ex2_rich_kate.dm` (TTS, all voices), `hey_coach_model_28_22012026b.dm` (wake word), `sv.dm` (speaker verification) |
| `assets/models/embedder_en.dm` | Voice encoder for voice cloning, loaded with `require()` |
| `assets/stt_bias_conf/words_flattened.txt` | Words the speech recognizer is biased toward, read by file name |
| `agent/` | The on-device agent's pack: persona, prompts, routing, skills (JSON data) |
| `metro.config.js` | Lets Metro bundle `.dm`, `.onnx`, `.wav`, `.mp3` files |
| `patches/react-native-fs+2.20.0.patch` | Fixes an Android crash in `react-native-fs` on failed downloads (applied by `patch-package`) |
| `eas.json` | EAS build profiles |
| `.easignore` | What EAS uploads (replaces `.gitignore` for EAS) |
| `scripts/eas-build.sh` | Builds this folder on EAS with the credentials in `.eas.env` |
| `scripts/ensure-lfs.js`, `scripts/ensure-local-config.js` | Run on `postinstall`: check models are real files, create `local.config.ts` |

`src/` map:

| Module | Capability |
|---|---|
| `src/wakeword/index.ts` | Wake word: model config, instance, listener, start/pause/resume, the iOS audio-routing config, the startup sequence |
| `src/speaker_verification/onboarding.ts`, `verification.ts` | Speaker enrollment, saving/loading the enrollment, live verification |
| `src/initialization/index.ts` | Mic permission, `Speech.initAll` with a timeout |
| `src/stt/index.ts` | STT event handlers, merging partial transcripts |
| `src/tts/index.ts` | TTS model and voice selection, speeds, the voice-cloning encoder |
| `src/tts/voiceClone.ts` | Voice cloning: recording, file picking, creating and deleting cloned voices |
| `src/agent/`, `src/local_llm/`, `src/aichat/` | Local AI chat: model download/load, the agent, streaming replies into speech |
| `src/appflow.ts` | Shared types and tuning constants (speaker-verification thresholds and sample count) |

**Tested with:** Expo SDK 56, React Native 0.85, React 19.2,
`react-native-davoice` 1.0.132, `react-native-davoice-llm` 1.0.7,
`react-native-wakeword` 1.1.169. For other SDKs, see
[§C.10](#c10-using-a-different-expo-sdk-version).

---

## Part A: Run the `expo/` app

### A.1 Prerequisites

- Node 18 or newer, Git with **Git LFS** (`git lfs install`). The models are LFS
  files; without LFS they are tiny pointer files and nothing works.
- Android: Android Studio with an SDK and a phone with USB debugging.
- iOS: a Mac with Xcode, CocoaPods, and an Apple ID (a free personal team is
  enough for your own iPhone).

### A.2 Install

```bash
git lfs pull                 # the real model files
cd expo
npm install                  # also: applies patches, checks LFS, creates local.config.ts
```

If `postinstall` reports LFS pointers, run `git lfs pull` and `npm install` again.

### A.3 Your identifiers (and Apple team)

```bash
cp local.expo.config.example.js local.expo.config.js
```

Edit `local.expo.config.js`:

```js
module.exports = {
  name: 'MyVoiceDemo',
  slug: 'myvoicedemo',
  displayName: 'MyVoiceDemo',
  androidPackage: 'com.yourcompany.myvoicedemo',
  iosBundleIdentifier: 'com.yourcompany.myvoicedemo',
  appleTeamId: 'ABCDE12345',        // optional: your Apple team (Xcode signs with it)
  // easProjectId and easOwner: see Part B
};
```

- The file is git-ignored. Without it, `app.config.js` uses its defaults.
- **The DaVoice license is tied to the package name / bundle id.** The demo key
  works for the example identifiers; for your own identifiers, get a key from
  DaVoice.
- After any change to this file, run `npx expo prebuild --clean` again.

### A.4 Your API keys (optional)

`local.config.ts` (created on `npm install`) holds optional keys:

- `GEMINI_API_KEY`, for the "AI Chat (Gemini)" mode.
- For Local AI chat (all optional): a web-search engine (`wikipedia` needs no
  key; `tavily` or `brave` need one) and `USDA_API_KEY` for the calorie
  tracker's food lookup.

### A.5 Prebuild and run

```bash
npx expo prebuild --clean
npx expo run:android --device        # pick your phone
npx expo run:ios --device
```

`prebuild` generates `android/` and `ios/` and runs the config plugins. Never
edit those folders by hand; they are regenerated (and git-ignored).

Check that the models landed in the native projects:

```bash
ls android/app/src/main/assets/        # model_ex2_rich_kate.dm, hey_coach_...dm, sv.dm, words_flattened.txt
find ios -path '*/DaVoiceModels/*' -type f
```

For a fast, realistic test, use a release build: `npx expo run:android
--variant release` / `npx expo run:ios --configuration Release`. Debug builds
are much slower, especially with the on-device LLM.

### A.6 Using the app

On first launch the app narrates its setup:

1. **Voice:** pick a built-in voice, or **Clone a new Voice** (record about 10
   seconds or upload a recording; adjust the voice volume; listen; use it).
2. **Speaker verification:** skip, create a new voice signature, or reuse a saved
   one (see [§C.5](#c5-speaker-verification) for the best onboarding sentences).
3. **Mode:** wake word only, speech recognition, Gemini AI chat, or **Local AI
   Chat** (on-device). Local AI Chat downloads a model the first time (about
   1 GB for the default model); the app tells you the progress.
4. Say **"Hey Coach"**, then talk. In Local AI Chat, ask anything, ask for a
   story, or log food ("I had two eggs").

---

## Part B: Build on EAS

EAS builds in Expo's cloud and gives you an installable app (Android APK, iOS
build for registered devices or TestFlight).

### B.1 One-time setup

1. An Expo account (expo.dev). Log in: `npx eas-cli@latest login`.
2. Create the EAS project and note its id:

   ```bash
   cd expo
   npx eas-cli@latest init
   ```

   `app.config.js` is a JavaScript config, so `eas init` can't write the id
   into it. Put the id (and your Expo account name) in `local.expo.config.js`:

   ```js
   easProjectId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
   easOwner: 'your-expo-username',
   ```

3. Create `.eas.env` (git-ignored, never uploaded) for non-interactive builds:

   ```bash
   # Expo login: a token (expo.dev -> Account settings -> Access tokens), or user/password
   EXPO_TOKEN=
   EXPO_USR=
   EXPO_PASS=
   # iOS credentials through an App Store Connect API key (optional)
   EXPO_ASC_API_KEY_PATH=secrets/AuthKey_XXXXXXXXXX.p8
   EXPO_ASC_KEY_ID=
   EXPO_ASC_ISSUER_ID=
   EXPO_APPLE_TEAM_ID=
   EXPO_APPLE_TEAM_TYPE=INDIVIDUAL      # or COMPANY_OR_ORGANIZATION
   ```

   Keep the `.p8` key in `secrets/` (git-ignored, never uploaded).

4. **iOS devices for internal builds:** register each iPhone once with
   `npx eas-cli@latest device:create` and open the link on the phone.

### B.2 Build

Use the script. It builds **only the `expo/` folder** (this folder is inside a
larger repository, and EAS would otherwise upload all of it):

```bash
scripts/eas-build.sh android preview            # installable APK
scripts/eas-build.sh ios preview                # internal build for registered iPhones
scripts/eas-build.sh ios preview-simulator      # iOS Simulator build
scripts/eas-build.sh all production             # store builds (auto-incremented build numbers)
scripts/eas-build.sh android development        # development client
```

The script loads `.eas.env`, logs in, sets `EAS_NO_VCS=1` and
`EAS_PROJECT_ROOT`, and starts the build without waiting. Follow the build at
expo.dev, then install it from the link or QR code.

Profiles (`eas.json`):

| Profile | Result |
|---|---|
| `development` | Development client, internal distribution |
| `preview` | Internal distribution; Android as an APK |
| `preview-simulator` | `preview` for the iOS Simulator |
| `production` | Store build, build number incremented remotely |

### B.3 What EAS uploads

With `EAS_NO_VCS=1`, EAS uploads the folder filtered by **`.easignore`** (not
`.gitignore`). It excludes `ios/`, `android/` and `node_modules/` (regenerated on
EAS), the secrets (`.eas.env`, `secrets/`, `local.config.ts`), and scratch files.
It **includes** `local.expo.config.js`, so your identifiers and EAS project id
reach the build. `local.config.ts` is recreated on EAS from the template, so API
keys you put there are not in cloud builds; use EAS environment variables for
those if you need them.

If you add a model file, check it is not excluded by `.easignore`.
`assets/models/*.dm` is excluded on purpose (old models), with an exception for
`embedder_en.dm`; models loaded by file name belong in `assets/models/local/`,
which is uploaded.

### B.4 Local EAS build (same steps as the cloud, on your machine)

```bash
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli@latest build --platform android --profile preview --local
```

---

## Part C: Add DaVoice to your own Expo app

Work through [C.1](#c1-base-setup-every-capability) first, then only the
sections for the capabilities you need. Each section lists what to install, what
to copy, the config changes, and the code. The checklists at the end of each
section are what to verify before moving on.

### C.1 Base setup (every capability)

1. **Install** (use `npx expo install` for Expo packages, so the versions match
   your SDK):

   ```bash
   npx expo install expo-dev-client expo-build-properties
   npm install --save-dev @expo/config-plugins patch-package
   npm install react-native-fs
   # then only the DaVoice packages you need:
   npm install react-native-wakeword        # wake word, speaker verification
   npm install react-native-davoice         # STT, TTS, voice cloning
   npm install react-native-davoice-llm     # local AI chat
   ```

   Use the DaVoice versions from `expo/package.json`.

2. **Copy** `expo/plugins/withDaVoiceNativeAssets.js` to `plugins/` in your app.

3. **Copy the `react-native-fs` patch** if your `react-native-fs` version is
   2.20.0: `expo/patches/react-native-fs+2.20.0.patch` to `patches/`, and add
   `"postinstall": "patch-package"` to your scripts. (It stops an Android crash
   when a download fails. For another version, the patch file name must match;
   regenerate it with `npx patch-package react-native-fs`.)

4. **Metro:** let it bundle model files. `metro.config.js`:

   ```js
   const { getDefaultConfig } = require('expo/metro-config');
   const config = getDefaultConfig(__dirname);
   config.resolver.assetExts.push('dm', 'onnx', 'wav', 'mp3');
   module.exports = config;
   ```

5. **Expo config** (`app.config.js`; the same keys work in `app.json`):

   ```js
   module.exports = {
     expo: {
       // ...your existing name, slug, android.package, ios.bundleIdentifier
       ios: {
         infoPlist: {
           NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to access your microphone',
           NSSpeechRecognitionUsageDescription: 'Allow $(PRODUCT_NAME) to use speech recognition',
           UIBackgroundModes: ['audio'],   // keep listening / speaking in the background
         },
       },
       plugins: [
         ['expo-build-properties', { android: { minSdkVersion: 29 } }],
         'react-native-wakeword',          // if installed: Android RECORD_AUDIO, Maven repository
         ['./plugins/withDaVoiceNativeAssets', {
           sourceDir: 'assets/models/local',
           iosBundleSubdir: 'DaVoiceModels',
           extraFiles: [],                  // e.g. the STT word list (C.4)
         }],
       ],
     },
   };
   ```

   `minSdkVersion` 29 is required by the DaVoice Android libraries.
   `withDaVoiceNativeAssets` adds the Maven repositories of `react-native-wakeword`
   and `react-native-davoice` (it expects both to be installed; if you install
   only one, remove the other's line from `ANDROID_MAVEN_REPOS` at the top of the
   plugin).

6. **Models loaded by file name** go in `assets/models/local/`. The plugin
   copies every `.dm`/`.onnx` there into the Android assets and the iOS bundle on
   each prebuild. The plugin fails the prebuild if that folder is empty, so add
   it together with your first model. If your repo uses Git LFS for models, copy
   `expo/.gitattributes`.

7. **License.** One DaVoice license key works for all three packages. Put it in
   a git-ignored file (for example `local.config.ts`, from a committed template)
   as `DAVOICE_LICENSE_KEY`, and pass it to each package (calls in the sections
   below). Each call resolves `true` or `false`; on `false`, show a clear message
   and stop that capability. Never retry in a loop.

8. **Microphone permission** at runtime before starting anything: copy
   `ensureMicPermission()` from `expo/src/initialization/index.ts`.

9. Build: `npx expo prebuild --clean`, then `npx expo run:android --device` /
   `npx expo run:ios --device`.

Checklist:

- [ ] `npx expo prebuild --clean` succeeds; `android/build.gradle` contains a
      `maven { url ".../libs" }` line per installed DaVoice package
- [ ] The app starts on a real phone with a development build (not Expo Go)
- [ ] No license key or API key committed

### C.2 Audio routing (iOS) and ducking

Wake word, STT and TTS share one iOS audio session. Copy
`defaultAudioRoutingConfig` from `expo/src/wakeword/index.ts` and pass the same
object to both libraries **before** you create the wake-word instance or call
`Speech.initAll`:

```ts
import { setWakewordAudioRoutingConfig } from 'react-native-wakeword';
import Speech from 'react-native-davoice/speech';

await setWakewordAudioRoutingConfig(defaultAudioRoutingConfig); // wake word
await Speech.setAudioRoutingConfig(defaultAudioRoutingConfig);  // STT/TTS
```

It covers speaker, receiver, Bluetooth, wired headphones and CarPlay, and the
ducking of other apps' audio:

- `WhenPlayingAudio` (while TTS plays) and `STTDuckingConfig` (while STT
  listens) lower other apps' audio (`duckOthers`).
- `msBeforeUnduck` in either section is how long other audio stays lowered after
  your app goes quiet, so short pauses between sentences don't flip it up and
  down. Default: 3000 ms.
- `wakeWordDuringTTS` sets the wake word's threshold while TTS plays, so the
  user can interrupt the app's voice.

### C.3 Wake word

**Read:** `expo/src/wakeword/index.ts` (`instanceConfigs`, `addInstanceMulti`,
`attachKeywordListenerOnce`, `startWakewordDetection`,
`initializeWakewordBootstrap`), then `keywordCallback` in `expo/App.tsx`.

1. Put your wake-word model in `assets/models/local/` (for the demo:
   `hey_coach_model_28_22012026b.dm`). Wake-word models are phrase-specific; get
   your own phrase from DaVoice. Keep the file name you were given.
2. Plugin `'react-native-wakeword'` in `app.config.js` (C.1).
3. Copy `expo/src/wakeword/index.ts`. Set `modelName` / `instanceConfigs` to your
   model file.
4. Start it (the order matters):

   ```ts
   import { createKeyWordRNBridgeInstance } from 'react-native-wakeword';

   const inst = await createKeyWordRNBridgeInstance('main', false);
   // model files, thresholds, buffer counts, ms between callbacks
   await inst.createInstanceMulti(['hey_coach_model_28_22012026b.dm'], [0.999], [3], [1000]);
   const sub = inst.onKeywordDetectionEvent((phrase: string) => onWakeWord(phrase));
   if (!(await inst.setKeywordDetectionLicense(DAVOICE_LICENSE_KEY))) { /* license error */ }
   await inst.startKeywordDetection(0.999, true);
   ```

   `initializeWakewordBootstrap` does the whole startup in the right order; using
   it is the easiest path.

5. In the callback, **pause** detection (don't stop it) before the mic goes to
   STT, and un-pause after: `inst.pauseDetection(false)` /
   `inst.unPauseDetection()`.

Tuning: `threshold` (0–1) and `bufferCnt` (frames above the threshold) trade
false triggers against misses; the demo uses `0.999` / `3`.

Checklist:

- [ ] The model is in `android/app/src/main/assets/` and `ios/*/DaVoiceModels/`
      after prebuild
- [ ] One instance and one listener for the whole app (`attachKeywordListenerOnce`)
- [ ] Saying the phrase fires the callback once

### C.4 Speech to text

**Read:** `expo/src/initialization/index.ts` (`initializeSpeechLibrary`,
`withTimeout`), `expo/src/stt/index.ts` (`registerSpeechHandlers`,
`mergeSmartKeepPunct`).

1. `npm install react-native-davoice` (C.1). `withDaVoiceNativeAssets` adds its
   Maven repository.
2. Optional: a word list the recognizer is biased toward. Copy
   `expo/assets/stt_bias_conf/words_flattened.txt` (edit it for your app's words)
   and add it to the plugin's `extraFiles`:
   `extraFiles: ['assets/stt_bias_conf/words_flattened.txt']`.
3. Initialize once (TTS uses the same object, C.6):

   ```ts
   import Speech from 'react-native-davoice/speech';

   if (!(await Speech.setLicense(DAVOICE_LICENSE_KEY))) { /* license error */ }
   await Speech.initAll({ locale: 'en-US', model: 'model_ex2_rich_kate.dm' });
   await Speech.pauseSpeechRecognition();   // start paused

   Speech.onSpeechPartialResults = (e) => { /* e.value[0]: text so far */ };
   Speech.onSpeechResults        = (e) => { /* e.value[0]: final text of a segment */ };
   Speech.onSpeechError          = (e) => { /* most codes are recoverable */ };

   await Speech.unPauseSpeechRecognition(-1);   // listen
   await Speech.pauseSpeechRecognition();       // stop listening (e.g. before TTS)
   ```

   `initAll` loads the TTS model too, so pass the TTS model even for STT only.
   Wrap `initAll` in a timeout (`withTimeout`); the first run can take seconds.

4. The end of the user's turn is a silence timeout after the last result (the
   demo uses 2000 ms). Copy `mergeSmartKeepPunct` to join Android's partial
   results without repeated words.

Checklist:

- [ ] Partial results appear while you speak; the final text is complete
- [ ] STT is paused whenever the app speaks

### C.5 Speaker verification

**Read:** `expo/src/speaker_verification/onboarding.ts`
(`runSpeakerVerifyEnrollment`, `writeEnrollmentJsonToFile`,
`loadEnrollmentJsonFromFile`), `verification.ts`, the constants in
`expo/src/appflow.ts`, and `applySpeakerVerificationChoice` in `App.tsx`.

1. Put `sv.dm` in `assets/models/local/`.
2. Copy `src/speaker_verification/` and the `SV_*` constants from `src/appflow.ts`.
3. **Enrollment** (once per user): `runSpeakerVerifyEnrollment` records
   `SV_ONBOARDING_SAMPLE_COUNT` samples and returns an enrollment JSON; save it
   with `writeEnrollmentJsonToFile` (app documents folder). Destroy the mic
   controller when done, before starting the wake word or STT.

   **For the best voice signature, have the user read these sentences during
   onboarding:**

   > [Wake Word], Please send a message to my friend. How's the weather going to be today? Please set a timer for three minutes. Can you play some music for me?

   And to make it even stronger, add:

   > Every morning, I enjoy a fresh cup of coffee while watching the beautiful sunrise.

   A perfect onboarding, for example:

   > "Hey Coach, Please send a message to my friend. How's the weather going to be today? Please set a timer for three minutes. Can you play some music for me? Every morning, I enjoy a fresh cup of coffee while watching the beautiful sunrise."

4. **Use it** (live, no restart):

   ```ts
   await inst.addSpeaker('user', enrollmentJsonPath);   // wake word reacts only to this voice
   await Speech.addSpeaker('user', enrollmentJsonPath); // STT too
   await inst.setSpeakers([]); await Speech.setSpeakers([]);  // turn it off
   ```

The enrollment JSON is personal voice data: keep it in the documents folder,
never in logs, and delete it if the user asks.

Checklist:

- [ ] After enrollment, another person saying the wake word doesn't trigger it
- [ ] The enrollment survives an app restart (`loadEnrollmentJsonFromFile`)

### C.6 Text to speech

**Read:** `expo/src/tts/index.ts` (`getTTSVoiceConfig`), `speakText` and
`applySelectedTTSVoice` in `App.tsx`, `speakNextAIChatSentence` in
`src/aichat/index.ts`.

1. Put the TTS model in `assets/models/local/` (`model_ex2_rich_kate.dm` holds all
   voices: Ariana, Rich, Hanna, Kate, Jenny, Matthew, Gloria).
2. **Expo-specific:** pass the model **by file name**, `'model_ex2_rich_kate.dm'`.
   The plugin ships it in the app; a `require()` would bundle the 100+ MB file a
   second time. This is the one line where `expo/src/tts/index.ts` differs from
   the bare React Native example.
3. Speak:

   ```ts
   await Speech.changeVoice('Kate');        // a voice inside the model (instant)
   await Speech.pauseSpeechRecognition();   // don't transcribe your own voice
   Speech.speak(sentence, 0, 1.0);          // text, speaker index, speed
   ```

4. **Streamed text (LLM replies, long answers):** call `Speech.speak` for **each
   complete sentence as soon as you have it, without awaiting the previous one**.
   The native engine queues the sentences and prepares the next one while the
   current one plays, so they follow without gaps. Each `speak` promise resolves
   when everything queued so far has been spoken; await the last one before
   un-pausing STT. Show each sentence on screen as soon as it is generated; never
   delay speech to keep text in step. `Speech.stopSpeaking()` stops and clears
   the queue.

Checklist:

- [ ] A multi-sentence reply plays without pauses between sentences
- [ ] STT is un-paused only after the last `speak` resolved

### C.7 Voice cloning

The user records about 10 seconds (or picks an audio file); the library turns it
into a new voice the TTS can speak with.

**Read:** `expo/src/tts/voiceClone.ts` (all of it), then in `App.tsx`:
`openVoiceCloneScreen`, `startCloneRecording`, `stopCloneRecording`,
`pickCloneFile`, `createVoiceFromSample`, `changeCloneVolume`,
`listenToClonedVoice`, `confirmDeleteClonedVoice`, and the
`showVoiceCloneScreen` UI.

1. Needs C.6 (TTS) and `react-native-fs`.
2. Copy the voice encoder `expo/assets/models/embedder_en.dm` to
   `assets/models/` (it is loaded with `require()`, so **not** in `local/`). If you
   use an `.easignore`, make sure this file is not excluded.
3. Copy the native recorder: `expo/plugins/withVoiceRecorder.js` and the folder
   `expo/plugins/voice-recorder/`, and add the plugin:

   ```js
   plugins: [
     // ...
     './plugins/withVoiceRecorder',
   ],
   ```

   On every prebuild it copies `VoiceRecorderModule.kt` / `VoiceRecorderPackage.kt`
   into your Android package and registers it in `MainApplication`, and adds
   `VoiceRecorder.m` to the iOS target. JS: `NativeModules.VoiceRecorder`.
   (Older Expo SDKs: see C.10.)
4. Copy `expo/src/tts/voiceClone.ts` and the `voiceEmbedder` export from
   `expo/src/tts/index.ts`.
5. The flow:

   ```ts
   import { loadClonedVoices, startVoiceRecording, stopVoiceRecording,
            pickVoiceAudioFile, createClonedVoice, deleteClonedVoice } from './src/tts/voiceClone';

   // After every Speech.initAll (a reload forgets the folder):
   const cloned = await loadClonedVoices();          // names of the user's cloned voices

   // Record (pause the wake word first: inst.pauseDetection(true) releases the mic)
   await startVoiceRecording();
   const { path, seconds } = await stopVoiceRecording();
   // or: const file = await pickVoiceAudioFile();   // wav, mp3, m4a, aac, flac, ogg

   // Create; volume 1 keeps the recording's loudness (1.2 = 20% louder, 0.8 = 20% quieter)
   const result = await createClonedVoice(path, 'Dana', 1.0);
   if (result.warnings.length) { /* suggest recording again: little clear speech */ }

   await Speech.changeVoice(result.voice);           // use it like a built-in voice
   await deleteClonedVoice('Dana');                  // remove it
   ```

   - Voice names: letters, digits, spaces and dashes; no `_`; not a built-in
     voice name (`voiceNameProblem` checks this).
   - Cloned voices are `.emd` files in `CLONED_VOICES_PATH` (the documents folder);
     the same name replaces the old voice.
   - Ask for about 10 seconds of one person speaking, in a quiet room;
     `VOICE_CLONE_READING_TEXT` is a good text to read.

Checklist:

- [ ] Recording shows a level meter and stops at 30 seconds
- [ ] "Play Recording" plays the whole recording
- [ ] The new voice speaks, survives an app restart, and can be deleted

### C.8 Local AI chat (on-device LLM and agent)

**Read:** `expo/src/local_llm/constants.ts` (models), `ModelManager.ts`
(download), `LocalLLMLoader.ts` (load once), `expo/src/agent/LocalAgent.ts`
(`getLocalAgent`), `expo/src/aichat/provider.ts` (`LocalLLMProvider`), then
`processAIChatTurn` and `warmUpLocalModel` in `App.tsx`. The agent's behavior is
in `expo/agent/` (JSON).

1. `npm install react-native-davoice-llm` and add its plugin (it adds the Android
   `INTERNET` permission and its Maven repository):

   ```js
   plugins: [ /* ... */ 'react-native-davoice-llm' ],
   ios: {
     // ...
     // Lets the app use more memory before iOS terminates it (models need gigabytes).
     entitlements: { 'com.apple.developer.kernel.increased-memory-limit': true },
   },
   ```

   With EAS, the entitlement is added to your App ID automatically. With local
   Xcode signing, the "Increased Memory Limit" capability must be allowed for
   your team.
2. Copy `src/local_llm/`, `src/agent/`, `src/aichat/` and `agent/` (the pack).
   Metro already bundles the pack's JSON.
3. Models are **downloaded at runtime** into the documents folder, never shipped
   in the app (1–5 GB). `constants.ts` lists tested models; the default (Qwen2.5
   1.5B, about 1 GB) runs on most phones.
4. Use it:

   ```ts
   import { getLocalAgent } from './src/agent/LocalAgent';
   import { ensureModelLoaded } from './src/local_llm/LocalLLMLoader';

   await ensureModelLoaded(model, DAVOICE_LICENSE_KEY);   // download + license + load, once
   const agent = await getLocalAgent();
   await agent.configure({ chatTemplate: model.chatTemplate });

   const result = await agent.turn(
     { text: userText, history, date: new Date().toDateString() },
     (event) => {
       if (event.type === 'text') queueSentenceForTTS(event.text);  // see C.6 step 4
       else if (event.type === 'filler') Speech.speak(event.text, 0, 1.0);  // "Let me look that up."
     },
   );
   ```

   - **Warm up** when the chat opens (`LocalLLMProvider.warmUp`) and **prefill**
     while the user talks (`agent.prefill(history, partialText)` on each partial
     transcript). That removes most of the wait for the first word.
   - `agent.cancel()` stops a turn (for example when the user says the wake word).
   - On older Android phones the speech library and the LLM coordinate
     automatically (the LLM leaves fast CPU cores to speech while it speaks); no
     code needed.

Checklist:

- [ ] The model downloads once and loads; the app says the progress meanwhile
- [ ] A spoken question gets a spoken, streamed answer without gaps
- [ ] No API key committed (web search and MCP keys in `local.config.ts`)

### C.9 The voice loop (putting it together)

```
startup:
  mic permission
  setWakewordAudioRoutingConfig + Speech.setAudioRoutingConfig   (iOS, same object)
  wake word: create instance, listener, license, startKeywordDetection, pauseDetection(false)
  Speech.setLicense, Speech.initAll (timeout), loadClonedVoices, Speech.pauseSpeechRecognition
  unPauseDetection                       -> listening for the wake word

wake word detected:
  pauseDetection(false)
  Speech.unPauseSpeechRecognition(-1)    -> user talks; partials -> agent.prefill
  silence timeout:
    Speech.pauseSpeechRecognition
    agent.turn                           -> fillers and sentences to Speech.speak as they arrive
  last speak resolved:
    Speech.unPauseSpeechRecognition(-1)  (follow-up)  or  unPauseDetection  (back to the wake word)
```

`initializeWakewordBootstrap` in `src/wakeword/index.ts` is the startup half, in
the right order. To let the user interrupt the app's voice, keep the wake word
running during TTS; in its callback call `Speech.stopSpeaking()` (and
`agent.cancel()`), then listen.

### C.10 Using a different Expo SDK version

The `expo/` folder is tested on **Expo SDK 56** (React Native 0.85, New
Architecture). The DaVoice packages are classic React Native native modules;
they also run under the New Architecture through React Native's interop layer.
For another SDK:

| Topic | What to do |
|---|---|
| Expo packages | Install with `npx expo install` (`expo-dev-client`, `expo-build-properties`) so they match your SDK. Don't copy `expo/package.json`'s Expo versions |
| `@expo/config-plugins` | Install the version that matches your SDK. The plugins here use long-standing APIs (`withDangerousMod`, `withProjectBuildGradle`, `withXcodeProject`, `withMainApplication`) |
| Android `minSdkVersion` | Must be 29 or higher, whatever the SDK's default |
| iOS deployment target | The DaVoice pods need iOS 11 (wake word, speech) and 13.5 (LLM); every recent SDK's default is higher |
| `withVoiceRecorder` on SDK 49 and older | Those SDKs generate a Java `MainApplication.java`. The plugin looks for the Kotlin line `PackageList(this).packages.apply {` and stops the prebuild with an error if it is missing. Change its `withMainApplication` step to insert `packages.add(new VoiceRecorderPackage());` after `List<ReactPackage> packages = new PackageList(this).getPackages();` |
| Metro | SDK 50+: `expo/metro-config` as in C.1. Older: add the same `assetExts` to your existing Metro config |
| `react-native-fs` | Works on recent React Native; the patch file name must match your installed version |
| Expo Go | Never; always a development build |

After changing SDK: delete `android/` and `ios/`, run `npx expo prebuild
--clean`, and test every capability on a real phone (Android and iOS).

---

## Part D: Troubleshooting

| Symptom | Likely cause |
|---|---|
| Prebuild error `[withDaVoiceNativeAssets] Source directory not found` / `No .dm or .onnx files` | `assets/models/local/` missing or empty |
| Prebuild error `[withVoiceRecorder] PackageList(this).packages.apply { not found` | Java `MainApplication` (old SDK): see C.10 |
| Gradle: `Could not find com.davoice:...` | The package's Maven repository is missing: check the plugins in `app.config.js`, then `prebuild --clean` |
| Manifest merge error about `minSdkVersion` | `expo-build-properties` with `minSdkVersion: 29` missing |
| Model "not found" at runtime | Not in `assets/models/local/` (file-name models), wrong file name, or an LFS pointer (a few hundred bytes): `git lfs pull` |
| Metro: unable to resolve `...dm` | `metro.config.js` lacks `dm` in `assetExts`, or (EAS) the file is excluded by `.easignore` |
| `setLicense` / `setKeywordDetectionLicense` returns `false` | Expired key, or a key for other identifiers; ask DaVoice for a key for your package name / bundle id |
| `NativeModules.VoiceRecorder` is undefined | `./plugins/withVoiceRecorder` not in the plugins, or no prebuild/rebuild since adding it |
| The app transcribes its own voice | STT not paused during TTS |
| Gaps between spoken sentences | Each `speak` is awaited before the next is sent; send them all at once (C.6) |
| App killed while loading the LLM (iOS) | The increased-memory-limit entitlement is missing, or the model is too big for the phone |
| "Not enough memory for this model" (Android) | Close other apps, or choose a smaller model |
| Very slow on the phone | A debug build; test release builds |
| EAS build lacks identifiers / project id | `local.expo.config.js` missing, or excluded by `.easignore` |
| EAS uploads the whole repository | Build with `scripts/eas-build.sh` (sets `EAS_NO_VCS` and `EAS_PROJECT_ROOT`) |

For licenses, custom wake words, and production support: `info@davoice.io`.
