import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolSpecifier = process.env.CODEX_ARTIFACT_TOOL_PATH
  ? pathToFileURL(process.env.CODEX_ARTIFACT_TOOL_PATH).href
  : "@oai/artifact-tool";
const { SpreadsheetFile, Workbook } = await import(artifactToolSpecifier);

const outputDir = path.resolve("outputs/01a021bc-2f57-7153-80cd-c9a5bfc81f09");
await fs.mkdir(outputDir, { recursive: true });

const commercialSource = "https://business.mcbia.org/list/category/builder-commercial-3127";
const builderSource = "https://business.mcbia.org/list/category/builder-residential-2949?o=alpha";
const hvacSource = "https://business.mcbia.org/list/QL/a-c-heating-contractor-26.htm";

const prospects = [
  ["A1", "McLauchlin & Company", "Commercial GC", "Healthcare and commercial packages; named business-development contact", "Ocala", "352-873-3900", "Sandy Smith", "info@mclauchlin.com", "Official contact", "https://mclauchlin.com/contact/"],
  ["A1", "Stentiford Construction Services", "Commercial GC", "Commercial project inquiry path and public general inbox", "Ocala", "352-266-8994", "Commercial projects team", "info@stentifordfl.com", "Official contact", "https://www.stentifordfl.com/contact-us/"],
  ["A1", "Drake Construction Services", "Commercial GC", "Active Central Florida GC with direct president contact", "Ocala", "352-867-8101", "Holland Drake", "holland@drakeconstructionservices.com", "MCBIA profile", "https://mcbia.org/business-directory-2/drake-construction-services-inc-2/"],
  ["A1", "CGB Construction Group", "Commercial GC", "Public commercial capability and direct GC email", "Ocala", "352-857-6369", "Chris Bennett", "chris@cgbconstruction.com", "Official website", "https://cgbconstruction.com/"],
  ["A1", "Keystone Construction & Development", "Commercial GC", "Local commercial builder with owner contact", "Ocala", "352-694-1249", "Scott Olschewske", "solschewske.keystone@live.com", "MCBIA profile", "https://mcbia.org/mcbia-directory/keystone-construction-development-inc-2/"],
  ["A2", "Cullison-Wright Construction", "Commercial GC", "Commercial and institutional work; documented Procore workflow", "Ocala", "352-629-9572", "Troy Thurston / general contact", "info@cullisonwright.com", "Official contact", "https://cullisonwright.com/contact-us/"],
  ["A2", "Obenour Development Services", "Commercial GC", "Local commercial builder and development services", "Ocala", "352-369-8677", "Mark Obenour", "recep@ods-llc.net", "MCBIA profile", "https://mcbia.org/business-directory-2/obenour-development-services-llc/"],
  ["B", "Roofing Pros USA", "Roofing contractor", "Roofing product-data and warranty package prospect", "Ocala", "352-581-7333", "Michael Machula / permitting", "permitting@roofingprosusa.com", "Official site + public contractor record", "https://roofingprosusa.com/contact-us/"],
  ["A2", "JASON BOUTWELL CONSTRUCTION", "Commercial GC", "Local commercial builder; reachable owner-sized team", "Ocala", "352-421-9614", "Jason Boutwell", "jason@jbcfl.com", "Official contact", "https://jbcfl.com/contact-us/"],
  ["A2", "FERRENTINO & SON CONSTRUCTION", "Commercial GC / Remodeler", "Commercial remodeling creates frequent product-data packages", "Ocala", "352-237-3368", "Cicc Ferrentino / estimating", "estimating@ferrentinoandson.com", "Official contact", "https://www.ferrentinoandson.com/contact"],
  ["A2", "Empire Construction", "Commercial GC", "Local commercial builder; short sales path", "Ocala", "352-598-7560", "", "", "MCBIA commercial directory", commercialSource],
  ["A2", "Fabian Construction", "Commercial GC", "Local commercial builder; founder-led pilot fit", "Ocala", "352-239-2389", "", "", "MCBIA commercial directory", commercialSource],
  ["A2", "TALLEN BUILDERS", "Commercial GC", "Commercial builder and construction manager", "Ocala", "352-629-0377", "", "", "MCBIA commercial directory", commercialSource],
  ["A2", "Steppen & Spaulding", "Commercial GC / Remodeler", "Commercial and remodeling package coordination", "Ocala", "352-622-6837", "", "", "MCBIA profile", "https://business.mcbia.org/list/member/steppen-spaulding-36200"],
  ["B", "Pat Myers Electric", "Electrical contractor", "Electrical product data and coordination packages", "Ocklawaha", "352-816-4221", "Sarah Myers", "", "MCBIA profile", "https://business.mcbia.org/list/member/pat-myers-electric-llc-49544"],
  ["B", "NADEAU-STOUT CUSTOM HOMES", "Builder", "Product-data review potential; confirm commercial package volume", "Ocala", "352-387-1597", "", "", "MCBIA commercial directory", commercialSource],
  ["B", "CURINGTON HOMES", "Builder", "Large home packages; validate whether preflight pain is acute", "Ocala", "352-732-7839", "", "", "MCBIA commercial directory", commercialSource],
  ["B", "A.L. Milton Construction", "Builder", "Local builder with plan/spec coordination", "Ocala", "352-368-7733", "", "", "MCBIA builder directory", builderSource],
  ["B", "Apex Construction of North Florida", "Builder", "Local builder; likely owner-led purchase decision", "Ocala", "352-209-9965", "", "", "MCBIA builder directory", builderSource],
  ["B", "Bailey Building & Construction", "Builder", "Local general builder with recurring material selections", "Ocala", "352-351-2314", "", "", "MCBIA builder directory", builderSource],
  ["B", "Center State Construction", "Builder", "Local construction firm; verify commercial submittal volume", "Ocala", "352-694-5022", "", "", "MCBIA builder directory", builderSource],
  ["B", "Central Florida Steel Buildings", "Steel building contractor", "Metal-building packages are specification-heavy", "Ocala", "352-547-8552", "", "", "MCBIA builder directory", builderSource],
  ["B", "Ferrer Construction / Alfer Associates", "Builder", "Local builder with likely subcontractor package traffic", "Ocala", "352-629-7505", "", "", "MCBIA builder directory", builderSource],
  ["A2", "Pond's Heating & Cooling", "HVAC contractor", "HVAC product data matches the working pilot example", "Ocala", "352-861-1897", "", "", "MCBIA HVAC directory", hvacSource],
  ["A2", "Sun Kool Air Conditioning", "HVAC contractor", "HVAC selection and certification packages", "Ocala", "352-622-1067", "", "", "MCBIA HVAC directory", hvacSource],
  ["A2", "Duncan's Air Conditioning & Heating", "HVAC contractor", "HVAC selections are a direct Morrow use case", "Ocala", "352-622-5629", "", "", "MCBIA HVAC directory", hvacSource],
  ["B", "Sunshine Air Conditioning", "HVAC contractor", "Central Florida HVAC package preflight prospect", "Belleview", "352-245-1139", "", "", "MCBIA HVAC directory", hvacSource],
  ["A2", "Vetcon HVAC & Plumbing Services", "MEP contractor", "Multi-trade equipment and certificate package potential", "Ocala", "352-820-5110", "", "", "MCBIA profile", "https://business.mcbia.org/list/member/vetcon-hvac-plumbing-services-inc-49677.htm"],
  ["B", "O'Cull Electric", "Electrical contractor", "Electrical product data and coordination packages", "Ocala", "352-812-2744", "", "", "MCBIA profile", "https://business.mcbia.org/list/member/o-cull-electric-llc-49517.htm"],
  ["B", "Chad's Water Works Plumbing", "Plumbing contractor", "Plumbing fixture/equipment package preflight prospect", "Ocala", "352-598-2557", "", "", "MCBIA profile", "https://business.mcbia.org/list/member/chad-s-water-works-plumbing-llc-48842"],
];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Launch Dashboard");
const pipeline = workbook.worksheets.add("Prospect Pipeline");
const experiment = workbook.worksheets.add("Sales Experiment");

