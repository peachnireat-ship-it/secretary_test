---
name: etl-design
description: 데이터 파이프라인 ETL 설계 스킬. 배치/스트리밍 전략 선택, Extract·Transform·Load 단계별 로직 명세, 멱등성 설계, 증분/전체 처리 전략, 오류 처리 및 재처리 방안을 수행한다. etl-organizer 에이전트가 사용한다.
---

## 처리 전략 선택

| 요구사항 | 권장 전략 | 도구 예시 |
|---------|---------|---------|
| 분/초 단위 최신성 | 스트리밍 | Kafka + Flink, Spark Streaming |
| 시간/일 단위 배치 | 마이크로 배치 | Airflow + Spark, dbt |
| 일 단위 집계 | 야간 배치 | Airflow + dbt, CTAS |
| 이벤트 드리븐 | 스트리밍 | Kafka, AWS Kinesis |

스트리밍은 인프라 복잡도가 높다. 분 단위 이상 지연이 허용된다면 마이크로 배치로 시작하고 나중에 스트리밍으로 전환하는 것이 현실적이다.

## Extract 설계 원칙

**증분 추출 (Incremental):**
- 마지막 처리 시각을 워터마크로 저장 (`_pipeline_watermark` 테이블)
- `WHERE updated_at > {last_watermark}` 형태로 변경분만 추출
- 소스 삭제는 소프트 삭제(`is_deleted`) 컬럼 필요, 없으면 전체 재추출

**전체 추출 (Full Load):**
- 소스 테이블이 1GB 미만이고 변경 추적 불가할 때
- 원자적 대체: 임시 테이블에 적재 후 스왑 (`SWAP TABLE`)

**API 소스 추출:**
- 페이지네이션 처리 (cursor, offset 방식 명시)
- Rate limit 준수 (요청 간격 명시)
- 응답 캐싱: 같은 페이지 재요청 방지

## Transform 설계 원칙

변환 로직은 기술적 변환과 비즈니스 변환을 분리한다:

| 변환 유형 | 예시 | 적용 레이어 |
|---------|------|-----------|
| 타입 변환 | string → timestamp | Raw → Cleansed |
| 이상값 처리 | 음수 금액 → null | Raw → Cleansed |
| 표준화 | 전화번호 형식 통일 | Raw → Cleansed |
| 비즈니스 집계 | 월별 매출 합산 | Cleansed → Curated |
| 파생 컬럼 | 구매 횟수 기반 등급 계산 | Cleansed → Curated |

**이상값 처리 전략:**
- Null 대체: 기본값으로 대체 (금액: 0, 문자열: "UNKNOWN")
- 격리: Dead Letter Queue로 이동 후 수동 검토
- 보존: 이상값 그대로 보존 + 플래그 컬럼 추가 (`_is_anomaly`)

## Load 설계 원칙

**적재 방식 선택:**
| 상황 | 방식 | SQL 패턴 |
|------|------|---------|
| 새 레코드만 추가 | INSERT | INSERT INTO ... SELECT ... WHERE NOT EXISTS |
| 변경 추적 | UPSERT | MERGE INTO ... WHEN MATCHED/NOT MATCHED |
| 파티션 교체 | OVERWRITE | INSERT OVERWRITE PARTITION(...) |
| 전체 교체 | TRUNCATE+INSERT | TRUNCATE → INSERT (트랜잭션 내) |

**멱등성 보장:**
모든 Load 단계는 `_pipeline_run_id`를 키로 사용하여 같은 실행 ID의 데이터를 중복 적재하지 않는다.

## 오류 처리 표준

| 오류 유형 | 처리 방법 | 재시도 전략 |
|---------|---------|-----------|
| 소스 연결 실패 | 지수 백오프 재시도 | 3회, 1분/5분/15분 |
| 변환 로직 오류 | 레코드 격리 + 로깅 | 재시도 없음 (로직 오류는 코드 수정 필요) |
| 적재 충돌 | UPSERT로 처리 | 즉시 1회 |
| 파티션 없음 | 파티션 자동 생성 | N/A |

## 재처리(Backfill) 설계

- 날짜 파라미터화: `{{ execution_date }}` 형태로 모든 날짜 의존성 파라미터화
- 범위 재처리: `start_date ~ end_date` 루프 실행
- 재처리 시 중복 방지: `_pipeline_run_id`에 날짜 포함 (`backfill_20260101_20260131`)
