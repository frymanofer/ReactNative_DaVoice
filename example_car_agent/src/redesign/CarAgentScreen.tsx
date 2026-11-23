import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  StatusBar,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { getCarActions, getCarState, onCarChange, resetCar, setDriving } from '../car/CarState';
import type { CarState } from '../car/CarState';
import Car3DView from './Car3DView';
import { CarbonFill, Chevron, EMBLEM, PrimaryButton, SecondaryButton, statusBarHeight } from './chrome';
import { C, F, PRIMARY_GRADIENT, LIFT, MESSAGE_CARD } from './theme';
import ConfidenceControls from './ConfidenceControls';
import type { ConfidenceSettings, TurnConfidence, TurnOutcome } from '../local_llm/confidence';
import ConversationSettingsPanel from '../conversation/ConversationSettingsPanel';
import type { ConversationPhase } from '../conversation/controller';
import { conversationHint, conversationTapEnabled } from '../conversation/hint';
import type { ConversationSettings } from '../conversation/settings';
import { GearIcon } from './icons';

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
  /** Conversation mode (src/conversation): the settings and where the conversation is now. */
  conversation: ConversationSettings;
  onChangeConversation: (next: ConversationSettings) => void;
  conversationPhase: ConversationPhase;
  /** The microphone button: wakes a sleeping conversation, or stops the agent and listens. */
  onTapToTalk: () => void;
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

function scoreShort(c: TurnConfidence | undefined): string {
  return c && c.value !== null ? `score ${c.value.toFixed(2)}` : 'low score';
}

function banner(s: CarState): { text: string; meta: string } | null {
  if (s.call) return { text: `Calling ${s.call}`, meta: 'Phone' };
  if (s.destination) return { text: `→ ${s.destination}`, meta: s.avoid.length ? `avoid ${s.avoid.join(', ')}` : 'Navigation' };
  if (s.radio) return { text: `♪ ${s.radio}`, meta: 'Radio' };
  if (s.media) return { text: `♪ ${s.media}`, meta: s.source };
  if (s.scenario) return { text: `${s.scenario.replace('_', ' ')} mode`, meta: '' };
  return null;
}

