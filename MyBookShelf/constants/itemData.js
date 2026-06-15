// Enhanced item data — superset of petItems.js
// Each item carries: id, name, emoji, cost, category, effect, rarity, description

export const ITEM_RARITY = {
  common:    { label: '일반',   color: '#9E9E9E' },
  uncommon:  { label: '희귀',   color: '#4CAF50' },
  rare:      { label: '레어',   color: '#2196F3' },
  legendary: { label: '전설',   color: '#FF9800' },
};

// effect keys: hunger | happiness | cleanliness (each 0–100 additive)
// triggerAnim: which animState plays on PetSprite after use
export const FOOD_ITEMS = [
  {
    id: 'food_basic',
    name: '일반 사료',
    emoji: '🥣',
    cost: 10,
    rarity: 'common',
    category: 'food',
    effect: { hunger: 30 },
    triggerAnim: 'eating',
    description: '기본적인 하루 사료입니다.',
  },
  {
    id: 'food_premium',
    name: '프리미엄 사료',
    emoji: '🍖',
    cost: 30,
    rarity: 'uncommon',
    category: 'food',
    effect: { hunger: 60 },
    triggerAnim: 'eating',
    description: '고품질 재료로 만든 사료입니다.',
  },
  {
    id: 'food_snack',
    name: '간식',
    emoji: '🍬',
    cost: 20,
    rarity: 'common',
    category: 'food',
    effect: { hunger: 20, happiness: 15 },
    triggerAnim: 'eating',
    description: '달콤한 간식으로 기분도 좋아져요.',
  },
  {
    id: 'food_cake',
    name: '생일 케이크',
    emoji: '🎂',
    cost: 80,
    rarity: 'rare',
    category: 'food',
    effect: { hunger: 40, happiness: 40 },
    triggerAnim: 'happy',
    description: '특별한 날을 위한 케이크.',
  },
  {
    id: 'food_fish',
    name: '생선 요리',
    emoji: '🐟',
    cost: 50,
    rarity: 'uncommon',
    category: 'food',
    effect: { hunger: 50, happiness: 10 },
    triggerAnim: 'eating',
    description: '고양이가 가장 좋아하는 생선.',
  },
];

export const TOY_ITEMS = [
  {
    id: 'toy_ball',
    name: '공',
    emoji: '⚾',
    cost: 50,
    rarity: 'common',
    category: 'toy',
    effect: { happiness: 30 },
    triggerAnim: 'happy',
    description: '굴리며 놀 수 있는 작은 공.',
  },
  {
    id: 'toy_rod',
    name: '낚시대 장난감',
    emoji: '🎣',
    cost: 70,
    rarity: 'uncommon',
    category: 'toy',
    effect: { happiness: 50 },
    triggerAnim: 'happy',
    description: '쫄랑쫄랑 달린 장식이 매력적.',
  },
  {
    id: 'toy_tunnel',
    name: '터널',
    emoji: '🌀',
    cost: 100,
    rarity: 'rare',
    category: 'toy',
    effect: { happiness: 70 },
    triggerAnim: 'surprised',
    description: '속에서 불쑥 나타나면 깜짝!',
  },
  {
    id: 'toy_book',
    name: '그림책',
    emoji: '📚',
    cost: 40,
    rarity: 'common',
    category: 'toy',
    effect: { happiness: 25 },
    triggerAnim: 'happy',
    description: '조용히 함께 책을 봐요.',
  },
];

export const CLEAN_ITEMS = [
  {
    id: 'clean_brush',
    name: '빗',
    emoji: '🪮',
    cost: 40,
    rarity: 'common',
    category: 'clean',
    effect: { cleanliness: 40 },
    triggerAnim: 'happy',
    description: '털을 부드럽게 빗어줘요.',
  },
  {
    id: 'clean_shampoo',
    name: '샴푸',
    emoji: '🧴',
    cost: 60,
    rarity: 'uncommon',
    category: 'clean',
    effect: { cleanliness: 70 },
    triggerAnim: 'surprised',
    description: '목욕은 싫지만 결과는 좋아.',
  },
  {
    id: 'clean_towel',
    name: '포근한 수건',
    emoji: '🧸',
    cost: 30,
    rarity: 'common',
    category: 'clean',
    effect: { cleanliness: 25, happiness: 10 },
    triggerAnim: 'happy',
    description: '따뜻하게 닦아주면 기분도 UP.',
  },
];

export const COSMETIC_ITEMS = [
  // 모자
  { id: 'hat_crown',  name: '왕관',     emoji: '👑', category: 'hat',       cost: 150, rarity: 'legendary' },
  { id: 'hat_cap',    name: '야구모자', emoji: '🧢', category: 'hat',       cost: 80,  rarity: 'common'    },
  { id: 'hat_tophat', name: '실크햇',   emoji: '🎩', category: 'hat',       cost: 120, rarity: 'rare'      },
  { id: 'hat_grad',   name: '졸업모자', emoji: '🎓', category: 'hat',       cost: 100, rarity: 'uncommon'  },
  // 옷
  { id: 'clothes_shirt',   name: '티셔츠', emoji: '👕', category: 'clothes', cost: 100, rarity: 'common'   },
  { id: 'clothes_dress',   name: '드레스', emoji: '👗', category: 'clothes', cost: 150, rarity: 'rare'     },
  { id: 'clothes_uniform', name: '운동복', emoji: '🎽', category: 'clothes', cost: 80,  rarity: 'common'   },
  // 악세사리
  { id: 'acc_glasses', name: '선글라스',    emoji: '🕶️', category: 'accessory', cost: 70,  rarity: 'uncommon'  },
  { id: 'acc_ribbon',  name: '리본',        emoji: '🎀', category: 'accessory', cost: 60,  rarity: 'common'    },
  { id: 'acc_gem',     name: '보석 목걸이', emoji: '💎', category: 'accessory', cost: 130, rarity: 'rare'      },
];

// Flat lookup maps
export const SHOP_ITEMS_BY_CATEGORY = {
  food:  FOOD_ITEMS,
  toy:   TOY_ITEMS,
  clean: CLEAN_ITEMS,
};

export const ALL_SHOP_ITEMS = [...FOOD_ITEMS, ...TOY_ITEMS, ...CLEAN_ITEMS];

export const SHOP_ITEM_MAP = Object.fromEntries(ALL_SHOP_ITEMS.map(i => [i.id, i]));

export const CATEGORY_LABELS = {
  food:     '먹이',
  toy:      '장난감',
  clean:    '청결',
  cosmetic: '코스튬',
  theme:    '꾸미기',
};

// Firestore pet document shape (reference)
// pets/{uid}: {
//   type, name, stage, stageXp,
//   hunger, happiness, cleanliness,
//   lastDecayAt (unix ms),
//   equipped: { hat, clothes, accessory },
//   inventory: { [itemId]: qty },
//   updatedAt,
// }

// Decay rates (per hour)
export const DECAY_RATES = {
  hunger:      2,
  happiness:   1,
  cleanliness: 0.5,
};
