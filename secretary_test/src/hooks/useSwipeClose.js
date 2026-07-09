import { useEffect, useRef } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';

const PAN_START_THRESHOLD = 2;
const SWIPE_CLOSE_DY = 80;
const SWIPE_CLOSE_VELOCITY = 0.8;
const SWIPE_CLOSE_MIN_DY = 10;
const CLOSE_ANIM_TARGET_Y = 600;
const CLOSE_ANIM_DURATION_MS = 220;
const SPRING_BACK_BOUNCINESS = 4;

/**
 * Bottom Sheet 모달 드래그-닫기 공통 훅.
 * 네이티브(iOS/Android): 핸들을 아래로 dy > 80px 이상 드래그하거나, vy > 0.8(빠른 스와이프, dy > 10) 시 onClose 호출.
 * 웹: 마우스 드래그가 번거로우므로 핸들을 클릭(드래그 없이 누르고 떼기)만 해도 동일한 슬라이드 애니메이션 후 onClose 호출.
 *
 * 닫힘 애니메이션 완료 직후 translateY를 0으로 되돌리면, Modal 자체의 내장 slide 종료
 * 애니메이션이 재생되는 순간 시트가 원위치로 "스냅백"했다가 다시 슬라이드되어 두 번
 * 움직이는 것처럼 보인다. `visible`을 넘기면 이 스냅백 없이, 다음에 모달이 실제로 다시
 * 열리는 시점에만 translateY를 조용히 0으로 리셋한다(그 사이엔 모달 자체가 안 보이므로
 * 화면 밖에 남아있어도 무방).
 * @param {() => void} onClose 닫기 콜백
 * @param {boolean} [visible] 모달의 visible 상태 (넘기면 스냅백 없는 리셋 적용, 하위 호환을 위해 선택적)
 * @returns {{ panHandlers: object, animStyle: object }}
 */
export function useSwipeClose(onClose, visible) {
  // eslint-disable-next-line react-hooks/refs -- Animated.Value는 최초 렌더에서 한 번만 생성되는 안전한 패턴
  const translateY = useRef(new Animated.Value(0)).current;
  const prevVisibleRef = useRef(visible);

  useEffect(() => {
    if (visible !== undefined && visible && !prevVisibleRef.current) {
      translateY.setValue(0);
    }
    prevVisibleRef.current = visible;
  }, [visible, translateY]);

  const panResponder = useRef(
    // eslint-disable-next-line react-hooks/refs -- PanResponder는 마운트 시 한 번만 생성됨
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > PAN_START_THRESHOLD,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        // 웹은 마우스 드래그가 번거로우므로 핸들 클릭(드래그 없이 누르고 떼기)만으로도 닫힘 처리
        if (Platform.OS === 'web' || gs.dy > SWIPE_CLOSE_DY || (gs.vy > SWIPE_CLOSE_VELOCITY && gs.dy > SWIPE_CLOSE_MIN_DY)) {
          Animated.timing(translateY, { toValue: CLOSE_ANIM_TARGET_Y, duration: CLOSE_ANIM_DURATION_MS, useNativeDriver: true }).start(() => {
            // visible을 넘기지 않는 호출부(하위 호환)는 기존처럼 즉시 리셋한다.
            if (visible === undefined) translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: SPRING_BACK_BOUNCINESS }).start();
        }
      },
    })
  ).current;
  /* eslint-disable react-hooks/refs -- panResponder/translateY는 최초 렌더에서 한 번만 생성되는 안전한 ref */
  return {
    panHandlers: panResponder.panHandlers,
    animStyle: { transform: [{ translateY }] },
  };
  /* eslint-enable react-hooks/refs */
}
