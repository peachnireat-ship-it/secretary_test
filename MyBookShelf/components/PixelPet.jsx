import { View, Animated, Text, StyleSheet } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { PIXEL_PETS } from '../constants/pixelSprites';

const PIXEL = 5;
const ROOM_H = 140;

export default function PixelPet({ petType, stats = {} }) {
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

  const sprite = PIXEL_PETS[petType] ?? PIXEL_PETS.cat;
  const petW = sprite.cols * PIXEL;
  const petH = sprite.rows * PIXEL;

  const minStat = Math.min(
    stats.hunger ?? 100,
    stats.happiness ?? 100,
    stats.cleanliness ?? 100
  );
  const mode = minStat < 20 ? 'sleep' : minStat < 40 ? 'idle' : 'walk';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      animRef.current?.stop?.();
      bounceAnim.current?.stop?.();
      clearTimeout(timerRef.current);
    };
  }, []);

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

  const frameData = sprite.frames[Math.min(frame, sprite.frames.length - 1)];
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
              { translateY: bounce },
              { scaleX: facingRight ? 1 : -1 },
            ],
          },
        ]}
      >
        {frameData.map((row, ri) => (
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
