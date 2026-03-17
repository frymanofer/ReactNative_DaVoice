# React Native Wake Word Detection and Keyword Spotting

This repository is relevant for developers searching for:

- React Native wake word
- React Native wake word detection
- React Native keyword spotting
- React Native hotword detection
- React Native trigger word

The example app demonstrates wake-word detection as part of a complete on-device voice flow. After the wake phrase is detected, the app can pause detection, move into speaker verification or speech to text, and later return to listening mode.

That orchestration is important because wake word detection alone is rarely enough for a production voice product. Real apps need clean transitions between:

- always-listening detection
- speaker verification
- active speech recognition
- TTS playback

For the full implementation, see:

- [Main README](/Volumes/T9/projects/ReactNative_DaVoice/README.md)
- [Example App](/Volumes/T9/projects/ReactNative_DaVoice/example/App.tsx)
