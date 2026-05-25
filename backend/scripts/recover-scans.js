require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { initDb, recoverOrphanedRunningScans, dbAll } = require('../dist/services/db.service');

initDb()
  .then(() => recoverOrphanedRunningScans())
  .then(async (n) => {
    const rows = await dbAll('SELECT id, status, pages_count FROM scans ORDER BY id DESC LIMIT 5');
    console.log('Recovered running scans:', n);
    console.log('Recent scans:', rows);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
