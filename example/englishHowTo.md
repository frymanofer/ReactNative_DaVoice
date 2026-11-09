# How-to: the DaVoice example app (React Native)

> For: another Claude agent that will use, test or extract parts of this example app
> (`example/`). Everything here was checked against the code. File paths are relative to
> `example/`. A Brazilian Portuguese version is in `portugueseHowTo.md`.

> **Status: initial test models.** The on-device model in this demo ("DaVoice Agent 0.6B (VW demo)", checkpoint
> `ft7c_it750`) is an **early model for testing, not a finished product**. In our current tests it executes roughly
> 55–60% of Brazilian Portuguese car commands exactly right (tool and arguments). It sometimes declines a command
> it could do, and occasionally runs a wrong or opposite action, which is why every car action here is simulated.
> Further training is required and is in progress: targeted data for the failures found (including those found on
> phones), deterministic checks in the app layer, and new checkpoints evaluated before they replace this one. Treat
> the results as a preview of the voice pipeline (wake word, speaker verification, STT/TTS, on-device agent), not as
> final accuracy.

The app demonstrates a voice assistant that runs on the device itself:

- wake word;
- speaker verification (speaker identification);
- speech recognition (STT) and speech synthesis (TTS), with voice cloning;
- a local AI chat (an LLM on the device) with tools: a calorie tracker and a simulated car
  (automotive commands).

Packages used (`package.json`):

| Package | What for |
|---|---|
| `react-native-wakeword` | wake word + speaker verification (onboarding and verification) |
| `react-native-davoice` | STT + TTS (`Speech`), voice cloning, speaker filter on STT |
| `react-native-davoice-llm` | on-device LLM, `Agent` (a whole assistant turn), tools |
| `react-native-fs` | files: voice signature, downloaded models, the agent's database |

---

## 1. Using the app, step by step

### 1.1 Run the app

```bash
cd example
npm install            # the project uses npm / package-lock.json
cd ios && pod install && cd ..
npx react-native run-android     # or: npx react-native run-ios
```

- In a *debug* build the JavaScript comes from Metro (`npx react-native start`). On Android
  with the phone on USB: `adb reverse tcp:8081 tcp:8081`.
- JS logs on Android: `adb logcat | grep ReactNativeJS`.
- The DaVoice license keys are in the example's code. In another app, use your own
  (contact: info@davoice.io).

### 1.2 Startup flow

1. **Language.** The first screen asks for the language (English, Português do Brasil,
   German, Spanish, French, Italian, Dutch). The choice sets:
   - the TTS model (e.g. `assets/models/model_ex2_rich_kate.dm` for English,
     `model_ex2_portuguese_brv1.dm` for pt-BR);
   - the voice-cloning encoder (`assets/models/embedder_*.dm`);
   - the STT locale (`en-US`, `pt-BR`, ...);
   - the language the LLM replies in;
   - the agent pack (`agent/` for English, `agent/pt-BR/` for Portuguese).

   Configuration: `APP_LANGUAGES` in `src/appflow.ts` and the model maps in
   `src/tts/index.ts`.
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
| **Local AI Chat** | STT → on-device LLM → TTS. Includes calories and the simulated car. |
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

For sensitive actions, such as "open the doors", "unlock the car", "open the trunk" or a
payment, the recommended rule is: **run it only if the sentence's verified speaker is the
owner.** The `Agent` (`react-native-davoice-llm`) already has a mechanism for this:

1. Declare the sensitive tool with `execution.authorization` and a scope:
   ```json
   {
     "name": "unlock_doors",
     "description": "Unlocks the car doors.",
     "inputSchema": { "type": "object", "properties": {}, "required": [] },
     "execution": { "authorization": { "scope": "door_locks", "message": "Unlock the doors?" } }
   }
   ```
2. The agent core **never runs** that tool without a "yes" from the app. It sends an
   `authorizeTool` request to `onRequest` (see `src/agent/LocalAgent.ts`). Answer based on
   the verified speaker:
   ```ts
   const OWNER_ID = 'owner';       // the id used in addSpeaker(OWNER_ID, enrollmentJsonPath)
   let lastSpeakerId: string | undefined;
   Speech.onSpeechResults = (e) => { lastSpeakerId = e.speakerId; /* ... */ };

   onRequest: async (request) => {
     if (request.type === 'authorizeTool') {
       const sensitive = request.scope === 'door_locks';
       return { authorized: !sensitive || lastSpeakerId === OWNER_ID };
     }
     if (request.type === 'confirmTool') return { confirmed: await askToConfirm(request) };
     // ...
   }
   ```
3. For a plain yes/no confirmation (no speaker check), use `execution.confirmation`. The
   example does this for `send_message`: the app shows a dialog before sending.

