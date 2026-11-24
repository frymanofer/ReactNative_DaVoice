// react-native-webview ships untranspiled ES modules: tests get a WebView that draws nothing (the 3D car, src/redesign/Car3DView.tsx).
const React = require('react');
const WebView = React.forwardRef(() => null);
module.exports = { __esModule: true, WebView, default: WebView };
