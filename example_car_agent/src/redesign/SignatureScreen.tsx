import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { C, F } from './theme';
import { Heading, PanelScreen } from './chrome';

type Props = {
  collected: number;
  target: number;
  /** The onboarding's current instruction. */
  message: string;
};

const R = 92;
const CIRC = 2 * Math.PI * R;

export default function SignatureScreen({ collected, target, message }: Props) {
  const total = Math.max(1, target);
  const done = Math.max(0, Math.min(total, collected));
  const next = Math.min(total, done + 1);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <PanelScreen traces={false}>
      <Heading
        style={{ paddingBottom: 8 }}
        eyebrow="Step 3 of 5 · Voice signature"
        title="Capture your voice"
        subtitle="Speak naturally for a couple of seconds each time."
      />
      <View style={styles.ringWrap}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${done} of ${total} samples captured`}
          style={styles.ring}>
          <Svg width={210} height={210} viewBox="0 0 210 210" style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
            <Circle cx={105} cy={105} r={R} fill="none" stroke="#1A2421" strokeWidth={10} />
            <Circle
              cx={105}
              cy={105}
              r={R}
              fill="none"
              stroke={C.mint}
              strokeOpacity={0.25}
              strokeWidth={18}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              strokeDashoffset={CIRC * (1 - done / total)}
            />
            <Circle
              cx={105}
              cy={105}
              r={R}
              fill="none"
              stroke={C.mint}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              strokeDashoffset={CIRC * (1 - done / total)}
            />
          </Svg>
          <View style={styles.inner}>
            <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
              <Svg width={96} height={40} viewBox="0 0 96 40">
                <G stroke={C.mint} strokeWidth={4} strokeLinecap="round">
                  <Path d="M6 17v6M16 12v16M26 6v28M36 14v12M46 3v34M56 10v20M66 5v30M76 13v14M86 17v6" />
                </G>
              </Svg>
            </Animated.View>
            <Text style={styles.listening}>Listening</Text>
          </View>
        </View>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i < done ? { backgroundColor: C.mint, boxShadow: '0 0 6px rgba(52, 211, 153, 0.7)' } : { backgroundColor: '#26322E' }]}
          />
        ))}
      </View>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.cardLabel}>{`SAMPLE ${next} OF ${total} · CURRENT STEP`}</Text>
        <Text style={styles.cardText}>{message}</Text>
      </View>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', paddingTop: 18, paddingBottom: 10 },
  ring: { width: 210, height: 210, alignItems: 'center', justifyContent: 'center' },
  inner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: C.olive,
    experimental_backgroundImage: 'radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(13, 18, 16, 0) 70%)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  listening: { fontFamily: F.semibold, fontSize: 13, color: C.mint },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingBottom: 18 },
  dot: { width: 34, height: 6, borderRadius: 3 },
  card: {
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: C.tile,
    gap: 6,
  },
  cardLabel: { fontFamily: F.semibold, fontSize: 12, letterSpacing: 12 * 0.08, color: C.text2 },
  cardText: { fontFamily: F.semibold, fontSize: 17, lineHeight: 23, color: C.text },
});
