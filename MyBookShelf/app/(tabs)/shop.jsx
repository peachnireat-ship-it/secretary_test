import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, FlatList,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getPet, adoptPet, applyPetDecay, usePetItem,
  getPetInventory, purchasePetItem, getCoins,
  getOwnedCosmetics, purchasePetCosmetic, equipPetCosmetic, unequipPetCosmetic,
} from '../../database/database';
import {
  PET_TYPES, PET_STAGES, PET_SHOP_ITEMS, CATEGORY_LABELS, COSMETIC_ITEMS,
} from '../../constants/petItems';
import PixelPet from '../../components/PixelPet';

const SHOP_ITEM_CATEGORIES = ['food', 'toy', 'clean', 'cosmetic'];

function buildEquipped(pet) {
  const find = (id) => COSMETIC_ITEMS.find(i => i.id === id) ?? null;
  return {
    hat:       find(pet?.equipped_hat),
    clothes:   find(pet?.equipped_clothes),
    accessory: find(pet?.equipped_accessory),
  };
}


function StatBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value));
  const statusColor = pct > 60 ? color : pct > 30 ? '#FF9800' : '#F44336';
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarBg}>
        <View style={[styles.statBarFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
      </View>
      <Text style={[styles.statValue, { color: statusColor }]}>{pct}</Text>
    </View>
  );
}

