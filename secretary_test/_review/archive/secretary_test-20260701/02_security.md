# 보안 감사 리포트

대상: `C:\Users\user\secretary_test`
날짜: 2026-07-01
감사 기준: OWASP Top 10, Expo/React Native 모바일 보안

## 요약

실제 API 키가 `.env` 파일에 존재하며 `EXPO_PUBLIC_` 접두사로 인해 앱 번들에 포함될 수 있다.
소스 코드에 평문 비밀번호가 하드코딩되어 있고 인증 없이 다른 계정으로 전환 가능한 구조다.
AsyncStorage에 API 키가 평문 저장되고, 로그인 화면이 자격증명을 UI에 직접 노출한다.

---

## 발견 사항

---

### [심각도: CRITICAL] 실제 API 키가 .env 파일에 하드코딩됨

- 위치: `secretary_test/.env:1-2`
- 설명: `.env` 파일에 유효한 Groq API 키(`gsk_***REDACTED***`)와 Gemini API 키(`AQ.***REDACTED***`)가 존재한다. `.gitignore`에 `.env`가 포함되어 있어 버전 관리에서는 제외되지만, Expo에서 `EXPO_PUBLIC_*` 접두사를 가진 변수는 **빌드 시 JavaScript 번들에 인라인 삽입**된다. 즉, 배포된 APK/IPA 파일을 누구든 디컴파일하면 이 키를 추출할 수 있다. 추가로 `.env.example`에 없는 `EXPO_PUBLIC_GEMINI_API_KEY`가 `.env`에 존재하여 코드에서 참조되지 않는 키가 방치되어 있다.
- 공격 시나리오: 공격자가 APK를 리버스 엔지니어링하거나, 개발 머신에 접근하면 실제 API 키를 획득하여 해당 서비스(Groq, Gemini)에 무제한 비용 청구가 가능하다.
- 권고:
  1. 즉시 두 API 키를 모두 폐기(revoke)하고 새 키를 발급받는다.
  2. `.env` 파일에 실제 키를 넣지 않는다. 개발 환경에서도 `.env.local`을 사용하고 `.gitignore`에 포함한다.
  3. `EXPO_PUBLIC_` 접두사 환경 변수는 공개 정보로 취급한다. 실제 API 키는 `EXPO_PUBLIC_` 없이 서버 사이드에서만 사용하거나, 사용자가 직접 입력하게 한다(현재 SettingsScreen의 구조가 올바른 방향).
  4. 빌드된 앱 번들에 민감 정보가 포함되지 않도록 EAS Secrets 또는 런타임 환경 변수를 활용한다.

---

### [심각도: CRITICAL] 평문 비밀번호 하드코딩 (A02 Cryptographic Failures)

- 위치: `secretary_test/src/services/storage.js:20-27`
- 설명: `TEST_ACCOUNTS` 배열에 6개 계정의 이메일과 비밀번호가 소스 코드에 평문으로 하드코딩되어 있다. `login()` 함수(30번째 줄)는 입력된 비밀번호를 해시 없이 직접 비교한다. 비밀번호는 해싱·솔팅 없이 문자열 비교로 검증된다.
- 공격 시나리오: 소스 코드 또는 컴파일된 앱 번들에 접근한 누구든 모든 계정의 자격증명을 즉시 획득한다. 'admin' 계정의 비밀번호 `admin1234`는 특히 위험한 추측 가능한 값이다.
- 권고:
  1. 비밀번호를 bcrypt 또는 Argon2로 해시하여 저장한다.
  2. 로그인 시 `crypto.subtle` 또는 네이티브 보안 모듈을 통해 해시를 비교한다.
  3. 테스트 계정이 프로덕션 빌드에 포함되지 않도록 `__DEV__` 가드로 분리한다.
  4. 단기적으로는 비밀번호를 bcrypt 해시값으로 교체하고 비교 로직을 수정한다.

---

### [심각도: HIGH] 로그인 화면이 자격증명을 UI에 직접 노출 (A02 / A07)

- 위치: `secretary_test/src/screens/LoginScreen.js:87-98`
- 설명: 로그인 화면의 '테스트 계정' 섹션에 이메일과 비밀번호(`test1234`, `admin1234`)가 텍스트로 렌더링된다. 앱을 여는 누구든 관리자 계정 자격증명을 볼 수 있다.
- 공격 시나리오: 앱을 설치한 모든 사용자가 관리자 계정으로 로그인할 수 있다.
- 권고:
  1. 프로덕션 빌드에서 테스트 계정 UI를 완전 제거한다.
  2. 개발 빌드에서만 표시하려면 `if (__DEV__)` 조건으로 감싼다.
  3. 비밀번호 텍스트 표시 제거(이메일만 표시하거나 완전히 숨김).

---

### [심각도: HIGH] 계정 전환 시 인증 없음 — 권한 상승 가능 (A01 Broken Access Control)

