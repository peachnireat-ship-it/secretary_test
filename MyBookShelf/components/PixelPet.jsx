import { View, Animated, Text, StyleSheet } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { PIXEL_PETS, PIXEL_COSTUMES, ROOM_THEMES } from '../constants/pixelSprites';
import { COLOR_VARIANTS } from '../constants/spriteConfig';
// import { PET_VIDEO_CONFIG, PET_VIDEO_W, PET_VIDEO_H } from '../constants/petVideos';
// import PetVideo from './PetVideo';

const PIXEL = 5;
const ROOM_H = 140;

export default function PixelPet({ petType, stats = {}, actionTick = 0, actionEmoji = '🍖', actionType = 'eat', equipped = {}, bgTheme = 'classic', faceOnly = false, colorVariant = 'default' }) {
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

  const [isActing, setIsActing] = useState(false);
  const [useEatFrame, setUseEatFrame] = useState(false);
  const actionBounce = useRef(new Animated.Value(0)).current;
  const itemY = useRef(new Animated.Value(-28)).current;
  const itemOpacity = useRef(new Animated.Value(0)).current;
  const effectY = useRef(new Animated.Value(0)).current;
  const effectOpacity = useRef(new Animated.Value(0)).current;
  const cleanShakeX = useRef(new Animated.Value(0)).current;
  const actionFrameTimer = useRef(null);
  const actionAnim = useRef(null);

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
  const mode = isActing
    ? (actionType === 'play' ? 'walk' : 'idle')
    : (minStat < 20 ? 'sleep' : minStat < 40 ? 'idle' : 'walk');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      animRef.current?.stop?.();
      bounceAnim.current?.stop?.();
      actionAnim.current?.stop?.();
      clearTimeout(timerRef.current);
      clearInterval(actionFrameTimer.current);
    };
  }, []);

  // 아이템 사용 애니메이션: eat(먹기) / play(장난감) / clean(청결)
  useEffect(() => {
    if (actionTick === 0) return;
    actionAnim.current?.stop?.();
    clearInterval(actionFrameTimer.current);
    setIsActing(true);
    setUseEatFrame(false);
    actionBounce.setValue(0);
    itemY.setValue(-28);
    itemOpacity.setValue(0);
    effectY.setValue(0);
    effectOpacity.setValue(0);
    cleanShakeX.setValue(0);

    if (actionType === 'eat') {
      // idle ↔ eat 프레임 토글 (150ms)
      let toggle = false;
      actionFrameTimer.current = setInterval(() => {
        toggle = !toggle;
        if (mountedRef.current) setUseEatFrame(toggle);
      }, 150);

      actionAnim.current = Animated.sequence([
        Animated.parallel([
          Animated.timing(itemY,      { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(itemOpacity,{ toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(actionBounce, { toValue: -6, duration: 100, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -6, duration: 100, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -5, duration: 90,  useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:  0, duration: 80,  useNativeDriver: true }),
        ]),
        Animated.timing(itemOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(effectOpacity, { toValue: 1,   duration: 120, useNativeDriver: true }),
          Animated.timing(effectY,       { toValue: -36, duration: 580, useNativeDriver: true }),
        ]),
        Animated.timing(effectOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
      actionAnim.current.start(() => {
        clearInterval(actionFrameTimer.current);
        if (mountedRef.current) { setIsActing(false); setUseEatFrame(false); }
      });

    } else if (actionType === 'play') {
      // 아이템 등장 → 신나는 점프 5회 → 별 상승
      actionAnim.current = Animated.sequence([
        Animated.parallel([
          Animated.timing(itemY,      { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(itemOpacity,{ toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(actionBounce, { toValue: -14, duration: 90, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:   0, duration: 70, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -14, duration: 90, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:   0, duration: 70, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -12, duration: 80, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:   0, duration: 70, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -12, duration: 80, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:   0, duration: 70, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue: -10, duration: 80, useNativeDriver: true }),
          Animated.timing(actionBounce, { toValue:   0, duration: 70, useNativeDriver: true }),
        ]),
        Animated.timing(itemOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(effectOpacity, { toValue: 1,   duration: 100, useNativeDriver: true }),
          Animated.timing(effectY,       { toValue: -40, duration: 600, useNativeDriver: true }),
        ]),
        Animated.timing(effectOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
      actionAnim.current.start(() => {
        if (mountedRef.current) setIsActing(false);
      });

    } else if (actionType === 'clean') {
      // 아이템 등장 → 좌우 흔들기 → 반짝이 상승
      actionAnim.current = Animated.sequence([
        Animated.parallel([
          Animated.timing(itemY,      { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(itemOpacity,{ toValue: 1, duration: 150, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(cleanShakeX, { toValue:  6, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue:  6, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue: -6, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue:  4, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue: -4, duration: 60, useNativeDriver: true }),
          Animated.timing(cleanShakeX, { toValue:  0, duration: 60, useNativeDriver: true }),
        ]),
        Animated.timing(itemOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(effectOpacity, { toValue: 1,   duration: 100, useNativeDriver: true }),
          Animated.timing(effectY,       { toValue: -38, duration: 550, useNativeDriver: true }),
        ]),
        Animated.timing(effectOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]);
      actionAnim.current.start(() => {
        if (mountedRef.current) { setIsActing(false); cleanShakeX.setValue(0); }
      });
    }
  }, [actionTick]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const frameIdx = mode === 'sleep' ? 2 : (isActing && actionType === 'eat' && useEatFrame) ? 3 : mode === 'idle' ? 0 : frame;
  const frameData = sprite.frames[Math.min(frameIdx, sprite.frames.length - 1)];
  const variantDef = COLOR_VARIANTS[petType]?.find(v => v.id === colorVariant);
  const palette = variantDef?.palette ?? sprite.palette;

  const isFish = petType === 'fish';
  const theme  = ROOM_THEMES[bgTheme] ?? ROOM_THEMES.classic;

  if (faceOnly) {
    const idleFrame = sprite.frames[0];
    return (
      <View>
        {idleFrame.slice(0, 7).map((row, ri) => (
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
      </View>
    );
  }

  return (
    <View style={[styles.room, isFish ? styles.tankBg : { backgroundColor: theme.bg }]} onLayout={onLayout}>
      {/* Decorations */}
      {!isFish && <View style={[styles.floorLine, { backgroundColor: theme.floor }]} />}
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
              { translateY: isActing ? actionBounce : bounce },
              { translateX: cleanShakeX },
              { scaleX: facingRight ? 1 : -1 },
            ],
          },
        ]}
      >
        {/* 픽셀 코스튬 오버레이 */}
        {['hat', 'clothes', 'accessory'].map(slot => {
          const item = equipped[slot];
          if (!item?.id) return null;
          const costume = PIXEL_COSTUMES[item.id];
          if (!costume) return null;
          const left = Math.floor((sprite.cols - costume.cols) / 2) * PIXEL;
          const top = costume.offsetY * PIXEL;
          return (
            <View key={slot} style={{ position: 'absolute', top, left }}>
              {costume.pixels.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row' }}>
                  {row.map((colorIdx, ci) => (
                    <View
                      key={ci}
                      style={{
                        width: PIXEL,
                        height: PIXEL,
                        backgroundColor: colorIdx === 0 ? 'transparent' : costume.palette[colorIdx],
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        {isActing && (
          <Animated.Text
            style={{
              position: 'absolute',
              top: -26,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 18,
              transform: [{ translateY: itemY }, { scaleX: facingRight ? 1 : -1 }],
              opacity: itemOpacity,
            }}
          >
            {actionEmoji}
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
            transform: [{ translateY: effectY }, { scaleX: facingRight ? 1 : -1 }],
            opacity: effectOpacity,
          }}
        >
          {actionType === 'play' ? '⭐' : actionType === 'clean' ? '✨' : '💕'}
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
  pixelRow: {
    flexDirection: 'row',
  },
});
