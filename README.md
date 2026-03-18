# React Native Voice AI On Device by DaVoice

React Native Voice AI on device for **speaker identification**, **speaker verification**, **wake word detection**, **keyword spotting**, **speech to text**, and **text to speech** on **iOS** and **Android**.

This repository shows how to build a full **on-device voice AI** experience in React Native with DaVoice. Instead of stitching together separate mobile voice packages that often conflict around microphones, audio routing, speech sessions, and iOS behavior, this solution is designed to run the full voice pipeline in a coordinated way:

- **Speaker identification / speaker verification** - onboarding and real-time
- **Wake word / keyword detection / Hotword** - Real time Wake Word detection. **Supports real time speaker verified and isolation**.
- **Speech to Text / Real time ASR** - Real time ASR, Supports all languages. **Supports real time speaker verified and isolation**.
- **Voice Cloning / Text to Speech** - Cloning any voice any language.
- **On-device Text to Speech** - Human like text to speech, quality bits top cloud providers. Supports all cloned voices.
- **Smooth audio flow between all voice components** - Audio session handling across the flows.
- React Native support for iOS and Android

For teams searching for **React Native text to speech**, **React Native speech to text**, **React Native wake word**, **React Native speaker identification**, or **React Native speaker verification**, this repository is intended as a full on-device solution rather than a single isolated feature.

By [DaVoice.io](https://davoice.io)

## Why this repository exists

Most mobile voice stacks break down when you try to combine:

- wake word detection with live ASR
- speaker verification with speech recognition
- iOS audio routing with always-listening experiences
- React Native wrappers from different vendors

This repository demonstrates a unified **React Native voice AI** flow that avoids the usual integration problems, especially on iOS where microphone ownership, interruptions, ducking, output routing, and speech-session coordination often become the real problem.

The example app shows how to:

- start from speaker identificaiton onboarding - or use a saved verification signature.
- Move to an always-listening wake word - configurable: with speaker identification or without.
- pause wake word detection at the right moment.
- transition into speech recognition.
- speak back using on-device TTS.
- resume the voice pipeline cleanly.

## Core capabilities

### 1. React Native wake word detection

Use custom wake words and keyword spotting locally on the device. This is useful for hands-free experiences such as assistants, smart controls, in-car flows, accessibility, healthcare workflows, industrial apps, and branded voice triggers.

Also known as:

- wake word detection
- keyword spotting
- hotword detection
- trigger word detection
- phrase spotting
- voice trigger

### 2. React Native speaker identification and speaker verification

The example supports speaker onboarding and reuse of a saved speaker signature. You can choose to:

- skip speaker verification
- create a new speaker signature
- reuse a saved signature
- redo onboarding and replace the old signature

That makes it possible to gate wake-word flows or speech-to-text flows by the onboarded speaker.

### 3. React Native speech to text on device

After wake word detection, the app transitions into real-time speech recognition. The example demonstrates flow control between wake word and STT, including pausing detection to reduce conflicts and improve user experience.

This matters because in real products the hard part is not only speech recognition accuracy. The hard part is the orchestration between:

- microphone capture
- wake word state
- ASR start timing
- TTS playback
- re-entry into listening mode

### 4. React Native text to speech on device

The example includes high-quality on-device TTS with multiple voice and model choices. It supports interactive voice flows where the app can speak, pause recognition, and then return to listening.

For teams searching for **React Native text to speech on device** or **offline TTS for React Native**, this repository shows how TTS fits into a complete mobile voice stack instead of existing as a disconnected feature.

## What makes this different

- **Full voice pipeline**: wake word, speaker verification, speech to text, and text to speech in one React Native flow
- **On-device processing**: designed for offline-first or privacy-sensitive products
- **Cross-platform**: iOS and Android
- **Audio-session aware**: built around the reality of mobile audio routing and interruptions
- **Better flow control**: the example intentionally pauses wake word detection before speech recognition to improve reliability and user experience
- **Designed for real apps**: not just a single-feature demo

## Example app flow

The implementation in [example/App.tsx](/Volumes/T9/projects/ReactNative_DaVoice/example/App.tsx) demonstrates a complete voice journey:

1. Request microphone permissions.
2. Optionally onboard a speaker or reuse a saved speaker signature.
3. Start wake word detection.
4. Detect the wake phrase.
5. Pause detection so the app can transition cleanly to speech recognition.
6. Optionally enforce the onboarded speaker.
7. Start real-time speech to text.
8. Speak back with on-device TTS.
9. Resume the listening experience.

It also includes:

- sharing recorded wake-word audio
- TTS voice/model selection
- TTS test mode
- saved speaker enrollment handling
- iOS audio-routing configuration hooks

## Why this matters for iOS

A lot of voice packages appear to work in isolation but fail when combined on iOS. Common issues include:

- the microphone is already owned by another voice component
- text to speech interrupts recognition badly
- wake word and ASR compete for audio
- audio routing changes between speaker, earpiece, Bluetooth, and CarPlay
- apps behave differently in foreground, background, or after interruptions

This repository is specifically valuable because it tackles those integration edges in a single React Native voice architecture.

## Repository structure

- [README.md](/Volumes/T9/projects/ReactNative_DaVoice/README.md): main overview for the full voice AI solution
- [example/README.md](/Volumes/T9/projects/ReactNative_DaVoice/example/README.md): how to run and understand the demo app
- [example/App.tsx](/Volumes/T9/projects/ReactNative_DaVoice/example/App.tsx): full end-to-end React Native example
- [docs/react-native-speaker-identification.md](/Volumes/T9/projects/ReactNative_DaVoice/docs/react-native-speaker-identification.md): focused page for speaker identification / verification
- [docs/react-native-wake-word-detection.md](/Volumes/T9/projects/ReactNative_DaVoice/docs/react-native-wake-word-detection.md): focused page for wake word / keyword spotting
- [docs/react-native-speech-to-text.md](/Volumes/T9/projects/ReactNative_DaVoice/docs/react-native-speech-to-text.md): focused page for ASR / STT
- [docs/react-native-text-to-speech.md](/Volumes/T9/projects/ReactNative_DaVoice/docs/react-native-text-to-speech.md): focused page for TTS

## Running the demo

See [example/README.md](/Volumes/T9/projects/ReactNative_DaVoice/example/README.md) for setup and demo notes.

In short:

```bash
cd example
yarn
npx react-native run-android
```

For iOS:

```bash
cd example
yarn
cd ios && pod install
cd ..
npx react-native run-ios
```

## Who this is for

This repository is relevant if you are building:

- a React Native voice assistant
- a hands-free mobile workflow
- an on-device AI assistant
- a voice-first accessibility flow
- a healthcare or enterprise voice workflow
- an in-car or field-service voice interface
- a branded app with custom wake words
- a privacy-sensitive speech interface that should avoid cloud dependency

## SEO summary

This repository targets the following use cases and search intents:

- React Native speaker identification
- React Native speaker verification
- React Native wake word
- React Native keyword spotting
- React Native hotword detection
- React Native speech to text
- React Native offline speech to text
- React Native text to speech
- React Native offline text to speech
- React Native on-device voice AI
- iOS and Android voice AI for React Native

## Contact

For licensing, custom wake words, speaker models, deployment help, or production integration support:

- Website: [https://davoice.io](https://davoice.io)
- Email: `info@davoice.io`
