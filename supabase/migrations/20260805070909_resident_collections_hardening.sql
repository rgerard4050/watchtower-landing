-- Harden Resident collection access after the initial live integration rollout.
-- Authenticated anonymous sessions must not inherit Resident data access, and
-- common ownership / foreign-key paths need supporting indexes.

drop policy if exists resident_collection_select on public.scan_collections;
create policy resident_collection_select on public.scan_collections
for select to authenticated
using (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (select auth.uid()) = resident_user_id
);

drop policy if exists resident_collection_items_select on public.scan_collection_items;
create policy resident_collection_items_select on public.scan_collection_items
for select to authenticated
using (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and exists (
    select 1 from public.scan_collections c
    where c.id = collection_id and c.resident_user_id = (select auth.uid())
  )
);

drop policy if exists resident_evidence_events_select on public.collection_evidence_events;
create policy resident_evidence_events_select on public.collection_evidence_events
for select to authenticated
using (
  coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and exists (
    select 1
    from public.scan_collection_items i
    join public.scan_collections c on c.id = i.collection_id
    where i.id = collection_item_id and c.resident_user_id = (select auth.uid())
  )
);

drop policy if exists resident_collection_evidence_read on storage.objects;
create policy resident_collection_evidence_read on storage.objects
for select to authenticated
using (
  bucket_id = 'collection-evidence'
  and coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create index if not exists scan_collections_resident_id_idx
  on public.scan_collections(resident_id);
create index if not exists scan_collections_resident_user_id_idx
  on public.scan_collections(resident_user_id);
create index if not exists collection_evidence_events_item_id_idx
  on public.collection_evidence_events(collection_item_id);
