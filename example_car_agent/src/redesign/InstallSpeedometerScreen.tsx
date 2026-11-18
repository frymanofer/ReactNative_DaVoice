import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { C, F, PRIMARY_GRADIENT } from './theme';
import { CheckIcon } from './icons';

const HOOD = require('../../assets/images/redesign/hood_background_B.jpg');
const HOOD_ASPECT = 996 / 572;
/** Height of the hood lid (above the painted title), as a fraction of the screen width. */
const HOOD_LID = 0.52;

// Dial geometry, in the design's 340 × 320 viewBox (redesign/source/Download.dc.html).
const VB_W = 340;
const VB_H = 320;
const CX = 170;
const CY = 170;
const R = 128;
const START = 135;
const SWEEP = 270;
const angle = (value: number) => START + (SWEEP * value) / 100;
const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};
const arcPath = (from: number, to: number) => {
  if (to - from < 0.5) to = from + 0.5;
  const [x1, y1] = point(angle(from), R);
  const [x2, y2] = point(angle(to), R);
  const large = ((to - from) * SWEEP) / 100 > 180 ? 1 : 0;
  return `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
};

type StageState = 'todo' | 'active' | 'done' | 'failed';

type Props = {
  name: string;
  code: string;
  sizeMB: number;
  pct: number;
  mbDone: number;
  mbTotal: number;
  stage: 'download' | 'verify' | null;
  installed: boolean;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onContinue: () => void;
};

export default function InstallSpeedometerScreen(props: Props) {
  const { name, code, sizeMB, pct, mbDone, mbTotal, stage, installed, error } = props;
  const [width, setWidth] = useState(0);
  const value = Math.max(0, Math.min(100, Math.round(pct)));

  const needle = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(needle, {
      toValue: value,
      duration: 350,
      easing: Easing.bezier(0.3, 1.25, 0.5, 1),
      useNativeDriver: true,
    }).start();
  }, [needle, value]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const dialW = Math.min(VB_W, Math.max(0, width - 50));
  const k = dialW / VB_W;
  const topPad = Math.max(34, (StatusBar.currentHeight ?? 0) + 14);

  const downloadState: StageState = installed || stage === 'verify' ? 'done' : error ? 'failed' : 'active';
  const verifyState: StageState = installed ? 'done' : stage === 'verify' ? (error ? 'failed' : 'active') : 'todo';
  const installState: StageState = installed ? 'done' : 'todo';
  const stages: { label: string; detail: string; state: StageState }[] = [
    {
      label: 'Downloading',
      detail: stage ? `${mbDone} / ${mbTotal} MB` : error ? '' : 'starting…',
      state: downloadState,
    },
    { label: 'Checking the download', detail: verifyState === 'active' ? 'verifying…' : '', state: verifyState },
    { label: 'Installed on the engine', detail: installed ? 'ready' : '', state: installState },
  ];

  const ticks = [];
  for (let i = 0; i <= 100; i += 5) {
    const major = i % 10 === 0;
    const [x1, y1] = point(angle(i), major ? 104 : 110);
    const [x2, y2] = point(angle(i), 116);
    ticks.push(
      <Line
        key={`t${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={i <= value ? C.mintLight : C.titanium}
        strokeWidth={major ? 3 : 1.5}
        strokeLinecap="round"
      />,
    );
  }
  const labels = [];
  for (let i = 0; i <= 100; i += 10) {
    const [x, y] = point(angle(i), 88);
    labels.push(
      <SvgText
        key={`l${i}`}
        x={x}
        y={y + 4.5}
        fill={i <= value ? C.text : '#6B7470'}
        fontFamily={F.bold}
        fontSize={13}
        textAnchor="middle">
        {String(i)}
      </SvgText>,
    );
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {width > 0 && (
        <>
          {/* Only the hood lid with the emblem: lower down, the image has language-screen text painted in. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: width * HOOD_LID, overflow: 'hidden' }}>
            <Image source={HOOD} style={{ width, height: width * HOOD_ASPECT }} />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  experimental_backgroundImage:
                    'linear-gradient(180deg, rgba(5, 8, 7, 0.55) 0%, rgba(5, 8, 7, 0.82) 55%, #050807 100%)',
                },
              ]}
            />
          </View>

          <View style={[styles.header, { paddingTop: topPad }]}>
            <Text style={styles.eyebrow}>{installed ? 'INSTALLED' : 'INSTALLING LANGUAGE PACK'}</Text>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              {name}
            </Text>
            <Text style={styles.sub}>{`${code} voice pack · ${sizeMB} MB`}</Text>
          </View>

          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${value} percent installed`}
            style={{ marginTop: 26, width: dialW, height: VB_H * k, alignSelf: 'center' }}>
            <Svg width={dialW} height={VB_H * k} viewBox={`0 0 ${VB_W} ${VB_H}`} style={StyleSheet.absoluteFill}>
              <Circle cx={CX} cy={CY} r={152} fill="rgba(6, 12, 10, 0.85)" stroke={C.titanium} strokeWidth={3} />
              <Circle cx={CX} cy={CY} r={146} fill="none" stroke="#2C3331" strokeWidth={1} />
              <Path d={arcPath(0, 100)} fill="none" stroke="#17211E" strokeWidth={12} strokeLinecap="round" />
              <Path d={arcPath(0, Math.max(value, 0.5))} fill="none" stroke={C.mint} strokeOpacity={0.22} strokeWidth={22} strokeLinecap="round" />
              <Path d={arcPath(0, Math.max(value, 0.5))} fill="none" stroke={C.mint} strokeWidth={12} strokeLinecap="round" />
              {ticks}
              {labels}
            </Svg>
            {/* Needle: a square layer centred on the dial's pivot, rotated by the native driver. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: dialW,
                height: dialW,
                transform: [{ rotate: needle.interpolate({ inputRange: [0, 100], outputRange: [`${START}deg`, `${START + SWEEP}deg`] }) }],
              }}>
              <Svg width={dialW} height={dialW} viewBox={`0 0 ${VB_W} ${VB_W}`}>
                <Path d="M170 163 L286 168.5 L286 171.5 L170 177 Z" fill={C.mint} fillOpacity={0.35} />
                <Path d="M170 166 L284 169 L284 171 L170 174 Z" fill={C.text} />
                <Path d="M170 167 L146 169 L146 171 L170 173 Z" fill="#59625F" />
              </Svg>
            </Animated.View>
            <Svg
              pointerEvents="none"
              width={dialW}
              height={VB_H * k}
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              style={StyleSheet.absoluteFill}>
              <Circle cx={CX} cy={CY} r={16} fill="#1A2421" stroke="#59625F" strokeWidth={2} />
              <Circle cx={CX} cy={CY} r={9} fill={C.mint} fillOpacity={0.25} />
              <Circle cx={CX} cy={CY} r={5} fill={C.mint} />
            </Svg>
            <View pointerEvents="none" style={[styles.readout, { top: 216 * k }]}>
              <Text style={[styles.readoutValue, { fontSize: 46 * k }]}>{value}</Text>
              <Text style={styles.readoutUnit}>KM/H</Text>
            </View>
          </View>

          <View style={styles.stages}>
            {stages.map((s, i) => (
              <View key={s.label} style={[styles.stageRow, i < stages.length - 1 && styles.stageDivider]}>
                <View style={[styles.stageDot, dotStyle(s.state)]}>
                  {s.state === 'done' && <CheckIcon size={12} color={C.onPrimary} stroke={2.4} />}
                </View>
                <Text style={[styles.stageLabel, { color: s.state === 'todo' ? C.text2 : C.text }]}>{s.label}</Text>
                <Text style={styles.stageDetail}>{s.detail}</Text>
              </View>
            ))}
          </View>
          {error && (
            <Text style={styles.error} numberOfLines={3}>
              {error}
            </Text>
          )}

          <View style={styles.buttons}>
            {installed ? (
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={props.onContinue} style={[styles.primary, styles.primaryDone]}>
                <Text style={styles.primaryTextDone}>Ready to drive — choose a voice</Text>
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path d="M5 12h14M13 6l6 6-6 6" stroke={C.onPrimary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </Svg>
              </TouchableOpacity>
            ) : error ? (
              <View style={styles.row}>
                <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={props.onCancel} style={[styles.secondary, styles.flex]}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={props.onRetry} style={[styles.primary, styles.flex]}>
                  <Text style={styles.primaryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={props.onCancel} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel installation</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function dotStyle(state: StageState) {
  switch (state) {
    case 'done':
      return { borderColor: C.mint, backgroundColor: C.mint };
    case 'active':
      return { borderColor: C.mint, boxShadow: '0 0 8px rgba(52, 211, 153, 0.8)' };
    case 'failed':
      return { borderColor: C.warning, boxShadow: '0 0 8px rgba(245, 158, 11, 0.7)' };
    default:
      return { borderColor: C.olive };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050807', overflow: 'hidden' },
  header: { alignItems: 'center', paddingHorizontal: 24, gap: 6 },
  eyebrow: { fontFamily: F.bold, fontSize: 11, letterSpacing: 11 * 0.22, color: C.mintLight, textAlign: 'center' },
  title: { fontFamily: F.extrabold, fontSize: 24, letterSpacing: 24 * 0.02, color: C.text, textAlign: 'center' },
  sub: { fontFamily: F.regular, fontSize: 13, color: C.text2, textAlign: 'center' },
  readout: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  readoutValue: {
    fontFamily: F.extrabold,
    color: C.text,
    letterSpacing: -0.9,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(52, 211, 153, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  readoutUnit: { fontFamily: F.bold, fontSize: 12, letterSpacing: 12 * 0.2, color: C.mintLight },
  stages: {
    marginTop: 18,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    backgroundColor: 'rgba(8, 13, 11, 0.9)',
  },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46 },
  stageDivider: { borderBottomWidth: 1, borderBottomColor: '#1A2421' },
  stageDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stageLabel: { flex: 1, fontFamily: F.medium, fontSize: 14 },
  stageDetail: { fontFamily: F.regular, fontSize: 12, color: C.text2, fontVariant: ['tabular-nums'] },
  error: { marginTop: 10, marginHorizontal: 20, fontFamily: F.medium, fontSize: 13, color: C.warning2, textAlign: 'center' },
  buttons: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  primary: {
    height: 58,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    experimental_backgroundImage: PRIMARY_GRADIENT,
    boxShadow: '0 0 18px rgba(16, 185, 129, 0.45)',
  },
  primaryDone: { boxShadow: '0 0 22px rgba(16, 185, 129, 0.6)' },
  primaryText: { fontFamily: F.bold, fontSize: 16, color: C.onPrimary },
  primaryTextDone: { fontFamily: F.extrabold, fontSize: 16, letterSpacing: 0.32, color: C.onPrimary },
  secondary: {
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.titanium,
    backgroundColor: 'rgba(20, 26, 24, 0.92)',
  },
  secondaryText: { fontFamily: F.semibold, fontSize: 16, color: C.text },
});
