import React from 'react';
import { View } from 'react-native';

// Small line icons drawn with Views, so the redesign needs no SVG library for them.

export function DownloadIcon({ size = 16, color, stroke = 2 }: { size?: number; color: string; stroke?: number }) {
  const u = size / 24;
  const chevron = 7 * u;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 12 * u - stroke / 2, top: 3 * u, width: stroke, height: 11 * u, backgroundColor: color, borderRadius: stroke }} />
      <View
        style={{
          position: 'absolute',
          left: 12 * u - chevron / 2,
          top: 15 * u - chevron * 1.15,
          width: chevron,
          height: chevron,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 4 * u,
          top: 17 * u,
          width: 16 * u,
          height: 3 * u + stroke / 2,
          borderLeftWidth: stroke,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
        }}
      />
    </View>
  );
}

export { GearIcon } from '../conversation/GearIcon';

export function CheckIcon({ size = 16, color, stroke = 2.6 }: { size?: number; color: string; stroke?: number }) {
  const u = size / 24;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: 8 * u,
          top: 2 * u,
          width: 8 * u,
          height: 15 * u,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '40deg' }],
        }}
      />
    </View>
  );
}
