import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ConversationSettingsPanel from '../conversation/ConversationSettingsPanel';
import type { ConversationSettings } from '../conversation/settings';
import { PrimaryButton, SecondaryButton, statusBarHeight } from './chrome';
import { C, F } from './theme';
import { GearIcon } from './icons';
import PrivacyPolicyLink from './PrivacyPolicyLink';

/**
 * The settings gear on every setup screen (language, voice, speaker, wake word...). It floats at the top right and opens the
 * conversation settings: turns or interrupt (AEC), wake word or just talk, the timeouts and pre-fetch. The car screen has its own
 * gear in its top bar, with the model settings as well.
 */
export default function SettingsGear({
  value,
  onChange,
  wakePhrase,
}: {
  value: ConversationSettings;
  onChange: (next: ConversationSettings) => void;
  wakePhrase: string;
}) {
  const [open, setOpen] = useState(false);
  // a draft: nothing changes in the app until Save
  const [draft, setDraft] = useState<ConversationSettings>(value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const { height: windowHeight } = useWindowDimensions();
  const sb = statusBarHeight();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings: conversation mode"
        hitSlop={8}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={[styles.gear, { top: sb + 10 }]}>
        <GearIcon size={22} color={C.text} />
      </Pressable>
      {open && (
        <Pressable accessibilityLabel="Close settings" style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { top: sb + 64, maxHeight: Math.max(240, windowHeight - sb - 88) }]} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator>
              <Text style={styles.title}>CONVERSATION</Text>
              <ConversationSettingsPanel
                value={draft}
                onChange={setDraft}
                wakePhrase={wakePhrase}
                theme={{ text: C.text, text2: C.text2, accent: C.mint, selectedBg: '#1C4636', control: C.carbon, controlBorder: C.controlBorder, fontMedium: F.medium, fontBold: F.bold }}
              />
              <Text style={styles.note}>The model and local confidence settings are on the car screen (the gear at its top).</Text>
              <View style={styles.divider} />
              <Text style={styles.title}>ABOUT</Text>
              <PrivacyPolicyLink />
            </ScrollView>
            <View style={styles.buttons}>
              <SecondaryButton label="Cancel" onPress={() => setOpen(false)} style={{ flex: 1 }} />
              <PrimaryButton
                label="Save"
                disabled={!dirty}
                onPress={() => {
                  onChange(draft);
                  setOpen(false);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  gear: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 14, 12, 0.72)',
    borderWidth: 1,
    borderColor: C.titanium,
    zIndex: 20,
    elevation: 20,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 30, elevation: 30 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.titanium,
    backgroundColor: C.panel,
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
  },
  buttons: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  title: { fontFamily: F.bold, fontSize: 11, letterSpacing: 2, color: C.mint },
  note: { fontFamily: F.medium, fontSize: 12, color: C.text2 },
  divider: { height: 1, backgroundColor: C.titanium, marginVertical: 4 },
});

// A wrapper so App.tsx can put the gear over any screen.
export function WithSettingsGear({ children, ...gear }: React.ComponentProps<typeof SettingsGear> & { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      <SettingsGear {...gear} />
    </View>
  );
}
