-- 설정 탭 "내 정보 수정"에서 로그인 계정 본인의 SNS 계정도 기재할 수 있도록 추가
alter table profiles add column if not exists sns text not null default '';
