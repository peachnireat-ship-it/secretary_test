import * as Location from 'expo-location';

/**
 * 현재 위치 좌표를 반환한다.
 * @returns {{ latitude: number, longitude: number, accuracy: number } | null}
 */
export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/**
 * 좌표를 한국어 주소로 변환한다.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string} "시·도 시·군·구 읍·면·동" 형식, 실패 시 null
 */
export async function reverseGeocode(latitude, longitude) {
  const results = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!results || results.length === 0) return null;

  const r = results[0];
  const parts = [r.region, r.city || r.subregion, r.district || r.street].filter(Boolean);
  return parts.join(' ') || null;
}

/**
 * 현재 위치를 가져오고 한국어 주소까지 반환한다.
 * @returns {{ latitude, longitude, accuracy, address: string } | null}
 */
export async function getLocationWithAddress() {
  const loc = await getCurrentLocation();
  if (!loc) return null;

  const address = await reverseGeocode(loc.latitude, loc.longitude);
  return { ...loc, address };
}

/**
 * 위치 변경을 실시간으로 구독한다.
 * @param {(loc: { latitude, longitude, accuracy, address: string }) => void} onUpdate
 * @returns {() => void} 구독 해제 함수
 */
export function watchLocation(onUpdate) {
  let sub = null;

  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      onUpdate(null);
      return;
    }

    sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50, // 50m 이상 이동 시 업데이트
        timeInterval: 10000,  // 최소 10초 간격
      },
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        onUpdate({ latitude, longitude, accuracy, address });
      }
    );
  })();

  return () => {
    if (sub) sub.remove();
  };
}
