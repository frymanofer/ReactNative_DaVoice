import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  CONFIDENCE_FALLBACKS,
  CONFIDENCE_STEP,
  formatThreshold,
  snapThreshold,
  type ConfidenceSettings,
} from './confidence';
// The car agent's dark theme tokens (src/redesign/theme.ts there), inline: this app has no redesign theme.
const C = { titanium: '#4B5552', emerald: '#10B981', mint: '#34D399', mintPale: '#D1FAE5', text: '#F9FAFB', text2: '#AAB2BA', tag: '#D1D5DB',
  carbon: '#26342F', controlBorder: '#8C9995' };
const F = { regular: undefined, medium: undefined, semibold: undefined, bold: undefined } as Record<string, string | undefined>;

type Props = {
  value: ConfidenceSettings;
  onChange: (next: ConfidenceSettings) => void;
  disabled?: boolean;
};

/**
 * Local confidence (core 2026-11-19): ON / OFF, a threshold slider 0.00 .. 1.00 in 0.05 steps (shown as "0.90 / 90%"), and what a
 * command below it becomes (Clarify / Remote / Decline). OFF keeps today's behaviour; the safety checks apply either way.
 */
export default function ConfidenceControls({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<ConfidenceSettings>) => onChange({ ...value, ...patch });
  const off = !value.enabled;
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.label}>Local confidence</Text>
          <Text style={styles.value}>{value.enabled ? `On · ${formatThreshold(value.threshold)}` : 'Off · every command is checked by the safety rules only'}</Text>
        </View>
        <Switch
          accessibilityLabel="Local confidence on or off"
          value={value.enabled}
          disabled={disabled}
          onValueChange={(enabled) => set({ enabled })}
          trackColor={{ false: C.titanium, true: C.emerald }}
          thumbColor={value.enabled ? C.mintPale : '#D1D5DB'}
        />
      </View>
      <ThresholdSlider value={value.threshold} disabled={disabled} dim={off} onChange={(threshold) => set({ threshold })} />
      <Text style={[styles.caption, off && styles.dim]}>Below the threshold the action does not run:</Text>
      <View style={[styles.segments, off && styles.dim]} accessibilityRole="radiogroup">
        {CONFIDENCE_FALLBACKS.map((f) => {
          const on = value.fallback === f.value;
          return (
            <TouchableOpacity
              key={f.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
              accessibilityLabel={`${f.label}: ${f.detail}`}
              disabled={disabled}
              onPress={() => set({ fallback: f.value })}
              style={[styles.segment, on && styles.segmentOn]}>
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.caption, off && styles.dim]}>
        {CONFIDENCE_FALLBACKS.find((f) => f.value === value.fallback)?.detail ?? ''}
      </Text>
      <Text style={styles.note}>
        The score is the model's own estimate, not a guaranteed probability that the action is right. Unsafe or unsupported commands are
        blocked whatever this setting is.
      </Text>
    </View>
  );
}

function ThresholdSlider({ value, onChange, disabled, dim }: { value: number; onChange: (v: number) => void; disabled?: boolean; dim?: boolean }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;
  // the latest props for the (stable) responder: a PanResponder rebuilt mid-drag would lose the gesture's dx
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const w = widthRef.current || 1;
          const v = snapThreshold(e.nativeEvent.locationX / w);
          startRef.current = v;
          if (v !== valueRef.current) onChangeRef.current(v);
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current || 1;
          const v = snapThreshold(startRef.current + g.dx / w);
          if (v !== valueRef.current) onChangeRef.current(v);
        },
      }),
    [],
  );
  const step = (d: number) => onChange(snapThreshold(value + d * CONFIDENCE_STEP));
  const x = width * snapThreshold(value);
  return (
    <View style={[styles.sliderRow, dim && styles.dim]}>
      <StepButton label="−" a11y="Lower the threshold by 0.05" disabled={disabled || value <= 0} onPress={() => step(-1)} />
      <View
        style={styles.track}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Confidence threshold"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(snapThreshold(value) * 100), text: formatThreshold(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        {...responder.panHandlers}>
        <View style={styles.rail} />
        <View style={[styles.fill, { width: x }]} />
        <View style={[styles.thumb, { left: Math.max(0, x - 11) }]} />
      </View>
      <StepButton label="+" a11y="Raise the threshold by 0.05" disabled={disabled || value >= 1} onPress={() => step(1)} />
      <Text style={styles.sliderValue}>{formatThreshold(value)}</Text>
    </View>
  );
}

function StepButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} onPress={onPress} style={[styles.stepButton, disabled && { opacity: 0.4 }]}>
      <Text style={styles.stepText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#0D1411' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: F.bold, fontSize: 14, color: C.text },
  value: { fontFamily: F.medium, fontSize: 12, color: C.text2 },
  caption: { fontFamily: F.medium, fontSize: 12, color: C.tag },
  note: { fontFamily: F.regular, fontSize: 11, lineHeight: 15, color: C.text2 },
  dim: { opacity: 0.45 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: C.titanium },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: C.mint },
  thumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: C.mintPale, borderWidth: 2, borderColor: C.emerald },
  sliderValue: { fontFamily: F.bold, fontSize: 13, color: C.text, minWidth: 82, textAlign: 'right' },
  stepButton: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.carbon, borderWidth: 1, borderColor: C.controlBorder },
  stepText: { fontFamily: F.bold, fontSize: 16, color: C.text },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: C.carbon, borderWidth: 1, borderColor: C.controlBorder },
  segmentOn: { backgroundColor: '#1C4636', borderColor: C.mint, borderWidth: 2 },
  segmentText: { fontFamily: F.semibold, fontSize: 13, color: C.tag },
  segmentTextOn: { fontFamily: F.bold, color: C.text },
});
