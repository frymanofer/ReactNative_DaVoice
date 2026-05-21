// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

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
