import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { C, F, LIFT, MESSAGE_CARD } from './theme';
import { Heading, PanelScreen } from './chrome';

type Props = {
  collected: number;
  target: number;
  /** What the user reads aloud: one sentence per sample, shown one after the other. */
  sentences: string[];
};

const SIZE = 132;
const R = 56;
const CIRC = 2 * Math.PI * R;

export default function SignatureScreen({ collected, target, sentences }: Props) {
  const total = Math.max(1, target);
  const done = Math.max(0, Math.min(total, collected));
  const finished = done >= total;
  const sentence = sentences[Math.min(done, sentences.length - 1)] ?? '';

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

  // A new sentence fades in, so the change is noticed while the user looks at the screen.
  const appear = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 280, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [appear, done]);

  return (
    <PanelScreen traces={false}>
      <Heading
        style={styles.heading}
        eyebrow="Step 3 of 5 · Voice signature"
        title="Read this aloud"
        subtitle="Use your natural voice. The next sentence appears by itself."
      />
      <View style={styles.card} accessibilityLiveRegion="polite">
        <Text style={styles.cardLabel}>
          {finished ? `ALL ${total} SENTENCES CAPTURED` : `SENTENCE ${done + 1} OF ${total} · SAY`}
        </Text>
        <Animated.View style={[styles.sentenceBox, { opacity: appear }]}>
          {finished ? (
            <Text style={styles.finishing}>Creating your voice signature…</Text>
          ) : (
            <Text style={styles.sentence} adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={5}>
              {`“${sentence}”`}
            </Text>
          )}
        </Animated.View>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < done
                ? { backgroundColor: C.mint, boxShadow: '0 0 6px rgba(52, 211, 153, 0.7)' }
                : i === done
                  ? { backgroundColor: C.mintPale }
                  : { backgroundColor: '#26322E' },
            ]}
          />
        ))}
      </View>
      <View style={styles.ringWrap}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${done} of ${total} sentences captured`}
          style={styles.ring}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#1A2421" strokeWidth={8} />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={C.mint}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              strokeDashoffset={CIRC * (1 - done / total)}
            />
          </Svg>
          <View style={styles.inner}>
            <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
              <Svg width={62} height={26} viewBox="0 0 96 40">
                <G stroke={C.mint} strokeWidth={5} strokeLinecap="round">
                  <Path d="M6 17v6M16 12v16M26 6v28M36 14v12M46 3v34M56 10v20M66 5v30M76 13v14M86 17v6" />
                </G>
              </Svg>
            </Animated.View>
            <Text style={styles.listening}>{finished ? 'Saving' : 'Listening'}</Text>
          </View>
        </View>
      </View>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingBottom: 14 },
  // The sentence is the screen's main message: the brightest card, the largest text.
  card: {
    marginHorizontal: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.mint,
    backgroundColor: MESSAGE_CARD,
    boxShadow: LIFT,
    gap: 10,
  },
  cardLabel: { fontFamily: F.bold, fontSize: 12, letterSpacing: 12 * 0.1, color: C.mint },
  // One height for every sentence, so the screen does not jump from one sentence to the next.
  sentenceBox: { minHeight: 150, justifyContent: 'center' },
  sentence: { fontFamily: F.bold, fontSize: 23, lineHeight: 31, color: '#FFFFFF' },
  finishing: { fontFamily: F.bold, fontSize: 20, lineHeight: 28, color: C.mintLight, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingTop: 18 },
  dot: { width: 34, height: 6, borderRadius: 3 },
  ringWrap: { flex: 1, minHeight: SIZE + 16, alignItems: 'center', justifyContent: 'center' },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  inner: {
    width: SIZE - 32,
    height: SIZE - 32,
    borderRadius: (SIZE - 32) / 2,
    borderWidth: 1,
    borderColor: C.olive,
    experimental_backgroundImage: 'radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(13, 18, 16, 0) 70%)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  listening: { fontFamily: F.semibold, fontSize: 12, color: C.mint },
});
