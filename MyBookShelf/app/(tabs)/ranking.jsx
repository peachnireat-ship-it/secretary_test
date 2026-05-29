import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Keyboard, Modal, FlatList, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getWeeklyScore, getSchool, saveSchool, getWeekKey, getSchoolLevel, saveSchoolLevel, getWeeklyDoubleXpEvent, getCompany, saveCompany, getCompanyType, saveCompanyType, getAge } from '../../database/database';

const SCHOOL_POOL_TAGGED = [
  { name: '서울교육대학교부설초등학교', level: '초등' },
  { name: '경인교육대학교부설초등학교', level: '초등' },
  { name: '한국교원대학교부설초등학교', level: '초등' },
  { name: '서울사범대학부설초등학교', level: '초등' },
  { name: '대원초등학교', level: '초등' },
  { name: '계성초등학교', level: '초등' },
  { name: '영훈초등학교', level: '초등' },
  { name: '한신초등학교', level: '초등' },
  { name: '경기초등학교', level: '초등' },
  { name: '부산교육대학교부설초등학교', level: '초등' },
  { name: '광주교육대학교부설초등학교', level: '초등' },
  { name: '대구교육대학교부설초등학교', level: '초등' },
  { name: '서울대학교사범대학부설중학교', level: '중등' },
  { name: '이화여자대학교사범대학부속중학교', level: '중등' },
  { name: '경기여자중학교', level: '중등' },
  { name: '대원중학교', level: '중등' },
  { name: '숙명여자중학교', level: '중등' },
  { name: '성신여자중학교', level: '중등' },
  { name: '목동중학교', level: '중등' },
  { name: '반포중학교', level: '중등' },
  { name: '중산중학교', level: '중등' },
  { name: '자양중학교', level: '중등' },
  { name: '분당중학교', level: '중등' },
  { name: '부산대학교사범대학부설중학교', level: '중등' },
  { name: '서울과학고등학교', level: '고등' },
  { name: '경기과학고등학교', level: '고등' },
  { name: '광주과학고등학교', level: '고등' },
  { name: '대전과학고등학교', level: '고등' },
  { name: '세종과학예술영재학교', level: '고등' },
  { name: '민족사관고등학교', level: '고등' },
  { name: '외대부고', level: '고등' },
  { name: '하나고등학교', level: '고등' },
  { name: '경기외국어고등학교', level: '고등' },
  { name: '한영외국어고등학교', level: '고등' },
  { name: '대원외국어고등학교', level: '고등' },
  { name: '서울외국어고등학교', level: '고등' },
  { name: '용인외국어고등학교', level: '고등' },
  { name: '인천외국어고등학교', level: '고등' },
  { name: '서울대학교', level: '대학' },
  { name: '연세대학교', level: '대학' },
  { name: '고려대학교', level: '대학' },
  { name: 'KAIST', level: '대학' },
  { name: 'POSTECH', level: '대학' },
  { name: '성균관대학교', level: '대학' },
  { name: '한양대학교', level: '대학' },
  { name: '이화여자대학교', level: '대학' },
  { name: '서강대학교', level: '대학' },
  { name: '중앙대학교', level: '대학' },
];

