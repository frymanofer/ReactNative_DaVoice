# How-to: the DaVoice example app (Expo)

> For: another Claude agent that will use, test or extract parts of the **Expo** version of the
> example app (`expo/`). Everything here was checked against the code (last update: 2026-11-12,
> `react-native-davoice-llm` 1.0.13, `react-native-davoice` 1.0.140, Expo with React Native
> 0.85). File paths are relative to `expo/`. A Brazilian Portuguese version is in
> `portugueseHowTo.md`.
>
> **Same app as `../example/`:** `App.tsx` and `src/` are identical to the React Native example
> (only `src/tts/languagePacks.generated.ts` differs, see 1.5), so the app's behaviour, the
> demos and the tests are the same. The React Native guide is `../example/englishHowTo.md`.
> What is specific to Expo: how to run and build it (1.1), how the native files get into the
> app (config plugins, 1.6), and where the built-in models live (1.5).

> **Status: test models, still in training.** The car demo's on-device model ("DaVoice
> Automotive Agent 0.6B", checkpoint `r4b_it100`) is **a test model, not a finished
> product**. On our frozen automotive test set, with the same core and settings as the app
> (measured on a Mac; the Galaxy S20 test is pending):
> - it gets about **82% of Brazilian Portuguese commands exactly right** (tool and arguments;
>   the earlier `ft7f2_it900`: 68%), and picks the right tool about **90%** of the time;
> - in our safety tests it ran **no opposite action** ("open" for "close") and **no unsupported
>   action**.
>
> It still sometimes picks a wrong value or a related tool (range vs. arrival time, sunroof
> open vs. tilt), or asks when it could act. That is why every car action is **simulated**
> and checked by the app (guards, see 2.3). A dedicated Automotive Agent is being trained (Brazilian Portuguese
> first); new checkpoints replace this one only after they pass the safety tests. Treat the
> results as a preview of the voice pipeline (wake word, speaker verification, STT/TTS,
> on-device agent), not as final accuracy.

The app demonstrates a voice assistant that runs on the device itself:

- wake word;
- speaker verification (speaker identification);
- speech recognition (STT) and speech synthesis (TTS), with voice cloning;
- two local AI demos (an LLM on the device) with tools:
  - **Car demo:** a simulated Volkswagen car (windows, doors, locks, climate, navigation,
    radio...);
  - **Calories demo:** a calorie tracker and personal memory.

Packages used (`package.json`):

| Package | What for |
|---|---|
| `react-native-wakeword` | wake word + speaker verification (onboarding and verification) |
| `react-native-davoice` | STT + TTS (`Speech`), voice cloning, speaker filter on STT |
| `react-native-davoice-llm` (1.0.13) | on-device LLM, `Agent` (a whole assistant turn), tools, call guards |
| `react-native-fs` | files: voice signature, downloaded models and language packs, saved prompt states, the agent's database |
| `expo`, `expo-dev-client`, `expo-build-properties` | Expo prebuild / EAS Build, the development client, Android `minSdkVersion` 29 |

What is built into the app and what is downloaded (and how to change it): see 1.5.

---

## 1. Using the app, step by step

### 1.1 Run the app

```bash
cd expo
npm install                 # postinstall: patch-package, a Git LFS check, and local.config.ts from its template
cp local.expo.config.example.js local.expo.config.js   # app name, Android package, iOS bundle id (git-ignored)
npx expo prebuild --clean   # generates android/ and ios/ and runs the config plugins (1.6)
npx expo run:android        # or: npx expo run:ios (builds, installs and starts Metro)
```

- **`android/` and `ios/` are generated** (git-ignored) by `npx expo prebuild`. The config
  plugins copy the native files (models in `assets/models/local/`, the voice recorder module)
  into them **only during prebuild**.
  - Run `npx expo prebuild --clean` again after changing dependencies, `app.config.js`,
    `local.expo.config.js`, the plugins or `assets/models/local/`.
  - Otherwise a build ships whatever the old folders contain. On 2026-11-12 an old
    `android/` shipped an outdated English model and no pt-BR model at all.
  - Check what will ship: `ls -la android/app/src/main/assets/` and
    `find ios -path '*/DaVoiceModels/*' -type f`.
- **Android release APK:** `cd android && ./gradlew :app:assembleRelease` (about 500 MB: only
  the English and pt-BR voices are inside, the other languages are downloaded, 1.5).
  - After changing only the agent packs (`agent/`, `agent_automotive/`), make sure the JS
    bundle was rebuilt (`./gradlew clean` first if in doubt).
- **iOS:** prebuild runs `pod install`. If it stops with an encoding error, run
  `cd ios && LANG=en_US.UTF-8 pod install`.
- **EAS Build:** `eas build --platform android --profile preview` (an APK) or
  `--profile production`; `eas.json` has the profiles.
  - EAS builds from git and runs prebuild itself, so commit `assets/models/local/`.
  - `.easignore` decides what is uploaded. It leaves out `assets/models/*.dm` except the
    voice-cloning encoders the app `require()`s (`embedder_en.dm`, `embedder_brv1.dm`). A
    newly built-in language needs its encoder added there (1.5).
- **Package id:** with the values in `local.expo.config.example.js` the app is
  `com.exampleapp`, the same as the React Native example: installing one replaces the other on
  a phone. Without `local.expo.config.js` the committed default is `com.anonymous.expoexample`.
- **Tests:** `npm test` (jest with `@react-native/jest-preset`, which React Native 0.85 needs;
  binary assets are stubbed by `jest/assetStub.js`).
- JS logs on Android: `adb logcat | grep ReactNativeJS`.
- The DaVoice license keys are in the example's code. In another app, use your own
  (contact: info@davoice.io). Your own Gemini / search / USDA keys go in `local.config.ts`
  (git-ignored).

### 1.2 Startup flow

