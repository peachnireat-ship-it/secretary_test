-- 프로젝트 등록 알림(Resend 이메일 발송) 시 "관련 인물"(거래처)에게 메일을 보내기 위한 컬럼 추가
-- 값이 빈 문자열인 거래처는 알림 수신자에서 제외된다(notify-project-created Edge Function 참고)
alter table clients add column if not exists email text not null default '';