const UNIVERSITY_LIST = [
  { name: '서울대학교', location: '서울특별시' },
  { name: '연세대학교', location: '서울특별시' },
  { name: '고려대학교', location: '서울특별시' },
  { name: '성균관대학교', location: '서울특별시' },
  { name: '한양대학교', location: '서울특별시' },
  { name: '이화여자대학교', location: '서울특별시' },
  { name: '서강대학교', location: '서울특별시' },
  { name: '중앙대학교', location: '서울특별시' },
  { name: '경희대학교', location: '서울특별시' },
  { name: '한국외국어대학교', location: '서울특별시' },
  { name: '서울시립대학교', location: '서울특별시' },
  { name: '건국대학교', location: '서울특별시' },
  { name: '동국대학교', location: '서울특별시' },
  { name: '홍익대학교', location: '서울특별시' },
  { name: '숙명여자대학교', location: '서울특별시' },
  { name: '숭실대학교', location: '서울특별시' },
  { name: '광운대학교', location: '서울특별시' },
  { name: '명지대학교', location: '서울특별시' },
  { name: '국민대학교', location: '서울특별시' },
  { name: '덕성여자대학교', location: '서울특별시' },
  { name: '동덕여자대학교', location: '서울특별시' },
  { name: '서울여자대학교', location: '서울특별시' },
  { name: '성신여자대학교', location: '서울특별시' },
  { name: '세종대학교', location: '서울특별시' },
  { name: '상명대학교', location: '서울특별시' },
  { name: '삼육대학교', location: '서울특별시' },
  { name: '한성대학교', location: '서울특별시' },
  { name: '서울과학기술대학교', location: '서울특별시' },
  { name: '서울교육대학교', location: '서울특별시' },
  { name: '한국예술종합학교', location: '서울특별시' },
  { name: '한국방송통신대학교', location: '서울특별시' },
  { name: 'KAIST', location: '대전광역시' },
  { name: '한국과학기술원', location: '대전광역시' },
  { name: 'POSTECH', location: '경상북도' },
  { name: '포항공과대학교', location: '경상북도' },
  { name: 'UNIST', location: '울산광역시' },
  { name: '울산과학기술원', location: '울산광역시' },
  { name: 'DGIST', location: '대구광역시' },
  { name: '대구경북과학기술원', location: '대구광역시' },
  { name: 'GIST', location: '광주광역시' },
  { name: '광주과학기술원', location: '광주광역시' },
  { name: '인하대학교', location: '인천광역시' },
  { name: '아주대학교', location: '경기도' },
  { name: '가천대학교', location: '경기도' },
  { name: '경기대학교', location: '경기도' },
  { name: '강남대학교', location: '경기도' },
  { name: '단국대학교', location: '경기도' },
  { name: '수원대학교', location: '경기도' },
  { name: '성결대학교', location: '경기도' },
  { name: '안양대학교', location: '경기도' },
  { name: '평택대학교', location: '경기도' },
  { name: '협성대학교', location: '경기도' },
  { name: '대진대학교', location: '경기도' },
  { name: '신한대학교', location: '경기도' },
  { name: '차의과학대학교', location: '경기도' },
  { name: '한국항공대학교', location: '경기도' },
  { name: '경인교육대학교', location: '경기도' },
  { name: '가톨릭대학교', location: '경기도' },
  { name: '부산대학교', location: '부산광역시' },
  { name: '동아대학교', location: '부산광역시' },
  { name: '부경대학교', location: '부산광역시' },
  { name: '동의대학교', location: '부산광역시' },
  { name: '신라대학교', location: '부산광역시' },
  { name: '경성대학교', location: '부산광역시' },
  { name: '경북대학교', location: '대구광역시' },
  { name: '계명대학교', location: '대구광역시' },
  { name: '영남대학교', location: '경상북도' },
  { name: '한동대학교', location: '경상북도' },
  { name: '경상국립대학교', location: '경상남도' },
  { name: '인제대학교', location: '경상남도' },
  { name: '창원대학교', location: '경상남도' },
  { name: '경남대학교', location: '경상남도' },
  { name: '울산대학교', location: '울산광역시' },
  { name: '전남대학교', location: '광주광역시' },
  { name: '조선대학교', location: '광주광역시' },
  { name: '전북대학교', location: '전라북도' },
  { name: '전주대학교', location: '전라북도' },
  { name: '원광대학교', location: '전라북도' },
  { name: '군산대학교', location: '전라북도' },
  { name: '목포대학교', location: '전라남도' },
  { name: '순천대학교', location: '전라남도' },
  { name: '목포해양대학교', location: '전라남도' },
  { name: '충남대학교', location: '대전광역시' },
  { name: '한남대학교', location: '대전광역시' },
  { name: '배재대학교', location: '대전광역시' },
  { name: '우송대학교', location: '대전광역시' },
  { name: '대전대학교', location: '대전광역시' },
  { name: '목원대학교', location: '대전광역시' },
  { name: '공주대학교', location: '충청남도' },
  { name: '순천향대학교', location: '충청남도' },
  { name: '남서울대학교', location: '충청남도' },
  { name: '충북대학교', location: '충청북도' },
  { name: '청주대학교', location: '충청북도' },
  { name: '서원대학교', location: '충청북도' },
  { name: '한국교통대학교', location: '충청북도' },
  { name: '강원대학교', location: '강원도' },
  { name: '한림대학교', location: '강원도' },
  { name: '강릉원주대학교', location: '강원도' },
  { name: '가톨릭관동대학교', location: '강원도' },
  { name: '제주대학교', location: '제주특별자치도' },
];

