import { fetchJson } from '../local_llm/rag/web/http';
import { normalize } from './foods';

// Online calorie lookup for foods that aren't in foods.ts. Wikipedia is used
// by default (free, no key) but only knows plain foods, per 100 g. USDA
// FoodData Central also knows dishes and brands with real serving sizes; it
// needs a free API key (https://fdc.nal.usda.gov/api-key-signup), so it is
// off unless the app passes one (USDA_API_KEY in local.config.ts).

/** Calories of one serving of a food, from an online source. */
export type OnlineFood = {
  /** Display name, e.g. "Kiwifruit". */
  name: string;
  /** Source name, said to the user, e.g. "Wikipedia". */
  source: string;
  /** The serving `servingCalories` is for, e.g. "100 g" or "1 medium croissant (57 g)". */
  servingLabel: string;
  servingCalories: number;
  /** For amounts the user gives in grams; absent when the source has no weight. */
  kcalPer100g?: number;
};

/** A place to look up calories. Add your own (a nutrition API, your own
 * database) and pass it to setFoodCalorieSources in calorieTools.ts. */
export interface FoodCalorieSource {
  readonly name: string;
  /** null when the source has no match; throws when it can't be reached. */
  lookup(food: string, signal: AbortSignal): Promise<OnlineFood | null>;
}

// Words that say how food was served, not what it was: "a bowl of hummus" is hummus.
const SERVING_WORDS = new Set(
  'of with and in slice piece bowl cup glass plate can bottle serving portion handful homemade fresh'.split(' '),
);

/** True when `candidate` (a page title or food description) is about `food`:
 * every meaningful word of the food starts a word of the candidate
 * ("kiwi" → "Kiwifruit", "chicken pad thai" → "Pad Thai with chicken"),
 * so "croissant" never matches "Croissan'wich". */
export function matchesFood(food: string, candidate: string): boolean {
  const words = normalize(food)
    .split(' ')
    .filter((word) => word && !SERVING_WORDS.has(word));
  const candidateWords = normalize(candidate).split(' ');
  return words.length > 0 && words.every((word) => candidateWords.some((c) => c.startsWith(word)));
}

