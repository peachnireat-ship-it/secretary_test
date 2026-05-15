import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUsername, saveUsername, getAge, saveAge } from '../database/database';

const AGE_GROUPS = [
  { label: '어린이 (~12세)', range: '15일 + 200페이지', min: 1, max: 12 },
  { label: '청소년 (13~18세)', range: '20일 + 350페이지', min: 13, max: 18 },
  { label: '성인 (19세~)', range: '30일 + 500페이지', min: 19, max: 999 },
];

function getAgeGroup(age) {
  if (!age || age <= 0) return null;
  return AGE_GROUPS.find(g => age >= g.min && age <= g.max) ?? null;
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');

  useFocusEffect(
    useCallback(() => {
      setName(getUsername());
      const saved = getAge();
      setAgeText(saved > 0 ? String(saved) : '');
    }, [])
  );

  const parsedAge = parseInt(ageText, 10);
  const ageValid = ageText === '' || (!isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 120);
  const canSave = name.trim().length > 0 && ageValid;

  const handleSave = () => {
    if (!canSave) return;
    saveUsername(name.trim());
    saveAge(ageText === '' ? 0 : parsedAge);
    router.back();
  };

  const ageGroup = ageValid && parsedAge > 0 ? getAgeGroup(parsedAge) : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1B1F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 편집</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>닉네임</Text>
          <TextInput
            style={styles.input}
            placeholder="닉네임을 입력해주세요"
            placeholderTextColor="#B0A8C0"
            value={name}
            onChangeText={setName}
            maxLength={20}
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>나이</Text>
          <TextInput
            style={[styles.input, !ageValid && styles.inputError]}
            placeholder="나이를 입력해주세요 (선택)"
            placeholderTextColor="#B0A8C0"
            value={ageText}
            onChangeText={setAgeText}
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          {!ageValid && (
            <Text style={styles.errorText}>1~120 사이 숫자를 입력해주세요</Text>
          )}
          {ageGroup && (
            <View style={styles.ageGroupBadge}>
              <Ionicons name="ribbon-outline" size={14} color="#6750A4" />
              <Text style={styles.ageGroupText}>
                {ageGroup.label} · 꾸준한 독서가 목표: {ageGroup.range}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color="#9E9E9E" />
          <Text style={styles.infoText}>
            나이는 뱃지 달성 조건에만 사용됩니다.{'\n'}
            미입력 시 성인 기준(30일 + 500페이지)이 적용됩니다.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>저장하기</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1B1F' },
  content: { padding: 20, gap: 8 },
  section: { marginBottom: 12 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#49454F',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1B1F',
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
  },
  inputError: {
    borderColor: '#B3261E',
  },
  errorText: {
    fontSize: 12,
    color: '#B3261E',
    marginTop: 6,
    marginLeft: 4,
  },
  ageGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ageGroupText: {
    fontSize: 12,
    color: '#6750A4',
    fontWeight: '600',
    flexShrink: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#9E9E9E',
    lineHeight: 18,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  saveBtnDisabled: {
    backgroundColor: '#C4B5D9',
    elevation: 0,
    shadowOpacity: 0,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
