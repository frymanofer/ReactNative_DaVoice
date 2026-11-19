import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F, LIFT } from './theme';
import { Footer, Heading, PanelScreen, PrimaryButton } from './chrome';

type Props = {
  wakePhrase: string;
  /** The latest verification result; null until the first one arrives. */
  result: { score: number; isMatch: boolean } | null;
  /** Time since that result ("1.2s"), or "N/A". */
  sinceLast: string;
  canContinue: boolean;
  onContinue: () => void;
};

/** How long "It's you" stays after the last matching result, so it can be read between words. */
const MATCH_HOLD_MS = 2000;

function StatusIcon({ match }: { match: boolean }) {
  return (
    <Svg width={54} height={54} viewBox="0 0 24 24">
      {match ? (
        <Path d="m5 12 4.5 4.5L19 7" stroke={C.onPrimary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <Path d="M4 11v2M8 8v8M12 4v16M16 8v8M20 11v2" stroke={C.mint} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      )}
    </Svg>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[styles.metricValue, tone === 'good' && { color: C.mintLight }, tone === 'bad' && { color: C.warning2 }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** After the voice signature: the user speaks and sees, live, whether the agent recognises the voice. */
export default function VoiceTestScreen({ wakePhrase, result, sinceLast, canContinue, onContinue }: Props) {
  // Results arrive several times a second and are "no match" in every pause, so the headline holds a match for a
  // moment (the parent re-renders with each new result and with the "since last" clock). The tiles show the raw result.
  const lastMatchAt = useRef(0);
  if (result?.isMatch) lastMatchAt.current = Date.now();
  const match = !!result && (result.isMatch || Date.now() - lastMatchAt.current < MATCH_HOLD_MS);
  const headline = match ? "It's you" : 'Listening…';
  const detail = match
    ? 'The agent recognises this voice.'
    : result
      ? 'No match right now. It stays like this for silence, noise and other voices.'
      : 'Say something to test your voice signature.';

  return (
    <PanelScreen traces={{ left: true, double: true }}>
      <Heading
        style={styles.heading}
        eyebrow="Step 3 of 5 · Voice signature"
        title="Test your voice"
        subtitle={`Say “${wakePhrase}” or any sentence. Then let someone else try.`}
      />
      <View style={styles.statusWrap} accessibilityLiveRegion="polite">
        <View style={[styles.badge, match && styles.badgeMatch]}>
          <StatusIcon match={match} />
        </View>
        <Text style={[styles.headline, match && { color: C.mintLight }]}>{headline}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <View style={styles.metrics}>
        <Metric label="Last score" value={result ? result.score.toFixed(3) : '—'} />
        <Metric
          label="Match"
          value={result ? (result.isMatch ? 'Yes' : 'No') : '—'}
          tone={result ? (result.isMatch ? 'good' : 'bad') : undefined}
        />
        <Metric label="Since last" value={sinceLast === 'N/A' ? '—' : sinceLast} />
      </View>
      <Footer>
        <PrimaryButton
          style={{ flex: 1 }}
          label={canContinue ? 'Continue' : 'Waiting for the first result…'}
          disabled={!canContinue}
          onPress={onContinue}
        />
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingBottom: 10 },
  statusWrap: { flex: 1, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  badge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.olive,
    backgroundColor: '#121A17',
    marginBottom: 6,
  },
  badgeMatch: { borderColor: C.mintLight, backgroundColor: C.mint, boxShadow: '0 0 28px rgba(16, 185, 129, 0.7)' },
  headline: { fontFamily: F.extrabold, fontSize: 26, color: '#FFFFFF', textAlign: 'center' },
  detail: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.tag, textAlign: 'center' },
  metrics: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  metric: {
    flex: 1,
    height: 72,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.tileBorder,
    backgroundColor: C.tile,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    boxShadow: LIFT,
  },
  metricLabel: { fontFamily: F.bold, fontSize: 10, letterSpacing: 10 * 0.1, color: C.tag, textTransform: 'uppercase' },
  metricValue: { fontFamily: F.extrabold, fontSize: 20, color: '#FFFFFF' },
});
