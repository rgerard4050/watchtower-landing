# First Partner Workflow

How to bring on and run a business supply partner using what exists today. Written for one person with a phone, a laptop, and `operator-scanner.html` — nothing here requires new software.

## Before pickup

Capture, by phone/email/in person, before scheduling anything:
- Business name
- Contact name and phone/email
- Material type(s) they generate (e.g. dead units, parts, e-waste)
- Rough estimated volume
- How often it accumulates (pickup frequency)

Log this as a `businesses` row (`is_supplier = true`) with a matching `business_touches` entry (`channel`, `outcome`, `notes`, `next_touch_at`) — this is the CRM record that replaces a spreadsheet. Do not promise a price, a fixed schedule, or a resale value at this stage. The offer is: free removal + a documented record of what was taken.

## During pickup

Use `operator-scanner.html` exactly as built — no different workflow:
- Capture: point-and-shoot each item/load.
- Intake: AI grade → operator review/correction → ACCEPT GRADE.
- Weight: entered as always.
- Condition: use the NOTES field for anything the AI didn't capture (visible damage, missing parts, etc.).
- **Select the business partner** in the new "BUSINESS PARTNER (OPTIONAL)" field on the decision panel before accepting — this is what links the intake to the relationship. Leaving it on "WALK-IN / RESIDENT" is correct for anyone who isn't a known partner; nothing else about the flow changes.

Every photo, weight, AI grade, and operator correction is already captured automatically — there is nothing extra to remember here beyond picking the business from the dropdown.

## After pickup

Generate, from what's already recorded:
- **Recovery summary** — query `business_recovery_report` for the partner (material count, total weight, estimated recovered value, material categories, by month). No new report-building software needed; this is a live database view.
- **Material record** — the underlying `intakes` rows for that business, each with its own `WT-INT-######`, photo, AI provenance, and operator-confirmed grade — the itemized backup behind the summary.
- **Partner history** — the `business_touches` log for that business, showing every call/visit and outcome, so the relationship's history is never lost between people or forgotten between visits.

Send the partner the recovery summary (a text message or printed sheet is enough at this stage) as proof of what was documented. This deliverable — not a cash payment — is the actual first product: verified, photographed, weighed proof of responsible material removal. The paid Verification Plan conversation happens after a partner has seen this once, not before.