const colors = {
  ink: "#06150F",
  panel: "#0D251C",
  green: "#31E89A",
  mint: "#B9F5D6",
  cream: "#F4F0E6",
  gold: "#FFC76A",
  red: "#FF7B7B",
  grid: "#B7C8BE",
  white: "#FFFFFF",
};

for (const sheet of [summary, pipeline, experiment]) {
  sheet.showGridLines = false;
}

summary.mergeCells("A1:H2");
summary.getRange("A1").values = [["MORROW · OCALA FOUNDING PILOT"]];
summary.getRange("A1:H2").format = { fill: colors.ink, font: { bold: true, color: colors.green, size: 20 }, verticalAlignment: "center" };
summary.mergeCells("A3:H3");
summary.getRange("A3").values = [["One paid package is the first proof. Track evidence, not optimism."]];
summary.getRange("A3:H3").format = { fill: colors.panel, font: { color: colors.mint, italic: true }, verticalAlignment: "center" };

summary.getRange("A5:B10").values = [
  ["KPI", "CURRENT"],
  ["Qualified prospects", ""],
  ["First-batch prospects", ""],
  ["Contacted", ""],
  ["Replies", ""],
  ["Paid pilot revenue", ""],
];
summary.getRange("B6").formulas = [["=COUNTA('Prospect Pipeline'!B2:B31)"]];
summary.getRange("B7").formulas = [["=COUNTIF('Prospect Pipeline'!A2:A31,\"A1\")"]];
summary.getRange("B8").formulas = [["=COUNTIF('Prospect Pipeline'!K2:K31,\"<>Not contacted\")"]];
summary.getRange("B9").formulas = [["=COUNTIF('Prospect Pipeline'!N2:N31,\"Yes\")"]];
summary.getRange("B10").formulas = [["=SUM('Prospect Pipeline'!Q2:Q31)"]];
summary.getRange("A5:B5").format = { fill: colors.green, font: { bold: true, color: colors.ink } };
summary.getRange("A6:A10").format = { fill: colors.cream, font: { bold: true, color: colors.ink } };
summary.getRange("B6:B10").format = { fill: colors.white, font: { bold: true, color: colors.ink, size: 14 }, borders: { preset: "all", style: "thin", color: colors.grid } };
summary.getRange("B10").format.numberFormat = "$#,##0";

