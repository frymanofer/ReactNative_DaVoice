import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, F, LIFT, PRIMARY_GRADIENT } from './theme';
import { Chevron, Footer, Heading, PanelScreen, PrimaryButton, SectionLabel } from './chrome';

type Example = { ability: string; label: string; text: string };

type Props = {
  /** Voices with emotions / styles, and how many styles each has. */
  expressive: { name: string; styles: number }[];
  /** The v1 model's own voice (fastest), shown first among the built-in ones. */
  originalVoice: string | null;
  builtIn: string[];
  cloned: string[];
  selected: string;
  examples: Example[];
  playingExample: string | null;
  onSelect: (voice: string) => void;
  onPlayExample: (text: string) => void;
  onClone: () => void;
  onDeleteCloned: (voice: string) => void;
  onContinue: () => void;
};

function Avatar({ name, on, size }: { name: string; on: boolean; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: on ? C.mint : '#26322E',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontFamily: F.bold, fontSize: size > 34 ? 15 : 13, color: on ? C.onPrimary : C.text }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function VoiceScreen(p: Props) {
  const builtIn = p.originalVoice ? [p.originalVoice, ...p.builtIn] : p.builtIn;
  const maxStyles = Math.max(0, ...p.expressive.map((v) => v.styles));
  const clonedSelected = p.cloned.includes(p.selected);

  return (
    <PanelScreen>
      <Heading eyebrow="Step 2 of 5" title="Choose Your Voice" />
      {/* The list scrolls when it is taller than the screen (small phones, many cloned voices); Continue stays in view. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} persistentScrollbar>
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={p.onClone} style={styles.cloneRow}>
          <View style={styles.cloneIcon}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M12 5v14M5 12h14" stroke={C.onPrimary} strokeWidth={2.6} strokeLinecap="round" fill="none" />
            </Svg>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.cloneTitle}>Clone a new voice</Text>
          </View>
          <Chevron dir="right" color={C.mint} size={20} />
        </TouchableOpacity>

        {p.expressive.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>{`Expressive · ${maxStyles} styles`}</SectionLabel>
            <View style={styles.row}>
              {p.expressive.map((v) => {
                const on = v.name === p.selected;
                return (
                  <TouchableOpacity
                    key={v.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    activeOpacity={0.8}
                    onPress={() => p.onSelect(v.name)}
                    style={[styles.expressive, on ? styles.on : styles.off]}>
                    <Avatar name={v.name} on={on} size={36} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={styles.voiceName} numberOfLines={1}>{v.name}</Text>
                      <Text style={styles.voiceKind}>{`${v.styles} styles`}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {p.examples.length > 0 && (
              <View style={styles.row}>
                {p.examples.slice(0, 3).map((e) => {
                  const playing = p.playingExample === e.text;
                  return (
                    <TouchableOpacity
                      key={e.ability}
                      accessibilityRole="button"
                      accessibilityLabel={`Play example: ${e.label}`}
                      activeOpacity={0.8}
                      onPress={() => p.onPlayExample(e.text)}
                      style={[styles.styleChip, playing && styles.styleChipPlaying]}>
                      <Svg width={11} height={11} viewBox="0 0 24 24">
                        <Path d="M7 4v16l13-8z" fill={C.mint} />
                      </Svg>
                      <Text style={styles.styleChipText} numberOfLines={1}>{e.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>Built-in</SectionLabel>
          <View style={styles.grid}>
            {builtIn.map((name) => {
              const on = name === p.selected;
              return (
                <TouchableOpacity
                  key={name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  activeOpacity={0.8}
                  onPress={() => p.onSelect(name)}
                  style={[styles.builtIn, on ? styles.on : styles.off]}>
                  <Avatar name={name} on={on} size={32} />
                  <Text style={styles.builtInName} numberOfLines={1} adjustsFontSizeToFit>{name}</Text>
                  {name === p.originalVoice && <Text style={styles.fastest}>fastest</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <SectionLabel>Your cloned voices</SectionLabel>
            {clonedSelected && (
              <TouchableOpacity accessibilityRole="button" hitSlop={12} onPress={() => p.onDeleteCloned(p.selected)}>
                <Text style={styles.delete}>{`Delete "${p.selected}"`}</Text>
              </TouchableOpacity>
            )}
          </View>
          {p.cloned.length === 0 ? (
            <View style={styles.emptyCloned}>
              <Text style={styles.emptyText}>None yet</Text>
            </View>
          ) : (
            <View style={styles.clonedRow}>
              {p.cloned.map((name) => {
                const on = name === p.selected;
                return (
                  <TouchableOpacity
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    activeOpacity={0.8}
                    onPress={() => p.onSelect(name)}
                    style={[styles.clonedChip, on ? styles.on : styles.off]}>
                    <Text style={styles.clonedText} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      <Footer style={styles.footer}>
        <PrimaryButton style={{ flex: 1 }} label={`Continue with ${p.selected}`} onPress={p.onContinue} />
      </Footer>
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  body: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 14, gap: 16 },
  footer: { marginTop: 0, paddingTop: 12 },
  cloneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 60,
    paddingHorizontal: 14,
    borderRadius: 14,
    // A solid, lifted button (it was a dashed outline on the bare background and did not read as one).
    borderWidth: 1.5,
    borderColor: C.mint,
    backgroundColor: C.tile,
    boxShadow: LIFT,
  },
  cloneIcon: { width: 36, height: 36, borderRadius: 10, experimental_backgroundImage: PRIMARY_GRADIENT, alignItems: 'center', justifyContent: 'center' },
  cloneTitle: { fontFamily: F.bold, fontSize: 15, color: '#FFFFFF' },
  cloneSub: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 10 },
  on: { borderColor: C.mint, borderWidth: 2, backgroundColor: '#1C4636', boxShadow: '0 0 14px rgba(16, 185, 129, 0.55)' },
  off: { borderColor: C.tileBorder, boxShadow: LIFT },
  expressive: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 60,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: C.tile,
  },
  voiceName: { fontFamily: F.bold, fontSize: 15, color: '#FFFFFF' },
  voiceKind: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  styleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
  },
  styleChipPlaying: { borderColor: C.mint, backgroundColor: 'rgba(16, 185, 129, 0.12)' },
  styleChipText: { fontFamily: F.medium, fontSize: 13, color: C.text, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  builtIn: {
    width: '18.6%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    height: 76,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: C.tile,
  },
  builtInName: { fontFamily: F.semibold, fontSize: 12, color: C.text },
  fastest: { position: 'absolute', top: 2, right: 4, fontFamily: F.semibold, fontSize: 8, color: C.mintLight },
  emptyCloned: { height: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#1F2B27' },
  emptyText: { fontFamily: F.regular, fontSize: 13, color: C.text2 },
  clonedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clonedChip: { height: 44, minWidth: 64, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, backgroundColor: C.tile, justifyContent: 'center' },
  clonedText: { fontFamily: F.semibold, fontSize: 13, color: C.text, textAlign: 'center' },
  delete: { fontFamily: F.semibold, fontSize: 12, color: C.warning2 },
});
