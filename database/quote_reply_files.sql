-- Let the seller attach the actual quotation document to their reply.
--
-- `quote_request_files` only ever held the buyer's attachments (drawings,
-- specs). The reply modal has had a file picker the whole time, but nothing
-- uploaded it and there was no policy that would have allowed the seller to
-- write to that table anyway — so the ใบเสนอราคา a seller attached went
-- nowhere and never appeared on the buyer's card.
--
-- One column tells the two apart, so both sides' files live on the same
-- request and can be shown separately.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

alter table quote_request_files
  add column if not exists side text not null default 'request';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quote_request_files_side_check'
  ) then
    alter table quote_request_files
      add constraint quote_request_files_side_check check (side in ('request','reply'));
  end if;
end $$;


-- The buyer attaches to their own request, and only as the request side.
drop policy if exists "requesters attach their own files" on quote_request_files;
create policy "requesters attach their own files" on quote_request_files for insert
  with check (
    side = 'request'
    and exists (
      select 1 from quote_requests r
      where r.id = request_id and r.requester_id = auth.uid()
    )
  );

-- The seller attaches the quotation, and only as the reply side, and only on
-- a request against a post they own.
drop policy if exists "sellers attach reply files" on quote_request_files;
create policy "sellers attach reply files" on quote_request_files for insert
  with check (
    side = 'reply'
    and exists (
      select 1 from quote_requests r
      join posts p on p.id = r.post_id
      where r.id = request_id and p.owner_id = auth.uid()
    )
  );

-- Either side may remove a file they attached; the select policy already
-- limits visibility to the two parties.
drop policy if exists "attachers delete their own files" on quote_request_files;
create policy "attachers delete their own files" on quote_request_files for delete
  using (
    (side = 'request' and exists (
      select 1 from quote_requests r where r.id = request_id and r.requester_id = auth.uid()))
    or
    (side = 'reply' and exists (
      select 1 from quote_requests r join posts p on p.id = r.post_id
      where r.id = request_id and p.owner_id = auth.uid()))
  );
