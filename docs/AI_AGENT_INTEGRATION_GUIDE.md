# Integration guide for AI coding agents

This file is for an AI coding agent (an LLM) that has been asked to add DaVoice
voice features to a React Native or Expo app, using this repository's
example apps as the reference. It tells you which files to read, and for each
feature, what to install, configure, copy and call.

The five features:

| Feature | Package | What it does |
|---|---|---|
| Wake word | `react-native-wakeword` | Always-on detection of a custom phrase ("Hey Coach") |
| Speaker verification | `react-native-wakeword` | Enroll a user's voice; wake word and STT react only to that voice |
| Speech to text (STT) | `react-native-davoice` (`react-native-davoice/speech`) | Live transcription with partial results |
| Text to speech (TTS) | `react-native-davoice` (`react-native-davoice/speech`) | On-device neural voices |
| Local LLM | `react-native-davoice-llm` | On-device model and agent: web search, tools, memory, MCP |

STT and TTS are one object (`Speech`) because they share one audio session.
Wake word and STT must hand over the microphone to each other. See
[The voice loop](#7-the-voice-loop-putting-it-together).

---

## 0. Rules before you start

1. **Use only git-tracked files as reference.** Run `git ls-files example expo`.
   Ignore anything untracked: local notes, logs, backups, scratch folders.
2. **Never copy secrets or license keys.** `App.tsx` contains a time-limited
   *demo* license string. Do not copy it into the user's app. Put a
   placeholder there and tell the user to get their own key from DaVoice
   (`info@davoice.io`). API keys (Gemini, Tavily, Brave, USDA, MCP tokens) go in
   a git-ignored local file. Follow the `local.config.example.ts` →
   `local.config.ts` pattern, and commit only the template.
3. **Pick one reference folder:**
   - `example/` is the bare React Native app (React Native CLI, your own `ios/`
     and `android/` folders).
   - `expo/` is the same app for Expo prebuild / EAS Build.

   Their `src/` folders hold the same feature code. The only difference is
   `src/tts/index.ts` (how the TTS model is referenced, see §5).
4. **Test on real devices.** Wake word, speaker verification, STT and the
   local LLM need a real microphone and real memory. Use simulators for UI
   only.
5. **Change one feature at a time and build after each one.** Native setup
   errors are much easier to find that way.
6. **Use the package versions in `example/package.json` (bare) or
   `expo/package.json` (Expo).** The three DaVoice packages ship native
   binaries. Versions that worked together are the ones listed there.

---

## 1. How to read the example folders

Read in this order:

1. `example/README.md` and `expo/README.md`: what the demo does, and the
   Expo setup steps.
2. `example/src/README.md`: a map of the feature modules.
3. The feature module for the capability you are adding (table below).
4. `example/App.tsx` (about 3,400 lines). Don't read it top to bottom. It is
   the orchestration layer: React state, prompts, and the order of calls
   between features. Search it for the function names in this guide.

| Folder / file | Feature |
|---|---|
| `src/wakeword/index.ts` | Wake word: model config, instance creation, listener, start/pause/resume, iOS audio-routing config, the startup sequence (`initializeWakewordBootstrap`) |
| `src/speaker_verification/onboarding.ts` | Speaker enrollment, and saving/loading the enrollment JSON |
| `src/speaker_verification/verification.ts` | Live verification from the microphone (one-shot and continuous) |
| `src/initialization/index.ts` | Mic permission, `Speech.initAll`, timeouts |
| `src/stt/index.ts` | STT event handlers, merging partial transcripts, silence timeout |
| `src/tts/index.ts` | TTS model and voice selection, speeds |
| `src/agent/LocalAgent.ts` | Creating the on-device agent (pack, database, web search, embedding model) |
| `src/agent/AgentPack.ts` | Loads the agent pack JSON files and documents their shape |
| `src/local_llm/*` | Model list, download, load-once guard, model picker UI |
| `src/aichat/provider.ts` | `LocalLLMProvider`: warm-up, prefill while the user talks, one streamed turn |
| `src/aichat/index.ts` | Splitting a streamed reply into sentences and queueing them for TTS |
| `src/calories/CaloriesCard.tsx` | UI that updates from agent `skill` events (example of the app reacting to tools) |
| `agent/agent.json`, `agent/skills/*` | The agent pack: persona, prompts, routing, web-search rules, skills (data, not code) |
| `metro.config.js` | Asset extensions for model files |
| `android/build.gradle` | Local Maven repositories of the DaVoice packages, `minSdkVersion` |
| `ios/Podfile`, `ios/ExampleApp/Info.plist` | iOS deployment target, permission texts, background audio |
| `expo/app.config.js`, `expo/plugins/withDaVoiceNativeAssets.js` | Expo: config plugins that do the native setup on prebuild |

The `src/` modules take React refs and setters as parameters (for example
`listenerRef`, `setMessage`), so they can be copied as they are. In the
user's app you may simplify them. Keep the **order of native calls** the
same, because that order is what makes the audio handoffs stable.

---

## 2. Setup shared by all features

### 2.1 Install

```bash
# Bare React Native (versions: see example/package.json)
npm install react-native-wakeword react-native-davoice react-native-davoice-llm react-native-fs
cd ios && pod install && cd ..
```

- Install only the packages you need. Wake word and speaker verification
  need only `react-native-wakeword`. STT/TTS need `react-native-davoice`. The
  local LLM needs `react-native-davoice-llm`.
- `react-native-fs` is used by the examples for file paths, enrollment
  storage and model downloads.

### 2.2 Model files

DaVoice models are `.dm` (or `.onnx`) files. In the examples they are stored
with Git LFS (`.gitattributes`). If a model file is a few hundred bytes, it is
an LFS pointer, not the model. Run `git lfs pull`.
`scripts/ensure-lfs.js` checks this on `postinstall`.

| File in the examples | Used by | How it is loaded |
|---|---|---|
| `hey_coach_model_28_22012026b.dm` | Wake word | By file name, from the iOS bundle / Android assets |
| `sv.dm` | Speaker verification | By file name, from the iOS bundle / Android assets |
| `model_ex2_rich_kate.dm` | TTS (all voices) | Bare RN: `require(...)` through Metro. Expo: by file name |
| `assets/stt_bias_conf/words_flattened.txt` | STT bias word list | By file name, from the app bundle |

The local LLM (GGUF, 1–5 GB) and its small embedding model are **not** in the
app. They are downloaded at runtime into the documents folder (§6).

- **The wake-word model is phrase-specific.** "Hey Coach" is a demo phrase.
  The user's own phrase is a model they get from DaVoice. Keep the file name
  you were given; the instance config refers to it by name.
- **Placing files loaded by name:**
  - Bare RN, iOS: add them to the Xcode target as bundle resources.
  - Bare RN, Android: put them in `android/app/src/main/assets/`.
  - Expo: put them in `assets/models/local/` and let the config plugin copy
    them (§2.6).

### 2.3 Metro

Add the model extensions so `require('...dm')` works. From
`example/metro.config.js`:

```js
resolver: {
  assetExts: [...defaultConfig.resolver.assetExts, 'dm', 'onnx', 'wav', 'mp3'],
},
```

### 2.4 Android (bare)

From `example/android/build.gradle`:

- `minSdkVersion = 29`.
- Each DaVoice package ships its native library as a local Maven repository
  inside the npm package. Add one line per installed package to
  `allprojects.repositories`:

  ```gradle
  maven { url "${project(":react-native-wakeword").projectDir}/libs" }
  maven { url "${project(":react-native-davoice").projectDir}/libs" }
  maven { url "${project(":react-native-davoice-llm").projectDir}/libs" }
  ```

- `AndroidManifest.xml`: `RECORD_AUDIO` and `INTERNET` permissions. INTERNET
  is needed for the LLM model download and web search.
- Ask for the mic permission at runtime before starting anything.
  `ensureMicPermission()` in `src/initialization/index.ts` does this.

### 2.5 iOS (bare)

From `example/ios/ExampleApp/Info.plist`:

- `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`.
- `UIBackgroundModes` including `audio`, if the wake word should keep
  listening in the background.
- For the local LLM: the `com.apple.developer.kernel.increased-memory-limit`
  entitlement. Without it, iOS may terminate the app while it loads a
  multi-GB model.
- The native frameworks come in through the packages' podspecs; `pod install`
  is enough.

### 2.6 Expo

Read `expo/README.md` §2 ("Integrate Into Your Own Expo App") and
`expo/app.config.js`. In short:

1. Install the packages, plus `expo-dev-client`, `expo-build-properties` and
   `@expo/config-plugins`. These packages don't run in Expo Go; a dev client
   or EAS build is required.
2. Copy `expo/plugins/withDaVoiceNativeAssets.js` into the app. It:
   - adds the Maven repositories for `react-native-wakeword` and
     `react-native-davoice`;
   - copies every `.dm`/`.onnx` in `assets/models/local/`, plus any
     `extraFiles`, into the Android assets and the iOS bundle
     (`DaVoiceModels/`).
3. Configure the plugins:

   ```js
   plugins: [
     ['expo-build-properties', { android: { minSdkVersion: 29 } }],
     'react-native-wakeword',
     'react-native-davoice-llm', // only with the local LLM
     ['./plugins/withDaVoiceNativeAssets', {
       sourceDir: 'assets/models/local',
       iosBundleSubdir: 'DaVoiceModels',
       extraFiles: ['assets/stt_bias_conf/words_flattened.txt'],
     }],
   ],
   ```

4. In `ios`, set `infoPlist` (mic and speech-recognition texts,
   `UIBackgroundModes: ['audio']`). With the LLM, also set
   `entitlements: { 'com.apple.developer.kernel.increased-memory-limit': true }`.
5. Run `npx expo prebuild --clean`, then `npx expo run:ios` /
   `npx expo run:android`, or `eas build`.
6. Check that the model files landed in the native projects. The commands
   are in `expo/README.md` §1.6.
7. For EAS:
   - model files must be committed (LFS is fine) and not excluded by
     `.gitignore` or `.easignore`;
   - the git-ignored `local.config.ts` is created from its template by
     `scripts/ensure-local-config.js` on `postinstall`.

### 2.7 License

Each package checks a DaVoice license at runtime:

| Package | License call |
|---|---|
| Wake word | `instance.setKeywordDetectionLicense(key)` |
| STT/TTS | `Speech.setLicense(key)` |
| Local LLM | `setLicense(key)` from `react-native-davoice-llm`, called by `LocalLLMLoader.ensureModelLoaded` |

Each call resolves `true` or `false`. On `false`, show a clear message and
stop that feature. Never retry in a loop.

Leave a clearly named placeholder constant for the key (for example
`DAVOICE_LICENSE_KEY`) in a git-ignored local config, and tell the user to put
their own key there.

---

## 3. Wake word

**Read:** `src/wakeword/index.ts`. Focus on `instanceConfigs`, `addInstanceMulti`,
`attachKeywordListenerOnce`, `startWakewordDetection` and
`initializeWakewordBootstrap`. Then read `keywordCallback` in `App.tsx`.

**Steps:**

1. Ship the wake-word `.dm` file so it can be loaded by name (§2.2).
2. **iOS only:** set the audio routing config before creating the instance.
   Copy `defaultAudioRoutingConfig` from `src/wakeword/index.ts`. It covers
   speaker, receiver, Bluetooth HFP/A2DP, wired headphones and CarPlay, plus
   ducking while TTS plays. Pass the same object to
   `setWakewordAudioRoutingConfig()` and, if you use STT/TTS, to
   `Speech.setAudioRoutingConfig()`.
3. Create the instance, attach the listener, set the license, then start:

   ```ts
   import { createKeyWordRNBridgeInstance, setWakewordAudioRoutingConfig } from 'react-native-wakeword';

   await setWakewordAudioRoutingConfig(defaultAudioRoutingConfig); // iOS routing
   const inst = await createKeyWordRNBridgeInstance('main', false);
   // One or more models: names, thresholds, buffer counts, ms between callbacks.
   await inst.createInstanceMulti(['your_phrase_model.dm'], [0.999], [3], [1000]);
   const sub = inst.onKeywordDetectionEvent((phrase: string) => onWakeWord(phrase));
   if (!(await inst.setKeywordDetectionLicense(DAVOICE_LICENSE_KEY))) { /* show license error */ }
   await inst.startKeywordDetection(0.999, true);
   ```

4. **In the callback**, pause detection (don't stop it) before handing the mic
   to STT, and un-pause after:

   ```ts
   await inst.pauseDetection(false);   // false: keep the mic session
   // ... STT / LLM / TTS ...
   await inst.unPauseDetection();
   ```

   `captureWakewordDetection` also shows how to get the audio that triggered
   detection (`getRecordingWav`, plus `getRecordingWavArray` on Android). It is
   useful for debugging false triggers.

**Tuning:**

- `threshold` (0–1) and `bufferCnt` (frames above threshold needed to fire)
  trade false triggers against misses. The example uses `0.999` / `3`.
- `msBetweenCallbacks` debounces repeated triggers.
- `wakeWordDuringTTS` in the routing config sets a separate threshold and
  buffer count used while TTS is playing (the example uses `0.9` / `1`). Tune
  it so the user can interrupt with the wake word, and the app's own voice
  doesn't trigger it.

**Pitfalls:**

- Remove the old listener before attaching a new one
  (`attachKeywordListenerOnce`). Otherwise every detection fires twice.
- Don't create a second instance on every screen mount. Keep one in a ref or
  a module.

---

## 4. Speaker verification

The user records a few short samples once. The result is an **enrollment
JSON** string that you save to a file. After that, you give the enrollment to
the wake word and to STT, and both ignore other voices.

**Read:** `src/speaker_verification/onboarding.ts` (`runSpeakerVerifyEnrollment`,
`writeEnrollmentJsonToFile`, `loadEnrollmentJsonFromFile`), then
`src/speaker_verification/verification.ts`
(`startEndlessVerificationWithEnrollmentFix`), then
`applySpeakerVerificationChoice` in `App.tsx`.

**Steps:**

1. Ship `sv.dm` so it can be loaded by name.
2. **Enrollment:**
   1. `createSpeakerVerificationMicController(id)`.
   2. `ctrl.create(JSON.stringify({ modelPath: 'sv.dm', options }))`.
   3. `ctrl.beginOnboarding('davoice', sampleCount, true)`.
   4. Call `ctrl.getNextEmbeddingFromMic()` once per sample. Wait for
      `onSpeakerVerificationOnboardingProgress` after each call.
   5. When `onSpeakerVerificationOnboardingDone` fires, read
      `enrollmentJson` from the event.
   6. Save it with `writeEnrollmentJsonToFile`, then `ctrl.destroy()`.

   Copy the `options` object (`decisionThreshold`, `frameSize`, `tailSeconds`,
   `maxTailSeconds`, `cmn`, `expectedLayoutBDT`) and the sample count from
   the example (`src/appflow.ts`). Filter events by `controllerId`.
3. **Gate wake word and STT to the enrolled speaker (live, no restart):**

   ```ts
   await inst.addSpeaker('user', enrollmentJsonPath);   // wake word
   await Speech.addSpeaker('user', enrollmentJsonPath); // STT
   // Turn it off again:
   await inst.setSpeakers([]);
   await Speech.setSpeakers([]);
   ```

   You can also pass the enrollment at start time instead:
   - `startKeywordDetection(threshold, enrollmentJsonPath, true)` for the
     wake word;
   - `Speech.initAll({ ..., onboardingJsonPath, speakerId })` for STT.
4. **Optional: show a live match score.** Use
   `startEndlessVerifyFromMic(hopSeconds, stopOnMatch, true)` with
   `onSpeakerVerificationVerifyResult`. The example uses it for a "check your
   voice" screen. Stop and destroy the controller before starting wake word or
   STT, because they compete for the mic.

**Pitfalls:**

- Only one component may own the microphone at a time. Destroy the mic
  controller after enrollment and verification
  (`ctrl.stop()`, then `ctrl.destroy()`).
- The enrollment JSON is personal voice data. Store it in the app's documents
  folder, never in logs, and delete it if the user asks.

---

## 5. Speech to text and text to speech

**Read:** `src/initialization/index.ts` (`initializeSpeechLibrary`),
`src/stt/index.ts` (`registerSpeechHandlers`), `src/tts/index.ts`
(`getTTSVoiceConfig`), and these functions in `App.tsx`: `initializeSpeechLibrary`,
`applySelectedTTSVoice`, `speakText`, `stopCurrentNarration`.

### 5.1 Initialize once

```ts
import Speech from 'react-native-davoice/speech';

await Speech.setAudioRoutingConfig(defaultAudioRoutingConfig); // iOS; same object as the wake word
if (!(await Speech.setLicense(DAVOICE_LICENSE_KEY))) { /* show license error */ }
await Speech.initAll({ locale: 'en-US', model: ttsModel /*, onboardingJsonPath, speakerId */ });
await Speech.pauseSpeechRecognition(); // start paused; un-pause when it's the user's turn
```

`ttsModel` depends on the setup:

- **Bare RN:** `require('./assets/models/model_ex2_rich_kate.dm')`.
- **Expo:** the file name `'model_ex2_rich_kate.dm'`, shipped by the config
  plugin. A `require()` would bundle it a second time.

This is the one line where `example/src/tts/index.ts` and
`expo/src/tts/index.ts` differ.

`initAll` can take many seconds the first time. Wrap it in a timeout
(`withTimeout`). If it times out, keep the wake word running and offer a
retry.

### 5.2 STT

Set the handlers on the `Speech` object:

```ts
Speech.onSpeechPartialResults = (e) => { /* e.value[0]: text so far */ };
Speech.onSpeechResults        = (e) => { /* e.value[0]: final text of a segment */ };
Speech.onSpeechError          = (e) => { /* log; most codes are recoverable */ };
await Speech.unPauseSpeechRecognition(-1); // listen
await Speech.pauseSpeechRecognition();     // stop listening (e.g. before TTS)
```

- Copy `mergeSmartKeepPunct` from `src/stt/index.ts`. On Android, partial
  results restart per segment, and this function joins them without
  duplicating words.
- The end of the user's turn is a **silence timeout** after the last partial
  or final result. The example uses 2000 ms (`silenceThresholdMsRef`). When it
  fires, send the text to the LLM (or wherever it goes).
- On Android, the example also listens through `DeviceEventEmitter` as a
  fallback (bottom of `registerSpeechHandlers`). Keep that block.
- On Android, ignore partial results while the speech library is still
  initializing (`suppressAndroidPartialResultsRef`).
- To bias recognition toward the app's own words (food names, product names,
  a phonetic alphabet), ship a word list like
  `assets/stt_bias_conf/words_flattened.txt` as a bundle file.

### 5.3 TTS

```ts
await Speech.changeVoice('Ariana');      // a voice inside the shared model: Ariana, Rich, Hanna, Kate, Jenny, Matthew, Gloria
await Speech.speak(text, 0, 1.0);        // text, speaker index, speed
await Speech.stopSpeaking();             // stop now
Speech.onFinishedSpeaking = () => { /* the last queued audio finished */ };
await Speech.playWav(pathOrRequire);     // play a sound through the same audio session
```

- **Pause STT before speaking and un-pause after.** Otherwise the app
  transcribes its own voice.
- **Speak a streamed reply one sentence at a time, without waiting.** Call
  `speak` for each complete sentence as soon as it arrives; the library queues
  them. Waiting for each sentence to finish before sending the next adds a gap
  between sentences. The pattern is `speakNextAIChatSentence` and
  `enqueueAIChatSpeechFromDelta` in `src/aichat/index.ts`. Treat the reply as
  finished when every queued sentence has resolved, not on the first
  `onFinishedSpeaking`.
- Changing the voice inside the shared model is instant (`changeVoice`).
  Switching to a different model file needs `Speech.destroyAll()` and then
  `initAll` again (`reloadSpeechLibraryForSelectedVoice` in `App.tsx`).

---

## 6. Local LLM (on-device model and agent)

`react-native-davoice-llm` has two layers:

- **Engine:** `setLicense`, `loadModel`, `generateStream`, `prefill`,
  `cancel`, `unloadModel`. A GGUF model runs on the device.
- **`Agent`:** builds on the engine. It decides what each turn needs (a web
  search, one of the app's tools, or neither), says a short filler while it
  waits on the network, assembles the prompt, runs tool calls, keeps memory,
  and streams the reply. Its behavior is configured by an **agent pack** of
  JSON files, not code.

Use the `Agent`. The example does.

**Read:** `src/local_llm/constants.ts` (models and URLs),
`src/local_llm/ModelManager.ts` (download), `src/local_llm/LocalLLMLoader.ts`
(load at most once), `src/agent/LocalAgent.ts` (create the agent),
`src/aichat/provider.ts` (`LocalLLMProvider`), then `processAIChatTurn` and
`warmUpLocalModel` in `App.tsx`. The pack is in `agent/`; its fields are
described in the "Local AI Chat" sections of `example/README.md`.

### 6.1 Models

- `src/local_llm/constants.ts` lists tested models with download URLs,
  context sizes and chat templates:
  - Qwen2.5 1.5B / 3B: `chatml`;
  - Gemma 3n E2B / E4B: `gemma`.
- The default is the smallest (about 1 GB).
- Download into the documents folder with `ModelManager.downloadModel`. It
  writes to a temp file, then renames, and joins concurrent callers onto one
  download. Never ship a GGUF in the app binary.
- Load with `ensureModelLoaded(model, licenseKey)`. It calls
  `setLicense` + `loadModel` **once** even if several callers race, so the
  same multi-GB file is never mapped twice. Always pass `useMmap: true`; the
  loader does.

### 6.2 Create the agent once

```ts
import { Agent } from 'react-native-davoice-llm';

const agent = await Agent.create({
  pack: {
    agent: require('./agent/agent.json'),
    skills: [{ skill: require('./agent/skills/calories/skill.json'),
               data: { 'foods.json': require('./agent/skills/calories/foods.json') } }],
  },
  databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent.db`, // skills' data and memory
  webSearch: { engine: 'wikipedia' },   // 'tavily' | 'brave' (with a key) | 'host' (your own API)
}, { onEvent: (e) => { /* 'log', 'skill' (data changed), ... */ } });

