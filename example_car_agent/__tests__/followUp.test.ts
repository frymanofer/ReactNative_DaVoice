// What the driver says right after the agent's question or offer (src/car/followUp.ts, 2026-11-21 reply review). The same cases as the
// Flutter app (test/fixtures/follow_up.json, kept identical).
import { carTurnInput, noteCarReply, resetFollowUp } from '../src/car/followUp';
import cases from './fixtures/follow_up.json';

type Case = { lang: string; before: { sent: string; reply: string } | null; offer: string[] | null; user: string; expect: { text: string } | { reply: string }; car?: { musicOn?: boolean } };

test('every case of the shared fixture', () => {
  const diffs = (cases as Case[]).map((c) => {
    resetFollowUp();
    if (c.before) noteCarReply(c.before.sent, c.before.reply, c.lang);
    const got = carTurnInput(c.user, c.lang, c.offer, c.car ?? {});
    return { user: c.user, lang: c.lang, got, want: c.expect };
  }).filter((d) => JSON.stringify(d.got) !== JSON.stringify(d.want));
  expect(diffs).toEqual([]);
});

test('a question is answered once: the request after the answer is a new one', () => {
  resetFollowUp();
  noteCarReply('Open the window', 'Which window should I open?', 'en');
  expect(carTurnInput("The driver's one", 'en', null)).toEqual({ text: "Open the window, the driver's one" });
  expect(carTurnInput('The rear ones', 'en', null)).toEqual({ text: 'The rear ones' });
});

test('dismissals rotate between two short replies', () => {
  resetFollowUp();
  expect([carTurnInput('Never mind', 'en', null), carTurnInput('Cancel', 'en', null)]).toEqual([{ reply: 'Okay.' }, { reply: 'No problem.' }]);
});
