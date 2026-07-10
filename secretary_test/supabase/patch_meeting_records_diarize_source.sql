-- 저장된 회의록에서도 화자 분리 방식(pyannote 서버 / AI)을 배지로 표시하기 위한 컬럼 추가
-- 과거 데이터는 NULL로 남아 배지가 표시되지 않는다(정상 동작, 마이그레이션 불필요)
alter table meeting_records add column if not exists diarize_source text;
