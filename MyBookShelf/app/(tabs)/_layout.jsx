import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Pressable, SafeAreaView,
} from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const MENUS = [
  { name: 'home',         title: '홈',          icon: 'home-outline' },
  { name: 'index',        title: '내 서재',      icon: 'library-outline' },
  { name: 'statistics',   title: '통계',         icon: 'bar-chart-outline' },
  { name: 'badges',       title: '뱃지',         icon: 'medal-outline' },
  { name: 'challenge',    title: '챌린지',       icon: 'trophy-outline' },
  { name: 'ranking',      title: '대항전',       icon: 'podium-outline' },
  { name: 'hall-of-fame', title: '명예의 전당',  icon: 'star-outline' },
];

export default function TabLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const navigate = (name) => {
    setMenuOpen(false);
    router.navigate(name === 'index' ? '/(tabs)/' : `/(tabs)/${name}`);
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
        <Tabs.Screen
          name="home"
          options={{
            title: '홈',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: '내 서재',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="statistics"
          options={{
            title: '통계',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="badges"
          options={{
            title: '뱃지',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="medal-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="challenge"
          options={{
            title: '챌린지',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="trophy-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="ranking"
          options={{
            title: '대항전',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="podium-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="hall-of-fame"
          options={{
            title: '명예의 전당',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="star-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>전체 메뉴</Text>
                <TouchableOpacity onPress={() => setMenuOpen(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {MENUS.map((menu) => (
                  <TouchableOpacity
                    key={menu.name}
                    style={styles.menuItem}
                    onPress={() => navigate(menu.name)}
                  >
                    <Ionicons name={menu.icon} size={22} color="#6750A4" style={styles.menuIcon} />
                    <Text style={styles.menuText}>{menu.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
    width: '50%',
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
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0F0',
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#6750A4',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3EEF8',
  },
  menuIcon: {
    marginRight: 14,
  },
  menuText: {
    fontSize: 15,
    color: '#333',
  },
});
