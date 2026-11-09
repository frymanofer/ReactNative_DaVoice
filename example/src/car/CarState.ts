// A simulated car for the DaVoice Car demo (src/car/carToolDefinitions.json, from
// Automotive_Voice_Commands.docx): the agent's car tools change this state, and
// CarCard shows what the AI understood and which tool it used. Nothing here
// talks to a real vehicle.

export type Seat = 'driver' | 'passenger' | 'rear_left' | 'rear_right';
export type Level = 'off' | 'low' | 'medium' | 'high';
export type WindowPosition = 'open' | 'close' | 'half' | 'crack';

export interface CarState {
  destination: string | null;
  avoid: string[];
  temperature: { driver: number; passenger: number; rear: number; unit: 'celsius' | 'fahrenheit' };
  fan: number;
  airflow: string;
  defrost: { windshield: boolean; rear: boolean };
  windows: Record<'driver' | 'passenger' | 'rear_left' | 'rear_right', WindowPosition>;
  doors: Record<'driver' | 'passenger' | 'rear_left' | 'rear_right', 'open' | 'closed'>;
  locked: boolean;
  sunroof: 'open' | 'tilt' | 'close';
  sunshade: 'open' | 'close';
  trunk: 'open' | 'close';
  frunk: 'open' | 'close';
  chargePort: 'open' | 'close';
  screen: 'landscape' | 'portrait';
  seatHeater: Record<Seat, Level>;
  seatVentilation: Record<Seat, Level>;
  massage: { seat: Seat; on: boolean; mode: number };
  wheelHeater: boolean;
  ambient: { on: boolean; color: string };
  readingLights: boolean;
  media: string | null;
  radio: string | null;
  source: string;
  audioFocus: string;
  volume: number;
  muted: boolean;
  call: string | null;
  scenario: string | null;
  /** Moving: the app refuses what isn't allowed while driving (CarCard's Parked / Driving switch). */
  driving: boolean;
  fuelPercent: number;
}

/** One tool call the AI made: what the card shows. */
export interface CarAction {
  id: number;
  at: number;
  tool: string;
  args: Record<string, unknown>;
  /** What the car did, in words. */
  summary: string;
  ok: boolean;
  /** Set when the app refused it (vehicle state, value range): nothing was changed. */
  blocked?: string;
}

const initialState = (): CarState => ({
  destination: null,
  avoid: [],
  temperature: { driver: 21, passenger: 21, rear: 21, unit: 'celsius' },
  fan: 3,
  airflow: 'face',
  defrost: { windshield: false, rear: false },
  windows: { driver: 'close', passenger: 'close', rear_left: 'close', rear_right: 'close' },
  doors: { driver: 'closed', passenger: 'closed', rear_left: 'closed', rear_right: 'closed' },
  locked: false,
  sunroof: 'close',
  sunshade: 'open',
  trunk: 'close',
  frunk: 'close',
  chargePort: 'close',
  screen: 'landscape',
  seatHeater: { driver: 'off', passenger: 'off', rear_left: 'off', rear_right: 'off' },
  seatVentilation: { driver: 'off', passenger: 'off', rear_left: 'off', rear_right: 'off' },
  massage: { seat: 'driver', on: false, mode: 1 },
  wheelHeater: false,
  ambient: { on: false, color: 'white' },
  readingLights: false,
  media: null,
  radio: null,
  source: 'streaming',
  audioFocus: 'all',
  volume: 12,
  muted: false,
  call: null,
  scenario: null,
  driving: false,
  fuelPercent: 62,
});

let state: CarState = initialState();
let actions: CarAction[] = [];
let nextActionId = 1;
const listeners = new Set<() => void>();

export function getCarState(): CarState {
  return state;
}

export function getCarActions(): CarAction[] {
  return actions;
}

export function onCarChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

export function updateCar(change: (s: CarState) => CarState): void {
  state = change(state);
  emit();
}

export function recordCarAction(tool: string, args: Record<string, unknown>, summary: string, ok = true, blocked?: string): void {
  actions = [...actions.slice(-19), { id: nextActionId++, at: Date.now(), tool, args, summary, ok, ...(blocked ? { blocked } : {}) }];
  emit();
}

export function setDriving(driving: boolean): void {
  state = { ...state, driving };
  emit();
}

export function resetCar(): void {
  state = { ...initialState(), driving: state.driving };
  actions = [];
  emit();
}
