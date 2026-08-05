-- Phase 5: durable, non-financial progression for Resident and future Field Partner contexts.
-- XP is append-only and never mutates Wallet, WTWR credit, payouts, Transactions, roles, or Asset status.

create table public.xp_rule_versions (
  reason_code text not null,
  rule_version integer not null check (rule_version > 0),
  amount integer not null check (amount > 0),
  default_state text not null check (default_state in ('provisional','verified')),
  product_configurable boolean not null default true,
  active boolean not null default true,
  description text not null,
  created_at timestamptz not null default now(),
  primary key (reason_code, rule_version)
);

insert into public.xp_rule_versions(reason_code,rule_version,amount,default_state,description) values
  ('collection.first_created',1,25,'verified','First durable Collection accepted for participation.'),
  ('collection_item.first_accepted',1,50,'verified','First Collection Item accepted with durable evidence.'),
  ('collection_item.additional_unique',1,20,'verified','Additional unique Collection Item accepted.'),
  ('material.category_first_discovered',1,10,'verified','First discovery of a normalized Material category.'),
  ('collection.safe_staging_checklist_completed',1,25,'verified','Safe staging checklist completed through an authoritative future workflow.'),
  ('collection.staged',1,100,'verified','Collection successfully staged as one canonical Scan.'),
  ('pickup.completed',1,150,'verified','Pickup completed through the canonical lifecycle.'),
  ('learning.module_completed',1,50,'verified','Versioned learning module completed.'),
  ('mission.completed',1,75,'verified','Durable learning mission completed.'),
  ('evidence.eligible_submitted',1,15,'provisional','Eligible evidence submitted and awaiting review.'),
  ('processing.contribution_proposed',1,25,'provisional','Processing Contribution proposed through a future authoritative workflow.'),
  ('processing.contribution_verified',1,100,'verified','Processing Contribution verified by an Operator.'),
  ('referral.qualified',1,100,'verified','Referral qualified through a future authoritative workflow.'),
  ('champion.recognized',1,250,'verified','Watchtower Champion recognition granted without elevated authority.');

create table public.xp_level_thresholds (
  threshold_version text not null,
  level integer not null check (level > 0),
  title text not null,
  verified_xp_required integer not null check (verified_xp_required >= 0),
  created_at timestamptz not null default now(),
  primary key (threshold_version, level),
  unique (threshold_version, verified_xp_required)
);

insert into public.xp_level_thresholds(threshold_version,level,title,verified_xp_required) values
  ('resident_levels_v1',1,'Observer',0),
  ('resident_levels_v1',2,'Sorter',100),
  ('resident_levels_v1',3,'Material Scout',250),
  ('resident_levels_v1',4,'Recovery Guide',500),
  ('resident_levels_v1',5,'Circularity Steward',1000);

create table public.learning_modules (
  module_id text not null,
  module_version integer not null check (module_version > 0),
  title text not null,
  learning_objective text not null,
  safety_classification text not null check (safety_classification in ('general','caution','hazard_awareness')),
  applicable_contexts text[] not null default array['resident']::text[],
  applicable_material_categories text[] not null default '{}'::text[],
  completion_criteria jsonb not null,
  xp_reason_code text not null default 'learning.module_completed',
  status text not null check (status in ('draft','active','retired')),
  predecessor_modules jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (module_id, module_version),
  foreign key (xp_reason_code, module_version) references public.xp_rule_versions(reason_code, rule_version)
);

insert into public.learning_modules(module_id,module_version,title,learning_objective,safety_classification,applicable_material_categories,completion_criteria,status) values
  ('safe_battery_handling',1,'Safe Battery Handling','Recognize damaged batteries, avoid puncture or crushing, isolate terminals, and use an approved drop-off path.','hazard_awareness',array['battery','lithium battery','lead-acid battery'],jsonb_build_object('type','acknowledgement','statement','I understand that damaged or swollen batteries require an approved safety path and must not be dismantled.'),'active'),
  ('appliance_dismantling_limits',1,'Know When Not to Dismantle','Identify appliances and sealed systems that should remain intact until an authorized processor evaluates them.','hazard_awareness',array['appliance','refrigerator','air conditioner'],jsonb_build_object('type','acknowledgement','statement','I will not open sealed, pressurized, or energized appliance systems.'),'active'),
  ('safe_pickup_staging',1,'Stage a Safe Pickup','Organize recoverable material so it is stable, accessible, represented accurately, and safe for pickup.','caution','{}'::text[],jsonb_build_object('type','acknowledgement','statement','I understand the safe staging expectations for a pickup.'),'active');

