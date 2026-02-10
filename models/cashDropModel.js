import pool from '../config/database.js';
import { getPSTDateTime } from '../utils/dateUtils.js';

export const CashDrop = {
  create: async (data) => {
    const [result] = await pool.execute(`
      INSERT INTO cash_drops (
        user_id, drawer_entry_id, workstation, shift_number, date,
        drop_amount, hundreds, fifties, twenties, tens, fives, twos, ones,
        half_dollars, quarters, dimes, nickels, pennies,
        ws_label_amount, variance, label_image, notes, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.user_id,
      data.drawer_entry_id || null,
      data.workstation,
      data.shift_number,
      data.date,
      data.drop_amount,
      data.hundreds || 0,
      data.fifties || 0,
      data.twenties || 0,
      data.tens || 0,
      data.fives || 0,
      data.twos || 0,
      data.ones || 0,
      data.half_dollars || 0,
      data.quarters || 0,
      data.dimes || 0,
      data.nickels || 0,
      data.pennies || 0,
      data.ws_label_amount || 0,
      data.variance || 0,
      data.label_image || null,
      data.notes || null,
      data.status || 'submitted',
      data.status === 'drafted' ? null : (data.submitted_at || getPSTDateTime())
    ]);
    
    return CashDrop.findById(result.insertId);
  },

  findById: async (id) => {
    const [rows] = await pool.execute(`
      SELECT cd.*, u.name as user_name
      FROM cash_drops cd
      JOIN users u ON cd.user_id = u.id
      WHERE cd.id = ?
    `, [id]);
    
    if (rows[0]) {
      return {
        ...rows[0],
        ignored: rows[0].ignored === 1,
        bank_dropped: rows[0].bank_dropped === 1
      };
    }
    return null;
  },

  findByDateRange: async (dateFrom, dateTo, userId = null) => {
    let query = `
      SELECT cd.*, u.name as user_name, cd.submitted_at
      FROM cash_drops cd
      JOIN users u ON cd.user_id = u.id
      WHERE cd.date >= ? AND cd.date <= ?
    `;
    
    const params = [dateFrom, dateTo];
    
    if (userId) {
      query += ' AND cd.user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY cd.date DESC';
    
    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      ignored: row.ignored === 1,
      bank_dropped: row.bank_dropped === 1
    }));
  },

  update: async (id, data) => {
    const fields = [];
    const values = [];
    
    // Update denominations
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 
                                'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies'];
    
    denominationFields.forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    });
    
    // Update other fields
    if (data.drop_amount !== undefined) {
      fields.push('drop_amount = ?');
      values.push(data.drop_amount);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
      // If status is being set to submitted and submitted_at is null, set it
      if (data.status === 'submitted') {
        fields.push('submitted_at = COALESCE(submitted_at, ?)');
        values.push(getPSTDateTime());
      }
    }
    if (data.bank_dropped !== undefined) {
      fields.push('bank_dropped = ?');
      values.push(data.bank_dropped ? 1 : 0);
      // Update status to bank_dropped when bank_dropped is set to true
      if (data.bank_dropped) {
        fields.push('status = ?');
        values.push('bank_dropped');
      }
    }
    if (data.ignored !== undefined) {
      fields.push('ignored = ?');
      values.push(data.ignored ? 1 : 0);
      // Update status to ignored when ignored is set to true
      if (data.ignored) {
        fields.push('status = ?');
        values.push('ignored');
      }
    }
    if (data.ignore_reason !== undefined) {
      fields.push('ignore_reason = ?');
      values.push(data.ignore_reason);
    }
    
    if (fields.length === 0) return null;
    
    values.push(id);
    await pool.execute(`UPDATE cash_drops SET ${fields.join(', ')} WHERE id = ?`, values);
    return CashDrop.findById(id);
  },

  countByUserAndDate: async (userId, date) => {
    const [rows] = await pool.execute(`
      SELECT COUNT(*) as count 
      FROM cash_drops 
      WHERE user_id = ? AND date = ? AND ignored = 0
    `, [userId, date]);
    return rows[0].count;
  },

  delete: async (id) => {
    const [result] = await pool.execute(`DELETE FROM cash_drops WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  }
};
