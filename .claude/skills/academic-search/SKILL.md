---
name: academic-search
description: 학술 자료 검색 스킬. Google Scholar·arXiv·PubMed·RISS 등에서 논문과 연구 자료를 찾는 방법을 제공한다. academic-researcher 에이전트가 사용한다.
---

## 검색 플랫폼

| 플랫폼 | 쿼리 예시 | 주로 쓰는 분야 |
|--------|-----------|--------------|
| Google Scholar | `site:scholar.google.com {주제} {연도}` | 전 분야 |
| arXiv | `site:arxiv.org {영어 주제}` | 컴퓨터·물리·수학 |
| PubMed | `site:pubmed.ncbi.nlm.nih.gov {주제}` | 의학·생명과학 |
| SSRN | `site:ssrn.com {주제}` | 사회과학·경제 |
| RISS | `site:riss.kr {주제}` | 국내 학위논문 |
| KISS/DBpia | `site:kiss.kstudy.com {주제}` | 국내 학술지 |

한국어 주제는 반드시 영어로도 검색한다 — 영어 학술 자료가 훨씬 많기 때문이다.

## 논문 평가 기준

수집 시 다음을 기재한다:
- 제목, 저자, 연도, 학술지/컨퍼런스명
- 피인용 수 (가용 시)
- 핵심 발견 (1~2문장)
- URL 또는 DOI

피인용 수가 높고, 동료 심사(peer-reviewed) 저널에 실린 논문을 우선한다. 프리프린트(arXiv)는 동료 심사 전임을 명시한다.

## 출력 형식

```markdown
# 학술 조사 결과: {주제}
조사일: {날짜}

## 핵심 논문·자료
1. {제목} ({저자}, {연도}) — {핵심 발견 1~2문장} [URL/DOI]
2. ...

## 주요 연구 트렌드
- 최근 연구의 방향성과 합의된 결론

## 논쟁 중인 영역
- 연구자 간 의견이 나뉘는 부분과 각 입장

## 조사 범위
- 검색 플랫폼: ...
- 사용한 쿼리: ...
- 총 검토 논문 수: ...
```