**Current state of this example, to avoid confusion:**
- The simulated car has **no** door or lock tool. Such requests are declined as "not
  available".
- `AUTHORIZED_TOOL_SCOPES` in `src/agent/LocalAgent.ts` is **empty**, so any tool that
  declares `authorization` is refused.

The code above is the pattern to implement when a sensitive tool is added.

### 1.4 Sample commands (Local AI Chat)

Say "Hey Coach", wait for the app to listen, then say a command.

- **Car (simulated), English:**
  - "open the passenger window"
  - "close all the windows"
  - "set the temperature to 22 degrees"
  - "two degrees warmer"
  - "fan on level three"
  - "turn on the windshield defrost"
  - "play some jazz"
  - "tune to 98.5 FM"
  - "turn the volume up"
  - "take me home"
  - "how much range do I have?"
- **Car, Brazilian Portuguese** (the VW demo model was trained mostly in pt-BR):
  - "abre a janela do passageiro"
  - "coloca o ar em vinte e dois graus"
  - "liga o desembaçador do para-brisa"
  - "sintoniza noventa e oito vírgula cinco"
- **Incomplete requests (the app should ask):**
  - "open a window" → "Which window should I open?"
  - "turn on the defrost" → "The windshield or the rear window?"
- **Calories:**
  - "I had two eggs"
  - "how many calories today?"
  - "undo"
- **Conversation and knowledge:**
  - "who are you?" (fixed reply from `agent/agent.json`, `fixedReplies`)
  - "tell me a story"
  - "write a short poem about the sea" or "tell me a fun fact about Brazil": the model
    hands these over; with no remote model set up, the app answers with the message in 2.2

---

## 2. The local AI chat: what to expect and how to test it

### 2.1 Models and download

- **Model picker:** in Local AI Chat mode (`src/local_llm/ModelPicker.tsx`). The list is in
  `src/local_llm/constants.ts`:
  - **"DaVoice Agent 0.6B (VW demo)"** (default and first choice): Qwen3-0.6B fine-tuned to
    decide tools, also trained on Brazilian Portuguese automotive commands;
  - larger general models as alternatives: Qwen2.5 1.5B/3B, Gemma 3n. They answer
    everything on the device, but are slower.
- **Download:** each model is downloaded once (the "DaVoice Agent" is about 380 MB) and
  checked by sha256. If the hash doesn't match, the file is deleted. Use Wi-Fi.
- **On-screen states:** download → "Warming up..." → "Ready". The warm-up processes the
  system prompt (persona + calorie and car tools, about 3,300 tokens).
  - **The first time** it takes about **40 s** on a Galaxy S20 (CPU). Then the app **saves
    that state to disk** (`*.kvstate` in the models folder, about 380 MB) with
    `saveState` from `react-native-davoice-llm`.
  - **On later starts** the state is restored (`loadState`) in about a second, and "Ready"
    comes right away.
  - The state is saved again only when the prompt changed a lot (other tools, another
    language). Code: `src/aichat/provider.ts` (`warmUp`) and `kvStatePath` in
    `src/local_llm/ModelManager.ts`.
- **Don't speak before "Ready":** a command said during the warm-up waits until the warm-up
  is done.

### 2.2 How a turn works

- The fine-tuned model decides on its own, every sentence: call a tool (car, calories,
  memory, web search), ask (incomplete request), decline (not supported) or **hand it
  over** to a remote model.
- **What gets handed over:** general knowledge, writing, small talk, and the occasional
  turn where the small model produced no reply. The 0.6B model was trained to **act**
  (tools), not to chat.
- **Remote model: current setup.** Right now **no remote model is set up**
  (`LOCAL_LLM_LAYER2 = 'none'` in `src/local_llm/constants.ts`). Everything handed over gets
  this fixed reply, with no "let me check" first:
  - English: **"I need to send this to a remote Model. To make this work, please setup a
    remote model in the App."**
  - Brazilian Portuguese: *"Preciso enviar isso para um modelo remoto. Para isso funcionar,
    configure um modelo remoto no aplicativo."*

  The text is in `LOCAL_LLM_NO_REMOTE_MESSAGE` (`src/local_llm/constants.ts`) and is returned
  by `answerRemoteRequest` in `src/aichat/remote.ts`. This message is **expected**, not an
  error: car and calorie commands keep working normally, offline.
- **How to set up a remote model.** Change `LOCAL_LLM_LAYER2`:
  - `'cloud'`: the app sends the request to Gemini (`src/aichat/remote.ts`, key
    `GEMINI_API_KEY` in `local.config.ts`). The agent says a short filler while it waits;
    if Gemini fails, it says it couldn't.
  - Any other service (your own server, another cloud LLM): implement
    `answerRemoteRequest` in `src/aichat/remote.ts`. It receives the request (`query`,
    `userText`, history, memory facts, tool results) and returns `{ text }`, or
    `{ failure, detail }` on error.
  - `'device'`: a second model on the phone (`LOCAL_LLM_LAYER2_MODEL`, the original
    Qwen3 0.6B, about 470 MB). **Not recommended:** both models compete for the same CPU,
    everything gets much slower, and the small model sometimes mixed saved facts into
    action requests.