const COMPANY_POOL = [
  '삼성전자', 'LG전자', 'SK하이닉스', '현대자동차', '카카오',
  '네이버', '쿠팡', '토스', '당근마켓', '크래프톤',
  '넥슨', '엔씨소프트', '하이브', 'SM엔터테인먼트', '셀트리온',
  'KB국민은행', '신한은행', '우리은행', '롯데쇼핑', 'CJ제일제당',
];
const COMPANY_TYPES = ['스타트업', '중소기업', '대기업', '프리랜서'];
const MEDALS = ['🥇', '🥈', '🥉'];
const SCHOOL_LEVELS = ['초등', '중학', '고등', '대학', '성인'];
const RANKING_FILTERS = ['전체', '초등', '중등', '고등', '대학', '회사'];
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const LEVEL_DISPLAY = {
  '초등': '초등학교',
  '중학': '중학교',
  '중등': '중학교',
  '고등': '고등학교',
  '대학': '대학교',
  '성인': '성인',
};

function normalizeLevel(level) {
  return level === '중학' ? '중등' : level;
}

function DoubleXpBanner({ event }) {
  if (!event) return null;
  const now = Date.now();
  const { startTs, endTs } = event;

  const startDate = new Date(startTs);
  const endHour = new Date(endTs).getHours();
  const dayLabel = DAY_LABELS[startDate.getDay() === 0 ? 6 : startDate.getDay() - 1];
  const startHour = startDate.getHours();
  const timeLabel = `${startHour}:00 ~ ${endHour}:00`;

  if (now > endTs) {
    return (
      <View style={styles.doubleXpBannerEnded}>
        <Text style={styles.doubleXpEndedTitle}>이번 주 경험치 2배 이벤트 종료</Text>
        <Text style={styles.doubleXpEndedSub}>{dayLabel}요일 {timeLabel} · 다음 주 이벤트를 기대해 주세요!</Text>
      </View>
    );
  }

  const isActive = now >= startTs;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const eventDayStart = new Date(startTs).setHours(0, 0, 0, 0);
  const isToday = todayStart === eventDayStart;

  if (isActive) {
    return (
      <View style={styles.doubleXpBannerActive}>
        <Text style={styles.doubleXpActiveBadge}>LIVE</Text>
        <View style={styles.doubleXpBannerBody}>
          <Text style={styles.doubleXpActiveTitle}>⚡ 경험치 2배 이벤트 진행 중!</Text>
          <Text style={styles.doubleXpActiveSub}>지금 독서 기록 시 경험치 2배 ({endHour}:00까지)</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.doubleXpBanner}>
      <Text style={styles.doubleXpBannerTitle}>
        {isToday ? '⚡ 오늘 경험치 2배 이벤트 예정' : `📅 이번 주 경험치 2배 이벤트`}
      </Text>
      <Text style={styles.doubleXpBannerSub}>
        {isToday ? timeLabel : `${dayLabel}요일 ${timeLabel}`} 독서 기록 시 경험치 2배!
      </Text>
    </View>
  );
}

function nameHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}

function seededScore(weekNum, nameSeed) {
  let s = (weekNum * 1000003 + nameSeed) & 0x7fffffff;
  s = ((s * 1664525) + 1013904223) & 0x7fffffff;
  s = ((s * 1664525) + 1013904223) & 0x7fffffff;
  return Math.round((s / 0x7fffffff) * 600);
}