function cleanWikitext(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/'''?/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The {{Infobox nutritional value}} of a page: energy (given in kJ, or kcal)
 * per 100 g unless the box names another serving size. */
export function parseNutritionInfobox(wikitext: string): { name: string; kcal: number; servingSize?: string } | null {
  const start = wikitext.search(/\{\{\s*(?:infobox[ _])?nutritional[ _]?value/i);
  if (start < 0) return null;
  const box = wikitext.slice(start, start + 4000);
  const param = (key: string) => box.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n|}]*)`, 'i'))?.[1]?.trim() ?? '';
  const kj = parseFloat(param('kJ').replace(/,/g, ''));
  const kcal = Number.isFinite(kj) ? kj / 4.184 : parseFloat(param('kcal').replace(/,/g, ''));
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  const servingSize = cleanWikitext(param('serving_size'));
  return { name: cleanWikitext(param('name')), kcal, servingSize: servingSize || undefined };
}

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';
// Wikimedia asks API clients to identify themselves.
const WIKIPEDIA_CLIENT = 'DaVoiceDemo/1.0 (https://davoice.io; info@davoice.io)';

/** Wikipedia's nutrition infoboxes: plain foods (fruit, vegetables, grains,
 * some dishes such as hummus), per 100 g. Searches only pages that have one. */
export class WikipediaFoodSource implements FoodCalorieSource {
  readonly name = 'Wikipedia';

  async lookup(food: string, signal: AbortSignal): Promise<OnlineFood | null> {
    const search = `${food} hastemplate:"Infobox nutritional value"`;
    const data = await fetchJson(
      `${WIKIPEDIA_API}&action=query&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(search)}` +
        '&prop=revisions&rvprop=content&rvslots=main',
      { headers: { 'Api-User-Agent': WIKIPEDIA_CLIENT, 'User-Agent': WIKIPEDIA_CLIENT }, signal },
    );
    const pages = [...(data?.query?.pages ?? [])]
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((page: any) => ({
        title: String(page.title ?? '')
          .replace(/\s*\([^)]*\)$/, '')
          .replace(/ as food$/i, ''),
        box: parseNutritionInfobox(page.revisions?.[0]?.slots?.main?.content ?? ''),
      }))
      .filter(({ title, box }) => box && matchesFood(food, `${title} ${box.name}`));
    // A page named after the food beats one that only mentions it in its
    // infobox: "kiwi" → Kiwifruit, not Actinidia arguta ("hardy kiwi").
    pages.sort((a, b) => Number(matchesFood(food, b.title)) - Number(matchesFood(food, a.title)));
    for (const { title, box: found } of pages) {
      const box = found!;
      const servingGrams = Number(box.servingSize?.match(/(\d+(?:\.\d+)?)\s*g\b/)?.[1]);
      if (!box.servingSize || /^100\s*g$/i.test(box.servingSize)) {
        return { name: title, source: this.name, servingLabel: '100 g', servingCalories: box.kcal, kcalPer100g: box.kcal };
      }
      return {
        name: title,
        source: this.name,
        servingLabel: box.servingSize,
        servingCalories: box.kcal,
        kcalPer100g: servingGrams > 0 ? (box.kcal * 100) / servingGrams : undefined,
      };
    }
    return null;
  }
}

/** Picks a USDA portion for "one" of a food: a medium or regular one, else
 * USDA's default serving ("Quantity not specified"), else the first. */
function pickUsdaPortion(measures: any[]): { label: string; grams: number } | null {
  const usable = measures
    .filter((m) => Number(m?.gramWeight) > 0 && typeof m?.disseminationText === 'string')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const pick =
    usable.find((m) => /^1 (medium|regular)\b/i.test(m.disseminationText)) ??
    usable.find((m) => /quantity not specified/i.test(m.disseminationText)) ??
    usable[0];
  if (!pick) return null;
  const grams = Math.round(Number(pick.gramWeight));
  const text = String(pick.disseminationText);
  return { label: /quantity not specified/i.test(text) ? `${grams} g` : `${text} (${grams} g)`, grams };
}

/** USDA FoodData Central (FNDDS, the foods people actually report eating:
 * dishes, fast food, drinks) with serving sizes. Needs a free API key. */
export class UsdaFoodSource implements FoodCalorieSource {
  readonly name = 'USDA';

  constructor(private readonly apiKey: string) {}

  async lookup(food: string, signal: AbortSignal): Promise<OnlineFood | null> {
    const data = await fetchJson(
      `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(this.apiKey)}` +
        `&dataType=${encodeURIComponent('Survey (FNDDS)')}&pageSize=3&query=${encodeURIComponent(food)}`,
      { signal },
    );
    for (const item of data?.foods ?? []) {
      const description = String(item?.description ?? '');
      const energy = (item?.foodNutrients ?? []).find(
        (n: any) => n?.unitName === 'KCAL' && /energy/i.test(String(n?.nutrientName)),
      );
      const kcalPer100g = Number(energy?.value);
      if (!description || !(kcalPer100g > 0) || !matchesFood(food, description)) continue;
      const name = description.replace(/,\s*(NFS|raw)$/i, '');
      const portion = pickUsdaPortion(item.foodMeasures ?? []);
      return portion
        ? { name, source: this.name, servingLabel: portion.label, servingCalories: (kcalPer100g * portion.grams) / 100, kcalPer100g }
        : { name, source: this.name, servingLabel: '100 g', servingCalories: kcalPer100g, kcalPer100g };
    }
    return null;
  }
}

// Said while a food is looked up online, so the wait isn't silent. Several
// phrasings, never the same one twice in a row.
const FOOD_LOOKUP_FILLERS = [
  'I need to check online for the calories in {food}.',
  "{Food} isn't on my list, so let me look it up online.",
  'Let me look up the calories for {food} online.',
  "One moment, I'm checking online how many calories {food} has.",
  'Give me a second to find {food} online.',
  'Let me search online for the calories in {food}.',
];
let lastFoodLookupFiller = '';

export function pickFoodLookupFiller(food: string, random: () => number = Math.random): string {
  const choices = FOOD_LOOKUP_FILLERS.filter((f) => f !== lastFoodLookupFiller);
  lastFoodLookupFiller = choices[Math.floor(random() * choices.length)];
  let name = food.trim().replace(/[.!?]+$/, '');
  if (!name || name.length > 40) name = 'this food';
  return lastFoodLookupFiller
    .replace('{Food}', name.charAt(0).toUpperCase() + name.slice(1))
    .replace('{food}', name);
}
