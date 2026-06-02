const API_KEY = process.env.EXPO_PUBLIC_PIXABAY_API_KEY;
const BASE_URL = 'https://pixabay.com/api/videos/';

const QUERIES = {
  cat:        'cat cute',
  dog:        'dog cute',
  rabbit:     'rabbit bunny',
  hamster:    'hamster',
  hedgehog:   'hedgehog',
  chinchilla: 'chinchilla',
  fish:       'fish aquarium',
};

// 세션 내 캐시 (앱 재실행 시 재조회)
const cache = {};

export async function fetchPetVideoUrl(petType) {
  if (cache[petType]) return cache[petType];

  const query = QUERIES[petType] ?? petType;
  const url = `${BASE_URL}?key=${API_KEY}&q=${encodeURIComponent(query)}&video_type=film&per_page=10&safesearch=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.hits?.length) return null;

    // 결과 중 랜덤 선택
    const hit = data.hits[Math.floor(Math.random() * Math.min(data.hits.length, 5))];
    const videoUrl = hit.videos?.tiny?.url ?? hit.videos?.small?.url ?? null;

    if (videoUrl) cache[petType] = videoUrl;
    return videoUrl;
  } catch {
    return null;
  }
}
