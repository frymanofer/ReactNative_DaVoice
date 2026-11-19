import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from './theme';
import { CheckIcon } from './icons';
import { Footer, Heading, PanelScreen, PrimaryButton, SecondaryButton } from './chrome';

export type LoadingStage = { key: string; label: string; detail: string; progress?: number };

type Props = {
  modelName: string;
  stages: LoadingStage[];
  /** Index of the running stage; -1 when it failed. */
  activeIndex: number;
  seconds: number;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
};

export default function AgentLoadingScreen({ modelName, stages, activeIndex, seconds, error, onBack, onRetry }: Props) {
  return (
    <PanelScreen large traces={false}>
      <Heading
        style={{ paddingTop: 28, paddingBottom: 22, gap: 8 }}
        eyebrow="Step 5 of 5 · First start only"
        title="Starting the car agent"
        subtitle={`${modelName || 'DaVoice Automotive Agent'} · on-device`}
      />
      <View style={styles.card}>
        {stages.map((stage, i) => {
          const done = activeIndex > i;
          const active = activeIndex === i;
          return (
            <View key={stage.key} style={[styles.row, i < stages.length - 1 && styles.divider]}>
              <View style={[styles.dot, done ? styles.dotDone : active ? styles.dotActive : styles.dotTodo]}>
                {done ? (
                  <CheckIcon size={16} color={C.onPrimary} stroke={2.6} />
                ) : (
                  <Text style={[styles.dotText, { color: active ? C.mint : C.text2 }]}>{i + 1}</Text>
                )}
              </View>
              <View style={styles.info}>
                <Text style={[styles.label, !done && !active && styles.labelMuted]}>{stage.label}</Text>
                {(active || done || !!stage.detail) && (
                  <Text style={[styles.detail, active && { color: C.tag }]}>
                    {done ? 'done' : active ? [stage.detail, `${seconds} s`].filter(Boolean).join(' · ') : stage.detail}
                  </Text>
                )}
                {active && stage.progress !== undefined && (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, stage.progress))}%` }]} />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {!!error && (
        <Text style={styles.error} numberOfLines={4}>
          {error}
        </Text>
      )}
      <Footer>
        <SecondaryButton style={{ flex: 1 }} label="Back" onPress={onBack} />
        {error ? (
          <PrimaryButton style={{ flex: 2 }} label="Retry" onPress={onRetry} />
        ) : (
          <PrimaryButton style={{ flex: 2 }} label="Opens when ready" onPress={() => {}} disabled />
        )}
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A4A44',
    backgroundColor: '#18231F',
  },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#1A2421' },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: C.emerald },
  dotActive: { borderWidth: 2, borderColor: C.mint, boxShadow: '0 0 10px rgba(52, 211, 153, 0.6)' },
  dotTodo: { borderWidth: 2, borderColor: C.olive },
  dotText: { fontFamily: F.bold, fontSize: 13 },
  info: { flex: 1, gap: 4, paddingTop: 3 },
  label: { fontFamily: F.bold, fontSize: 16, color: '#FFFFFF' },
  labelMuted: { fontFamily: F.regular, color: C.text2 },
  detail: { fontFamily: F.regular, fontSize: 13, color: C.text2, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: '#1A2421', overflow: 'hidden', marginTop: 2 },
  fill: { height: '100%', borderRadius: 3, backgroundColor: C.mint, boxShadow: '0 0 8px #34D399' },
  error: { marginTop: 14, marginHorizontal: 20, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.warning2, textAlign: 'center' },
});