function Stat({ label, value, color, wide }: { label: string; value: string; color?: string; wide?: boolean }) {
  return (
    <View style={[styles.stat, wide && { flex: 1.6 }]}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The sheet edits a draft; nothing changes in the app until Save (Cancel or a tap outside drops the draft).
  const [draftConversation, setDraftConversation] = useState<ConversationSettings>(p.conversation);
  const [draftConfidence, setDraftConfidence] = useState<ConfidenceSettings>(p.localConfidence);
  const conversationDirty = JSON.stringify(draftConversation) !== JSON.stringify(p.conversation);
  const confidenceDirty = JSON.stringify(draftConfidence) !== JSON.stringify(p.localConfidence);
  const openSettings = () => {
    setDraftConversation(p.conversation);
    setDraftConfidence(p.localConfidence);
    setSettingsOpen(true);
  };
  const saveSettings = () => {
    if (conversationDirty) p.onChangeConversation(draftConversation);
    if (confidenceDirty) p.onChangeConfidence(draftConfidence);
    setSettingsOpen(false);
  };
  const [text, setText] = useState('');
  const { height: windowHeight } = useWindowDimensions();

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
      ? 'Ignored'
      : latest
        ? `${blocked ? 'Blocked: ' : ''}${latest.summary.charAt(0).toUpperCase()}${latest.summary.slice(1)}`
        : 'Ready';

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
        {pop ? (
          <View style={[styles.banner, styles.bannerOn]} accessibilityLiveRegion="polite">
            <View style={[styles.bannerDot, { backgroundColor: C.mint }]} />
            <Text style={styles.bannerText} numberOfLines={1}>{pop.text}</Text>
            {!!pop.meta && <Text style={styles.bannerMeta} numberOfLines={1}>{pop.meta}</Text>}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
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
        <IconButton label="Settings: conversation, model and local confidence" onPress={openSettings}>
          <GearIcon size={20} color={C.text} />
        </IconButton>
      </View>

      <View style={styles.stage}>
        <Car3DView paused={p.working}>
          <View style={styles.stats} pointerEvents="none">
            <Stat label="Driver" value={`${s.temperature.driver}°`} />
            <Stat label="Pass." value={`${s.temperature.passenger}°`} />
            <Stat label="Fan" value={String(s.fan)} />
            <Stat label="Vol" value={s.muted ? 'Muted' : String(s.volume)} />
            <Stat label="Doors" value={doorsLabel} color={openDoors || s.locked ? C.mint : undefined} wide />
          </View>
        </Car3DView>
      </View>

      <View style={[styles.lastCard, { borderColor: blocked ? 'rgba(245, 158, 11, 0.8)' : latest || p.heard ? C.mint : '#1F2B27' }]} accessibilityLiveRegion="polite">
        {!!p.heard && <Text style={styles.heardText} numberOfLines={1}>{`“${p.heard}”`}</Text>}
        <Text style={[styles.lastTitle, blocked && !p.working && { color: C.warning2 }]} numberOfLines={1}>{title}</Text>
        {!!p.reply && !p.ignored && (
          <Text style={styles.reply} numberOfLines={2}>{p.reply}</Text>
        )}
        {!p.working && !!p.lastTurn?.confidence?.low && (
          <Text style={styles.turnInfo} numberOfLines={1}>{`Held back · ${scoreShort(p.lastTurn.confidence)}`}</Text>
        )}
      </View>

      {/* What the microphone is doing and what to say (every build: "Say “Hey DaVoice” before each request" when asleep). */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={p.conversationPhase === 'asleep' ? 'Tap to talk' : 'Microphone'}
        activeOpacity={0.8}
        disabled={!conversationTapEnabled(p.conversationPhase)}
        onPress={p.onTapToTalk}
        style={[styles.inputRow, styles.voiceHint, p.conversationPhase === 'asleep' && styles.asleep]}>
        <MicIcon dim={p.conversationPhase === 'asleep'} />
        <Text style={styles.voiceHintText} numberOfLines={1}>{conversationHint(p.conversationPhase, p.wakePhrase, p.conversation.wakeWord)}</Text>
      </TouchableOpacity>
      {p.onSendText && (
        <View style={styles.devArea}>
          <View style={styles.chipRow}>
            {chips.map((c) => (
              <TouchableOpacity key={c} accessibilityRole="button" activeOpacity={0.8} disabled={p.working} onPress={() => send(c)} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inputRow}>
            <MicButton phase={p.conversationPhase} onPress={p.onTapToTalk} />
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
      )}

      {settingsOpen && (
        <Pressable accessibilityLabel="Close settings" style={styles.sheetBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable style={[styles.sheet, { top: sb + 112, maxHeight: Math.max(240, windowHeight - sb - 136) }]} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator>
            <Text style={styles.sheetTitle}>CONVERSATION</Text>
            <ConversationSettingsPanel
              value={draftConversation}
              onChange={setDraftConversation}
              wakePhrase={p.wakePhrase}
              theme={{ text: C.text, text2: C.text2, accent: C.mint, selectedBg: '#1C4636', control: C.carbon, controlBorder: C.controlBorder, fontMedium: F.medium, fontBold: F.bold }}
            />
            <View style={styles.sheetDivider} />
            <Text style={styles.sheetTitle}>MODEL</Text>
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
            <ConfidenceControls value={draftConfidence} onChange={setDraftConfidence} disabled={p.working} />
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
            </ScrollView>
            <View style={styles.sheetButtons}>
              <SecondaryButton label="Cancel" onPress={() => setSettingsOpen(false)} style={{ flex: 1 }} />
              <PrimaryButton label="Save" disabled={!conversationDirty && !confidenceDirty} onPress={saveSettings} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

function MicIcon({ dim }: { dim?: boolean }) {
  const color = dim ? C.text2 : C.mint;
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={2.2} fill="none" />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function MicButton({ phase, onPress }: { phase: ConversationPhase; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={phase === 'asleep' ? 'Tap to talk' : phase === 'busy' ? 'Stop the agent and talk' : 'Microphone'}
      onPress={onPress}
      hitSlop={8}>
      <MicIcon dim={phase === 'asleep'} />
    </TouchableOpacity>
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
  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, borderWidth: 1, borderColor: '#2A3632', backgroundColor: C.carbon },
  segmentItem: { height: 38, paddingHorizontal: 11, borderRadius: 9, justifyContent: 'center' },
  segmentOn: { backgroundColor: C.emerald },
  segmentText: { fontFamily: F.semibold, fontSize: 13, color: C.tag },
  segmentTextOn: { color: C.onPrimary },
  bannerRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginHorizontal: 12, height: 44 },
  banner: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  bannerOn: { borderColor: C.mint, backgroundColor: 'rgba(16, 185, 129, 0.12)', boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)' },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text },
  bannerMeta: { fontFamily: F.regular, fontSize: 12, color: C.text2, maxWidth: '40%' },
  iconButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#2A3632', backgroundColor: C.carbon, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, minHeight: 0, marginTop: 4 },
  stats: { position: 'absolute', left: 10, right: 10, bottom: 8, flexDirection: 'row', gap: 6 },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2B27',
    backgroundColor: 'rgba(8, 13, 11, 0.78)',
    gap: 1,
  },
  statLabel: { fontFamily: F.bold, fontSize: 9, letterSpacing: 1.1, color: C.text2 },
  statValue: { fontFamily: F.bold, fontSize: 15, color: C.text, fontVariant: ['tabular-nums'] },
  lastCard: {
    marginHorizontal: 12,
    marginTop: 6,
    minHeight: 72,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    // The main message of the screen: a lighter, lifted card.
    borderWidth: 1.5,
    backgroundColor: MESSAGE_CARD,
    boxShadow: LIFT,
    gap: 3,
  },
  heardText: { fontFamily: F.medium, fontSize: 13, color: C.text2 },
  lastTitle: { fontFamily: F.extrabold, fontSize: 17, color: '#FFFFFF' },
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
  sheetButtons: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  sheetDivider: { height: 1, backgroundColor: C.titanium, marginVertical: 4 },
  asleep: { borderColor: C.titanium, boxShadow: 'none' },
  turnInfo: { fontFamily: F.medium, fontSize: 12, color: C.warning2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { fontFamily: F.semibold, fontSize: 14, color: C.text },
  settingValue: { fontFamily: F.regular, fontSize: 12, color: C.text2 },
  settingAction: { height: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.5)', justifyContent: 'center' },
  settingActionText: { fontFamily: F.semibold, fontSize: 14, color: C.mint },
});
