# <a href="https://davoice.io/integration-guides-wake-word/react-native" target="_blank" rel="noopener noreferrer">React Native Wake Word Detection and Keyword Spotting</a>

This repository is relevant for developers searching for:

- <a href="https://davoice.io/integration-guides-wake-word/react-native" target="_blank" rel="noopener noreferrer">React Native wake word</a>
- <a href="https://davoice.io/integration-guides-wake-word/react-native" target="_blank" rel="noopener noreferrer">React Native wake word detection</a>
- React Native keyword spotting
- React Native hotword detection
- React Native trigger word

The example app demonstrates <a href="https://davoice.io/wake-word" target="_blank" rel="noopener noreferrer">wake-word detection</a> as part of a complete on-device voice flow. After the wake phrase is detected, the app can pause detection, move into <a href="https://davoice.io/speaker-recognition" target="_blank" rel="noopener noreferrer">speaker verification</a> or speech to text, and later return to listening mode.

That orchestration is important because wake word detection alone is rarely enough for a production voice product. Real apps need clean transitions between:

- always-listening detection
- speaker verification
- active speech recognition
- TTS playback

For the full implementation, see:

- [Main README](../README.md)
- [Example App](../example/App.tsx)