await agent.configure({ chatTemplate: 'chatml' });  // must match the loaded model ('gemma' for Gemma)
```

`getLocalAgent()` in `src/agent/LocalAgent.ts` keeps one agent for the app.
Copy it.

- **Embedding model (recommended):** `setUpRouterEmbeddings` downloads a
  small sentence-embedding model (about 25 MB, URL in `LocalAgent.ts`) and
  calls `agent.configure({ router: { embeddingModel: path } })`. The agent
  then understands each sentence by meaning when it decides between search, a
  tool, or plain chat. Without it, the agent falls back to word overlap.
- **Your app's own tools:** pass `ToolDefinition`s to `agent.setTools(tools)`.
  Each one is `{ name, description, inputSchema, handler }`. The handler's
  return value goes back to the model.
- **MCP:** `connectMcpServer({ url, headers })` returns tools you can pass to
  `setTools`. See `loadMcpTools` in `App.tsx`. Keep URLs and tokens in the
  local config.
- **Custom behavior:** edit the pack JSON (persona, prompts, web-search rules,
  fillers, routing examples). Add a skill folder for a new domain;
  `agent/skills/calories/` is the worked example. The app reads skill data
  with `agent.skill('<skill>', '<method>')` and reacts to `skill` events, as
  `CaloriesCard.tsx` does.

### 6.3 One turn

```ts
const result = await agent.turn(
  { text: userText, history, date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
  (event) => {
    if (event.type === 'text') queueForTTS(event.text);         // reply tokens, streamed
    else if (event.type === 'filler') sayNow(event.text);       // "Let me look that up." while it waits online
  },
);
// Keep the turn's tool messages in the history for the next turn:
history.push({ role: 'user', text: userText }, { role: 'model', text: reply, toolMessages: result.toolMessages });
```

- **Warm up when the chat screen opens:** download, load, and prefill the
  system prompt (`LocalLLMProvider.warmUp`). Then the first turn doesn't pay
  for loading.
- **Prefill while the user talks:** call `agent.prefill(history, partialText)`
  on each partial transcript (the `useEffect` on `aiChatLiveTranscript` in
  `App.tsx`). When the silence timeout fires, only the last few words are
  left to process. This is the biggest latency gain.
- **Memory per user:** pass `speaker` in the turn input (for example the
  speaker-verification id). Each speaker then gets their own memory.
- **While the model is not ready yet:** say so ("still downloading, 40
  percent"), don't hold the mic. See `processAIChatTurn`.
- `agent.cancel()` stops a running turn, for example when the user starts
  talking or says the wake word.

---

## 7. The voice loop: putting it together

The full app runs this cycle. The order of pause/un-pause calls is what keeps
the microphone handoffs stable on both platforms:

```
startup:
  mic permission
  setWakewordAudioRoutingConfig + Speech.setAudioRoutingConfig   (iOS, same object)
  create wake-word instance, attach listener, license
  startKeywordDetection
  pauseDetection(false)
  Speech.setLicense, Speech.initAll (with timeout), Speech.pauseSpeechRecognition
  unPauseDetection                    -> listening for the wake word

wake word detected:
  pauseDetection(false)
  Speech.unPauseSpeechRecognition(-1) -> user talks; partials -> agent.prefill
  silence timeout:
    Speech.pauseSpeechRecognition
    agent.turn                        -> fillers and sentences go to Speech.speak as they arrive
  all sentences spoken:
    Speech.unPauseSpeechRecognition(-1)  (follow-up turn)
    or unPauseDetection                  (back to the wake word)
```

`initializeWakewordBootstrap` in `src/wakeword/index.ts` is the startup half
of this, already in the right order.

**Interrupting TTS (barge-in):**

- Keep the wake word un-paused while TTS plays. `wakeWordDuringTTS` sets its
  threshold and buffer count for that time.
- In the wake-word callback, if speech is playing, call
  `Speech.stopSpeaking()` (and `agent.cancel()` if a turn is running), then
  start listening.
- The example does this for its narration (`keywordCallback` →
  `stopCurrentNarration`).
- With speaker verification enabled, only the enrolled user can interrupt.
- The routing config's `AEC` setting (`'duringTTS'` / `'always'`) turns on echo
  cancellation, so the app's own voice is not picked up.

---

## 8. Checklist before you hand it back

- [ ] No license key, API key or token committed. Placeholders are in a
      git-ignored local config, and a template is committed.
- [ ] Model files are real files, not LFS pointers. They are in the iOS
      bundle and Android assets (or `assets/models/local/` for Expo).
- [ ] Android: `minSdkVersion` 29 and the `maven { url ... /libs }` line for
      every installed DaVoice package.
- [ ] iOS: mic and speech-recognition texts, background `audio` if needed,
      the increased-memory-limit entitlement if the LLM is used, then
      `pod install` (or `expo prebuild --clean`).
- [ ] The license check result is handled, with a visible message on
      `false`.
- [ ] One wake-word instance, one listener, one agent.
- [ ] STT is paused before every `speak` and un-paused after.
- [ ] The app works without network, except web search and the first model
      download.
- [ ] Tested on a real iPhone and a real Android phone. Covered: wake word,
      speak, reply, speak again; wake word during a reply; Bluetooth
      headphones connected mid-session (iOS routing).

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Gradle: `Could not find com.davoice:...` | Missing `maven { url "${project(":<package>").projectDir}/libs" }` line |
| Model "not found" at runtime | The file isn't in the bundle/assets under that exact name, or it is an LFS pointer |
| `setLicense` / `setKeywordDetectionLicense` returns false | Expired or wrong key; ask DaVoice for a key for this bundle id / package name |
| The app transcribes its own voice | STT not paused during TTS, or AEC off |
| Wake word fires twice | Listener attached twice; use `attachKeywordListenerOnce` |
| STT stops working after the wake word | Detection was stopped instead of paused, or STT was never un-paused |
| Gaps between spoken sentences | Each sentence waits for the previous one; call `speak` without awaiting |
| App killed while loading the LLM (iOS) | Missing increased-memory-limit entitlement, or the model is too large for the device |
| First reply very slow | No warm-up or prefill; the model loaded on the first turn |
| Expo build has no models | Files not in `assets/models/local/`, not committed, or excluded by `.easignore` |

For licenses, custom wake words, and production support: `info@davoice.io`.
