drop policy if exists messages_insert_as_sender on messages;
create policy messages_insert_as_sender on messages
  for insert with check (sender_id = auth.uid() or mailbox_owner_id = auth.uid());