function buildFilteredLeaderboard(userSchool, userLevel, userScore, weekKey, filterLevel) {
  if (!weekKey) return [];
  const weekNum = parseInt(weekKey.replace('-W', ''), 10);

  const filteredPool = filterLevel === '전체'
    ? SCHOOL_POOL_TAGGED
    : SCHOOL_POOL_TAGGED.filter((e) => e.level === filterLevel);

  const poolWithoutUser = filteredPool.filter((e) => e.name !== userSchool);
  const others = poolWithoutUser.map((entry) => ({
    name: entry.name,
    level: entry.level,
    score: seededScore(weekNum, nameHash(entry.name)),
    isUser: false,
  }));

  let all = [...others];
  if (userSchool) {
    const userInFilter = filterLevel === '전체' || userLevel === filterLevel;
    if (userInFilter) {
      all.push({ name: userSchool, level: userLevel, score: userScore, isUser: true });
    }
  }

  all.sort((a, b) => b.score - a.score);
  return all.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

function buildCompanyLeaderboard(userCompany, userScore, weekKey) {
  if (!weekKey) return [];
  const weekNum = parseInt(weekKey.replace('-W', ''), 10);
  const pool = COMPANY_POOL.filter((c) => c !== userCompany);
  const others = pool.map((company) => ({
    name: company,
    score: seededScore(weekNum * 2, nameHash(company)),
    isUser: false,
  }));
  const all = userCompany
    ? [...others, { name: userCompany, score: userScore, isUser: true }]
    : others;
  all.sort((a, b) => b.score - a.score);
  return all.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}

function getDaysLeftInWeek() {
  const day = new Date().getDay();
  return day === 0 ? 0 : 7 - day;
}

function searchUniversitiesLocal(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return UNIVERSITY_LIST
    .filter((u) => u.name.toLowerCase().includes(q))
    .map((u) => ({ name: u.name, location: u.location, address: '', type: '대학교' }));
}

async function searchSchools(query) {
  if (!query.trim()) return [];
  const [neisResult, uniResult] = await Promise.allSettled([
    (async () => {
      const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=${encodeURIComponent(query.trim())}&pSize=20`;
      const res = await fetch(url);
      const json = await res.json();
      const info = json.schoolInfo;
      if (!info || !info[1]?.row) return [];
      return info[1].row.map((s) => ({
        name: s.SCHUL_NM,
        location: s.LCTN_SC_NM,
        address: s.ORG_RDNMA,
        type: s.SCHUL_KND_SC_NM,
      }));
    })(),
    Promise.resolve(searchUniversitiesLocal(query)),
  ]);
  const neis = neisResult.status === 'fulfilled' ? neisResult.value : [];
  const unis = uniResult.status === 'fulfilled' ? uniResult.value : [];
  const seen = new Set(neis.map((s) => s.name));
  return [...neis, ...unis.filter((u) => !seen.has(u.name))];
}

export default function RankingScreen() {
  const [school, setSchool] = useState('');
  const [inputSchool, setInputSchool] = useState('');
  const [userScore, setUserScore] = useState(0);
  const [editingSchool, setEditingSchool] = useState(false);
  const [weekKey, setWeekKey] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [doubleXpEvent, setDoubleXpEvent] = useState(null);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [company, setCompany] = useState('');
  const [inputCompany, setInputCompany] = useState('');
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyType, setCompanyType] = useState('');
  const [selectedCompanyType, setSelectedCompanyType] = useState('');
  const [companySearchModalVisible, setCompanySearchModalVisible] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companySearchResults, setCompanySearchResults] = useState([]);
  const [userAge, setUserAge] = useState(0);
  const [rankingFilter, setRankingFilter] = useState('전체');

  const handleSearch = async () => {
    Keyboard.dismiss();
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await searchSchools(searchQuery);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSchool = (item) => {
    setInputSchool(item.name);
    if (item.name.includes('초등학교')) setSelectedLevel('초등');
    else if (item.name.includes('중학교')) setSelectedLevel('중학');
    else if (item.name.includes('고등학교')) setSelectedLevel('고등');
    else if (item.name.includes('대학교') || item.name.includes('대학원')) setSelectedLevel('대학');
    setSearchModalVisible(false);
  };

  const handleCompanySearch = (query) => {
    const q = (query ?? companySearchQuery).toLowerCase().trim();
    const results = q
      ? COMPANY_POOL.filter((name) => name.toLowerCase().includes(q))
      : COMPANY_POOL;
    setCompanySearchResults(results);
  };

  const handleSelectCompany = (name) => {
    setInputCompany(name);
    setCompanySearchModalVisible(false);
  };

  useFocusEffect(
    useCallback(() => {
      const age = getAge();
      const excludeAdult = age > 0 && age < 19;
      const saved = getSchool();
      const savedLevel = getSchoolLevel();
      const key = getWeekKey();
      const score = getWeeklyScore(excludeAdult);
      setSchool(saved);
      setInputSchool(saved);
      setSchoolLevel(savedLevel);
      setSelectedLevel(savedLevel);
      setUserScore(score);
      setWeekKey(key);
      const savedCompany = getCompany();
      const savedCompanyType = getCompanyType();
      setCompany(savedCompany);
      setInputCompany(savedCompany);
      setCompanyType(savedCompanyType);
      setSelectedCompanyType(savedCompanyType);
      setDoubleXpEvent(getWeeklyDoubleXpEvent());
      setUserAge(age);
    }, [])
  );

  const handleSaveSchool = () => {
    const trimmed = inputSchool.trim();
    if (!trimmed || !selectedLevel) return;
    saveSchool(trimmed);
    saveSchoolLevel(selectedLevel);
    const key = getWeekKey();
    const score = getWeeklyScore(userAge > 0 && userAge < 19);
    setSchool(trimmed);
    setSchoolLevel(selectedLevel);
    setUserScore(score);
    setWeekKey(key);
    setEditingSchool(false);
    Keyboard.dismiss();
  };

  const handleSaveCompany = () => {
    const trimmed = inputCompany.trim();
    if (!trimmed || !selectedCompanyType) return;
    saveCompany(trimmed);
    saveCompanyType(selectedCompanyType);
    const key = getWeekKey();
    const score = getWeeklyScore(userAge > 0 && userAge < 19);
    setCompany(trimmed);
    setCompanyType(selectedCompanyType);
    setUserScore(score);
    setWeekKey(key);
    setEditingCompany(false);
    Keyboard.dismiss();
  };

  const normalizedUserLevel = normalizeLevel(schoolLevel);
  const isSchoolFilter = rankingFilter !== '회사';

  const currentLeaderboard = isSchoolFilter
    ? buildFilteredLeaderboard(school, normalizedUserLevel, userScore, weekKey, rankingFilter)
    : buildCompanyLeaderboard(company, userScore, weekKey);

  const currentUserRank = currentLeaderboard.find((e) => e.isUser)?.rank ?? null;
  const showSchoolSetup = isSchoolFilter && (!school || editingSchool);
  const showCompanySetup = !isSchoolFilter && (!company || editingCompany);

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>{isSchoolFilter ? '🏆 학교 대항전' : '🏢 회사 대항전'}</Text>
        <Text style={styles.headerWeek}>{weekKey}</Text>
        <Text style={styles.headerDays}>이번 주 마감까지 {getDaysLeftInWeek()}일 남음</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterTabsOuter}
        contentContainerStyle={styles.filterTabsInner}
      >
        {RANKING_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterTab, rankingFilter === filter && styles.filterTabActive]}
            onPress={() => setRankingFilter(filter)}
          >
            <Text style={[styles.filterTabText, rankingFilter === filter && styles.filterTabTextActive]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isSchoolFilter && (showSchoolSetup ? (
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>학교를 등록해주세요</Text>
          <Text style={styles.setupDesc}>
            학교 이름을 입력하면 대항전 순위에 참여할 수 있습니다
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.schoolInput}
              placeholder="학교 이름 입력"
              placeholderTextColor="#9E8FB2"
              value={inputSchool}
              onChangeText={setInputSchool}
              onSubmitEditing={handleSaveSchool}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.searchIconBtn}
              onPress={() => {
                setSearchQuery(inputSchool);
                setSearchResults([]);
                setSearchModalVisible(true);
              }}
            >
              <Text style={styles.searchIconText}>🔍</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.levelLabel}>학교급 선택</Text>
          <View style={styles.levelRow}>
            {SCHOOL_LEVELS.map((lv) => (
              <TouchableOpacity
                key={lv}
                style={[styles.levelBtn, selectedLevel === lv && styles.levelBtnActive]}
                onPress={() => setSelectedLevel(lv)}
              >
                <Text style={[styles.levelBtnText, selectedLevel === lv && styles.levelBtnTextActive]}>
                  {lv === '중학' ? '중등' : lv}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.setupButton, (!inputSchool.trim() || !selectedLevel) && styles.setupButtonDisabled]}
            onPress={handleSaveSchool}
          >
            <Text style={styles.setupButtonText}>등록하기</Text>
          </TouchableOpacity>
          {editingSchool && (
            <TouchableOpacity style={styles.cancelButton} onPress={() => setEditingSchool(false)}>
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <View style={styles.myScoreCard}>
            <View style={styles.myScoreLeft}>
              <Text style={styles.myRankText}>
                {currentUserRank ? `${currentUserRank}위` : '-'}
              </Text>
              <View>
                <Text style={styles.mySchoolName}>{school}</Text>
                <Text style={styles.myLevelText}>{LEVEL_DISPLAY[schoolLevel] ?? ''}</Text>
                <TouchableOpacity onPress={() => setEditingSchool(true)}>
                  <Text style={styles.changeSchoolText}>학교 변경</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.myScoreRight}>
              <Text style={styles.myScoreLabel}>이번 주 점수</Text>
              <Text style={styles.myScoreValue}>{userScore}pt</Text>
            </View>
          </View>

          <DoubleXpBanner event={doubleXpEvent} />

          <View style={styles.scoreGuide}>
            <Text style={styles.scoreGuideTitle}>점수 산정 기준</Text>
            <Text style={styles.scoreGuideText}>
              완독 ×100 · 메모 ×10 · 신규책 ×20 · 연속독서일 ×15 · 미션 XP
            </Text>
          </View>

          <View style={styles.leaderboardCard}>
            <Text style={styles.leaderboardTitle}>
              {rankingFilter === '전체' ? '전체 순위' : `${rankingFilter} 순위`}
            </Text>
            {currentLeaderboard.map((entry) => (
              <View
                key={entry.name}
                style={[styles.rankRow, entry.isUser && styles.rankRowUser]}
              >
                <Text style={[styles.rankNum, entry.rank <= 3 && styles.rankNumTop]}>
                  {entry.rank <= 3 ? MEDALS[entry.rank - 1] : `${entry.rank}위`}
                </Text>
                <Text
                  style={[styles.rankSchool, entry.isUser && styles.rankSchoolUser]}
                  numberOfLines={1}
                >
                  {entry.name}{entry.isUser ? ' ⭐' : ''}
                </Text>
                <Text style={[styles.rankScore, entry.isUser && styles.rankScoreUser]}>
                  {entry.score}pt
                </Text>
              </View>
            ))}
          </View>
        </>
      ))}

      {!isSchoolFilter && (showCompanySetup ? (
        <View style={styles.setupCard}>
          {userAge > 0 && userAge < 19 ? (
            <>
              <Text style={styles.setupTitle}>참여 불가</Text>
              <Text style={styles.setupDesc}>
                회사 대항전은 성인(19세 이상)만 참여할 수 있습니다.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.setupTitle}>회사를 등록해주세요</Text>
              <Text style={styles.setupDesc}>
                회사 이름을 입력하면 대항전 순위에 참여할 수 있습니다
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.schoolInput}
                  placeholder="회사 이름 입력"
                  placeholderTextColor="#9E8FB2"
                  value={inputCompany}
                  onChangeText={setInputCompany}
                  onSubmitEditing={handleSaveCompany}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.searchIconBtn}
                  onPress={() => {
                    setCompanySearchQuery(inputCompany);
                    handleCompanySearch(inputCompany);
                    setCompanySearchModalVisible(true);
                  }}
                >
                  <Text style={styles.searchIconText}>🔍</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.levelLabel}>회사 유형 선택</Text>
              <View style={styles.levelRow}>
                {COMPANY_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.levelBtn, selectedCompanyType === type && styles.levelBtnActive]}
                    onPress={() => setSelectedCompanyType(type)}
                  >
                    <Text style={[styles.levelBtnText, selectedCompanyType === type && styles.levelBtnTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.setupButton, (!inputCompany.trim() || !selectedCompanyType) && styles.setupButtonDisabled]}
                onPress={handleSaveCompany}
              >
                <Text style={styles.setupButtonText}>등록하기</Text>
              </TouchableOpacity>
              {editingCompany && (
                <TouchableOpacity style={styles.cancelButton} onPress={() => setEditingCompany(false)}>
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.myScoreCard}>
            <View style={styles.myScoreLeft}>
              <Text style={styles.myRankText}>{currentUserRank}위</Text>
              <View>
                <Text style={styles.mySchoolName}>{company}</Text>
                <Text style={styles.myLevelText}>{companyType}</Text>
                <TouchableOpacity onPress={() => setEditingCompany(true)}>
                  <Text style={styles.changeSchoolText}>회사 변경</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.myScoreRight}>
              <Text style={styles.myScoreLabel}>이번 주 점수</Text>
              <Text style={styles.myScoreValue}>{userScore}pt</Text>
            </View>
          </View>

          <DoubleXpBanner event={doubleXpEvent} />

          <View style={styles.scoreGuide}>
            <Text style={styles.scoreGuideTitle}>점수 산정 기준</Text>
            <Text style={styles.scoreGuideText}>
              완독 ×100 · 메모 ×10 · 신규책 ×20 · 연속독서일 ×15 · 미션 XP
            </Text>
          </View>

          <View style={styles.leaderboardCard}>
            <Text style={styles.leaderboardTitle}>회사 순위</Text>
            {currentLeaderboard.map((entry) => (
              <View
                key={entry.name}
                style={[styles.rankRow, entry.isUser && styles.rankRowUser]}
              >
                <Text style={[styles.rankNum, entry.rank <= 3 && styles.rankNumTop]}>
                  {entry.rank <= 3 ? MEDALS[entry.rank - 1] : `${entry.rank}위`}
                </Text>
                <Text
                  style={[styles.rankSchool, entry.isUser && styles.rankSchoolUser]}
                  numberOfLines={1}
                >
                  {entry.name}{entry.isUser ? ' ⭐' : ''}
                </Text>
                <Text style={[styles.rankScore, entry.isUser && styles.rankScoreUser]}>
                  {entry.score}pt
                </Text>
              </View>
            ))}
          </View>
        </>
      ))}
    </ScrollView>

    <Modal
      visible={searchModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setSearchModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>학교 검색</Text>
          <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearchRow}>
          <TextInput
            style={styles.modalInput}
            placeholder="학교 이름을 입력하세요"
            placeholderTextColor="#9E8FB2"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoFocus
          />
          <TouchableOpacity style={styles.modalSearchBtn} onPress={handleSearch}>
            <Text style={styles.modalSearchBtnText}>검색</Text>
          </TouchableOpacity>
        </View>
        {searching && <ActivityIndicator color="#6750A4" style={{ marginTop: 24 }} />}
        {!searching && searchResults.length === 0 && searchQuery.trim().length > 0 && (
          <Text style={styles.noResult}>검색 결과가 없습니다</Text>
        )}
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.name + item.address}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultItem} onPress={() => handleSelectSchool(item)}>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultSub}>{item.type} · {item.location}</Text>
              <Text style={styles.resultAddr} numberOfLines={1}>{item.address}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>

    <Modal
      visible={companySearchModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setCompanySearchModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>회사 검색</Text>
          <TouchableOpacity onPress={() => setCompanySearchModalVisible(false)}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearchRow}>
          <TextInput
            style={styles.modalInput}
            placeholder="회사 이름을 입력하세요"
            placeholderTextColor="#9E8FB2"
            value={companySearchQuery}
            onChangeText={(text) => {
              setCompanySearchQuery(text);
              handleCompanySearch(text);
            }}
            returnKeyType="search"
            onSubmitEditing={() => handleCompanySearch(companySearchQuery)}
            autoFocus
          />
          <TouchableOpacity style={styles.modalSearchBtn} onPress={() => handleCompanySearch(companySearchQuery)}>
            <Text style={styles.modalSearchBtnText}>검색</Text>
          </TouchableOpacity>
        </View>
        {companySearchResults.length === 0 && companySearchQuery.trim().length > 0 && (
          <Text style={styles.noResult}>검색 결과가 없습니다</Text>
        )}
        <FlatList
          data={companySearchResults}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultItem} onPress={() => handleSelectCompany(item)}>
              <Text style={styles.resultName}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, paddingBottom: 32 },
  headerBox: {
    backgroundColor: '#6750A4',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerWeek: { fontSize: 13, color: '#D4BBFF', marginBottom: 2 },
  headerDays: { fontSize: 12, color: '#D4BBFF' },
  filterTabsOuter: { marginBottom: 16 },
  filterTabsInner: { gap: 8 },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
  },
  filterTabActive: { backgroundColor: '#6750A4', borderColor: '#6750A4' },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#49454F' },
  filterTabTextActive: { color: '#fff' },
  setupCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  setupTitle: { fontSize: 16, fontWeight: '700', color: '#1C1B1F', marginBottom: 8 },
  setupDesc: { fontSize: 13, color: '#49454F', textAlign: 'center', marginBottom: 20 },
  schoolInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
  },
  levelLabel: { fontSize: 12, fontWeight: '600', color: '#49454F', alignSelf: 'flex-start', marginBottom: 8 },
  levelRow: { flexDirection: 'row', gap: 8, marginBottom: 16, width: '100%' },
  levelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CAC4D0',
    alignItems: 'center',
  },
  levelBtnActive: { borderColor: '#6750A4', backgroundColor: '#EDE7F6' },
  levelBtnText: { fontSize: 13, fontWeight: '600', color: '#49454F' },
  levelBtnTextActive: { color: '#6750A4' },
  setupButton: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 40,
    paddingVertical: 12,
    marginBottom: 8,
  },
  setupButtonDisabled: { backgroundColor: '#CAC4D0' },
  setupButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cancelButton: { paddingVertical: 8 },
  cancelButtonText: { fontSize: 13, color: '#9E8FB2' },
  myScoreCard: {
    backgroundColor: '#6750A4',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  myScoreLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  myRankText: { fontSize: 30, fontWeight: '800', color: '#fff' },
  mySchoolName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  myLevelText: { fontSize: 11, color: '#D4BBFF', marginTop: 2 },
  changeSchoolText: { fontSize: 11, color: '#D4BBFF', marginTop: 4 },
  myScoreRight: { alignItems: 'flex-end' },
  myScoreLabel: { fontSize: 11, color: '#D4BBFF', marginBottom: 2 },
  myScoreValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  scoreGuide: {
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  scoreGuideTitle: { fontSize: 12, fontWeight: '700', color: '#6750A4', marginBottom: 4 },
  scoreGuideText: { fontSize: 11, color: '#49454F', lineHeight: 16 },
  leaderboardCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  leaderboardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1B1F', marginBottom: 12 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F0F8',
  },
  rankRowUser: {
    backgroundColor: '#F3EFF9',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderBottomWidth: 0,
    marginVertical: 2,
  },
  rankNum: { width: 46, fontSize: 13, color: '#49454F', fontWeight: '600' },
  rankNumTop: { fontSize: 18 },
  rankSchool: { flex: 1, fontSize: 13, color: '#1C1B1F', fontWeight: '500' },
  rankSchoolUser: { color: '#6750A4', fontWeight: '700' },
  rankScore: { fontSize: 13, fontWeight: '700', color: '#49454F', marginLeft: 8 },
  rankScoreUser: { color: '#6750A4' },
  inputRow: { flexDirection: 'row', width: '100%', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchIconBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconText: { fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F0F8',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1C1B1F' },
  modalClose: { fontSize: 18, color: '#49454F', padding: 4 },
  modalSearchRow: { flexDirection: 'row', padding: 16, gap: 8 },
  modalInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
  },
  modalSearchBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSearchBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  noResult: { textAlign: 'center', color: '#9E8FB2', marginTop: 32, fontSize: 14 },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F0F8',
  },
  resultName: { fontSize: 15, fontWeight: '700', color: '#1C1B1F', marginBottom: 2 },
  resultSub: { fontSize: 12, color: '#6750A4', fontWeight: '600', marginBottom: 2 },
  resultAddr: { fontSize: 12, color: '#49454F' },
  doubleXpBannerActive: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  doubleXpActiveBadge: {
    backgroundColor: '#fff',
    color: '#E65100',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  doubleXpBannerBody: { flex: 1 },
  doubleXpActiveTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  doubleXpActiveSub: { fontSize: 12, color: '#FFCCBC', marginTop: 2 },
  doubleXpBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  doubleXpBannerTitle: { fontSize: 13, fontWeight: '700', color: '#E65100' },
  doubleXpBannerSub: { fontSize: 12, color: '#F57F17', marginTop: 2 },
  doubleXpBannerEnded: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#BDBDBD',
  },
  doubleXpEndedTitle: { fontSize: 13, fontWeight: '700', color: '#757575' },
  doubleXpEndedSub: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
});
