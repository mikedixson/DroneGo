#!/usr/bin/env node
import { main as importNT } from './src/scripts/import-national-trust.js';
import { main as importHE } from './src/scripts/import-historic-england.js';

console.log('==========================================');
console.log('Starting Full Data Import');
console.log('==========================================\n');

async function runImports() {
  try {
    console.log('[1/2] Importing National Trust properties...');
    console.log('Expected: ~1,692 properties (Always Open + Limited Access)\n');
    await importNT();
    
    console.log('\n[2/2] Importing Historic England heritage sites...');
    console.log('Expected: Multiple categories of protected sites\n');
    await importHE();
    
    console.log('\n==========================================');
    console.log('All imports completed successfully!');
    console.log('==========================================');
    process.exit(0);
  } catch (error) {
    console.error('\n==========================================');
    console.error('Import failed:', error);
    console.error('==========================================');
    process.exit(1);
  }
}

runImports();
