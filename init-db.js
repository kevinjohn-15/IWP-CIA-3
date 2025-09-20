'use strict';

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'faculty.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SEED_FILE = path.join(__dirname, 'seed.sql');

const db = new sqlite3.Database(DB_FILE);

const execAsync = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => err ? reject(err) : resolve()));
const getAsync = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));

(async () => {
  try {
    if (!fs.existsSync(SCHEMA_FILE)) throw new Error(`Missing schema file: ${SCHEMA_FILE}`);
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
    await execAsync(schemaSql);
    console.log('Applied schema to', DB_FILE);

    const countRow = await getAsync('SELECT COUNT(*) AS count FROM faculty');
    if (!countRow || countRow.count === 0) {
      if (fs.existsSync(SEED_FILE)) {
        const seedSql = fs.readFileSync(SEED_FILE, 'utf-8');
        await execAsync(seedSql);
        console.log('Seeded initial data from seed.sql');
      } else {
        console.log('seed.sql not found; skipping seeding');
      }
    } else {
      console.log('Faculty table already has data; skipping seeding');
    }
  } catch (err) {
    console.error('DB init failed:', err);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
