#!/usr/bin/env node
/**
 * Quick database check: connection, database name, required columns, and row counts.
 * Run from backend folder: node scripts/check-db.js
 *
 * Use this to verify:
 * 1. The app connects to the same DB you seeded (database name below).
 * 2. cash_drops / cash_drawers have rows (if you seeded, counts should be > 0).
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'dskreddy98',
  database: process.env.DB_NAME || 'cash_drop_db',
};

async function check() {
  console.log('Config database name (from .env or default):', dbConfig.database);
  console.log('Host:', dbConfig.host);
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig);
    await conn.ping();
    console.log('Connection: OK');

    const [dbRow] = await conn.query('SELECT DATABASE() AS db');
    const actualDb = dbRow[0]?.db;
    console.log('Connected to database:', actualDb || '(none)');
    if (actualDb && actualDb !== dbConfig.database) {
      console.warn('Warn: DATABASE() differs from config. Ensure seed ran in this DB.');
    }

    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cash_drops' AND COLUMN_NAME = 'bank_drop_batch_number'`,
      [dbConfig.database]
    );
    if (cols.length > 0) {
      console.log('Column cash_drops.bank_drop_batch_number: OK');
    } else {
      console.log('Column cash_drops.bank_drop_batch_number: MISSING (run the server once to apply migrations)');
    }

    const [drawerCount] = await conn.query('SELECT COUNT(*) AS n FROM cash_drawers');
    const [dropCount] = await conn.query('SELECT COUNT(*) AS n FROM cash_drops');
    const [userCount] = await conn.query('SELECT COUNT(*) AS n FROM users');
    console.log('Row counts: cash_drawers =', drawerCount[0].n, ', cash_drops =', dropCount[0].n, ', users =', userCount[0].n);

    const [sampleDates] = await conn.query(
      'SELECT date, COUNT(*) AS cnt FROM cash_drops GROUP BY date ORDER BY date DESC LIMIT 5'
    );
    if (sampleDates.length > 0) {
      console.log('Latest cash_drops by date (sample):');
      sampleDates.forEach((r) => console.log('  ', r.date, '->', r.cnt, 'rows'));
    }
  } catch (err) {
    console.error('Database check failed:', err.message);
    console.error('Ensure MySQL is running and .env has correct DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.');
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
  console.log('Done.');
}
check();
