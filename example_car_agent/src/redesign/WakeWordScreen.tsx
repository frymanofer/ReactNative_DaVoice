import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { C, F } from './theme';
import { CarbonFill, EMBLEM, SecondaryButton, statusBarHeight } from './chrome';

type Session = {
  title: string;
  rows: { label: string; value: string }[];
  onContinue?: () => void;
  onBack?: () => void;
};

type Props = {
  wakePhrase: string;
  /** The app's status line (preparing, initializing, say the wake word…). */
  message: string;
  listening: boolean;
  /** Briefly true when the wake word was heard. */
  heard: boolean;
  voice: string;
  language: string;
  driverOnly: boolean;
  onSkipNarration?: () => void;
  onSimulateWakeWord?: () => void;
  onShareRecordings: () => void;
  session?: Session | null;
};

const BARS = [4, 12, 6, 20, 8, 28, 14, 34, 20, 38, 26, 38, 20, 34, 14, 28, 8, 20, 6, 12, 4];

function Ring({ delay, on }: { delay: number; on: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(Math.max(0, 1600 - delay)),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, on]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [on ? 0.9 : 0, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.45] }) }],
        },
      ]}
    />
  );
}

export default function WakeWordScreen(p: Props) {
  const sb = statusBarHeight();
  const [menuOpen, setMenuOpen] = useState(false);
  const bars = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bars, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bars, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    if (p.listening) loop.start();
    return () => loop.stop();
  }, [bars, p.listening]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <CarbonFill id="carbonWake" faint />

      <View style={[styles.topRow, { marginTop: sb + 12 }]}>
        <View style={{ width: 44 }} />
        <Text style={styles.eyebrow}>STEP 4 OF 5</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Menu"
          onPress={() => setMenuOpen((o) => !o)}
          style={styles.menuButton}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M5 12h.01M12 12h.01M19 12h.01" stroke={C.text2} strokeWidth={3} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      {menuOpen && (
        <View style={[styles.menu, { top: sb + 60 }]}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setMenuOpen(false);
              p.onShareRecordings();
            }}
            style={styles.menuItem}>
            <Text style={styles.menuText}>Share recordings</Text>
          </TouchableOpacity>
        </View>
      )}

      {p.session ? (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionTitle}>{p.session.title}</Text>
          {p.session.rows.map((r) => (
            <View key={r.label} style={styles.sessionRow}>
              <Text style={styles.sessionLabel}>{r.label.toUpperCase()}</Text>
              <Text style={styles.sessionValue}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.emblemBox}>
            <Ring delay={0} on={p.listening} />
            <Ring delay={800} on={p.listening} />
            <Ring delay={1600} on={p.listening} />
            <View style={styles.staticRing} />
            <View style={[styles.emblemGlow, p.heard && styles.emblemGlowHeard]}>
              <Image source={EMBLEM} style={styles.emblem} />
            </View>
          </View>

          <Animated.View style={{ marginTop: 6, opacity: p.listening ? bars.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) : 0.25 }}>
            <Svg width={260} height={44} viewBox="0 0 260 44">
              <G stroke={C.mint} strokeWidth={3} strokeLinecap="round" opacity={0.9}>
                <Path d={BARS.map((h, i) => `M${10 + i * 12} ${22 - h / 2}v${h}`).join('')} />
              </G>
            </Svg>
          </Animated.View>

          <View style={styles.texts} accessibilityLiveRegion="polite">
            {p.listening ? (
              <>
                <Text style={styles.lead}>Listening for the wake word</Text>
                <Text style={styles.phrase} numberOfLines={1} adjustsFontSizeToFit>{`“${p.wakePhrase}”`}</Text>
                <Text style={styles.after}>then say what you want the car to do</Text>
              </>
            ) : (
              <>
                <Text style={styles.lead}>{`Wake word · “${p.wakePhrase}”`}</Text>
                <Text style={styles.status}>{p.message}</Text>
              </>
            )}
          </View>

          <View style={styles.chips}>
            <Text style={styles.chip} numberOfLines={1}>{`Voice · ${p.voice}`}</Text>
            <Text style={styles.chip} numberOfLines={1}>{p.language}</Text>
            <Text style={[styles.chip, p.driverOnly && styles.chipOn]} numberOfLines={1}>
              {p.driverOnly ? 'Driver only' : 'Anyone'}
            </Text>
          </View>
        </>
      )}

      <View style={styles.footer}>
        {p.session?.onBack && <SecondaryButton style={{ flex: 1 }} label="Back" onPress={p.session.onBack} />}
        {p.session?.onContinue && <SecondaryButton style={{ flex: 2 }} label="Continue" onPress={p.session.onContinue} />}
        {!p.session && p.onSkipNarration && (
          <SecondaryButton style={{ flex: 1 }} label="Skip narration" onPress={p.onSkipNarration} />
        )}
        {!p.session && p.onSimulateWakeWord && (
          <SecondaryButton
            style={{ flex: 1 }}
            textStyle={{ color: C.tag, fontSize: 15 }}
            label="Simulate wake word"
            onPress={p.onSimulateWakeWord}
          />
        )}
      </View>
    </View>
  );
}

