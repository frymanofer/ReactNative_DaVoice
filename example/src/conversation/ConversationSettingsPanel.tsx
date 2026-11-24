import React from 'react';
import { Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  END_OF_SPEECH_CHOICES,
  FOLLOW_UP_CHOICES,
  IDLE_CHOICES,
  LISTEN_CHOICES,
  PRE_FETCH_CHOICES,
  type Choice,
  type ConversationSettings,
} from './settings';

/** Colours and fonts of the app the panel sits in (the defaults are a plain dark theme). */
export type PanelTheme = {
  text: string;
  text2: string;
  accent: string;
  selectedBg: string;
  control: string;
  controlBorder: string;
  onAccent?: string;
  fontRegular?: string;
  fontMedium?: string;
  fontBold?: string;
};

const DEFAULT_THEME: PanelTheme = {
  text: '#F9FAFB',
  text2: '#AAB2BA',
  accent: '#34D399',
  selectedBg: '#1C4636',
  control: '#26342F',
  controlBorder: '#8C9995',
};

type Props = {
  value: ConversationSettings;
  onChange: (next: ConversationSettings) => void;
  wakePhrase?: string;
  disabled?: boolean;
  theme?: Partial<PanelTheme>;
};

/**
 * The conversation mode settings: take turns or interrupt, wake word or just talk, and each mode's timeouts
 * (src/conversation/settings.ts). Changes apply at once and are saved by the app.
 */
export default function ConversationSettingsPanel({ value, onChange, wakePhrase = 'the wake word', disabled, theme }: Props) {
  const t = { ...DEFAULT_THEME, ...theme };
  const st = makeStyles(t);
  const set = (patch: Partial<ConversationSettings>) => onChange({ ...value, ...patch });
  const setWake = (patch: Partial<ConversationSettings['wakeWordMode']>) => set({ wakeWordMode: { ...value.wakeWordMode, ...patch } });
  const setFree = (patch: Partial<ConversationSettings['freeMode']>) => set({ freeMode: { ...value.freeMode, ...patch } });
  const w = value.wakeWordMode;
  const f = value.freeMode;

  return (
    <View style={st.box}>
      <Text style={st.label}>Turns</Text>
      <Segments
        st={st}
        disabled={disabled}
        a11y="Turns"
        options={[
          { key: 'turns', label: 'Take turns' },
          { key: 'interrupt', label: 'Interrupt' },
        ]}
        selected={value.interrupt ? 'interrupt' : 'turns'}
        onSelect={(k) => set({ interrupt: k === 'interrupt' })}
      />
      <Text style={st.caption}>
        {value.interrupt
          ? `Talk over the agent to stop it. Uses echo cancellation (AEC)${Platform.OS === 'android' ? ', experimental on Android' : ''}.`
          : 'Listening pauses while the agent answers.'}
      </Text>

      <Text style={[st.label, st.gap]}>Start each request with</Text>
      <Segments
        st={st}
        disabled={disabled}
        a11y="Start each request with"
        options={[
          { key: 'wake', label: 'Wake word' },
          { key: 'free', label: 'Just talk' },
        ]}
        selected={value.wakeWord ? 'wake' : 'free'}
        onSelect={(k) => set({ wakeWord: k === 'wake' })}
      />
      <Text style={st.caption}>
        {value.wakeWord
          ? `Say “${wakePhrase}” before a request. When the agent asks a question, answer without it.`
          : 'After the first wake word, just talk: no wake word needed.'}
      </Text>

      {value.wakeWord ? (
        <>
          <ChoiceRow st={st} disabled={disabled} label="End of speech" detail="Silence that ends your request" choices={END_OF_SPEECH_CHOICES} value={w.endOfSpeechMs} onSelect={(v) => setWake({ endOfSpeechMs: v })} />
          <ChoiceRow st={st} disabled={disabled} label="Listen after the wake word" detail="Then back to the wake word" choices={LISTEN_CHOICES} value={w.listenMs} onSelect={(v) => setWake({ listenMs: v })} />
          <ChoiceRow st={st} disabled={disabled} label="Follow-up without the wake word" detail={w.followUpMs ? 'After a question from the agent, how long it waits for your answer' : 'The wake word before every request, even after a question'} choices={FOLLOW_UP_CHOICES} value={w.followUpMs} onSelect={(v) => setWake({ followUpMs: v })} />
          <ChoiceRow st={st} disabled={disabled} label="Pre-fetch" detail={w.preFetchMs ? 'Keeps words said right after the wake word' : 'Wait for the recognizer after the wake word'} choices={PRE_FETCH_CHOICES} value={w.preFetchMs} onSelect={(v) => setWake({ preFetchMs: v })} />
          {!value.interrupt && (
            <View style={[st.row, st.gap]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.label}>Wake word stops the agent</Text>
                <Text style={st.caption}>{`“${wakePhrase}” while it talks, then your request`}</Text>
              </View>
              <Switch
                accessibilityLabel="Wake word stops the agent"
                value={w.stopWord}
                disabled={disabled}
                onValueChange={(stopWord) => setWake({ stopWord })}
                trackColor={{ false: t.controlBorder, true: t.accent }}
              />
            </View>
          )}
        </>
      ) : (
        <>
          <ChoiceRow st={st} disabled={disabled} label="End of speech" detail="Silence that ends your request" choices={END_OF_SPEECH_CHOICES} value={f.endOfSpeechMs} onSelect={(v) => setFree({ endOfSpeechMs: v })} />
          <ChoiceRow
            st={st}
            disabled={disabled}
            label="Stop listening after"
            detail={f.idleMs ? `Then say “${wakePhrase}” or tap the microphone` : 'Listening stays on'}
            choices={IDLE_CHOICES}
            value={f.idleMs}
            onSelect={(v) => setFree({ idleMs: v })}
          />
        </>
      )}
    </View>
  );
}

