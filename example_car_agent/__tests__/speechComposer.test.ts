import { beginCarTurn, carAck, carTurnActions, composeCarSpeech, noteCarSay, pendingOfferCalls, resetSpeechVariant, spokenSay } from '../src/car/speechComposer';
import spokenCases from './fixtures/spoken_say.json';

const run = (says: Array<[string, string, boolean?, Record<string, unknown>?]>, text: string, lang = 'en', acked = false) => {
  beginCarTurn();
  resetSpeechVariant();
  for (const [tool, say, merge, args] of says) noteCarSay(tool, say, merge ?? true, args ? { args } : {});
  return composeCarSpeech(text, carTurnActions(), lang, { acked });
};

describe('speech composer: several car actions said as one sentence', () => {
  it('closes the doors and locks the car (the phone session of 2026-11-19)', () => {
    expect(run([['close_doors', 'I closed all the doors.'], ['lock_car', 'I locked the car.']], 'I closed all the doors. I locked the car.'))
      .toBe('I closed all the doors and locked the car. Everything is secure.');
  });
  it('the offer: unlock then open', () => {
    expect(run([['unlock_car', 'I unlocked the car.'], ['open_door', 'I opened all the doors.']], 'I unlocked the car. I opened all the doors.'))
      .toBe('I unlocked the car and opened all the doors. Come on in!');
  });
  it('pt-BR, three actions', () => {
    expect(run([['set_window', 'Fechei todas as janelas.'], ['close_doors', 'Fechei todas as portas.'], ['lock_car', 'Tranquei o carro.']],
      'Fechei todas as janelas. Fechei todas as portas. Tranquei o carro.', 'pt-BR'))
      .toBe('Fechei todas as janelas, fechei todas as portas e tranquei o carro. Agora o carro está todo seguro.');
  });
  it('one action: one friendly phrase, the closing line every other time, else a warm opener', () => {
    expect(run([['lock_car', 'I locked the car.']], 'I locked the car.')).toBe("I locked the car. You're good to go.");
  });
  it('a refusal or an undo is never merged; other text passes through', () => {
    expect(run([['lock_car', 'I locked the car.'], ['open_door', 'The car is locked. Should I unlock it?', false]],
      'I locked the car. The car is locked. Should I unlock it?')).toBe('I locked the car. The car is locked. Should I unlock it?');
    expect(run([['set_volume', 'Undone. I set the volume to 12.', false], ['lock_car', 'I locked the car.']], 'Undone. I set the volume to 12. I locked the car.'))
      .toBe('Okay, I put it back. I set the volume to 12. I locked the car.');
  });
  it('an undo is said as putting it back, its sentence smoothed like any other', () => {
    expect(run([['set_temperature', 'Undone. I set the whole cabin to 21°C.', false, { temperature: 21 }]], 'Undone. I set the whole cabin to 21°C.'))
      .toBe('Okay, I put it back. I set the temperature to 21°C.');
    expect(run([['set_window', 'Desfeito. Fechei todos os vidros.', false]], 'Desfeito. Fechei todos os vidros.', 'pt-BR'))
      .toBe('Pronto, voltei tudo como estava antes. Fechei todas as janelas do carro.');
  });
  it('a sentence that is not "I did X" keeps the run as it was', () => {
    expect(run([['get_vehicle_status', 'The battery is at 76%.'], ['lock_car', 'I locked the car.']], 'The battery is at 76%. I locked the car.'))
      .toBe('The battery is at 76%. I locked the car.');
  });
  it('only sentences of actions that ran are merged (nothing invented)', () => {
    expect(run([['lock_car', 'I locked the car.']], 'I closed all the doors. I locked the car.')).toBe('I closed all the doors. I locked the car.');
  });
});

describe('a friendlier voice (2026-11-21, "more like Otto")', () => {
  it('varies: the next request gets another opener and no closing line', () => {
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('set_window', "I opened the driver's window.", true, { args: { window: 'driver', position: 'open' } });
    expect(composeCarSpeech("I opened the driver's window.", carTurnActions(), 'en')).toBe("I opened the driver's window. Enjoy the fresh air.");
    beginCarTurn();
    noteCarSay('set_window', "I opened the driver's window.", true, { args: { window: 'driver', position: 'open' } });
    expect(composeCarSpeech("I opened the driver's window.", carTurnActions(), 'en')).toBe("You got it! I opened the driver's window.");
  });
  it('pt-BR', () => {
    // short sentences said on their own are said longer (tested pt-BR wording); a merged sentence keeps the short form
    expect(run([['lock_car', 'Tranquei o carro.']], 'Tranquei o carro.', 'pt-BR')).toBe('Tranquei todas as portas do carro. Pode ficar tranquilo, está tudo seguro.');
    expect(run([['play_media', 'Tocando Anitta.', true, { query: 'Anitta' }]], 'Tocando Anitta.', 'pt-BR'))
      .toBe('Agora tocando Anitta para você. Aproveite a música durante a viagem.');
    expect(run([['unlock_car', 'Destranquei o carro.']], 'Destranquei o carro.', 'pt-BR')).toBe('Destranquei todas as portas do carro. Pode entrar, o carro já está aberto.');
    expect(run([['comfort_feeling', 'Deixei mais quente: subi o ar dois graus e liguei o aquecimento do banco no médio.', true, { feeling: 'cold' }]],
      'Deixei mais quente: subi o ar dois graus e liguei o aquecimento do banco no médio.', 'pt-BR'))
      .toBe('Deixei mais quente: subi o ar dois graus e liguei o aquecimento do banco no médio. Já já o carro fica mais quentinho.');
  });
  it('after "Got it." there is no second opener', () => {
    expect(run([['navigate_to', 'Navigating to home: about 24 minutes, 18 km.']], 'Navigating to home: about 24 minutes, 18 km.', 'en', true))
      .toBe("Navigating home: about 24 minutes, 18 km. Let's go!");
  });
  it('closing an opening gets no "enjoy the fresh air"', () => {
    expect(run([['set_window', 'I closed all the windows.', true, { window: 'all', position: 'close' }]], 'I closed all the windows.')).toBe('Sure, you got it. I closed all the windows.');
  });
  it('lookups, "already" and Basic languages stay as they were', () => {
    expect(run([['get_vehicle_status', 'The tank is at 62%, about 310 km.']], 'The tank is at 62%, about 310 km.')).toBe('The tank is at 62%, about 310 km.');
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('lock_car', 'The car is already locked.', true, { kind: 'already' });
    expect(composeCarSpeech('The car is already locked.', carTurnActions(), 'en')).toBe('The car is already locked.');
    expect(run([['lock_car', 'Erledigt.']], 'Erledigt.', 'de')).toBe('Erledigt.');
  });
});