create table public.mission_definitions (
  mission_code text not null,
  mission_version integer not null check (mission_version > 0),
  title text not null,
  description text not null,
  applicable_contexts text[] not null default array['resident']::text[],
  criteria jsonb not null,
  xp_reason_code text not null default 'mission.completed',
  status text not null check (status in ('draft','active','retired')),
  created_at timestamptz not null default now(),
  primary key (mission_code, mission_version),
  foreign key (xp_reason_code, mission_version) references public.xp_rule_versions(reason_code, rule_version)
);

insert into public.mission_definitions(mission_code,mission_version,title,description,criteria,status) values
  ('discover_three_materials',1,'Material Explorer','Identify three distinct normalized Material categories.',jsonb_build_object('kind','material_category_count','target',3),'active'),
  ('complete_safe_battery_learning',1,'Battery Safety First','Complete the current Safe Battery Handling module.',jsonb_build_object('kind','module_completion','moduleId','safe_battery_handling','moduleVersion',1,'target',1),'active'),
  ('stage_first_collection',1,'Stage It Safely','Successfully stage a durable Collection after accepting its evidence.',jsonb_build_object('kind','staged_collection_count','target',1),'active'),
  ('complete_first_pickup',1,'Complete the Recovery Loop','Complete one pickup through the canonical lifecycle.',jsonb_build_object('kind','completed_pickup_count','target',1),'active');

create table public.achievement_definitions (
  achievement_code text not null,
  achievement_version integer not null check (achievement_version > 0),
  title text not null,
  description text not null,
  status text not null check (status in ('draft','active','retired')),
  created_at timestamptz not null default now(),
  primary key (achievement_code, achievement_version)
);

insert into public.achievement_definitions values
  ('first_collection',1,'Collection Started','Accepted the first durable Collection Item.','active',now()),
  ('material_explorer',1,'Material Explorer','Discovered three distinct Material categories.','active',now()),
  ('first_bounty_staged',1,'Bounty Staged','Staged the first durable bounty.','active',now()),
  ('first_pickup_completed',1,'Recovery Loop','Completed the first canonical pickup.','active',now());

