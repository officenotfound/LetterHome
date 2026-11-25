'use strict';
// Works out the admin reports on a separate thread, so a big calculation never holds up the website.
// It opens its own read-only connection; WAL mode lets it read while the site writes.
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const { build } = require('./reportsData');

const db = new DatabaseSync(workerData.dbPath, { readOnly: true });
db.exec('PRAGMA busy_timeout = 5000');
const getSetting = (key, fallback = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
};

parentPort.on('message', ({ id, query, queue, today, now }) => {
  try { parentPort.postMessage({ id, data: build({ db, getSetting, queue, today: () => today }, query, now) }); }
  catch (e) { parentPort.postMessage({ id, error: e.message }); }
});