describe('acknowledgement while a request takes a moment', () => {
  it('rotates; tuned languages only', () => {
    resetSpeechVariant();
    expect([carAck('en'), carAck('en'), carAck('pt-BR')]).toEqual(['Got it.', 'On it.', 'Pode deixar, só um instante, por favor.']);
    expect(carAck('de')).toBeNull();
  });
});

// The spoken wording (2026-11-21 reply review): the same cases as the Flutter app (test/fixtures/spoken_say.json, kept identical).
describe('how a tool sentence is said', () => {
  it('every case of the shared fixture', () => {
    const diffs = (spokenCases as [string, string, string, Record<string, unknown>, string][])
      .map(([lang, tool, say, args, want]) => ({ lang, say, want, got: spokenSay({ tool, say, merge: true, args }, lang) }))
      .filter((c) => c.got !== c.want);
    expect(diffs).toEqual([]);
  });
  it('in a full reply: smoother words, the same facts', () => {
    expect(run([['set_temperature', 'I raised the whole cabin to 23°C.', true, { change: 2 }]], 'I raised the whole cabin to 23°C.'))
      .toBe("I turned the temperature up to 23°C. It'll warm up soon.");
    expect(run([['navigate_to', 'Indo para aeroporto: cerca de 24 minutos, 18 km.', true, { destination: 'aeroporto' }]], 'Indo para aeroporto: cerca de 24 minutos, 18 km.', 'pt-BR'))
      .toBe('Indo para o aeroporto: cerca de 24 minutos, 18 km. Vamos lá, tenha uma ótima viagem!');
    expect(run([['set_temperature', "I didn't change it: the temperature must be between 16 and 30.", false]], "I didn't change it: the temperature must be between 16 and 30."))
      .toBe('Sorry, the temperature only goes from 16 to 30.');
  });
  it('an action that ran next to one that was already so: one reply with the opener', () => {
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('lock_car', 'I locked the car.', true, { kind: 'did' });
    noteCarSay('set_window', 'All the windows are already closed.', true, { args: { window: 'all', position: 'close' }, kind: 'already' });
    expect(composeCarSpeech('I locked the car. All the windows are already closed.', carTurnActions(), 'en'))
      .toBe('All set. I locked the car. All the windows are already closed. Everything is secure.');
    beginCarTurn();
    noteCarSay('close_doors', 'All the doors are already closed.', true, { kind: 'already' });
    noteCarSay('lock_car', 'The car is already locked.', true, { kind: 'already' });
    expect(composeCarSpeech('All the doors are already closed. The car is already locked.', carTurnActions(), 'en'))
      .toBe('All the doors are already closed. The car is already locked.');
  });
});

describe('a found place offers to navigate there (same as Flutter)', () => {
  it('the question is said; the offer is remembered for the next request only', () => {
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('find_along_route', 'I found a gas station 2.1 km ahead.', true, { kind: 'answer', offer: ['navigate_to'] });
    expect(composeCarSpeech('I found a gas station 2.1 km ahead.', carTurnActions(), 'en')).toBe('I found a gas station 2.1 km ahead. Want me to take you there?');
    expect(pendingOfferCalls()).toEqual(['navigate_to']);
    beginCarTurn();
    expect(pendingOfferCalls()).toBeNull();
  });
});

describe('while driving', () => {
  it('unlocking gets no "Come on in!"', () => {
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('unlock_car', 'I unlocked the car.', true, { kind: 'did' });
    expect(composeCarSpeech('I unlocked the car.', carTurnActions(), 'en', { driving: true })).toBe('Sure, you got it. I unlocked the car.');
  });
});

describe('both seats (the answer "both" to the seat question)', () => {
  it('two seat heaters are one sentence', () => {
    beginCarTurn();
    resetSpeechVariant();
    noteCarSay('set_seat_climate', "I set the heater in the driver's seat to high.", true, { args: { seat: 'driver', feature: 'heater', level: 'high' }, kind: 'did' });
    noteCarSay('set_seat_climate', 'I set the heater in the passenger seat to high.', true, { args: { seat: 'passenger', feature: 'heater', level: 'high' }, kind: 'did' });
    expect(composeCarSpeech("I set the heater in the driver's seat to high. I set the heater in the passenger seat to high.", carTurnActions(), 'en'))
      .toBe("I set the driver's seat heater to high and set the passenger seat heater to high. Nice and cozy.");
  });
});
