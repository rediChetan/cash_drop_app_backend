import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MySQL connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cash_drop_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Initialize database tables
const initDatabase = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password VARCHAR(255),
        is_admin TINYINT(1) DEFAULT 0,
        totp_secret VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cash Drawer table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cash_drawers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        workstation VARCHAR(255) NOT NULL,
        shift_number VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        starting_cash DECIMAL(10, 2) NOT NULL,
        hundreds INT DEFAULT 0,
        fifties INT DEFAULT 0,
        twenties INT DEFAULT 0,
        tens INT DEFAULT 0,
        fives INT DEFAULT 0,
        twos INT DEFAULT 0,
        ones INT DEFAULT 0,
        half_dollars INT DEFAULT 0,
        quarters INT DEFAULT 0,
        dimes INT DEFAULT 0,
        nickels INT DEFAULT 0,
        pennies INT DEFAULT 0,
        total_cash DECIMAL(10, 2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_drawer (workstation, shift_number, date)
      )
    `);

    // Cash Drop table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cash_drops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        drawer_entry_id INT,
        workstation VARCHAR(255) NOT NULL,
        shift_number VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        drop_amount DECIMAL(10, 2) NOT NULL,
        hundreds INT DEFAULT 0,
        fifties INT DEFAULT 0,
        twenties INT DEFAULT 0,
        tens INT DEFAULT 0,
        fives INT DEFAULT 0,
        twos INT DEFAULT 0,
        ones INT DEFAULT 0,
        half_dollars INT DEFAULT 0,
        quarters INT DEFAULT 0,
        dimes INT DEFAULT 0,
        nickels INT DEFAULT 0,
        pennies INT DEFAULT 0,
        ws_label_amount DECIMAL(10, 2) DEFAULT 0,
        variance DECIMAL(10, 2) DEFAULT 0,
        label_image VARCHAR(500),
        bank_dropped TINYINT(1) DEFAULT 0,
        notes TEXT,
        submitted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (drawer_entry_id) REFERENCES cash_drawers(id) ON DELETE CASCADE,
        UNIQUE KEY unique_drop (workstation, shift_number, date)
      )
    `);
    
    // Add notes and submitted_at columns if they don't exist
    try {
      const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'cash_drops' 
        AND COLUMN_NAME IN ('notes', 'submitted_at')
      `, [dbConfig.database]);
      
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      
      if (!existingColumns.includes('notes')) {
        await connection.query(`ALTER TABLE cash_drops ADD COLUMN notes TEXT`);
      }
      if (!existingColumns.includes('submitted_at')) {
        await connection.query(`ALTER TABLE cash_drops ADD COLUMN submitted_at DATETIME`);
      }
    } catch (e) {
      // Ignore errors
    }
    
    // Add bank_dropped column if it doesn't exist (for existing databases)
    try {
      const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'cash_drops' 
        AND COLUMN_NAME = 'bank_dropped'
      `, [dbConfig.database]);
      
      if (columns.length === 0) {
        await connection.query(`
          ALTER TABLE cash_drops ADD COLUMN bank_dropped TINYINT(1) DEFAULT 0
        `);
      }
    } catch (e) {
      // Ignore errors
    }

    // Cash Drop Reconciler table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cash_drop_reconcilers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        drop_entry_id INT UNIQUE NOT NULL,
        workstation VARCHAR(255) NOT NULL,
        shift_number VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        admin_count_amount DECIMAL(10, 2) DEFAULT 0.00,
        is_reconciled TINYINT(1) DEFAULT 0,
        reconcile_delta DECIMAL(10, 2) DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (drop_entry_id) REFERENCES cash_drops(id) ON DELETE CASCADE
      )
    `);
    
    // Add reconcile_delta column if it doesn't exist
    try {
      const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'cash_drop_reconcilers' 
        AND COLUMN_NAME = 'reconcile_delta'
      `, [dbConfig.database]);
      
      if (columns.length === 0) {
        await connection.query(`ALTER TABLE cash_drop_reconcilers ADD COLUMN reconcile_delta DECIMAL(10, 2) DEFAULT 0.00`);
      }
    } catch (e) {
      // Ignore errors
    }

    // Create media directory if it doesn't exist
    const mediaDir = path.join(__dirname, '..', 'media', 'cash_drop_labels');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Initialize database on startup
initDatabase().catch((error) => {
  console.error('Database initialization error:', error);
  console.error('Please ensure MySQL is running and the database exists.');
  console.error('You can create the database with: CREATE DATABASE cash_drop_db;');
  // Don't exit - let the server start and show the error
});

// Export pool for use in models
export default pool;
