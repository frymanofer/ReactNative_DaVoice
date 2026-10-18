import { defineTool } from 'react-native-davoice-llm';
import type { ToolChoice, ToolDefinition } from 'react-native-davoice-llm';

import { calorieStore, type CalorieEntry } from './CalorieStore';
import { lookupFoodCalories, normalize } from './foods';
import { WikipediaFoodSource, type FoodCalorieSource, type OnlineFood } from './onlineFoods';

// The Local AI Chat demo's app tools: the on-device model logs, removes,
// corrects, reads and undoes today's calories by voice. Descriptions and
// argument names are the ones measured on Qwen2.5 1.5B / 3B (94% on 66 test
// commands); change them carefully. The model extracts food and quantity; the
// app looks up the calories (foods.ts, then online: onlineFoods.ts).

let onlineSources: FoodCalorieSource[] = [new WikipediaFoodSource()];
let onOnlineLookup: ((food: string) => void) | undefined;

/** Called when a food has to be looked up online (not in the table, not looked
 * up before), so the app can say something while it waits (pickFoodLookupFiller). */
export function setOnlineFoodLookupListener(listener?: (food: string) => void): void {
  onOnlineLookup = listener;
}
const onlineCache = new Map<string, OnlineFood | null>();
const ONLINE_LOOKUP_TIMEOUT_MS = 6000;

/**
 * Online sources tried, in order, for foods that aren't in foods.ts. Default:
 * Wikipedia only. For USDA FoodData Central (dishes, brands, serving sizes):
 * `setFoodCalorieSources([new UsdaFoodSource(apiKey), new WikipediaFoodSource()])`.
 */
export function setFoodCalorieSources(sources: FoodCalorieSource[]): void {
  onlineSources = [...sources];
  onlineCache.clear();
}

/** Tries each online source in turn. `noMatch` names the sources that answered
 * without a match; `unreachable` the ones that failed (offline, rate limit). */
async function lookupOnline(food: string): Promise<{ found: OnlineFood | null; noMatch: string[]; unreachable: string[] }> {
  const key = normalize(food);
  const noMatch: string[] = [];
  const unreachable: string[] = [];
  if (onlineCache.has(key)) return { found: onlineCache.get(key) ?? null, noMatch: onlineSources.map((s) => s.name), unreachable };
  if (onlineSources.length > 0) onOnlineLookup?.(food);
  for (const source of onlineSources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ONLINE_LOOKUP_TIMEOUT_MS);
    try {
      const found = await source.lookup(food, controller.signal);
      if (found) {
        onlineCache.set(key, found);
        return { found, noMatch, unreachable };
      }
      noMatch.push(source.name);
    } catch (error) {
      console.warn(`[Calories] ${source.name} lookup for "${food}" failed:`, error);
      unreachable.push(source.name);
    } finally {
      clearTimeout(timer);
    }
  }
  if (unreachable.length === 0) onlineCache.set(key, null);
  return { found: null, noMatch, unreachable };
}

/** Worded to be repeated to the user as is (small models do). */
function unknownFoodMessage(food: string, noMatch: string[], unreachable: string[]): string {
  let message = `I couldn't find ${food} in my food list${noMatch.length ? ` or on ${noMatch.join(' or ')}` : ''}.`;
  if (unreachable.length) message += ` I couldn't reach ${unreachable.join(' or ')} right now.`;
  if (!onlineSources.some((s) => s.name === 'USDA')) {
    message += ' The app can also use the USDA food database if you add a USDA API key.';
  }
  return `${message} How many calories did it have?`;
}

// Words around a food name that don't name the food: "I didn't eat the kiwi",
// "delete the lentils from my list".
const NOT_FOOD_WORDS = new Set(
  ('i me you can could please just actually didn didnt t did not never eat ate eaten have had drink drank remove delete ' +
    'erase take off away get rid of with and in from on to list today tracker entry entries item food line one it that this')
    .split(' '),
);
const LAST_ENTRY =
  /^\s*(it|that|this|(the )?(last|latest|previous)( one| thing| item| entry| food)?)\s*$|\b(last|latest|previous) (one|thing|item|entry|food)\b|\b(remove|delete|erase) (it|that|this)\b/i;

function foodWords(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 1 && !NOT_FOOD_WORDS.has(word));
}

/** The logged food the user means, from a food name or the user's whole
 * sentence: the most recent entry whose label contains the most of its words
 * ("kiwi" → "Kiwifruit (200 g, Wikipedia)", "I didn't eat the eggs" →
 * "2 × egg"); "it" / "the last one" → the most recent food. */
function findLoggedFood(entries: CalorieEntry[], food: string): CalorieEntry | undefined {
  const foods = entries.filter((e) => e.calories > 0 && !/^Set total to/.test(e.label));
  if (LAST_ENTRY.test(food)) return foods[foods.length - 1];
  const words = foodWords(food);
  if (words.length === 0) return undefined;
  let best: { entry: CalorieEntry; score: number } | undefined;
  for (const entry of foods) {
    const labelWords = normalize(entry.label).split(' ');
    const score = words.filter((word) => labelWords.some((l) => l.startsWith(word))).length;
    if (score > 0 && score >= (best?.score ?? 0)) best = { entry, score };
  }
  return best?.entry;
}

