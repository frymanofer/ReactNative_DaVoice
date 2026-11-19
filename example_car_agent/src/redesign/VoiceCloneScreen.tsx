import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type DimensionValue,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { C, F, LIFT, MESSAGE_CARD } from './theme';
import { BackSquare, Footer, Heading, PanelScreen, PrimaryButton, SecondaryButton, SectionLabel } from './chrome';

type Source = 'mic' | 'file';

type Props = {
  name: string;
  /** The cloned voice this name would replace, if any. */
  replaces: string | null;
  source: Source;
  /** The text the user reads aloud into the microphone. */
  readingText: string;
  recommendedSeconds: number;
  maxSeconds: number;
  recording: boolean;
  recordSeconds: number;
  /** Loudest sample of the recording so far, 0 to 1. */
  recordPeak: number;
  /** What was recorded or chosen ("Microphone recording (12.0 s)", a file name). */
  sample: string | null;
  volumePercent: number;
  minVolumePercent: number;
  maxVolumePercent: number;
  busy: boolean;
  error: string | null;
  /** The created voice; `weak` when the recording had little clear speech. */
  result: { voice: string; weak: boolean } | null;
  folder: string;
  onChangeName: (name: string) => void;
  onChangeSource: (source: Source) => void;
  onToggleRecording: () => void;
  onPickFile: () => void;
  onPlaySample: () => void;
  onVolumeDown: () => void;
  onVolumeUp: () => void;
  onCreate: () => void;
  onListen: () => void;
  onUse: () => void;
  onBack: () => void;
};

const SOURCES: { key: Source; label: string }[] = [
  { key: 'mic', label: 'Microphone' },
  { key: 'file', label: 'Upload a file' },
];

function PlayIcon({ size = 12, color = C.mint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4v16l13-8z" fill={color} />
    </Svg>
  );
}

