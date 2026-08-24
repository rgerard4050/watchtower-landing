import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runMorrowPreflight } = require('../server/morrow-preflight');

const root = new URL('../../../', import.meta.url);
const [specification, submittal] = await Promise.all([
  fs.readFile(new URL('output/pdf/sample-01-project-specification.pdf', root)),
  fs.readFile(new URL('output/pdf/sample-02-contractor-submittal.pdf', root)),
]);

const result = await runMorrowPreflight({
  project: 'Pine Street Community Center',
  trade: 'HVAC equipment',
  files: [
    { role: 'specification', name: 'sample-01-project-specification.pdf', buffer: specification },
    { role: 'submittal', name: 'sample-02-contractor-submittal.pdf', buffer: submittal },
  ],
}, { gateway: true });

console.log(JSON.stringify({
  model: result.model,
  decision: result.report.decision,
  requirements: result.report.requirements.length,
  risks: result.report.risks.length,
  missing_documents: result.report.missing_documents.length,
  usage: result.usage,
  request_scoped_files: result.temporaryFilesDeleted,
}, null, 2));
