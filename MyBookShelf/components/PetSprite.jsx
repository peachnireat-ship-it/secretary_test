import { View, Animated, Text, StyleSheet } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { SPRITE_DATA, ANIM_CONFIG, PIXEL_COSTUMES, EXPR_OVERLAYS, ROOM_THEMES, COLOR_VARIANTS } from '../constants/spriteConfig';
import { PIXEL_PETS } from '../constants/pixelSprites';

const PIXEL = 5;
const ROOM_H = 160;

// Resolve a single frame grid from named or indexed sprite data
function resolveFrame(spriteData, frameKey) {
  if (spriteData.frames && !Array.isArray(spriteData.frames)) {
    // New named-frame format
    return spriteData.frames[frameKey] ?? spriteData.frames.idle;
  }
  // Legacy array format (dog, rabbit, etc.)
  const idx = { idle: 0, walk_a: 1, walk_b: 1, sleeping: 2, eating: 3 }[frameKey] ?? 0;
  return spriteData.frames[Math.min(idx, spriteData.frames.length - 1)];
}

export default function PetSprite({
  petType = 'cat',
  animState = 'idle',     // idle | walking | sleeping | eating | happy | sad | surprised | angry | excited
  equipped = {},          // { hat, clothes, accessory } — each is a COSMETIC_ITEMS entry or null
  actionTick = 0,         // increment to trigger action animation overlay
  actionEmoji = '🍖',
  actionType = 'eat',     // eat | play | clean
  bgTheme = 'classic',    // room background theme id
  colorVariant = 'default', // color variant id
}) {
  const [roomWidth, setRoomWidth] = useState(0);
  const [frameKey, setFrameKey]   = useState('idle');

  // Movement
  const posX         = useRef(new Animated.Value(8)).current;
  const currentXRef  = useRef(8);
  const [facingRight, setFacingRight] = useState(true);
  const mountedRef   = useRef(true);
  const moveAnim     = useRef(null);
  const moveTimer    = useRef(null);

  // Breathing / bounce
  const bounce       = useRef(new Animated.Value(0)).current;
  const bounceLoop   = useRef(null);

  // Action overlay
  const actionBounce = useRef(new Animated.Value(0)).current;
  const itemY        = useRef(new Animated.Value(-28)).current;
  const itemOpacity  = useRef(new Animated.Value(0)).current;
  const effectY      = useRef(new Animated.Value(0)).current;
  const effectOpacity= useRef(new Animated.Value(0)).current;
  const shakeX       = useRef(new Animated.Value(0)).current;
  const actionAnim   = useRef(null);
  const [showAction, setShowAction] = useState(false);

  // Animation frame cycling
  const frameTimerRef = useRef(null);
  const frameIdxRef   = useRef(0);

  // Resolve sprite data: new system for cat, legacy for others
  const newSprite  = SPRITE_DATA[petType];
  const legacySprite = PIXEL_PETS[petType] ?? PIXEL_PETS.cat;
  const sprite     = newSprite ?? legacySprite;
  const petW       = sprite.cols * PIXEL;
  const petH       = sprite.rows * PIXEL;
  const variantDef = COLOR_VARIANTS[petType]?.find(v => v.id === colorVariant);
  const palette    = variantDef?.palette ?? sprite.palette;
  const isFish     = petType === 'fish';

  // Room theme
  const theme = ROOM_THEMES[bgTheme] ?? ROOM_THEMES.classic;

  // Expression overlay particles for current animState
  const exprParticles = showAction ? [] : (EXPR_OVERLAYS[animState]?.particles ?? []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      moveAnim.current?.stop?.();
      bounceLoop.current?.stop?.();
      actionAnim.current?.stop?.();
      clearTimeout(moveTimer.current);
      clearInterval(frameTimerRef.current);
    };
  }, []);

  // ── Frame cycling ──────────────────────────────────────────────
  useEffect(() => {
    clearInterval(frameTimerRef.current);
    frameIdxRef.current = 0;

    if (newSprite) {
      const cfg = ANIM_CONFIG[animState] ?? ANIM_CONFIG.idle;
      setFrameKey(cfg.seq[0]);
      if (cfg.seq.length > 1) {
        frameTimerRef.current = setInterval(() => {
          if (!mountedRef.current) return;
          frameIdxRef.current = (frameIdxRef.current + 1) % cfg.seq.length;
          setFrameKey(cfg.seq[frameIdxRef.current]);
        }, cfg.ms);
      }
    } else {
      // Legacy: use numeric frame index
      const legacyMap = { idle: 0, walking: 1, sleeping: 2, eating: 3, happy: 0, sad: 0, surprised: 0, angry: 0, excited: 0 };
      setFrameKey(legacyMap[animState] ?? 0);
      if (animState !== 'sleeping') {
        frameTimerRef.current = setInterval(() => {
          if (!mountedRef.current) return;
          setFrameKey(k => (k === 0 ? 1 : 0));
        }, animState === 'eating' ? 150 : 380);
      }
    }
  }, [animState, newSprite]);

  // ── Breathing bounce ──────────────────────────────────────────
  const startBounce = useCallback(() => {
    bounceLoop.current?.stop?.();
    const amplitude = (animState === 'happy' || animState === 'excited') ? 6 : animState === 'sad' ? 2 : animState === 'angry' ? 3 : 4;
    const speed     = (animState === 'happy' || animState === 'excited') ? 160 : 220;
    bounceLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -amplitude, duration: speed, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0,          duration: speed, useNativeDriver: true }),
      ])
    );
    bounceLoop.current.start();
  }, [animState, bounce]);

  // ── Movement ─────────────────────────────────────────────────
  useEffect(() => {
    if (roomWidth === 0) return;
    const maxX = Math.max(8, roomWidth - petW - 8);

    moveAnim.current?.stop?.();
    bounceLoop.current?.stop?.();
    clearTimeout(moveTimer.current);
    bounce.setValue(0);

    if (animState === 'sleeping' || animState === 'eating') {
      if (animState === 'sleeping') posX.setValue(maxX / 2);
      return;
    }

    startBounce();

    if (animState === 'sad' || animState === 'angry') return; // stays put

    const walk = (toRight) => {
      if (!mountedRef.current) return;
      setFacingRight(toRight);
      const target   = toRight ? maxX : 8;
      const dist     = Math.abs(target - currentXRef.current);
      const duration = Math.max(1400, dist * 15);

      moveAnim.current = Animated.timing(posX, { toValue: target, duration, useNativeDriver: true });
      moveAnim.current.start(({ finished }) => {
        if (!finished || !mountedRef.current) return;
        currentXRef.current = target;
        moveTimer.current = setTimeout(() => {
          if (mountedRef.current) walk(!toRight);
        }, 400 + Math.random() * 600);
      });
    };
    walk(true);
  }, [animState, roomWidth]);

  // ── Action overlay animation ──────────────────────────────────
  useEffect(() => {
    if (actionTick === 0) return;
    actionAnim.current?.stop?.();
    setShowAction(true);
    actionBounce.setValue(0);
    itemY.setValue(-28);
    itemOpacity.setValue(0);
    effectY.setValue(0);
    effectOpacity.setValue(0);
    shakeX.setValue(0);

    const bounceSeq = (n, h) =>
      Array.from({ length: n * 2 }, (_, i) =>
        Animated.timing(actionBounce, {
          toValue: i % 2 === 0 ? -h : 0,
          duration: i % 2 === 0 ? 90 : 75,
          useNativeDriver: true,
        })
      );

    const itemAppear = Animated.parallel([
      Animated.timing(itemY,      { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(itemOpacity,{ toValue: 1, duration: 200, useNativeDriver: true }),
    ]);
    const effectRise = Animated.parallel([
      Animated.timing(effectOpacity, { toValue: 1,   duration: 120, useNativeDriver: true }),
      Animated.timing(effectY,       { toValue: -40, duration: 600, useNativeDriver: true }),
    ]);
    const effectFade = Animated.timing(effectOpacity, { toValue: 0, duration: 200, useNativeDriver: true });
    const itemFade   = Animated.timing(itemOpacity,   { toValue: 0, duration: 180, useNativeDriver: true });

    let seq;
    if (actionType === 'eat') {
      seq = Animated.sequence([
        itemAppear,
        Animated.sequence(bounceSeq(3, 6)),
        itemFade, effectRise, effectFade,
      ]);
    } else if (actionType === 'play') {
      seq = Animated.sequence([
        itemAppear,
        Animated.sequence(bounceSeq(5, 14)),
        itemFade, effectRise, effectFade,
      ]);
    } else {
      // clean — shake
      const shakeSeq = [6, -6, 6, -6, 4, -4, 0].map(v =>
        Animated.timing(shakeX, { toValue: v, duration: 60, useNativeDriver: true })
      );
      seq = Animated.sequence([
        itemAppear,
        Animated.sequence(shakeSeq),
        itemFade, effectRise, effectFade,
      ]);
    }

    actionAnim.current = seq;
    seq.start(() => {
      if (mountedRef.current) setShowAction(false);
    });
  }, [actionTick]);

  const onLayout = useCallback((e) => setRoomWidth(e.nativeEvent.layout.width), []);

  // Resolve frame grid to render
  const frameGrid = newSprite
    ? resolveFrame(sprite, frameKey)
    : (() => {
        const idx = typeof frameKey === 'number'
          ? frameKey
          : { idle: 0, walk_a: 1, walk_b: 1, sleeping: 2, eating: 3 }[frameKey] ?? 0;
        return sprite.frames[Math.min(idx, sprite.frames.length - 1)];
      })();

  const effectEmoji =
    actionType === 'play' ? '⭐' : actionType === 'clean' ? '✨' : '💕';

  return (
    <View
      style={[styles.room, isFish ? styles.tankBg : { backgroundColor: theme.bg }]}
      onLayout={onLayout}
    >
      {/* Floor / water decoration */}
      {!isFish && <View style={[styles.floorLine, { backgroundColor: theme.floor }]} />}
      {isFish && (
        <>
          <View style={styles.waterLine1} />
          <View style={styles.waterLine2} />
        </>
      )}

      {/* Sleep Zzz */}
      {animState === 'sleeping' && (
        <Animated.View style={[styles.zzz, { transform: [{ translateX: posX }] }]}>
          <Text style={styles.zzzText}>💤</Text>
        </Animated.View>
      )}

      {/* Pet anchor */}
      <Animated.View
        style={[
          styles.petAnchor,
          {
            bottom: isFish ? ROOM_H / 2 - petH / 2 : 14,
            transform: [
              { translateX: posX },
              { translateY: showAction ? actionBounce : bounce },
              { translateX: shakeX },
              { scaleX: facingRight ? 1 : -1 },
            ],
          },
        ]}
      >
        {/* ── 1. 기본 스프라이트 픽셀 (하단 레이어) ── */}
        {(frameGrid ?? []).map((row, ri) => (
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

        {/* ── 2. 코스튬 레이어 (스프라이트 위) ── */}
        {['hat', 'clothes', 'accessory'].map(slot => {
          const item = equipped[slot];
          if (!item?.id) return null;
          const costume = PIXEL_COSTUMES[item.id];
          if (!costume) return null;
          const left = Math.floor((sprite.cols - costume.cols) / 2) * PIXEL;
          const top  = costume.offsetY * PIXEL;
          return (
            <View key={slot} style={{ position: 'absolute', top, left, zIndex: 2 }}>
              {costume.pixels.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row' }}>
                  {row.map((ci, col) => (
                    <View
                      key={col}
                      style={{
                        width: PIXEL,
                        height: PIXEL,
                        backgroundColor: ci === 0 ? 'transparent' : costume.palette[ci],
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        {/* ── 3. 표정 오버레이 (코스튬 위, 아이템 연출 시 숨김) ── */}
        {exprParticles.map((p, i) => (
          <View key={i} style={{ position: 'absolute', top: p.dy, left: p.dx, zIndex: 3 }}>
            {p.pixels.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map((ci, col) => (
                  <View
                    key={col}
                    style={{
                      width: PIXEL,
                      height: PIXEL,
                      backgroundColor: ci === 0 ? 'transparent' : p.palette[ci],
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        ))}

        {/* ── 4. 아이템 연출 오버레이 (최상단) ── */}
        {showAction && (
          <Animated.Text
            style={[
              styles.floatEmoji,
              { transform: [{ translateY: itemY }, { scaleX: facingRight ? 1 : -1 }], opacity: itemOpacity, zIndex: 4 },
            ]}
          >
            {actionEmoji}
          </Animated.Text>
        )}

        {/* ── 5. 이펙트 (하트/별/반짝이 상승) ── */}
        <Animated.Text
          style={[
            styles.effectEmoji,
            { transform: [{ translateY: effectY }, { scaleX: facingRight ? 1 : -1 }], opacity: effectOpacity, zIndex: 5 },
          ]}
        >
          {effectEmoji}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    width: '100%',
    height: ROOM_H,
    backgroundColor: '#FFF8F0',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  tankBg: { backgroundColor: '#D8EEF8' },
  floorLine: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#E8D5C0',
    borderRadius: 4,
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
    top: 42,
    left: 30,
    right: 30,
    height: 2,
    backgroundColor: 'rgba(100,180,230,0.22)',
    borderRadius: 1,
  },
  zzz: {
    position: 'absolute',
    bottom: ROOM_H - 40,
  },
  zzzText: { fontSize: 18 },
  emotionCloud: {
    position: 'absolute',
    top: 10,
  },
  emotionText: { fontSize: 20 },
  petAnchor: { position: 'absolute' },
  pixelRow: { flexDirection: 'row' },
  floatEmoji: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
  },
  effectEmoji: {
    position: 'absolute',
    top: -28,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
  },
});
