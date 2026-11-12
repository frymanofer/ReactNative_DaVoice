// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// language_packs.json -> src/tts/languagePacks.generated.ts (which languages' voices are built in vs downloaded; as the RN example).
// Runs on every bundle (dev server, Android, iOS) so the JSON is all that needs editing; a bad config fails the build.
require('./scripts/generate-language-packs').generate();

const config = {
  resolver: {
    assetExts: [
      ...(defaultConfig.resolver.assetExts || []),
      'dm',
      'onnx',
      'wav',
      'mp3',
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
