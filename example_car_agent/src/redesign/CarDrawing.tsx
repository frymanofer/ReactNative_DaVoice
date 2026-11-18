import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { CarAction, CarState, Seat } from '../car/CarState';
import type { Pos } from '../car/positions';
import { resolve } from '../car/positions';
import { C } from './theme';

// Top-down car in the design's 260 × 460 viewBox (redesign/source/Car.dc.html), front at the top: the left of the
// drawing is the car's left side.
export const CAR_VB_W = 260;
export const CAR_VB_H = 460;
export const CAR_ASPECT = 254 / 450;

const WINDOW_LEVEL: Record<string, number> = { open: 1, half: 0.5, crack: 0.2, close: 0 };
const LEVEL_ALPHA: Record<string, number> = { low: 0.35, medium: 0.5, high: 0.65 };

const SEAT_RECT: Record<Pos, { x: number; y: number; h: number }> = {
  front_left: { x: 74, y: 194, h: 52 },
  front_right: { x: 142, y: 194, h: 52 },
  rear_left: { x: 74, y: 262, h: 50 },
  rear_right: { x: 142, y: 262, h: 50 },
};
const WINDOW_BAR: Record<Pos, { x: number; y: number; h: number }> = {
  front_left: { x: 55, y: 170, h: 70 },
  front_right: { x: 200, y: 170, h: 70 },
  rear_left: { x: 55, y: 250, h: 66 },
  rear_right: { x: 200, y: 250, h: 66 },
};
const DOOR: Record<Pos, { x: number; y: number; h: number; rot: string }> = {
  front_left: { x: 44, y: 168, h: 72, rot: 'rotate(38 51 168)' },
  front_right: { x: 209, y: 168, h: 72, rot: 'rotate(-38 209 168)' },
  rear_left: { x: 44, y: 248, h: 70, rot: 'rotate(38 51 248)' },
  rear_right: { x: 209, y: 248, h: 70, rot: 'rotate(-38 209 248)' },
};

const AMBIENT: [RegExp, string][] = [
  [/blue|azul/i, '#60A5FA'],
  [/red|vermelh/i, '#F87171'],
  [/purple|violet|roxo|lilás|lilas/i, '#C084FC'],
  [/green|verde/i, '#34D399'],
  [/orange|laranja/i, '#FB923C'],
  [/pink|rosa/i, '#F472B6'],
  [/yellow|amarel/i, '#FACC15'],
  [/warm|quente/i, '#FDE68A'],
  [/white|branc/i, '#E5E7EB'],
];
export function ambientHex(color: string): string {
  return AMBIENT.find(([re]) => re.test(color))?.[1] ?? '#2DD4BF';
}

function seatPos(seat: Seat, steering: 'left' | 'right'): Pos {
  if (seat === 'driver') return steering === 'right' ? 'front_right' : 'front_left';
  if (seat === 'passenger') return steering === 'right' ? 'front_left' : 'front_right';
  return seat;
}

type Part = 'trunk' | 'frunk' | 'sunroof' | 'chargePort' | 'lock' | { doors: Pos[] } | { windows: Pos[] };

/** The part of the car a refused tool call was about (blinks amber). */
function blockedPart(action: CarAction | undefined, steering: 'left' | 'right'): Part | null {
  if (!action || action.ok) return null;
  const t = action.tool;
  const a = action.args as Record<string, unknown>;
  if (/trunk/.test(t)) return a.target === 'frunk' ? 'frunk' : 'trunk';
  if (/sunroof/.test(t)) return 'sunroof';
  if (/charge/.test(t)) return 'chargePort';
  if (/lock/.test(t)) return 'lock';
  const where = resolve(a.position ?? a.target, steering) ?? [];
  if (/door/.test(t)) return { doors: where };
  if (/window/.test(t)) return { windows: where };
  return null;
}

function Waves({ cx, cy, k }: { cx: number; cy: number; k: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const wave = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(900 - delay),
        ]),
      );
    const la = wave(a, 0);
    const lb = wave(b, 900);
    la.start();
    lb.start();
    return () => {
      la.stop();
      lb.stop();
    };
  }, [a, b]);
  const r = 34 * k;
  const ring = (v: Animated.Value) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx * k - r,
        top: cy * k - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        borderWidth: 1.5,
        borderColor: C.mint,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.5] }) }],
      }}
    />
  );
  return (
    <>
      {ring(a)}
      {ring(b)}
    </>
  );
}

