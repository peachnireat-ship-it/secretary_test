import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { C } from '../theme';

export default function HomeMapCard({ coords, locationText, onPress }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!coords} style={s.mapCard}>
      {coords ? (
        <>
          <MapView
            style={s.map}
            region={{ ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            userInterfaceStyle="dark"
            pointerEvents="none"
          >
            <Marker coordinate={coords} />
          </MapView>
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
  map: { width: '100%', height: 180 },
  mapAddressRow: { backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapAddressText: { color: C.textSecondary, fontSize: 12, letterSpacing: 0.3, flex: 1 },
  mapOpenHint: { color: C.accentBlue, fontSize: 11, marginLeft: 8 },
  mapPlaceholder: { height: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  mapPlaceholderText: { color: C.textDim, fontSize: 13 },
});
