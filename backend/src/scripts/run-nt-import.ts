import { main } from './import-national-trust.js';

main().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
