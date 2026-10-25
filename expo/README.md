# Expo Example: DaVoice + Wakeword + On-device AI Chat

This folder is the Expo version of `../example`: the same app (wake word, speaker
verification, speech recognition, text to speech, and Local AI Chat with the on-device LLM
agent: web search, memory, the calorie tracker), set up for Expo prebuild / EAS Build.

The native setup is done by config plugins on every prebuild:

- `react-native-wakeword` and `react-native-davoice-llm` (their own plugins): Android Maven
  repositories and permissions
- `plugins/withDaVoiceNativeAssets` (local): the Android Maven repository for
  `react-native-davoice`, and copies the models loaded by file name (`assets/models/local/`)
  and the speech recognizer's bias list (`assets/stt_bias_conf/words_flattened.txt`) into the
  Android assets and the iOS app bundle
- `expo-build-properties`: Android `minSdkVersion` 29
- `app.config.js`: the iOS microphone / speech recognition texts, background audio, and the
  `increased-memory-limit` entitlement the on-device LLM needs

Use this README in one of two ways:

1. Run this example app directly
2. Copy the Expo integration pieces into your own Expo app

## Why this is needed

Some native models are loaded by simple file name only, not by JS `require(...)`.

Examples:

- `hey_coach_model_28_22012026b.dm`
- `sv.dm`

Those files must be copied into native app locations during prebuild.

Models that already work through JS `require(...)` can continue using the normal JS asset flow.

## Section 1: Run This Example App

### 1. Install dependencies

From this folder:

```bash
npm install
npm install expo expo-dev-client expo-build-properties @expo/config-plugins
```

### 2. Configure local app identifiers

Copy:

```bash
cp local.expo.config.example.js local.expo.config.js
```

Then edit `local.expo.config.js`:

```js
module.exports = {
  name: 'ExpoExampleApp',
  slug: 'expoexample',
  displayName: 'ExpoExampleApp',
  androidPackage: 'com.exampleapp',
  iosBundleIdentifier: 'com.exampleapp',
};
```

This file is local-only and git-ignored.

These values match the example app identifiers:

- Android package: `com.exampleapp`
- iOS bundle identifier: `com.exampleapp`

If `local.expo.config.js` does not exist, `app.config.js` falls back to its committed default values.

Important:

- if you change `local.expo.config.js`, you must run `npx expo prebuild --clean` again
- if `ios/` and `android/` already exist, EAS uses the native generated values from those folders
- changing only the config file is not enough after native folders were already generated

### 3. Configure local runtime secrets if needed

`local.config.ts` holds your own keys (Gemini, and optionally a web search engine and the
USDA food database for Local AI Chat) and is git-ignored. `npm install` creates it from
`local.config.example.ts` when it is missing (also on EAS, which builds from git); edit it
with your values.

### 4. Put native-only models in the required folder

Copy every filename-based native asset into:

```text
assets/models/local/
```

Current models:

- `assets/models/local/model_ex2_rich_kate.dm` (text-to-speech voices: Ariana, Rich, Kate,
  Jenny, Matthew, Gloria) and `model_ex_hanna_light_davoice_ph.dm` (Hanna)
- `assets/models/local/hey_coach_model_28_22012026b.dm` (wake word)
- `assets/models/local/sv.dm` (speaker verification)

The on-device LLM and the agent's small embedding model are downloaded by the app at
runtime into its documents folder; they are not part of the app.

Rule:

- If native code expects a plain file name like `"sv.dm"`, place it in `assets/models/local/`.
- If the model already works via JS `require(...)`, keep using the normal JS asset path.

### 5. Run Expo prebuild

```bash
npx expo prebuild --clean
```

What the plugin does:

- Android:
  - sets `minSdkVersion` to `29`
  - adds the Maven repositories of `react-native-wakeword`, `react-native-davoice` and
    `react-native-davoice-llm`
  - copies all `*.dm` and `*.onnx` from `assets/models/local/`, and
    `assets/stt_bias_conf/words_flattened.txt`, into `android/app/src/main/assets/`
- iOS:
  - copies the same files into the generated iOS app bundle resources and adds them to the
    Xcode project
  - adds the microphone / speech recognition texts, background audio, and the
    `com.apple.developer.kernel.increased-memory-limit` entitlement

### 6. Verify generated native output

Android:

```bash
find android/app/src/main/assets -maxdepth 1 -type f | sort
rg -n 'react-native-wakeword|react-native-davoice|projectDir.*/libs' android/build.gradle
```

iOS:

```bash
find ios -path '*/DaVoiceModels/*' -type f | sort
```

### 7. Run locally

Android:

```bash
npx expo run:android
```

iOS:

```bash
npx expo run:ios
```

### 8. Build with EAS

Configure EAS if needed:

```bash
eas build:configure
```

Then build:

```bash
eas build --platform android
eas build --platform ios
```

For local cloud-parity debugging:

```bash
eas build --platform android --local
eas build --platform ios --local
```

Before remote EAS builds, make sure your generated native project already contains the bundle/package IDs you want. The local config file is only used at prebuild time.

## Section 2: Integrate Into Your Own Expo App

If you already have your own Expo app, copy only the pieces you need.

### 1. Install the required packages

In your app:

```bash
npm install react-native-davoice react-native-wakeword react-native-davoice-llm react-native-fs expo expo-dev-client expo-build-properties @expo/config-plugins
```

