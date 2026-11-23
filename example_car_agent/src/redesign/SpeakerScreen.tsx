import React from 'react';
import { StyleSheet, View } from 'react-native';
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

export default function SpeakerScreen({ hasSaved, onUseSaved, onCreate, onSkip }: Props) {
  return (
    // The small header: on this screen the logo is decoration, the buttons below are what the user acts on.
    <PanelScreen traces={{ left: true, double: true }}>
      <Heading
        style={styles.heading}
        eyebrow="Step 3 of 5"
        title="Isolate your voice?"
        subtitle="The agent answers only you."
      />
      <View style={styles.body}>
        {hasSaved ? (
          <>
            <PrimaryButton label="Use my saved signature" icon={<ShieldIcon check />} onPress={onUseSaved} style={styles.cta} />
            <SecondaryButton label="Record it again" onPress={onCreate} />
          </>
        ) : (
          <>
            <PrimaryButton label="Create my voice signature" icon={<ShieldIcon />} onPress={onCreate} style={styles.cta} />
          </>
        )}
      </View>
      <Footer>
        <SecondaryButton style={{ flex: 1 }} label="Skip" onPress={onSkip} />
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: 30, paddingBottom: 18, gap: 8 },
  body: { paddingHorizontal: 16, gap: 12 },
  cta: { height: 64 },
});
