# React Native Wakeword Example

This is a focused, on-device wakeword example for
[`react-native-wakeword`](https://www.npmjs.com/package/react-native-wakeword).
It requests microphone permission, loads two wakeword models, listens for both
phrases from one native instance, and displays per-phrase detection counts.

## Included wakewords

- `hey_lookdeep.dm`
- `hey_coach.dm`

Model files are stored with Git LFS. Install Git LFS before cloning or run
`git lfs pull` after cloning.

## Setup

Requirements:

- Node.js 18 or newer
- npm
- Android Studio/JDK 17 for Android
- Xcode and CocoaPods for iOS
- Git LFS

Install dependencies:

```bash
cd example_wakeword
npm install
```

Create the local credential file:

```bash
cp local.config.example.ts local.config.ts
```

Then replace `YOUR_WAKEWORD_LICENSE` in `local.config.ts` with your DaVoice
wakeword license. The local file is ignored by Git and must not be committed.

## Run Android

```bash
npx react-native run-android
```

## Run iOS

```bash
cd ios
pod install
cd ..
npx react-native run-ios
```

## Relevant files

- `App.tsx`: permission, lifecycle, initialization, and detection UI
- `src/wakeword/index.ts`: instance and listener helpers
- `src/wakeword/config/wakewordModels.ts`: model names and thresholds
- `src/config/audioRoutingConfig.ts`: native audio-session routing
- `local.config.example.ts`: safe credential template

## Changing wakewords

Add the new `.dm` model under `assets/models`, package it for Android and iOS,
and update `src/wakeword/config/wakewordModels.ts`. Keep `.dm` and `.onnx`
files under Git LFS; `.gitattributes` already configures both extensions.
