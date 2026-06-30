---
name: pipeline-architecture
description: 데이터 파이프라인 전체 아키텍처 설계 스킬. 소스-싱크 분석, 레이어 구조 결정, 기술 스택 선택, 처리 전략 정의, 하위 에이전트 위임 지시 작성을 수행한다. pipeline-architect 에이전트가 사용한다.
---

## 아키텍처 설계 접근법

파이프라인 아키텍처는 "현재 요구사항을 만족하는 최소 구조"에서 시작한다. 미래를 위한 과설계는 오버엔지니어링이다. 확장 포인트는 명시하되, 현재 구현하지 않는다.

## 소스-싱크 분석

설계 전 소스와 싱크를 먼저 명확히 정의한다:

| 항목 | 확인 사항 |
|------|---------|
| **소스 유형** | RDBMS / NoSQL / API / 파일(CSV, JSON, Parquet) / 스트리밍(Kafka) |
| **소스 볼륨** | 일별 레코드 수, 데이터 크기 (GB/TB) |
| **변경 추적 가능** | CDC / 타임스탬프 / 전체 스캔만 가능 |
| **싱크 유형** | DW (Redshift, BigQuery) / 데이터마트 / API / 대시보드 |
| **지연 요구사항** | 실시간(<1분) / 근실시간(1~60분) / 배치(1시간~) |

## 레이어 구조 설계

**3레이어 표준 (권장):**
```
[소스] → Raw → Cleansed → Curated → [싱크]
```

**2레이어 (단순한 경우):**
```
[소스] → Staging → Serving → [싱크]
```
단순한 집계 파이프라인이나 소스가 1개인 경우에 적합.

**레이어 결정 기준:**
- 소스가 3개 이상 또는 변환 복잡도 높음 → 3레이어
- 소스 1~2개, 단순 집계 → 2레이어
- 실시간 스트리밍 → Lambda 아키텍처(배치+스트리밍 병행) 또는 Kappa(스트리밍만)

## 기술 스택 선택 가이드

사용자가 명시한 경우 그대로 사용. 명시하지 않은 경우 다음 기준으로 추천:

| 요소 | 소규모 (<100GB/일) | 중규모 (100GB~1TB/일) | 대규모 (>1TB/일) |
|------|-----------------|---------------------|----------------|
| 오케스트레이션 | Airflow (self-hosted) | Airflow / Prefect | Airflow + Kubernetes |
| 변환 | dbt | dbt + Spark | Spark / Flink |
| 저장소 | PostgreSQL / MySQL | Redshift / BigQuery | BigQuery / Snowflake |
| 스트리밍 | 불필요 | Kafka + Spark Streaming | Kafka + Flink |

## 데이터 흐름 다이어그램 (텍스트 형식)

```
[PostgreSQL orders] ──┐
[MySQL customers]  ──┤── Extract ──► [S3 Raw] ──► Transform ──► [Redshift Cleansed] ──► Aggregate ──► [Redshift Curated] ──► [BI Dashboard]
[REST API products] ──┘
```

## 설계 결정 사항 문서화

모든 설계 결정은 이유와 함께 기록한다. 이유 없는 결정은 나중에 "왜 이렇게 됐지?"로 돌아온다.

```markdown
결정: 배치 처리 선택 (스트리밍 대신)
이유: 현재 SLA가 D+1 09:00으로 배치로 충분. 스트리밍 인프라 비용·복잡도 불필요.
재검토 시점: 실시간 요구사항이 생기면 (현재 없음)
```

## 하위 에이전트 위임 지시 작성

초안 완성 후, 각 하위 에이전트에게 전달할 위임 지시를 01_architecture.md에 명시한다:

```markdown
## 하위 에이전트 위임 지시

schema-designer에게:
- Raw 레이어는 소스 원본 그대로 보존 (컬럼명 변경 금지)
- Curated 레이어는 BI 도구의 직접 쿼리에 최적화
- 파티션 키는 반드시 날짜 기반으로 설계

etl-organizer에게:
- 모든 Load는 UPSERT로 설계 (멱등성 보장)
- 증분 추출 기준: `orders.updated_at > watermark`
- 변환 중 이상값(음수 금액)은 Dead Letter Queue로 격리
```
