// Conversation modes (src/conversation): the settings, the interrupt (echo) rule and the controller's scripted flows.
// The fixtures are shared with the Flutter apps (test/fixtures/conversation_*.json, kept identical).
import flows from './fixtures/conversation_flow.json';
import bargeInCases from './fixtures/conversation_barge_in.json';
import wakePhraseCases from './fixtures/conversation_wake_phrase.json';
import { dropWakePhrase } from '../src/conversation/wakePhrase';
import { resolveBargeIn } from '../src/conversation/bargeIn';
import { ConversationController, isQuestion } from '../src/conversation/controller';
import { conversationHint, conversationTapEnabled } from '../src/conversation/hint';
import {
  DEFAULT_CONVERSATION_SETTINGS,
  END_OF_SPEECH_CHOICES,
  FOLLOW_UP_CHOICES,
  IDLE_CHOICES,
  LISTEN_CHOICES,
  PRE_FETCH_CHOICES,
  describeConversation,
  endOfSpeechMs,
  normalizeConversationSettings,
  routingConfigForConversation,
  type ConversationSettings,
} from '../src/conversation/settings';

function merge(base: any, patch: any): any {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] ?? {}, v) : v;
  }
  return out;
}

class FakeClock {
  now = 0;
  private seq = 0;
  private timers = new Map<number, { due: number; fn: () => void }>();
  set = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { due: this.now + ms, fn });
    return id;
  };
  clear = (id: unknown) => {
    this.timers.delete(id as number);
  };
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.now = next[1].due;
      next[1].fn();
    }
    this.now = end;
  }
}