create table public.xp_entries (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid references public.residents(id),
  active_context text not null check (active_context in ('resident','field_partner')),
  organization_type text,
  organization_id text,
  reason_code text not null,
  rule_version integer not null,
  amount integer not null check (amount <> 0),
  entry_state text not null check (entry_state in ('provisional','verified','reversal','expired')),
  source_entity_type text not null,
  source_entity_id text not null,
  awarding_actor_user_id uuid,
  awarding_context text not null,
  idempotency_key uuid not null,
  verified_at timestamptz,
  reversal_of_entry_id uuid references public.xp_entries(id),
  verified_from_entry_id uuid references public.xp_entries(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (reason_code, rule_version) references public.xp_rule_versions(reason_code, rule_version),
  unique (recipient_user_id, idempotency_key),
  unique (recipient_user_id, reason_code, source_entity_type, source_entity_id, rule_version, entry_state),
  check ((entry_state = 'verified') = (verified_at is not null)),
  check (reversal_of_entry_id is null or entry_state in ('reversal','expired')),
  check (verified_from_entry_id is null or entry_state = 'verified')
);

create unique index xp_entries_one_resolution_per_provisional
  on public.xp_entries(reversal_of_entry_id) where reversal_of_entry_id is not null;
create unique index xp_entries_one_verification_per_provisional
  on public.xp_entries(verified_from_entry_id) where verified_from_entry_id is not null;
create index xp_entries_recipient_history_idx on public.xp_entries(recipient_user_id,created_at desc);
create index xp_entries_resident_idx on public.xp_entries(resident_id);
create index xp_entries_source_idx on public.xp_entries(source_entity_type,source_entity_id);

create table public.material_discoveries (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid not null references public.residents(id),
  normalized_category text not null,
  first_collection_item_id uuid not null references public.scan_collection_items(id),
  first_discovered_at timestamptz not null default now(),
  unique (recipient_user_id, normalized_category)
);

create index material_discoveries_resident_idx on public.material_discoveries(resident_id);

create table public.learning_completions (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid not null references public.residents(id),
  active_context text not null check (active_context = 'resident'),
  module_id text not null,
  module_version integer not null,
  idempotency_key uuid not null,
  xp_entry_id uuid references public.xp_entries(id),
  completed_at timestamptz not null default now(),
  foreign key (module_id,module_version) references public.learning_modules(module_id,module_version),
  unique (recipient_user_id,module_id,module_version),
  unique (recipient_user_id,idempotency_key)
);

create index learning_completions_resident_idx on public.learning_completions(resident_id);

create table public.resident_mission_progress (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid not null references public.residents(id),
  mission_code text not null,
  mission_version integer not null,
  progress_value integer not null default 0 check (progress_value >= 0),
  target_value integer not null check (target_value > 0),
  status text not null check (status in ('active','completed')),
  xp_entry_id uuid references public.xp_entries(id),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (mission_code,mission_version) references public.mission_definitions(mission_code,mission_version),
  unique (recipient_user_id,mission_code,mission_version)
);

create index resident_mission_progress_resident_idx on public.resident_mission_progress(resident_id);

create table public.resident_achievements (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid not null references public.residents(id),
  achievement_code text not null,
  achievement_version integer not null,
  source_entity_type text not null,
  source_entity_id text not null,
  public_recognition_consent boolean not null default false,
  awarded_at timestamptz not null default now(),
  foreign key (achievement_code,achievement_version) references public.achievement_definitions(achievement_code,achievement_version),
  unique (recipient_user_id,achievement_code,achievement_version)
);

create index resident_achievements_resident_idx on public.resident_achievements(resident_id);

create table public.watchtower_champion_recognitions (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id),
  resident_id uuid references public.residents(id),
  status text not null check (status in ('active','revoked')),
  recognized_by_user_id uuid not null,
  recognized_by_context text not null,
  reason text not null,
  public_recognition_consent boolean not null default false,
  xp_entry_id uuid references public.xp_entries(id),
  recognized_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.watchtower_champion_recognitions is
  'Recognition and education contract only. It grants no ownership, role, financial, Asset, Operator, Administrator, or Founder authority.';
comment on column public.xp_entries.active_context is
  'Explicit Resident or future Field Partner progression context. It never grants a role or specialization.';

create index watchtower_champion_recognitions_recipient_idx
  on public.watchtower_champion_recognitions(recipient_user_id,recognized_at desc);

create or replace function public.prevent_xp_entry_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode='55000',message='XP entries are append-only; use a compensating entry.';
end $$;

create trigger xp_entries_append_only before update or delete on public.xp_entries
for each row execute function public.prevent_xp_entry_mutation();

create or replace function public.gamification_award_xp_internal(
  p_recipient_user_id uuid,p_resident_id uuid,p_active_context text,p_reason_code text,
  p_source_entity_type text,p_source_entity_id text,p_awarding_actor_user_id uuid,
  p_awarding_context text,p_idempotency_key uuid,p_entry_state text default null,
  p_metadata jsonb default '{}'::jsonb)
returns public.xp_entries language plpgsql security definer set search_path = '' as $$
declare r public.xp_rule_versions%rowtype; e public.xp_entries%rowtype; v_state text;
begin
  if p_active_context not in ('resident','field_partner') then
    raise exception using errcode='22023',message='Unsupported progression context.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recipient_user_id::text||':'||p_reason_code||':'||p_source_entity_type||':'||p_source_entity_id,0));
  select * into r from public.xp_rule_versions
    where reason_code=p_reason_code and active order by rule_version desc limit 1;
  if not found then raise exception using errcode='22023',message='Active XP rule not found.'; end if;
  v_state:=coalesce(p_entry_state,r.default_state);
  if v_state not in ('provisional','verified') then raise exception using errcode='22023',message='Invalid XP award state.'; end if;
  insert into public.xp_entries(recipient_user_id,resident_id,active_context,reason_code,rule_version,amount,
    entry_state,source_entity_type,source_entity_id,awarding_actor_user_id,awarding_context,idempotency_key,
    verified_at,metadata)
  values(p_recipient_user_id,p_resident_id,p_active_context,r.reason_code,r.rule_version,r.amount,v_state,
    left(p_source_entity_type,80),left(p_source_entity_id,200),p_awarding_actor_user_id,left(p_awarding_context,80),
    p_idempotency_key,case when v_state='verified' then now() end,coalesce(p_metadata,'{}'::jsonb))
  on conflict do nothing returning * into e;
  if found then return e; end if;
  select * into e from public.xp_entries where recipient_user_id=p_recipient_user_id and idempotency_key=p_idempotency_key;
  if found then
    if e.reason_code<>r.reason_code or e.source_entity_type<>left(p_source_entity_type,80)
      or e.source_entity_id<>left(p_source_entity_id,200) or e.entry_state<>v_state then
      raise exception using errcode='22023',message='Idempotency key already belongs to another XP event.';
    end if;
    return e;
  end if;
  select * into e from public.xp_entries where recipient_user_id=p_recipient_user_id and reason_code=r.reason_code
    and source_entity_type=left(p_source_entity_type,80) and source_entity_id=left(p_source_entity_id,200)
    and rule_version=r.rule_version and entry_state=v_state;
  if not found then raise exception using errcode='23505',message='XP award conflict.'; end if;
  return e;
end $$;

create or replace function public.gamification_grant_achievement_internal(
  p_recipient_user_id uuid,p_resident_id uuid,p_achievement_code text,
  p_source_entity_type text,p_source_entity_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version integer;
begin
  select max(achievement_version) into v_version from public.achievement_definitions
    where achievement_code=p_achievement_code and status='active';
  if v_version is null then return; end if;
  insert into public.resident_achievements(recipient_user_id,resident_id,achievement_code,achievement_version,source_entity_type,source_entity_id)
  values(p_recipient_user_id,p_resident_id,p_achievement_code,v_version,p_source_entity_type,p_source_entity_id)
  on conflict (recipient_user_id,achievement_code,achievement_version) do nothing;
end $$;

create or replace function public.gamification_refresh_missions_internal(p_recipient_user_id uuid,p_resident_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.mission_definitions%rowtype; v_progress integer; v_target integer;
  v_status text; v_xp uuid; v_progress_id uuid;
begin
  for m in select * from public.mission_definitions where status='active' and 'resident'=any(applicable_contexts) loop
    v_target:=coalesce((m.criteria->>'target')::integer,1);
    case m.criteria->>'kind'
      when 'material_category_count' then
        select count(*)::integer into v_progress from public.material_discoveries where recipient_user_id=p_recipient_user_id;
      when 'module_completion' then
        select count(*)::integer into v_progress from public.learning_completions where recipient_user_id=p_recipient_user_id
          and module_id=m.criteria->>'moduleId' and module_version=(m.criteria->>'moduleVersion')::integer;
      when 'staged_collection_count' then
        select count(*)::integer into v_progress from public.scan_collections where resident_user_id=p_recipient_user_id and status='staged';
      when 'completed_pickup_count' then
        select count(*)::integer into v_progress from public.scan_collections c join public.scans s on s.id=c.staged_scan_id
          where c.resident_user_id=p_recipient_user_id and s.bounty_status='completed';
      else v_progress:=0;
    end case;
    v_status:=case when v_progress>=v_target then 'completed' else 'active' end;
    insert into public.resident_mission_progress(recipient_user_id,resident_id,mission_code,mission_version,
      progress_value,target_value,status,completed_at)
    values(p_recipient_user_id,p_resident_id,m.mission_code,m.mission_version,v_progress,v_target,v_status,
      case when v_status='completed' then now() end)
    on conflict (recipient_user_id,mission_code,mission_version) do update set
      progress_value=greatest(public.resident_mission_progress.progress_value,excluded.progress_value),
      status=case when public.resident_mission_progress.status='completed' then 'completed' else excluded.status end,
      completed_at=coalesce(public.resident_mission_progress.completed_at,excluded.completed_at),updated_at=now()
    returning id,status,xp_entry_id into v_progress_id,v_status,v_xp;
    if v_status='completed' and v_xp is null then
      v_xp:=(public.gamification_award_xp_internal(p_recipient_user_id,p_resident_id,'resident','mission.completed',
        'mission',m.mission_code||':'||m.mission_version,p_recipient_user_id,'system_mission',gen_random_uuid(),'verified',
        jsonb_build_object('missionCode',m.mission_code,'missionVersion',m.mission_version))).id;
      update public.resident_mission_progress set xp_entry_id=v_xp where id=v_progress_id and xp_entry_id is null;
    end if;
  end loop;
end $$;

create or replace function public.gamification_on_item_evidence_attached()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.scan_collections%rowtype; v_material text; v_normalized text; v_inserted uuid;
begin
  if new.evidence_status<>'attached' or old.evidence_status='attached' then return new; end if;
  select * into c from public.scan_collections where id=new.collection_id;
  perform pg_advisory_xact_lock(hashtextextended(c.resident_user_id::text||':resident_progression',0));
  if not exists(select 1 from public.xp_entries where recipient_user_id=c.resident_user_id and reason_code='collection.first_created') then
    perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','collection.first_created',
      'collection',c.id::text,c.resident_user_id,'resident_collection',gen_random_uuid(),'verified',jsonb_build_object('collectionId',c.id));
    perform public.gamification_grant_achievement_internal(c.resident_user_id,c.resident_id,'first_collection','collection',c.id::text);
  end if;
  if not exists(select 1 from public.xp_entries where recipient_user_id=c.resident_user_id and reason_code='collection_item.first_accepted') then
    perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','collection_item.first_accepted',
      'collection_item',new.id::text,c.resident_user_id,'resident_collection',gen_random_uuid(),'verified',jsonb_build_object('collectionItemId',new.id));
  else
    perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','collection_item.additional_unique',
      'collection_item',new.id::text,c.resident_user_id,'resident_collection',gen_random_uuid(),'verified',jsonb_build_object('collectionItemId',new.id));
  end if;
  perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','evidence.eligible_submitted',
    'collection_item',new.id::text,c.resident_user_id,'resident_collection',gen_random_uuid(),'provisional',
    jsonb_build_object('reviewState',new.review_state));
  for v_material in select value from jsonb_array_elements_text(new.normalized_materials) loop
    v_normalized:=left(lower(regexp_replace(trim(v_material),'\s+',' ','g')),120);
    if v_normalized<>'' then
      v_inserted:=null;
      insert into public.material_discoveries(recipient_user_id,resident_id,normalized_category,first_collection_item_id)
      values(c.resident_user_id,c.resident_id,v_normalized,new.id)
      on conflict (recipient_user_id,normalized_category) do nothing returning id into v_inserted;
      if v_inserted is not null then
        perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','material.category_first_discovered',
          'material_category',v_normalized,c.resident_user_id,'resident_collection',gen_random_uuid(),'verified',
          jsonb_build_object('materialCategory',v_normalized));
      end if;
    end if;
  end loop;
  perform public.gamification_refresh_missions_internal(c.resident_user_id,c.resident_id);
  if (select count(*) from public.material_discoveries where recipient_user_id=c.resident_user_id)>=3 then
    perform public.gamification_grant_achievement_internal(c.resident_user_id,c.resident_id,'material_explorer','collection_item',new.id::text);
  end if;
  return new;