/** "200 grams of lentils" → 200, if the user said exactly one weight in grams. */
const GRAMS = /(\d+(?:\.\d+)?)\s*(?:g|gr|grams?)\b/gi;
function gramsSaid(userText: string): number | undefined {
  const matches = [...userText.matchAll(GRAMS)];
  return matches.length === 1 ? Number(matches[0][1]) : undefined;
}

/** Added to the system prompt with the tools. */
export const CALORIE_TOOL_INSTRUCTIONS =
  'The app shows a calories-today tracker. Call a tool only when the user wants to log, change, undo or check ' +
  'THEIR OWN calories for today. A question about how many calories a food has is general knowledge: ' +
  'answer it directly, without any tool. Only use the tools listed below; for anything else answer normally. ' +
  'A tool result with "ok": true means the change is already made: say in one short sentence what was done; ' +
  'never ask whether to do it.';

/**
 * Per-message tool policy for the calorie demo (react-native-davoice-llm's
 * `toolChoice`), from the user's words alone. When the words make the intent
 * clear, the tool is named, which is far more reliable with small on-device
 * models than letting them choose (their choice drifts in long chats):
 * - "How many calories are in an apple?" → 'none' (general knowledge);
 * - read / undo → that tool, called directly (no arguments needed);
 * - set / remove / log → that tool; the model fills in the numbers;
 * - anything else → 'auto' (the model decides).
 */
