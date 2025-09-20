'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'faculty.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SEED_FILE = path.join(__dirname, 'seed.sql');

app.use(cors());
app.use(express.json());

// Initialize DB connection
const db = new sqlite3.Database(DB_FILE);

// Promisified helpers
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve(this); // this.lastID, this.changes
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

async function initDb() {
  // Apply schema from file (idempotent)
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf-8');
  await new Promise((resolve, reject) => db.exec(schemaSql, err => (err ? reject(err) : resolve())));

  // Seed if table is empty
  const countRow = await dbGet('SELECT COUNT(*) AS count FROM faculty');
  if (!countRow || countRow.count === 0) {
    if (fs.existsSync(SEED_FILE)) {
      const seedSql = fs.readFileSync(SEED_FILE, 'utf-8');
      await new Promise((resolve, reject) => db.exec(seedSql, err => (err ? reject(err) : resolve())));
      console.log('Seeded initial faculty names.');
    } else {
      // Fallback seed in code if seed.sql missing
      const names = [
        'Dr. John Smith',
        'Dr. Sarah Johnson',
        'Prof. Michael Brown',
        'Dr. Emily Davis',
        'Prof. Robert Wilson',
        'Dr. Priya Sharma',
        'Dr. David Rodriguez',
        'Dr. Ananya Patil',
        'Prof. Rajesh Kumar',
        'Dr. Meera Nair'
      ];
      for (const name of names) {
        await dbRun('INSERT INTO faculty (name) VALUES (?)', [name]);
      }
      console.log('Seeded initial faculty names (fallback).');
    }
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// List faculty names, optional search by ?q=substring
app.get('/api/faculty', async (req, res, next) => {
  try {
    const q = (req.query.q || req.query.search || '').toString().trim();
    if (q) {
      const rows = await dbAll(
        'SELECT id, name FROM faculty WHERE LOWER(name) LIKE LOWER(?) ORDER BY name ASC',
        [`%${q}%`]
      );
      return res.json(rows);
    }
    const rows = await dbAll('SELECT id, name FROM faculty ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get a single faculty by id
app.get('/api/faculty/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = await dbGet('SELECT id, name FROM faculty WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Create a new faculty name
app.post('/api/faculty', async (req, res, next) => {
  try {
    const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await dbRun('INSERT INTO faculty (name) VALUES (?)', [name]);
    const row = await dbGet('SELECT id, name FROM faculty WHERE id = ?', [result.lastID]);
    res.status(201).json(row);
  } catch (err) {
    if (err && err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Name already exists' });
    }
    next(err);
  }
});

// Delete a faculty by id (optional helper)
app.delete('/api/faculty/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await dbRun('DELETE FROM faculty WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Boot
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Faculty API server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
