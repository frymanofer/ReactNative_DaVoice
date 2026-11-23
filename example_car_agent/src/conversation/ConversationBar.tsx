import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ConversationSettingsPanel, { type PanelTheme } from './ConversationSettingsPanel';
import type { ConversationPhase } from './controller';
import { GearIcon } from './GearIcon';
import { conversationHint, conversationTapEnabled } from './hint';
import type { ConversationSettings } from './settings';

type Props = {
  settings: ConversationSettings;
  onChange: (next: ConversationSettings) => void;
  phase: ConversationPhase;
  wakePhrase: string;
  onTapToTalk: () => void;
  theme?: Partial<PanelTheme>;
};

/** The chat screens' microphone line and settings icon: the gear opens the conversation settings below it. */
export default function ConversationBar({ settings, onChange, phase, wakePhrase, onTapToTalk, theme }: Props) {
  const [open, setOpen] = useState(false);
  const t = { text: '#FFFFFF', text2: 'rgba(255, 255, 255, 0.65)', accent: '#34C759', ...theme };
  const tap = conversationTapEnabled(phase);
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={phase === 'asleep' ? 'Tap to talk' : phase === 'busy' ? 'Stop the agent and talk' : 'Microphone'}
          disabled={!tap}
          activeOpacity={0.7}
          onPress={onTapToTalk}
          style={[styles.mic, { borderColor: phase === 'asleep' ? t.text2 : t.accent }]}>
          <Text style={[styles.micText, { color: phase === 'asleep' ? t.text2 : t.text }]} numberOfLines={1}>
            {conversationHint(phase, wakePhrase, settings.wakeWord)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Conversation settings"
          accessibilityState={{ expanded: open }}
          activeOpacity={0.7}
          onPress={() => setOpen((v) => !v)}
          style={[styles.gear, open && { borderColor: t.accent }]}>
          <GearIcon size={20} color={t.text} />
        </TouchableOpacity>
      </View>
      {open && (
        <View style={styles.panel}>
          <Text style={[styles.title, { color: t.accent }]}>CONVERSATION</Text>
          <ConversationSettingsPanel
            value={settings}
            onChange={onChange}
            wakePhrase={wakePhrase}
            theme={{ selectedBg: 'rgba(52, 199, 89, 0.25)', control: 'rgba(255, 255, 255, 0.08)', controlBorder: 'rgba(255, 255, 255, 0.22)', ...t }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', gap: 10, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mic: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1.5, paddingHorizontal: 14, justifyContent: 'center' },
  micText: { fontSize: 15, fontWeight: '600' },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  panel: { width: '100%', padding: 14, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.06)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', gap: 8 },
  title: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
});