end $$;

create trigger gamification_item_evidence_attached after update of evidence_status on public.scan_collection_items
for each row when (new.evidence_status='attached' and old.evidence_status is distinct from new.evidence_status)
execute function public.gamification_on_item_evidence_attached();

create or replace function public.gamification_on_collection_staged()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='staged' and old.status is distinct from new.status then
    perform public.gamification_award_xp_internal(new.resident_user_id,new.resident_id,'resident','collection.staged',
      'collection',new.id::text,new.resident_user_id,'resident_collection',gen_random_uuid(),'verified',jsonb_build_object('scanId',new.staged_scan_id));
    perform public.gamification_grant_achievement_internal(new.resident_user_id,new.resident_id,'first_bounty_staged','collection',new.id::text);
    perform public.gamification_refresh_missions_internal(new.resident_user_id,new.resident_id);
  end if;
  return new;
end $$;

create trigger gamification_collection_staged after update of status on public.scan_collections
for each row when (new.status='staged' and old.status is distinct from new.status)
execute function public.gamification_on_collection_staged();

create or replace function public.gamification_on_pickup_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.scan_collections%rowtype;
begin
  if new.bounty_status='completed' and old.bounty_status is distinct from new.bounty_status then
    select * into c from public.scan_collections where staged_scan_id=new.id;
    if found then
      perform public.gamification_award_xp_internal(c.resident_user_id,c.resident_id,'resident','pickup.completed',
        'scan',new.id::text,c.resident_user_id,'canonical_lifecycle',gen_random_uuid(),'verified',jsonb_build_object('collectionId',c.id));
      perform public.gamification_grant_achievement_internal(c.resident_user_id,c.resident_id,'first_pickup_completed','scan',new.id::text);
      perform public.gamification_refresh_missions_internal(c.resident_user_id,c.resident_id);
    end if;
  end if;
  return new;
