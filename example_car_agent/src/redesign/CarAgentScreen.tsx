import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { getCarActions, getCarState, onCarChange, resetCar, setDriving } from '../car/CarState';
import type { CarAction, CarState } from '../car/CarState';
import CarDrawing, { CAR_ASPECT } from './CarDrawing';
import { CarbonFill, Chevron, EMBLEM, statusBarHeight } from './chrome';
import { C, F, PRIMARY_GRADIENT, LIFT, MESSAGE_CARD } from './theme';
import ConfidenceControls from './ConfidenceControls';
import { OUTCOME_LABEL, formatScore, type ConfidenceSettings, type TurnConfidence, type TurnOutcome } from '../local_llm/confidence';

type Props = {
  language: string;
  voice: string;
  wakePhrase: string;
  heard: string;
  reply: string;
  working: boolean;
  ignored: boolean;
  modelName: string;
  localConfidence: ConfidenceSettings;
  /** The last request: what happened and the model's score for its action (core 2026-11-19). */
  lastTurn?: { outcome?: TurnOutcome; confidence?: TurnConfidence };
  onBack: () => void;
  onResetChat: () => void;
  onChangeModel: () => void;
  onChangeConfidence: (next: ConfidenceSettings) => void;
  /** Dev aid: sends text through the same path as a final STT transcript. */
  onSendText?: (text: string) => void;
  onRunTestScript?: () => void;
};

const SUGGESTIONS_PT = [
  'Abre o vidro do motorista', 'Tô com frio', 'Abre o teto', 'Me leva pra casa', 'Liga pra Ana', 'Abre o porta-malas',
  'Coloca o ar em 19', 'Luz ambiente azul', 'Abre a porta traseira esquerda', 'Tranca o carro', 'Toca Anitta',
  'Quanto tem de combustível?', 'Desembaça o vidro', 'Volume 20',
];
const SUGGESTIONS_EN = [
  'Open the driver window', "I'm cold", 'Open the sunroof', 'Take me home', 'Call Ana', 'Open the trunk', 'Set the AC to 19',
  'Ambient light blue', 'Open the rear left door', 'Lock the car', 'Play Anitta', 'How much fuel do I have?',
  'Defrost the windshield', 'Volume 20',
];

