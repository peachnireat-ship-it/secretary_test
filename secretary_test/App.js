import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import { UserProvider, useUser } from './src/context/UserContext';
import { ICONS, tabColor } from './src/navConfig';
import { IS_PC } from './src/utils/deviceType';
import PCSidebar, { PC_SIDEBAR_WIDTH } from './src/components/PCSidebar';

const Tab = createBottomTabNavigator();

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
        // @react-navigation/bottom-tabs v7부터 화면 컨테이너 여백은 Navigator prop인
        // sceneContainerStyle(v6 API, 이 버전엔 없음 — 조용히 무시됨)이 아니라 screenOptions의
        // sceneStyle로 지정해야 한다. PCSidebar는 position:'absolute'라 일반 흐름 밖에서 그려지고,
        // 화면(Screen)도 StyleSheet.absoluteFill로 left:0부터 꽉 채워지므로 이 marginLeft가 없으면
        // 모든 탭 화면의 좌측 PC_SIDEBAR_WIDTH만큼이 사이드바 아래 레이어에 그대로 가려진다.
        sceneStyle: IS_PC ? { marginLeft: PC_SIDEBAR_WIDTH } : undefined,
      })}
      // PC는 하단 탭바 대신 좌측 사이드바로 시각적 크롬만 교체한다. 라우팅(navigation.navigate/route.params)은
      // 동일한 Tab.Navigator가 그대로 처리하므로 화면 쪽 코드는 변경할 필요가 없다.
      tabBar={IS_PC ? (props) => <PCSidebar {...props} /> : undefined}
    >
      {/* getComponent/require()로 실제 탭 방문 시점까지 화면 모듈 로딩을 미룬다 (eager import 시 앱 시작 시 8개 화면 전부 즉시 실행됨) */}
      <Tab.Screen name="홈" getComponent={() => require('./src/screens/HomeScreen').default} />
      <Tab.Screen name="일정" getComponent={() => require('./src/screens/ScheduleScreen').default} />
      <Tab.Screen name="거래처" options={{ tabBarLabel: '담당자' }} getComponent={() => require('./src/screens/ClientScreen').default} />
      {/* 회사 관리자는 개인 담당자 탭에 더해 회사 전체 부서 직원 목록(읽기 전용) 탭도 확인 */}
      {isCompanyAdmin && (
        <Tab.Screen name="회사관리" getComponent={() => require('./src/screens/CompanyScreen').default} />
      )}
      <Tab.Screen name="프로젝트" getComponent={() => require('./src/screens/ProjectScreen').default} />
      <Tab.Screen name="메세지" getComponent={() => require('./src/screens/MessageScreen').default} />
      <Tab.Screen name="회의록" getComponent={() => require('./src/screens/MeetingScreen').default} />
      <Tab.Screen name="설정" getComponent={() => require('./src/screens/SettingsScreen').default} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { user, setUser } = useUser();

  // 로딩/로그인 화면은 PC 여부와 무관하게 기존 그대로(모바일 폭 480px 고정) 유지한다.
  if (user === undefined) {
    return (
      <View style={authWebStyles.outer}>
        <View style={authWebStyles.inner}>
          <SafeAreaProvider>
            <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.accentBlue} />
            </View>
          </SafeAreaProvider>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={authWebStyles.outer}>
        <View style={authWebStyles.inner}>
          <SafeAreaProvider>
            <StatusBar style="light" />
            <LoginScreen onLogin={(u) => setUser(u)} />
          </SafeAreaProvider>
        </View>
      </View>
    );
  }

  // 로그인 이후 메인 앱만 PC에서 사이드바 레이아웃을 위해 폭 제한을 푼다.
  return (
    <View style={mainWebStyles.outer}>
      <View style={mainWebStyles.inner}>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <TabNavigator key={user.id} isCompanyAdmin={!!user.isCompanyAdmin} />
          </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </View>
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
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

// 로딩/로그인 화면: 웹이면 항상 모바일 앱 폭(480px)으로 제한하고 가운데 정렬(PC 여부 무관, 기존 그대로).
// 네이티브(iOS/Android)는 화면 폭이 이미 480px 미만이라 사실상 영향 없음.
const authWebStyles = StyleSheet.create(
  Platform.OS === 'web'
    ? { outer: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center' }, inner: { flex: 1, width: '100%', maxWidth: 480 } }
    : { outer: { flex: 1 }, inner: { flex: 1 } }
);

// 로그인 이후 메인 앱: PC 웹은 사이드바 레이아웃을 위해 폭 제한을 풀고, 모바일 웹은 authWebStyles와 동일하게 유지.
const mainWebStyles = StyleSheet.create(
  Platform.OS !== 'web'
    ? { outer: { flex: 1 }, inner: { flex: 1 } }
    : IS_PC
    ? { outer: { flex: 1, minHeight: '100vh', backgroundColor: C.bg }, inner: { flex: 1, width: '100%' } }
    : { outer: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center' }, inner: { flex: 1, width: '100%', maxWidth: 480 } }
);
