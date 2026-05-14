import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveUsername } from '../database/database';

export default function UsernameSetupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');

  const handleStart = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveUsername(trimmed);
    router.replace('/(tabs)/home');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="book" size={64} color="#6750A4" />
        </View>
        <Text style={styles.appName}>MyBookShelf</Text>
        <Text style={styles.welcome}>독서 기록을 시작해볼까요?</Text>
        <Text style={styles.sub}>어떻게 불러드릴까요?</Text>

        <TextInput
          style={styles.input}
          placeholder="닉네임을 입력해주세요"
          placeholderTextColor="#B0A8C0"
          value={name}
          onChangeText={setName}
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={handleStart}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={!name.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>시작하기</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
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
    fontSize: 16,
    color: '#49454F',
    marginTop: 4,
  },
  sub: {
    fontSize: 14,
    color: '#9E8FB2',
    marginBottom: 8,
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
    marginTop: 8,
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
});
