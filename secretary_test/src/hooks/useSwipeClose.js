import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * Bottom Sheet 모달 드래그-닫기 공통 훅.
 * 핸들을 아래로 dy > 80px 이상 드래그하거나, vy > 0.8(빠른 스와이프, dy > 10) 시 onClose 호출.
 * @param {() => void} onClose 닫기 콜백
 * @returns {{ panHandlers: object, animStyle: object }}
 */
export function useSwipeClose(onClose) {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 2,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || (gs.vy > 0.8 && gs.dy > 10)) {
          Animated.timing(translateY, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;
  return { panHandlers: panResponder.panHandlers, animStyle: { transform: [{ translateY }] } };
}
