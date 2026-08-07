import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../theme';
import { ICONS, tabColor } from '../navConfig';

export const PC_SIDEBAR_WIDTH = 220;

export default function PCSidebar({ state, descriptors, navigation }) {
  return (
    <View style={s.sidebar}>
      <Text style={s.brand}>Secretary</Text>
      <View style={s.list}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const color = focused ? tabColor(route.name) : C.textDim;
          const label = descriptors[route.key]?.options?.tabBarLabel ?? route.name;
          return (
            <TouchableOpacity
              key={route.key}
              style={[s.item, focused && { backgroundColor: color + '18', borderColor: color + '55' }]}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 18, color }}>{ICONS[route.name]?.active}</Text>
              <Text style={[s.label, { color }]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sidebar: { width: PC_SIDEBAR_WIDTH, position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border, paddingTop: 24, paddingHorizontal: 12 },
  brand: { color: C.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 24, paddingHorizontal: 8 },
  list: { gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  label: { fontSize: 13, fontWeight: '600' },
});
