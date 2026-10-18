import RNFS from 'react-native-fs';

// Today's calories for the Local AI Chat demo: a list of entries (foods,
// removals, corrections) whose sum is the total, persisted to a small JSON
// file, with an undo history. The AI changes it through the tools in
// calorieTools.ts; the UI subscribes to changes.

export interface CalorieEntry {
  id: string;
  label: string;
  /** Negative for removals and downward corrections. */
  calories: number;
  at: number;
}

interface CalorieDay {
  date: string;
  entries: CalorieEntry[];
  /** Earlier versions of `entries`, newest last, for undo. */
  undo: CalorieEntry[][];
}

const MAX_UNDO = 20;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filePath(): string {
  return `${RNFS.DocumentDirectoryPath}/calories/today.json`;
}

type Listener = (entries: CalorieEntry[], total: number) => void;

class CalorieStore {
  private day: CalorieDay | null = null;
  private listeners = new Set<Listener>();
  private writeChain: Promise<void> = Promise.resolve();
  private nextId = 1;

  private async load(): Promise<CalorieDay> {
    if (this.day?.date === today()) return this.day;
    let day: CalorieDay = { date: today(), entries: [], undo: [] };
    try {
      if (await RNFS.exists(filePath())) {
        const saved = JSON.parse(await RNFS.readFile(filePath(), 'utf8')) as CalorieDay;
        if (saved.date === today()) day = { date: saved.date, entries: saved.entries ?? [], undo: saved.undo ?? [] };
      }
    } catch {
      // A corrupt file starts the day fresh.
    }
    this.day = day;
    return day;
  }

  private change(day: CalorieDay, entries: CalorieEntry[]): void {
    day.undo = [...day.undo, day.entries].slice(-MAX_UNDO);
    day.entries = entries;
    this.save(day);
  }

  private save(day: CalorieDay): void {
    const snapshot = JSON.stringify(day);
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        const dir = filePath().slice(0, filePath().lastIndexOf('/'));
        if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
        await RNFS.writeFile(filePath(), snapshot, 'utf8');
      });
    const total = CalorieStore.sum(day.entries);
    this.listeners.forEach((listener) => listener(day.entries, total));
  }

  private static sum(entries: CalorieEntry[]): number {
    return entries.reduce((total, entry) => total + entry.calories, 0);
  }

  private entry(label: string, calories: number): CalorieEntry {
    return { id: `${Date.now()}-${this.nextId++}`, label, calories: Math.round(calories), at: Date.now() };
  }

  /** Calls `listener` now and on every change; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.load().then((day) => listener(day.entries, CalorieStore.sum(day.entries)));
    return () => this.listeners.delete(listener);
  }

  async get(): Promise<{ total: number; entries: CalorieEntry[]; canUndo: boolean }> {
    const day = await this.load();
    return { total: CalorieStore.sum(day.entries), entries: day.entries, canUndo: day.undo.length > 0 };
  }

  async add(label: string, calories: number): Promise<number> {
    const day = await this.load();
    this.change(day, [...day.entries, this.entry(label, calories)]);
    return CalorieStore.sum(day.entries);
  }

  /** Removes up to `calories` (the total never goes below zero). */
  async remove(calories: number): Promise<number> {
    const day = await this.load();
    const amount = Math.min(Math.abs(calories), Math.max(0, CalorieStore.sum(day.entries)));
    return this.add('Removed', -amount);
  }

  /** Deletes one entry (undoable). Returns the new total, or null if there is no such entry. */
  async deleteEntry(id: string): Promise<number | null> {
    const day = await this.load();
    if (!day.entries.some((entry) => entry.id === id)) return null;
    this.change(day, day.entries.filter((entry) => entry.id !== id));
    return CalorieStore.sum(day.entries);
  }

  /** Corrects today's total to exactly `total` (kept as an adjustment entry,
   * so the earlier entries and undo still make sense). */
  async setTotal(total: number): Promise<number> {
    const day = await this.load();
    const delta = Math.round(total) - CalorieStore.sum(day.entries);
    this.change(day, [...day.entries, this.entry(`Set total to ${Math.round(total)}`, delta)]);
    return CalorieStore.sum(day.entries);
  }

  /** Reverts the last change. Returns the new total, or null if there was nothing to undo. */
  async undo(): Promise<number | null> {
    const day = await this.load();
    const previous = day.undo[day.undo.length - 1];
    if (!previous) return null;
    day.undo = day.undo.slice(0, -1);
    day.entries = previous;
    this.save(day);
    return CalorieStore.sum(day.entries);
  }
}

export const calorieStore = new CalorieStore();
