// Conversation controller: who owns the microphone between requests, for the settings in ./settings.ts.
//
// Phases:
//   off        not in the conversation screen (the app's own start-up / wake-word screen owns the audio)
//   listening  the speech recognizer is open for the user's request
//   busy       a request is being answered (thinking, then the agent speaking)
//   asleep     the recognizer is closed; the wake word (or a tap) opens it again
//
// The app calls the events (enter, turnStarted, replySpeaking, replyFinished, userSpeech, heardWhileBusy,
// wakeWord, tapToTalk, leave) and the controller answers with the audio commands in ConversationDeps. Commands run
// one after another, in order, so a pause can't overtake the unpause before it. No React and no native code here:
// __tests__/conversation.test.ts runs it with a fake clock, and the Flutter apps run the same scripted flows
// (fixtures/conversation_flow.json) through lib/conversation/conversation_controller.dart.

import { resolveBargeIn } from './bargeIn';
import type { ConversationSettings } from './settings';

export type ConversationPhase = 'off' | 'listening' | 'busy' | 'asleep';

/** The reply asked something ("Should I open the driver window?"): in the wake-word mode only then does the user get a follow-up
 * turn without the wake word. */
export function isQuestion(reply: string): boolean {
  return /[?？]["'”’)\]]*\s*$/.test(reply.trim());
}

export type ConversationDeps = {
  /** Open the speech recognizer (a fresh transcript). preFetchMs: keep that much audio from before it opened. */
  openMic: (preFetchMs: number, why: string) => Promise<void> | void;
  /** Close the speech recognizer. */
  closeMic: (why: string) => Promise<void> | void;
  /** Wake word detection on. */
  armWakeWord: (why: string) => Promise<void> | void;
  /** Wake word detection off (the microphone stays with the app). */
  disarmWakeWord: (why: string) => Promise<void> | void;
  /** Stop the agent's reply now: its voice, the sentences still queued, the request. */
  stopReply: (why: string) => Promise<void> | void;
  onPhase?: (phase: ConversationPhase) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: (message: string) => void;
};

export class ConversationController {
  private settings: ConversationSettings;
  private current: ConversationPhase = 'off';
  private speaking = false;
  private duplex = false;
  private wakeArmed = false;
  private timer: unknown = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ConversationDeps, settings: ConversationSettings) {
    this.settings = settings;
  }

  get phase(): ConversationPhase {
    return this.current;
  }

  /** In the conversation screen. */
  get active(): boolean {
    return this.current !== 'off';
  }

  /** The agent's voice is playing (replySpeaking .. replyFinished). */
  get agentSpeaking(): boolean {
    return this.speaking;
  }

  /** Interrupt mode: the recognizer is open under the agent's voice. */
  get duplexOpen(): boolean {
    return this.duplex;
  }

  get config(): ConversationSettings {
    return this.settings;
  }

  /** Resolves when every command issued so far has run. */
  idle(): Promise<void> {
    return this.chain;
  }

  /**
   * New settings (the Save button). An open listening window restarts with the new timeout. Asleep in the wake-word mode and
   * switched to "just talk": recognition opens (otherwise nothing would ever open it). Listening and switched to the wake word:
   * asleep at once.
   */
  update(settings: ConversationSettings): void {
    const before = this.settings;
    this.settings = settings;
    if (this.current === 'asleep' && before.wakeWord && !settings.wakeWord) {
      this.disarm('just talk');
      this.run('openMic', () => this.deps.openMic(0, 'just talk'));
      this.setPhase('listening');
      this.startWindow('idle');
    } else if (this.current === 'listening' && !before.wakeWord && settings.wakeWord) {
      this.sleep('wake word before each request'); // from now on every request starts with the wake word
    } else if (this.current === 'listening') {
      this.startWindow(this.settings.wakeWord ? 'listen' : 'idle');
    }
  }

  /**
   * The conversation screen opened. Just talk: the app has opened the recognizer (and paused the wake word). Wake word before
   * each request: asleep until the wake word (the app left the recognizer paused; the wake word that opened the screen is not
   * a request).
   */
  enter(): void {
    this.clearWindow();
    this.speaking = false;
    this.duplex = false;
    this.wakeArmed = false;
    if (this.settings.wakeWord) {
      this.sleep('wake word before each request');
      return;
    }
    this.setPhase('listening');
    this.startWindow('idle');
  }

  /**
   * Back to the start screen; the app closes the recognizer. rearmWakeWord: the start screen listens for the wake word
   * (the car agents); false: the wake word goes back to paused, as in the conversation (a mode menu: the full examples).
   */
  leave(rearmWakeWord = true): void {
    this.clearWindow();
    this.speaking = false;
    this.duplex = false;
    this.setPhase('off');
    if (rearmWakeWord) this.arm('leave');
    else this.disarm('leave');
  }

  /** A request was sent (the app closed the recognizer for it). */
  turnStarted(): void {
    if (this.current === 'off') return; // a request outside the conversation screen (a test hook): not ours
    this.clearWindow();
    this.speaking = false;
    this.duplex = false;
    this.setPhase('busy');
  }

  /** The reply's voice starts. Interrupt mode opens the recognizer under it; the wake-word mode can arm the stop word. */
  replySpeaking(): void {
    if (this.current !== 'busy' || this.speaking) return;
    this.speaking = true;
    if (this.settings.interrupt) {
      this.duplex = true;
      this.run('openMic', () => this.deps.openMic(0, 'interrupt: listen under the reply'));
    } else if (this.settings.wakeWord && this.settings.wakeWordMode.stopWord) {
      this.arm('stop word during the reply');
    }
  }

  /**
   * The request ended (its reply was spoken, or it ended without one): the next request, or sleep. reply: what the agent said.
   * Wake-word mode: the user answers without the wake word only when the reply was a question (and the follow-up
   * window is on); then recognition pauses and unpauses for a fresh turn. Otherwise back to the wake word.
   */
  replyFinished(reply = ''): void {
    if (this.current !== 'busy') return;
    const wasDuplex = this.duplex;
    this.speaking = false;
    this.duplex = false;
    if (this.settings.wakeWord) {
      if (this.settings.wakeWordMode.followUpMs === 0 || !isQuestion(reply)) {
        this.sleep(isQuestion(reply) ? 'wake word every time' : 'the reply was not a question'); // a stop word armed for the reply stays armed
        return;
      }
      this.disarm('a question: the user answers');
      this.run('closeMic', () => this.deps.closeMic('pause before the answer'));
      this.run('openMic', () => this.deps.openMic(0, 'answer to the question'));
      this.setPhase('listening');
      this.startWindow('followUp');
      return;
    }
    this.disarm('reply finished');
    // the recognizer open under the reply heard the reply: a fresh session for the user's turn
    if (wasDuplex) this.run('closeMic', () => this.deps.closeMic('fresh session after the reply'));
    this.run('openMic', () => this.deps.openMic(0, 'after the reply'));
    this.setPhase('listening');
    this.startWindow('idle');
  }

  /** The user said something while listening: the window timeout no longer applies. */
  userSpeech(): void {
    if (this.current === 'listening') this.clearWindow();
  }

  /**
   * Speech heard while busy. True: the user interrupted the reply (interrupt mode, while the agent speaks, words the
   * agent isn't saying): the reply was stopped and the words start the user's next request. False: drop them.
   */
  heardWhileBusy(heard: string, agentText: string): boolean {
    if (this.current !== 'busy' || !this.duplex || !this.speaking) return false;
    if (resolveBargeIn(heard, agentText) !== 'interrupt') return false;
    this.speaking = false;
    this.duplex = false;
    this.deps.log?.(`[Conversation] the user interrupted: "${heard}"`);
    this.run('stopReply', () => this.deps.stopReply('the user interrupted'));
    this.setPhase('listening');
    this.startWindow(this.settings.wakeWord ? 'listen' : 'idle');
    return true;
  }

  /** The wake word was heard. False when the conversation isn't open (the app's own start-up path handles it). */
  wakeWord(): boolean {
    if (this.current === 'off') return false;
    if (this.current === 'busy') {
      // a stop word while the agent talks; while it is thinking the wake word is ignored
      if (this.speaking && this.wakeArmed) this.stopAndListen('stop word');
      return true;
    }
    if (this.current === 'asleep') {
      this.disarm('wake word');
      this.run('openMic', () => this.deps.openMic(this.settings.wakeWord ? this.settings.wakeWordMode.preFetchMs : 0, 'wake word'));
      this.setPhase('listening');
      this.startWindow(this.settings.wakeWord ? 'listen' : 'idle');
    }
    return true;
  }

  /** The microphone button: wakes the conversation, or stops the agent and listens. */
  tapToTalk(): void {
    if (this.current === 'asleep') {
      this.disarm('tap');
      this.run('openMic', () => this.deps.openMic(0, 'tap'));
      this.setPhase('listening');
      this.startWindow(this.settings.wakeWord ? 'listen' : 'idle');
    } else if (this.current === 'busy' && this.speaking) {
      this.stopAndListen('tap');
    }
  }

  private stopAndListen(why: string): void {
    const wasDuplex = this.duplex;
    this.speaking = false;
    this.duplex = false;
    this.run('stopReply', () => this.deps.stopReply(why));
    this.disarm(why);
    if (wasDuplex) this.run('closeMic', () => this.deps.closeMic('fresh session'));
    // no pre-fetch: the audio before this moment is the agent's voice and the wake word itself
    this.run('openMic', () => this.deps.openMic(0, `after the ${why}`));
    this.setPhase('listening');
    this.startWindow(this.settings.wakeWord ? 'listen' : 'idle');
  }

  private sleep(why: string): void {
    this.clearWindow();
    this.speaking = false;
    this.duplex = false;
    this.run('closeMic', () => this.deps.closeMic(why));
    this.arm(why);
    this.setPhase('asleep');
  }

  private startWindow(kind: 'listen' | 'followUp' | 'idle'): void {
    this.clearWindow();
    const s = this.settings;
    const ms = kind === 'listen' ? s.wakeWordMode.listenMs : kind === 'followUp' ? s.wakeWordMode.followUpMs : s.freeMode.idleMs;
    if (ms <= 0) return;
    const set = this.deps.setTimer ?? ((fn: () => void, t: number) => setTimeout(fn, t));
    this.timer = set(() => {
      this.timer = null;
      if (this.current === 'listening') this.sleep(kind === 'idle' ? 'nothing said' : 'no request');
    }, ms);
  }

  private clearWindow(): void {
    if (this.timer == null) return;
    const clear = this.deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    clear(this.timer);
    this.timer = null;
  }

  private arm(why: string): void {
    if (this.wakeArmed) return;
    this.wakeArmed = true;
    this.run('armWakeWord', () => this.deps.armWakeWord(why));
  }

  private disarm(why: string): void {
    if (!this.wakeArmed) return;
    this.wakeArmed = false;
    this.run('disarmWakeWord', () => this.deps.disarmWakeWord(why));
  }

  private setPhase(phase: ConversationPhase): void {
    if (phase === this.current) return;
    this.current = phase;
    this.deps.log?.(`[Conversation] ${phase}`);
    this.deps.onPhase?.(phase);
  }

  private run(name: string, command: () => Promise<void> | void): void {
    this.chain = this.chain
      .then(() => command())
      .catch((error) => this.deps.log?.(`[Conversation] ${name} failed (ignored): ${String(error)}`));
  }
}
