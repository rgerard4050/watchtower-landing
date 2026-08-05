-- Durable Resident pre-stage collection contract.
-- Rollout prerequisite: 20260805065906_guard_legacy_completion_for_active_jobs.sql
-- must be deployed and verified first.

create table public.scan_collections (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id),
  resident_user_id uuid not null references auth.users(id),
  status text not null default 'open' check (status in ('open','staged','abandoned')),
  version bigint not null default 0 check (version >= 0),
  staged_scan_id uuid unique references public.scans(id),
  stage_idempotency_key uuid unique,
  pickup_idempotency_key uuid unique,
  item_count integer not null default 0 check (item_count >= 0),
  estimated_high_recoverable_usd numeric(12,2) not null default 0,
  estimated_resident_dollars numeric(12,2) not null default 0,
  estimated_wtwr bigint not null default 0,
  estimate_policy jsonb,
  staged_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staged_at timestamptz,
  abandoned_at timestamptz
);

create unique index scan_collections_one_open_resident
  on public.scan_collections(resident_user_id) where status = 'open';

create table public.scan_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.scan_collections(id),
  client_item_id uuid not null,
  status text not null default 'accepted' check (status in ('accepted','removed')),
  captured_at timestamptz not null default now(),
  analysis_id uuid not null,
  analysis_model text,
  summary text not null,
  normalized_materials jsonb not null check (jsonb_typeof(normalized_materials) = 'array'),
  estimated_value_low numeric(12,2) not null check (estimated_value_low >= 0),
  estimated_value_high numeric(12,2) not null check (estimated_value_high >= estimated_value_low),
  estimated_resident_dollars numeric(12,2) not null check (estimated_resident_dollars >= 0),
  estimated_wtwr bigint not null check (estimated_wtwr >= 0),
  confidence numeric(5,4),
  review_state text not null default 'proposed' check (review_state in ('proposed','needs_review','verified','rejected')),
  evidence_id uuid not null default gen_random_uuid(),
  evidence_object_path text not null,
  evidence_status text not null default 'pending' check (evidence_status in ('pending','attached')),
  evidence_cleanup_eligible_at timestamptz,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique(collection_id, client_item_id),
  unique(analysis_id),
  unique(evidence_id)
);

create table public.collection_evidence_events (
  id bigint generated always as identity primary key,
  evidence_id uuid not null,
  collection_item_id uuid references public.scan_collection_items(id),
  event_type text not null check (event_type in ('created','attached','accessed','superseded','cleanup_eligible','deleted')),
  actor_user_id uuid,
  actor_context text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('collection-evidence', 'collection-evidence', false, 10485760, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.validate_collection_evidence_path()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_user uuid;
begin
  select resident_user_id into v_user from public.scan_collections where id = new.collection_id;
  if v_user is null or new.evidence_object_path <> v_user::text || '/' || new.collection_id::text || '/' || new.id::text || '/' || new.evidence_id::text || '.jpg' then
    raise exception using errcode='22023', message='Invalid collection evidence path.';
  end if;
  return new;
end $$;

create trigger validate_collection_evidence_path before insert or update of evidence_object_path
on public.scan_collection_items for each row execute function public.validate_collection_evidence_path();

create or replace function public.resident_collection_projection(p_collection_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'collectionId', c.id, 'status', c.status, 'version', c.version,
    'scanId', c.staged_scan_id, 'itemCount', c.item_count,
    'estimatedHighRecoverableUsd', c.estimated_high_recoverable_usd,
    'estimatedResidentDollars', c.estimated_resident_dollars,
    'estimatedWtwr', c.estimated_wtwr, 'estimatePolicy', c.estimate_policy,
    'stagedAt', c.staged_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'clientItemId', i.client_item_id, 'capturedAt', i.captured_at, 'summary', i.summary,
      'materials', i.normalized_materials, 'estimatedResidentDollars', i.estimated_resident_dollars,
      'estimatedWtwr', i.estimated_wtwr, 'confidence', i.confidence,
      'reviewState', i.review_state, 'evidenceId', i.evidence_id, 'evidenceStatus', i.evidence_status,
      'evidenceObjectPath', i.evidence_object_path
    ) order by i.captured_at, i.id) from public.scan_collection_items i
      where i.collection_id=c.id and i.status='accepted'), '[]'::jsonb)
  ) from public.scan_collections c where c.id=p_collection_id;
$$;

