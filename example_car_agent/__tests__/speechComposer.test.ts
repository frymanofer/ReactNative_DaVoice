import { beginCarTurn, carTurnActions, composeCarSpeech, noteCarSay, resetSpeechVariant } from '../src/car/speechComposer';

const run = (says: Array<[string, string, boolean?]>, text: string, lang = 'en') => {
  beginCarTurn();
  resetSpeechVariant();
  for (const [tool, say, merge] of says) noteCarSay(tool, say, merge ?? true);
  return composeCarSpeech(text, carTurnActions(), lang);
};

describe('speech composer: several car actions said as one sentence', () => {
  it('closes the doors and locks the car (the phone session of 2026-11-19)', () => {
    expect(run([['close_doors', 'I closed all the doors.'], ['lock_car', 'I locked the car.']], 'I closed all the doors. I locked the car.'))
      .toBe('All set. I closed all the doors and locked the car. Everything is secure.');
  });
  it('the offer: unlock then open', () => {
    expect(run([['unlock_car', 'I unlocked the car.'], ['open_door', 'I opened all the doors.']], 'I unlocked the car. I opened all the doors.'))
      .toBe('All set. I unlocked the car and opened all the doors.');
  });
  it('pt-BR, three actions', () => {
    expect(run([['set_window', 'Fechei todas as janelas.'], ['close_doors', 'Fechei todas as portas.'], ['lock_car', 'Tranquei o carro.']],
      'Fechei todas as janelas. Fechei todas as portas. Tranquei o carro.', 'pt-BR'))
      .toBe('Pronto! Fechei todas as janelas, fechei todas as portas e tranquei o carro. Está tudo seguro.');
  });
  it('one action stays as it was', () => {
    expect(run([['lock_car', 'I locked the car.']], 'I locked the car.')).toBe('I locked the car.');
  });
  it('a refusal or an undo is never merged; other text passes through', () => {
    expect(run([['lock_car', 'I locked the car.'], ['open_door', 'The car is locked. Should I unlock it?', false]],
      'I locked the car. The car is locked. Should I unlock it?')).toBe('I locked the car. The car is locked. Should I unlock it?');
    expect(run([['set_volume', 'Undone. I set the volume to 12.', false], ['lock_car', 'I locked the car.']], 'Undone. I set the volume to 12. I locked the car.'))
      .toBe('Undone. I set the volume to 12. I locked the car.');
  });
  it('a sentence that is not "I did X" keeps the run as it was', () => {
    expect(run([['get_vehicle_status', 'The battery is at 76%.'], ['lock_car', 'I locked the car.']], 'The battery is at 76%. I locked the car.'))
      .toBe('The battery is at 76%. I locked the car.');
  });
  it('only sentences of actions that ran are merged (nothing invented)', () => {
    expect(run([['lock_car', 'I locked the car.']], 'I closed all the doors. I locked the car.')).toBe('I closed all the doors. I locked the car.');
  });
});
