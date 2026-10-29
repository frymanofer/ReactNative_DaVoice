const fs = require('fs');
const path = require('path');

const localExpoConfigPath = path.join(__dirname, 'local.expo.config.js');

const defaultConfig = {
  name: 'ExpoExampleApp',
  slug: 'expoexample',
  displayName: 'ExpoExampleApp',
  androidPackage: 'com.anonymous.expoexample',
  iosBundleIdentifier: 'com.anonymous.expoexample',
};

const localConfig = fs.existsSync(localExpoConfigPath)
  ? require(localExpoConfigPath)
  : {};

const resolved = {
  ...defaultConfig,
  ...localConfig,
};

module.exports = {
  expo: {
    // EAS project (local.expo.config.js easProjectId, set by `eas init`).
    ...(resolved.easProjectId ? { extra: { eas: { projectId: resolved.easProjectId } }, owner: resolved.easOwner } : {}),
    name: resolved.name,
    slug: resolved.slug,
    displayName: resolved.displayName,
    android: {
      package: resolved.androidPackage,
    },
    ios: {
      bundleIdentifier: resolved.iosBundleIdentifier,
      // The Apple team Xcode signs with (local.expo.config.js appleTeamId),
      // e.g. a personal team for builds on your own iPhone.
      ...(resolved.appleTeamId ? { appleTeamId: resolved.appleTeamId } : {}),
      infoPlist: {
        NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to access your microphone',
        NSSpeechRecognitionUsageDescription: 'Allow $(PRODUCT_NAME) to use speech recognition',
        // Keeps listening for the wake word and speaking while in the background.
        UIBackgroundModes: ['audio'],
      },
      entitlements: {
        // The on-device LLM needs gigabytes: lets the app use more memory before
        // iOS terminates it (EAS adds the capability to the App ID).
        'com.apple.developer.kernel.increased-memory-limit': true,
      },
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
      // On-device LLM + agent (Local AI Chat): its local Maven repository.
      'react-native-davoice-llm',
      [
        './plugins/withDaVoiceNativeAssets',
        {
          // Only the models the app uses (TTS voices, wake word, speaker verification).
          sourceDir: 'assets/models/local',
          iosBundleSubdir: 'DaVoiceModels',
          // The speech recognizer's bias list (phonetic alphabet etc.), read by name.
          extraFiles: ['assets/stt_bias_conf/words_flattened.txt'],
        },
      ],
      // Voice cloning: the microphone recording and the audio file picker.
      './plugins/withVoiceRecorder',
    ],
  },
};
