// The car screen opens its settings sheet (gear) with the conversation section, and the microphone line follows the
// conversation (asleep: tap to talk).
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import CarAgentScreen from '../src/redesign/CarAgentScreen';
import { DEFAULT_CONVERSATION_SETTINGS } from '../src/conversation/settings';
import { DEFAULT_CONFIDENCE } from '../src/local_llm/confidence';

function screen(phase: 'off' | 'listening' | 'busy' | 'asleep', onTapToTalk = jest.fn()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <CarAgentScreen
        language="en" voice="Rich" wakePhrase="Hey Coach" heard="" reply="" working={false} ignored={false} modelName="m"
        localConfidence={DEFAULT_CONFIDENCE} onBack={jest.fn()} onResetChat={jest.fn()} onChangeModel={jest.fn()}
        onChangeConfidence={jest.fn()} conversation={DEFAULT_CONVERSATION_SETTINGS} onChangeConversation={jest.fn()}
        conversationPhase={phase} onTapToTalk={onTapToTalk}
      />,
    );
  });
  return tree;
}
const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

describe('car screen conversation settings', () => {
  it('the gear opens the sheet with CONVERSATION and MODEL', () => {
    const tree = screen('listening');
    const gear = tree.root.find((n) => n.props.accessibilityLabel === 'Settings: conversation, model and local confidence' && n.props.onPress);
    act(() => gear.props.onPress());
    expect(texts(tree)).toEqual(expect.arrayContaining(['CONVERSATION', 'MODEL', 'Take turns', 'Just talk']));
  });

  it('asleep: the microphone line says how to wake it and a tap wakes it', () => {
    const tap = jest.fn();
    const tree = screen('asleep', tap);
    expect(texts(tree)).toContain('Say “Hey Coach” or tap to talk');
    const mic = tree.root.find((n) => n.props.accessibilityLabel === 'Tap to talk' && n.props.onPress);
    act(() => mic.props.onPress());
    expect(tap).toHaveBeenCalled();
  });

  it('listening: no tap needed', () => {
    expect(texts(screen('listening'))).toContain('Listening… just talk');
  });

  it('wake word before each request: asleep says so, also in debug builds (with the test text box)', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <CarAgentScreen
          language="en" voice="Rich" wakePhrase="Hey Coach" heard="" reply="" working={false} ignored={false} modelName="m"
          localConfidence={DEFAULT_CONFIDENCE} onBack={jest.fn()} onResetChat={jest.fn()} onChangeModel={jest.fn()}
          onChangeConfidence={jest.fn()} conversation={{ ...DEFAULT_CONVERSATION_SETTINGS, wakeWord: true }} onChangeConversation={jest.fn()}
          conversationPhase="asleep" onTapToTalk={jest.fn()} onSendText={jest.fn()}
        />,
      );
    });
    expect(texts(tree)).toContain('Say “Hey Coach” before each request');
  });
});