- **Web search:** Wikipedia by default. Tavily or Brave need a key in `local.config.ts`.
- **Spoken replies:** each sentence goes to TTS as soon as it is ready. The text shows on
  screen before the voice.

### 2.3 What to expect (honestly)

- It is a **0.6B-parameter model on a phone**. It picks the right tool most of the time,
  but **often gets arguments wrong**, for example:
  - wrong side/zone ("passenger window" → all);
  - absolute vs. relative ("22 degrees" vs. "two degrees warmer");
  - spoken numbers.

  Now and then it runs a wrong or opposite action. That's why the car is **simulated** and
  sensitive actions need `authorization` / `confirmation`.
- **Latency (Galaxy S20, CPU only):**
  - about 5 s to the first word;
  - a full car command (tool call + "Done.") takes 10–15 s.

  iPhones with Metal are much faster.
- **User memory:** with a saved fact about the car (e.g. "my car is red"), the 0.6B model
  sometimes answers with the fact instead of acting on a car request. This is a known
  limitation of the current model.
- Requests the car can't do (doors, locks, headlights, parking brake) should be
  **declined**, not executed.

### 2.4 How to test

1. Enter **Local AI Chat**. **"DaVoice Agent 0.6B (VW demo)"** is already the default.
   Wait for "Ready" (about 40 s the first time; seconds afterwards).
   - To test the saved state: close the app completely, open it again and go back to Local
     AI Chat. The log shows `[LocalLLM] KV state restored: N tokens in X ms`.
   - Also ask a general question ("tell me a fun fact about Brazil"): the answer should be
     the remote-model message from 2.2.
2. **Cards on screen:**
   - **Calories** (`src/calories/CaloriesCard.tsx`): today's total and list.
   - **Car** (blue, `src/car/CarCard.tsx`), right below:
     - the latest action in words and the **exact call** the AI made, e.g.
       `set_window(window: passenger, position: open)`;
     - the two actions before it;
     - a one-line car state;
     - **Parked / Driving** button: while driving, the app refuses the trunk, the charge
       port, rotating the screen, opening all windows and some modes (`NOT_WHILE_DRIVING`
       in `src/car/carTools.ts`);
     - **Reset** button: resets the car.
3. **What to check for each command:**
   - the right tool;
   - the exact arguments (side, value, unit);
   - a question when information is missing;
   - a decline when it's not supported;
   - **no action run** on conversational sentences ("thanks", "that's great").
4. **Registered tools:** `LOCAL_LLM_CAR_TOOLS` in `src/local_llm/constants.ts`:
   - `'vw_demo'` (17 tools, default: shorter prompt, faster);
   - `'all'` (the whole 30-tool catalog).
5. **On-device conversation log (Android):**
   `adb shell run-as com.exampleapp cat files/davoice_chat.log`. Shows what the model
   generated, the tool calls and their results.
6. **With speaker verification on:** check that the wake word doesn't fire for another
   person, and that `speakerId` shows in the STT results.

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
- **Assets:** the wake-word `.dm` model must be in the **native bundle**:
  - Android: `android/app/src/main/assets/hey_coach_model_28_22012026b.dm`;
  - iOS: added to the Xcode project (Copy Bundle Resources), as in this example.

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
  - `src/appflow.ts`: threshold and sample count.
- **Asset:** `sv.dm` in the native bundle:
  - Android: `android/app/src/main/assets/sv.dm`;
  - iOS: in the Xcode project.

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
  authorization pattern in 1.3.

### 3.3 STT and TTS (`react-native-davoice`)

- **Code:**
  - `src/initialization/index.ts`: `initializeSpeechLibrary` (calls `Speech.initAll`),
    microphone permission;
  - `src/stt/index.ts`: result handlers, merging partial/final text;
  - `src/tts/index.ts`: model per language, voices, speeds;
  - `src/tts/voiceClone.ts`: voice cloning.
- **Assets** (`require` in JS, through Metro; `metro.config.js` already accepts `.dm`):
  - TTS: `assets/models/model_ex2_rich_kate.dm` (English),
    `model_ex2_portuguese_brv1.dm` (pt-BR, about 143 MB), one per language;
  - voice cloning: `assets/models/embedder_en.dm`, `embedder_brv1.dm`, ...
