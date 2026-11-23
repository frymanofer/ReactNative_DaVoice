// The title to play is the driver's own words when the model copied it wrong (src/car/mediaQuery.ts). Shared fixture with the
// Flutter car app (test/fixtures/media_query.json, kept identical).
import cases from './fixtures/media_query.json';
import { groundMediaQuery } from '../src/car/mediaQuery';

describe('groundMediaQuery', () => {
  for (const c of cases as { query: string; user: string; expect: string }[]) {
    it(`"${c.user}" + model "${c.query}" -> "${c.expect}"`, () => {
      expect(groundMediaQuery(c.query, c.user)).toBe(c.expect);
    });
  }
});
