begin;
select plan(44);

select has_table('public','xp_entries');
select has_table('public','xp_rule_versions');
select has_table('public','learning_modules');
select has_table('public','learning_completions');
select has_table('public','mission_definitions');
select has_table('public','resident_mission_progress');
select has_table('public','resident_achievements');
select has_table('public','material_discoveries');
select has_table('public','watchtower_champion_recognitions');
select has_trigger('public','xp_entries','xp_entries_append_only');
select function_privs_are('public','resident_gamification_projection',array[]::text[],'authenticated',array['EXECUTE']);
select function_privs_are('public','resident_complete_learning_module',array['text','integer','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','gamification_resolve_provisional',array['uuid','text','uuid','uuid'],'authenticated',array[]::text[]);
select function_privs_are('public','gamification_resolve_provisional',array['uuid','text','uuid','uuid'],'service_role',array['EXECUTE']);
select function_privs_are('public','gamification_award_xp_internal',array['uuid','uuid','text','text','text','text','uuid','text','uuid','text','jsonb'],'authenticated',array[]::text[]);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('91000000-0000-4000-8000-000000000001','authenticated','authenticated','phase5-one@example.test','',now(),'{}','{}',now(),now()),
 ('91000000-0000-4000-8000-000000000002','authenticated','authenticated','phase5-two@example.test','',now(),'{}','{}',now(),now());

insert into public.residents(id,name,email,wallet_id,user_id,account_status,wtwr_balance)
values
 ('92000000-0000-4000-8000-000000000001','Phase Five One','phase5-one@example.test','phase5-wallet-one','91000000-0000-4000-8000-000000000001','active',0),
 ('92000000-0000-4000-8000-000000000002','Phase Five Two','phase5-two@example.test','phase5-wallet-two','91000000-0000-4000-8000-000000000002','active',0);

insert into public.scan_collections(id,resident_id,resident_user_id)
values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001');

insert into public.scan_collection_items(id,collection_id,client_item_id,analysis_id,summary,normalized_materials,
 estimated_value_low,estimated_value_high,estimated_resident_dollars,estimated_wtwr,evidence_id,evidence_object_path)
values('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
 '95000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','Copper and aluminum',
 '["Copper","Aluminum"]',1,10,4,400,'97000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001/97000000-0000-4000-8000-000000000001.jpg');
update public.scan_collection_items set evidence_status='attached' where id='94000000-0000-4000-8000-000000000001';

select is((select count(*) from public.xp_entries where recipient_user_id='91000000-0000-4000-8000-000000000001'
  and reason_code='collection.first_created'),1::bigint,'first accepted item awards first durable Collection once');
select is((select count(*) from public.xp_entries where recipient_user_id='91000000-0000-4000-8000-000000000001'
  and reason_code='collection_item.first_accepted'),1::bigint,'first accepted item awards exactly once');
select is((select count(*) from public.material_discoveries where recipient_user_id='91000000-0000-4000-8000-000000000001'),2::bigint,'materials are discovered per normalized category');
select is((select count(*) from public.xp_entries where recipient_user_id='91000000-0000-4000-8000-000000000001'
  and reason_code='evidence.eligible_submitted' and entry_state='provisional'),1::bigint,'eligible evidence creates provisional XP only');

update public.scan_collection_items set evidence_status='attached' where id='94000000-0000-4000-8000-000000000001';
select is((select count(*) from public.xp_entries where recipient_user_id='91000000-0000-4000-8000-000000000001'),5::bigint,'retrying evidence attachment creates no XP duplicates');

insert into public.scan_collection_items(id,collection_id,client_item_id,analysis_id,summary,normalized_materials,
 estimated_value_low,estimated_value_high,estimated_resident_dollars,estimated_wtwr,evidence_id,evidence_object_path)
values('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001',
 '95000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000002','Copper and steel',
 '["Copper","Steel"]',1,10,4,400,'97000000-0000-4000-8000-000000000002',
 '91000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002/97000000-0000-4000-8000-000000000002.jpg');
update public.scan_collection_items set evidence_status='attached' where id='94000000-0000-4000-8000-000000000002';

select is((select count(*) from public.xp_entries where reason_code='collection_item.additional_unique'),1::bigint,'different eligible item awards independently');
select is((select count(*) from public.material_discoveries where recipient_user_id='91000000-0000-4000-8000-000000000001'),3::bigint,'duplicate category is not rediscovered');
select is((select count(*) from public.resident_mission_progress where mission_code='discover_three_materials' and status='completed'),1::bigint,'mission completes exactly once');
select is((select count(*) from public.resident_achievements where achievement_code='material_explorer'),1::bigint,'achievement is granted once');

update public.scan_collections set status='staged' where id='93000000-0000-4000-8000-000000000001';
update public.scan_collections set status='staged' where id='93000000-0000-4000-8000-000000000001';
select is((select count(*) from public.xp_entries where reason_code='collection.staged'),1::bigint,'staging awards exactly once and retry awards nothing');

select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select lives_ok($$select public.resident_complete_learning_module('safe_battery_handling',1,'98000000-0000-4000-8000-000000000001')$$,'learning completion succeeds');
select lives_ok($$select public.resident_complete_learning_module('safe_battery_handling',1,'98000000-0000-4000-8000-000000000001')$$,'learning retry is idempotent');
reset role;
select is((select count(*) from public.learning_completions where recipient_user_id='91000000-0000-4000-8000-000000000001'
 and module_id='safe_battery_handling' and module_version=1),1::bigint,'learning completion is versioned and unique');
select is((select count(*) from public.xp_entries where reason_code='learning.module_completed'),1::bigint,'learning completion awards once');

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"service_role"}',true);
set local role service_role;
select lives_ok(format('select public.gamification_resolve_provisional(%L,%L,%L,%L)',
  (select id from public.xp_entries where source_entity_id='94000000-0000-4000-8000-000000000001' and entry_state='provisional'),
  'verified','99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011'),'provisional XP verifies once');
