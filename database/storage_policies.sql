-- Storage RLS policies for post-images / attachments buckets.
--
-- Marking a bucket "Public" in the dashboard only makes downloads work without
-- an API key — it does NOT create any policy on storage.objects, so uploads
-- (insert) were being blocked by RLS with no policy to satisfy at all. This
-- is what produced "StorageApiError: new row violates row-level security
-- policy" when publishing a post with images/attachments.
--
-- kxUploadFile() in index.html writes to `<user id>/<timestamp>-<random>-<name>`,
-- so these policies only let a signed-in user upload into their own folder.
--
-- Run this once in the Supabase SQL editor (same place schema.sql was run).

create policy "users upload to own folder in post-images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users upload to own folder in attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Explicit public-read policies too (belt and suspenders alongside the
-- bucket's own "Public" flag) so post images/attachments show up for anyone
-- browsing the feed, not just the uploader.
create policy "anyone can view post-images"
on storage.objects for select
to public
using (bucket_id = 'post-images');

create policy "anyone can view attachments"
on storage.objects for select
to public
using (bucket_id = 'attachments');

-- Lets a user delete their own uploaded files (used if a post is later
-- edited/removed; not wired into the UI yet but harmless to have ready).
create policy "users delete their own files in post-images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete their own files in attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