describe('conversation settings', () => {
  it('defaults keep the behaviour from before the settings: just talk, take turns, 2 s, never sleeps', () => {
    expect(DEFAULT_CONVERSATION_SETTINGS).toEqual({
      interrupt: false,
      wakeWord: false,
      wakeWordMode: { endOfSpeechMs: 2000, listenMs: 8000, followUpMs: 8000, preFetchMs: 2000, stopWord: false },
      freeMode: { endOfSpeechMs: 2000, idleMs: 0 },
    });
    expect(describeConversation(DEFAULT_CONVERSATION_SETTINGS)).toBe('Just talk · take turns');
  });

  it('normalize fills, clamps and drops what it does not know', () => {
    expect(normalizeConversationSettings(undefined)).toEqual(DEFAULT_CONVERSATION_SETTINGS);
    expect(normalizeConversationSettings('nonsense')).toEqual(DEFAULT_CONVERSATION_SETTINGS);
    const s = normalizeConversationSettings({
      interrupt: true,
      wakeWord: 'yes',
      extra: 1,
      wakeWordMode: { endOfSpeechMs: 50, followUpMs: -5, preFetchMs: 99999, listenMs: 7000.4, stopWord: false },
      freeMode: { idleMs: 'x' },
    });
    expect(s).toEqual({
      interrupt: true,
      wakeWord: false,
      wakeWordMode: { endOfSpeechMs: 500, listenMs: 7000, followUpMs: 0, preFetchMs: 3000, stopWord: false },
      freeMode: { endOfSpeechMs: 2000, idleMs: 0 },
    });
    expect(normalizeConversationSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('every choice survives normalize and the defaults are among the choices', () => {
    const lists: [number[], number][] = [
      [END_OF_SPEECH_CHOICES.map((c) => c.value), DEFAULT_CONVERSATION_SETTINGS.freeMode.endOfSpeechMs],
      [LISTEN_CHOICES.map((c) => c.value), DEFAULT_CONVERSATION_SETTINGS.wakeWordMode.listenMs],
      [FOLLOW_UP_CHOICES.map((c) => c.value), DEFAULT_CONVERSATION_SETTINGS.wakeWordMode.followUpMs],
      [PRE_FETCH_CHOICES.map((c) => c.value), DEFAULT_CONVERSATION_SETTINGS.wakeWordMode.preFetchMs],
      [IDLE_CHOICES.map((c) => c.value), DEFAULT_CONVERSATION_SETTINGS.freeMode.idleMs],
    ];
    for (const [values, def] of lists) expect(values).toContain(def);
    for (const v of END_OF_SPEECH_CHOICES) {
      expect(normalizeConversationSettings({ freeMode: { endOfSpeechMs: v.value } }).freeMode.endOfSpeechMs).toBe(v.value);
    }
    for (const v of FOLLOW_UP_CHOICES) {
      expect(normalizeConversationSettings({ wakeWordMode: { followUpMs: v.value } }).wakeWordMode.followUpMs).toBe(v.value);
    }
    for (const v of PRE_FETCH_CHOICES) {
      expect(normalizeConversationSettings({ wakeWordMode: { preFetchMs: v.value } }).wakeWordMode.preFetchMs).toBe(v.value);
    }
    for (const v of LISTEN_CHOICES) {
      expect(normalizeConversationSettings({ wakeWordMode: { listenMs: v.value } }).wakeWordMode.listenMs).toBe(v.value);
    }
    for (const v of IDLE_CHOICES) {
      expect(normalizeConversationSettings({ freeMode: { idleMs: v.value } }).freeMode.idleMs).toBe(v.value);
    }
  });

  it('the end of speech follows the selected mode', () => {
    const s = normalizeConversationSettings({ wakeWordMode: { endOfSpeechMs: 1500 }, freeMode: { endOfSpeechMs: 3000 } });
    expect(endOfSpeechMs(s)).toBe(3000);
    expect(endOfSpeechMs({ ...s, wakeWord: true })).toBe(1500);
  });

  it('interrupting turns echo cancellation on; taking turns leaves the routing as it is', () => {
    const base = { default: { mode: 'default' }, WakewordAEC: { regular: false, duringTTS: false } };
    expect(routingConfigForConversation(base, DEFAULT_CONVERSATION_SETTINGS)).toBe(base);
    const on = routingConfigForConversation(base, { ...DEFAULT_CONVERSATION_SETTINGS, interrupt: true });
    expect(on).toEqual({ default: { mode: 'default' }, AEC: { mode: 'always' }, WakewordAEC: { regular: true, duringTTS: true } });
    expect(base.WakewordAEC).toEqual({ regular: false, duringTTS: false });
  });
});

describe('interrupt rule (conversation_barge_in.json)', () => {
  it.each(bargeInCases as { heard: string; agent: string; decision: string }[])('"$heard" over "$agent" -> $decision', (c) => {
    expect(resolveBargeIn(c.heard, c.agent)).toBe(c.decision);
  });
});

type Step = { do: string; rearm?: boolean; ms?: number; text?: string; agent?: string; reply?: string; returns?: boolean; settings?: any; log?: string[]; phase?: string };

describe('conversation controller (conversation_flow.json)', () => {
  it.each(flows as { name: string; settings: any; steps: Step[] }[])('$name', async (flow) => {
    const clock = new FakeClock();
    const log: string[] = [];
    let settings: ConversationSettings = normalizeConversationSettings(merge(DEFAULT_CONVERSATION_SETTINGS, flow.settings));
    const c = new ConversationController(
      {
        openMic: (ms) => void log.push(`openMic:${ms}`),
        closeMic: () => void log.push('closeMic'),
        armWakeWord: () => void log.push('armWakeWord'),
        disarmWakeWord: () => void log.push('disarmWakeWord'),
        stopReply: () => void log.push('stopReply'),
        setTimer: clock.set,
        clearTimer: clock.clear,
      },
      settings,
    );
    for (const [i, step] of flow.steps.entries()) {
      const at = `step ${i} (${step.do})`;
      const before = log.length;
      let returned: boolean | undefined;
      switch (step.do) {
        case 'enter': c.enter(); break;
        case 'leave': c.leave(step.rearm ?? true); break;
        case 'turnStarted': c.turnStarted(); break;
        case 'replySpeaking': c.replySpeaking(); break;
        case 'replyFinished': c.replyFinished(step.reply ?? ''); break;
        case 'userSpeech': c.userSpeech(); break;
        case 'tapToTalk': c.tapToTalk(); break;
        case 'wakeWord': returned = c.wakeWord(); break;
        case 'heard': returned = c.heardWhileBusy(step.text ?? '', step.agent ?? ''); break;
        case 'wait': clock.advance(step.ms ?? 0); break;
        case 'update':
          settings = normalizeConversationSettings(merge(settings, step.settings));
          c.update(settings);
          break;
        default: throw new Error(`unknown step ${step.do}`);
      }
      await c.idle();
      if (step.returns !== undefined) expect({ at, returned }).toEqual({ at, returned: step.returns });
      if (step.log) expect({ at, log: log.slice(before) }).toEqual({ at, log: step.log });
      if (step.phase) expect({ at, phase: c.phase }).toEqual({ at, phase: step.phase });
    }
  });

  it('runs the commands in order even when one is slow, and a failing command does not stop the next', async () => {
    const log: string[] = [];
    const slow = (name: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => { log.push(name); r(); }, ms));
    const c = new ConversationController(
      {
        openMic: slow('openMic', 30),
        closeMic: () => { throw new Error('boom'); },
        armWakeWord: slow('armWakeWord', 1),
        disarmWakeWord: slow('disarmWakeWord', 1),
        stopReply: slow('stopReply', 1),
      },
      normalizeConversationSettings({ wakeWord: true, wakeWordMode: { followUpMs: 0, stopWord: true } }),
    );
    c.enter();
    c.turnStarted();
    c.replySpeaking(); // arm (1 ms)
    c.replyFinished(); // close (throws), stays armed
    c.wakeWord(); // disarm, open (30 ms)
    c.userSpeech();
    c.turnStarted();
    c.replySpeaking(); // arm
    await c.idle();
    expect(log).toEqual(['armWakeWord', 'disarmWakeWord', 'openMic', 'armWakeWord']);
  });
});

describe('a reply that asks a question (the wake-word mode answers it without the wake word)', () => {
  it('ends with a question mark, also inside quotes or in Portuguese', () => {
    expect(isQuestion('Should I open the passenger window too?')).toBe(true);
    expect(isQuestion('Quer que eu abra o vidro do carona? ')).toBe(true);
    expect(isQuestion('Did you say “the trunk?”')).toBe(true);
    expect(isQuestion('I opened the driver window.')).toBe(false);
    expect(isQuestion('Why? Because it was cold.')).toBe(false);
    expect(isQuestion('')).toBe(false);
  });
});

describe('microphone line', () => {
  it('says what the conversation is doing and when a tap helps', () => {
    expect(conversationHint('asleep', 'Hey Coach', true)).toBe('Say “Hey Coach” before each request');
    expect(conversationHint('asleep', 'Hey Coach', false)).toBe('Say “Hey Coach” or tap to talk');
    expect(conversationHint('listening', 'Hey Coach', true)).toBe('Listening… say your request');
    expect(conversationHint('listening', 'Hey Coach', false)).toBe('Listening… just talk');
    expect(conversationHint('busy', 'Hey Coach', false)).toBe('Answering… tap to stop');
    expect(conversationHint('off', 'Hey Coach', false)).toBe('“Hey Coach” + your command');
    expect(['off', 'listening', 'busy', 'asleep'].filter((p) => conversationTapEnabled(p as any))).toEqual(['busy', 'asleep']);
  });
});

describe('wake phrase (conversation_wake_phrase.json)', () => {
  it.each(wakePhraseCases as { text: string; phrase: string; out: string }[])('"$text" -> "$out"', (c) => {
    expect(dropWakePhrase(c.text, c.phrase)).toBe(c.out);
  });
});
