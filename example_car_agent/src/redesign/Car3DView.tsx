import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import RNFS from 'react-native-fs';
import { getCarActions, getCarState, onCarChange } from '../car/CarState';
import { C, F } from './theme';

// The 3D car (assets/car3d/car3d_viewer.html, three.js) in a WebView. Display only: it reads CarState and never changes it.
// Protocol: the viewer posts {type:'ready'}; then every onCarChange sends {type:'state', state, lastAction}.
const SOURCE =
  Platform.OS === 'android'
    ? { uri: 'file:///android_asset/car3d_viewer.html' }
    : { uri: `file://${RNFS.MainBundlePath}/car3d_viewer.html` };

/** paused: no rendering at all (set while the agent works: the model needs every CPU core; measured 2026-11-23, Pixel 8). */
export default function Car3DView({ children, paused = false }: { children?: React.ReactNode; paused?: boolean }) {
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const sentActionId = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);

  const send = useCallback(() => {
    if (!ready.current || !web.current) return;
    const actions = getCarActions();
    const latest = actions[actions.length - 1] ?? null;
    // The viewer turns the camera to the part and shows a tag for each lastAction, so an action is sent once:
    // a later change that is not a new action (Parked/Driving, reset) must not replay the previous one.
    const lastAction = latest && latest.id !== sentActionId.current ? latest : null;
    sentActionId.current = latest ? latest.id : null;
    web.current.postMessage(JSON.stringify({ type: 'state', state: getCarState(), lastAction }));
  }, []);

  useEffect(() => onCarChange(send), [send]);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (ready.current) web.current?.postMessage(JSON.stringify({ type: 'pause', on: paused }));
  }, [paused]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type?: string } | null = null;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m?.type !== 'ready') return;
    ready.current = true;
    // The opening state carries no action: the car starts as it is, without replaying the last command.
    const actions = getCarActions();
    sentActionId.current = actions.length ? actions[actions.length - 1].id : null;
    web.current?.postMessage(JSON.stringify({ type: 'state', state: getCarState(), lastAction: null }));
    if (pausedRef.current) web.current?.postMessage(JSON.stringify({ type: 'pause', on: true }));
    setLoaded(true);
  };

  return (
    <View style={styles.root} onTouchStart={() => setTouched(true)}>
      <WebView
        ref={web}
        source={SOURCE}
        originWhitelist={['*']}
        allowFileAccess
        allowingReadAccessToURL={Platform.OS === 'ios' ? `file://${RNFS.MainBundlePath}` : undefined}
        onMessage={onMessage}
        onLoadStart={() => {
          ready.current = false;
        }}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
        style={styles.web}
        containerStyle={styles.web}
        accessibilityLabel="3D car. Drag to rotate."
      />
      {!loaded && (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>Loading the 3D car…</Text>
        </View>
      )}
      {loaded && !touched && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Drag to rotate</Text>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: C.bg },
  web: { flex: 1, backgroundColor: C.bg },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: F.medium, fontSize: 13, color: C.mintLight },
  hint: {
    position: 'absolute',
    right: 12,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2B27',
    backgroundColor: 'rgba(8, 13, 11, 0.7)',
  },
  hintText: { fontFamily: F.regular, fontSize: 11, color: C.text2 },
});