function callText(action: CarAction): string {
  const args = Object.entries(action.args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return `${action.tool}(${args})`;
}

function banner(s: CarState): { text: string; meta: string } | null {
  if (s.call) return { text: `Calling ${s.call}`, meta: 'Phone' };
  if (s.destination) return { text: `→ ${s.destination}`, meta: s.avoid.length ? `avoid ${s.avoid.join(', ')}` : 'Navigation' };
  if (s.radio) return { text: `♪ ${s.radio}`, meta: 'Radio' };
  if (s.media) return { text: `♪ ${s.media}`, meta: s.source };
  if (s.scenario) return { text: `${s.scenario.replace('_', ' ')} mode`, meta: '' };
  return null;
}

function Stat({ label, value, unit, sub, align, big, color }: {
  label: string; value: string; unit?: string; sub?: string; align: 'left' | 'right'; big?: boolean; color?: string;
}) {
  return (
    <View style={{ gap: 1, alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[big ? styles.statBig : styles.statValue, color ? { color } : null]} numberOfLines={1}>
        {value}
        {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      {!!sub && <Text style={styles.statSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.8} onPress={onPress} style={styles.iconButton}>
      {children}
    </TouchableOpacity>
  );
}

export default function CarAgentScreen(p: Props) {
  const [, setVersion] = useState(0);
  useEffect(() => onCarChange(() => setVersion((v) => v + 1)), []);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [text, setText] = useState('');

  const s = getCarState();
  const actions = getCarActions();
  const latest = actions[actions.length - 1];
  const pt = p.language === 'pt-BR';
  const sb = statusBarHeight();
  const pop = banner(s);

  const openDoors = Object.values(s.doors).filter((d) => d === 'open').length;
  const anyLock = Object.values(s.doorLocks).some(Boolean);
  const doorsLabel = openDoors ? `${openDoors} open` : s.locked ? 'Locked' : anyLock ? 'Part locked' : 'Unlocked';

  const blocked = !!latest && !latest.ok;
  const title = p.working
    ? 'Working…'
    : p.ignored
      ? 'Not for me — ignored'
      : latest
        ? `${blocked ? 'Blocked: ' : ''}${latest.summary.charAt(0).toUpperCase()}${latest.summary.slice(1)}`
        : 'Ready for a command';

  const pool = pt ? SUGGESTIONS_PT : SUGGESTIONS_EN;
  const k = (actions.length * 3) % pool.length;
  const chips = [0, 1, 2].map((i) => pool[(k + i) % pool.length]);

  const send = (value: string) => {
    const t = value.trim();
    if (!t || !p.onSendText) return;
    Keyboard.dismiss();
    setText('');
    p.onSendText(t);
  };

  const onArea = (e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const sideW = Math.max(76, area.w * 0.2);
  const carW = Math.max(0, Math.min(area.h * CAR_ASPECT, area.w - 2 * sideW));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={[styles.header, { paddingTop: sb, height: 56 + sb }]}>
        <CarbonFill id="carbonCarHeader" />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={p.onBack} style={styles.iconPlain}>
          <Chevron />
        </TouchableOpacity>
        <View style={styles.headerEmblem}>
          <Image source={EMBLEM} style={{ width: 32, height: 32 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>Car Agent</Text>
          <Text style={styles.headerSub}>On-device</Text>
        </View>
        <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Vehicle state">
          {([false, true] as const).map((driving) => {
            const on = s.driving === driving;
            return (
              <TouchableOpacity
                key={String(driving)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setDriving(driving)}
                style={[styles.segmentItem, on && styles.segmentOn]}>
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{driving ? 'Driving' : 'Parked'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.bannerRow}>
        <View style={[styles.banner, pop ? styles.bannerOn : styles.bannerOff]} accessibilityLiveRegion="polite">
          <View style={[styles.bannerDot, { backgroundColor: pop ? C.mint : C.titanium }]} />
          <Text style={styles.bannerText} numberOfLines={1}>
            {pop ? pop.text : `${s.driving ? 'Driving' : 'Parked'} · all on-device`}
          </Text>
          {!!pop?.meta && <Text style={styles.bannerMeta} numberOfLines={1}>{pop.meta}</Text>}
        </View>
        <IconButton
          label="Reset car and chat"
          onPress={() => {
            resetCar();
            p.onResetChat();
          }}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" stroke={C.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </IconButton>
        <IconButton label="Settings: model and local confidence" onPress={() => setSettingsOpen(true)}>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke={C.text} strokeWidth={2} strokeLinecap="round" fill="none" />
            <Circle cx={16} cy={7} r={2} stroke={C.text} strokeWidth={2} fill="none" />
            <Circle cx={10} cy={17} r={2} stroke={C.text} strokeWidth={2} fill="none" />
          </Svg>
        </IconButton>
      </View>

      <View style={styles.stage} onLayout={onArea}>
        <View style={[styles.side, { left: 10, width: sideW }]}>
          <Stat align="left" big label="Driver" value={`${s.temperature.driver}°`} />
          <Stat align="left" label="Fan" value={String(s.fan)} unit=" / 7" />
          <Stat align="left" label="Fuel" value={`${s.fuelPercent}%`} />
        </View>
        <View style={[styles.side, { right: 10, width: sideW, alignItems: 'flex-end' }]}>
          <Stat align="right" big label="Passenger" value={`${s.temperature.passenger}°`} />
          <Stat align="right" label="Volume" value={s.muted ? 'Muted' : String(s.volume)} sub={s.radio ? 'Radio' : s.source} />
          <Stat align="right" label="Doors" value={doorsLabel} color={openDoors || s.locked ? C.mint : undefined} />
        </View>
        {carW > 0 && <CarDrawing state={s} latest={latest} width={carW} />}
      </View>

      <View style={[styles.lastCard, { borderColor: blocked ? 'rgba(245, 158, 11, 0.8)' : latest || p.heard ? C.mint : '#1F2B27' }]} accessibilityLiveRegion="polite">
        <Text style={styles.heard} numberOfLines={1}>
          You: <Text style={styles.heardText}>{p.heard ? `“${p.heard}”` : '—'}</Text>
        </Text>
        <Text style={[styles.lastTitle, blocked && !p.working && { color: C.warning2 }]} numberOfLines={1}>{title}</Text>
        <Text style={styles.call} numberOfLines={1}>
          {latest ? callText(latest) : `Say “${p.wakePhrase}”, then speak`}
        </Text>
        {!!p.reply && !p.ignored && (
          <Text style={styles.reply} numberOfLines={2}>{`${p.voice}: ${p.reply}`}</Text>
        )}
        {!p.working && !!p.lastTurn?.outcome && (
          <Text style={styles.turnInfo} numberOfLines={1} accessibilityLabel={`${OUTCOME_LABEL[p.lastTurn.outcome]}. ${formatScore(p.lastTurn.confidence)}`}>
            <Text style={[styles.turnOutcome, p.lastTurn.outcome === 'executed' ? { color: C.mint } : { color: C.warning2 }]}>
              {OUTCOME_LABEL[p.lastTurn.outcome]}
            </Text>
            {p.lastTurn.confidence?.low ? ' · held back by Local confidence' : ''}
            {formatScore(p.lastTurn.confidence) ? ` · ${formatScore(p.lastTurn.confidence)}` : ''}
          </Text>
        )}
      </View>

      {p.onSendText ? (
        <View style={styles.devArea}>
          <View style={styles.chipRow}>
            {chips.map((c) => (
              <TouchableOpacity key={c} accessibilityRole="button" activeOpacity={0.8} disabled={p.working} onPress={() => send(c)} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <MicIcon />
            <TextInput
              accessibilityLabel="What the driver says"
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => send(text)}
              placeholder="What the driver says…"
              placeholderTextColor={C.text2}
              returnKeyType="send"
              editable={!p.working}
              style={styles.input}
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send" onPress={() => send(text)} style={styles.sendButton}>
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M5 12h14M13 6l6 6-6 6" stroke={C.onPrimary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.inputRow, styles.voiceHint]}>
          <MicIcon />
          <Text style={styles.voiceHintText} numberOfLines={1}>{`Say “${p.wakePhrase}”, then speak`}</Text>
        </View>
      )}

      {settingsOpen && (
        <Pressable accessibilityLabel="Close settings" style={styles.sheetBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={[styles.sheet, { top: sb + 112 }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>SETTINGS</Text>
            <SettingRow
              label="Model"
              value={p.modelName || '…'}
              action="Change"
              disabled={p.working}
              onPress={() => {
                setSettingsOpen(false);
                p.onChangeModel();
              }}
            />
            <ConfidenceControls value={p.localConfidence} onChange={p.onChangeConfidence} disabled={p.working} />
            {p.onRunTestScript && (
              <SettingRow
                label="Test script (dev)"
                value="files/inapp_test.txt"
                action="Run"
                onPress={() => {
                  setSettingsOpen(false);
                  p.onRunTestScript?.();
                }}
              />
            )}
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

function MicIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={C.mint} strokeWidth={2.2} fill="none" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={C.mint} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function SettingRow({ label, value, action, onPress, disabled }: {
  label: string; value: string; action: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingValue} numberOfLines={2}>{value}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.settingAction, disabled && { opacity: 0.5 }]}>
        <Text style={styles.settingActionText}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.mint,
    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.18)',
    overflow: 'hidden',
  },
  iconPlain: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerEmblem: { width: 32, height: 32, borderRadius: 16, boxShadow: '0 0 8px rgba(52, 211, 153, 0.5)' },
  headerTitle: { fontFamily: F.bold, fontSize: 15, color: C.text },
  headerSub: { fontFamily: F.regular, fontSize: 11, color: C.text2 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, borderWidth: 1, borderColor: '#2A3632', backgroundColor: C.carbon },
  segmentItem: { height: 38, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center' },
  segmentOn: { backgroundColor: C.emerald },
  segmentText: { fontFamily: F.semibold, fontSize: 13, color: C.tag },
  segmentTextOn: { color: C.onPrimary },
  bannerRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginHorizontal: 12, height: 44 },
  banner: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  bannerOn: { borderColor: C.mint, backgroundColor: 'rgba(16, 185, 129, 0.12)', boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)' },
  bannerOff: { borderColor: '#34423D', backgroundColor: '#141C19' },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text },
  bannerMeta: { fontFamily: F.regular, fontSize: 12, color: C.text2, maxWidth: '40%' },
  iconButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#2A3632', backgroundColor: C.carbon, alignItems: 'center', justifyContent: 'center' },
  stage: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    experimental_backgroundImage: 'radial-gradient(ellipse at 50% 50%, #0C1512 0%, rgba(6, 9, 8, 0) 70%)',
  },
  side: { position: 'absolute', top: 24, gap: 18 },
  statLabel: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.2, color: C.text2 },
  statBig: { fontFamily: F.bold, fontSize: 28, color: C.text, fontVariant: ['tabular-nums'] },
  statValue: { fontFamily: F.bold, fontSize: 18, color: C.text },
  statUnit: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  statSub: { fontFamily: F.regular, fontSize: 11, color: C.text2 },
  lastCard: {
    marginHorizontal: 12,
    marginTop: 6,
    minHeight: 96,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    // The main message of the screen: a lighter, lifted card.
    borderWidth: 1.5,
    backgroundColor: MESSAGE_CARD,
    boxShadow: LIFT,
    gap: 3,
  },
  heard: { fontFamily: F.regular, fontSize: 13, color: C.tag },
  heardText: { fontFamily: F.medium, color: C.text },
  lastTitle: { fontFamily: F.extrabold, fontSize: 17, color: '#FFFFFF' },
  call: { fontFamily: 'monospace', fontSize: 11, color: C.tag },
  reply: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: '#A7F3D0' },
  devArea: { marginHorizontal: 12, marginTop: 8, marginBottom: 16, gap: 8 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.75)', backgroundColor: C.carbon, justifyContent: 'center' },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: '#FFFFFF', textAlign: 'center' },
  inputRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: C.mint,
    backgroundColor: '#1A2622',
    boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
  },
  input: { flex: 1, minWidth: 0, height: 44, fontFamily: F.regular, fontSize: 15, color: C.text, paddingVertical: 0 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', experimental_backgroundImage: PRIMARY_GRADIENT },
  voiceHint: { marginHorizontal: 12, marginTop: 8, marginBottom: 16 },
  voiceHintText: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.tag },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 10 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 16,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.titanium,
    backgroundColor: C.panel,
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
  },
  sheetTitle: { fontFamily: F.bold, fontSize: 11, letterSpacing: 2, color: C.mint },
  turnInfo: { fontFamily: F.medium, fontSize: 12, color: C.text2 },
  turnOutcome: { fontFamily: F.bold, fontSize: 12 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontFamily: F.semibold, fontSize: 14, color: C.text },
  settingValue: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  settingAction: { height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.5)', justifyContent: 'center' },
  settingActionText: { fontFamily: F.semibold, fontSize: 14, color: C.mint },
});
