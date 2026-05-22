import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Pressable, SafeAreaView, Switch,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPref, setPref } from '../../database/database';

const ALL_TABS = [
  { name: 'home',         title: '홈',         icon: 'home-outline',      fixed: true },
  { name: 'index',        title: '내 서재',     icon: 'library-outline' },
  { name: 'statistics',   title: '통계',        icon: 'bar-chart-outline' },
  { name: 'badges',       title: '뱃지',        icon: 'medal-outline' },
  { name: 'challenge',    title: '챌린지',      icon: 'trophy-outline' },
  { name: 'ranking',      title: '대항전',      icon: 'podium-outline' },
  { name: 'hall-of-fame',     title: '명예의 전당', icon: 'star-outline' },
  { name: 'reading-pattern', title: '패턴 분석',   icon: 'analytics-outline' },
  { name: 'recommend',       title: '추천 도서',   icon: 'sparkles-outline' },
  { name: 'book-event',      title: '이벤트',      icon: 'flash-outline' },
  { name: 'guild',           title: '독서 길드',   icon: 'people-outline' },
];

const DEFAULT_VISIBLE = ['home', 'index'];
const PREF_KEY = 'visible_tabs';

export default function TabLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [visibleTabs, setVisibleTabs] = useState(DEFAULT_VISIBLE);
  const router = useRouter();

  useEffect(() => {
    const saved = getPref(PREF_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.includes('home')) parsed.unshift('home');
        setVisibleTabs(parsed);
      } catch (_) {}
    }
  }, []);

  const closeDrawer = () => {
    setMenuOpen(false);
    setEditMode(false);
  };

  const navigate = (name) => {
    closeDrawer();
    router.navigate(name === 'index' ? '/(tabs)/' : `/(tabs)/${name}`);
  };

  const toggleTab = (name) => {
    setVisibleTabs((prev) => {
      const next = prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name];
      setPref(PREF_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#6750A4',
          tabBarInactiveTintColor: '#49454F',
          headerStyle: { backgroundColor: '#6750A4' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerRight: () => (
            <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuBtn}>
              <Ionicons name="menu" size={26} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      >
        {ALL_TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={tab.icon} size={size} color={color} />
              ),
              tabBarButton: visibleTabs.includes(tab.name) ? undefined : () => null,
              tabBarItemStyle: visibleTabs.includes(tab.name)
                ? undefined
                : { display: 'none', width: 0 },
            }}
          />
        ))}
      </Tabs>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDrawer}
      >
        <Pressable style={styles.overlay} onPress={closeDrawer}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>
                  {editMode ? '탭 메뉴 편집' : '전체 메뉴'}
                </Text>
                <View style={styles.drawerHeaderActions}>
                  <TouchableOpacity
                    onPress={() => setEditMode((v) => !v)}
                    style={styles.editToggleBtn}
                  >
                    <Ionicons
                      name={editMode ? 'checkmark-done-outline' : 'settings-outline'}
                      size={20}
                      color={editMode ? '#6750A4' : '#888'}
                    />
                    <Text style={[styles.editToggleText, editMode && styles.editToggleActive]}>
                      {editMode ? '완료' : '탭 편집'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={closeDrawer} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
              </View>

              {editMode ? (
                <>
                  <Text style={styles.editHint}>탭 바에 표시할 메뉴를 선택하세요.</Text>
                  <ScrollView>
                    {ALL_TABS.map((tab) => (
                      <View key={tab.name} style={styles.editItem}>
                        <Ionicons
                          name={tab.icon}
                          size={22}
                          color="#6750A4"
                          style={styles.menuIcon}
                        />
                        <Text style={styles.menuText}>{tab.title}</Text>
                        {tab.fixed ? (
                          <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed-outline" size={14} color="#999" />
                            <Text style={styles.lockText}>고정</Text>
                          </View>
                        ) : (
                          <Switch
                            value={visibleTabs.includes(tab.name)}
                            onValueChange={() => toggleTab(tab.name)}
                            thumbColor={visibleTabs.includes(tab.name) ? '#6750A4' : '#ccc'}
                            trackColor={{ false: '#e0e0e0', true: '#D0BCFF' }}
                          />
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <ScrollView>
                  {ALL_TABS.map((menu) => (
                    <TouchableOpacity
                      key={menu.name}
                      style={styles.menuItem}
                      onPress={() => navigate(menu.name)}
                    >
                      <Ionicons
                        name={menu.icon}
                        size={22}
                        color="#6750A4"
                        style={styles.menuIcon}
                      />
                      <Text style={styles.menuText}>{menu.title}</Text>
                      {visibleTabs.includes(menu.name) && (
                        <Ionicons name="radio-button-on" size={14} color="#6750A4" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    marginRight: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '60%',
    backgroundColor: '#fff',
    paddingTop: 48,
    paddingHorizontal: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0F0',
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#6750A4',
  },
  drawerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  editToggleText: {
    fontSize: 12,
    color: '#888',
  },
  editToggleActive: {
    color: '#6750A4',
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 2,
  },
  editHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EEF8',
  },
  editItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EEF8',
  },
  menuIcon: {
    marginRight: 14,
  },
  menuText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  lockText: {
    fontSize: 12,
    color: '#999',
  },
});
