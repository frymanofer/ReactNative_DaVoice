import React from 'react';
import { View } from 'react-native';

/** The settings icon: a gear drawn with Views (a ring and eight teeth), so no SVG library is needed. */
export function GearIcon({ size = 20, color }: { size?: number; color: string }) {
  const u = size / 24;
  const ring = 14 * u;
  const tooth = { w: 4.4 * u, h: 5 * u };
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <View
          key={angle}
          style={{
            position: 'absolute',
            left: 12 * u - tooth.w / 2,
            top: 12 * u - tooth.h / 2,
            width: tooth.w,
            height: tooth.h,
            borderRadius: u,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }, { translateY: -8.6 * u }],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 12 * u - ring / 2,
          top: 12 * u - ring / 2,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 3.2 * u,
          borderColor: color,
        }}
      />
    </View>
  );
}
