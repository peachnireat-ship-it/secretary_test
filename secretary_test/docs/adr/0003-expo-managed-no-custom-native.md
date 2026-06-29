---
status: 승인됨
date: 2026-06-29
---

# ADR-0003: Expo 관리형 워크플로우, 커스텀 네이티브 모듈 없음

## 컨텍스트

React Native 앱을 빌드할 때 두 가지 경로가 있다:
- **Expo 관리형(managed)**: Expo SDK 범위 내에서만 개발, EAS Build로 배포
- **Bare workflow / React Native CLI**: 네이티브 코드 직접 수정 가능

## 결정

Expo SDK v53 관리형 워크플로우를 사용한다. 새 npm 패키지 추가 시 Expo SDK에 포함된 패키지를 우선한다. 커스텀 네이티브 모듈(`android/`, `ios/` 직접 수정)은 추가하지 않는다.

## 이유

- 솔로 개발자 프로젝트로 iOS/Android 네이티브 빌드 환경 유지 부담을 줄여야 한다.
- 필요한 기능(오디오 녹음, 연락처, 파일 시스템)이 모두 Expo SDK에 포함되어 있다.
- Expo SDK 버전 업그레이드 시 `expo upgrade` 한 번으로 처리 가능하다.

## 결과

- 긍정: 개발 환경 단순, OTA 업데이트 가능, EAS Build로 앱스토어 배포 가능
- 부정: Expo SDK에 없는 네이티브 기능은 사용 불가 (예: 백그라운드 오디오 처리 고급 기능)
- 제약: Pyannote 화자 분리는 외부 서버로 위임 (ADR-0005) — 네이티브 SDK 미사용의 직접적 결과
- 참고: `AGENTS.md`의 지시에 따라 코드 작성 전 반드시 `https://docs.expo.dev/versions/v53.0.0/` 문서를 확인한다
