# DaVoice: AI Car Voice Agent (React Native example)

A focused example of an on-device voice assistant for a car. It runs the whole voice pipeline on the phone:

- <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake word detection</a>
- <a href="https://davoice.io/speaker-recognition" target="_blank" rel="noopener noreferrer">speaker verification</a> (optional)
- real-time speech to text
- the DaVoice Automotive Agent: a small on-device language model that turns what was said into car actions
- on-device text to speech for the reply

The car is **simulated** (the card on the screen). This example does not control a real vehicle.

## Flow

1. **Language**: pick the language for speech recognition and the voices. Every language, English and Brazilian
   Portuguese included, is downloaded on first use (about 170 MB); nothing is built into the app.
2. **Voice**: pick the voice that speaks the replies, or clone a new one.
3. **Speaker verification**: create a speaker signature, use a saved one, or skip.
4. **Wake word**: say the wake word.
5. **Car agent**: the car demo opens directly. Speak a command ("abre os vidros", "set the temperature to 21",
   "liga o aquecimento do banco do motorista"). The first start downloads the agent model (382 MB) and a pre-warmed state
   for your language (about 430 MB), so the first reply is fast.

**Back** returns to the wake-word screen; the next wake word opens the car agent again.

## Local confidence

The car screen has a **Local confidence** setting (Off, 0.80, 0.90, 0.95). The on-device model gives every car action a
probability. When it is below the setting, the action does not run: the request goes to the remote assistant, or, when
no remote assistant is set up, the app says "For this command I need a remote agent." A higher value means fewer wrong
actions and more requests sent to the remote assistant. It needs react-native-davoice-llm 1.0.15 or newer.

Step-by-step guides: [englishHowTo.md](./englishHowTo.md) (English) and [portugueseHowTo.md](./portugueseHowTo.md) (Português).

## Run it

```bash
npm install
npx react-native run-android      # or: cd ios && pod install && cd .. && npx react-native run-ios
```

`local.config.ts` holds optional keys (copy from `local.config.example.ts`); the car agent needs none of them.

The key implementation is in [App.tsx](./App.tsx), the car tools in [src/car](./src/car), the agent setup in
[src/aichat/provider.ts](./src/aichat/provider.ts) and the models in
[src/local_llm/constants.ts](./src/local_llm/constants.ts).