select lives_ok(format('select public.gamification_resolve_provisional(%L,%L,%L,%L)',
  (select id from public.xp_entries where source_entity_id='94000000-0000-4000-8000-000000000001' and entry_state='provisional'),
  'verified','99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011'),'provisional verification retry returns original resolution');
select lives_ok(format('select public.gamification_resolve_provisional(%L,%L,%L,%L)',
  (select id from public.xp_entries where source_entity_id='94000000-0000-4000-8000-000000000002' and entry_state='provisional'),
  'rejected','99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000012'),'rejected provisional XP is compensated');
reset role;
select is((select count(*) from public.xp_entries where verified_from_entry_id is not null),1::bigint,'verified provisional creates one verified entry');
select is((select count(*) from public.xp_entries where entry_state='reversal'),2::bigint,'verification and rejection each create one compensating entry');
select is((select count(*) from public.xp_entries where verified_from_entry_id=(select id from public.xp_entries
  where source_entity_id='94000000-0000-4000-8000-000000000002' and entry_state='provisional')),0::bigint,'rejected provisional XP creates no verified award');

insert into public.xp_rule_versions(reason_code,rule_version,amount,default_state,description)
values('collection_item.additional_unique',2,21,'verified','Version-two test rule.');
do $$ begin
  perform public.gamification_award_xp_internal('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
    'resident','collection_item.additional_unique','collection_item','version-two-source',
    '91000000-0000-4000-8000-000000000001','test','99000000-0000-4000-8000-000000000099','verified','{}');
end $$;
select is((select amount from public.xp_entries where source_entity_id='94000000-0000-4000-8000-000000000002'
  and reason_code='collection_item.additional_unique'),20,'new rule versions do not rewrite historical awards');
select results_eq($$select rule_version,amount from public.xp_entries where source_entity_id='version-two-source'$$,
  $$values(2,21)$$,'new eligible events use the newest active rule version');

select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
select is((public.resident_gamification_projection()->>'verifiedXp')::integer,
  (select coalesce(sum(e.amount),0)::integer from public.xp_entries e where e.recipient_user_id='91000000-0000-4000-8000-000000000001'
    and (e.entry_state='verified' or (e.entry_state in ('reversal','expired') and exists(select 1 from public.xp_entries p where p.id=e.reversal_of_entry_id and p.entry_state='verified')))),
  'server XP total equals the verified ledger sum');
select is((public.resident_gamification_projection()->'level'->>'number')::integer,
  (select max(level) from public.xp_level_thresholds where threshold_version='resident_levels_v1'
    and verified_xp_required<=(public.resident_gamification_projection()->>'verifiedXp')::integer),
  'server level equals the configured verified-XP threshold');

select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select is((select count(*) from public.xp_entries),0::bigint,'cross-Resident XP reads are denied by RLS');
reset role;

select is((select wtwr_balance from public.residents where id='92000000-0000-4000-8000-000000000001'),0::numeric,'XP never changes Wallet or WTWR balance');
select throws_ok($$update public.xp_entries set amount=999 where recipient_user_id='91000000-0000-4000-8000-000000000001'$$,'55000','XP entries are append-only; use a compensating entry.','XP ledger rejects updates');
select isnt_empty($$select 1 from pg_description d join pg_class c on c.oid=d.objoid where c.relname='watchtower_champion_recognitions' and d.description like '%grants no ownership%'$$,'Champion contract explicitly grants no elevated authority');
select is_empty($$select 1 from information_schema.columns where table_schema='public' and table_name in
  ('xp_level_thresholds','watchtower_champion_recognitions') and column_name in ('role','role_id','capability','permission')$$,
  'levels and Champion recognition contain no role or authority grants');

select * from finish();
rollback;