end $$;

create trigger gamification_pickup_completed after update of bounty_status on public.scans
for each row when (new.bounty_status='completed' and old.bounty_status is distinct from new.bounty_status)
execute function public.gamification_on_pickup_completed();

-- Forward declaration; replaced below by the complete safe projection after all
-- supporting commands have been declared.
create or replace function public.resident_gamification_projection()
returns jsonb language sql stable security definer set search_path = '' as $$
  select '{}'::jsonb;
$$;

create or replace function public.resident_complete_learning_module(
  p_module_id text,p_module_version integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.residents%rowtype; c public.learning_completions%rowtype; v_xp uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode='42501',message='Authentication required.';
  end if;
  select * into r from public.residents where user_id=auth.uid() and account_status='active';
  if not found then raise exception using errcode='42501',message='Active Resident context required.'; end if;
  if not exists(select 1 from public.learning_modules where module_id=p_module_id and module_version=p_module_version
    and status='active' and 'resident'=any(applicable_contexts)) then
    raise exception using errcode='22023',message='Active learning module not found.';
  end if;
  insert into public.learning_completions(recipient_user_id,resident_id,active_context,module_id,module_version,idempotency_key)
  values(auth.uid(),r.id,'resident',p_module_id,p_module_version,p_idempotency_key)
  on conflict do nothing returning * into c;
  if not found then
    select * into c from public.learning_completions where recipient_user_id=auth.uid()
      and ((module_id=p_module_id and module_version=p_module_version) or idempotency_key=p_idempotency_key)
      order by completed_at limit 1;
  end if;
  if c.module_id<>p_module_id or c.module_version<>p_module_version then
    raise exception using errcode='22023',message='Idempotency key already belongs to another learning completion.';
  end if;
  if c.xp_entry_id is null then
    v_xp:=(public.gamification_award_xp_internal(auth.uid(),r.id,'resident','learning.module_completed','learning_module',
      p_module_id||':'||p_module_version,auth.uid(),'resident_learning',p_idempotency_key,'verified',
      jsonb_build_object('moduleId',p_module_id,'moduleVersion',p_module_version))).id;
    update public.learning_completions set xp_entry_id=v_xp where id=c.id and xp_entry_id is null;
  end if;
  perform public.gamification_refresh_missions_internal(auth.uid(),r.id);
  return public.resident_gamification_projection();
end $$;

create or replace function public.gamification_resolve_provisional(
  p_entry_id uuid,p_resolution text,p_actor_user_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.xp_entries%rowtype; x public.xp_entries%rowtype; v_verified uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception using errcode='42501',message='Server boundary required.'; end if;
  if p_resolution not in ('verified','rejected','expired') then raise exception using errcode='22023',message='Invalid provisional resolution.'; end if;
  select * into p from public.xp_entries where id=p_entry_id and entry_state='provisional' for update;
  if not found then raise exception using errcode='22023',message='Provisional XP entry not found.'; end if;
  select * into x from public.xp_entries where reversal_of_entry_id=p.id;
  if found then
    return jsonb_build_object('provisionalEntryId',p.id,'resolutionEntryId',x.id,'verifiedEntryId',
      (select id from public.xp_entries where verified_from_entry_id=p.id));
  end if;
  insert into public.xp_entries(recipient_user_id,resident_id,active_context,reason_code,rule_version,amount,entry_state,
    source_entity_type,source_entity_id,awarding_actor_user_id,awarding_context,idempotency_key,reversal_of_entry_id,metadata)
  values(p.recipient_user_id,p.resident_id,p.active_context,p.reason_code,p.rule_version,-p.amount,
    case when p_resolution='expired' then 'expired' else 'reversal' end,p.source_entity_type,p.source_entity_id,
    p_actor_user_id,'operator_review',p_idempotency_key,p.id,jsonb_build_object('resolution',p_resolution)) returning * into x;
  if p_resolution='verified' then
    insert into public.xp_entries(recipient_user_id,resident_id,active_context,reason_code,rule_version,amount,entry_state,
      source_entity_type,source_entity_id,awarding_actor_user_id,awarding_context,idempotency_key,verified_at,
      verified_from_entry_id,metadata)
    values(p.recipient_user_id,p.resident_id,p.active_context,p.reason_code,p.rule_version,p.amount,'verified',
      p.source_entity_type,p.source_entity_id,p_actor_user_id,'operator_review',gen_random_uuid(),now(),p.id,
      jsonb_build_object('resolution','verified')) returning id into v_verified;
  end if;
  return jsonb_build_object('provisionalEntryId',p.id,'resolutionEntryId',x.id,'verifiedEntryId',v_verified);
end $$;

create or replace function public.resident_gamification_projection()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.residents%rowtype; v_verified integer; v_provisional integer;
  v_level integer; v_title text; v_floor integer; v_next integer;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception using errcode='42501',message='Authentication required.';
  end if;
  select * into r from public.residents where user_id=auth.uid() and account_status='active';
  if not found then raise exception using errcode='42501',message='Active Resident context required.'; end if;
  select coalesce(sum(e.amount),0)::integer into v_verified from public.xp_entries e
    where e.recipient_user_id=auth.uid() and (e.entry_state='verified' or
      (e.entry_state in ('reversal','expired') and exists(select 1 from public.xp_entries p where p.id=e.reversal_of_entry_id and p.entry_state='verified')));
  select coalesce(sum(e.amount),0)::integer into v_provisional from public.xp_entries e
    where e.recipient_user_id=auth.uid() and e.entry_state='provisional'
      and not exists(select 1 from public.xp_entries x where x.reversal_of_entry_id=e.id);
  select level,title,verified_xp_required into v_level,v_title,v_floor from public.xp_level_thresholds
    where threshold_version='resident_levels_v1' and verified_xp_required<=v_verified
    order by verified_xp_required desc limit 1;
  select verified_xp_required into v_next from public.xp_level_thresholds
    where threshold_version='resident_levels_v1' and verified_xp_required>v_verified
    order by verified_xp_required limit 1;
  return jsonb_build_object(
    'context','resident','verifiedXp',v_verified,'provisionalXp',v_provisional,
    'level',jsonb_build_object('number',v_level,'title',v_title,'thresholdVersion','resident_levels_v1',
      'currentThreshold',v_floor,'nextThreshold',v_next,'xpToNext',case when v_next is null then 0 else v_next-v_verified end,
      'progressPercent',case when v_next is null then 100 else floor(100.0*(v_verified-v_floor)/greatest(v_next-v_floor,1))::integer end),
    'missions',coalesce((select jsonb_agg(jsonb_build_object('code',m.mission_code,'version',m.mission_version,
      'title',m.title,'description',m.description,'progress',coalesce(p.progress_value,0),
      'target',coalesce(p.target_value,(m.criteria->>'target')::integer,1),'status',coalesce(p.status,'active'))
      order by (coalesce(p.status,'active')='completed'),m.mission_code)
      from public.mission_definitions m left join public.resident_mission_progress p
        on p.mission_code=m.mission_code and p.mission_version=m.mission_version and p.recipient_user_id=auth.uid()
      where m.status='active' and 'resident'=any(m.applicable_contexts)),'[]'::jsonb),
    'recentXp',coalesce((select jsonb_agg(x.row_data order by x.created_at desc) from
      (select e.created_at,jsonb_build_object('id',e.id,'reasonCode',e.reason_code,'reason',rul.description,
        'amount',e.amount,'state',e.entry_state,'sourceType',e.source_entity_type,'sourceId',e.source_entity_id,
        'ruleVersion',e.rule_version,'createdAt',e.created_at,'verifiedAt',e.verified_at,'metadata',e.metadata) row_data
       from public.xp_entries e join public.xp_rule_versions rul on rul.reason_code=e.reason_code and rul.rule_version=e.rule_version
       where e.recipient_user_id=auth.uid() order by e.created_at desc limit 20) x),'[]'::jsonb),
    'achievements',coalesce((select jsonb_agg(jsonb_build_object('code',a.achievement_code,'version',a.achievement_version,
      'title',d.title,'description',d.description,'awardedAt',a.awarded_at,'publicConsent',a.public_recognition_consent)
      order by a.awarded_at desc) from public.resident_achievements a join public.achievement_definitions d
      on d.achievement_code=a.achievement_code and d.achievement_version=a.achievement_version
      where a.recipient_user_id=auth.uid()),'[]'::jsonb),
    'learningRecommendations',coalesce((select jsonb_agg(q.data order by q.relevant desc,q.module_id) from
      (select m.module_id,m.module_version,
        exists(select 1 from unnest(m.applicable_material_categories) as cats(category) join public.material_discoveries md
          on md.recipient_user_id=auth.uid() and md.normalized_category=lower(cats.category)) relevant,
        jsonb_build_object('moduleId',m.module_id,'version',m.module_version,'title',m.title,
          'objective',m.learning_objective,'safetyClassification',m.safety_classification,
          'completionCriteria',m.completion_criteria,'completed',exists(select 1 from public.learning_completions lc
            where lc.recipient_user_id=auth.uid() and lc.module_id=m.module_id and lc.module_version=m.module_version)) data
       from public.learning_modules m where m.status='active' and 'resident'=any(m.applicable_contexts)) q),'[]'::jsonb),
    'championRecognition',exists(select 1 from public.watchtower_champion_recognitions w
      where w.recipient_user_id=auth.uid() and w.status='active'));
end $$;

alter table public.xp_rule_versions enable row level security;
alter table public.xp_level_thresholds enable row level security;
alter table public.learning_modules enable row level security;
alter table public.mission_definitions enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.xp_entries enable row level security;
alter table public.material_discoveries enable row level security;
alter table public.learning_completions enable row level security;
alter table public.resident_mission_progress enable row level security;
alter table public.resident_achievements enable row level security;
alter table public.watchtower_champion_recognitions enable row level security;

create policy xp_entries_owner_select on public.xp_entries for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));
create policy material_discoveries_owner_select on public.material_discoveries for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));
create policy learning_completions_owner_select on public.learning_completions for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));
create policy resident_mission_progress_owner_select on public.resident_mission_progress for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));
create policy resident_achievements_owner_select on public.resident_achievements for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));
create policy champion_recognitions_owner_select on public.watchtower_champion_recognitions for select to authenticated
using (coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)=false and recipient_user_id=(select auth.uid()));

