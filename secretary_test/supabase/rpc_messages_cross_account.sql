-- 배경: messages 테이블의 INSERT/UPDATE 정책에 걸린 `sender_id = auth.uid() OR mailbox_owner_id = auth.uid()`
-- 중 sender_id 쪽 OR 분기가 이 프로젝트의 Postgres 엔진에서 원인 불명으로 항상 실패하는 것을
-- 여러 계정·재시작·정책 재생성으로도 재현/해결하지 못했다. RLS의 OR 조건에 의존하는 대신,
-- SECURITY DEFINER 함수 내부에서 발신자 신원(auth.uid())을 직접 검증한 뒤 RLS를 우회해
-- 상대방 메일함에 쓰도록 우회한다.

create or replace function deliver_message_to(
  p_id text,
  p_mailbox_owner_id uuid,
  p_to_id uuid,
  p_direction text,
  p_sender text,
  p_company text,
  p_subject text,
  p_content text,
  p_priority text,
  p_status text,
  p_linked_received_id text,
  p_created_at bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into messages (
    id, mailbox_owner_id, sender_id, to_id, direction, sender, company,
    subject, content, priority, status, linked_received_id, edit_history, created_at
  ) values (
    p_id, p_mailbox_owner_id, auth.uid(), p_to_id, p_direction, p_sender, coalesce(p_company, ''),
    p_subject, p_content, p_priority, p_status, p_linked_received_id, '[]'::jsonb, p_created_at
  );
end;
$$;

grant execute on function deliver_message_to(text, uuid, uuid, text, text, text, text, text, text, text, text, bigint) to authenticated;

create or replace function update_message_cross_account(
  p_id text,
  p_mailbox_owner_id uuid,
  p_subject text,
  p_content text,
  p_edit_history jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update messages
  set subject = p_subject,
      content = p_content,
      edit_history = p_edit_history,
      updated_at = (extract(epoch from now()) * 1000)::bigint
  where id = p_id
    and mailbox_owner_id = p_mailbox_owner_id
    and sender_id = auth.uid();
end;
$$;

grant execute on function update_message_cross_account(text, uuid, text, text, jsonb) to authenticated;
