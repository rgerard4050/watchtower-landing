VERIFY BEFORE YOU REFERENCE — standing rule, applies to everything:

Never name a table, column, function, file, or route you have not confirmed exists. Look it up first. Reading is free and I would rather wait.

Before writing any SQL, list the tables and columns you are about to touch and confirm each one against the live schema. If something you expected is missing, stop and tell me — do not substitute a name that sounds right.

Before writing any code that calls a file or route, confirm that file exists in the repo.

If you cannot verify something, say "unverified" and stop. Do not fill the gap with a plausible guess. A wrong table name that looks correct costs me far more time than a question does.

When you print SQL for me to run, read it back line by line for syntax before you show it. You are not executing it, so nothing else will catch a typo.

## SQL — what you may run, what you must print

You may run additive SQL yourself, without asking:
- ADD COLUMN
- ADD CONSTRAINT
- CREATE INDEX
- CREATE POLICY
- CREATE FUNCTION or CREATE TRIGGER
- Any read-only query

Nothing above can lose data, so run it, then tell me plainly what changed and how to confirm it in the Supabase dashboard.

You must print, and wait for me, before any of these:
- DROP anything — table, column, policy, index, constraint, function
- DELETE or TRUNCATE
- ALTER on a column that already exists — type changes, renames, NOT NULL, defaults
- ALTER POLICY or any rewrite of an existing policy, because replacing a WITH CHECK silently discards whatever was there before
- Anything touching auth, roles, or grants
- Anything you are not certain about — if you're weighing whether it belongs on this list, it does

For those, print the statement as one copyable block, tell me in plain language what it will change and what it cannot be undone from, and wait.

Regardless of which side it falls on: before writing any SQL, confirm every table and column you reference actually exists. Read the schema first. Do not reference a name you have not verified.