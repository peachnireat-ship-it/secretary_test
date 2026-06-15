# Secretary Test

Claude AI 기반 개인 비서 앱 — 일정 관리와 거래처 관계 관리를 하나의 앱에서.

## 기능

- **홈** — AI 비서에게 자유롭게 질문
- **일정** — 일정 조회·추가·삭제, AI 자연어 일정 생성
- **거래처** — 거래처 및 히스토리 관리, AI 관계 분석
- **설정** — Anthropic API 키 등록

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `.env`를 만들고 API 키를 입력합니다.

```bash
cp .env.example .env
```

또는 앱 실행 후 **설정 탭**에서 직접 API 키를 입력할 수 있습니다.

### 3. 앱 실행

```bash
npx expo start
```

## API 키 발급

1. [https://console.anthropic.com](https://console.anthropic.com) 접속
2. **API Keys** → **Create Key**
3. 발급된 `sk-ant-...` 키를 앱 설정 화면에 입력

## 기술 스택

- **React Native** (Expo)
- **Claude API** (`claude-sonnet-4-6`)
- **AsyncStorage** — 로컬 데이터 저장
- **React Navigation** — 탭 네비게이션