summary.getRange("D5:H10").values = [
  ["VALIDATION GATE", "TARGET", "STATUS", "OWNER", "DECISION"],
  ["Public checkout", "Live HTTPS", "Blocked on credentials", "Founder", "Configure"],
  ["First outreach", "5 personalized", "Sent 2026-08-20", "Founder + Morrow", "Monitor"],
  ["Reply signal", "At least 1 of 5", "Not started", "Morrow", "Continue or rewrite"],
  ["Paid proof", "At least 1 at $49", "Not started", "Morrow", "Continue"],
  ["Pivot gate", "0 of 10 after 2 messages", "Not reached", "Founder", "Change wedge"],
];
summary.getRange("D5:H5").format = { fill: colors.green, font: { bold: true, color: colors.ink } };
summary.getRange("D6:H10").format = { fill: colors.cream, font: { color: colors.ink }, wrapText: true, borders: { preset: "all", style: "thin", color: colors.grid } };

summary.mergeCells("A12:H12");
summary.getRange("A12").values = [["RECOMMENDED FIRST BATCH"]];
summary.getRange("A12:H12").format = { fill: colors.panel, font: { bold: true, color: colors.green } };
summary.getRange("A13:H18").values = [
  ["ORDER", "COMPANY", "CONTACT", "CHANNEL", "WHY NOW", "OFFER", "NEXT STEP", "SOURCE"],
  [1, "McLauchlin & Company", "Sandy Smith / info@mclauchlin.com", "Personal email", "Commercial + healthcare review complexity", "$49 package", "Follow up 2026-08-25", "Official"],
  [2, "Stentiford Construction", "info@stentifordfl.com", "Personal email", "Explicit commercial-project inquiry", "$49 package", "Follow up 2026-08-25", "Official"],
  [3, "Drake Construction", "Holland Drake", "Personal email", "President contact; active Central Florida GC", "$49 package", "Follow up 2026-08-25", "MCBIA"],
  [4, "CGB Construction Group", "Chris Bennett", "Personal email", "Direct GC contact; commercial capability", "$49 package", "Follow up 2026-08-25", "Official"],
  [5, "Keystone Construction", "Scott Olschewske", "Personal email", "Owner contact and local association role", "$49 package", "Follow up 2026-08-25", "MCBIA"],
];
summary.getRange("A13:H13").format = { fill: colors.green, font: { bold: true, color: colors.ink } };
summary.getRange("A14:H18").format = { fill: colors.white, font: { color: colors.ink }, wrapText: true, borders: { preset: "all", style: "thin", color: colors.grid } };
summary.freezePanes.freezeRows(3);
summary.getRange("A1:H18").format.rowHeight = 22;
summary.getRange("A1:H18").format.autofitColumns();
summary.getRange("A:A").format.columnWidth = 22;
summary.getRange("B:B").format.columnWidth = 28;
summary.getRange("D:H").format.columnWidth = 20;

