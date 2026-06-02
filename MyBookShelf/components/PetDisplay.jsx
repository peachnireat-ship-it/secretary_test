import { useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import PetVideo from './PetVideo';
import { PET_TYPES } from '../constants/petItems';

function useTickAnim(tick, buildSeq) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (tick === 0) return;
    buildSeq(anim).start();
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return anim;
}

function buildEatSeq(anim) {
  return Animated.sequence([
    Animated.timing(anim, { toValue: -14, duration: 140, useNativeDriver: true }),
    Animated.timing(anim, { toValue:   4, duration: 100, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -10, duration: 110, useNativeDriver: true }),
    Animated.timing(anim, { toValue:   2, duration: 100, useNativeDriver: true }),
    Animated.timing(anim, { toValue:   0, duration: 100, useNativeDriver: true }),
  ]);
}

function buildHappySeq(anim) {
  return Animated.sequence([
    Animated.timing(anim, { toValue:  1, duration: 80, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -1, duration: 80, useNativeDriver: true }),
    Animated.timing(anim, { toValue:  1, duration: 80, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -1, duration: 80, useNativeDriver: true }),
    Animated.timing(anim, { toValue:  0, duration: 80, useNativeDriver: true }),
  ]);
}

/**
 * PetDisplay
 *
 * 레이어 구조 (Android SurfaceView 위에 JS 뷰를 올리는 방법):
 *   1. 비디오 레이어  — Animated.View (절대 위치)
 *   2. 코스튬 레이어 — 형제 Animated.View (절대 위치, renderToHardwareTextureAndroid)
 *      → 하드웨어 합성을 강제해 SurfaceView 위에 렌더되도록 함
 */
export default function PetDisplay({
  videoUrl,
  petType,
  eatTick   = 0,
  happyTick = 0,
  equipped  = {},
  width     = 160,
  height    = 160,
}) {
  const translateY = useTickAnim(eatTick,   buildEatSeq);
  const rotateVal  = useTickAnim(happyTick, buildHappySeq);

  const rotateStr = rotateVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const animStyle = { transform: [{ translateY }, { rotate: rotateStr }] };

  const fallbackEmoji = PET_TYPES.find(p => p.id === petType)?.emoji ?? '🐾';
  const hatSize = Math.round(width * 0.28);
  const bodySize = Math.round(width * 0.22);
  const accSize  = Math.round(width * 0.20);

  return (
    <View style={{ width, height }}>

      {/* ── 레이어 1: 비디오 (또는 이모지 fallback) ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, animStyle]}>
        {videoUrl ? (
          <PetVideo
            sources={{ idle: videoUrl }}
            mode="idle"
            width={width}
            height={height}
          />
        ) : (
          <Text style={[styles.centerText, { fontSize: Math.round(height * 0.55), lineHeight: height }]}>
            {fallbackEmoji}
          </Text>
        )}
      </Animated.View>

      {/* ── 레이어 2: 코스튬 오버레이 ──
            형제 View로 분리 + renderToHardwareTextureAndroid 로
            Android SurfaceView 위에 강제 합성            */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, animStyle]}
        renderToHardwareTextureAndroid
        collapsable={false}
        pointerEvents="none"
      >
        {equipped.hat?.emoji ? (
          <Text style={[styles.overlayCenter, { top: Math.round(height * 0.01), fontSize: hatSize }]}>
            {equipped.hat.emoji}
          </Text>
        ) : null}

        {equipped.clothes?.emoji ? (
          <Text style={[styles.overlayCenter, { bottom: Math.round(height * 0.06), fontSize: bodySize }]}>
            {equipped.clothes.emoji}
          </Text>
        ) : null}

        {equipped.accessory?.emoji ? (
          <Text style={[styles.overlayRight, {
            top:   Math.round(height * 0.38),
            right: Math.round(width  * 0.04),
            fontSize: accSize,
          }]}>
            {equipped.accessory.emoji}
          </Text>
        ) : null}
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  centerText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
  },
  overlayCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  overlayRight: {
    position: 'absolute',
  },
});