export default function VoiceCloneScreen(p: Props) {
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportHeight = useRef(0);
  const sampleSectionY = useRef(0);
  const recordButtonBottom = useRef(0);
  // Choosing the microphone brings the record button into view, with the text to read above it.
  const [revealRecord, setRevealRecord] = useState(false);
  // With the keyboard open the footer leaves, so the name field keeps its room.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function scrollToRecordButton() {
    if (!viewportHeight.current || !recordButtonBottom.current) return false;
    const y = sampleSectionY.current + recordButtonBottom.current + 16 - viewportHeight.current;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    return true;
  }

  useEffect(() => {
    if (!revealRecord || p.source !== 'mic') return;
    const timer = setTimeout(() => {
      if (scrollToRecordButton()) setRevealRecord(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [revealRecord, p.source]);

  const clock = `${Math.floor(p.recordSeconds / 60)}:${String(Math.floor(p.recordSeconds % 60)).padStart(2, '0')}`;
  const clipping = p.recordPeak > 0.97;
  const levelWidth: DimensionValue = `${Math.round(Math.min(1, p.recordPeak) * 100)}%`;
  const recordHint = p.recording
    ? clipping
      ? 'Too loud: move the phone a little further away.'
      : p.recordSeconds < p.recommendedSeconds
        ? `Keep reading: about ${p.recommendedSeconds} seconds is best.`
        : 'Good. Stop when you finish the sentence.'
    : `Recording stops by itself after ${p.maxSeconds} seconds.`;
  const volumeHint =
    p.volumePercent === 100
      ? 'Same loudness as the recording.'
      : `${Math.abs(p.volumePercent - 100)}% ${p.volumePercent > 100 ? 'louder' : 'quieter'} than the recording.`;
  const canGoDown = !p.busy && p.volumePercent > p.minVolumePercent;
  const canGoUp = !p.busy && p.volumePercent < p.maxVolumePercent;

  return (
    <PanelScreen>
      <Heading
        style={styles.heading}
        eyebrow="Step 2 of 5"
        title="Clone a New Voice"
        subtitle={`One person speaking for about ${p.recommendedSeconds} seconds.`}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        persistentScrollbar
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}>
        <View style={styles.section}>
          <SectionLabel>Voice name</SectionLabel>
          <TextInput
            accessibilityLabel="Voice name"
            style={styles.input}
            placeholder="For example: Dana"
            placeholderTextColor={C.text2}
            value={p.name}
            onChangeText={p.onChangeName}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            editable={!p.busy}
          />
          <Text style={styles.hint}>
            {p.replaces
              ? `Replaces your cloned voice "${p.replaces}".`
              : 'Shown under this name in the voice list. Letters, digits, spaces and dashes.'}
          </Text>
        </View>

        <View
          style={styles.section}
          onLayout={(e) => {
            sampleSectionY.current = e.nativeEvent.layout.y;
          }}>
          <SectionLabel>Voice sample</SectionLabel>
          <View style={styles.row}>
            {SOURCES.map((option) => {
              const on = p.source === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  activeOpacity={0.8}
                  disabled={p.recording || p.busy}
                  onPress={() => {
                    p.onChangeSource(option.key);
                    if (option.key === 'mic') setRevealRecord(true);
                  }}
                  style={[styles.segment, on ? styles.segmentOn : styles.segmentOff]}>
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {p.source === 'mic' ? (
            <>
              <Text style={styles.hint}>
                In a quiet room, read this aloud in your natural voice, at a steady distance from the phone:
              </Text>
              <View style={styles.readingCard}>
                <Text style={styles.readingText}>{p.readingText}</Text>
              </View>
              <View style={styles.meterRow}>
                <Text style={[styles.clock, p.recording && styles.clockOn]}>{clock}</Text>
                <View style={styles.levelTrack}>
                  <View style={[styles.levelFill, { width: levelWidth }, clipping && styles.levelClipping]} />
                </View>
              </View>
              <Text style={[styles.hint, clipping && p.recording && styles.hintWarning]}>{recordHint}</Text>
              <View
                onLayout={(e) => {
                  recordButtonBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
                  if (revealRecord && scrollToRecordButton()) setRevealRecord(false);
                }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.8}
                  disabled={p.busy}
                  onPress={p.onToggleRecording}
                  style={[styles.record, p.recording && styles.recordOn, p.busy && styles.dimmed]}>
                  <Svg width={18} height={18} viewBox="0 0 24 24">
                    {p.recording ? (
                      <Rect x={5} y={5} width={14} height={14} rx={3} fill={C.warning2} />
                    ) : (
                      <Path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" fill="#F87171" />
                    )}
                  </Svg>
                  <Text style={styles.recordText}>
                    {p.recording ? 'Stop recording' : p.sample ? 'Record again' : 'Start recording'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                A recording of one person speaking, without music: wav, mp3, m4a, aac, flac or ogg.
              </Text>
              <SecondaryButton
                label={p.sample ? 'Choose another file' : 'Choose an audio file'}
                disabled={p.busy}
                onPress={p.onPickFile}
              />
            </>
          )}

          {!!p.sample && !p.recording && (
            <View style={styles.sampleRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.sampleLabel}>SAMPLE</Text>
                <Text style={styles.sampleText} numberOfLines={2}>{p.sample}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Play the sample"
                activeOpacity={0.8}
                disabled={p.busy}
                onPress={p.onPlaySample}
                style={[styles.chip, p.busy && styles.dimmed]}>
                <PlayIcon />
                <Text style={styles.chipText}>Play</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionLabel>Voice volume</SectionLabel>
          <View style={styles.volumeRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Quieter"
              activeOpacity={0.8}
              disabled={!canGoDown}
              onPress={p.onVolumeDown}
              style={[styles.stepper, !canGoDown && styles.dimmed]}>
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.volumeValue}>{`${p.volumePercent}%`}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Louder"
              activeOpacity={0.8}
              disabled={!canGoUp}
              onPress={p.onVolumeUp}
              style={[styles.stepper, !canGoUp && styles.dimmed]}>
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, styles.centered]}>{volumeHint}</Text>
        </View>

        {!!p.result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>{`Voice "${p.result.voice}" is ready`}</Text>
            {p.result.weak && (
              <Text style={styles.resultWarning}>
                {`The recording has little clear speech, so the voice may not sound its best. For a better voice, record again for about ${p.recommendedSeconds} seconds in a quiet room.`}
              </Text>
            )}
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={p.onListen} style={styles.listen}>
              <PlayIcon size={14} />
              <Text style={styles.listenText}>Listen to it</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.folder}>{`Cloned voices folder: ${p.folder}`}</Text>
      </ScrollView>

      {!!p.error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{p.error}</Text>
        </View>
      )}

      {!keyboardOpen && (
        <Footer style={styles.footer}>
          <BackSquare disabled={p.busy} onPress={p.onBack} />
          {p.result ? (
            <PrimaryButton style={{ flex: 1 }} label="Use this voice" onPress={p.onUse} />
          ) : (
            <PrimaryButton
              style={{ flex: 1 }}
              label={p.busy ? 'Creating voice…' : 'Create voice'}
              disabled={p.busy || p.recording}
              onPress={p.onCreate}
            />
          )}
        </Footer>
      )}
    </PanelScreen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingBottom: 12 },
  scroll: { flex: 1, minHeight: 0 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 18 },
  section: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  hint: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.text2, paddingHorizontal: 4 },
  hintWarning: { color: C.warning2 },
  centered: { textAlign: 'center' },
  dimmed: { opacity: 0.45 },
  input: {
    height: 54,
    paddingHorizontal: 16,
    paddingVertical: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
    fontFamily: F.semibold,
    fontSize: 16,
    color: C.text,
  },
  segment: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: C.tile,
  },
  segmentOn: { borderWidth: 2, borderColor: C.mint, backgroundColor: '#1C4636', boxShadow: '0 0 14px rgba(16, 185, 129, 0.55)' },
  segmentOff: { borderWidth: 1, borderColor: C.tileBorder, boxShadow: LIFT },
  segmentText: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  segmentTextOn: { fontFamily: F.bold, color: '#FFFFFF' },
  readingCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.45)',
    backgroundColor: MESSAGE_CARD,
    boxShadow: LIFT,
  },
  readingText: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: '#FFFFFF' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  clock: { fontFamily: F.bold, fontSize: 18, color: C.tag, minWidth: 44 },
  clockOn: { color: C.mintLight },
  levelTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#18211E', borderWidth: 1, borderColor: '#2C3432', overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: 5, backgroundColor: C.mint },
  levelClipping: { backgroundColor: C.warning },
  record: {
    height: 58,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: C.mint,
    backgroundColor: C.carbon,
    boxShadow: LIFT,
  },
  recordOn: { borderColor: C.warning2, backgroundColor: '#3A2E12' },
  recordText: { fontFamily: F.bold, fontSize: 16, color: '#FFFFFF' },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C3432',
    backgroundColor: '#121A17',
  },
  sampleLabel: { fontFamily: F.bold, fontSize: 10, letterSpacing: 10 * 0.12, color: C.mint },
  sampleText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
  },
  chipText: { fontFamily: F.semibold, fontSize: 14, color: C.text },
  volumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  stepper: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
    boxShadow: LIFT,
  },
  stepperText: { fontFamily: F.bold, fontSize: 24, lineHeight: 28, color: '#FFFFFF' },
  volumeValue: { fontFamily: F.extrabold, fontSize: 22, color: '#FFFFFF', minWidth: 78, textAlign: 'center' },
  resultCard: {
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.mint,
    backgroundColor: MESSAGE_CARD,
    boxShadow: LIFT,
  },
  resultTitle: { fontFamily: F.bold, fontSize: 17, color: '#FFFFFF', textAlign: 'center' },
  resultWarning: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.warning2, textAlign: 'center' },
  listen: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.controlBorder,
    backgroundColor: C.carbon,
  },
  listenText: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  folder: { fontFamily: F.regular, fontSize: 11, lineHeight: 15, color: '#6B7672', paddingHorizontal: 4 },
  errorBar: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  errorText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.warning2, textAlign: 'center' },
  footer: { marginTop: 0, paddingTop: 12 },
});
