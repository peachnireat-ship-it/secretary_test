import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

const PAN_START_THRESHOLD = 2;
const SWIPE_CLOSE_DY = 80;
const SWIPE_CLOSE_VELOCITY = 0.8;
const SWIPE_CLOSE_MIN_DY = 10;
const CLOSE_ANIM_TARGET_Y = 600;
const CLOSE_ANIM_DURATION_MS = 220;
const SPRING_BACK_BOUNCINESS = 4;

/**
 * Bottom Sheet 모달 드래그-닫기 공통 훅.
 * 핸들을 아래로 dy > 80px 이상 드래그하거나, vy > 0.8(빠른 스와이프, dy > 10) 시 onClose 호출.
 * @param {() => void} onClose 닫기 콜백
 * @returns {{ panHandlers: object, animStyle: object }}
 */
export function useSwipeClose(onClose) {
  // eslint-disable-next-line react-hooks/refs -- Animated.Value는 최초 렌더에서 한 번만 생성되는 안전한 패턴
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    // eslint-disable-next-line react-hooks/refs -- PanResponder는 마운트 시 한 번만 생성됨
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > PAN_START_THRESHOLD,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SWIPE_CLOSE_DY || (gs.vy > SWIPE_CLOSE_VELOCITY && gs.dy > SWIPE_CLOSE_MIN_DY)) {
          Animated.timing(translateY, { toValue: CLOSE_ANIM_TARGET_Y, duration: CLOSE_ANIM_DURATION_MS, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: SPRING_BACK_BOUNCINESS }).start();
        }
      },
    })
  ).current;
  // eslint-disable-next-line react-hooks/refs -- panResponder/translateY는 최초 렌더에서 한 번만 생성되는 안전한 ref
  return { panHandlers: panResponder.panHandlers, animStyle: { transform: [{ translateY }] } };
}
