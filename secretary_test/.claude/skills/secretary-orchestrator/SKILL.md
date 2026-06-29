---
name: secretary-orchestrator
description: secretary_test 앱의 모든 개발 작업을 조율하는 오케스트레이터. 기능 추가, 버그 수정, 스타일 정리, QA 검증 등 어떤 개발 요청이든 이 스킬을 먼저 사용한다. "화면에 ~ 추가해줘", "~ 구현해줘", "~ 버그 고쳐줘", "스타일 정리해줘", "인라인 스타일 제거해줘", "검증해줘", "다시 실행", "재실행", "이전 결과 기반으로 수정" 같은 표현이 나오면 반드시 이 스킬을 트리거한다. 단순 질문("코드 설명해줘", "이게 뭐야?")은 직접 응답한다.
---

## 목표

secretary_test 개발 요청을 받아 developer → style-guard → qa 에이전트 팀이 협업하도록 조율하고, 최종 결과를 사용자에게 보고한다.

**실행 모드:** 에이전트 팀 — `developer`, `style-guard`, `qa` 3명 협업

## Phase 0: 컨텍스트 확인

1. `_workspace/` 존재 여부 확인
   - 미존재 → **초기 실행**
   - 존재 + 부분 수정 요청 → **부분 재실행** (해당 에이전트만 재호출)
   - 존재 + 새 기능 요청 → **새 실행** (`_workspace/`를 `_workspace_prev/`로 이동)
2. 요청 유형 분류:
   - 기능 구현 / 버그 수정 → developer 필요
   - 스타일 정리 → style-guard 필요
   - 검증 요청 → qa 필요
   - 복합 요청 → 전체 파이프라인

## Phase 1: 요청 분석

1. CLAUDE.md를 읽고 관련 데이터 모델, 탭 색상, 화면 구조를 파악한다
2. 영향받는 파일을 특정한다 (예: "HomeScreen에 배너 추가" → `src/screens/HomeScreen.js`)
3. 구현에 필요한 패턴을 식별한다 (Bottom Sheet, FAB, AsyncStorage 키 등)

## Phase 2: 팀 구성 및 작업 배분

요청 유형에 따라 필요한 에이전트만 활성화한다:

| 요청 유형 | 파이프라인 |
|---------|-----------|
| 기능 구현 | developer → style-guard → qa |
| 스타일 정리만 | style-guard → qa |
| 버그 수정 | developer → qa |
| 검증만 | qa |

**데이터 전달:** SendMessage(실시간 조율) + `_workspace/`(산출물 파일)

## Phase 3: 실행 및 모니터링

1. developer에게 구현 요청 (파일 경로, 기능 명세, 참조 패턴 포함)
2. developer 완료 후 style-guard에게 정리 요청 (수정 파일 목록 전달)
3. style-guard 완료 후 qa에게 검증 요청 (변경 내용 요약 전달)
4. qa 검증 결과 수집

## Phase 4: 에러 핸들링

- 에이전트 실패 시 1회 재시도
- 재시도 실패 시 해당 단계 건너뛰고 결과 보고에 누락 명시
- qa가 버그 발견 시 developer에게 수정 요청 → (스타일 변경 없는 로직 버그면) qa 직접 재검증 / (스타일 변경 포함이면) style-guard → qa 재실행 (최대 2회 루프)

## Phase 5: 결과 보고

사용자에게 다음을 보고한다:
- 수정된 파일 목록과 변경 내용 요약
- qa 검증 결과 (통과/실패 항목)
- 발견된 이슈 및 조치 내용

## 테스트 시나리오

### 정상 흐름
요청: "HomeScreen 상단에 오늘 날짜를 표시하는 배너를 추가해줘"
1. Phase 0: `_workspace/` 없음 → 초기 실행
2. Phase 1: HomeScreen.js 영향, C.gold 색상 사용, todaySchedules state 참조
3. Phase 2: developer → style-guard → qa 파이프라인
4. Phase 3: developer가 HomeScreen.js 수정, style-guard가 인라인 스타일 정리, qa가 AsyncStorage 키·색상 하드코딩 검사
5. Phase 5: 수정 파일 1개, 변경 사항 요약, qa 통과 보고

### 에러 흐름
developer가 잘못된 AsyncStorage 키(`schedules_${userId}`) 사용 → qa 발견 → developer에게 수정 요청(`schedules_v1_${userId}`) → qa 재검증 통과
