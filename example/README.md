# Example App: React Native On-Device Voice AI

This example app demonstrates a full **React Native voice AI** flow running on device:

- <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake word detection</a>
- <a href="https://davoice.io/speaker-recognition" target="_blank" rel="noopener noreferrer">speaker identification / speaker verification</a>
- real-time speech to text
- on-device text to speech
- coordinated pause/resume between wake word and ASR

The key implementation is in [App.tsx](./App.tsx).

## What the demo shows

The demo is not just a wake-word sample. It is a full on-device voice pipeline designed to reflect how production voice apps actually behave.

The example includes:

- optional speaker onboarding
- using a saved speaker signature
- <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake-word detection</a> with recorded wake-word audio
- clean transition from <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake word</a> into speech recognition
- an intentional pause before STT to improve flow
- selectable TTS voices and model quality
- manual TTS test mode
- resuming the listening experience after speech

## Demo flow

1. Launch the app and grant microphone permissions.
2. Choose whether to create or reuse a speaker signature.
3. Start <a href="https://davoice.io/integration-guides-wake-word/react-native" target="_blank" rel="noopener noreferrer">wake word detection</a>.
4. Say the wake phrase.
5. The app pauses wake-word detection before moving into ASR.
6. If speaker verification is enabled, the app can enforce the onboarded speaker.
7. The app listens for speech and can speak back with on-device TTS.
8. The voice session is reset and the wake-word listener can resume.

## Why the pause matters

The pause between wake word detection and speech recognition is deliberate. In multi-stage mobile voice experiences, one of the biggest sources of instability is overlapping audio pipelines. This example demonstrates a cleaner handoff between:

- always-listening wake word
- speaker verification
- active speech recognition
- TTS playback

That is one of the main reasons this repository is useful as a React Native voice reference.

## Run the example

```bash
cd example
yarn
```

Android:

```bash
npx react-native run-android
```

iOS:

```bash
cd ios
pod install
cd ..
npx react-native run-ios
```

## Important setup notes

### Metro assets

Make sure your Metro configuration supports DaVoice model assets such as `.onnx` and `.dm` files. See [react-native.config.js](./react-native.config.js) and the project asset setup.

### Native permissions

Microphone permission is required. iOS speech-recognition permissions may also be required depending on the flow you enable.

### Android sharing support

The example can share recorded wake-word audio. On Android that uses a `FileProvider`, which is why the app manifest references `share_file_paths.xml`.

## Relevant files

- [App.tsx](./App.tsx): end-to-end voice flow
- [package.json](./package.json): example dependencies
- [AndroidManifest.xml](./android/app/src/main/AndroidManifest.xml): Android permissions and file sharing
- [share_file_paths.xml](./android/app/src/main/res/xml/share_file_paths.xml): Android file-sharing resource

## Search-friendly summary

If you found this example while searching for:

- React Native wake word example
- React Native speaker identification example
- React Native speech to text example
- React Native text to speech example
- React Native offline voice AI

this demo is intended to cover the full mobile voice flow rather than only one feature in isolation.

## Questions and support

For production integration help, licensing, custom wake words, or full voice AI support, contact `info@davoice.io`.
