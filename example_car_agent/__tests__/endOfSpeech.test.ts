// Words that cannot end a request wait longer before they are sent (src/stt/endOfSpeech.ts; 2026-11-25 iPhone log).
import { looksUnfinished, silenceFor, UNFINISHED_EXTRA_MS } from '../src/stt/endOfSpeech';

test('unfinished: the fragments that were sent too early', () => {
  for (const t of ['Look at', 'Please', 'Yeah, it\'s', 'Set the', 'Can you', 'Open', 'Set the heat of the', 'Turn on', 'Open all the doors and'])
    expect([t, looksUnfinished(t, 'en')]).toEqual([t, true]);
  for (const t of ['Fecha a', 'Você pode', 'Abre', 'Coloca o volume em', 'Por favor'])
    expect([t, looksUnfinished(t, 'pt-BR')]).toEqual([t, true]);
});

test('finished requests and answers keep the normal silence', () => {
  for (const t of ['Open the sunroof', 'Yes', 'Yes please', 'Stop', 'No', 'Close it please', 'Set the fan to five', 'Thank you', 'Lock the car', 'What\'s that'])
    expect([t, looksUnfinished(t, 'en')]).toEqual([t, false]);
  for (const t of ['Fecha a janela, por favor', 'Sim', 'Pode', 'Liga o ar', 'Tranca o carro'])
    expect([t, looksUnfinished(t, 'pt-BR')]).toEqual([t, false]);
  expect(looksUnfinished('Mach das', 'de')).toBe(false);
});

test('silenceFor adds the extra wait only when unfinished', () => {
  expect(silenceFor('Set the', 1500, 'en')).toBe(1500 + UNFINISHED_EXTRA_MS);
  expect(silenceFor('Open the window', 1500, 'en')).toBe(1500);
});
