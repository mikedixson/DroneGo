#!/usr/bin/env tsx
import { main as importNT } from './src/scripts/import-national-trust.js';

console.log('========================================');
console.log('National Trust Import Wrapper');
console.log('========================================');
console.log(`import.meta.url in wrapper: ${import.meta.url}`);
console.log(`process.argv[1] in wrapper: ${process.argv[1]}`);
console.log('Calling main() from import-national-trust...\n');

importNT()
  .then(() => {
    console.log('\n✅ National Trust import completed successfully!');
    process.exit(0);
  })
  .catch((error: Error) => {
    console.error('\n❌ National Trust import failed:');
    console.error(error);
    process.exit(1);
  });
