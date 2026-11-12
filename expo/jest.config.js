module.exports = {
  // React Native 0.85 moved its jest preset into its own package.
  preset: '@react-native/jest-preset',
  // Model and sound files are binary: a require() of one gets a stub in tests.
  moduleNameMapper: { '\\.(dm|onnx|mp3|wav)$': '<rootDir>/jest/assetStub.js' },
};
