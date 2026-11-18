import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F } from './theme';
import { Footer, Heading, PanelScreen, SecondaryButton } from './chrome';

type Props = {
  hasSaved: boolean;
  onUseSaved: () => void;
  onCreate: () => void;
  onSkip: () => void;
};

function ShieldIcon({ check }: { check?: boolean }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" stroke={C.mint} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
      <Path
        d={check ? 'm9 12 2 2 4-4' : 'M9 11v2M12 9v6M15 10.5v3'}
        stroke={C.mint}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function RedoIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" stroke={C.mint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export default function SpeakerScreen({ hasSaved, onUseSaved, onCreate, onSkip }: Props) {
  return (
    <PanelScreen large traces={{ left: true, double: true }}>
      <Heading
        style={styles.heading}
        eyebrow="Step 3 of 5"
        title="Answer only the driver?"
        subtitle="A voice signature lets the agent ignore passengers and the radio. It never leaves this phone."
      />
      <View style={styles.body}>
        {hasSaved ? (
          <>
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onUseSaved} style={[styles.option, styles.primaryOption, { height: 72 }]}>
              <ShieldIcon check />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Use my saved signature</Text>
                <Text style={styles.optionSub}>Recorded on this phone</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onCreate} style={[styles.option, styles.secondaryOption, { height: 64 }]}>
              <RedoIcon />
              <Text style={[styles.optionTitle, { flex: 1 }]}>Record it again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onCreate} style={[styles.option, styles.primaryOption, { minHeight: 76 }]}>
            <ShieldIcon />
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Create my voice signature</Text>
              <Text style={styles.optionSub}>5 short samples · about 15 seconds</Text>
            </View>
            <Text style={styles.badge}>Recommended</Text>
          </TouchableOpacity>
        )}
      </View>
      <Footer>
        <SecondaryButton style={{ flex: 1 }} label="Skip — answer anyone" onPress={onSkip} />
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: 28, paddingBottom: 24, gap: 8 },
  body: { paddingHorizontal: 16, gap: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  primaryOption: {
    borderColor: C.mint,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(38, 50, 46, 0.9) 0%, rgba(26, 36, 33, 0.9) 100%)',
    boxShadow: '0 0 12px rgba(16, 185, 129, 0.35)',
  },
  secondaryOption: { borderColor: 'rgba(16, 185, 129, 0.45)', backgroundColor: C.tile },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontFamily: F.semibold, fontSize: 16, color: C.text },
  optionSub: { fontFamily: F.regular, fontSize: 13, color: C.tag },
  badge: {
    fontFamily: F.bold,
    fontSize: 11,
    color: C.mint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
    overflow: 'hidden',
  },
});
