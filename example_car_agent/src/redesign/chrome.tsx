import React from 'react';
import {
  Image,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { C, F, LIFT, PANEL_GRADIENT, PRIMARY_GRADIENT } from './theme';

export const EMBLEM = require('../../assets/images/redesign/DaVoice_emblem.png');

export const statusBarHeight = () => StatusBar.currentHeight ?? 0;

/** Carbon weave: 45° stripes #161D1B / #0B0F0E (3 px / 4 px). */
export function CarbonFill({ id, style, faint }: { id: string; style?: StyleProp<ViewStyle>; faint?: boolean }) {
  return (
    <Svg style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <Rect x={0} y={0} width={3} height={7} fill={faint ? 'rgba(255, 255, 255, 0.018)' : C.carbon2} />
          <Rect x={3} y={0} width={4} height={7} fill={faint ? 'rgba(0, 0, 0, 0)' : C.bg} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function Rivet({ side, top }: { side: 'left' | 'right'; top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        [side]: 14,
        top,
        width: 10,
        height: 10,
        borderRadius: 5,
        experimental_backgroundImage: 'radial-gradient(circle at 35% 35%, #C9D0CE, #4B5552)',
        borderWidth: 1,
        borderColor: '#2C3331',
      }}
    />
  );
}

/** Carbon header with the titanium bar and the emblem riding on it. */
export function EmblemHeader({ large }: { large?: boolean }) {
  const sb = statusBarHeight();
  const height = (large ? 262 : 150) + sb;
  const barTop = (large ? 190 : 92) + sb;
  const barHeight = large ? 44 : 38;
  const size = large ? 216 : 130;
  const emblemTop = (large ? 28 : 10) + sb;
  return (
    <View style={{ height, overflow: 'visible' }}>
      <CarbonFill id={large ? 'carbonHeaderL' : 'carbonHeaderS'} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: barTop,
          height: barHeight,
          borderTopWidth: 1,
          borderTopColor: C.mint,
          experimental_backgroundImage: 'linear-gradient(180deg, #7C8582 0%, #59625F 30%, #4B5552 55%, #2C3331 100%)',
          boxShadow: '0 -10px 22px rgba(16, 185, 129, 0.30)',
        }}
      />
      <Rivet side="left" top={barTop + (barHeight - 10) / 2 - 2} />
      <Rivet side="right" top={barTop + (barHeight - 10) / 2 - 2} />
      <View
        style={{
          position: 'absolute',
          top: emblemTop,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 2,
        }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, boxShadow: `0 0 ${large ? 22 : 16}px rgba(52, 211, 153, 0.45)` }}>
          <Image source={EMBLEM} style={{ width: size, height: size }} />
        </View>
      </View>
    </View>
  );
}

/** Circuit traces in a panel's top corners. */
export function Traces({ left, double }: { left?: boolean; double?: boolean }) {
  return (
    <>
      <Svg width={90} height={70} viewBox="0 0 90 70" style={{ position: 'absolute', right: 8, top: 10 }} pointerEvents="none">
        <G fill="none" stroke={C.olive} strokeWidth={1.2}>
          <Path d="M2 6H58L72 20V66" />
          {double && <Path d="M24 14H52L62 24V50" />}
        </G>
        <G fill={C.panelTop} stroke={C.olive} strokeWidth={1.2}>
          <Circle cx={2} cy={6} r={2.5} />
          <Circle cx={72} cy={66} r={2.5} />
          {double && <Circle cx={24} cy={14} r={2.5} />}
          {double && <Circle cx={62} cy={50} r={2.5} />}
        </G>
      </Svg>
      {left && (
        <Svg width={70} height={70} viewBox="0 0 70 70" style={{ position: 'absolute', left: 8, top: 10 }} pointerEvents="none">
          <Path d="M68 6H22L8 20V60" fill="none" stroke={C.olive} strokeWidth={1.2} />
          <G fill={C.panelTop} stroke={C.olive} strokeWidth={1.2}>
            <Circle cx={68} cy={6} r={2.5} />
            <Circle cx={8} cy={60} r={2.5} />
          </G>
        </Svg>
      )}
    </>
  );
}

/** The recessed panel under the header: titanium border, rounded top. */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** Screen frame: carbon header + panel, everything on one phone screen. */
export function PanelScreen({
  large,
  traces,
  children,
}: {
  large?: boolean;
  traces?: { left?: boolean; double?: boolean } | false;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <EmblemHeader large={large} />
      <Panel>
        {traces !== false && <Traces {...(traces || {})} />}
        {children}
      </Panel>
    </View>
  );
}

export function Heading({
  eyebrow,
  title,
  subtitle,
  style,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.heading, style]}>
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

export function SectionLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionLabel, style]}>{children.toUpperCase()}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={[styles.primary, disabled && styles.primaryDisabled, style]}>
      {icon}
      <Text style={[styles.primaryText, disabled && styles.primaryTextDisabled]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  style,
  textStyle,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[styles.secondary, disabled && { opacity: 0.5 }, style]}>
      <Text style={[styles.secondaryText, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Chevron({ dir = 'left', color = C.text, size = 20 }: { dir?: 'left' | 'right'; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={dir === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function BackSquare({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" activeOpacity={0.8} onPress={onPress} style={styles.backSquare}>
      <Chevron />
    </TouchableOpacity>
  );
}

export function Footer({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  panel: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    marginHorizontal: 12,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: C.titanium,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: C.panel,
    // The background fades out towards the bottom, so the controls on it carry the screen.
    experimental_backgroundImage: PANEL_GRADIENT,
    overflow: 'hidden',
    zIndex: 1,
  },
  heading: { paddingTop: 22, paddingHorizontal: 24, paddingBottom: 14, alignItems: 'center', gap: 6 },
  eyebrow: { fontFamily: F.bold, fontSize: 11, letterSpacing: 11 * 0.18, color: C.mint, textAlign: 'center' },
  title: { fontFamily: F.bold, fontSize: 24, letterSpacing: -0.2, lineHeight: 29, color: C.text, textAlign: 'center' },
  subtitle: { fontFamily: F.regular, fontSize: 14, lineHeight: 19, color: C.text2, textAlign: 'center' },
  sectionLabel: { fontFamily: F.semibold, fontSize: 12, letterSpacing: 12 * 0.08, color: C.text2, paddingLeft: 4 },
  primary: {
    height: 58,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
    experimental_backgroundImage: PRIMARY_GRADIENT,
    boxShadow: '0 0 18px rgba(16, 185, 129, 0.45)',
  },
  primaryDisabled: { experimental_backgroundImage: undefined, backgroundColor: '#1A2421', boxShadow: undefined },
  primaryText: { fontFamily: F.bold, fontSize: 16, color: C.onPrimary, flexShrink: 1 },
  primaryTextDisabled: { fontFamily: F.semibold, fontSize: 15, color: C.text2 },
  secondary: {
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
    boxShadow: LIFT,
  },
  secondaryText: { fontFamily: F.semibold, fontSize: 16, color: C.text },
  backSquare: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
    boxShadow: LIFT,
  },
  footer: { marginTop: 'auto', paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24, flexDirection: 'row', gap: 10 },
});
