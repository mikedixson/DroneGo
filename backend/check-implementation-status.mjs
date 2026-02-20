#!/usr/bin/env node
/**
 * Implementation Status Check
 * Compares tasks.md against actual codebase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expected files from tasks T010-T038
const expectedFiles = {
  // Tests (T010-T014) 
  'T010': 'tests/unit/services/geometry-validator.test.ts',
  'T011': 'tests/unit/services/boundary-simplifier.test.ts',
  'T012': 'tests/unit/repositories/property-restrictions-repository.test.ts',
  'T013': 'tests/integration/heritage-import.integ.test.ts',
  'T014': 'frontend/tests/e2e/heritage-site-display.spec.ts',
  
  // Models (T015-T017)
  'T015': 'src/models/PropertyRestriction.ts', // extend
  'T016': 'src/models/HeritageSiteImportError.ts',
  'T017': 'src/models/DataSource.ts', // extend
  
  // Repositories (T018-T020)
  'T018': 'src/repositories/property-restrictions-repository.ts',
  'T019': 'src/repositories/import-errors-repository.ts',
  'T020': 'src/repositories/data-sources-repository.ts',
  
  // Services (T021-T022)
  'T021': 'src/services/geometry-validator.ts',
  'T022': 'src/services/boundary-simplifier.ts',
  
  // Import Scripts (T025-T027)
  'T025': 'src/scripts/import-national-trust.ts',
  'T026': 'src/scripts/import-historic-england.ts',
  'T027': 'src/scripts/test-import.ts',
  
  // API Layer (T029-T030)
  'T029': 'src/services/property-service.ts', // enhance
  'T030': 'src/api/routes/property-restrictions.ts',
};

console.log('='.repeat(70));
console.log('IMPLEMENTATION STATUS CHECK');
console.log('='.repeat(70));
console.log('');

const status = {
  exists: [],
  missing: [],
};

Object.entries(expectedFiles).forEach(([task, filePath]) => {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    status.exists.push({ task, file: filePath });
    console.log(`✓ ${task}: ${filePath}`);
  } else {
    status.missing.push({ task, file: filePath });
    console.log(`✗ ${task}: ${filePath} (MISSING)`);
  }
});

console.log('');
console.log('='.repeat(70));
console.log(`SUMMARY: ${status.exists.length}/${Object.keys(expectedFiles).length} files exist`);
console.log('='.repeat(70));

if (status.missing.length > 0) {
  console.log('');
  console.log('Missing files:');
  status.missing.forEach(({ task, file }) => {
    console.log(`  - ${task}: ${file}`);
  });
}

console.log('');
console.log('Next steps:');
if (status.exists.includes(e => e.task === 'T021')) {
  console.log('  - Services implemented, check if tests pass (T023-T024)');
}
if (status.exists.includes(e => e.task === 'T026')) {
  console.log('  - Import scripts exist, verify integration test (T028)');
}
if (status.missing.length > 0) {
  const firstMissing = status.missing[0];
  console.log(`  - Implement ${firstMissing.task}: ${firstMissing.file}`);
}