function ChoiceRow({ st, label, detail, choices, value, onSelect, disabled }: {
  st: ReturnType<typeof makeStyles>; label: string; detail: string; choices: Choice[]; value: number; onSelect: (v: number) => void; disabled?: boolean;
}) {
  return (
    <View style={[st.gap, { gap: 6 }]}>
      <View style={st.row}>
        <Text style={[st.label, { flex: 1 }]}>{label}</Text>
      </View>
      <Segments
        st={st}
        disabled={disabled}
        a11y={label}
        options={choices.map((c) => ({ key: String(c.value), label: c.label }))}
        selected={String(value)}
        onSelect={(k) => onSelect(Number(k))}
      />
      <Text style={st.caption}>{detail}</Text>
    </View>
  );
}

function Segments({ st, options, selected, onSelect, disabled, a11y }: {
  st: ReturnType<typeof makeStyles>; options: { key: string; label: string }[]; selected: string; onSelect: (key: string) => void; disabled?: boolean; a11y: string;
}) {
  return (
    <View style={st.segments} accessibilityRole="radiogroup" accessibilityLabel={a11y}>
      {options.map((o) => {
        const on = o.key === selected;
        return (
          <TouchableOpacity
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={`${a11y}: ${o.label}`}
            disabled={disabled}
            onPress={() => onSelect(o.key)}
            style={[st.segment, on && st.segmentOn, disabled && { opacity: 0.5 }]}>
            <Text style={[st.segmentText, on && st.segmentTextOn]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(t: PanelTheme) {
  return StyleSheet.create({
    box: { gap: 6, paddingVertical: 4 },
    gap: { marginTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    label: { fontFamily: t.fontBold, fontWeight: t.fontBold ? undefined : '700', fontSize: 14, color: t.text },
    caption: { fontFamily: t.fontMedium, fontSize: 12, color: t.text2 },
    segments: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.control, borderWidth: 1, borderColor: t.controlBorder },
    segmentOn: { backgroundColor: t.selectedBg, borderColor: t.accent, borderWidth: 2 },
    segmentText: { fontFamily: t.fontMedium, fontSize: 13, color: t.text2 },
    segmentTextOn: { fontFamily: t.fontBold, fontWeight: t.fontBold ? undefined : '700', color: t.text },
  });
}
