module.exports = {
  preset: 'react-native',
  // Model and sound files are binary: a require() of one gets a stub in tests.
  moduleNameMapper: {
    '\\.(dm|onnx|mp3|wav)$': '<rootDir>/jest/assetStub.js',
    // untranspiled ES modules; the 3D car's WebView draws nothing in tests
    '^react-native-webview$': '<rootDir>/jest/webviewStub.js',
    // Flow-typed source; a test that needs files mocks it itself (jest.mock)
    '^react-native-fs$': '<rootDir>/jest/rnfsStub.js',
  },
};
