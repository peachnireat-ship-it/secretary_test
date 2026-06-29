---
status: 승인됨
date: 2026-06-29
---

# ADR-0002: Groq/Grok 전환 가능한 AI 공급자 구조

## 컨텍스트

앱의 핵심 기능(자연어 일정 생성, 거래처 관계 요약, 프로젝트 지연 분석, 회의록 태스크 추출)에 LLM API가 필요하다. 
특정 공급자 하나에 고정할 경우 API 가격 변동이나 서비스 중단에 취약하다.

## 결정

모든 AI 호출을 `src/services/claude.js`의 `askClaude()` 단일 함수로 추상화한다. 내부에서 AsyncStorage의 `ai_provider` 키(`'groq'` | `'grok'`)를 읽어 공급자를 동적으로 선택한다.

- **기본 공급자**: Groq (`llama-3.3-70b-versatile`) — 무료 티어 제공
- **보조 공급자**: Grok (`grok-3`) — xAI API Key 필요

## 이유

- 사용자가 설정 탭에서 공급자를 전환할 수 있어야 한다 (API 키 보유 여부에 따라 선택).
- 호출 코드가 공급자를 직접 참조하면 전환 시 전체 화면 수정이 필요하다.
- STT는 Groq Whisper 전용이므로 텍스트 LLM과 별도 서비스로 분리한다.

## 결과

- 긍정: 공급자 전환 시 화면 코드 수정 없음, 새 공급자 추가가 `claude.js` 1개 파일 수정으로 완결
- 부정: 두 공급자의 응답 포맷이 다를 경우 `askClaude()` 내부에서 처리해야 함
- 제약: STT(`groqStt.js`)는 Groq Whisper에 고정 — 공급자 전환과 별개로 동작