const headers = ["PRIORITY", "COMPANY", "SEGMENT", "WHY IT FITS", "CITY", "PHONE", "CONTACT", "EMAIL", "SOURCE", "SOURCE URL", "STATUS", "FIRST TOUCH", "NEXT FOLLOW-UP", "REPLIED?", "DEMO?", "PAID?", "REVENUE", "NOTES"];
pipeline.getRange("A1:R1").values = [headers];
const pipelineRows = prospects.map((p, index) => [
  ...p,
  index < 5 ? "Sent" : "Not contacted",
  index < 5 ? new Date("2026-08-20T12:00:00") : "",
  index < 5 ? new Date("2026-08-25T12:00:00") : "",
  "No", "No", "No", 0,
  index < 5 ? "Personalized founding-pilot email sent from Gmail." : "",
]);
pipeline.getRange(`A2:R${pipelineRows.length + 1}`).values = pipelineRows;
pipeline.getRange("A1:R1").format = { fill: colors.ink, font: { bold: true, color: colors.green }, wrapText: true };
pipeline.getRange(`A2:R${pipelineRows.length + 1}`).format = { fill: colors.white, font: { color: colors.ink }, wrapText: false, borders: { preset: "all", style: "thin", color: colors.grid } };
pipeline.getRange(`B2:D${pipelineRows.length + 1}`).format.wrapText = true;
pipeline.getRange(`G2:I${pipelineRows.length + 1}`).format.wrapText = true;
pipeline.getRange(`R2:R${pipelineRows.length + 1}`).format.wrapText = true;
pipeline.getRange(`Q2:Q${pipelineRows.length + 1}`).format.numberFormat = "$#,##0";
pipeline.getRange(`L2:M${pipelineRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
pipeline.getRange(`K2:K${pipelineRows.length + 1}`).dataValidation = { rule: { type: "list", values: ["Not contacted", "Sent", "Follow-up due", "Conversation", "Closed - no", "Won"] } };
for (const col of ["N", "O", "P"]) {
  pipeline.getRange(`${col}2:${col}${pipelineRows.length + 1}`).dataValidation = { rule: { type: "list", values: ["No", "Yes"] } };
}
pipeline.getRange(`A2:A${pipelineRows.length + 1}`).conditionalFormats.add("containsText", { text: "A1", format: { fill: colors.green, font: { bold: true, color: colors.ink } } });
pipeline.getRange(`K2:K${pipelineRows.length + 1}`).conditionalFormats.add("containsText", { text: "Won", format: { fill: colors.green, font: { bold: true, color: colors.ink } } });
pipeline.getRange(`M2:M${pipelineRows.length + 1}`).conditionalFormats.add("cellIs", { operator: "lessThan", formula: "=TODAY()", format: { fill: colors.gold, font: { bold: true, color: colors.ink } } });
pipeline.tables.add(`A1:R${pipelineRows.length + 1}`, true, "MorrowPilotPipeline");
pipeline.freezePanes.freezeRows(1);
pipeline.getRange(`A2:R${pipelineRows.length + 1}`).format.rowHeight = 46;
pipeline.getRange("A1:R1").format.rowHeight = 30;
const widths = { A: 10, B: 28, C: 21, D: 46, E: 12, F: 15, G: 21, H: 34, I: 20, J: 48, K: 18, L: 15, M: 17, N: 11, O: 10, P: 10, Q: 13, R: 34 };
for (const [col, width] of Object.entries(widths)) pipeline.getRange(`${col}:${col}`).format.columnWidth = width;

experiment.mergeCells("A1:F2");
experiment.getRange("A1").values = [["MORROW · FIRST REVENUE EXPERIMENT"]];
experiment.getRange("A1:F2").format = { fill: colors.ink, font: { bold: true, color: colors.green, size: 20 }, verticalAlignment: "center" };
experiment.getRange("A4:F9").values = [
  ["FIELD", "VALUE", "SUCCESS SIGNAL", "FAIL SIGNAL", "ACTION", "OWNER"],
  ["Buyer", "Ocala commercial GC, PM, or HVAC subcontractor", "Owns active submittal packages", "Residential-only / no spec packages", "Qualify before demo", "Founder"],
  ["Job to be done", "Catch missing evidence and product conflicts before formal review", "Mentions rejection, revision, or PM time", "Only wants document storage", "Show sample issue matrix", "Morrow"],
  ["Founding offer", "$49 for one specification + submittal package", "Pays or asks to run live package", "Likes demo but no active package", "Ask for next active package date", "Founder"],
  ["Continue gate", "At least 1 paid package or 2 strong demo requests in first 5", "Signal reached", "Signal not reached", "Run second five with revised message", "Morrow"],
  ["Pivot gate", "0 meaningful replies after 10 personalized contacts and 2 messages", "Not reached", "Reached", "Research RFI / closeout-document wedge", "Founder"],
];
experiment.getRange("A4:F4").format = { fill: colors.green, font: { bold: true, color: colors.ink } };
experiment.getRange("A5:F9").format = { fill: colors.cream, font: { color: colors.ink }, wrapText: true, borders: { preset: "all", style: "thin", color: colors.grid } };

experiment.mergeCells("A11:F11");
experiment.getRange("A11").values = [["PERSONALIZED EMAIL · VERSION A"]];
experiment.getRange("A11:F11").format = { fill: colors.panel, font: { bold: true, color: colors.green } };
experiment.mergeCells("A12:F12");
experiment.getRange("A12").values = [["Subject: Can Morrow catch one submittal rejection before it happens?"]];
experiment.mergeCells("A13:F18");
experiment.getRange("A13").values = [["Hi [First name],\n\nI built a narrow preflight for contractors: upload the governing specification and proposed submittal, and Morrow returns source-cited conflicts, missing documents, and a correction packet before formal review.\n\nThe working HVAC sample catches six issues, including capacity, efficiency, refrigerant, electrical limits, accessories, and a missing AHRI certificate. The complete synthetic packet is here:\nhttps://morrow-submittal-pilot.vercel.app/morrow-sample-correction-packet.pdf\n\nI’m opening five Ocala founding-pilot slots at $49 for one authorized package. Would you be willing to tell me whether this would save a PM or subcontractor a revision cycle?\n\nRyan Gerard\nOcala Asset Security / Watchtower"]];
experiment.getRange("A12:F18").format = { fill: colors.white, font: { color: colors.ink }, wrapText: true, borders: { preset: "outside", style: "thin", color: colors.grid }, verticalAlignment: "top" };

experiment.mergeCells("A20:F20");
experiment.getRange("A20").values = [["FOLLOW-UP · 3 BUSINESS DAYS"]];
experiment.getRange("A20:F20").format = { fill: colors.panel, font: { bold: true, color: colors.green } };
experiment.mergeCells("A21:F24");
experiment.getRange("A21").values = [["Hi [First name] - one quick follow-up. I’m not selling another project-management system. Morrow is a one-package preflight that produces a requirement matrix and contractor correction packet. Here is the complete synthetic packet: https://morrow-submittal-pilot.vercel.app/morrow-sample-correction-packet.pdf\n\nWould you test one authorized package for $49 if the format fits your workflow?\n\nRyan Gerard"]];
experiment.getRange("A21:F24").format = { fill: colors.white, font: { color: colors.ink }, wrapText: true, borders: { preset: "outside", style: "thin", color: colors.grid }, verticalAlignment: "top" };

experiment.mergeCells("A26:F26");
experiment.getRange("A26").values = [["CALL OPENER"]];
experiment.getRange("A26:F26").format = { fill: colors.panel, font: { bold: true, color: colors.green } };
experiment.mergeCells("A27:F29");
experiment.getRange("A27").values = [["I’m Gerard in Ocala. I built a one-package contractor preflight that compares the proposed submittal to the governing spec and returns the exact conflicts, missing certificates, and a correction packet. I’m validating whether it saves a revision cycle. Who on your team owns submittal review?"]];
experiment.getRange("A27:F29").format = { fill: colors.white, font: { color: colors.ink }, wrapText: true, borders: { preset: "outside", style: "thin", color: colors.grid }, verticalAlignment: "top" };
experiment.freezePanes.freezeRows(2);
experiment.getRange("A:F").format.columnWidth = 23;
experiment.getRange("A1:F29").format.rowHeight = 24;
experiment.getRange("A13:F18").format.rowHeight = 32;
experiment.getRange("A21:F24").format.rowHeight = 34;
experiment.getRange("A27:F29").format.rowHeight = 36;

const inspectSummary = await workbook.inspect({ kind: "workbook,sheet,table", maxChars: 5000, tableMaxRows: 4, tableMaxCols: 8, tableMaxCellChars: 80 });
console.log(inspectSummary.ndjson);
const formulaScan = await workbook.inspect({ kind: "formula", sheetId: "Launch Dashboard", range: "A1:H18", maxChars: 4000, options: { maxResults: 50 } });
console.log(formulaScan.ndjson);
const errorScan = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", maxChars: 4000, options: { useRegex: true, maxResults: 100 } });
console.log(errorScan.ndjson);

for (const sheetName of ["Launch Dashboard", "Prospect Pipeline", "Sales Experiment"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${sheetName.toLowerCase().replaceAll(" ", "-")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "morrow-ocala-pilot-pipeline.xlsx");
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, prospectCount: prospects.length }));