Add `'react-native-davoice-llm'` to your config plugins, and for the on-device LLM on iOS the
`increased-memory-limit` entitlement (see this folder's `app.config.js`).

### 2. Copy the local Expo plugin

Copy this file into your app:

- `plugins/withDaVoiceNativeAssets.js`

### 3. Create a native-only model folder

In your app, create:

```text
assets/models/local/
```

Copy every native filename-based asset into that folder.

Examples:

- `sv.dm`
- `hey_coach_model_28_22012026b.dm`
- your TTS voice models (e.g. `model_ex2_rich_kate.dm`)

### 4. Add the plugin to your Expo config

In your `app.config.js` or `app.json`, add:

```js
plugins: [
  [
    'expo-build-properties',
    {
      android: {
        minSdkVersion: 29,
      },
    },
  ],
  'react-native-wakeword',
  'react-native-davoice-llm',
  [
    './plugins/withDaVoiceNativeAssets',
    {
      sourceDir: 'assets/models/local',
      iosBundleSubdir: 'DaVoiceModels',
      // Optional: other files the native libraries read by name.
      extraFiles: ['assets/stt_bias_conf/words_flattened.txt'],
    },
  ],
]
```

If you use `app.config.js`, a full minimal example is:

```js
module.exports = {
  expo: {
    name: 'MyVoiceApp',
    slug: 'myvoiceapp',
    android: {
      package: 'com.yourcompany.myvoiceapp',
    },
    ios: {
      bundleIdentifier: 'com.yourcompany.myvoiceapp',
      infoPlist: {
        NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to access your microphone',
        NSSpeechRecognitionUsageDescription: 'Allow $(PRODUCT_NAME) to use speech recognition',
        UIBackgroundModes: ['audio'],
      },
      // Only with the on-device LLM (react-native-davoice-llm).
      entitlements: { 'com.apple.developer.kernel.increased-memory-limit': true },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 29,
          },
        },
      ],
      'react-native-wakeword',
      'react-native-davoice-llm',
      [
        './plugins/withDaVoiceNativeAssets',
        {
          sourceDir: 'assets/models/local',
          iosBundleSubdir: 'DaVoiceModels',
          extraFiles: ['assets/stt_bias_conf/words_flattened.txt'],
        },
      ],
    ],
  },
};
```

You can also keep package identifiers in your own local-only config file, just like this example does.

Recommended pattern:

1. Commit `app.config.js`
2. Commit `local.expo.config.example.js`
3. Git-ignore `local.expo.config.js`
4. Read local IDs from `local.expo.config.js` when it exists
5. Fall back to committed defaults when it does not exist

If you follow this pattern, remind developers that changing the local config file requires rerunning:

```bash
npx expo prebuild --clean
```

### 5. Keep JS `require(...)` assets where they already are

If a model already works through JS `require(...)`, you do not need to move it into `assets/models/local/`.

Only filename-based native assets need the plugin copy flow.

### 6. Run prebuild

```bash
npx expo prebuild --clean
```

### 7. Verify the generated native output

Android:

```bash
find android/app/src/main/assets -maxdepth 1 -type f | sort
rg -n 'react-native-wakeword|react-native-davoice|projectDir.*/libs' android/build.gradle
```

iOS:

```bash
find ios -path '*/DaVoiceModels/*' -type f | sort
```

### 8. Build and test

Local:

```bash
npx expo run:android
npx expo run:ios
```

EAS:

```bash
eas build --platform android
eas build --platform ios
```

## What To Copy From This Example

For your own Expo app, the main reusable pieces are:

- `plugins/withDaVoiceNativeAssets.js`
- the plugin entry from `app.config.js`
- filename-based native models from `assets/models/local/`
- any runtime integration code you want from:
  - `src/wakeword/`
  - `src/speaker_verification/`
  - `src/tts/`
  - `src/stt/`
  - `src/initialization/`

## What Not To Copy Blindly

Do not blindly copy:

- generated `android/` or `ios/` folders from another app
- another app’s package names or bundle identifiers
- local secrets
- old generated files like `rnconfig.json`
- old Pods or build folders

## Notes About iOS xcframeworks

The iOS `.xcframework` files used by these packages are expected to come from the package podspecs.

That is okay for Expo / EAS as long as:

- they are declared in the podspec as vendored frameworks
- they are present in the npm package contents

## Troubleshooting

If prebuild succeeds but runtime asset loading fails:

1. Confirm the file exists in `assets/models/local/`
2. Confirm prebuild copied it into Android assets
3. Confirm prebuild copied it into iOS `DaVoiceModels`
4. Confirm the native code is looking for the exact same file name
5. If building on EAS, confirm the file is committed and not excluded by `.gitignore` or `.easignore`

If Android fails to resolve DaVoice dependencies:

1. Open generated `android/build.gradle`
2. Confirm both local Maven repo lines exist
3. Confirm the installed npm packages actually contain `android/libs`

If Android fails with a manifest merge error mentioning a lower `minSdkVersion` than a library needs:

1. Confirm `expo-build-properties` is installed
2. Confirm your Expo config sets Android `minSdkVersion` to `29`
3. Delete generated native folders
4. Rerun:

```bash
npx expo prebuild
```

## Summary

For Expo users, the minimum recipe is:

1. install the packages
2. add the local config plugin
3. place filename-based native models under `assets/models/local/`
4. run `expo prebuild`
5. build with Expo or EAS
