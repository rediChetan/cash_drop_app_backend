import pool from '../config/database.js';

export const AdminSettings = {
  get: async (key) => {
    const [rows] = await pool.execute(
      'SELECT setting_value FROM admin_settings WHERE setting_key = ?',
      [key]
    );
    return rows.length > 0 ? rows[0].setting_value : null;
  },

  set: async (key, value) => {
    await pool.execute(
      `INSERT INTO admin_settings (setting_key, setting_value) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, value, value]
    );
    return AdminSettings.get(key);
  },

  getAll: async () => {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM admin_settings');
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    return settings;
  },

  delete: async (key) => {
    await pool.execute('DELETE FROM admin_settings WHERE setting_key = ?', [key]);
  }
};
