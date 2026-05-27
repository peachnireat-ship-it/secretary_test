import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveUsername, saveAge } from '../database/database';

const AGE_GROUPS = [
  { label: '어린이', sub: '~12세', representativeAge: 10 },
  { label: '청소년', sub: '13~18세', representativeAge: 15 },
  { label: '성인', sub: '19세~', representativeAge: 20 },
];

export default function UsernameSetupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showAdultVerify, setShowAdultVerify] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [birthYearError, setBirthYearError] = useState('');

  const canStart = name.trim().length > 0 && selectedGroup !== null;

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
  };

  const handleStart = () => {
    if (!canStart) return;
    if (selectedGroup.label === '성인') {
      setBirthYear('');
      setBirthYearError('');
      setShowAdultVerify(true);
      return;
    }
    saveUsername(name.trim());
    saveAge(selectedGroup.representativeAge);
    router.replace('/(tabs)/home');
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
    saveUsername(name.trim());
    saveAge(selectedGroup.representativeAge);
    router.replace('/(tabs)/home');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrap}>
          <Ionicons name="book" size={64} color="#6750A4" />
        </View>
        <Text style={styles.appName}>MyBookShelf</Text>
        <Text style={styles.welcome}>독서 기록을 시작해볼까요?</Text>

        <Text style={styles.label}>닉네임</Text>
        <TextInput
          style={styles.input}
          placeholder="닉네임을 입력해주세요"
          placeholderTextColor="#B0A8C0"
          value={name}
          onChangeText={setName}
          maxLength={20}
          returnKeyType="done"
          autoFocus
        />

        <Text style={styles.label}>연령대</Text>
        <View style={styles.groupRow}>
          {AGE_GROUPS.map((group) => {
            const active = selectedGroup?.label === group.label;
            return (
              <TouchableOpacity
                key={group.label}
                style={[styles.groupBtn, active && styles.groupBtnActive]}
                onPress={() => handleSelectGroup(group)}
                activeOpacity={0.8}
              >
                <Text style={[styles.groupLabel, active && styles.groupLabelActive]}>
                  {group.label}
                </Text>
                <Text style={[styles.groupSub, active && styles.groupSubActive]}>
                  {group.sub}
                </Text>
                {group.label === '성인' && (
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={12}
                    color={active ? '#fff' : '#9E8FB2'}
                    style={{ marginTop: 2 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedGroup?.label === '성인' && (
          <View style={styles.adultNotice}>
            <Ionicons name="information-circle-outline" size={14} color="#6750A4" />
            <Text style={styles.adultNoticeText}>
              성인 인증을 위해 생년월일을 확인합니다
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, !canStart && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={!canStart}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>시작하기</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showAdultVerify} transparent animationType="fade">
        <View style={styles.verifyOverlay}>
          <View style={styles.verifyBox}>
            <View style={styles.verifyIconRow}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#6750A4" />
            </View>
            <Text style={styles.verifyTitle}>성인 인증</Text>
            <Text style={styles.verifyDesc}>
              성인 연령대 등록을 위해{'\n'}출생연도로 만 나이를 확인합니다
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
  inner: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 10,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1B1F',
    letterSpacing: 0.5,
  },
  welcome: {
    fontSize: 15,
    color: '#49454F',
    marginBottom: 8,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#49454F',
    marginTop: 6,
    marginBottom: 2,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1B1F',
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
  },
  groupRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 2,
  },
  groupBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8DEF8',
    backgroundColor: '#fff',
    gap: 2,
  },
  groupBtnActive: {
    backgroundColor: '#6750A4',
    borderColor: '#6750A4',
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#49454F',
  },
  groupLabelActive: {
    color: '#fff',
  },
  groupSub: {
    fontSize: 11,
    color: '#9E8FB2',
  },
  groupSubActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  adultNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'stretch',
  },
  adultNoticeText: {
    fontSize: 12,
    color: '#6750A4',
    fontWeight: '500',
  },
  button: {
    width: '100%',
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
    shadowColor: '#6750A4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#C4B5D9',
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
