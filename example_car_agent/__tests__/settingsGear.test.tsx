// The settings gear over the setup screens (language, voice, speaker, wake word): it opens the conversation settings, and a change
// reaches the app.
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WithSettingsGear } from '../src/redesign/SettingsGear';
import { DEFAULT_CONVERSATION_SETTINGS } from '../src/conversation/settings';

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

it('the gear shows over a setup screen and opens the conversation settings; a choice is passed on', () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <WithSettingsGear value={DEFAULT_CONVERSATION_SETTINGS} onChange={onChange} wakePhrase="Hey Coach">
        <Text>Say “Hey Coach”</Text>
      </WithSettingsGear>,
    );
  });
  expect(texts(tree)).toContain('Say “Hey Coach”');
  expect(texts(tree)).not.toContain('CONVERSATION');
  const gear = tree.root.find((n) => n.props.accessibilityLabel === 'Settings: conversation mode' && n.props.onPress);
  act(() => gear.props.onPress());
  expect(texts(tree)).toEqual(expect.arrayContaining(['CONVERSATION', 'Take turns', 'Interrupt', 'Wake word', 'Just talk']));
  const holders = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === 'Wake word').length > 0);
  const wake = holders[holders.length - 1]; // the innermost: the option itself
  act(() => wake.props.onPress());
  expect(onChange).not.toHaveBeenCalled(); // a draft until Save
  const save = tree.root.find((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && n.findAll((c) => c.props.children === 'Save').length > 0);
  act(() => save.props.onPress());
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ wakeWord: true }));
  expect(texts(tree)).not.toContain('CONVERSATION'); // closed
});

it('Cancel drops the draft', () => {
  const onChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <WithSettingsGear value={DEFAULT_CONVERSATION_SETTINGS} onChange={onChange} wakePhrase="Hey Coach">
        <Text>screen</Text>
      </WithSettingsGear>,
    );
  });
  act(() => tree.root.find((n) => n.props.accessibilityLabel === 'Settings: conversation mode' && n.props.onPress).props.onPress());
  const holders = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === 'Wake word').length > 0);
  act(() => holders[holders.length - 1].props.onPress());
  const cancel = tree.root.find((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && n.findAll((c) => c.props.children === 'Cancel').length > 0);
  act(() => cancel.props.onPress());
  expect(onChange).not.toHaveBeenCalled();
});
