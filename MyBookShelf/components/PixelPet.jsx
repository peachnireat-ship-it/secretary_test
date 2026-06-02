import { View, Animated, Text, StyleSheet } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { PIXEL_PETS } from '../constants/pixelSprites';
// import { PET_VIDEO_CONFIG, PET_VIDEO_W, PET_VIDEO_H } from '../constants/petVideos';
// import PetVideo from './PetVideo';

const PIXEL = 5;
const ROOM_H = 140;

export default function PixelPet({ petType, stats = {}, eatTick = 0, eatEmoji = '🍖', equipped = {} }) {
  const [roomWidth, setRoomWidth] = useState(0);
  const posX = useRef(new Animated.Value(8)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const [frame, setFrame] = useState(0);
  const [facingRight, setFacingRight] = useState(true);
  const mountedRef = useRef(true);
  const currentXRef = useRef(8);
  const animRef = useRef(null);
  const timerRef = useRef(null);
  const bounceAnim = useRef(null);

  const [isEating, setIsEating] = useState(false);
  const [useEatFrame, setUseEatFrame] = useState(false);
  const eatBounce = useRef(new Animated.Value(0)).current;
  const foodY = useRef(new Animated.Value(-28)).current;
  const foodOpacity = useRef(new Animated.Value(0)).current;
  const heartY = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const eatFrameTimer = useRef(null);

  // const videoCfg = PET_VIDEO_CONFIG[petType];
  // const isVideoMode = !!(videoCfg?.enabled && videoCfg?.sources);
  const isVideoMode = false;
  const sprite = PIXEL_PETS[petType] ?? PIXEL_PETS.cat;
  const petW = sprite.cols * PIXEL;
  const petH = sprite.rows * PIXEL;

  const minStat = Math.min(
    stats.hunger ?? 100,
    stats.happiness ?? 100,
    stats.cleanliness ?? 100
  );
  const mode = isEating ? 'idle' : (minStat < 20 ? 'sleep' : minStat < 40 ? 'idle' : 'walk');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      animRef.current?.stop?.();
      bounceAnim.current?.stop?.();
      clearTimeout(timerRef.current);
      clearInterval(eatFrameTimer.current);
    };
  }, []);

  // 먹기 애니메이션: 음식 낙하 → 씹기(eat 프레임 토글) → 하트 상승
  useEffect(() => {
    if (eatTick === 0) return;
    setIsEating(true);
    setUseEatFrame(false);
    eatBounce.setValue(0);
    foodY.setValue(-28);
    foodOpacity.setValue(0);
    heartY.setValue(0);
    heartOpacity.setValue(0);

    // 씹기 프레임: idle(0) ↔ eat(3) 150ms 간격으로 토글
    let toggle = false;
    eatFrameTimer.current = setInterval(() => {
      toggle = !toggle;
      if (mountedRef.current) setUseEatFrame(toggle);
    }, 150);

    Animated.sequence([
      // ① 음식 이모지 낙하
      Animated.parallel([
        Animated.timing(foodY,       { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(foodOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      // ② 씹는 바운스 (3회)
      Animated.sequence([
        Animated.timing(eatBounce, { toValue: -6, duration: 100, useNativeDriver: true }),
        Animated.timing(eatBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
        Animated.timing(eatBounce, { toValue: -6, duration: 100, useNativeDriver: true }),
        Animated.timing(eatBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
        Animated.timing(eatBounce, { toValue: -5, duration: 90,  useNativeDriver: true }),
        Animated.timing(eatBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
      ]),
      // ③ 음식 페이드 아웃
      Animated.timing(foodOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      // ④ 하트 위로 둥실
      Animated.parallel([
        Animated.timing(heartOpacity, { toValue: 1,   duration: 120, useNativeDriver: true }),
        Animated.timing(heartY,       { toValue: -36, duration: 580, useNativeDriver: true }),
      ]),
      Animated.timing(heartOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      clearInterval(eatFrameTimer.current);
      if (mountedRef.current) {
        setIsEating(false);
        setUseEatFrame(false);
      }
    });
  }, [eatTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame switching
  useEffect(() => {
    if (mode === 'sleep') { setFrame(2); return; }
    setFrame(0);
    const iv = setInterval(() => {
      if (mountedRef.current) setFrame(f => f === 0 ? 1 : 0);
    }, 380);
    return () => clearInterval(iv);
  }, [mode]);

  // Bounce animation helper
  const startBounce = useCallback(() => {
    bounceAnim.current?.stop?.();
    bounceAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -4, duration: 200, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 200, useNativeDriver: true }),
      ])
    );
    bounceAnim.current.start();
  }, [bounce]);

  // Movement
  useEffect(() => {
    if (roomWidth === 0) return;
    const maxX = Math.max(8, roomWidth - petW - 8);

    animRef.current?.stop?.();
    bounceAnim.current?.stop?.();
    clearTimeout(timerRef.current);
    bounce.setValue(0);

    if (mode === 'sleep') {
      posX.setValue(maxX / 2);
      return;
    }

    if (mode === 'idle') {
      startBounce();
      return;
    }

    startBounce();

    const doWalk = (toRight) => {
      if (!mountedRef.current) return;
      setFacingRight(toRight);
      const target = toRight ? maxX : 8;
      const dist = Math.abs(target - currentXRef.current);
      const duration = Math.max(1200, dist * 14);

      animRef.current = Animated.timing(posX, {
        toValue: target,
        duration,
        useNativeDriver: true,
      });
      animRef.current.start(({ finished }) => {
        if (!finished || !mountedRef.current) return;
        currentXRef.current = target;
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) doWalk(!toRight);
        }, 500 + Math.random() * 400);
      });
    };

    doWalk(true);
  }, [mode, roomWidth]);

  const onLayout = useCallback((e) => {
    setRoomWidth(e.nativeEvent.layout.width);
  }, []);

  const frameIdx = mode === 'sleep' ? 2 : isEating && useEatFrame ? 3 : mode === 'idle' ? 0 : frame;
  const frameData = sprite.frames[Math.min(frameIdx, sprite.frames.length - 1)];
  const palette = sprite.palette;

  const isFish = petType === 'fish';

  return (
    <View style={[styles.room, isFish && styles.tankBg]} onLayout={onLayout}>
      {/* Decorations */}
      {!isFish && <View style={styles.floorLine} />}
      {isFish && (
        <>
          <View style={styles.waterLine1} />
          <View style={styles.waterLine2} />
        </>
      )}

      {/* Sleep bubble */}
      {mode === 'sleep' && (
        <Animated.View
          style={[styles.zzz, { transform: [{ translateX: posX }] }]}
        >
          <Text style={styles.zzzText}>💤</Text>
        </Animated.View>
      )}

      {/* Pet sprite */}
      <Animated.View
        style={[
          styles.petAnchor,
          {
            bottom: isFish ? ROOM_H / 2 - petH / 2 : 12,
            transform: [
              { translateX: posX },
              { translateY: isEating ? eatBounce : bounce },
              { scaleX: facingRight ? 1 : -1 },
            ],
          },
        ]}
      >
        {/* 코스튬 오버레이 — scaleX 방향 반전 보정 */}
        {equipped.hat?.emoji ? (
          <Text style={[styles.costumeOverlay, { top: -18, fontSize: 14,
            transform: [{ scaleX: facingRight ? 1 : -1 }] }]}>
            {equipped.hat.emoji}
          </Text>
        ) : null}
        {equipped.clothes?.emoji ? (
          <Text style={[styles.costumeOverlay, { bottom: 0, fontSize: 12,
            transform: [{ scaleX: facingRight ? 1 : -1 }] }]}>
            {equipped.clothes.emoji}
          </Text>
        ) : null}
        {equipped.accessory?.emoji ? (
          <Text style={[styles.costumeOverlay, { top: Math.round(petH * 0.3), right: -8, left: 'auto', fontSize: 11,
            transform: [{ scaleX: facingRight ? 1 : -1 }] }]}>
            {equipped.accessory.emoji}
          </Text>
        ) : null}

        {isEating && (
          <Animated.Text
            style={{
              position: 'absolute',
              top: -26,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 18,
              transform: [{ translateY: foodY }, { scaleX: facingRight ? 1 : -1 }],
              opacity: foodOpacity,
            }}
          >
            {eatEmoji}
          </Animated.Text>
        )}
        <Animated.Text
          style={{
            position: 'absolute',
            top: -28,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 13,
            transform: [{ translateY: heartY }, { scaleX: facingRight ? 1 : -1 }],
            opacity: heartOpacity,
          }}
        >
          💕
        </Animated.Text>
        {(frameData ?? []).map((row, ri) => (
          <View key={ri} style={styles.pixelRow}>
            {row.map((colorIdx, ci) => (
              <View
                key={ci}
                style={{
                  width: PIXEL,
                  height: PIXEL,
                  backgroundColor: colorIdx === 0 ? 'transparent' : palette[colorIdx],
                }}
              />
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    width: '100%',
    height: ROOM_H,
    backgroundColor: '#FFF8F0',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  tankBg: {
    backgroundColor: '#D8EEF8',
  },
  floorLine: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#E8D5C0',
    borderRadius: 3,
  },
  waterLine1: {
    position: 'absolute',
    top: 20,
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: 'rgba(100,180,230,0.3)',
    borderRadius: 1,
  },
  waterLine2: {
    position: 'absolute',
    top: 40,
    left: 30,
    right: 30,
    height: 2,
    backgroundColor: 'rgba(100,180,230,0.25)',
    borderRadius: 1,
  },
  zzz: {
    position: 'absolute',
    bottom: 90,
  },
  zzzText: {
    fontSize: 18,
  },
  petAnchor: {
    position: 'absolute',
  },
  costumeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  pixelRow: {
    flexDirection: 'row',
  },
});
