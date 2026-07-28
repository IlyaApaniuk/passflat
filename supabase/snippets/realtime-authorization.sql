-- Realtime Authorization for chat channels.
--
-- Run in the Supabase SQL editor, then turn OFF "Allow public access" in
-- Realtime settings — without that the same topics stay joinable as public
-- channels and these policies decide nothing.
--
-- Applies to the four topics the app uses (see src/lib/supabase/realtime.ts):
--   chat:<conversationId>        broadcast, server → participants
--   chat:notifications:<userId>  broadcast, server → that one user
--   typing:<conversationId>      broadcast, participant ↔ participant
--   online-users                 presence, any signed-in user
--
-- Only `typing:` and `online-users` get INSERT policies: clients never publish
-- on the other two (the server does, and the service role bypasses RLS), so
-- withholding INSERT stops a participant from forging traffic on them.
--
-- Re-runnable: every policy is dropped before it is created.

-- chat:<conversationId> — read for participants of that conversation.
drop policy if exists "chat participants read conversation broadcasts" on realtime.messages;
create policy "chat participants read conversation broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'chat:%'
  and realtime.topic() not like 'chat:notifications:%'
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.user_id = (select auth.uid())
      -- 'chat:' is 5 chars; compare as text so a malformed topic cannot raise
      -- a uuid cast error, it simply matches nothing.
      and cp.conversation_id::text = substring(realtime.topic() from 6)
  )
);

-- chat:notifications:<userId> — read for that user only.
drop policy if exists "users read their own chat notifications" on realtime.messages;
create policy "users read their own chat notifications"
on realtime.messages
for select
to authenticated
using (realtime.topic() = 'chat:notifications:' || (select auth.uid())::text);

-- typing:<conversationId> — participants both read and publish.
drop policy if exists "chat participants read typing" on realtime.messages;
create policy "chat participants read typing"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'typing:%'
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.user_id = (select auth.uid())
      and cp.conversation_id::text = substring(realtime.topic() from 8)
  )
);

drop policy if exists "chat participants send typing" on realtime.messages;
create policy "chat participants send typing"
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'typing:%'
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.user_id = (select auth.uid())
      and cp.conversation_id::text = substring(realtime.topic() from 8)
  )
);

-- online-users — presence for any signed-in user (that is the whole feature).
drop policy if exists "authenticated read presence" on realtime.messages;
create policy "authenticated read presence"
on realtime.messages
for select
to authenticated
using (realtime.topic() = 'online-users');

drop policy if exists "authenticated track presence" on realtime.messages;
create policy "authenticated track presence"
on realtime.messages
for insert
to authenticated
with check (realtime.topic() = 'online-users');
