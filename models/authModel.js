import pool from '../config/database.js';

export const User = {
  findByEmail: async (email) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  },

  findById: async (id) => {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },

  create: async (email, name, isAdmin = false, totpSecret = null) => {
    const [result] = await pool.execute(
      `INSERT INTO users (email, name, is_admin, totp_secret)
       VALUES (?, ?, ?, ?)`,
      [email, name, isAdmin ? 1 : 0, totpSecret]
    );
    return User.findById(result.insertId);
  },

  updateTotpSecret: async (userId, totpSecret) => {
    await pool.execute('UPDATE users SET totp_secret = ? WHERE id = ?', [totpSecret, userId]);
  },

  findAll: async () => {
    const [rows] = await pool.execute('SELECT id, email, name, is_admin FROM users');
    return rows;
  },

  update: async (id, data) => {
    const fields = [];
    const values = [];
    
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.is_admin !== undefined) {
      fields.push('is_admin = ?');
      values.push(data.is_admin ? 1 : 0);
    }
    
    if (fields.length === 0) return null;
    
    values.push(id);
    await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    return User.findById(id);
  },

  delete: async (id) => {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    return result;
  },

  count: async () => {
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM users');
    return rows[0].count;
  }
};