create or replace function public.recompute_resident_collection(p_collection_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.scan_collections c set
    item_count = x.item_count,
    estimated_high_recoverable_usd = x.high_usd,
    estimated_resident_dollars = x.resident_usd,
    estimated_wtwr = x.wtwr,
    updated_at = now()
  from (select count(*)::int item_count,
      coalesce(round(sum(estimated_value_high),2),0) high_usd,
      coalesce(round(sum(estimated_resident_dollars),2),0) resident_usd,
      coalesce(sum(estimated_wtwr),0)::bigint wtwr
    from public.scan_collection_items where collection_id=p_collection_id and status='accepted') x
  where c.id=p_collection_id;
end $$;

create or replace function public.resident_collection_open_or_recover()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_resident public.residents%rowtype; v_collection public.scan_collections%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='Authentication required.'; end if;
  select * into v_resident from public.residents where user_id=auth.uid() and account_status='active';
  if not found then raise exception using errcode='42501', message='Active Resident context required.'; end if;
  select * into v_collection from public.scan_collections where resident_user_id=auth.uid()
    order by (status='open') desc, created_at desc limit 1;
  if not found or v_collection.status not in ('open','staged') then
    insert into public.scan_collections(resident_id,resident_user_id)
    values(v_resident.id,auth.uid()) returning * into v_collection;
  end if;
  return public.resident_collection_projection(v_collection.id);
end $$;

create or replace function public.resident_collection_add_item(
  p_resident_user_id uuid, p_collection_id uuid, p_item_id uuid, p_client_item_id uuid,
  p_evidence_id uuid, p_expected_version bigint,
  p_analysis_id uuid, p_analysis_model text, p_summary text, p_materials jsonb,
  p_estimated_low numeric, p_estimated_high numeric, p_confidence numeric default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_collection public.scan_collections%rowtype; v_item public.scan_collection_items%rowtype;
  v_resident_usd numeric(12,2); v_wtwr bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception using errcode='42501', message='Server boundary required.';
  end if;
  select * into v_collection from public.scan_collections where id=p_collection_id for update;
  if not found or v_collection.resident_user_id<>p_resident_user_id then raise exception using errcode='42501', message='Collection not authorized.'; end if;
  select * into v_item from public.scan_collection_items where collection_id=p_collection_id and client_item_id=p_client_item_id;
  if found then return public.resident_collection_projection(p_collection_id); end if;
  if v_collection.status<>'open' then raise exception using errcode='55000', message='Collection is staged and immutable.'; end if;
  if v_collection.version<>p_expected_version then raise exception using errcode='40001', message='Collection version conflict.'; end if;
  if jsonb_typeof(p_materials)<>'array' or jsonb_array_length(p_materials)=0 or p_estimated_low<0 or p_estimated_high<p_estimated_low then
    raise exception using errcode='22023', message='Invalid analyzed item.'; end if;
  v_resident_usd := round(p_estimated_high * 0.40, 2);
  v_wtwr := round(v_resident_usd * 100)::bigint;
  insert into public.scan_collection_items(id,collection_id,client_item_id,analysis_id,analysis_model,summary,
    normalized_materials,estimated_value_low,estimated_value_high,estimated_resident_dollars,estimated_wtwr,
    confidence,evidence_id,evidence_object_path)
  values(p_item_id,p_collection_id,p_client_item_id,p_analysis_id,p_analysis_model,left(p_summary,2000),p_materials,
    p_estimated_low,p_estimated_high,v_resident_usd,v_wtwr,p_confidence,p_evidence_id,
    p_resident_user_id::text||'/'||p_collection_id::text||'/'||p_item_id::text||'/'||p_evidence_id::text||'.jpg');
  insert into public.collection_evidence_events(evidence_id,collection_item_id,event_type,actor_user_id,actor_context)
  values(p_evidence_id,p_item_id,'created',p_resident_user_id,'personal_resident');
  update public.scan_collections set version=version+1 where id=p_collection_id;
  perform public.recompute_resident_collection(p_collection_id);
  return public.resident_collection_projection(p_collection_id);
end $$;

create or replace function public.resident_collection_attach_evidence(
  p_resident_user_id uuid, p_collection_id uuid, p_item_id uuid, p_evidence_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_path text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception using errcode='42501', message='Server boundary required.';
  end if;
  update public.scan_collection_items i set evidence_status='attached'
  from public.scan_collections c
  where i.id=p_item_id and i.collection_id=p_collection_id and i.evidence_id=p_evidence_id
    and c.id=i.collection_id and c.resident_user_id=p_resident_user_id
  returning i.evidence_object_path into v_path;
  if v_path is null then raise exception using errcode='22023', message='Collection evidence item not found.'; end if;
  insert into public.collection_evidence_events(evidence_id,collection_item_id,event_type,actor_user_id,actor_context)
  select p_evidence_id,p_item_id,'attached',p_resident_user_id,'personal_resident'
  where not exists(select 1 from public.collection_evidence_events where evidence_id=p_evidence_id and event_type='attached');
  return public.resident_collection_projection(p_collection_id);
end $$;

create or replace function public.resident_collection_remove_item(p_collection_id uuid,p_item_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_collection public.scan_collections%rowtype; v_evidence uuid;
begin
  select * into v_collection from public.scan_collections where id=p_collection_id for update;
  if auth.uid() is null or not found or v_collection.resident_user_id<>auth.uid() then raise exception using errcode='42501',message='Collection not authorized.'; end if;
  if v_collection.status<>'open' then raise exception using errcode='55000',message='Collection is staged and immutable.'; end if;
  if v_collection.version<>p_expected_version then raise exception using errcode='40001',message='Collection version conflict.'; end if;
  update public.scan_collection_items set status='removed',removed_at=now(),evidence_cleanup_eligible_at=now()+interval '30 days'
    where id=p_item_id and collection_id=p_collection_id and status='accepted' returning evidence_id into v_evidence;
  if v_evidence is null then raise exception using errcode='22023',message='Accepted item not found.'; end if;
  insert into public.collection_evidence_events(evidence_id,collection_item_id,event_type,actor_user_id,actor_context)
  values(v_evidence,p_item_id,'cleanup_eligible',auth.uid(),'personal_resident');
  update public.scan_collections set version=version+1 where id=p_collection_id;
  perform public.recompute_resident_collection(p_collection_id);
  return public.resident_collection_projection(p_collection_id);
end $$;

create or replace function public.resident_collection_stage(p_collection_id uuid,p_expected_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.scan_collections%rowtype; v_scan uuid; v_summary text; v_materials jsonb; v_policy jsonb;
begin
  select * into c from public.scan_collections where id=p_collection_id for update;
  if auth.uid() is null or not found or c.resident_user_id<>auth.uid() then raise exception using errcode='42501',message='Collection not authorized.'; end if;
  if c.status='staged' and c.stage_idempotency_key=p_idempotency_key then return public.resident_collection_projection(c.id); end if;
  if c.status<>'open' then raise exception using errcode='55000',message='Collection is not editable.'; end if;
  if c.version<>p_expected_version then raise exception using errcode='40001',message='Collection version conflict.'; end if;
  perform public.recompute_resident_collection(c.id); select * into c from public.scan_collections where id=c.id;
  if c.item_count=0 then raise exception using errcode='22023',message='Collection must contain an accepted item.'; end if;
  if exists(select 1 from public.scan_collection_items where collection_id=c.id and status='accepted' and evidence_status<>'attached') then
    raise exception using errcode='55000',message='Every accepted item must have attached evidence before staging.';
  end if;
  select string_agg(summary,'; ' order by captured_at), coalesce(jsonb_agg(distinct m.value),'[]'::jsonb)
    into v_summary,v_materials from public.scan_collection_items i
    cross join lateral jsonb_array_elements_text(i.normalized_materials) m(value)
    where i.collection_id=c.id and i.status='accepted';
  v_policy:=jsonb_build_object('name','resident_estimate_v1','conversionWtwrPerDollar',100,
    'residentPercentage',40,'inputEstimatedHighRecoverableUsd',c.estimated_high_recoverable_usd,
    'roundingRule','resident dollars round half away from zero to 2 decimals; WTWR round to nearest whole token',
    'estimatedResidentDollars',c.estimated_resident_dollars,'estimatedWtwr',c.estimated_wtwr);
  insert into public.scans(resident_id,session_id,summary,items_seen,est_low,est_high,accepted_value,accepted,bounty_created,bounty_status)
    values(c.resident_id,auth.uid()::text,v_summary,v_materials,0,c.estimated_high_recoverable_usd,c.estimated_resident_dollars,true,false,null)
    returning id into v_scan;
  update public.scan_collections set status='staged',version=version+1,staged_scan_id=v_scan,
    stage_idempotency_key=p_idempotency_key,estimate_policy=v_policy,
    staged_snapshot=jsonb_build_object('items',public.resident_collection_projection(c.id)->'items','estimatePolicy',v_policy),
    staged_at=now(),updated_at=now() where id=c.id;
  return public.resident_collection_projection(c.id);
end $$;

create or replace function public.resident_collection_pickup_status(p_collection_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.scan_collections%rowtype;
begin
  select * into c from public.scan_collections where id=p_collection_id;
  if auth.uid() is null or not found or c.resident_user_id<>auth.uid() then raise exception using errcode='42501',message='Collection not authorized.'; end if;
  return (select jsonb_build_object('collectionId',c.id,'scanId',c.staged_scan_id,'pickupStatus',s.bounty_status,
    'pickupRequested',s.bounty_status is not null,'job',case when j.id is null then null else jsonb_build_object('id',j.id,'status',j.status,'updatedAt',j.updated_at) end)
    from public.scans s left join public.jobs j on j.scan_id=s.id and j.status<>'CANCELLED' where s.id=c.staged_scan_id);
end $$;

create or replace function public.resident_collection_request_pickup(p_collection_id uuid,
  p_pickup_lat numeric,p_pickup_lng numeric,p_location_accuracy_m numeric,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.scan_collections%rowtype; s public.scans%rowtype;
begin
  select * into c from public.scan_collections where id=p_collection_id for update;
  if auth.uid() is null or not found or c.resident_user_id<>auth.uid() then raise exception using errcode='42501',message='Collection not authorized.'; end if;
  if c.status<>'staged' or c.staged_scan_id is null then raise exception using errcode='55000',message='Collection must be staged first.'; end if;
  select * into s from public.scans where id=c.staged_scan_id for update;
  if c.pickup_idempotency_key=p_idempotency_key and s.bounty_status is not null then return public.resident_collection_pickup_status(c.id); end if;
  if s.bounty_status is not null then raise exception using errcode='55000',message='Pickup has already transitioned.'; end if;
  if p_pickup_lat is null or p_pickup_lng is null or p_location_accuracy_m is null or p_location_accuracy_m>100 then raise exception using errcode='22023',message='Precise pickup location is required.'; end if;
  update public.scan_collections set pickup_idempotency_key=p_idempotency_key,updated_at=now() where id=c.id;
  update public.scans set pickup_photo_url=(select evidence_object_path from public.scan_collection_items where collection_id=c.id and status='accepted' order by captured_at limit 1),
    pickup_photo_at=now(),pickup_lat=p_pickup_lat,pickup_lng=p_pickup_lng,lat=p_pickup_lat,lng=p_pickup_lng,
    location_accuracy_m=p_location_accuracy_m,bounty_created=true,bounty_status='open' where id=s.id;
  return public.resident_collection_pickup_status(c.id);
end $$;

alter table public.scan_collections enable row level security;
alter table public.scan_collection_items enable row level security;
alter table public.collection_evidence_events enable row level security;

create policy resident_collection_select on public.scan_collections for select to authenticated
using ((select auth.uid())=resident_user_id);
create policy resident_collection_items_select on public.scan_collection_items for select to authenticated
using (exists(select 1 from public.scan_collections c where c.id=collection_id and c.resident_user_id=(select auth.uid())));
create policy resident_evidence_events_select on public.collection_evidence_events for select to authenticated
using (exists(select 1 from public.scan_collection_items i join public.scan_collections c on c.id=i.collection_id
  where i.id=collection_item_id and c.resident_user_id=(select auth.uid())));

revoke all on public.scan_collections,public.scan_collection_items,public.collection_evidence_events from public,anon,authenticated;
grant select on public.scan_collections,public.scan_collection_items,public.collection_evidence_events to authenticated;
revoke all on function public.validate_collection_evidence_path(),public.resident_collection_projection(uuid),
 public.recompute_resident_collection(uuid) from public,anon,authenticated;
revoke all on function public.resident_collection_open_or_recover(),
 public.resident_collection_remove_item(uuid,uuid,bigint),public.resident_collection_stage(uuid,bigint,uuid) from public,anon;
revoke all on function public.resident_collection_add_item(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,text,jsonb,numeric,numeric,numeric)
 from public,anon,authenticated;
revoke all on function public.resident_collection_attach_evidence(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
revoke all on function public.resident_collection_pickup_status(uuid),public.resident_collection_request_pickup(uuid,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.resident_collection_open_or_recover(),
 public.resident_collection_remove_item(uuid,uuid,bigint),public.resident_collection_stage(uuid,bigint,uuid) to authenticated;
grant execute on function public.resident_collection_add_item(uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,text,jsonb,numeric,numeric,numeric)
 to service_role;
grant execute on function public.resident_collection_attach_evidence(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.resident_collection_projection(uuid),public.recompute_resident_collection(uuid) to service_role;
grant select,insert,update,delete on public.scan_collections,public.scan_collection_items,public.collection_evidence_events to service_role;
grant usage,select on sequence public.collection_evidence_events_id_seq to service_role;
grant execute on function public.resident_collection_pickup_status(uuid),public.resident_collection_request_pickup(uuid,numeric,numeric,numeric,uuid) to authenticated;

-- Storage writes are performed by the authenticated server boundary after it validates
-- collection ownership and constructs the canonical path. No browser INSERT policy exists.
create policy resident_collection_evidence_read on storage.objects for select to authenticated
using (bucket_id='collection-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