export default function CarDrawing({ state: s, latest, width }: { state: CarState; latest?: CarAction; width: number }) {
  const k = width / CAR_VB_W;
  const height = CAR_VB_H * k;
  const steering = s.vehicle.steering;
  const blocked = blockedPart(latest, steering);

  const blink = useRef(new Animated.Value(0)).current;
  const blinkId = blocked ? latest?.id : undefined;
  useEffect(() => {
    if (blinkId === undefined) return;
    blink.setValue(1);
    const pulse = Animated.sequence([
      Animated.timing(blink, { toValue: 0.35, duration: 500, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    Animated.sequence([pulse, pulse, pulse]).start();
  }, [blink, blinkId]);

  const seatFill = (pos: Pos) => {
    const seat = (['driver', 'passenger', 'rear_left', 'rear_right'] as Seat[]).find((x) => seatPos(x, steering) === pos)!;
    const heat = s.seatHeater[seat];
    const vent = s.seatVentilation[seat];
    if (heat && heat !== 'off') return `rgba(245, 158, 11, ${LEVEL_ALPHA[heat] ?? 0.6})`;
    if (vent && vent !== 'off') return `rgba(96, 165, 250, ${LEVEL_ALPHA[vent] ?? 0.5})`;
    return '#26322E';
  };

  const wheelX = steering === 'right' ? 164 : 96;
  const ambient = s.ambient.on ? ambientHex(s.ambient.color) : null;
  const locked = s.locked || Object.values(s.doorLocks).some(Boolean);
  const focusSeat: Pos | null = s.call
    ? seatPos('driver', steering)
    : (['driver', 'passenger', 'rear_left', 'rear_right'] as string[]).includes(s.audioFocus)
      ? seatPos(s.audioFocus as Seat, steering)
      : null;
  const focusCenter = focusSeat ? { x: SEAT_RECT[focusSeat].x + 22, y: SEAT_RECT[focusSeat].y + 26 } : null;
  const roof = s.sunroof;
  const label = `Car seen from above. ${latest ? `Last action: ${latest.summary}` : 'No action yet'}.`;

  return (
    <View style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height} viewBox={`0 0 ${CAR_VB_W} ${CAR_VB_H}`}>
        <Defs>
          <LinearGradient id="dvBody" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#1B2321" />
            <Stop offset="0.5" stopColor="#3B4542" />
            <Stop offset="1" stopColor="#1B2321" />
          </LinearGradient>
          <LinearGradient id="dvGlass" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#2A4A40" />
            <Stop offset="1" stopColor="#0F1C18" />
          </LinearGradient>
        </Defs>
        <Rect x={38} y={76} width={12} height={58} rx={4} fill="#050706" />
        <Rect x={210} y={76} width={12} height={58} rx={4} fill="#050706" />
        <Rect x={38} y={346} width={12} height={58} rx={4} fill="#050706" />
        <Rect x={210} y={346} width={12} height={58} rx={4} fill="#050706" />
        <Ellipse cx={44} cy={150} rx={9} ry={5} fill="#2C3331" />
        <Ellipse cx={216} cy={150} rx={9} ry={5} fill="#2C3331" />
        <Path
          d="M88 14 Q130 2 172 14 Q206 24 208 70 L211 384 Q211 444 168 452 L92 452 Q49 444 49 384 L52 70 Q54 24 88 14 Z"
          fill="url(#dvBody)"
          stroke="#6B7470"
          strokeWidth={1.5}
        />
        <Path d="M64 36 Q78 22 102 18" fill="none" stroke={C.mint} strokeWidth={4} strokeLinecap="round" />
        <Path d="M196 36 Q182 22 158 18" fill="none" stroke={C.mint} strokeWidth={4} strokeLinecap="round" />
        <Path d="M62 438 Q84 448 104 449" fill="none" stroke="#F87171" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
        <Path d="M198 438 Q176 448 156 449" fill="none" stroke="#F87171" strokeWidth={3} strokeLinecap="round" opacity={0.8} />

        <Path
          d="M70 40 Q130 22 190 40 L192 116 L68 116 Z"
          fill={s.frunk === 'open' ? 'rgba(52, 211, 153, 0.22)' : 'none'}
          stroke={s.frunk === 'open' ? C.mint : C.titanium}
          strokeWidth={1.6}
        />
        <Path d="M70 120 L190 120 L180 160 L80 160 Z" fill="url(#dvGlass)" stroke={C.titanium} strokeWidth={1} />
        {s.defrost.windshield && (
          <G stroke="#FB923C" strokeWidth={1.6} fill="none" strokeLinecap="round">
            <Path d="M84 132 Q130 126 176 132" />
            <Path d="M82 142 Q130 136 178 142" />
            <Path d="M81 152 Q130 146 179 152" />
          </G>
        )}

        <Rect x={64} y={162} width={132} height={162} rx={14} fill="#0A100E" stroke={ambient ?? '#2C3331'} strokeWidth={ambient ? 3 : 1} />
        {s.airflow === 'face' && s.fan >= 5 && (
          <G stroke="#7DD3FC" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeDasharray="3 4">
            <Path d="M96 166 L96 188" />
            <Path d="M164 166 L164 188" />
          </G>
        )}
        <Circle cx={wheelX} cy={178} r={12} fill="none" stroke={s.wheelHeater ? C.warning : '#59625F'} strokeWidth={4} />
        {(Object.keys(SEAT_RECT) as Pos[]).map((pos) => (
          <Rect key={pos} x={SEAT_RECT[pos].x} y={SEAT_RECT[pos].y} width={44} height={SEAT_RECT[pos].h} rx={10} fill={seatFill(pos)} stroke={C.olive} strokeWidth={1} />
        ))}
        <Rect
          x={114}
          y={198}
          width={32}
          height={104}
          rx={8}
          fill={roof === 'open' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(30, 60, 50, 0.75)'}
          stroke={roof === 'close' ? C.titanium : C.mint}
          strokeWidth={1.5}
          strokeDasharray={roof === 'tilt' ? '4 3' : undefined}
        />

        {(Object.keys(WINDOW_BAR) as Pos[]).map((pos) => {
          const w = WINDOW_BAR[pos];
          const level = WINDOW_LEVEL[s.windows[pos]] ?? 0;
          return (
            <G key={pos}>
              <Rect x={w.x} y={w.y} width={5} height={w.h} rx={2.5} fill="#2A3632" />
              {level > 0 && <Rect x={w.x} y={w.y} width={5} height={Math.round(w.h * level)} rx={2.5} fill={C.mint} />}
            </G>
          );
        })}
        {(Object.keys(DOOR) as Pos[]).map((pos) =>
          s.doors[pos] === 'open' ? (
            <Rect
              key={pos}
              x={DOOR[pos].x}
              y={DOOR[pos].y}
              width={7}
              height={DOOR[pos].h}
              rx={3}
              fill="rgba(52, 211, 153, 0.25)"
              stroke={C.mint}
              strokeWidth={1.5}
              transform={DOOR[pos].rot}
            />
          ) : null,
        )}

        <Path d="M80 328 L180 328 L188 352 L72 352 Z" fill="url(#dvGlass)" stroke={C.titanium} strokeWidth={1} />
        {s.defrost.rear && (
          <G stroke="#FB923C" strokeWidth={1.4} fill="none">
            <Path d="M84 336 L176 336" />
            <Path d="M80 344 L180 344" />
          </G>
        )}
        <Path
          d="M68 356 L192 356 L196 420 Q130 440 64 420 Z"
          fill={s.trunk === 'open' ? 'rgba(52, 211, 153, 0.22)' : 'none'}
          stroke={s.trunk === 'open' ? C.mint : C.titanium}
          strokeWidth={1.8}
        />
        <Rect x={47} y={370} width={7} height={16} rx={2} fill={s.chargePort === 'open' ? C.mint : '#2C3331'} />
        {locked && (
          <G>
            <Rect x={120} y={384} width={20} height={16} rx={3} fill={C.mint} />
            <Path d="M124 384 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke={C.mint} strokeWidth={2.5} />
          </G>
        )}
      </Svg>

      {blocked && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity: blink }}>
          <Svg width={width} height={height} viewBox={`0 0 ${CAR_VB_W} ${CAR_VB_H}`}>
            <G fill="rgba(245, 158, 11, 0.3)" stroke={C.warning} strokeWidth={2}>
              {blocked === 'trunk' && <Path d="M68 356 L192 356 L196 420 Q130 440 64 420 Z" />}
              {blocked === 'frunk' && <Path d="M70 40 Q130 22 190 40 L192 116 L68 116 Z" />}
              {blocked === 'sunroof' && <Rect x={114} y={198} width={32} height={104} rx={8} />}
              {blocked === 'chargePort' && <Rect x={45} y={368} width={11} height={20} rx={3} />}
              {blocked === 'lock' && <Rect x={116} y={372} width={28} height={32} rx={5} />}
              {typeof blocked === 'object' &&
                'doors' in blocked &&
                blocked.doors.map((pos) => (
                  <Rect key={pos} x={DOOR[pos].x} y={DOOR[pos].y} width={7} height={DOOR[pos].h} rx={3} transform={DOOR[pos].rot} />
                ))}
              {typeof blocked === 'object' &&
                'windows' in blocked &&
                blocked.windows.map((pos) => (
                  <Rect key={pos} x={WINDOW_BAR[pos].x - 1} y={WINDOW_BAR[pos].y} width={7} height={WINDOW_BAR[pos].h} rx={3} />
                ))}
            </G>
          </Svg>
        </Animated.View>
      )}
      {focusCenter && <Waves cx={focusCenter.x} cy={focusCenter.y} k={k} />}
    </View>
  );
}
