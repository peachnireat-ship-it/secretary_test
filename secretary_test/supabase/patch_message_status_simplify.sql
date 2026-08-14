-- MessageScreen.js에서 메세지 처리상태(STATUSES)를 4단계(미확인/확인/처리중/완료)에서
-- 2단계(미확인/확인)로 단순화했다. 이 스크립트는 기존에 '처리중'/'완료'로 저장된 메세지를
-- '확인'으로 1회성 마이그레이션한다. status 컬럼에 CHECK 제약은 없어(schema.sql) 값 자체는
-- 마이그레이션 없이도 저장/조회에 문제는 없지만, 더 이상 UI에서 선택 불가능한 값으로 방치하지
-- 않기 위해 정리한다.
--
-- 실행 방법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행.

update messages
set status = '확인'
where status in ('처리중', '완료');

-- 확인용
select status, count(*) from messages group by status;
