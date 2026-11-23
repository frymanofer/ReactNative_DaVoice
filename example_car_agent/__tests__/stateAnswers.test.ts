// A question about the car is answered from the car (src/car/stateAnswers.ts, 2026-11-21 reply review: the model RAN the action for
// "Is the car locked?" and the like), and the follow-ups to those answers (src/car/followUp.ts). The same cases as the Flutter app
// (test/fixtures/state_answers.json and car_dialogs.json, kept identical).
import { answerCarQuestion } from '../src/car/stateAnswers';
import { carTurnInput, noteCarSpoken, resetFollowUp } from '../src/car/followUp';
import { getCarState, resetCar, type CarState } from '../src/car/CarState';
import answers from './fixtures/state_answers.json';
import dialogs from './fixtures/car_dialogs.json';

/** The demo's starting car with the case's changes (only what differs from the start is in the fixture). */
function carWith(changes: Record<string, unknown>): CarState {
  resetCar();
  const s = getCarState();
  return { ...s, ...changes, temperature: { ...s.temperature, ...((changes.temperature as object) ?? {}) } } as CarState;
}

test('every question of the shared fixture', () => {
  const diffs = (answers as Array<{ lang: string; state: Record<string, unknown>; user: string; expect: unknown }>)
    .map((c) => ({ user: c.user, lang: c.lang, got: answerCarQuestion(c.user, c.lang, carWith(c.state)), want: c.expect }))
    .filter((d) => JSON.stringify(d.got) !== JSON.stringify(d.want));
  expect(diffs).toEqual([]);
});

test('every conversation of the shared fixture', () => {
  type Step = { user: string; expect: unknown; heard?: string };
  const diffs: unknown[] = [];
  for (const d of dialogs as Array<{ lang: string; state: Record<string, unknown>; car?: { musicOn?: boolean; lastActed?: boolean }; steps: Step[] }>) {
    resetFollowUp();
    const state = carWith(d.state);
    for (const s of d.steps) {
      const got = carTurnInput(s.user, d.lang, null, { state, ...(d.car ?? {}) });
      if (JSON.stringify(got) !== JSON.stringify(s.expect)) diffs.push({ lang: d.lang, user: s.user, got, want: s.expect });
      noteCarSpoken('reply' in got ? got.reply : s.heard ?? '');
    }
  }
  expect(diffs).toEqual([]);
});

test('safety: a question never becomes a request by itself, and a request is never answered as a question', () => {
  const s = carWith({});
  for (const u of ['Lock the car', 'Close the windows', 'Open the sunroof', 'Can you lock the car?', 'Tranca o carro', 'Fecha os vidros', 'Abre o teto solar']) {
    expect(answerCarQuestion(u, u.match(/^[A-Z][a-z]+ (o|os|a|as) /) ? 'pt-BR' : 'en', s)).toBeNull();
  }
  // nothing pending: a yes is passed on as it is (the agent core decides)
  resetFollowUp();
  expect(carTurnInput('Yes', 'en', null, { state: s })).toEqual({ text: 'Yes' });
});
