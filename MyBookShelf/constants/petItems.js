export const PET_TYPES = [
  { id: 'cat',      name: '고양이',   emoji: '🐱', desc: '조용하고 독립적인 성격' },
  { id: 'dog',      name: '강아지',   emoji: '🐶', desc: '활발하고 애교가 많음' },
  { id: 'rabbit',   name: '토끼',     emoji: '🐰', desc: '온순하고 귀여운 초식동물' },
  { id: 'hamster',  name: '햄스터',   emoji: '🐹', desc: '작고 귀여운 야행성 동물' },
  { id: 'hedgehog',  name: '고슴도치', emoji: '🦔', desc: '독특하고 개성 있는 반려동물' },
  { id: 'chinchilla', name: '친칠라',  emoji: '🐭', desc: '폭신폭신한 털이 매력적인 동물' },
  { id: 'fish',      name: '물고기',   emoji: '🐠', desc: '조용히 바라보는 힐링' },
];

export const PET_STAGES = [
  { id: 'baby',   name: '아기',   xpRequired: 0 },
  { id: 'junior', name: '청소년', xpRequired: 500 },
  { id: 'adult',  name: '성인',   xpRequired: 2000 },
  { id: 'senior', name: '시니어', xpRequired: 5000 },
];

export const PET_SHOP_ITEMS = {
  food: [
    { id: 'food_basic',   name: '일반 사료',     emoji: '🥣', cost: 10, effect: { hunger: 30 } },
    { id: 'food_premium', name: '프리미엄 사료', emoji: '🍖', cost: 30, effect: { hunger: 60 } },
    { id: 'food_snack',   name: '간식',           emoji: '🍬', cost: 20, effect: { hunger: 20, happiness: 15 } },
  ],
  toy: [
    { id: 'toy_ball',   name: '공',            emoji: '⚾', cost: 50,  effect: { happiness: 30 } },
    { id: 'toy_rod',    name: '낚시대 장난감', emoji: '🎣', cost: 70,  effect: { happiness: 50 } },
    { id: 'toy_tunnel', name: '터널',           emoji: '🌀', cost: 100, effect: { happiness: 70 } },
  ],
  clean: [
    { id: 'clean_brush',   name: '빗',   emoji: '🪮', cost: 40, effect: { cleanliness: 40 } },
    { id: 'clean_shampoo', name: '샴푸', emoji: '🧴', cost: 60, effect: { cleanliness: 70 } },
  ],
};

export const CATEGORY_LABELS = {
  food:  '먹이',
  toy:   '장난감',
  clean: '청결 용품',
};

// 시간당 감소량
export const DECAY_RATES = {
  hunger:      2,
  happiness:   1,
  cleanliness: 0.5,
};