export function calorieToolChoice(userText: string): ToolChoice {
  const text = userText.toLowerCase();
  const asksAboutAFood = /\b(how many|how much)\b.*\bcalories?\b/.test(text) && /\b(in|does|do)\b/.test(text);
  const aboutTheUser = /\b(i|i'm|i've|me|my|today|so far)\b/.test(text);
  if (asksAboutAFood && !aboutTheUser) return 'none';
  if (/\b(undo|cancel (it|that)|that was wrong|take that back)\b/.test(text)) return { name: 'undo_last_change' };
  if (/\b(set (it|my|the|today)|reset|in total|total (is|was|to)|clear (it|the list|everything|all)|(remove|delete) (all|everything))\b/.test(text)) {
    return { name: 'set_calories_today' };
  }
  // "Remove 100 calories" subtracts a number; "remove the kiwi" / "I didn't eat
  // the coke" deletes that food's line.
  const removes = /\b(remove|subtract|take off|take away|minus|delete|erase)\b/.test(text);
  if (removes || /\b(didn'?t|did not|never) (eat|have|drink)\b/.test(text)) {
    const justANumber = /\d+\s*(k?cals?|calories?)\b/.test(text) || /^\W*(remove|subtract|take off|take away|minus)\s+\d+\W*$/.test(text);
    return { name: justANumber ? 'remove_calories' : 'delete_food' };
  }
  if (/\b(i (just )?(ate|had|drank)|log|add|ate|drank)\b/.test(text)) return { name: 'log_food' };
  // Follow-ups without a verb: "And a banana", "also two cookies".
  if (/^\s*(and|also|plus)\s+(a|an|some|one|two|three|four|five|\d+)\b/.test(text)) return { name: 'log_food' };
  if (/\b(how (much|many)( calories)? (have|did) i|my total|so far|today's total|calories (have i|today)|what have i eaten|what did i eat)\b/.test(text)) {
    return { name: 'get_calories_today' };
  }
  return 'auto';
}

/** Said when a tracker request didn't lead to a tool call (nothing changed). */
export const CALORIE_MISSING_TOOL_REPLY =
  "Sorry, I couldn't update the calorie tracker. Could you say it again, maybe with the number of calories?";

export const calorieTools: ToolDefinition[] = [
  defineTool({
    name: 'get_calories_today',
    description: "Read the user's calorie tracker: today's total and entries.",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const { total, entries } = await calorieStore.get();
      return {
        total_today: total,
        entries: entries.slice(-8).map((e) => ({ item: e.label, calories: e.calories })),
      };
    },
  }),
  defineTool<{ food: string; quantity?: number; calories?: number }>({
    name: 'log_food',
    description:
      "Log something the user says they ate or drank ('I ate', 'I had', 'log', 'add'). Give the food name and quantity; " +
      'the app knows the calories of common foods. Set calories only if the user said a number.',
    inputSchema: {
      type: 'object',
      properties: {
        food: {
          type: 'string',
          description:
            "Food or drink, singular, e.g. egg, banana, slice of pizza, can of coke. Use 'calories' if the user only said a number.",
        },
        quantity: { type: 'number', description: 'How many, default 1', minimum: 0 },
        calories: { type: 'integer', description: 'Total calories, only if the user said the number', minimum: 0 },
      },
      required: ['food'],
    },
    handler: async ({ food, quantity, calories }, context) => {
      let count = quantity && quantity > 0 ? quantity : 1;
      // Trust a calorie number only if the user said it: small models fill
      // in their own (poor) guesses even when told not to.
      const userText = typeof context.userText === 'string' ? context.userText : '';
      // A weight ("200 grams") is neither a calorie number nor a count.
      const grams = gramsSaid(userText);
      const saidNumbers = (userText.replace(GRAMS, ' ').match(/\d+/g) ?? []).map(Number);
      if (grams !== undefined && count === grams) count = 1;
      if (calories !== undefined && userText && !saidNumbers.includes(calories)) calories = undefined;
      // "Add 300 calories" sometimes arrives as {food: "calories", quantity: 300}.
      if (calories === undefined && /^\s*(k?cal(orie)?s?)?\s*$/i.test(food) && count > 1) {
        calories = count;
        count = 1;
      }
      let amount: number;
      let label: string;
      let source: string | undefined;
      const known = calories === undefined ? lookupFoodCalories(food) : null;
      if (calories !== undefined) {
        amount = calories;
        label = /^\s*(k?cal(orie)?s?)?\s*$/i.test(food) ? 'Calories' : food;
      } else if (known) {
        amount = known.calories * count;
        label = count === 1 ? known.name : `${count} × ${known.name}`;
      } else {
        const { found, noMatch, unreachable } = await lookupOnline(food);
        if (!found) throw new Error(unknownFoodMessage(food, noMatch, unreachable));
        source = found.source;
        if (grams !== undefined && found.kcalPer100g !== undefined) {
          // "200 grams of lentils".
          amount = (found.kcalPer100g * grams) / 100;
          label = `${found.name} (${grams} g, ${source})`;
        } else {
          amount = found.servingCalories * count;
          label = `${count === 1 ? '' : `${count} × `}${found.name} (${found.servingLabel}, ${source})`;
        }
      }
      const newTotal = await calorieStore.add(label, amount);
      return {
        ok: true,
        status: "Done: added to today's tracker",
        logged: label,
        calories: Math.round(amount),
        total_today: newTotal,
        ...(source ? { source } : {}),
      };
    },
  }),
  // `food` is optional: when the app names this tool (calorieToolChoice), it is
  // called directly and the food is found from the user's own words, since it
  // must be one of today's entries; small models sometimes miss this call.
  defineTool<{ food?: string }>({
    name: 'delete_food',
    description:
      "Delete a food or drink from today's list ('remove the kiwi', 'delete the coke', 'I didn't eat the banana').",
    inputSchema: {
      type: 'object',
      properties: { food: { type: 'string', description: "The food to delete, e.g. kiwi, or 'last' for the last one" } },
    },
    handler: async ({ food }, context) => {
      const { entries } = await calorieStore.get();
      const userText = typeof context.userText === 'string' ? context.userText : '';
      const said = food?.trim() || userText;
      const entry = findLoggedFood(entries, said);
      if (!entry) {
        const what = food?.trim() || foodWords(userText).join(' ') || 'that';
        const listed = entries
          .filter((e) => e.calories > 0 && !/^Set total to/.test(e.label))
          .slice(-6)
          .map((e) => `${e.label}, ${e.calories} calories`);
        // Worded to be repeated to the user as is (small models do).
        throw new Error(
          listed.length === 0
            ? "Today's list is empty, so there is nothing to remove."
            : `I couldn't find ${what} in today's list. The list has: ${listed.join('; ')}. Which one should I remove?`,
        );
      }
      const newTotal = await calorieStore.deleteEntry(entry.id);
      return {
        ok: true,
        status: "Done: deleted from today's list",
        deleted: entry.label,
        calories: entry.calories,
        total_today: newTotal,
      };
    },
  }),
  defineTool<{ amount: number }>({
    name: 'remove_calories',
    description:
      "Subtract a number of calories from today's total ('remove 100 calories'). To remove a food, use delete_food.",
    inputSchema: { type: 'object', properties: { amount: { type: 'integer', minimum: 0 } }, required: ['amount'] },
    handler: async ({ amount }) => ({
      ok: true,
      status: "Done: removed from today's total",
      removed: amount,
      total_today: await calorieStore.remove(amount),
    }),
  }),
  defineTool<{ total: number }>({
    name: 'set_calories_today',
    description: "Replace today's total with an exact number, e.g. 'set it to 1500', 'reset to zero', 'today I ate 1200 in total'.",
    inputSchema: { type: 'object', properties: { total: { type: 'integer', minimum: 0 } }, required: ['total'] },
    handler: async ({ total }) => ({
      ok: true,
      status: "Done: today's total replaced",
      total_today: await calorieStore.setTotal(total),
    }),
  }),
  defineTool({
    name: 'undo_last_change',
    description: "Undo the last change to the calorie tracker ('undo', 'that was wrong', 'cancel that').",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const after = await calorieStore.undo();
      return after === null
        ? { ok: false, error: 'There is nothing to undo.' }
        : { ok: true, status: 'Done: the last change was undone', total_today: after };
    },
  }),
];