- 위치: `secretary_test/src/services/storage.js:45-51`
- 설명: `switchAccount(accountId)` 함수는 계정 ID만 받아 비밀번호 검증 없이 해당 계정으로 즉시 전환한다. 로그인된 일반 사용자(tester)가 설정 화면에서 관리자(admin) 계정으로 아무 인증 없이 전환 가능하다. SettingsScreen.js(314~316번째 줄)에서 이를 직접 호출한다.
- 공격 시나리오: `test1234` 계정으로 로그인한 사용자가 설정 화면에서 `admin` 계정으로 전환하여 관리자 권한 데이터에 접근한다.
- 권고:
  1. 계정 전환 전 현재 비밀번호 또는 전환할 계정의 비밀번호를 요구한다.
  2. 또는 계정 전환 기능을 완전히 로그아웃 후 재로그인으로 대체한다.
  3. 다중 계정 기능이 테스트 전용이라면 `__DEV__`로 분리한다.

---

### [심각도: HIGH] API 키가 AsyncStorage에 평문 저장 (A02 Cryptographic Failures)

- 위치: `secretary_test/src/services/storage.js:64-75`
- 설명: Groq API 키와 Grok API 키가 AsyncStorage에 평문 문자열로 저장된다. Android에서 AsyncStorage는 `/data/data/<앱패키지>/databases/` 또는 SharedPreferences에 저장되며, 루팅된 기기나 ADB 백업을 통해 평문으로 접근 가능하다. iOS는 Keychain을 사용하지만 AsyncStorage는 기본적으로 Keychain을 사용하지 않는다.
- 공격 시나리오: 루팅된 Android 기기에서 `adb backup` 또는 루트 탐색기로 AsyncStorage 데이터베이스를 추출하면 API 키를 평문으로 획득한다.
- 권고:
  1. `expo-secure-store`(`SecureStore.setItemAsync`)를 사용하여 민감 데이터를 저장한다. 이는 iOS Keychain, Android Keystore를 활용하여 암호화된다.
  2. `KEYS.apiKey`, `KEYS.grokApiKey`에 해당하는 저장/조회 함수(`setApiKey`, `getApiKey`, `setGrokApiKey`, `getGrokApiKey`)를 SecureStore로 교체한다.

---

### [심각도: MEDIUM] 로그인 시도 횟수 제한 없음 (A07 Authentication Failures)

- 위치: `secretary_test/src/services/storage.js:29-35`
- 설명: `login()` 함수에 실패 횟수 추적, 잠금, 지연(backoff) 메커니즘이 없다. 무제한 로그인 시도가 가능하므로 자동화된 브루트포스 공격에 취약하다. 단, 현재 비밀번호가 짧고 단순(`test1234`, `admin1234`)하여 실질적 위험이 높다.
- 공격 시나리오: 스크립트로 반복 시도하여 단순한 비밀번호를 빠르게 추측한다.
- 권고:
  1. 연속 실패 횟수를 AsyncStorage에 기록하고, 5회 실패 시 30초 잠금을 구현한다.
  2. 실패 카운터와 마지막 실패 시각을 저장하여 점진적 잠금을 적용한다.

---

### [심각도: MEDIUM] Pyannote 서버 통신에 HTTP 허용 — 음성 데이터 평문 전송 위험

- 위치: `secretary_test/src/services/groqStt.js:113, 150` / `secretary_test/src/screens/SettingsScreen.js:233`
- 설명: Pyannote 서버 URL 입력 필드의 플레이스홀더가 `http://192.168.1.x:8000`이며, 코드에서 사용자가 입력한 URL을 HTTP 스킴 검증 없이 그대로 사용한다. 회의 음성 데이터(잠재적으로 기밀 비즈니스 내용 포함)가 HTTP로 전송될 경우 동일 네트워크의 공격자가 내용을 도청할 수 있다.
- 공격 시나리오: 같은 Wi-Fi에 있는 공격자가 ARP 스푸핑 후 패킷 캡처로 회의 내용을 도청한다.
- 권고:
  1. `handleSavePyannoteUrl()` 및 `handleTestPyannote()`에서 `http://`로 시작하는 URL 저장을 거부하거나 경고를 표시한다.
  2. Pyannote 서버를 HTTPS로 구성하도록 안내한다.
  3. URL 저장 전 `https://`로 시작하는지 검증하는 조건을 추가한다.

---

### [심각도: MEDIUM] 민감 비즈니스 데이터가 제3자 AI 서비스로 전송됨

- 위치: `secretary_test/src/services/claude.js:206-236` (`buildClientSystem`)
- 설명: `buildClientSystem()` 함수가 거래처 이름, 연락처(휴대전화 번호), 업무 히스토리, 계약 내용, 회의 결과 등 비즈니스 민감 정보를 Groq/Grok API의 시스템 프롬프트에 포함하여 전송한다. 이 데이터는 제3자 AI 서비스의 서버에서 처리된다.
- 공격 시나리오: Groq/xAI 서버 측 로깅, 데이터 유출, 또는 해당 서비스의 정책 변경으로 인해 기업 비밀이 외부에 노출될 수 있다.
- 권고:
  1. AI 전송 전 연락처, 회사명 등 PII를 토큰으로 치환하는 익명화 레이어를 추가한다.
  2. 사용자에게 '이 데이터가 외부 AI 서버로 전송됩니다'를 명확히 고지하는 동의 화면을 추가한다.
  3. Groq/xAI의 데이터 처리 정책(opt-out 등)을 확인하고 설정에 링크를 제공한다.