1. **Language.** The first screen asks for the language: English, Português do Brasil,
   Português de Portugal, German, Greek, Spanish, French, Italian, Dutch, Danish or Swedish.
   - **English and Brazilian Portuguese are built into the app.** Any other language is
     downloaded the first time it is chosen: its button shows "⬇ N MB", and choosing it opens
     the **Downloading language pack** screen (progress, MB, Retry, Back). The app continues
     only when the download is complete. Details and configuration: 1.5.
   - Hebrew is supported in the code but hidden from this screen (`hidden: true` in
     `APP_LANGUAGES`), and it is neither built in nor downloadable (its voice is for
     non-commercial use only).
   - The choice sets:
     - the TTS model (e.g. `model_ex2_rich_kate.dm` for English,
       `model_ex2_portuguese_brv1.dm` for pt-BR; built in or downloaded, see 1.5);
     - the voice-cloning encoder (`embedder_*.dm`, which goes with its model);
     - the STT locale (`en-US`, `pt-BR`, ...);
     - the language the LLM replies in;
     - the agent pack's language (`agent/` or `agent/pt-BR/`, and the same under
       `agent_automotive/`).

   Configuration: `APP_LANGUAGES` in `src/appflow.ts` (the languages offered) and
   `language_packs.json` (the files of each language, built in or downloaded; see 1.5).
2. **Microphone permission.** Accept.
3. **Loading.** The app loads the wake word and STT/TTS. On Android "Preparing voice
   demo..." can show for a few seconds.
4. **Spoken introduction.** The narration is in `src/narration.ts`, one entry per
   language.
5. **Voice.** You can:
   - pick a built-in voice;
   - pick a voice you cloned earlier;
   - **clone a new voice** from a recording (`src/tts/voiceClone.ts`).
6. **Speaker verification** (details in 1.3). Three options: create a new voice signature,
   use the saved one, or skip.
7. **Wake word.** The narration says "Now say the wake word…". This example's wake word is
   **"Hey Coach"** (model `hey_coach_model_28_22012026b.dm`), in every language.
8. **Mode**, after the wake word:

| Mode | What it does |
|---|---|
| **Local AI · Car demo** | STT → on-device Automotive Agent → TTS, with the simulated car |
| **Local AI · Calories demo** | STT → on-device Personal Agent → TTS, with the calorie tracker and memory |
| Full AI Chat | STT → Gemini (cloud) → TTS. Needs a valid Gemini key. |
| Combined STT + TTS | you speak and hear the text back |
| STT Only | shows the transcript only |
| Type to TTS | you type and the app speaks |

To get back to the mode choice, use the app's back button (`goBackToModeSelection` in
`App.tsx`).

### 1.3 Speaker verification: setup and why it matters

**What it is:** the app records a *voice signature* of the owner (enrollment) and then
compares every utterance against it.

**How to do the onboarding in the app:**
1. At the speaker-verification step, choose **create a new signature**.
2. The app collects **5 speech samples** (`SV_ONBOARDING_SAMPLE_COUNT` in
   `src/appflow.ts`). Say natural sentences, one per sample, in a quiet room, at the
   distance you normally hold the phone.
   - Suggested text (from the README): *"Hey Coach, Please send a message to my friend.
     How's the weather going to be today? Please set a timer for three minutes. Can you
     play some music for me? Every morning, I enjoy a fresh cup of coffee while watching
     the beautiful sunrise."*
3. The signature is saved to `Documents/sv_enrollment.json`
   (`writeEnrollmentJsonToFile` in `src/speaker_verification/onboarding.ts`). Next time,
   choose **use the saved signature**.
4. When it is done, the app enrolls the speaker live in the wake word **and** in STT
   (`applySpeakerVerificationChoice` in `App.tsx`):
   ```ts
   await wakewordInstance.addSpeaker(SV_SPEAKER_ID, enrollmentJsonPath); // react-native-wakeword
   await Speech.addSpeaker(SV_SPEAKER_ID, enrollmentJsonPath);           // react-native-davoice
   ```
   If the user skips, the app calls `setSpeakers([])` on both. An empty list turns the
   filter off.
5. Decision threshold: `SV_DECISION_THRESHOLD` in `src/appflow.ts` (0.34 on Android, 0.35
   on iOS).

**Why it matters, especially in a car.** Without verification, any voice nearby can command
the assistant: a passenger, the radio, someone outside the window. With verification on:
- the wake word only fires for an enrolled voice;
- every STT result says **who** spoke: `speakerIds` (every verified speaker in the
  sentence) and `speakerId` (the latest). See `SpeechResultsEvent` in
  `react-native-davoice`.