const EMBLEM_BOX = 340;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 40%, #12201B 0%, #0B0F0E 60%)',
    backgroundColor: C.bg,
  },
  topRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  eyebrow: { fontFamily: F.bold, fontSize: 11, letterSpacing: 11 * 0.18, color: C.mint },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    right: 12,
    zIndex: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3632',
    backgroundColor: C.carbon,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
  },
  menuItem: { height: 48, justifyContent: 'center', paddingHorizontal: 16 },
  menuText: { fontFamily: F.medium, fontSize: 14, color: C.text },
  emblemBox: { marginTop: 24, width: EMBLEM_BOX, height: EMBLEM_BOX, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    left: 40,
    top: 40,
    width: EMBLEM_BOX - 80,
    height: EMBLEM_BOX - 80,
    borderRadius: (EMBLEM_BOX - 80) / 2,
    borderWidth: 2,
    borderColor: 'rgba(52, 211, 153, 0.7)',
  },
  staticRing: {
    position: 'absolute',
    left: 20,
    top: 20,
    width: EMBLEM_BOX - 40,
    height: EMBLEM_BOX - 40,
    borderRadius: (EMBLEM_BOX - 40) / 2,
    borderWidth: 1,
    borderColor: C.olive,
  },
  emblemGlow: { width: 240, height: 240, borderRadius: 120, boxShadow: '0 0 30px rgba(52, 211, 153, 0.55)' },
  emblemGlowHeard: { boxShadow: '0 0 60px rgba(52, 211, 153, 1)' },
  emblem: { width: 240, height: 240 },
  texts: { marginTop: 22, paddingHorizontal: 28, alignItems: 'center', gap: 8 },
  lead: { fontFamily: F.regular, fontSize: 15, color: C.text2, textAlign: 'center' },
  phrase: {
    fontFamily: F.extrabold,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 38,
    color: C.text,
    textAlign: 'center',
    textShadowColor: 'rgba(52, 211, 153, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  after: { fontFamily: F.regular, fontSize: 14, color: C.text2, textAlign: 'center' },
  status: { fontFamily: F.semibold, fontSize: 20, lineHeight: 26, color: C.text, textAlign: 'center' },
  chips: { marginTop: 24, flexDirection: 'row', gap: 8, paddingHorizontal: 12, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    height: 32,
    lineHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A3632',
    backgroundColor: '#111816',
    fontFamily: F.regular,
    fontSize: 12,
    color: C.tag,
    overflow: 'hidden',
  },
  chipOn: { borderColor: 'rgba(52, 211, 153, 0.5)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: C.mint },
  sessionCard: {
    marginTop: 40,
    alignSelf: 'stretch',
    marginHorizontal: 16,
    padding: 18,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.titanium,
    backgroundColor: C.panel,
  },
  sessionTitle: { fontFamily: F.bold, fontSize: 22, color: C.text, textAlign: 'center' },
  sessionRow: { gap: 4 },
  sessionLabel: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 1, color: C.text2 },
  sessionValue: { fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.text },
  footer: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', gap: 10 },
});
