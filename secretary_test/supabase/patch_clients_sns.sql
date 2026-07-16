-- 거래처 상세의 이메일 옆에 SNS 계정 항목을 추가하기 위한 컬럼
alter table clients add column if not exists sns text not null default '';
