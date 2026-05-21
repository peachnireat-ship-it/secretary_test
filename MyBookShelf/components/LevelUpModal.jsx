import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useRef, useEffect } from 'react';

const { width } = Dimensions.get('window');

const CONFETTI_COLORS = ['#6750A4', '#B69DF8', '#FFD700', '#FF6B9D', '#4CAF50', '#2196F3', '#FF9800'];

export default function LevelUpModal({ visible, tier, tierLevel, tierColor, onClose }) {
  const confettiRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => confettiRef.current?.start(), 200);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <ConfettiCannon
          ref={confettiRef}
          count={180}
          origin={{ x: width / 2, y: -10 }}
          autoStart={false}
          fadeOut
          colors={CONFETTI_COLORS}
          explosionSpeed={350}
          fallSpeed={3000}
        />
        <View style={styles.card}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.levelUpLabel}>LEVEL UP!</Text>
          <View style={[styles.levelBadge, { backgroundColor: tierColor }]}>
            <Text style={styles.tierName}>{tier}</Text>
            <Text style={styles.levelNum}>Lv.{tierLevel}</Text>
          </View>
          <Text style={styles.congrats}>축하합니다!</Text>
          <Text style={styles.message}>새로운 레벨에 도달했습니다{'\n'}계속 독서하며 성장하세요 📚</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: tierColor }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: 288,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  trophy: {
    fontSize: 60,
    marginBottom: 8,
  },
  levelUpLabel: {
    fontSize: 22,
    fontWeight: '900',
    color: '#6750A4',
    letterSpacing: 3,
    marginBottom: 16,
  },
  levelBadge: {
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  tierName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
    opacity: 0.9,
  },
  levelNum: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
  },
  congrats: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#49454F',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  btn: {
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 52,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