---

### [심각도: LOW] 세션 만료 메커니즘 없음 (A07)

- 위치: `secretary_test/src/services/storage.js:33, 53-55`
- 설명: 로그인 성공 시 `current_user_v1` 키에 사용자 객체가 저장되며, 앱 재시작 시 이를 복원한다. 세션에 만료 시각이나 토큰 갱신 메커니즘이 없어 한 번 로그인하면 명시적 로그아웃 전까지 영구적으로 유지된다.
- 공격 시나리오: 기기를 잠깐 빌린 사람이나 분실 기기를 습득한 사람이 앱을 열면 이전 사용자의 세션으로 즉시 접근한다.
- 권고:
  1. 세션 저장 시 `createdAt` 타임스탬프를 포함하고, 일정 기간(예: 30일) 후 재로그인을 요구한다.
  2. 앱이 백그라운드에서 일정 시간 이상 지나면 재인증을 요구하는 옵션을 추가한다.

---

### [심각도: LOW] JSON.parse 오류 처리 미흡 — 잠재적 크래시

- 위치: `secretary_test/src/services/storage.js:98, 134, 163, 204, ...`
- 설명: `JSON.parse(raw)` 호출이 try/catch 없이 사용된다. AsyncStorage에 저장된 값이 앱 업데이트, 스토리지 손상, 또는 외부 조작으로 유효하지 않은 JSON이 된 경우 앱이 크래시한다. 다수의 `getXxx()` 함수에서 동일한 패턴이 반복된다.
- 공격 시나리오: 루팅된 기기에서 AsyncStorage 데이터를 조작하여 앱을 의도적으로 크래시시키거나 스택 트레이스를 노출시킬 수 있다.
- 권고:
  1. `JSON.parse` 호출을 `try/catch`로 감싸고, 파싱 실패 시 기본값을 반환하도록 공통 헬퍼 함수를 추가한다.
  2. 예시: `const safeParseJSON = (str, fallback = null) => { try { return JSON.parse(str); } catch { return fallback; } }`

---

## 검증된 안전 항목

- **SQL Injection**: 해당 없음. 앱은 서버 없이 AsyncStorage만 사용하므로 SQL 쿼리가 존재하지 않는다.
- **XSS**: 해당 없음. React Native는 DOM이 없어 `innerHTML`, `dangerouslySetInnerHTML`, `eval()` 사용이 없다.
- **CSRF**: 해당 없음. 서버 세션·쿠키 기반 인증이 없다.
- **의존성 알려진 취약점**: `package.json` 검토 결과, 주요 패키지(Expo ~54, React 19, React Native 0.81)는 최신 안정 버전이다.
- **외부 API 통신 TLS**: Groq API(`api.groq.com`), Grok API(`api.x.ai`)는 HTTPS만 사용한다.
- **API 키 UI 마스킹**: SettingsScreen에서 API 키 표시 시 중간 부분을 `•`로 마스킹하는 처리가 구현되어 있다.
- **계정별 데이터 격리**: AsyncStorage 키에 `_${user.id}` 접미사를 사용하여 사용자별 데이터가 논리적으로 분리된다.

---

## 즉시 조치 필요 항목 (CRITICAL)

| 순서 | 항목 | 조치 |
|------|------|------|
| 1 | `.env` 파일의 실제 Groq/Gemini API 키 | **즉시 키 폐기 후 재발급** |
| 2 | `storage.js` 평문 비밀번호 하드코딩 | 해시 교체 또는 외부 인증 서버 도입 |
| 3 | `LoginScreen.js` 자격증명 UI 노출 | `__DEV__` 가드 또는 제거 |

---

## 종합 평가

**보안 위험도 등급: HIGH (고위험)**

이 프로젝트는 로컬 전용 Expo 앱으로 설계되어 있어 서버 사이드 공격 표면은 없다. 그러나 세 가지 구조적 문제가 복합적으로 작용한다.

1. **자격증명 관리 부재**: API 키와 계정 비밀번호 모두 평문으로 소스 코드/스토리지에 존재한다.
2. **EXPO_PUBLIC_ 번들 포함 위험**: 실제 API 키가 앱 배포 시 번들에 포함될 수 있다.
3. **인증 구조 취약**: 비밀번호 해싱 없음, 계정 전환 인증 없음, 세션 만료 없음.

**개선 우선순위:**
1. Groq/Gemini API 키 즉시 폐기 및 재발급
2. API 키 저장을 `expo-secure-store`로 마이그레이션
3. 비밀번호를 bcrypt 해시로 교체
4. 계정 전환 시 비밀번호 재인증 추가
5. 테스트 계정 UI를 `__DEV__` 환경에서만 표시
