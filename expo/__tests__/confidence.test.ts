import {
  DEFAULT_CONFIDENCE,
  formatScore,
  formatThreshold,
  parseConfidenceSettings,
  readTurn,
  snapThreshold,
  toCoreConfidence,
} from '../src/local_llm/confidence';

describe('Local confidence settings (core 2026-11-19)', () => {
  it('defaults: OFF, 0.90, clarify', () => {
    expect(DEFAULT_CONFIDENCE).toEqual({ enabled: false, threshold: 0.9, fallback: 'clarify' });
  });

  it('snaps to 0.05 steps and clamps to 0..1', () => {
    expect(snapThreshold(0.9)).toBe(0.9);
    expect(snapThreshold(0.87)).toBe(0.85);
    expect(snapThreshold(0.88)).toBe(0.9);
    expect(snapThreshold(-1)).toBe(0);
    expect(snapThreshold(3)).toBe(1);
    expect(snapThreshold(0.6000000001)).toBe(0.6);
    expect(snapThreshold(Number.NaN)).toBe(0.9);
  });

  it('shows the threshold as a decimal and a percentage', () => {
    expect(formatThreshold(0.9)).toBe('0.90 / 90%');
    expect(formatThreshold(0)).toBe('0.00 / 0%');
    expect(formatThreshold(1)).toBe('1.00 / 100%');
    expect(formatThreshold(0.95)).toBe('0.95 / 95%');
  });

  it('reads the 2026-11-17 number form and unknown values', () => {
    expect(parseConfidenceSettings(0)).toEqual(DEFAULT_CONFIDENCE);
    expect(parseConfidenceSettings(0.8)).toEqual({ enabled: true, threshold: 0.8, fallback: 'remote' });
    expect(parseConfidenceSettings({ enabled: true, threshold: 0.62, fallback: 'decline' })).toEqual({ enabled: true, threshold: 0.6, fallback: 'decline' });
    expect(parseConfidenceSettings({ enabled: 'yes', fallback: 'guess' })).toEqual(DEFAULT_CONFIDENCE);
    expect(parseConfidenceSettings(undefined)).toEqual(DEFAULT_CONFIDENCE);
  });

  it('builds the core configuration in the app language, threshold kept when OFF', () => {
    const off = toCoreConfidence({ enabled: false, threshold: 0.8, fallback: 'remote' }, 'pt-BR');
    expect(off).toMatchObject({ enabled: false, min: 0.8, fallback: 'remote' });
    expect((off.messages as Record<string, string>).clarify).toMatch(/Pode repetir/);
    const on = toCoreConfidence({ enabled: true, threshold: 1, fallback: 'clarify' }, 'en');
    expect(on).toMatchObject({ enabled: true, min: 1, fallback: 'clarify' });
  });

  it('reads the turn outcome and score; older cores give neither', () => {
    expect(readTurn({ outcome: 'executed', confidence: { value: 0.934, low: false } })).toEqual({
      outcome: 'executed',
      confidence: { value: 0.934, low: false, unavailable: false },
    });
    expect(readTurn({ outcome: 'declined', confidence: { value: null, low: true, unavailable: true } }).confidence).toEqual({
      value: null,
      low: true,
      unavailable: true,
    });
    expect(readTurn({ text: 'Done.' })).toEqual({});
    expect(readTurn({ outcome: 'weird' })).toEqual({});
    expect(formatScore({ value: 0.934, low: false, unavailable: false })).toBe('Model score 0.93 (93%)');
    expect(formatScore({ value: null, low: true, unavailable: true })).toBe('Model score unavailable');
    expect(formatScore(undefined)).toBe('');
  });
});
