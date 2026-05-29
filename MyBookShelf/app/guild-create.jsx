import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserId, getUsername, getSchool, getSchoolLevel, saveGuildId } from '../database/database';
import { createGuild } from '../database/guildDatabase';

export default function GuildCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState('5');
  const [isPublic, setIsPublic] = useState(true);
  const [agePolicy, setAgePolicy] = useState('all');
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [loading, setLoading] = useState(false);

  const AGE_POLICIES = [
    { value: 'all',   label: '전체 이용',      icon: 'people-outline',  color: '#4CAF50', bg: '#E8F5E9' },
    { value: 'adult', label: '성인 전용',       icon: 'person-outline',  color: '#E57373', bg: '#FEEBEE' },
    { value: 'minor', label: '미성년자 전용',   icon: 'happy-outline',   color: '#42A5F5', bg: '#E3F2FD' },
  ];

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (kw.length > 10) { Alert.alert('알림', '키워드는 10자 이내로 입력해주세요.'); return; }
    if (keywords.length >= 5) { Alert.alert('알림', '키워드는 최대 5개까지 추가할 수 있습니다.'); return; }
    if (keywords.includes(kw)) { setKeywordInput(''); return; }
    setKeywords([...keywords, kw]);
    setKeywordInput('');
  };

  const removeKeyword = (kw) => setKeywords(keywords.filter((k) => k !== kw));

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('오류', '길드 이름을 입력해주세요.');
      return;
    }
    if (name.trim().length > 20) {
      Alert.alert('오류', '길드 이름은 20자 이내로 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';
      const school = getSchool();
      const schoolLevel = getSchoolLevel();

      const { guildId, inviteCode } = await createGuild({
        name: name.trim(),
        isPublic,
        weeklyGoal: parseInt(weeklyGoal) || 5,
        userId,
        displayName,
        school,
        schoolLevel,
        keywords,
        agePolicy,
      });

      saveGuildId(guildId);

      Alert.alert(
        '길드 생성 완료!',
        `초대 코드: ${inviteCode}\n친구들에게 코드를 알려주세요.`,
        [{ text: '확인', onPress: () => router.navigate('/(tabs)/guild') }],
      );
    } catch (e) {
      Alert.alert('오류', e.message || '길드 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <Text style={styles.label}>길드 이름</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="ex) 책벌레 모임"
          placeholderTextColor="#aaa"
          maxLength={20}
        />
        <Text style={styles.hint}>{name.length}/20</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>이번 주 목표 (완독 권수)</Text>
        <View style={styles.goalRow}>
          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => setWeeklyGoal((v) => String(Math.max(1, parseInt(v) - 1)))}
          >
            <Ionicons name="remove" size={20} color="#6750A4" />
          </TouchableOpacity>
          <Text style={styles.goalValue}>{weeklyGoal}권</Text>
          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => setWeeklyGoal((v) => String(Math.min(100, parseInt(v) + 1)))}
          >
            <Ionicons name="add" size={20} color="#6750A4" />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>길드원 전체가 이번 주에 완독할 목표 권수입니다.</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.label}>공개 길드</Text>
            <Text style={styles.hint}>공개 시 누구나 검색해서 가입할 수 있습니다.</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            thumbColor={isPublic ? '#6750A4' : '#ccc'}
            trackColor={{ false: '#e0e0e0', true: '#D0BCFF' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>연령 정책</Text>
        <View style={styles.agePolicyRow}>
          {AGE_POLICIES.map((p) => {
            const active = agePolicy === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.agePolicyBtn, active && { borderColor: p.color, backgroundColor: p.bg }]}
                onPress={() => setAgePolicy(p.value)}
                activeOpacity={0.75}
              >
                <Ionicons name={p.icon} size={18} color={active ? p.color : '#aaa'} />
                <Text style={[styles.agePolicyText, active && { color: p.color }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          {agePolicy === 'adult' && '성인(19세 이상)만 가입할 수 있는 길드입니다.'}
          {agePolicy === 'minor' && '미성년자(18세 이하)만 가입할 수 있는 길드입니다.'}
          {agePolicy === 'all' && '나이 제한 없이 누구나 가입할 수 있습니다.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>키워드 (선택)</Text>
        <View style={styles.keywordInputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={keywordInput}
            onChangeText={setKeywordInput}
            placeholder="ex) 판타지, 추리소설"
            placeholderTextColor="#aaa"
            maxLength={10}
            onSubmitEditing={addKeyword}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.kwAddBtn} onPress={addKeyword}>
            <Text style={styles.kwAddBtnText}>추가</Text>
          </TouchableOpacity>
        </View>
        {keywords.length > 0 && (
          <View style={styles.kwChips}>
            {keywords.map((kw) => (
              <TouchableOpacity key={kw} style={styles.kwChip} onPress={() => removeKeyword(kw)}>
                <Text style={styles.kwChipText}>{kw}</Text>
                <Ionicons name="close" size={12} color="#6750A4" />
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.hint}>최대 5개 · 탭하면 삭제 · 공개 길드 검색 시 활용됩니다</Text>
      </View>

      <TouchableOpacity
        style={[styles.createBtn, loading && styles.createBtnDisabled]}
        onPress={handleCreate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="people" size={18} color="#fff" />
            <Text style={styles.createBtnText}>길드 만들기</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F5FF',
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0D6F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 4,
  },
  goalBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0EAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#6750A4',
    minWidth: 60,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  createBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  keywordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kwAddBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  kwAddBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  kwChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  kwChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE7F6',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  kwChipText: {
    fontSize: 13,
    color: '#6750A4',
    fontWeight: '600',
  },
  agePolicyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  agePolicyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0D6F0',
    backgroundColor: '#FAFAFA',
  },
  agePolicyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaa',
    textAlign: 'center',
  },
});
