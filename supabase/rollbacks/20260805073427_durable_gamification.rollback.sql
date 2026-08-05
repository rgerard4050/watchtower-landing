-- Rollback for 20260805073427_durable_gamification.sql.
-- This removes Phase 5 progression records and definitions only. It does not
-- alter Collections, Scans, Jobs, Wallets, WTWR credit, payouts, or roles.

drop trigger if exists gamification_pickup_completed on public.scans;
drop trigger if exists gamification_collection_staged on public.scan_collections;
drop trigger if exists gamification_item_evidence_attached on public.scan_collection_items;
drop trigger if exists xp_entries_append_only on public.xp_entries;

drop function if exists public.resident_complete_learning_module(text,integer,uuid);
drop function if exists public.resident_gamification_projection();
drop function if exists public.gamification_resolve_provisional(uuid,text,uuid,uuid);
drop function if exists public.gamification_on_pickup_completed();
drop function if exists public.gamification_on_collection_staged();
drop function if exists public.gamification_on_item_evidence_attached();
drop function if exists public.gamification_refresh_missions_internal(uuid,uuid);
drop function if exists public.gamification_grant_achievement_internal(uuid,uuid,text,text,text);
drop function if exists public.gamification_award_xp_internal(uuid,uuid,text,text,text,text,uuid,text,uuid,text,jsonb);
drop function if exists public.prevent_xp_entry_mutation();

drop table if exists public.watchtower_champion_recognitions;
drop table if exists public.resident_achievements;
drop table if exists public.resident_mission_progress;
drop table if exists public.learning_completions;
drop table if exists public.material_discoveries;
drop table if exists public.xp_entries;
drop table if exists public.achievement_definitions;
drop table if exists public.mission_definitions;
drop table if exists public.learning_modules;
drop table if exists public.xp_level_thresholds;
drop table if exists public.xp_rule_versions;
