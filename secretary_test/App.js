import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import { UserProvider, useUser } from './src/context/UserContext';

const Tab = createBottomTabNavigator();

const ICONS = {
  홈: { active: '⬡', inactive: '⬡' },
  일정: { active: '◈', inactive: '◈' },
  거래처: { active: '◉', inactive: '◉' },
  프로젝트: { active: '◧', inactive: '◧' },
  메세지: { active: '◫', inactive: '◫' },
  회의록: { active: '◍', inactive: '◍' },
  설정: { active: '◎', inactive: '◎' },
  회사: { active: '◆', inactive: '◆' },
};

function TabNavigator({ isCompanyAdmin }) {
  const insets = useSafeAreaInsets();
  // 웹은 insets.bottom이 0이라 네이티브 기준 여백만으로는 라벨 하단이 살짝 잘림 (브라우저 line-height 보정)
  const webExtraBottom = Platform.OS === 'web' ? 10 : 0;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 70 + insets.bottom + webExtraBottom,
          paddingBottom: 12 + insets.bottom + webExtraBottom,
          paddingTop: 10,
        },
        tabBarActiveTintColor: tabColor(route.name),
        tabBarInactiveTintColor: C.textDim,
        // 웹에서 react-navigation Label은 numberOfLines=1 때문에 overflow:hidden이 걸리는데,
        // CSS flexbox 규칙상 overflow가 visible이 아닌 flex item은 자동 최소 높이(min-height:auto)가
        // 0으로 resolve되어, 부모(탭 아이템) 공간이 부족하면 lineHeight(14px)보다 낮게(심하면 0px까지)
        // 찌그러들고 그 안의 텍스트(특히 한글 받침)가 자체 overflow:hidden에 잘려 안 보인다.
        // flexShrink:0만으로는 "찌그러들지 않게"만 막을 뿐 애초에 min-height:auto가 0으로
        // resolve되는 것 자체는 못 막아서(레이아웃 타이밍에 따라 재현될 수 있음), minHeight를
        // lineHeight와 동일하게 명시로 고정해 텍스트 높이가 절대 0으로 붕괴하지 않게 한다.
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, minHeight: 14, letterSpacing: 0.5, fontWeight: '500', flexShrink: 0 },
        tabBarIcon: ({ focused, color }) => (
          <Text style={{ fontSize: 18, color }}>{ICONS[route.name]?.[focused ? 'active' : 'inactive']}</Text>
        ),
      })}
    >
      {/* getComponent/require()로 실제 탭 방문 시점까지 화면 모듈 로딩을 미룬다 (eager import 시 앱 시작 시 8개 화면 전부 즉시 실행됨) */}
      <Tab.Screen name="홈" getComponent={() => require('./src/screens/HomeScreen').default} />
      <Tab.Screen name="일정" getComponent={() => require('./src/screens/ScheduleScreen').default} />
      <Tab.Screen name="거래처" getComponent={() => require('./src/screens/ClientScreen').default} />
      <Tab.Screen name="프로젝트" getComponent={() => require('./src/screens/ProjectScreen').default} />
      <Tab.Screen name="메세지" getComponent={() => require('./src/screens/MessageScreen').default} />
      <Tab.Screen name="회의록" getComponent={() => require('./src/screens/MeetingScreen').default} />
      <Tab.Screen name="설정" getComponent={() => require('./src/screens/SettingsScreen').default} />
      {/* 회사 관리자 계정에서만 노출 (profiles.is_company_admin 기반) */}
      {isCompanyAdmin && (
        <Tab.Screen name="회사" getComponent={() => require('./src/screens/CompanyScreen').default} />
      )}
    </Tab.Navigator>
  );
}

function AppContent() {
  const { user, setUser } = useUser();

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
        <TabNavigator key={user.id} isCompanyAdmin={!!user.isCompanyAdmin} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  // react-native-web은 html/body에 height:100% + overflow:hidden을 강제로 주입한다
  // (네이티브에 페이지 스크롤이 없는 것처럼 흉내내기 위함). 이 때문에 앱 전체 컬럼 높이가
  // 뷰포트 높이(100vh)에 여유 없이 딱 맞춰지고, 폰트 렌더링/서브픽셀 반올림 차이로 실제
  // 레이아웃이 1~수 px만 넘어가도 초과분(주로 맨 아래 하단 탭바)이 스크롤 없이 그냥
  // 잘려서 안 보이게 된다. 탭바 자체의 height/padding을 늘려도 컬럼 총합은 여전히
  // 정확히 100vh로 맞춰지므로 근본 해결이 안 된다 — body를 스크롤 가능하게 풀어줘서
  // 초과분이 "잘리지" 않고 "스크롤"되도록 안전장치를 둔다.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.overflowY = 'auto';
      document.documentElement.style.overflowY = 'auto';
    }
  }, []);

  return (
    <View style={webStyles.outer}>
      <View style={webStyles.inner}>
        <UserProvider>
          <AppContent />
        </UserProvider>
      </View>
    </View>
  );
}

// 웹은 브라우저 창 폭 그대로 늘어나므로 모바일 앱 폭(480px)으로 제한하고 가운데 정렬한다.
// 네이티브(iOS/Android)는 화면 폭이 이미 480px 미만이라 사실상 영향 없음.
const webStyles = StyleSheet.create(
  Platform.OS === 'web'
    ? {
        outer: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center' },
        inner: { flex: 1, width: '100%', maxWidth: 480 },
      }
    : {
        outer: { flex: 1 },
        inner: { flex: 1 },
      }
);

function tabColor(name) {
  const map = { 홈: C.gold, 일정: C.accentBlue, 거래처: C.accentTeal, 프로젝트: C.red, 메세지: C.accentPurple, 회의록: C.accentTeal, 설정: C.textSecondary, 회사: C.companyIndigo };
  return map[name] || C.textPrimary;
}
