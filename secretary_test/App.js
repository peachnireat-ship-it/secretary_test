import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { C } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import { getCurrentUser } from './src/services/storage';

const Tab = createBottomTabNavigator();

const ICONS = {
  홈: { active: '⬡', inactive: '⬡' },
  일정: { active: '◈', inactive: '◈' },
  거래처: { active: '◉', inactive: '◉' },
  프로젝트: { active: '◧', inactive: '◧' },
  메세지: { active: '◫', inactive: '◫' },
  회의록: { active: '◍', inactive: '◍' },
  설정: { active: '◎', inactive: '◎' },
};

function TabNavigator({ user, onUserChange }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 70 + insets.bottom,
          paddingBottom: 12 + insets.bottom,
          paddingTop: 10,
        },
        tabBarActiveTintColor: tabColor(route.name),
        tabBarInactiveTintColor: C.textDim,
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 0.5, fontWeight: '500' },
        tabBarIcon: ({ focused, color }) => (
          <Text style={{ fontSize: 18, color }}>{ICONS[route.name]?.[focused ? 'active' : 'inactive']}</Text>
        ),
      })}
    >
      {/* getComponent/require()로 실제 탭 방문 시점까지 화면 모듈 로딩을 미룬다 (eager import 시 앱 시작 시 8개 화면 전부 즉시 실행됨) */}
      <Tab.Screen name="홈">{(props) => { const Screen = require('./src/screens/HomeScreen').default; return <Screen {...props} user={user} />; }}</Tab.Screen>
      <Tab.Screen name="일정" getComponent={() => require('./src/screens/ScheduleScreen').default} />
      <Tab.Screen name="거래처" getComponent={() => require('./src/screens/ClientScreen').default} />
      <Tab.Screen name="프로젝트" getComponent={() => require('./src/screens/ProjectScreen').default} />
      <Tab.Screen name="메세지">{(props) => { const Screen = require('./src/screens/MessageScreen').default; return <Screen {...props} user={user} />; }}</Tab.Screen>
      <Tab.Screen name="회의록" getComponent={() => require('./src/screens/MeetingScreen').default} />
      <Tab.Screen name="설정">{(props) => { const Screen = require('./src/screens/SettingsScreen').default; return <Screen {...props} user={user} onUserChange={onUserChange} />; }}</Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    getCurrentUser().then((u) => setUser(u || null));
  }, []);

  if (user === undefined) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accentBlue} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LoginScreen onLogin={(u) => setUser(u)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <TabNavigator key={user?.id} user={user} onUserChange={(u) => setUser(u)} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function tabColor(name) {
  const map = { 홈: C.gold, 일정: C.accentBlue, 거래처: C.accentTeal, 프로젝트: C.red, 메세지: C.accentPurple, 회의록: C.accentTeal, 설정: C.textSecondary };
  return map[name] || C.textPrimary;
}
