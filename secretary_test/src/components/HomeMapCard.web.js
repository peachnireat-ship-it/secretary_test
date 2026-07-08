import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../theme';

// 웹 빌드는 react-native-maps(네이티브 전용) 대신 API 키가 필요 없는
// OpenStreetMap 임베드로 대체한다. Metro가 .web.js를 우선 해석하므로
// 웹 번들에는 react-native-maps가 아예 포함되지 않는다.
function buildOsmEmbedUrl(latitude, longitude, delta = 0.005) {
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export default function HomeMapCard({ coords, locationText, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!coords} style={s.mapCard}>
      {coords ? (
        <>
          {/* pointerEvents 제한 없음: PC에서 스크롤/드래그로 지도 확대·축소·이동 가능 */}
          <iframe
            title="현재 위치 지도"
            src={buildOsmEmbedUrl(coords.latitude, coords.longitude)}
            style={{ width: '100%', height: 180, border: 0 }}
            loading="lazy"
          />
          <View style={s.mapAddressRow}>
            <Text style={s.mapAddressText} numberOfLines={1}>◎ {locationText || '주소 불러오는 중...'}</Text>
            <Text style={s.mapOpenHint}>지도 앱으로 열기 ›</Text>
          </View>
        </>
      ) : (
        <View style={s.mapPlaceholder}>
          <Text style={s.mapPlaceholderText}>{locationText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  mapCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  mapAddressRow: { backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapAddressText: { color: C.textSecondary, fontSize: 12, letterSpacing: 0.3, flex: 1 },
  mapOpenHint: { color: C.accentBlue, fontSize: 11, marginLeft: 8 },
  mapPlaceholder: { height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  mapPlaceholderText: { color: C.textDim, fontSize: 13 },
});
