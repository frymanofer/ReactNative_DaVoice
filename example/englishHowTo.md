# How-to: the DaVoice example app (React Native)

> For: another Claude agent that will use, test or extract parts of this example app
> (`example/`). Everything here was checked against the code (last update: 2026-11-11,
> `react-native-davoice-llm` 1.0.13). File paths are relative to `example/`. A Brazilian
> Portuguese version is in `portugueseHowTo.md`.

> **Status: test models, still in training.** The car demo's on-device model ("DaVoice
> Automotive Agent 0.6B", checkpoint `ft7f2_it900`) is **a test model, not a finished
> product**:
> - on a Galaxy S20, with the app's car tools, it gets about **78% of car commands exactly
>   right** (tool and arguments), in Brazilian Portuguese as well;
> - on our newer, harder held-out test set it gets about **59%** of Brazilian Portuguese
>   commands exactly right.
>
> It sometimes confuses a window with a door, declines a command it could do, or (rarely) runs
> a wrong action. That is why every car action is **simulated** and checked by the app
> (guards, see 2.3). A dedicated Automotive Agent is being trained (Brazilian Portuguese
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
| `react-native-fs` | files: voice signature, downloaded models, saved prompt states, the agent's database |

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
- **Android release build:** `cd android && ./gradlew :app:assembleRelease`.
  - `android/gradle.properties` gives Gradle 8 GB, which packaging the ~1.5 GB APK needs.
  - `android/app/build.gradle` rebuilds the JS bundle when only the agent packs (`agent/`,
    `agent_automotive/`) or the tool JSON in `src/` change.
- JS logs on Android: `adb logcat | grep ReactNativeJS`.
- The DaVoice license keys are in the example's code. In another app, use your own
  (contact: info@davoice.io).

### 1.2 Startup flow

1. **Language.** The first screen asks for the language: English, Português do Brasil,
   Português de Portugal, German, Spanish, French, Italian or Dutch.
   - Hebrew is supported in the code but hidden from this screen (`hidden: true` in
     `APP_LANGUAGES`). Its TTS files are not bundled: to bring it back, restore the two
     `require()`s marked in `src/tts/index.ts` and remove `hidden`.
   - The choice sets:
     - the TTS model (e.g. `assets/models/model_ex2_rich_kate.dm` for English,
       `model_ex2_portuguese_brv1.dm` for pt-BR);
     - the voice-cloning encoder (`assets/models/embedder_*.dm`);
     - the STT locale (`en-US`, `pt-BR`, ...);
     - the language the LLM replies in;
     - the agent pack's language (`agent/` or `agent/pt-BR/`, and the same under
       `agent_automotive/`).

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
  - Car demo: **DaVoice Automotive Agent 0.6B (r4b)**, `LOCAL_LLM_DAVOICE_AUTOMOTIVE_R4B`
    (checkpoint `r4b_it100`, about 380 MB, downloaded once and checked by sha256).
  - Calories demo: the Personal Agent, still `ft7f2_it900`.
- **Other models:** each demo remembers its own pick from **Change** (model picker,
  `src/local_llm/ModelPicker.tsx`). The picker also lists ft7e (the production default,
  `LOCAL_LLM_DEFAULT_MODEL`), ft7c (fallback), the experimental it900 entry, the older
  Automotive Agent `ft7f2_it900`, the experimental C3 and A checkpoints (backups: not hosted,
  only when the file is copied into the models folder), and larger general models (Qwen2.5
  1.5B/3B, Gemma 3n). The larger ones are slower.
  - Only one model is in memory at a time: picking another one replaces it.
  - A demo's earlier pick wins over a new default: on a phone where another model was picked
    in the car demo, pick r4b in **Change** (or clear the app's data).
- **Loading screen:** after you pick a demo, the app shows its own loading screen with
  three steps until the model is ready:
  1. Download (progress bar);
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
  - **The first time** for each demo and language it takes about **30–40 s** on a Galaxy
    S20 (CPU). The app then **saves that processed prompt** (`*.kvstate` in the models
    folder, about 435 MB) with `saveState` from `react-native-davoice-llm`.
  - **Afterwards** the state is restored (`loadState`) in **under a second**, and "Ready"
    comes right away. Measured on the S20: restore 0.7–0.9 s, warm-up 0.5–0.6 s.
  - States are kept **per prompt** (demo, language, tools): the newest 2 per model file.
    Switching demos is fast after each demo's first warm-up.
  - A new day still pays part of the warm-up, because the date sits near the top of the
    prompt.
  - Code: `warmUp` in `src/aichat/provider.ts`; `kvStatePath` and `stablePromptKey` in
    `src/local_llm/ModelManager.ts`.

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
   - `v1` (the original wording, for the old ft7c).
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
  - `src/speaker_verification/currentSpeaker.ts`: who was verified in this request,
    `ownerMayAct()` (used to authorize the door tools, 1.3);
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
  door authorization in 1.3.

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
  - Every `require()` of a `.dm` file ships it in the app, even if that code never runs.
    Remove the `require()` of a language you don't offer (that's how Hebrew is left out).
- **Minimal API:**
  ```ts
  import Speech from 'react-native-davoice/speech';
  await Speech.initAll({ locale: 'en-US', model: require('./assets/models/model_ex2_rich_kate.dm') });
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
  cd ios && pod install
  ```
  On Android, add the package's Maven repository in `android/build.gradle`:
  ```gradle
  allprojects { repositories { maven { url "${project(":react-native-davoice-llm").projectDir}/libs" } } }
  ```
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
  Automotive Agent also `historyAsRun: true` and `guidedToolCalls: true`). `provider.ts` sends
  them to `agent.configure` (`historyAsRun`, `guidedToolCalls`, `promptOrder`, and the
  `guards`, including `followUp`, and `dualZone` from 1.0.14).
- **New tools:** a small model depends heavily on the description text. Keep descriptions
  short and clear, and say explicitly "absolute vs. relative" and which side is which. Keep
  **the same text** in the app that the model was trained on: the car demo model expects
  `src/car/carToolDefinitions.h3.json`.

---

## Quick test checklist

1. Install and run the app (1.1); choose a language.
2. Pick a voice; **create the voice signature** (5 sentences); say **"Hey Coach"**.
3. Choose **Local AI · Car demo** → wait for the loading screen (about 30–40 s the first
   time, about 1 s afterwards). General questions get the "set up a remote model" message
   (see 2.2).
4. Try the commands in 1.4. Check the car card (tool and exact arguments) and that the
   spoken sentence matches what happened.
5. Try **Local AI · Calories demo** the same way.
6. Remember the chat is turn-based (2.5): wait for the AI to finish before speaking again.
7. Also try a different voice: it must **not** activate the assistant, nor unlock the car.