- **Minimal API:**
  ```ts
  import Speech from 'react-native-davoice/speech';
  await Speech.initAll({ locale: 'en-US', model: require('./assets/models/model_ex2_rich_kate.dm') });
  Speech.onSpeechResults = (e) => console.log(e.value[0], e.speakerId);
  await Speech.unPauseSpeechRecognition(-1);   // start listening
  await Speech.pauseSpeechRecognition();       // before speaking
  await Speech.speak('Done, I opened the window.', 0, 1.0);
  ```
- **Voice cloning:**
  `Speech.createVoiceClone(recording, outputFolder + '/', require('./assets/models/embedder_en.dm'))`,
  then `Speech.setExternalVoicesPath(folder)` and `changeVoice(name)`. If the result has
  `warnings`, ask the user to record again.
- **Text for speech:** don't rewrite text for speech in the app (numbers, domains such as
  "DaVoice.io"). The TTS library already does that pre-processing.

### 3.4 Local AI chat and tools (`react-native-davoice-llm`)

- **Install:**
  ```sh
  npm install react-native-davoice-llm
  cd ios && pod install
  ```
  On Android, add the package's Maven repository in `android/build.gradle`:
  ```gradle
  allprojects { repositories { maven { url "${project(":react-native-davoice-llm").projectDir}/libs" } } }
  ```
- **Code to copy:**
  - `src/local_llm/`: model list and URLs with sha256 (`constants.ts`), download, registry
    and saved state (`ModelManager.ts`, `ModelRegistry.ts`), loading
    (`LocalLLMLoader.ts`), picker (`ModelPicker.tsx`);
  - `src/agent/LocalAgent.ts`: creates the `Agent` with the language's pack, `onRequest`
    (`remote` requests for the remote model, `authorizeTool`, `confirmTool`);
  - `src/aichat/remote.ts`: the remote model (`answerRemoteRequest`: the fixed message,
    Gemini or your own service, see 2.2);
  - `src/agent/AgentPack.ts`: picks `agent/` or `agent/pt-BR/`;
  - `src/aichat/provider.ts`: sets the agent up per model (tools, remote model, warm-up,
    saved state with `saveState` / `loadState`) and streams to TTS;
  - **agent pack:** `agent/agent.json` (persona, messages, fixed replies, remote-model
    texts) and `agent/skills/calories/` (`skill.json`, `foods.json`); the same under
    `agent/pt-BR/`. They're JSON files: behaviour changes without code changes;
  - **car:** `src/car/carToolDefinitions.json` (tool definitions in MCP shape: `name`,
    `description`, `inputSchema`, `execution`), `src/car/carTools.ts` (handlers),
    `src/car/CarState.ts` (simulated state), `src/car/CarCard.tsx` (UI). Don't give a
    `.ts` module and a `.json` file the same base name: Metro resolves the `.json` first.
- **Minimal API:**
  ```ts
  import { setLicense, loadModel, Agent } from 'react-native-davoice-llm';
  await setLicense(LICENSE);
  await loadModel(pathToGguf, { contextSize: 8192 });
  const agent = await Agent.create({
    pack: { agent: require('./agent/agent.json'), skills: [/* {skill, data} */] },
    databasePath: `${RNFS.DocumentDirectoryPath}/davoice_agent.db`,
    chatTemplate: 'qwen3',
  }, { onRequest });
  await agent.setTools(myTools);          // e.g. the car's
  const r = await agent.turn({ text, history }, (ev) => { if (ev.type === 'text') speak(ev.text); });
  // agent.cancel() stops a running turn (used for interruptions, see 2.5)
  ```
- **Models:** download the GGUF from the URLs in `src/local_llm/constants.ts` and check the
  sha256 (the example already does). Fine-tuned models need the same `chatTemplate`
  (`qwen3`) and the entry's settings (`usesRouter: false`, `modelTools: true`,
  `remoteAssistant: true`).
- **New tools:** a small model depends heavily on the description text. Keep descriptions
  short and clear, and say explicitly "absolute vs. relative" and which side is which. Keep
  **the same text** in the app that the model was trained on: the car demo model expects
  the descriptions in `src/car/carToolDefinitions.json`.

---

## Quick test checklist

1. Install and run the app (1.1); choose a language.
2. Pick a voice; **create the voice signature** (5 sentences); say **"Hey Coach"**.
3. Choose **Local AI Chat** (the **VW demo** model is the default) → wait for "Ready".
   General questions get the "set up a remote model" message (see 2.2).
4. Try the commands in 1.4 and check the blue car card (tool and exact arguments).
5. Remember the chat is turn-based (2.5): wait for the AI to finish before speaking again.
6. Also try a different voice: it must **not** activate the assistant.
7. For doors, locks or payments, implement `execution.authorization` + the `speakerId`
   check (1.3) before any real action.
