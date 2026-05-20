import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { onXpGain } from '../database/xpEvents';

export default function XpGainToast() {
  const [amount, setAmount] = useState(0);
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const pendingRef = useRef(0);
  const timerRef = useRef(null);

  const triggerAnim = (xp) => {
    opacity.stopAnimation();
    translateY.stopAnimation();
    setAmount(xp);
    setVisible(true);
    opacity.setValue(1);
    translateY.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 700,
        delay: 800,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -90,
        duration: 1500,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  };

  useEffect(() => {
    const unsub = onXpGain((xp) => {
      if (xp <= 0) return;
      pendingRef.current += xp;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const total = pendingRef.current;
        pendingRef.current = 0;
        triggerAnim(total);
      }, 50);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.Text
        style={[styles.text, { opacity, transform: [{ translateY }] }]}
      >
        +{amount} XP ↑
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    color: '#FFD700',
    fontSize: 30,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
});
