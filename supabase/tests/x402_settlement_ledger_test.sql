begin;

select plan(5);

select has_table('public', 'x402_events', 'x402_events exists');
select col_is_pk('public', 'x402_events', 'id', 'id is the primary key');
select policies_are('public', 'x402_events', array[]::text[], 'no client RLS policies exist');
select table_privs_are(
  'public',
  'x402_events',
  'anon',
  array[]::text[],
  'anon has no settlement-ledger privileges'
);
select table_privs_are(
  'public',
  'x402_events',
  'authenticated',
  array[]::text[],
  'authenticated has no settlement-ledger privileges'
);

select * from finish();
rollback;
