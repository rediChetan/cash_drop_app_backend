import pool from '../config/database.js';

export const CashDrawer = {
  create: async (data) => {
    const [result] = await pool.execute(`
      INSERT INTO cash_drawers (
        user_id, workstation, shift_number, date, starting_cash,
        hundreds, fifties, twenties, tens, fives, twos, ones,
        half_dollars, quarters, dimes, nickels, pennies, total_cash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.user_id,
      data.workstation,
      data.shift_number,
      data.date,
      data.starting_cash,
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
      data.total_cash
    ]);
    
    return CashDrawer.findById(result.insertId);
  },

  findById: async (id) => {
    const [rows] = await pool.execute(`
      SELECT cd.*, u.name as user_name
      FROM cash_drawers cd
      JOIN users u ON cd.user_id = u.id
      WHERE cd.id = ?
    `, [id]);
    
    const drawer = rows[0];
    return drawer ? {
      ...drawer,
      is_admin: drawer.is_admin === 1
    } : null;
  },

  findByDateRange: async (dateFrom, dateTo, userId = null) => {
    let query = `
      SELECT cd.*, u.name as user_name
      FROM cash_drawers cd
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
    return rows;
  },

  update: async (id, data) => {
    const fields = [];
    const values = [];
    
    if (data.workstation !== undefined) {
      fields.push('workstation = ?');
      values.push(data.workstation);
    }
    if (data.shift_number !== undefined) {
      fields.push('shift_number = ?');
      values.push(data.shift_number);
    }
    if (data.date !== undefined) {
      fields.push('date = ?');
      values.push(data.date);
    }
    if (data.starting_cash !== undefined) {
      fields.push('starting_cash = ?');
      values.push(data.starting_cash);
    }
    if (data.total_cash !== undefined) {
      fields.push('total_cash = ?');
      values.push(data.total_cash);
    }
    
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 
                                'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies'];
    denominationFields.forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    });
    
    if (fields.length === 0) return null;
    
    values.push(id);
    await pool.execute(`UPDATE cash_drawers SET ${fields.join(', ')} WHERE id = ?`, values);
    return CashDrawer.findById(id);
  },

  delete: async (id) => {
    const [result] = await pool.execute(`DELETE FROM cash_drawers WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  }
};
