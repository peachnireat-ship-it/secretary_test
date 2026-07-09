-- 배경: A가 B에게 보낸 메시지를 수정해도 B의 수신함 사본에 반영되지 않는 버그.
-- 원인: 라이브 DB의 messages UPDATE 정책이 mailbox_owner_id = auth.uid()만 허용하고
--       발신자(sender_id = auth.uid())의 상대방 사본 수정 권한이 빠져 있었음.
-- schema.sql에 정의된 최신 정책으로 재적용한다.
drop policy if exists messages_update_own_mailbox_or_sender on messages;
create policy messages_update_own_mailbox_or_sender on messages
  for update
  using (mailbox_owner_id = auth.uid() or sender_id = auth.uid())
  with check (mailbox_owner_id = auth.uid() or sender_id = auth.uid());
