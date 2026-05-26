import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserId, getUsername, getSchool, getSchoolLevel, saveGuildId } from '../database/database';
import { joinGuildByCode, searchPublicGuilds } from '../database/guildDatabase';

export default function GuildJoinScreen() {
  const router = useRouter();
  const { tab: initialTab } = useLocalSearchParams();
  const [tab, setTab] = useState(initialTab === 'search' ? 'search' : 'code');

  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState(null);

  useEffect(() => {
    if (tab === 'search') handleSearch();
  }, [tab]);

  const handleJoinByCode = async () => {
    if (code.trim().length < 6) {
      Alert.alert('오류', '6자리 초대 코드를 입력해주세요.');
      return;
    }
    Keyboard.dismiss();
    setCodeLoading(true);
    try {
      const userId = getUserId();
      const displayName = getUsername() || '독서가';
      const { guildId, guildName } = await joinGuildByCode(
        code.trim(),
        userId,
        displayName,
        getSchool(),
        getSchoolLevel(),
      );
      saveGuildId(guildId);
      Alert.alert('길드 가입 완료!', `'${guildName}'에 가입했습니다.`, [
        { text: '확인', onPress: () => router.navigate('/(tabs)/guild') },
      ]);
    } catch (e) {
      Alert.alert('오류', e.message || '가입에 실패했습니다.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSearch = async () => {
    setSearchLoading(true);
    setSelectedKeyword(null);
    try {
      const results = await searchPublicGuilds(searchText);
      setSearchResults(results);
    } catch (e) {
      Alert.alert('오류', e.message || '검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleJoinPublic = async (guild) => {
    const userId = getUserId();
    try {
      const displayName = getUsername() || '독서가';
      const { guildId } = await joinGuildByCode(
        guild.inviteCode,
        userId,
        displayName,
        getSchool(),
        getSchoolLevel(),
      );
      saveGuildId(guildId);
      Alert.alert('길드 가입 완료!', `'${guild.name}'에 가입했습니다.`, [
        { text: '확인', onPress: () => router.navigate('/(tabs)/guild') },
      ]);
    } catch (e) {
      Alert.alert('오류', e.message || '가입에 실패했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segBtn, tab === 'code' && styles.segBtnActive]}
          onPress={() => setTab('code')}
        >
          <Text style={[styles.segText, tab === 'code' && styles.segTextActive]}>
            초대 코드
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, tab === 'search' && styles.segBtnActive]}
          onPress={() => setTab('search')}
        >
          <Text style={[styles.segText, tab === 'search' && styles.segTextActive]}>
            길드 검색
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'code' ? (
        <View style={styles.codeSection}>
          <Text style={styles.sectionTitle}>초대 코드 입력</Text>
          <Text style={styles.sectionDesc}>길드장에게 받은 6자리 코드를 입력하세요.</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="XXXXXX"
            placeholderTextColor="#bbb"
            maxLength={6}
            autoCapitalize="characters"
            style={styles.codeInput}
          />
          <TouchableOpacity
            style={[styles.joinBtn, codeLoading && styles.joinBtnDisabled]}
            onPress={handleJoinByCode}
            disabled={codeLoading}
          >
            {codeLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.joinBtnText}>가입하기</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="길드 이름 또는 키워드 검색"
              placeholderTextColor="#aaa"
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {(() => {
            const allKeywords = [...new Set(searchResults.flatMap((g) => g.keywords || []))];
            return allKeywords.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.kwFilterRow}
                contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
              >
                {allKeywords.map((kw) => (
                  <TouchableOpacity
                    key={kw}
                    style={[styles.kwFilterChip, selectedKeyword === kw && styles.kwFilterChipActive]}
                    onPress={() => setSelectedKeyword((prev) => (prev === kw ? null : kw))}
                  >
                    <Text style={[styles.kwFilterText, selectedKeyword === kw && styles.kwFilterTextActive]}>
                      #{kw}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null;
          })()}

          {searchLoading ? (
            <ActivityIndicator color="#6750A4" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={selectedKeyword
                ? searchResults.filter((g) => (g.keywords || []).includes(selectedKeyword))
                : searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingTop: 4 }}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Ionicons name="search-outline" size={40} color="#ccc" />
                  <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.guildCard}>
                  <View style={styles.guildInfo}>
                    <Text style={styles.guildName}>{item.name}</Text>
                    <Text style={styles.guildMeta}>
                      멤버 {item.memberCount || 0}명 · 주간 목표 {item.weeklyGoal || 0}권
                    </Text>
                    {item.keywords?.length > 0 && (
                      <View style={styles.kwRow}>
                        {item.keywords.map((kw) => (
                          <View key={kw} style={styles.kwChip}>
                            <Text style={styles.kwChipText}>#{kw}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.joinSmallBtn}
                    onPress={() => handleJoinPublic(item)}
                  >
                    <Text style={styles.joinSmallText}>가입</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F5FF',
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#E8E0F0',
    margin: 16,
    borderRadius: 12,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segBtnActive: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  segText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
  segTextActive: {
    color: '#6750A4',
  },
  codeSection: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 2,
    borderColor: '#D0BCFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6750A4',
    letterSpacing: 6,
    textAlign: 'center',
    width: '100%',
    marginBottom: 20,
  },
  joinBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  joinBtnDisabled: {
    opacity: 0.6,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  searchSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D0BCFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
  },
  searchBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guildCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  guildInfo: {
    flex: 1,
  },
  guildName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  guildMeta: {
    fontSize: 12,
    color: '#888',
  },
  kwRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 7,
  },
  kwChip: {
    backgroundColor: '#EDE7F6',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  kwChipText: {
    fontSize: 11,
    color: '#6750A4',
    fontWeight: '600',
  },
  joinSmallBtn: {
    backgroundColor: '#6750A4',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  joinSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  kwFilterRow: {
    marginBottom: 8,
  },
  kwFilterChip: {
    backgroundColor: '#EDE7F6',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  kwFilterChipActive: {
    backgroundColor: '#6750A4',
  },
  kwFilterText: {
    fontSize: 12,
    color: '#6750A4',
    fontWeight: '600',
  },
  kwFilterTextActive: {
    color: '#fff',
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#bbb',
  },
});
