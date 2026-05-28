import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUsername, saveUsername, getAge, saveAge, getTestOriginalUsername, saveTestOriginalUsername } from '../database/database';

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
  const [showAdultVerify, setShowAdultVerify] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [birthYearError, setBirthYearError] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setName(getUsername());
      const saved = getAge();
      setAgeText(saved > 0 ? String(saved) : '');
      setIsTestMode(!!getTestOriginalUsername());
    }, [])
  );

  const handleSwitchToTest = () => {
    const original = getUsername();
    if (!original) return;
    Alert.alert(
      '테스트 계정으로 전환',
      `현재 닉네임 "${original}"을 보존하고\n임시 계정으로 전환합니다.\n\n신고 버튼 테스트 후 "원래 계정으로 복원"을 눌러주세요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전환',
          onPress: () => {
            saveTestOriginalUsername(original);
            saveUsername('테스트_임시계정');
            setName('테스트_임시계정');
            setIsTestMode(true);
          },
        },
      ]
    );
  };

  const handleSwitchToAdmin = () => {
    const original = getUsername();
    if (!original) return;
    Alert.alert(
      '운영자 테스트 계정으로 전환',
      `현재 닉네임 "${original}"을 보존하고\n운영자 계정(nireat)으로 전환합니다.\n\n관리자 기능 테스트 후 "원래 계정으로 복원"을 눌러주세요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '전환',
          onPress: () => {
            saveTestOriginalUsername(original);
            saveUsername('nireat');
            setName('nireat');
            setIsTestMode(true);
          },
        },
      ]
    );
  };

  const handleRestoreAccount = () => {
    const original = getTestOriginalUsername();
    if (!original) return;
    saveUsername(original);
    saveTestOriginalUsername('');
    setName(original);
    setIsTestMode(false);
    Alert.alert('복원 완료', `"${original}" 계정으로 복원되었습니다.`);
  };

  const parsedAge = parseInt(ageText, 10);
  const ageValid = ageText === '' || (!isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 120);
  const canSave = name.trim().length > 0 && ageValid;

  const doSave = () => {
    saveUsername(name.trim());
    saveAge(ageText === '' ? 0 : parsedAge);
    router.back();
  };

  const handleSave = () => {
    if (!canSave) return;
    if (!isNaN(parsedAge) && parsedAge >= 19) {
      setBirthYear('');
      setBirthYearError('');
      setShowAdultVerify(true);
      return;
    }
    doSave();
  };

  const handleVerifyAdult = () => {
    const year = parseInt(birthYear, 10);
    const thisYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > thisYear) {
      setBirthYearError('올바른 출생연도를 입력해주세요');
      return;
    }
    if (thisYear - year < 19) {
      setBirthYearError('출생연도 기준 만 19세 미만입니다');
      return;
    }
    setShowAdultVerify(false);
    doSave();
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

        {name === 'nireat' && (
          <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/admin-reports')} activeOpacity={0.8}>
            <Ionicons name="shield-outline" size={15} color="#fff" />
            <Text style={styles.adminBtnText}>신고 내역 관리</Text>
          </TouchableOpacity>
        )}

        <View style={styles.testSection}>
          <View style={styles.testHeader}>
            <Ionicons name="flask-outline" size={15} color="#9E9E9E" />
            <Text style={styles.testLabel}>개발자 테스트</Text>
          </View>
          {isTestMode ? (
            <>
              <View style={styles.testModeBadge}>
                <Ionicons name="warning-outline" size={14} color="#FF9800" />
                <Text style={styles.testModeBadgeText}>
                  {name === 'nireat' ? '운영자 테스트 계정 사용 중' : '임시 테스트 계정 사용 중'}
                </Text>
              </View>
              <TouchableOpacity style={styles.restoreBtn} onPress={handleRestoreAccount} activeOpacity={0.8}>
                <Ionicons name="refresh-outline" size={15} color="#6750A4" />
                <Text style={styles.restoreBtnText}>원래 계정으로 복원</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.testBtn} onPress={handleSwitchToTest} activeOpacity={0.8}>
                <Ionicons name="person-add-outline" size={15} color="#9E9E9E" />
                <Text style={styles.testBtnText}>임시 테스트 계정으로 전환</Text>
              </TouchableOpacity>
              {name !== 'nireat' && (
                <TouchableOpacity style={styles.testBtn} onPress={handleSwitchToAdmin} activeOpacity={0.8}>
                  <Ionicons name="shield-outline" size={15} color="#9E9E9E" />
                  <Text style={styles.testBtnText}>운영자 테스트 계정으로 전환</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={showAdultVerify} transparent animationType="fade">
        <View style={styles.verifyOverlay}>
          <View style={styles.verifyBox}>
            <View style={styles.verifyIconRow}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#6750A4" />
            </View>
            <Text style={styles.verifyTitle}>성인 인증</Text>
            <Text style={styles.verifyDesc}>
              19세 이상 연령대 설정 시 본인 확인이 필요합니다.{'\n'}
              출생연도를 입력해 만 나이를 검증합니다.
            </Text>

            <Text style={styles.verifyLabel}>출생연도 (예: 1995)</Text>
            <TextInput
              style={[styles.verifyInput, birthYearError ? styles.verifyInputError : null]}
              placeholder="YYYY"
              placeholderTextColor="#B0A8C0"
              value={birthYear}
              onChangeText={(t) => { setBirthYear(t); setBirthYearError(''); }}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={handleVerifyAdult}
              autoFocus
            />
            {!!birthYearError && (
              <Text style={styles.verifyError}>{birthYearError}</Text>
            )}

            <View style={styles.verifyBtns}>
              <TouchableOpacity
                style={styles.verifyCancelBtn}
                onPress={() => setShowAdultVerify(false)}
              >
                <Text style={styles.verifyCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.verifyConfirmBtn}
                onPress={handleVerifyAdult}
              >
                <Text style={styles.verifyConfirmText}>인증 완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
  },
  adminBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  testSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
    gap: 10,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  testLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    fontWeight: '600',
  },
  testModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  testModeBadgeText: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: '600',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  testBtnText: {
    fontSize: 13,
    color: '#9E9E9E',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  restoreBtnText: {
    fontSize: 13,
    color: '#6750A4',
    fontWeight: '600',
  },

  verifyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  verifyBox: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 8,
  },
  verifyIconRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  verifyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B1F',
    textAlign: 'center',
  },
  verifyDesc: {
    fontSize: 13,
    color: '#6B6278',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  verifyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#49454F',
    marginTop: 4,
  },
  verifyInput: {
    backgroundColor: '#FAF8FE',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 18,
    color: '#1C1B1F',
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
    textAlign: 'center',
    letterSpacing: 4,
    marginTop: 4,
  },
  verifyInputError: {
    borderColor: '#B3261E',
  },
  verifyError: {
    fontSize: 12,
    color: '#B3261E',
    textAlign: 'center',
  },
  verifyBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  verifyCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
    alignItems: 'center',
  },
  verifyCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6278',
  },
  verifyConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#6750A4',
    alignItems: 'center',
  },
  verifyConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
