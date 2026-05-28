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
    name: resolved.name,
    slug: resolved.slug,
    displayName: resolved.displayName,
    android: {
      package: resolved.androidPackage,
    },
    ios: {
      bundleIdentifier: resolved.iosBundleIdentifier,
    },
    plugins: [
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
          },
        },
      ],
      'react-native-wakeword',
      [
        './plugins/withDaVoiceNativeAssets',
        {
          sourceDir: 'assets/models',
          iosBundleSubdir: 'DaVoiceModels',
        },
      ],
    ],
  },
};
