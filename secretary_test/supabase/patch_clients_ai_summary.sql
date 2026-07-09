-- 거래처 AI 관계 요약을 기기별로 즉석 생성하지 않고 DB에 저장해 웹/모바일 간 동기화하기 위한 컬럼 추가
alter table clients add column if not exists ai_summary text not null default '';
