console.log('Script starting...');

import('./src/scripts/import-national-trust.js')
  .then(module => {
    console.log('Module loaded, starting import...');
    return module.main();
  })
  .then(() => {
    console.log('Import completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