**This example already does it for the doors.** The door tools `open_door` and `unlock_car`
declare an authorization scope in `src/car/carToolDefinitions*.json`:
```json
"execution": { "authorization": { "scope": "door_locks", "message": "Unlock the car?" } }
```
The agent core **never runs** such a tool without a "yes" from the app. It sends an
`authorizeTool` request to `onRequest`, and `isToolAuthorized` in `src/agent/LocalAgent.ts`
answers with `ownerMayAct()` (`src/speaker_verification/currentSpeaker.ts`):
- speaker verification **off** (skipped): allowed (it's a demo);
- verification **on**: allowed only if the enrolled owner was verified in this request.
  Another voice gets "not authorized", and nothing opens.

Other scopes are refused unless listed in `AUTHORIZED_TOOL_SCOPES` (empty). For a plain
yes/no confirmation without a speaker check, a tool declares `execution.confirmation`
instead; the example does this for `send_message`, where the app shows a dialog.

### 1.4 Sample commands

Say "Hey Coach", wait for the app to listen, then say a command.

- **Car demo, English:**
  - windows: "open the rear right window", "close the front left window", "open the
    passenger window halfway", "close all the windows", "open the back windows";
  - doors and locks: "open the rear left door", "close the doors", "lock the car", "unlock
    the driver's door";
  - climate: "set the temperature to 22 degrees", "two degrees warmer", "set the passenger
    side to 20", "fan on level three", "turn on the windshield defrost";
  - media: "play some jazz", "tune to 98.5 FM", "turn the volume up";
  - navigation: "take me home", "how long until we get there?", "find a gas station on the
    way";
  - status: "how much range do I have?".
- **Car demo, Brazilian Portuguese** (the main language of this model):
  - "abre o vidro traseiro direito", "fecha o vidro do carona", "abre os vidros de trás";
  - "abre a porta traseira esquerda", "tranca o carro", "destranca a porta do motorista";
  - "coloca o ar em vinte e dois graus", "deixa o lado do passageiro em vinte",
    "coloca 20 graus pro motorista e 23 pro passageiro";
  - "liga o desembaçador do para-brisa", "sintoniza noventa e oito vírgula cinco",
    "me leva pra Campinas", "quanto tempo falta?".
- **Incomplete requests (the app should ask):**
  - "open a window" → "Which window?";
  - "turn on the defrost" → "Front or rear?".
- **Calories demo:**
  - "I had two eggs";
  - "how many calories today?";
  - "undo".
- **Conversation and knowledge (both demos):**
  - "who are you?" (fixed reply from the pack's `fixedReplies`);
  - "what can you do in the car?" (fixed list of car functions);
  - "tell me a fun fact about Brazil": the model hands it over; with no remote model set up,
    the app answers with the message in 2.2.

---

### 1.5 What ships in the app and what is downloaded

Only what every user needs is inside the app. The large files are downloaded the first time
they are needed (never at install) from DaVoice's Cloudflare R2
(`https://pub-27f94b1602c647ab95a601086cf52820.r2.dev`), and each one is checked by sha256.

| What | Where | When |
|---|---|---|
| Wake word (`hey_coach_model_28_22012026b.dm`), speaker verification (`sv.dm`) | in the app (`assets/models/local/`, copied in by the config plugin, 1.6) | always |
| TTS model + voice-cloning encoder for **English** and **Brazilian Portuguese** (about 167 MB per language) | in the app: model in `assets/models/local/` (loaded by file name), encoder in `assets/models/` (`require()`); default, set in `language_packs.json` | always |
| Agent packs (`agent/`, `agent_automotive/`), car tools JSON, narration | in the app | always |
| TTS model + encoder of every other language (pt-PT, de, es, fr, it, nl, da, sv, el; 136–168 MB each) | R2 `language-packs/<file>` → phone `Documents/language_packs/<language>/` | the first time the language is chosen |
| On-device models (GGUF, 382 MB each): Automotive Agent `auto5_r4b_it100`, Personal Agent `ft7f2_it900` | R2 `agent-llm/<file>` → phone `Documents/local_llm/models/` | the first time the demo opens |
| Pre-warmed state of the Automotive Agent, English or pt-BR (about 400 MB) | R2 `agent-llm/prewarm/<file>` → next to the model | with the model, for the app's language |

**Configuration of the language files: `language_packs.json`** (in `expo/`):

```json
{
  "baseUrl": "https://pub-27f94b1602c647ab95a601086cf52820.r2.dev/language-packs",
  "bundled": ["en", "pt-BR"],
  "nativeModelsDir": "assets/models/local",
  "languages": {
    "fr": {
      "model":    { "file": "model_ex2_french.dm", "bytes": 144455696, "sha256": "7c8044b4…" },
      "embedder": { "file": "embedder_fr.dm",      "bytes": 22320622,  "sha256": "31d7787d…" }
    }
  }
}
```

- `bundled`: the languages built into the app. Every other language in `languages` is
  downloaded from `baseUrl/<file>`.
  - To build a language in, add its id to `bundled`, put its TTS model in
    `assets/models/local/` and its encoder in `assets/models/`, add `!assets/models/<encoder>`
    to `.easignore`, and run `npx expo prebuild --clean`. Each one adds about 136–168 MB to
    the app.
  - `"nativeModelsDir"` is what makes this Expo: Expo's config plugin copies that folder into
    the native app, so a built-in model is loaded by its file name (a `require()` would make
    Metro ship it a second time).
  - To make a language a download, remove it from `bundled`. Its files must be on R2 under
    `language-packs/` with the same names.
- Nothing else needs editing. Metro only ships files that appear in a static `require()`, so
  the app can't read the JSON at runtime. Instead, `metro.config.js` runs
  `scripts/generate-language-packs.js` on every bundle (dev server, Android release, iOS). It
  writes `src/tts/languagePacks.generated.ts` with the built-in models' file names, the
  encoders' `require()`s and the file table of all languages. The generator is the same file
  as `../example/scripts/generate-language-packs.js`: keep the two identical.
  - A wrong config (unknown language, missing file, wrong size) stops the build with a
    message.
  - Run it by hand: `node scripts/generate-language-packs.js`.
  - After replacing a file in `assets/models/`, run it with `--rehash` (it updates `bytes`
    and `sha256`), then upload the new file to R2 with the same name.
- Code:
  - `src/tts/languagePacks.ts`: download (to a temporary file, then sha256, then moved into
    place), free-space check, cancel, and a check on start (file present with the right size);
  - `src/tts/index.ts`: `languageFile()` picks the built-in file, else the downloaded one;
  - `App.tsx`: `selectAppLanguage` and the download screen.
- The speech library takes a downloaded file's absolute path the same way as a built-in
  asset (Android and iOS).

**The on-device models and pre-warmed states** are listed in `src/local_llm/constants.ts`
(`url`, `sizeBytes`, `sha256`, and `prebuiltStates` per language). The demo's loading screen
downloads the model and the pre-warmed state of the app's language together, with one
progress bar (2.1). A pre-warmed state only fits the exact model file, agent pack, tools and
prompt settings it was made with: after changing any of them, make new states on a phone
(the app saves one after its first warm-up), upload them, and update their `sha256` and
`sizeBytes`.

**Hosting rules:**
- Upload first, then check every public URL (HTTP 200, the download's sha256), and only then
  put a URL into the app. Never guess a URL.
- Before deleting a file from R2, make sure no app lists it any more (RN, Expo and Flutter).
  An install that already has a file keeps using it.

**The React Native example** (`../example/`) uses the same files, R2 folder and generator; its
built-in models are `require()`d from `assets/models/`. **Flutter** ships the same English and
pt-BR files (identical checksums) and offers only those two languages. All three list the same
on-device models and download the same pre-warmed states.

### 1.6 Expo native setup (config plugins)

`app.config.js` sets everything native; `npx expo prebuild` applies it to `android/` and `ios/`:

| Plugin | What it does |
|---|---|
| `expo-build-properties` | Android `minSdkVersion` 29 |
| `react-native-wakeword` | its Android Maven repository and permissions |
| `react-native-davoice-llm` | its Android Maven repository (on-device LLM) |
| `./plugins/withDaVoiceNativeAssets` | the Maven repository of `react-native-davoice`; copies every `.dm` / `.onnx` in `assets/models/local/` and `assets/stt_bias_conf/words_flattened.txt` into the Android assets and the iOS bundle (`DaVoiceModels`) |
| `./plugins/withVoiceRecorder` | voice cloning's recording and audio-file picker: the app's native module `VoiceRecorder` (`plugins/voice-recorder/`, the same files as `../example`) |

`app.config.js` also sets the iOS microphone and speech recognition texts, background audio
(the wake word keeps listening), and the `increased-memory-limit` entitlement the on-device
LLM needs. App name and ids come from `local.expo.config.js` (1.1). `README.md` has the
step-by-step for adding these plugins to your own Expo app.

## 2. The local AI demos: what to expect and how to test them

### 2.1 The two demos, their models and the loading screen

| | Car demo | Calories demo |
|---|---|---|
| Model (default) | **DaVoice Automotive Agent 0.6B** | **DaVoice Personal Agent 0.6B** |
| Agent pack (system prompt) | `agent_automotive/` (no calorie skill) | `agent/` + `agent/skills/calories/` |
| Tools | the simulated car (`src/car/`, 22 tools) | calories, memory, web search |
| Card | Car card | Calories card |
| Database | `davoice_agent*_car.db` | `davoice_agent*.db` |

- **Implementation:** `src/local_llm/demo.ts` holds the current demo, and
  `LOCAL_LLM_DEMO_DEFAULT_MODEL` in `src/local_llm/constants.ts` sets each demo's model.
  - Car demo: **DaVoice Automotive Agent 0.6B**, `LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B`
    (checkpoint `r4b_it100`, about 380 MB, downloaded once and checked by sha256), with its
    pre-warmed state for English or Brazilian Portuguese (about 400 MB, downloaded with the
    model), so the first start skips the warm-up.
  - Calories demo: the Personal Agent, `ft7f2_it900`.
  - The RN example, the Expo app and the Flutter example list the same models.
- **Other models:** each demo remembers its own pick from **Change** (model picker,
  `src/local_llm/ModelPicker.tsx`). The picker also lists the experimental C3 and A
  checkpoints (backups: not hosted, only when the file is copied into the models folder) and
  larger general models (Qwen2.5 1.5B/3B, Gemma 3n). The larger ones are slower.
  - The older ft7c, ft7e and ft7f2 Automotive entries were removed. A phone that had one
    picked falls back to its demo's model.
  - Only one model is in memory at a time: picking another one replaces it.
  - A demo's earlier pick wins over a new default: on a phone where another model was picked
    in the car demo, pick the Automotive Agent in **Change** (or clear the app's data).
- **Loading screen:** after you pick a demo, the app shows its own loading screen with
  three steps until the model is ready:
  1. Download (progress bar; the model and, if it has one, its pre-warmed state, 1.5);
  2. Load into memory;
  3. Warm up.

  It shows the seconds spent in each step, and on an error, Retry and Back.
- **Chat screen:** only at "Ready" does the app switch to a clean screen with:
  - the car status (or the calories card) at the top;
  - **You said** (the live STT);
  - **Reply** (what is spoken);
  - the model name with **Change**;
  - Reset Chat and Back.
- **Warm-up and the saved state:** the warm-up processes the system prompt (persona +
  tools: about 3,100 tokens for the car demo and about 4,000 for calories).
  - **Car demo, English or pt-BR: pre-warmed.** The Automotive Agent comes with this
    processed prompt already made (downloaded with the model, 1.5), so even the first start
    restores it. Measured on the S20: restore 0.23 s, first answer 0.34 s, instead of a
    24.6 s warm-up. It works because the model uses `promptOrder: 'cache'` (the date comes
    after the tools, so the saved prompt fits every day).
  - **Otherwise, the first time** for each demo and language it takes about **30–40 s** on a
    Galaxy S20 (CPU). The app then **saves that processed prompt** (`*.kvstate` in the
    models folder, about 435 MB) with `saveState` from `react-native-davoice-llm`.
  - **Afterwards** the state is restored (`loadState`) in **under a second**, and "Ready"
    comes right away. Measured on the S20: restore 0.7–0.9 s, warm-up 0.5–0.6 s.
  - States are kept **per prompt** (demo, language, tools): the newest 2 per model file.
    Switching demos is fast after each demo's first warm-up.
  - With the trained prompt order (the Personal Agent), a new day still pays part of the
    warm-up, because the date sits near the top of the prompt.
  - Code: `warmUp` in `src/aichat/provider.ts`; `kvStatePath`, `stablePromptKey` and
    `downloadPrebuiltState` in `src/local_llm/ModelManager.ts`.

### 2.2 How a turn works

- The fine-tuned model decides on its own, every sentence: call a tool, ask (incomplete
  request), decline (not supported) or **hand it over** to a remote model.
- **The app says what was done.** After a car action the model does not speak: the tool's
  own sentence, built from the real result, is said and the turn ends. Code: `done()` /
  `say` in `src/car/carTools.ts`, sent with `toolReply`. The sentence names the action,
  position, zone and value, in English or Brazilian Portuguese:
  - success: "I opened the rear right window." / "Coloquei o lado do motorista em 20°C e o do
    passageiro em 23°C.";
  - already in that state: "The front right door is already locked.";
  - refused by the car: "The car is locked. Should I unlock it?", "I can't do that while
    the car is moving." Nothing changes, and the model never acts on its own after a
    refusal (it used to unlock the car by itself);
  - lookups (arrival time, range, tires) are answered by the app with the values.

  Nothing is announced before the tool confirms it.
- **What gets handed over:** general knowledge, writing, small talk. The 0.6B model was
  trained to **act** (tools), not to chat.
- **Remote model: current setup.** **No remote model is set up**
  (`LOCAL_LLM_LAYER2 = 'none'` in `src/local_llm/constants.ts`).
  - Everything handed over gets this fixed reply: **"I need to send this to a remote Model.
    To make this work, please setup a remote model in the App."** (pt-BR: *"Preciso enviar
    isso para um modelo remoto. Para isso funcionar, configure um modelo remoto no
    aplicativo."*). The text is in `LOCAL_LLM_NO_REMOTE_MESSAGE`.
  - A request the model understood but the demo can't do gets
    `LOCAL_LLM_NOT_IN_DEMO_MESSAGE`: "This is not available in this demo, to make it
    available please contact info@davoice.io".

  These messages are **expected**, not errors.
- **How to set up a remote model.** Change `LOCAL_LLM_LAYER2`:
  - `'cloud'`: the app sends the request to Gemini (`src/aichat/remote.ts`, key
    `GEMINI_API_KEY` in `local.config.ts`). The agent says a short filler while it waits;
    if Gemini fails, it says it couldn't.
  - Any other service: implement `answerRemoteRequest` in `src/aichat/remote.ts`. It
    receives the request (`query`, `userText`, history, memory facts, tool results) and
    returns `{ text }`, or `{ failure, detail }` on error.
  - `'device'`: a second model on the phone (`LOCAL_LLM_LAYER2_MODEL`, about 470 MB).
    **Not recommended:** both models compete for the same CPU.
- **Speech noise:** short transcripts that are only filler ("The.", "But.", "é...",
  "Alma Alma.") get "Sorry, I didn't catch that. Could you say it again?" without going to
  the model. In the car demo, a bare "Done." from the model is replaced the same way, since
  real actions are confirmed by the app's own sentence. Code: `src/aichat/fragments.ts`.
- **Web search** (calories demo): Wikipedia by default. Tavily or Brave need a key in
  `local.config.ts`.
- **Spoken replies:** each sentence goes to TTS as soon as it is ready. The text shows on
  screen before the voice.

### 2.3 What to expect (honestly)

- It is a **0.6B-parameter model on a phone**. It picks the right tool most of the time,
  but it still makes mistakes, for example:
  - in English, "open the windows" sometimes picks the door tool;
  - wrong side or zone;
  - absolute vs. relative ("22 degrees" vs. "two degrees warmer");
  - spoken numbers.
- **The core's guards** check every call against the user's words before it runs
  (`callGuards: 'correct'` in the model entry). They:
  - fix an obviously wrong argument: "close" vs. "open", "levanta o vidro" = close,
    "turn the defrost off", the side the user named, a split number;
  - normalize a value written in another word order ("right front" → `front_right`);
  - **block** a call to the wrong kind of object, e.g. a door tool for a window, with a
    natural "Sorry, I'm not sure I got that right. Could you say it again?". A blocked call
    is **never** turned into another tool;
  - block a call whose arguments belong to another tool;
  - keep the action in a correction that only changes the target: "close the rear left
    window" → "no, the other one at the back" closes the rear right one (`followUp`; it needs
    the model entry's `historyAsRun: true`, so the history shows each call as it ran).

  Every guard decision is in the log (`guard ...`).
- **Positions:** windows, doors and locks take `front_left`, `front_right`, `rear_left`,
  `rear_right`, `driver`, `passenger`, `front`, `rear`, `left`, `right` or `all`.
  - `driver` / `passenger` are resolved by the app from the car's steering-wheel side
    (`CarState.vehicle.steering`, default left; `setSteering()` in `src/car/CarState.ts`),
    so nothing assumes left-hand drive.
  - Window movement, door opening and door locking are separate tools.
- **Two temperatures at once:** `set_dual_zone_temperature` (driver + passenger). The app
  checks each value and says which side it couldn't set. r4b was trained on it and gets most
  two-temperature requests right, in either order ("o carona quer 26 e eu 19"). A one-side
  request ("passenger side 22") uses `set_temperature` with a zone.
  - Coming with `react-native-davoice-llm` 1.0.14 (core g11): a `dualZone` guard puts the values
    the user said on the right sides of the dual call, and blocks (asks again) a call that would
    drop or copy a side. It never turns one tool into another.
- **Values out of range** ("set the fan to 29"; the fan goes from 1 to 7): with 1.0.13 the user
  hears the generic "could you say it again?". From 1.0.14, the pack strings `outOfRange` /
  `outOfRangeAsk` (already in `agent_automotive/agent.json` and `pt-BR/`) say the range instead:
  "Sorry, 29 isn't possible: it goes from 1 to 7."; a number the user never said is asked
  for.
- **Latency (Galaxy S20, CPU only, measured 2026-11-10):**
  - the model's decision takes about 1.3–2 s per command;
  - the action's sentence is spoken right after.

  iPhones with Metal are faster.
- **User memory (calories demo):** a saved fact can occasionally leak into an unrelated
  answer. This is a known limitation of the current model.
- Requests the car can't do (hood, trunk, hazard lights, wipers, mirrors, parking brake)
  should be **declined**, not executed.

### 2.4 How to test

1. Choose **Local AI · Car demo** (or Calories). Wait for the loading screen to finish:
   about 30–40 s the first time, about a second afterwards.
   - To test the saved state: close the app completely, open it again and go back to the
     demo. The log shows `[LocalLLM] KV state restored: N tokens in X ms`.
   - Ask a general question ("tell me a fun fact about Brazil"): the answer should be the
     remote-model message from 2.2.
2. **Car card** (`src/car/CarCard.tsx`):
   - the latest action in words and the **exact call** the AI made, e.g.
     `set_window(window: rear_right, position: open)`;
   - the two actions before it;
   - a one-line car state: temperature per side, windows, open doors, locks;
   - **Parked / Driving** button: while driving, the app refuses the trunk, the charge port,
     rotating the screen, opening all windows, opening doors and some modes
     (`NOT_WHILE_DRIVING` in `src/car/carTools.ts`);
   - **Reset** button: resets the car.

   In the Calories demo the Calories card (`src/calories/CaloriesCard.tsx`) shows today's
   total and list.
3. **What to check for each command:**
   - the right tool;
   - the exact arguments (position, value, unit);
   - the spoken sentence matches what happened ("already…", refusals);
   - a question when information is missing;
   - a decline when it's not supported;
   - **no action run** on conversational sentences or speech noise.
4. **Registered tools:** `LOCAL_LLM_CAR_TOOLS` in `src/local_llm/constants.ts`:
   - `'vw_demo'` (default: 22 tools in the h3 wording, shorter prompt, faster);
   - `'all'` (the whole catalog).

   The model entry's `toolWording` picks the description file:
   - `h3` (`src/car/carToolDefinitions.h3.json`: positions + dual zone, generated by
     `Davoice_LLM_Training/tools/make_h3_schemas.py`);
   - `h2`;
   - `v1` (the original wording of the first models).
5. **Conversation log:**
   - debug build: `adb shell run-as com.exampleapp cat files/davoice_chat.log`;
   - release build: `adb logcat | grep DavoiceChat` (same content).

   It shows the user's words, what the model generated, guard decisions, the tool calls and
   results, the reply, and `[timing]` lines with prompt and generation times.
6. **App tests:**
   ```sh
   npx jest __tests__/carTools.test.ts __tests__/fragments.test.ts
   ```
   These check the car's spoken replies (success / already / refused, English and pt-BR,
   positions, steering side, dual zone) and the speech-noise rules.
7. **With speaker verification on:** check that the wake word doesn't fire for another
   person, that `speakerId` shows in the STT results, and that another voice can't unlock
   the car.

### 2.5 Turn-based conversation: the user waits for the AI to finish

**How it works today.** The AI chat (local and Gemini) is **turn-based**. The user **cannot
interrupt** the AI:

1. The user speaks. When they go silent, the app sends the sentence to the AI.
2. At that moment STT is paused (`Speech.pauseSpeechRecognition()` in `processAIChatTurn`,
   `App.tsx`). While `aiChatInFlightRef` is set, STT results are ignored
   (`src/stt/index.ts`).
3. The AI thinks and speaks its reply, sentence by sentence.
4. Only after the last audio finishes does `finishAIChatSpeechFlow` reopen the microphone
   for the next turn.

While the AI thinks or speaks, nothing the user says is heard. Saying "Hey Coach" doesn't
stop the reply either, and there is no stop button. This is deliberate: it's the simplest
and safest way to keep the AI from hearing its own voice and transcribing what it is saying.

**If you want the user to be able to interrupt the AI, you have to change the app.** The
recommended model is the LunaFit app (`../LunaFitTech.Mobileapp`) in workout mode: there the
user says "Hey Coach" over the coach and the coach stops immediately. Reference files in
LunaFit:
- `src/components/utility-components/WakewordLibHeadless.ts` (`keywordCallback`);
- `src/components/utility-components/wakewordDetectionRouting.ts`
  (`resolveWakewordDetectionAction`);
- `src/components/ai-chat/SpeechLibHeadless.ts` (the `COACH_BTN_STOP_PRESS` handler);
- `src/components/utility-components/audioRoutingConfigs.ts`.

What LunaFit does, and how to apply it here:

1. **The wake word keeps listening while the AI speaks** (STT stays closed). In LunaFit,
   when the user's turn ends, STT closes and wake-word detection resumes
   (`unPauseDetection`) before the coach speaks. Here: call
   `myInstanceRef.current?.unPauseDetection()` right after `pauseSpeechRecognition()` in
   `processAIChatTurn`.
2. **Echo cancellation always on.** In LunaFit: `AEC: { mode: 'always' }` in
   `defaultAudioRoutingConfig`. Here, `defaultAudioRoutingConfig` in `src/wakeword/index.ts`
   uses `WakewordAEC: { regular: false, duringTTS: false }`. Replace it with
   `AEC: { mode: 'always' }`, so the AI's own voice neither triggers the wake word nor gets
   into STT. Support (documented in `react-native-wakeword`, `audioRoutingConfig.d.ts`):
   - newer iPhones use iOS's own AEC; older ones an echo-cancelling audio engine;
   - on Android it covers the wake word and TTS; STT on Android 13+, speaker routes.
3. **Wake word while the AI speaks = stop.** In LunaFit, `resolveWakewordDetectionAction`
   returns `'stop-coach'` whenever the coach is speaking, and that takes priority over any
   other state. Here, at the top of `keywordCallback` in `App.tsx`:
   ```ts
   if (aiChatInFlightRef.current) {             // the AI is thinking or speaking
     if (interruptInFlightRef.current) return;  // the same "Hey Coach" detected twice
     interruptInFlightRef.current = true;
     try {
       aiChatRequestIdRef.current += 1;         // late text and events of the old turn are ignored
       (await getLocalAgent()).cancel();        // stops the LLM turn (src/agent/LocalAgent.ts)
       aiChatSpeechQueueRef.current = [];       // drops the sentences not spoken yet
       ignoreNextFinishedSpeakingRef.current = true; // the stop's "finished speaking" must not open another turn
       await Speech.stopSpeaking();             // silences the voice now
       resetSpeechTranscriptState();            // discards whatever STT caught meanwhile (never sent to the AI)
       aiChatInFlightRef.current = false;
       await myInstanceRef.current?.pauseDetection(false);
       await Speech.unPauseSpeechRecognition(-1, 0); // a new user turn; preFetchMs 0, see below
     } finally {
       interruptInFlightRef.current = false;
     }
     return;
   }
   ```
   `interruptInFlightRef` and `ignoreNextFinishedSpeakingRef` are new refs.
   `finishAIChatSpeechFlow` must honour the second one and not reopen the microphone again.
4. **Details LunaFit learned in practice:**
   - **Guard against double detection** (LunaFit's `coachStopInFlightRef`): the same word
     can fire twice.
   - **Discard the accidental transcript; don't send it.** Interrupting the voice must not
     send the AI half a sentence or an echo of its own words.
   - **Open STT with `preFetchMs: 0`.** Otherwise STT replays the previous ~2 s of audio and
     transcribes "Hey Coach" (or the AI's voice) as the new message.
   - **Button vs. voice.** For a stop button, LunaFit just goes silent. For the wake word it
     opens the microphone, because the user wants to talk.
   - **Play a short "listening" sound** when the microphone opens, so the user knows they
     can speak.
   - **History:** keep only the part of the reply that was actually spoken, so the next
     turn makes sense.
5. **In a car, combine it with speaker verification (1.3).** With a speaker enrolled, only
   the owner's voice can interrupt. The radio or a passenger can't.

**"Any speech interrupts" variant (duplex).** In LunaFit this exists only on one
continuous-conversation screen ("Surprise Me", `AEC_DUPLEX_ROUTES` in
`voiceRouteAudioPolicy.ts`) and **only on iOS**. There STT stays open under the coach's
voice, with `AEC 'always'`. Words that are **not** an echo of what the coach is saying stop
the voice and start a normal turn (`interruptCoachForUserSpeech` in `SpeechLibHeadless.ts`).
It's more complex, because the echo has to be filtered by comparing the transcript with the
sentence the AI is speaking. For a car, the wake-word version above is safer.

---

## 3. Extracting each component into another app

General rule: copy the **module** from `src/` and the listed **assets**, install the package
and use your own license. The `src/` modules were split out of `App.tsx` exactly for this
(see `src/README.md`).

### 3.1 Wake word (`react-native-wakeword`)

- **Code:** `src/wakeword/index.ts`:
  - `instanceConfigs` (model, threshold, buffer);
  - `initializeWakewordBootstrap`, `startWakewordDetection`;
  - `attachKeywordListenerOnce` / `detachKeywordListener`;
  - `pauseDetection` / `unPauseDetection`.
- **Minimal API:**
  ```ts
  import { createKeyWordRNBridgeInstance } from 'react-native-wakeword';
  const inst = await createKeyWordRNBridgeInstance('ww1', false);
  await inst.setKeywordDetectionLicense(LICENSE);
  await inst.createInstance('hey_coach_model_28_22012026b.dm', 0.999, 3);
  await inst.startKeywordDetection(0.999 /* ... */);
  ```
- **Assets:** the wake-word `.dm` model goes in `assets/models/local/`. The config plugin
  `withDaVoiceNativeAssets` copies it into the Android assets and the iOS bundle at prebuild
  (1.6); the library loads it by file name.

  For another wake word, ask DaVoice for a model.
- **Before STT:** pause the wake word before opening STT (the example does this). Two
  capture pipelines open at once cause instability. The exception is the interruption
  pattern in 2.5, where the wake word listens while TTS plays and STT stays closed.

### 3.2 Speaker verification onboarding and verification (`react-native-wakeword` + `react-native-davoice`)

- **Code:**
  - `src/speaker_verification/onboarding.ts`: `runSpeakerVerifyEnrollment`,
    `runSpeakerVerificationStartupFlow`, `writeEnrollmentJsonToFile`,
    `loadEnrollmentJsonFromFile`;
  - `src/speaker_verification/verification.ts`: continuous or one-off verification;
  - `src/speaker_verification/currentSpeaker.ts`: who was verified in this request,
    `ownerMayAct()` (used to authorize the door tools, 1.3);
  - `src/appflow.ts`: threshold and sample count.
- **Asset:** `sv.dm` in `assets/models/local/` (copied into the app by the config plugin, 1.6).

  The controller uses `modelPath: 'sv.dm'`.
- **Flow:**
  ```ts
  import { createSpeakerVerificationMicController, onSpeakerVerificationOnboardingDone } from 'react-native-wakeword';
  const ctrl = await createSpeakerVerificationMicController('svMic1');
  await ctrl.create(JSON.stringify({ modelPath: 'sv.dm', options: { decisionThreshold: 0.35 } }));
  await ctrl.beginOnboarding('davoice', 5, true);
  // 5x: await ctrl.getNextEmbeddingFromMic();  -> progress events; at the end onboardingDone carries enrollmentJson
  // save the JSON (react-native-fs) and enroll the speaker:
  await wakewordInstance.addSpeaker('owner', enrollmentJsonPath);
  await Speech.addSpeaker('owner', enrollmentJsonPath);
  ```
- **At STT startup:** you can also enroll the speaker at initialization:
  `Speech.initAll({ locale: 'en-US', model, onboardingJsonPath, speakerId: 'owner' })`.
- **Managing the speaker list:**
  - `setSpeakers([...])` replaces the whole list (empty = off);
  - `removeSpeaker(id)` removes one speaker;
  - `getSpeakerIds()` lists the enrolled ones.
- **Authorizing actions:** use `speakerId` / `speakerIds` from the STT results. See the
  door authorization in 1.3.

### 3.3 STT and TTS (`react-native-davoice`)

- **Code:**
  - `src/initialization/index.ts`: `initializeSpeechLibrary` (calls `Speech.initAll`),
    microphone permission;
  - `src/stt/index.ts`: result handlers, merging partial/final text;
  - `src/tts/index.ts`: model per language, voices, speeds;
  - `src/tts/voiceClone.ts`: voice cloning.
- **Assets:** one TTS model and one voice-cloning encoder per language, built in or
  downloaded (1.5):
  - TTS: `model_ex2_rich_kate.dm` (English), `model_ex2_portuguese_brv1.dm` (pt-BR, about
    143 MB), ...;
  - voice cloning: `embedder_en.dm`, `embedder_brv1.dm`, ...
  - Every `require()` of a `.dm` file ships it in the app, even if that code never runs. In
    this example the `require()`s are generated from `language_packs.json`; don't add one by
    hand.
  - `Speech.initAll` and `createVoiceClone` take either a `require()` or a file path, so a
    downloaded file works the same way (copy `src/tts/languagePacks.ts` for the download).
- **Minimal API:**
  ```ts
  import Speech from 'react-native-davoice/speech';
  await Speech.initAll({ locale: 'en-US', model: 'model_ex2_rich_kate.dm' });   // by file name: assets/models/local/ (1.6)
  Speech.onSpeechResults = (e) => console.log(e.value[0], e.speakerId);
  await Speech.unPauseSpeechRecognition(-1);   // start listening
  await Speech.pauseSpeechRecognition();       // before speaking
  await Speech.speak('I opened the window.', 0, 1.0);
  ```
- **Voice cloning:**
  `Speech.createVoiceClone(recording, outputFolder + '/', require('./assets/models/embedder_en.dm'))`,
  then `Speech.setExternalVoicesPath(folder)` and `changeVoice(name)`. If the result has
  `warnings`, ask the user to record again.
- **Text for speech:** don't rewrite text for speech in the app (numbers, domains such as
  "DaVoice.io"). The TTS library already does that pre-processing.

### 3.4 Local AI and tools (`react-native-davoice-llm`)

- **Install:**
  ```sh
  npm install react-native-davoice-llm
  ```
  In Expo, add `'react-native-davoice-llm'` to the plugins in `app.config.js` (it adds its
  Android Maven repository) and, on iOS, the `increased-memory-limit` entitlement, then run
  `npx expo prebuild --clean` (1.6).
- **Code to copy:**
  - `src/local_llm/`:
    - model list and URLs with sha256, plus each demo's default model (`constants.ts`);
    - the current demo (`demo.ts`);
    - download, registry with a model per demo, and the saved states (`ModelManager.ts`,
      `ModelRegistry.ts`);
    - loading (`LocalLLMLoader.ts`) and the picker (`ModelPicker.tsx`).
  - `src/agent/LocalAgent.ts`: creates the `Agent` with the demo's pack and language,
    `onRequest` (`remote`, `authorizeTool`, `confirmTool`). It also has `resetLocalAgent()`
    for switching demos.
  - `src/agent/AgentPack.ts`: picks `agent/` or `agent/pt-BR/`, and the car pack
    (`automotiveAgentFor`).
  - `src/aichat/remote.ts`: the remote model (`answerRemoteRequest`: the fixed messages,
    Gemini or your own service, see 2.2).
  - `src/aichat/provider.ts`: sets the agent up per model (tools, guards, remote model,
    warm-up, saved state per prompt with `saveState` / `loadState`) and streams to TTS.
  - `src/aichat/fragments.ts`: speech-noise rules.
  - **Agent packs** (JSON files: behaviour changes without code changes):
    - `agent/agent.json` + `agent/skills/calories/` (the calories demo; the same under
      `agent/pt-BR/`);
    - `agent_automotive/agent.json` + `agent_automotive/pt-BR/` (the car demo: the same
      persona and messages, no calorie skill). This is the system prompt the automotive
      model is trained with: keep it identical when you use that model.
  - **Car:**
    - `src/car/carToolDefinitions.h3.json` (tool definitions in MCP shape: `name`,
      `description`, `inputSchema`, `execution`);
    - `src/car/carTools.ts` (handlers and the spoken sentences);
    - `src/car/positions.ts` (positions, steering side, sentence wording);
    - `src/car/CarState.ts` (simulated state);
    - `src/car/CarCard.tsx` (UI).

    Don't give a `.ts` module and a `.json` file the same base name: Metro resolves the
    `.json` first.
- **Minimal API:**
  ```ts
  import { setLicense, loadModel, Agent, toolReply } from 'react-native-davoice-llm';
  await setLicense(LICENSE);
  await loadModel(pathToGguf, { contextSize: 8192 });
  const agent = await Agent.create({
    pack: { agent: require('./agent_automotive/agent.json'), skills: [] },
    databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent_car.db`,
    chatTemplate: 'qwen3',
  }, { onRequest });
  await agent.configure({ intentRouter: false, webSearchTool: true, timeTool: true, guards: { /* see provider.ts */ } });
  await agent.setTools(myTools);   // a handler returns toolReply(result, 'I opened the window.') to say it itself
  const r = await agent.turn({ text, history }, (ev) => { if (ev.type === 'text') speak(ev.text); });
  // agent.cancel() stops a running turn (used for interruptions, see 2.5)
  ```
- **Models:** download the GGUF from the URLs in `src/local_llm/constants.ts` and check the
  sha256 (the example already does). Fine-tuned models need the same `chatTemplate`
  (`qwen3`) and the entry's settings (`usesRouter: false`, `modelTools: true`,
  `remoteAssistant: true`, `temperature: 0`, `callGuards: 'correct'`, `toolWording`; for the
  Automotive Agent also `historyAsRun: true`, `guidedToolCalls: true` and `promptOrder:
  'cache'`, plus its `prebuiltStates`). `provider.ts` sends
  them to `agent.configure` (`historyAsRun`, `guidedToolCalls`, `promptOrder`, and the
  `guards`, including `followUp`, and `dualZone` from 1.0.14).
- **New tools:** a small model depends heavily on the description text. Keep descriptions
  short and clear, and say explicitly "absolute vs. relative" and which side is which. Keep
  **the same text** in the app that the model was trained on: the car demo model expects
  `src/car/carToolDefinitions.h3.json`.

---

## Quick test checklist

1. Install, prebuild and run the app (1.1); choose a language. Also try a language that isn't built in
   (e.g. French): the download screen must show progress, and the app continues only when
   the download is complete (1.5). The second time, no download.
2. Pick a voice; **create the voice signature** (5 sentences); say **"Hey Coach"**.
3. Choose **Local AI · Car demo** → wait for the loading screen. The first time it downloads
   the model and its pre-warmed state (about 780 MB), then is ready in about a second (the
   calories demo: about 30–40 s the first time, about 1 s afterwards). General questions get the "set up a remote model" message
   (see 2.2).
4. Try the commands in 1.4. Check the car card (tool and exact arguments) and that the
   spoken sentence matches what happened.
5. Try **Local AI · Calories demo** the same way.
6. Remember the chat is turn-based (2.5): wait for the AI to finish before speaking again.
7. Also try a different voice: it must **not** activate the assistant, nor unlock the car.
