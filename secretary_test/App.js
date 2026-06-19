import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { C } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import ClientScreen from './src/screens/ClientScreen';
import ProjectScreen from './src/screens/ProjectScreen';
import MessageScreen from './src/screens/MessageScreen';
import MeetingScreen from './src/screens/MeetingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
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
      <Tab.Screen name="홈">{(props) => <HomeScreen {...props} user={user} />}</Tab.Screen>
      <Tab.Screen name="일정" component={ScheduleScreen} />
      <Tab.Screen name="거래처" component={ClientScreen} />
      <Tab.Screen name="프로젝트" component={ProjectScreen} />
      <Tab.Screen name="메세지">{(props) => <MessageScreen {...props} user={user} />}</Tab.Screen>
      <Tab.Screen name="회의록" component={MeetingScreen} />
      <Tab.Screen name="설정">{(props) => <SettingsScreen {...props} user={user} onUserChange={onUserChange} />}</Tab.Screen>
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
