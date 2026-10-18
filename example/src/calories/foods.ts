// Typical calories per common serving, so the app — not the model — does the
// math: a 1.5B model extracts "2 × egg" reliably but guesses calories poorly.
// Values are rough averages for a demo, not nutrition advice.
const FOOD_CALORIES: Record<string, number> = {
  egg: 78,
  'boiled egg': 78,
  omelette: 190,
  banana: 105,
  apple: 95,
  orange: 62,
  pear: 100,
  peach: 60,
  mango: 200,
  'cup of grapes': 100,
  grapes: 100,
  strawberries: 50,
  blueberries: 85,
  carrot: 25,
  avocado: 240,
  'slice of pizza': 285,
  pizza: 285,
  'can of coke': 140,
  coke: 140,
  'coca cola': 140,
  soda: 140,
  'diet coke': 1,
  coffee: 2,
  espresso: 3,
  latte: 190,
  cappuccino: 120,
  tea: 2,
  water: 0,
  'glass of milk': 120,
  milk: 120,
  'orange juice': 110,
  juice: 110,
  smoothie: 200,
  'protein shake': 160,
  beer: 150,
  'glass of wine': 125,
  wine: 125,
  'slice of bread': 80,
  bread: 80,
  toast: 80,
  bagel: 250,
  croissant: 230,
  pita: 165,
  pancake: 90,
  waffle: 220,
  donut: 250,
  muffin: 400,
  cookie: 50,
  'chocolate bar': 230,
  chocolate: 230,
  'granola bar': 120,
  'protein bar': 200,
  yogurt: 150,
  'bowl of oatmeal': 160,
  oatmeal: 160,
  cereal: 200,
  'cup of rice': 205,
  rice: 205,
  pasta: 220,
  'chicken breast': 165,
  chicken: 165,
  steak: 500,
  salmon: 360,
  tuna: 130,
  salad: 150,
  sandwich: 350,
  burger: 500,
  hamburger: 500,
  cheeseburger: 550,
  fries: 365,
  'hot dog': 290,
  burrito: 450,
  taco: 170,
  'sushi roll': 300,
  sushi: 300,
  soup: 150,
  potato: 160,
  'sweet potato': 110,
  hummus: 70,
  falafel: 57,
  shawarma: 550,
  'slice of cheese': 110,
  cheese: 110,
  almonds: 160,
  nuts: 170,
  'peanut butter': 95,
  'ice cream': 140,
};

function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

/** Normalizes "Two slices of Pizza" style names to the table's keys (also used
 * to check online matches, onlineFoods.ts). */
export function normalize(food: string): string {
  return food
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(a|an|some|the|my|of the|small|large|big|medium)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

const NORMALIZED = Object.entries(FOOD_CALORIES).map(([name, calories]) => ({ key: normalize(name), name, calories }));

/** Calories of one serving of `food`, or null if it isn't in the table.
 * Prefers an exact name, then the longest table name inside it
 * ("can of coke" → coke, "scrambled eggs" → egg). */
export function lookupFoodCalories(food: string): { name: string; calories: number } | null {
  const key = normalize(food);
  if (!key) return null;
  const exact = NORMALIZED.find((f) => f.key === key);
  if (exact) return exact;
  const padded = ` ${key} `;
  const contained = NORMALIZED.filter((f) => padded.includes(` ${f.key} `)).sort((a, b) => b.key.length - a.key.length);
  return contained[0] ?? null;
}