revoke all on public.xp_rule_versions,public.xp_level_thresholds,public.learning_modules,public.mission_definitions,
  public.achievement_definitions,public.xp_entries,public.material_discoveries,public.learning_completions,
  public.resident_mission_progress,public.resident_achievements,public.watchtower_champion_recognitions
  from public,anon,authenticated;
grant select on public.xp_rule_versions,public.xp_level_thresholds,public.learning_modules,public.mission_definitions,
  public.achievement_definitions,public.xp_entries,public.material_discoveries,public.learning_completions,
  public.resident_mission_progress,public.resident_achievements,public.watchtower_champion_recognitions to authenticated;
grant select,insert,update,delete on public.xp_rule_versions,public.xp_level_thresholds,public.learning_modules,
  public.mission_definitions,public.achievement_definitions,public.xp_entries,public.material_discoveries,
  public.learning_completions,public.resident_mission_progress,public.resident_achievements,
  public.watchtower_champion_recognitions to service_role;

revoke all on function public.prevent_xp_entry_mutation(),
  public.gamification_award_xp_internal(uuid,uuid,text,text,text,text,uuid,text,uuid,text,jsonb),
  public.gamification_grant_achievement_internal(uuid,uuid,text,text,text),
  public.gamification_refresh_missions_internal(uuid,uuid),public.gamification_on_item_evidence_attached(),
  public.gamification_on_collection_staged(),public.gamification_on_pickup_completed(),
  public.resident_gamification_projection(),public.resident_complete_learning_module(text,integer,uuid),
  public.gamification_resolve_provisional(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.resident_gamification_projection(),public.resident_complete_learning_module(text,integer,uuid) to authenticated;
grant execute on function public.gamification_resolve_provisional(uuid,text,uuid,uuid) to service_role;

comment on function public.resident_gamification_projection() is
  'Safe Resident progression projection. XP is non-financial and levels grant no authority.';
