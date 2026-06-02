import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, FlatList,
} from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { adoptPet, purchasePetItem, purchasePetCosmetic } from '../../database/database';
import { PET_TYPES, PET_STAGES } from '../../constants/petItems';
import {
  SHOP_ITEMS_BY_CATEGORY, COSMETIC_ITEMS, CATEGORY_LABELS,
  ITEM_RARITY, ALL_SHOP_ITEMS,
} from '../../constants/itemData';
import { ROOM_THEMES, COLOR_VARIANTS, FRAME_THEMES } from '../../constants/spriteConfig';
import PetSprite from '../../components/PetSprite';
import { usePetState } from '../../hooks/usePetState';

const SHOP_TABS = ['food', 'toy', 'clean', 'cosmetic', 'theme'];

// ── Adoption screen ────────────────────────────────────────────
function AdoptionScreen({ onAdopt }) {
  const [selected, setSelected] = useState(null);
  const [name, setName]         = useState('');

  const confirm = () => {
    if (!selected) return Alert.alert('알림', '동물을 선택해 주세요.');
    const petName = name.trim() || PET_TYPES.find(p => p.id === selected)?.name;
    Alert.alert(
      '입양하기',
      `${PET_TYPES.find(p => p.id === selected)?.emoji} ${petName}를 입양할까요?`,
      [
        { text: '취소', style: 'cancel' },
        { text: '입양하기', onPress: () => onAdopt(selected, petName) },
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
            style={[styles.petCard, selected === pet.id && styles.petCardSelected]}
            onPress={() => setSelected(pet.id)}
          >
            <Text style={styles.petEmoji}>{pet.emoji}</Text>
            <Text style={styles.petName}>{pet.name}</Text>
            <Text style={styles.petDesc}>{pet.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {selected && (
        <View style={styles.nameSection}>
          <Text style={styles.nameLabel}>이름을 지어주세요 (선택)</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={PET_TYPES.find(p => p.id === selected)?.name}
            maxLength={12}
          />
          <TouchableOpacity style={styles.adoptBtn} onPress={confirm}>
            <Text style={styles.adoptBtnText}>입양하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ── Stat bar ──────────────────────────────────────────────────
function StatBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value));
  const c   = pct > 60 ? color : pct > 30 ? '#FF9800' : '#F44336';
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarBg}>
        <View style={[styles.statBarFill, { width: `${pct}%`, backgroundColor: c }]} />
      </View>
      <Text style={[styles.statValue, { color: c }]}>{pct}</Text>
    </View>
  );
}

// ── Rarity badge ─────────────────────────────────────────────
function RarityBadge({ rarity }) {
  const r = ITEM_RARITY[rarity];
  if (!r) return null;
  return (
    <View style={[styles.rarityBadge, { borderColor: r.color }]}>
      <Text style={[styles.rarityText, { color: r.color }]}>{r.label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function PetScreen() {
  const {
    pet, pets, coins, inventory, ownedCosmetics,
    animState, actionTick, actionEmojiRef,
    refresh, triggerAction, toggleCosmetic, equipped,
    changeTheme, roomTheme,
    changeColorVariant, colorVariant,
    changeFrameTheme, frameTheme,
    switchPet,
  } = usePetState();

  const ft = FRAME_THEMES[frameTheme] ?? FRAME_THEMES.purple;

  const [shopVisible,   setShopVisible]   = useState(false);
  const [shopCategory,  setShopCategory]  = useState('food');
  const [adoptVisible,  setAdoptVisible]  = useState(false);

  const handleAdopt = (type, name) => {
    adoptPet(type, name);
    refresh();
    setAdoptVisible(false);
  };

  const handleUseItem = (itemId) => {
    try {
      triggerAction(itemId);
    } catch (e) {
      Alert.alert('알림', e.message);
    }
  };

  const handleBuy = (item) => {
    try {
      purchasePetItem(item.id, item.cost);
      refresh();
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

  if (!pet) return <AdoptionScreen onAdopt={handleAdopt} />;

  const petType   = PET_TYPES.find(p => p.id === pet.type);
  const stage       = PET_STAGES.find(s => s.id === pet.stage) ?? PET_STAGES[0];
  const nextStage   = PET_STAGES[PET_STAGES.indexOf(stage) + 1];
  const stagePct    = nextStage ? Math.round((pet.stageXp / nextStage.xpRequired) * 100) : 100;

  // Map last item category → overlay action type
  const lastItemDef = ALL_SHOP_ITEMS.find(i => i.emoji === actionEmojiRef.current);
  const actionType  = lastItemDef
    ? ({ food: 'eat', toy: 'play', clean: 'clean' }[lastItemDef.category] ?? 'eat')
    : 'eat';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Ionicons name="logo-bitcoin" size={16} color="#FFC107" />
          <Text style={styles.coinText}>{coins} 코인</Text>
          <TouchableOpacity style={styles.adoptNewBtn} onPress={() => setAdoptVisible(true)}>
            <Ionicons name="add-circle-outline" size={15} color="#4CAF50" />
            <Text style={styles.adoptNewBtnText}>새 입양</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shopBtn} onPress={() => setShopVisible(true)}>
            <Ionicons name="storefront-outline" size={15} color="#6750A4" />
            <Text style={styles.shopBtnText}>상점</Text>
          </TouchableOpacity>
        </View>

        {/* ── Pet switcher (multiple pets) ── */}
        {pets.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.petSwitcherWrap}
            contentContainerStyle={styles.petSwitcherContent}
          >
            {pets.map(p => {
              const pt = PET_TYPES.find(t => t.id === p.type);
              const active = p.id === pet?.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.petChip, active && styles.petChipActive]}
                  onPress={() => !active && switchPet(p.id)}
                >
                  <Text style={styles.petChipEmoji}>{pt?.emoji ?? '🐾'}</Text>
                  <Text style={[styles.petChipName, active && styles.petChipNameActive]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {active && <View style={styles.petChipDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Tamagotchi Shell ── */}
        <View style={[styles.tamaShell, { backgroundColor: ft.shell, borderColor: ft.border, shadowColor: ft.border }]}>
          {/* 키체인 고리 */}
          <View style={[styles.tamaHookRing, { borderColor: ft.border }]} />

          {/* 스크린 위 장식 */}
          <View style={styles.tamaDecoRow}>
            {ft.decoTop.map((e, i) => (
              <Text key={i} style={styles.tamaDecoEmoji}>{e}</Text>
            ))}
          </View>

          {/* LCD 베젤 + 스크린 */}
          <View style={styles.tamaBezel}>
            <View style={styles.tamaScreen}>
              <PetSprite
                petType={pet.type}
                animState={animState}
                equipped={equipped}
                actionTick={actionTick}
                actionEmoji={actionEmojiRef.current}
                actionType={actionType}
                bgTheme={roomTheme}
                colorVariant={colorVariant}
              />
              <View style={styles.statsOverlay}>
                <Text style={styles.statsOverlayText}>🍽{pet.hunger}</Text>
                <Text style={styles.statsOverlayText}>😊{pet.happiness}</Text>
                <Text style={styles.statsOverlayText}>✨{pet.cleanliness}</Text>
              </View>
            </View>
          </View>

          {/* 스크린 아래 장식 */}
          <View style={styles.tamaDecoRow}>
            {ft.decoBottom.map((e, i) => (
              <Text key={i} style={styles.tamaDecoEmoji}>{e}</Text>
            ))}
          </View>

          {/* 펫 정보 스트립 */}
          <View style={styles.tamaInfoStrip}>
            <View style={[styles.petInfoRow, { marginTop: 0 }]}>
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
                  <View style={[styles.stageBarFill, { width: `${stagePct}%` }]} />
                </View>
                <Text style={styles.stageProgressPct}>{stagePct}%</Text>
              </View>
            )}
          </View>

          {/* 버튼 3개 */}
          <View style={styles.tamaButtonRow}>
            <View style={[styles.tamaBtn, { backgroundColor: ft.btnSide, borderColor: ft.border, shadowColor: ft.border }]} />
            <View style={[styles.tamaBtn, styles.tamaBtnCenter, { backgroundColor: ft.btnCenter, borderColor: ft.btnCenterBorder }]} />
            <View style={[styles.tamaBtn, { backgroundColor: ft.btnSide, borderColor: ft.border, shadowColor: ft.border }]} />
          </View>
        </View>

        {/* ── Status ── */}
        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>상태</Text>
          <StatBar label="🍽 배고픔"  value={pet.hunger}      color="#4CAF50" />
          <StatBar label="😊 행복도"  value={pet.happiness}   color="#2196F3" />
          <StatBar label="✨ 청결도"  value={pet.cleanliness} color="#9C27B0" />
        </View>

        {/* ── Inventory ── */}
        {Object.keys(inventory).length > 0 && (
          <View style={styles.inventoryCard}>
            <Text style={styles.sectionTitle}>보유 아이템</Text>
            <View style={styles.inventoryGrid}>
              {Object.entries(inventory).map(([itemId, qty]) => {
                const item = ALL_SHOP_ITEMS.find(i => i.id === itemId);
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

      {/* ── Adoption modal ── */}
      <Modal visible={adoptVisible} animationType="slide" transparent onRequestClose={() => setAdoptVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 반려동물 입양</Text>
              <TouchableOpacity onPress={() => setAdoptVisible(false)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
            <AdoptionScreen onAdopt={handleAdopt} />
          </View>
        </View>
      </Modal>

      {/* ── Shop modal ── */}
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
              {SHOP_TABS.map(cat => (
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

            {shopCategory === 'theme' ? (
              <ScrollView contentContainerStyle={styles.themeModalContent}>
                <Text style={styles.themeModalSection}>방 배경</Text>
                <View style={styles.themeRow}>
                  {Object.values(ROOM_THEMES).map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.themeCircle, { backgroundColor: t.bg, borderColor: t.floor }, roomTheme === t.id && styles.themeCircleActive]}
                      onPress={() => changeTheme(t.id)}
                    >
                      {roomTheme === t.id && <View style={styles.themeCheckDot} />}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.themeNameLabel}>{ROOM_THEMES[roomTheme]?.name ?? '클래식'}</Text>

                {COLOR_VARIANTS[pet.type] && (
                  <>
                    <Text style={styles.themeModalSection}>펫 색상</Text>
                    <View style={styles.colorVariantRow}>
                      {COLOR_VARIANTS[pet.type].map(v => {
                        const active = colorVariant === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[styles.colorVariantBtn, active && styles.colorVariantBtnActive]}
                            onPress={() => changeColorVariant(v.id)}
                          >
                            <View style={[styles.colorSwatch, { backgroundColor: v.swatch, borderColor: v.border }]} />
                            <Text style={[styles.colorVariantLabel, active && styles.colorVariantLabelActive]}>{v.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={styles.themeModalSection}>프레임</Text>
                <View style={styles.colorVariantRow}>
                  {Object.values(FRAME_THEMES).map(t => {
                    const active = frameTheme === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.colorVariantBtn, active && styles.colorVariantBtnActive]}
                        onPress={() => changeFrameTheme(t.id)}
                      >
                        <View style={[styles.colorSwatch, { backgroundColor: t.swatch, borderColor: t.border }]} />
                        <Text style={[styles.colorVariantLabel, active && styles.colorVariantLabelActive]}>{t.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : shopCategory === 'cosmetic' ? (
              <FlatList
                data={COSMETIC_ITEMS}
                keyExtractor={i => i.id}
                renderItem={({ item }) => {
                  const owned = ownedCosmetics.includes(item.id);
                  const isOn  = equipped[item.category]?.id === item.id;
                  return (
                    <View style={styles.shopItemRow}>
                      <Text style={styles.shopItemEmoji}>{item.emoji}</Text>
                      <View style={styles.shopItemInfo}>
                        <Text style={styles.shopItemName}>{item.name}</Text>
                        <RarityBadge rarity={item.rarity} />
                      </View>
                      {owned ? (
                        <TouchableOpacity
                          style={[styles.equipBtn, isOn && styles.equipBtnOn]}
                          onPress={() => toggleCosmetic(item)}
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
                data={SHOP_ITEMS_BY_CATEGORY[shopCategory] ?? []}
                keyExtractor={i => i.id}
                renderItem={({ item }) => (
                  <View style={styles.shopItemRow}>
                    <Text style={styles.shopItemEmoji}>{item.emoji}</Text>
                    <View style={styles.shopItemInfo}>
                      <Text style={styles.shopItemName}>{item.name}</Text>
                      <Text style={styles.shopItemEffect}>{item.description}</Text>
                      <View style={styles.effectTagRow}>
                        {Object.entries(item.effect).map(([k, v]) => {
                          const label = { hunger: '배고픔', happiness: '행복도', cleanliness: '청결도' }[k];
                          return (
                            <View key={k} style={styles.effectTag}>
                              <Text style={styles.effectTagText}>{label} +{v}</Text>
                            </View>
                          );
                        })}
                      </View>
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
  content:   { padding: 16, paddingBottom: 32 },

  // Adoption
  adoptContainer: { padding: 20, paddingBottom: 40 },
  adoptTitle: { fontSize: 22, fontWeight: 'bold', color: '#6750A4', textAlign: 'center', marginTop: 12 },
  adoptSub:   { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  petGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  petCard: {
    width: '44%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center', borderWidth: 2, borderColor: '#E8E0F0', elevation: 2,
  },
  petCardSelected: { borderColor: '#6750A4', backgroundColor: '#F3EFFE' },
  petEmoji:  { fontSize: 40, marginBottom: 6 },
  petName:   { fontSize: 15, fontWeight: '600', color: '#333' },
  petDesc:   { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 },
  nameSection: { marginTop: 24, alignItems: 'center' },
  nameLabel:   { fontSize: 14, color: '#555', marginBottom: 8 },
  nameInput: {
    borderWidth: 1, borderColor: '#D0BCFF', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    width: '80%', backgroundColor: '#fff', textAlign: 'center',
  },
  adoptBtn:     { marginTop: 16, backgroundColor: '#6750A4', borderRadius: 12, paddingHorizontal: 40, paddingVertical: 14 },
  adoptBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Top bar
  topBar:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  coinText:   { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  adoptNewBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  adoptNewBtnText:{ fontSize: 13, color: '#388E3C', fontWeight: '600' },
  shopBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  shopBtnText:{ fontSize: 13, color: '#6750A4', fontWeight: '600' },

  // Pet switcher
  petSwitcherWrap:    { marginBottom: 12 },
  petSwitcherContent: { gap: 8, paddingHorizontal: 2, paddingVertical: 4 },
  petChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 2, borderColor: '#E8E0F0', elevation: 1,
  },
  petChipActive: { borderColor: '#6750A4', backgroundColor: '#F3EFFE' },
  petChipEmoji:  { fontSize: 18 },
  petChipName:   { fontSize: 12, color: '#555', maxWidth: 60 },
  petChipNameActive: { color: '#6750A4', fontWeight: '700' },
  petChipDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6750A4' },

  // Tamagotchi Shell
  tamaShell: {
    backgroundColor: '#7C5CBF',
    alignSelf: 'center',
    width: 280,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
    borderBottomLeftRadius: 110,
    borderBottomRightRadius: 110,
    paddingTop: 12,
    paddingHorizontal: 22,
    paddingBottom: 28,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#3D2470',
    elevation: 12,
    shadowColor: '#3D2470',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  tamaDecoRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginVertical: 6,
  },
  tamaDecoEmoji: {
    fontSize: 14,
  },
  tamaHookRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
    borderColor: '#3D2470',
    backgroundColor: 'transparent',
    marginBottom: 10,
  },
  tamaBezel: {
    backgroundColor: '#1A1628',
    borderRadius: 22,
    padding: 10,
    width: '100%',
    borderWidth: 3,
    borderColor: '#0D0A16',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  tamaScreen: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  statsOverlay: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    zIndex: 10,
  },
  statsOverlayText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tamaInfoStrip: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
    width: '100%',
  },
  tamaButtonRow: {
    flexDirection: 'row',
    gap: 22,
    marginTop: 18,
    alignItems: 'center',
  },
  tamaBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9575CD',
    borderWidth: 3,
    borderColor: '#3D2470',
    borderBottomWidth: 5,
    elevation: 4,
    shadowColor: '#3D2470',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  tamaBtnCenter: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EF9A9A',
    borderColor: '#B71C1C',
  },

  // Pet card (legacy)
  petCard2: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, elevation: 2, overflow: 'hidden' },
  petInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 2 },
  petNameMain:  { fontSize: 18, fontWeight: 'bold', color: '#333', flex: 1 },
  petTypeEmoji: { fontSize: 20 },
  stageBadge:   { backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  stageText:    { fontSize: 12, color: '#6750A4', fontWeight: '600' },
  stageProgressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, width: '100%' },
  stageProgressLabel: { fontSize: 11, color: '#999', width: 80 },
  stageBarBg:         { flex: 1, height: 6, backgroundColor: '#E8E0F0', borderRadius: 3, overflow: 'hidden' },
  stageBarFill:       { height: '100%', backgroundColor: '#6750A4', borderRadius: 3 },
  stageProgressPct:   { fontSize: 11, color: '#6750A4', width: 30, textAlign: 'right' },

  // Background theme selector
  themeCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  themeRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 6 },
  themeCircle: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
  },
  themeCircleActive: { borderWidth: 3, borderColor: '#6750A4' },
  themeCheckDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6750A4' },
  themeNameLabel: { fontSize: 12, color: '#6750A4', fontWeight: '600' },
  themeModalContent: { paddingHorizontal: 4, paddingBottom: 16 },
  themeModalSection: { fontSize: 13, fontWeight: '700', color: '#444', marginTop: 16, marginBottom: 8 },

  // Color variant selector
  colorVariantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  colorVariantBtn: {
    alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 6,
    borderRadius: 10, borderWidth: 2, borderColor: 'transparent',
  },
  colorVariantBtnActive: { borderColor: '#6750A4', backgroundColor: '#F3EFFE' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#E0D8F0' },
  colorVariantLabel: { fontSize: 10, color: '#888' },
  colorVariantLabelActive: { color: '#6750A4', fontWeight: '700' },

  // Status
  statusCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  statRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  statLabel: { fontSize: 13, color: '#555', width: 72 },
  statBarBg: { flex: 1, height: 10, backgroundColor: '#F0EAF8', borderRadius: 5, overflow: 'hidden' },
  statBarFill:{ height: '100%', borderRadius: 5 },
  statValue: { fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' },

  // Inventory
  inventoryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 2 },
  inventoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  invItem: { backgroundColor: '#F3EFFE', borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 72 },
  invEmoji: { fontSize: 28 },
  invName:  { fontSize: 11, color: '#555', marginTop: 2, textAlign: 'center' },
  invQty:   { fontSize: 12, fontWeight: 'bold', color: '#6750A4', marginTop: 2 },
  invUse:   { marginTop: 4, fontSize: 11, color: '#fff', backgroundColor: '#6750A4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },

  // Shop modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 16, paddingBottom: 32, maxHeight: '78%',
    flex: 1,
  },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle:    { fontSize: 17, fontWeight: 'bold', color: '#333', flex: 1 },
  coinRowSmall:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 12 },
  coinTextSmall: { fontSize: 14, fontWeight: '600', color: '#555' },
  categoryRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catTab:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0EAF8' },
  catTabActive:  { backgroundColor: '#6750A4' },
  catTabText:    { fontSize: 13, color: '#6750A4' },
  catTabTextActive: { color: '#fff', fontWeight: '600' },

  shopItemRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3EEF8', gap: 12 },
  shopItemEmoji: { fontSize: 30, width: 40, textAlign: 'center' },
  shopItemInfo:  { flex: 1, gap: 3 },
  shopItemName:  { fontSize: 14, fontWeight: '600', color: '#333' },
  shopItemEffect:{ fontSize: 12, color: '#888' },

  effectTagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  effectTag:     { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  effectTagText: { fontSize: 10, color: '#388E3C', fontWeight: '600' },

  rarityBadge:   { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  rarityText:    { fontSize: 10, fontWeight: '600' },

  buyBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF8E1', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#FFC107' },
  buyBtnDisabled:{ backgroundColor: '#f5f5f5', borderColor: '#ddd' },
  buyBtnText:    { fontSize: 13, fontWeight: '600', color: '#E65100' },
  buyBtnTextDisabled: { color: '#bbb' },

  equipBtn:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#EDE7F6', borderWidth: 1, borderColor: '#D0BCFF' },
  equipBtnOn:    { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  equipBtnText:  { fontSize: 13, fontWeight: '600', color: '#6750A4' },
  equipBtnTextOn:{ color: '#fff' },
});
