// The conversation settings panel: each control changes its own setting, and each mode shows its own timeouts.
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import ConversationSettingsPanel from '../src/conversation/ConversationSettingsPanel';
import { DEFAULT_CONVERSATION_SETTINGS, type ConversationSettings } from '../src/conversation/settings';

function render(value: ConversationSettings) {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<ConversationSettingsPanel value={value} onChange={onChange} wakePhrase="Hey Coach" />);
  });
  const press = (label: string) => {
    const node = tree.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
    act(() => node.props.onPress());
  };
  const labels = () => tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
  return { onChange, press, labels, tree };
}

describe('ConversationSettingsPanel', () => {
  it('just talk: the free mode timeouts, no wake-word rows', () => {
    const { labels } = render(DEFAULT_CONVERSATION_SETTINGS);
    const l = labels();
    expect(l).toContain('Stop listening after: Never');
    expect(l).toContain('End of speech: 2 s');
    expect(l.some((x) => x.startsWith('Pre-fetch'))).toBe(false);
    expect(l.some((x) => x.startsWith('Follow-up'))).toBe(false);
  });

  it('wake word: its own timeouts, pre-fetch and the stop word switch', () => {
    const { labels } = render({ ...DEFAULT_CONVERSATION_SETTINGS, wakeWord: true });
    const l = labels();
    expect(l).toContain('Pre-fetch: 2 s');
    expect(l).toContain('Follow-up without the wake word: Off');
    expect(l).toContain('Listen after the wake word: 8 s');
    expect(l).toContain('Wake word stops the agent');
    expect(l.some((x) => x.startsWith('Stop listening after'))).toBe(false);
  });

  it('interrupting hides the stop word switch (speech stops the agent)', () => {
    const { labels } = render({ ...DEFAULT_CONVERSATION_SETTINGS, wakeWord: true, interrupt: true });
    expect(labels()).not.toContain('Wake word stops the agent');
  });

  it('every tap changes only its own setting', () => {
    const base = DEFAULT_CONVERSATION_SETTINGS;
    const a = render(base);
    a.press('Turns: Interrupt');
    expect(a.onChange).toHaveBeenLastCalledWith({ ...base, interrupt: true });
    a.press('Start each request with: Wake word');
    expect(a.onChange).toHaveBeenLastCalledWith({ ...base, wakeWord: true });
    a.press('Stop listening after: 1 min');
    expect(a.onChange).toHaveBeenLastCalledWith({ ...base, freeMode: { ...base.freeMode, idleMs: 60000 } });
    a.press('End of speech: 1.5 s');
    expect(a.onChange).toHaveBeenLastCalledWith({ ...base, freeMode: { ...base.freeMode, endOfSpeechMs: 1500 } });

    const wake = { ...base, wakeWord: true };
    const b = render(wake);
    b.press('Pre-fetch: Off');
    expect(b.onChange).toHaveBeenLastCalledWith({ ...wake, wakeWordMode: { ...wake.wakeWordMode, preFetchMs: 0 } });
    b.press('Follow-up without the wake word: 15 s');
    expect(b.onChange).toHaveBeenLastCalledWith({ ...wake, wakeWordMode: { ...wake.wakeWordMode, followUpMs: 15000 } });
    b.press('End of speech: 3 s');
    expect(b.onChange).toHaveBeenLastCalledWith({ ...wake, wakeWordMode: { ...wake.wakeWordMode, endOfSpeechMs: 3000 } });
    const sw = b.tree.root.find((n) => n.props.accessibilityLabel === 'Wake word stops the agent' && typeof n.props.onValueChange === 'function');
    act(() => sw.props.onValueChange(false));
    expect(b.onChange).toHaveBeenLastCalledWith({ ...wake, wakeWordMode: { ...wake.wakeWordMode, stopWord: false } });
  });
});
