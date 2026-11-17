# How-to: the DaVoice Car Agent example (React Native)

> For anyone (a developer, a tester or another agent) who runs, tests or copies parts of this example. File paths are relative to
> `example_car_agent/`. A Brazilian Portuguese version is in `portugueseHowTo.md`. Last update: 2026-11-17,
> `react-native-davoice-llm` 1.0.15.

The app is a voice assistant for a car that runs on the phone itself: wake word, speaker verification, speech recognition (STT),
the **DaVoice Automotive Agent** (a 0.6B language model on the device that turns what was said into car actions) and speech
synthesis (TTS). The car is **simulated** (the card on the screen). This example does not control a real vehicle.

> **Status: a test model.** The car agent's model ("DaVoice Automotive Agent 0.6B", checkpoint `g3c_it3639`) is still being
> trained. On a sealed set of 128 new sentences it never saw (run once, Brazilian Portuguese and English):
> - **86%** of the car commands (92 of 107) ended in exactly the right action;
> - **2 of 128** turns ran a wrong action (a temperature without the driver's side, the fan lowered by 2 instead of set to 2);
>   **no opposite action** ("open" for "close") and **no unsupported action**;
> - background speech and fragments were never acted on; 6 complete commands were answered with "say it again" instead.
>
> Treat it as a preview of the whole voice pipeline, not as final accuracy. Every car action is checked before it runs (2.2).

Packages (`package.json`):

| Package | What for |
|---|---|
| `react-native-wakeword` | wake word + speaker verification |
| `react-native-davoice` | STT + TTS (`Speech`), voice cloning, speaker filter on STT |
| `react-native-davoice-llm` (1.0.15) | the on-device model, `Agent` (a whole assistant turn), tools, call checks, Local confidence |
| `react-native-fs` | files: voice signature, downloaded voices and models, saved prompt states, the agent's database |

---

## 1. Using the app

### 1.1 Run it

```bash
cd example_car_agent
npm install                     # npm / package-lock.json; no Git LFS needed: no voice model is inside the app
cd ios && pod install && cd ..
npx react-native run-android    # or: npx react-native run-ios
```

- *Debug* builds take the JavaScript from Metro (`npx react-native start`). Android phone on USB: `adb reverse tcp:8081 tcp:8081`.
- Android release build: `cd android && ./gradlew :app:assembleRelease`.
- The app installs as **DaVoice Car Agent** (`com.exampleapp.caragent`), next to the full DaVoice example.
- JS logs on Android: `adb logcat | grep ReactNativeJS`; the agent's own log (every model output, check and reply):
  `adb logcat | grep DavoiceChat`.
- The DaVoice license keys are in the example's code. In your own app, use your own (info@davoice.io).

### 1.2 Startup flow

There is no spoken narration and no menu: the app goes straight from one step to the next.

1. **Language.** English, Português do Brasil, Português de Portugal, German, Greek, Spanish, French, Italian, Dutch, Danish or
   Swedish. **Every language is downloaded the first time it is chosen** (about 136–170 MB: its voice model and voice-cloning
   encoder); the button shows "⬇ N MB" and a download screen shows the progress. The language sets the STT locale, the voices,
   the language the agent replies in and the agent pack (`agent_automotive/` or `agent_automotive/pt-BR/`).
2. **Microphone permission.** Accept.
3. **Voice.** Pick a built-in voice, a voice you cloned earlier, or **clone a new voice** from a recording.
4. **Speaker verification** (1.3): create a voice signature, use the saved one, or skip.
5. **Wake word.** Say **"Hey Coach"** (model `hey_coach_model_28_22012026b.dm`, the same in every language). In a debug build the
   button **Continue without wake word (dev)** does the same without speaking.
6. **The car agent opens.** The first time, it downloads the model (382 MB) and a pre-warmed state for your language (about
   430 MB) with one progress bar; after that the agent is ready in under a second. Speak your command after each reply.

**Back** returns to the wake-word screen; the next "Hey Coach" opens the car agent again. **Reset Chat** starts a new conversation.

### 1.3 Speaker verification

The app records a **voice signature** of the owner (5 samples, `SV_ONBOARDING_SAMPLE_COUNT` in `src/appflow.ts`; say natural
sentences in a quiet room) and saves it to `Documents/sv_enrollment.json`. It is then enrolled in the wake word **and** in STT, so:
- the wake word only fires for the enrolled voice;
- every STT result says who spoke (`speakerIds`, `speakerId`).

Decision threshold: `SV_DECISION_THRESHOLD` in `src/appflow.ts` (0.34 Android, 0.35 iOS).

**Doors:** `open_door` and `unlock_car` declare an authorization scope (`"door_locks"` in `src/car/carToolDefinitions.h3d.json`).
The agent never runs them without a "yes" from the app: `isToolAuthorized` in `src/agent/LocalAgent.ts` allows them only when the
enrolled owner was verified in this request (or when verification was skipped, since this is a demo).

### 1.4 What to say

- **Windows:** "open the windows", "close the rear right window", "open the passenger window halfway" / "abre os vidros",
  "fecha o vidro do carona", "abaixa os vidros de trás".
- **Climate:** "set the temperature to 22", "two degrees warmer", "20 for the passenger" / "coloca o ar em vinte e dois",
  "vinte graus pro carona", "coloca 20 pro motorista e 23 pro passageiro", "ventilador no três", "liga o desembaçador".
- **Seats:** "turn on my seat heating", "ventilate the passenger seat" / "liga o aquecimento do banco do motorista".
- **Doors and locks:** "lock the car", "open the rear left door" / "tranca o carro", "fecha as portas".
- **Media and navigation:** "tune to 98.5 FM", "turn the volume up", "take me to Campinas", "find a gas station on the way" /
  "sintoniza noventa e oito ponto cinco", "me leva pra Campinas", "quanto tempo falta?".
- **Two commands at once:** "close the windows and lock the car" / "fecha os vidros e tranca o carro".
- **Undo:** "undo" / "desfaz" puts back what the last command changed.
- **Follow-ups:** after "open the driver's window": "now the passenger one", "close it" / "agora o do carona", "fecha ele".
- **Incomplete requests:** "open a window" → "Which window?".
- **Not a car command** ("tell me about Brazil"): handed to the remote assistant. This example has none set up
  (`LOCAL_LLM_LAYER2 = 'none'` in `src/local_llm/constants.ts`), so the app says so.

---

## 2. The car agent

### 2.1 The car screen

| Element | What it shows / does |
|---|---|
| Car card | the simulated car's state (temperature, fan, windows, locks, volume, ...) and the last action |
| You said / Reply | what STT heard, and the agent's reply (also spoken) |
| Model · Change | the on-device model: **DaVoice Automotive Agent 0.6B** (`g3c_it3639`, the default) or the backup `r8d_it150`; you can also add your own GGUF |
| Local confidence · Change | Off → 0.80 → 0.90 → 0.95 (2.3) |
| Reset Chat / Back | a new conversation / back to the wake-word screen |

### 2.2 How a turn works

1. **Scope.** Only straightforward car commands reach the model (up to 10 words; up to 15 when clear; up to 22 for a clear car
   request). General questions go to the remote assistant, garbled or vague speech is asked again, car functions without a tool
   are declined, background speech is ignored. Setting: `scope` in `src/local_llm/constants.ts`.
2. **The model** writes a tool call (for example `set_window {"window": "all", "position": "open"}`), with the car's tools in its
   prompt (`src/car/carToolDefinitions.h3d.json`, the wording the model was trained with).
3. **Local confidence** (if on): a call the model is not sure enough of never runs (2.3).
4. **Checks.** Every call is checked against the user's own words before it runs: wrong object (doors for windows), on/off and
   open/close flips, zones, numbers the user never said, values out of range. A wrong-tool call gets one more try with that tool
   excluded; otherwise the user is asked. Setting: `callGuards: 'correct'` and `guardRetry` in `src/local_llm/constants.ts`.
5. **The car** (`src/car/carTools.ts`) runs the action on the simulated car and the reply is spoken.

The prompt's fixed part (system prompt + tools) is processed once and saved; the **pre-warmed state** downloaded with the model is
that saved state, so the first turn does not wait about 30 seconds. A pre-warmed state only fits the exact model, agent pack,
tools and prompt settings it was made with.

### 2.3 Local confidence

Each call has a probability: the product of the probabilities of the tokens the model picked. With Local confidence on, a call
below the setting does **not** run; the request goes to the remote assistant, or, with none set up, the app says
**"For this command I need a remote agent."** / **"Para esse comando eu preciso de um agente remoto."**

Measured with `g3c_it3639` on commands it was never trained on:

| Setting | Wrong actions removed | Valid commands sent away |
|---|---|---|
| Off (default) | 0% | 0% |
| 0.80 | about 40% | about 13% |
| 0.90 | about two thirds | about 20% |
| 0.95 | about 70% | about 27% |

Even at 0.95 some wrong calls are made with high confidence, so it does not reach zero on its own. Code: the choices and the message
in `src/local_llm/constants.ts`, the stored value in `src/local_llm/ModelRegistry.ts`, the `configure({confidence: {min}})` call in
`src/aichat/provider.ts`, the message in `src/aichat/remote.ts`.

### 2.4 What is downloaded

Only the wake word (`android/app/src/main/assets/hey_coach_model_28_22012026b.dm`) and the speaker-verification model (`sv.dm`) are
inside the app. Everything else comes from DaVoice's Cloudflare R2 (`https://pub-27f94b1602c647ab95a601086cf52820.r2.dev`) the
first time it is needed, and each file is checked by sha256.

| What | From | To | When |
|---|---|---|---|
| Voice model + voice-cloning encoder of the chosen language | `language-packs/<file>` | `Documents/language_packs/<language>/` | when the language is chosen |
| The car agent model (GGUF, 382 MB) | `agent-llm/<file>` | `Documents/local_llm/models/` | when the car agent first opens |
| Pre-warmed state for English or Brazilian Portuguese (about 430 MB) | `agent-llm/prewarm/<file>` | next to the model | with the model |

- Languages: `language_packs.json` (`"bundled": []` = every language downloads). `metro.config.js` turns it into
  `src/tts/languagePacks.generated.ts` on every bundle.
- Models and pre-warmed states: `src/local_llm/constants.ts` (`url`, `sizeBytes`, `sha256`, `prebuiltStates`).

---

## 3. Where the code is

| Part | Files |
|---|---|
| Startup flow, screens, wake word → car agent | `App.tsx`, `src/wakeword/index.ts`, `src/initialization/index.ts` |
| Speaker verification | `src/speaker_verification/` |
| STT / TTS, voices, cloning, language packs | `src/stt/index.ts`, `src/tts/` |
| The agent and its pack | `src/agent/LocalAgent.ts`, `src/agent/AgentPack.ts`, `agent_automotive/` |
| Model loading, warm-up, turns | `src/aichat/provider.ts`, `src/local_llm/` |
| The simulated car | `src/car/` (tools, state, card, undo) |

## Quick test checklist

1. Fresh install → choose Brazilian Portuguese → the language pack downloads → pick a voice → skip speaker verification.
2. "Hey Coach" (or the dev button) → the car agent opens; the first time the model and the pre-warmed state download.
3. "abre os vidros" → all windows open; "fecha eles" → closed; "desfaz" → back.
4. "coloca 20 pro motorista e 23 pro passageiro" → both sides set.
5. "abre um vidro" → the agent asks which one.
6. Local confidence → 0.90; say a few commands: unsure ones are not run and the app says it needs a remote agent.
7. Back → wake-word screen → "Hey Coach" → the car agent again.
