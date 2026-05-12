import { View, Text, StyleSheet } from 'react-native';

const STATUS_CONFIG = {
  reading: { label: '읽는 중', color: '#2196F3' },
  completed: { label: '완독', color: '#4CAF50' },
  want_to_read: { label: '읽고 싶음', color: '#FF9800' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.want_to_read;
  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={styles.text}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
