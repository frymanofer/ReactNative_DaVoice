import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F } from './theme';
import { Footer, Heading, PanelScreen, PrimaryButton, SecondaryButton } from './chrome';

type Props = {
  hasSaved: boolean;
  onUseSaved: () => void;
  onCreate: () => void;
  onSkip: () => void;
};

function ShieldIcon({ check, color = C.onPrimary }: { check?: boolean; color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none" />
      <Path
        d={check ? 'm9 12 2 2 4-4' : 'M9 11v2M12 9v6M15 10.5v3'}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** One plain line of what isolating the voice does. */
function Point({ children }: { children: string }) {
  return (
    <View style={styles.point}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="m5 12 4.5 4.5L19 7" stroke={C.mint} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      <Text style={styles.pointText}>{children}</Text>
    </View>
  );
}

export default function SpeakerScreen({ hasSaved, onUseSaved, onCreate, onSkip }: Props) {
  return (
    // The small header: on this screen the logo is decoration, the buttons below are what the user acts on.
    <PanelScreen traces={{ left: true, double: true }}>
      <Heading
        style={styles.heading}
        eyebrow="Step 3 of 5"
        title="Isolate your voice?"
        subtitle="The agent learns your voice and then answers only you."
      />
      <View style={styles.points}>
        <Point>Passengers, the radio and other voices are ignored</Point>
        <Point>Takes about 30 seconds: you read 5 short sentences</Point>
        <Point>Your voice signature never leaves this phone</Point>
      </View>
      <View style={styles.body}>
        {hasSaved ? (
          <>
            <PrimaryButton label="Use my saved signature" icon={<ShieldIcon check />} onPress={onUseSaved} style={styles.cta} />
            <SecondaryButton label="Record it again" onPress={onCreate} />
          </>
        ) : (
          <>
            <PrimaryButton label="Create my voice signature" icon={<ShieldIcon />} onPress={onCreate} style={styles.cta} />
            <Text style={styles.recommended}>Recommended</Text>
          </>
        )}
      </View>
      <Footer>
        <SecondaryButton style={{ flex: 1 }} label="Skip · answer any voice" onPress={onSkip} />
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: 30, paddingBottom: 18, gap: 8 },
  points: { paddingHorizontal: 28, gap: 12, paddingBottom: 26 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pointText: { flex: 1, fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: '#E5E7EB' },
  body: { paddingHorizontal: 16, gap: 12 },
  cta: { height: 64 },
  recommended: { fontFamily: F.semibold, fontSize: 12, letterSpacing: 12 * 0.08, color: C.mint, textAlign: 'center', textTransform: 'uppercase' },
});
