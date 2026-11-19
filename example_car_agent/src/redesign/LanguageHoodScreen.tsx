import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { C, DESIGN_WIDTH, F, PRIMARY_GRADIENT } from './theme';
import { CheckIcon, DownloadIcon } from './icons';

const HOOD = require('../../assets/images/redesign/hood_background_B.jpg');
const HOOD_ASPECT = 996 / 572;

export type HoodLanguage = {
  id: string;
  /** "PT-BR" */
  code: string;
  /** "Português" on the tile and the engine */
  shortName: string;
  /** "Português do Brasil" on the button */
  name: string;
  sizeMB: number;
  installed: boolean;
};

type Props = {
  languages: HoodLanguage[];
  defaultId: string;
  onInstall: (id: string) => void;
};

export default function LanguageHoodScreen({ languages, defaultId, onInstall }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [picked, setPicked] = useState(
    languages.some((l) => l.id === defaultId) ? defaultId : languages[0]?.id,
  );
  const current = languages.find((l) => l.id === picked) ?? languages[0];
  const rackOrder = [
    ...languages.filter((l) => l.id === defaultId),
    ...languages.filter((l) => l.id !== defaultId),
  ];

  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const [scroll, setScroll] = useState({ y: 0, content: 1, visible: 1 });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setScroll({ y: contentOffset.y, content: contentSize.height, visible: layoutMeasurement.height });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  // Title, engine circle and module rack sit on what is painted in the image, so they scale with the image
  // (screen width), never with the screen height. Only the button is anchored to the bottom.
  const s = box ? box.w / DESIGN_WIDTH : 1;
  const d = (v: number) => v * s;

  const thumbRatio = Math.min(1, scroll.visible / Math.max(scroll.content, 1));
  const thumbTravel = 1 - thumbRatio;
  const thumbPos = scroll.content > scroll.visible ? scroll.y / (scroll.content - scroll.visible) : 0;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {box && current && (
        <>
          <Image source={HOOD} style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.w * HOOD_ASPECT }} />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: d(560),
              height: d(120),
              experimental_backgroundImage: `linear-gradient(180deg, rgba(11, 15, 14, 0) 0%, ${C.bg} 100%)`,
            }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: d(680), bottom: 0, backgroundColor: C.bg }} />
          {/* The photo fades out behind the language list and the button, so the choices carry the lower half of the screen. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: d(380),
              bottom: 0,
              experimental_backgroundImage: 'linear-gradient(180deg, rgba(3, 5, 4, 0) 0%, rgba(3, 5, 4, 0.8) 26%, rgba(3, 5, 4, 0.92) 100%)',
            }}
          />

          {/* Title, over the one painted in the image */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: d(24),
              right: d(24),
              top: d(190),
              height: d(68),
              borderRadius: d(34),
              // Opaque enough in the middle to hide the title painted in the image.
              experimental_backgroundImage:
                'radial-gradient(ellipse at center, rgba(8, 12, 11, 1) 0%, rgba(8, 12, 11, 0.97) 62%, rgba(8, 12, 11, 0) 100%)',
            }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: d(202), alignItems: 'center' }}>
            <Text style={[styles.title, { fontSize: d(18), letterSpacing: d(18) * 0.06 }]}>CHOOSE YOUR LANGUAGE</Text>
            <Text style={[styles.subtitle, { fontSize: d(12), marginTop: d(3) }]}>Select a voice pack to install on the engine</Text>
          </View>

          {/* Selected language on the engine */}
          <View
            accessibilityLiveRegion="polite"
            style={{ position: 'absolute', left: d(132), top: d(263), width: d(132), height: d(132) }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: -d(10),
                top: -d(10),
                width: d(152),
                height: d(152),
                borderRadius: d(76),
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: 'rgba(110, 231, 183, 0.55)',
                transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: d(66),
                  boxShadow: '0 0 26px rgba(52, 211, 153, 0.9), 0 0 56px rgba(16, 185, 129, 0.5)',
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                },
              ]}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.engineFace,
                { borderRadius: d(66), boxShadow: 'inset 0 0 20px rgba(16, 185, 129, 0.42)' },
              ]}>
              <Text style={[styles.engineEyebrow, { fontSize: d(9), letterSpacing: d(9) * 0.2 }]}>SELECTED</Text>
              <Text style={[styles.engineCode, { fontSize: d(24), letterSpacing: d(24) * 0.03 }]}>{current.code}</Text>
              <Text style={[styles.engineName, { fontSize: d(12) }]}>{current.shortName}</Text>
              <Text style={[styles.engineSize, { fontSize: d(11) }]}>
                {current.installed ? 'Installed' : `${current.sizeMB} MB`}
              </Text>
            </View>
          </View>

          {/* Left caption */}
          <View pointerEvents="none" style={{ position: 'absolute', left: d(16), top: d(430), width: d(148) }}>
            <Text style={[styles.eyebrow, { fontSize: d(10), letterSpacing: d(10) * 0.18 }]}>
              {`${languages.length} LANGUAGES`}
            </Text>
            <Text style={[styles.caption, { fontSize: d(12), lineHeight: d(12) * 1.4, marginTop: d(6) }]}>
              Scroll the module rack to pick one. It installs once and runs offline.
            </Text>
          </View>

          {/* Module rack: the only scrolling part of the screen */}
          <View style={[styles.rack, { left: d(180), right: d(12), top: d(410), bottom: 98, borderRadius: d(16) }]}>
            <View style={styles.rackListWrap}>
              <ScrollView
                accessibilityRole="radiogroup"
                accessibilityLabel="Language"
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                onLayout={(e) => {
                  const visible = e.nativeEvent.layout.height;
                  setScroll((prev) => ({ ...prev, visible }));
                }}
                onContentSizeChange={(_, content) => setScroll((prev) => ({ ...prev, content }))}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 10, paddingBottom: 22, paddingLeft: 10, paddingRight: 6, gap: 8 }}>
                {rackOrder.map((lang) => {
                  const on = lang.id === picked;
                  return (
                    <TouchableOpacity
                      key={lang.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      activeOpacity={0.75}
                      onPress={() => setPicked(lang.id)}
                      style={[styles.tile, on ? styles.tileOn : styles.tileOff]}>
                      <Text style={styles.tileTitle} numberOfLines={1}>
                        {lang.code}
                        <Text style={{ color: C.mint }}> • </Text>
                        {lang.shortName}
                      </Text>
                      <Text style={styles.tileSize}>{lang.installed ? 'Installed' : `${lang.sizeMB} MB`}</Text>
                      <View style={styles.tileIcon}>
                        {on ? <CheckIcon size={16} color={C.mint} /> : <DownloadIcon size={16} color={C.mintLight} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 36,
                  experimental_backgroundImage: 'linear-gradient(180deg, rgba(7, 12, 10, 0) 0%, rgba(7, 12, 10, 0.98) 100%)',
                }}
              />
            </View>
            <View pointerEvents="none" style={styles.thumbColumn}>
              <View style={styles.thumbTrack}>
                <View
                  style={[
                    styles.thumb,
                    { height: `${thumbRatio * 100}%`, top: `${thumbPos * thumbTravel * 100}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Install / continue */}
          <View style={styles.buttonWrap}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={() => onInstall(current.id)}
              style={styles.primary}>
              {!current.installed && <DownloadIcon size={20} color={C.onPrimary} stroke={2.4} />}
              <Text style={styles.primaryText} numberOfLines={1}>
                {current.installed ? `Continue with ${current.name}` : `Install ${current.name} · ${current.sizeMB} MB`}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  title: { fontFamily: F.extrabold, color: C.text, textAlign: 'center' },
  subtitle: { fontFamily: F.regular, color: C.mintLight, textAlign: 'center' },
  engineFace: {
    borderWidth: 2,
    borderColor: C.mint,
    experimental_backgroundImage: 'radial-gradient(circle, #0E2A20 0%, #071510 70%)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  engineEyebrow: { fontFamily: F.bold, color: C.mintLight },
  engineCode: {
    fontFamily: F.extrabold,
    color: C.text,
    textShadowColor: 'rgba(52, 211, 153, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  engineName: { fontFamily: F.semibold, color: C.mintPale },
  engineSize: { fontFamily: F.regular, color: C.text2 },
  eyebrow: { fontFamily: F.bold, color: C.mintLight },
  caption: {
    fontFamily: F.regular,
    color: C.tag,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rack: {
    position: 'absolute',
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: C.mint,
    // Opaque: the image has a language list painted under the rack.
    backgroundColor: '#070C0A',
    boxShadow: '0 0 18px rgba(16, 185, 129, 0.35), 0 12px 30px rgba(0, 0, 0, 0.6)',
  },
  rackListWrap: { flex: 1, minWidth: 0 },
  tile: {
    height: 54,
    justifyContent: 'center',
    gap: 2,
    paddingLeft: 10,
    paddingRight: 30,
    borderRadius: 10,
    borderWidth: 1,
  },
  tileOn: {
    borderColor: C.mint,
    borderWidth: 2,
    experimental_backgroundImage: 'linear-gradient(180deg, #1F5A44 0%, #174433 100%)',
    boxShadow: '0 0 14px rgba(16, 185, 129, 0.6)',
  },
  tileOff: {
    borderColor: C.tileBorder,
    experimental_backgroundImage: 'linear-gradient(180deg, #2C3D37 0%, #1F2C27 100%)',
  },
  tileTitle: { fontFamily: F.bold, fontSize: 14, color: '#FFFFFF' },
  tileSize: { fontFamily: F.regular, fontSize: 11, color: C.text2 },
  tileIcon: { position: 'absolute', right: 8, top: 18 },
  thumbColumn: { width: 10, paddingTop: 12, paddingBottom: 12, paddingRight: 4 },
  thumbTrack: { flex: 1, width: 3, marginLeft: 2, borderRadius: 2, backgroundColor: '#17211E' },
  thumb: {
    position: 'absolute',
    left: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: C.mint,
    boxShadow: '0 0 8px #34D399',
  },
  buttonWrap: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  primary: {
    height: 58,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    experimental_backgroundImage: PRIMARY_GRADIENT,
    borderWidth: 1,
    borderColor: C.mintLight,
    boxShadow: '0 0 26px rgba(16, 185, 129, 0.65)',
  },
  primaryText: { fontFamily: F.extrabold, fontSize: 17, color: C.onPrimary, flexShrink: 1 },
});