function AdoptionScreen({ onAdopt }) {
  const [selectedType, setSelectedType] = useState(null);
  const [name, setName] = useState('');

  const handleAdopt = () => {
    if (!selectedType) return Alert.alert('알림', '동물을 선택해 주세요.');
    const petName = name.trim() || PET_TYPES.find(p => p.id === selectedType)?.name;
    Alert.alert(
      '입양하기',
      `${PET_TYPES.find(p => p.id === selectedType)?.emoji} ${petName}를 입양할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '입양하기', onPress: () => onAdopt(selectedType, petName) },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.adoptContainer}>
      <Text style={styles.adoptTitle}>반려동물 입양하기</Text>
      <Text style={styles.adoptSub}>함께할 동물을 선택해 주세요</Text>

      <View style={styles.petGrid}>
        {PET_TYPES.map(pet => (
          <TouchableOpacity
            key={pet.id}
            style={[styles.petCard, selectedType === pet.id && styles.petCardSelected]}
            onPress={() => setSelectedType(pet.id)}
          >
            <Text style={styles.petEmoji}>{pet.emoji}</Text>
            <Text style={styles.petName}>{pet.name}</Text>
            <Text style={styles.petDesc}>{pet.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedType && (
        <View style={styles.nameSection}>
          <Text style={styles.nameLabel}>이름을 지어주세요 (선택)</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={PET_TYPES.find(p => p.id === selectedType)?.name}
            maxLength={12}
          />
          <TouchableOpacity style={styles.adoptBtn} onPress={handleAdopt}>
            <Text style={styles.adoptBtnText}>입양하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

export default function PetScreen() {
  const [pet, setPet] = useState(null);
  const [coins, setCoins] = useState(0);
  const [inventory, setInventory] = useState({});
  const [shopVisible, setShopVisible] = useState(false);
  const [shopCategory, setShopCategory] = useState('food');
  const [ownedCosmetics, setOwnedCosmetics] = useState([]);
  const [eatTick, setEatTick] = useState(0);
  const eatEmojiRef = useRef('🍖');

  const refresh = () => {
    const p = applyPetDecay();
    setPet(p);
    setCoins(getCoins());
    setInventory(getPetInventory());
    setOwnedCosmetics(getOwnedCosmetics());
  };

  useFocusEffect(useCallback(() => { refresh(); }, []));

  const handleAdopt = (type, name) => {
    adoptPet(type, name);
    refresh();
  };

  const handleUseItem = (itemId) => {
    const allItems = Object.values(PET_SHOP_ITEMS).flat();
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    try {
      usePetItem(itemId, item.effect);
      refresh();
      if (item.effect.hunger != null) {
        eatEmojiRef.current = item.emoji;
        setEatTick(t => t + 1);
      }
    } catch (e) {
      Alert.alert('알림', e.message);
    }
  };

  const handleBuyCosmetic = (item) => {
    try {
      purchasePetCosmetic(item.id, item.cost);
      refresh();
    } catch (e) {
      Alert.alert('알림', e.message);
    }
  };

  const handleEquipToggle = (item) => {
    const equipped = buildEquipped(pet);
    const isEquipped = equipped[item.category]?.id === item.id;
    if (isEquipped) {
      unequipPetCosmetic(item.category);
    } else {
      equipPetCosmetic(item.category, item.id);
    }
    refresh();
  };

  const handleBuy = (item) => {
    try {
      purchasePetItem(item.id, item.cost);
      refresh();
    } catch (e) {
      Alert.alert('알림', e.message);
    }
  };

  if (!pet) return <AdoptionScreen onAdopt={handleAdopt} />;

  const petType = PET_TYPES.find(p => p.id === pet.type);
  const stage = PET_STAGES.find(s => s.id === pet.stage) ?? PET_STAGES[0];
  const nextStage = PET_STAGES[PET_STAGES.indexOf(stage) + 1];
  const stageProgress = nextStage
    ? Math.round((pet.stageXp / nextStage.xpRequired) * 100)
    : 100;


  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 코인 */}
        <View style={styles.coinRow}>
          <Ionicons name="logo-bitcoin" size={16} color="#FFC107" />
          <Text style={styles.coinText}>{coins} 코인</Text>
          <TouchableOpacity style={styles.shopBtn} onPress={() => setShopVisible(true)}>
            <Ionicons name="storefront-outline" size={15} color="#6750A4" />
            <Text style={styles.shopBtnText}>상점</Text>
          </TouchableOpacity>
        </View>

        {/* 펫 */}
        <View style={styles.petCard2}>
          <PixelPet
            petType={pet.type}
            stats={{ hunger: pet.hunger, happiness: pet.happiness, cleanliness: pet.cleanliness }}
            eatTick={eatTick}
            eatEmoji={eatEmojiRef.current}
            equipped={buildEquipped(pet)}
          />

          {/* 이름 & 단계 */}
          <View style={styles.petInfoRow}>
            <Text style={styles.petNameMain}>{pet.name}</Text>
            <Text style={styles.petTypeEmoji}>{petType?.emoji ?? '🐾'}</Text>
            <View style={styles.stageBadge}>
              <Text style={styles.stageText}>{stage.name}</Text>
            </View>
          </View>

          {nextStage && (
            <View style={styles.stageProgressRow}>
              <Text style={styles.stageProgressLabel}>다음 성장까지</Text>
              <View style={styles.stageBarBg}>
                <View style={[styles.stageBarFill, { width: `${stageProgress}%` }]} />
              </View>
              <Text style={styles.stageProgressPct}>{stageProgress}%</Text>
            </View>
          )}
        </View>

        {/* 상태 게이지 */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>상태</Text>
          <StatBar label="🍽 배고픔"  value={pet.hunger}      color="#4CAF50" />
          <StatBar label="😊 행복도"  value={pet.happiness}   color="#2196F3" />
          <StatBar label="✨ 청결도"  value={pet.cleanliness} color="#9C27B0" />
        </View>

        {/* 인벤토리 */}
        {Object.keys(inventory).length > 0 && (
          <View style={styles.inventoryCard}>
            <Text style={styles.sectionTitle}>보유 아이템</Text>
            <View style={styles.inventoryGrid}>
              {Object.entries(inventory).map(([itemId, qty]) => {
                const allItems = Object.values(PET_SHOP_ITEMS).flat();
                const item = allItems.find(i => i.id === itemId);
                if (!item) return null;
                return (
                  <TouchableOpacity
                    key={itemId}
                    style={styles.invItem}
                    onPress={() => handleUseItem(itemId)}
                  >
                    <Text style={styles.invEmoji}>{item.emoji}</Text>
                    <Text style={styles.invName}>{item.name}</Text>
                    <Text style={styles.invQty}>×{qty}</Text>
                    <Text style={styles.invUse}>사용</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* 상점 모달 */}
      <Modal visible={shopVisible} animationType="slide" transparent onRequestClose={() => setShopVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>펫 상점</Text>
              <View style={styles.coinRowSmall}>
                <Ionicons name="logo-bitcoin" size={14} color="#FFC107" />
                <Text style={styles.coinTextSmall}>{coins}</Text>
              </View>
              <TouchableOpacity onPress={() => setShopVisible(false)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.categoryRow}>
              {SHOP_ITEM_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catTab, shopCategory === cat && styles.catTabActive]}
                  onPress={() => setShopCategory(cat)}
                >
                  <Text style={[styles.catTabText, shopCategory === cat && styles.catTabTextActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {shopCategory === 'cosmetic' ? (
              <FlatList
                data={COSMETIC_ITEMS}
                keyExtractor={i => i.id}
                renderItem={({ item }) => {
                  const owned    = ownedCosmetics.includes(item.id);
                  const equipped = buildEquipped(pet);
                  const isOn     = equipped[item.category]?.id === item.id;
                  return (
                    <View style={styles.shopItemRow}>
                      <Text style={styles.shopItemEmoji}>{item.emoji}</Text>
                      <View style={styles.shopItemInfo}>
                        <Text style={styles.shopItemName}>{item.name}</Text>
                        <Text style={styles.shopItemEffect}>{CATEGORY_LABELS[item.category]}</Text>
                      </View>
                      {owned ? (
                        <TouchableOpacity
                          style={[styles.equipBtn, isOn && styles.equipBtnOn]}
                          onPress={() => handleEquipToggle(item)}
                        >
                          <Text style={[styles.equipBtnText, isOn && styles.equipBtnTextOn]}>
                            {isOn ? '해제' : '장착'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.buyBtn, coins < item.cost && styles.buyBtnDisabled]}
                          onPress={() => handleBuyCosmetic(item)}
                          disabled={coins < item.cost}
                        >
                          <Ionicons name="logo-bitcoin" size={12} color={coins < item.cost ? '#bbb' : '#FFC107'} />
                          <Text style={[styles.buyBtnText, coins < item.cost && styles.buyBtnTextDisabled]}>
                            {item.cost}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
              />
            ) : (
              <FlatList
                data={PET_SHOP_ITEMS[shopCategory] ?? []}
                keyExtractor={i => i.id}
                renderItem={({ item }) => (
                  <View style={styles.shopItemRow}>
                    <Text style={styles.shopItemEmoji}>{item.emoji}</Text>
                    <View style={styles.shopItemInfo}>
                      <Text style={styles.shopItemName}>{item.name}</Text>
                      <Text style={styles.shopItemEffect}>
                        {Object.entries(item.effect).map(([k, v]) => {
                          const label = { hunger: '배고픔', happiness: '행복도', cleanliness: '청결도' }[k];
                          return `${label} +${v}`;
                        }).join('  ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.buyBtn, coins < item.cost && styles.buyBtnDisabled]}
                      onPress={() => handleBuy(item)}
                      disabled={coins < item.cost}
                    >
                      <Ionicons name="logo-bitcoin" size={12} color={coins < item.cost ? '#bbb' : '#FFC107'} />
                      <Text style={[styles.buyBtnText, coins < item.cost && styles.buyBtnTextDisabled]}>
                        {item.cost}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5FF' },
  content: { padding: 16, paddingBottom: 32 },

  // 입양 화면
  adoptContainer: { padding: 20, paddingBottom: 40 },
  adoptTitle: { fontSize: 22, fontWeight: 'bold', color: '#6750A4', textAlign: 'center', marginTop: 12 },
  adoptSub: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  petGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  petCard: {
    width: '44%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 2, borderColor: '#E8E0F0',
    elevation: 2,
  },
  petCardSelected: { borderColor: '#6750A4', backgroundColor: '#F3EFFE' },
  petEmoji: { fontSize: 40, marginBottom: 6 },
  petName: { fontSize: 15, fontWeight: '600', color: '#333' },
  petDesc: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 },
  nameSection: { marginTop: 24, alignItems: 'center' },
  nameLabel: { fontSize: 14, color: '#555', marginBottom: 8 },
  nameInput: {
    borderWidth: 1, borderColor: '#D0BCFF', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    width: '80%', backgroundColor: '#fff', textAlign: 'center',
  },
  adoptBtn: {
    marginTop: 16, backgroundColor: '#6750A4', borderRadius: 12,
    paddingHorizontal: 40, paddingVertical: 14,
  },
  adoptBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // 메인 화면
  coinRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 14,
  },
  coinText: { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  shopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  shopBtnText: { fontSize: 13, color: '#6750A4', fontWeight: '600' },

  petCard2: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    marginBottom: 16, elevation: 2, overflow: 'hidden',
  },
  petVideoWrap: { alignItems: 'center', marginBottom: 4 },
  petFallbackEmoji: { fontSize: 100, textAlign: 'center' },
  petInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, marginBottom: 2,
  },
  petNameMain: { fontSize: 18, fontWeight: 'bold', color: '#333', flex: 1 },
  petTypeEmoji: { fontSize: 20 },
  stageBadge: {
    backgroundColor: '#EDE7F6', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  stageText: { fontSize: 12, color: '#6750A4', fontWeight: '600' },
  stageProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, width: '100%' },
  stageProgressLabel: { fontSize: 11, color: '#999', width: 80 },
  stageBarBg: { flex: 1, height: 6, backgroundColor: '#E8E0F0', borderRadius: 3, overflow: 'hidden' },
  stageBarFill: { height: '100%', backgroundColor: '#6750A4', borderRadius: 3 },
  stageProgressPct: { fontSize: 11, color: '#6750A4', width: 30, textAlign: 'right' },

  statusCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  statLabel: { fontSize: 13, color: '#555', width: 72 },
  statBarBg: { flex: 1, height: 10, backgroundColor: '#F0EAF8', borderRadius: 5, overflow: 'hidden' },
  statBarFill: { height: '100%', borderRadius: 5 },
  statValue: { fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' },

  inventoryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 2 },
  inventoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  invItem: {
    backgroundColor: '#F3EFFE', borderRadius: 12, padding: 10,
    alignItems: 'center', minWidth: 72,
  },
  invEmoji: { fontSize: 28 },
  invName: { fontSize: 11, color: '#555', marginTop: 2, textAlign: 'center' },
  invQty: { fontSize: 12, fontWeight: 'bold', color: '#6750A4', marginTop: 2 },
  invUse: {
    marginTop: 4, fontSize: 11, color: '#fff', backgroundColor: '#6750A4',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },

  // 상점 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 16, paddingBottom: 32, maxHeight: '75%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', flex: 1 },
  coinRowSmall: { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 12 },
  coinTextSmall: { fontSize: 14, fontWeight: '600', color: '#555' },
  categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  catTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F0EAF8',
  },
  catTabActive: { backgroundColor: '#6750A4' },
  catTabText: { fontSize: 13, color: '#6750A4' },
  catTabTextActive: { color: '#fff', fontWeight: '600' },
  shopItemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3EEF8', gap: 12,
  },
  shopItemEmoji: { fontSize: 30, width: 40, textAlign: 'center' },
  shopItemInfo: { flex: 1 },
  shopItemName: { fontSize: 14, fontWeight: '600', color: '#333' },
  shopItemEffect: { fontSize: 12, color: '#888', marginTop: 2 },
  buyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFF8E1', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#FFC107',
  },
  buyBtnDisabled: { backgroundColor: '#f5f5f5', borderColor: '#ddd' },
  buyBtnText: { fontSize: 13, fontWeight: '600', color: '#E65100' },
  buyBtnTextDisabled: { color: '#bbb' },
  equipBtn: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#EDE7F6', borderWidth: 1, borderColor: '#D0BCFF',
  },
  equipBtnOn: { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  equipBtnText: { fontSize: 13, fontWeight: '600', color: '#6750A4' },
  equipBtnTextOn: { color: '#fff' },
});
