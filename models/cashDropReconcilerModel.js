import pool from '../config/database.js';

export const CashDropReconciler = {
  create: async (data) => {
    const [result] = await pool.execute(`
      INSERT INTO cash_drop_reconcilers (
        user_id, drop_entry_id, workstation, shift_number, date
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      data.user_id,
      data.drop_entry_id,
      data.workstation,
      data.shift_number,
      data.date
    ]);
    
    return CashDropReconciler.findById(result.insertId);
  },

  findById: async (id) => {
    const [rows] = await pool.execute(`
      SELECT 
        cdr.*,
        u.name as user_name,
        cd.drop_amount as system_drop_amount,
        cd.ws_label_amount,
        cd.variance,
        cd.label_image
      FROM cash_drop_reconcilers cdr
      JOIN cash_drops cd ON cdr.drop_entry_id = cd.id
      JOIN users u ON cd.user_id = u.id
      WHERE cdr.id = ?
    `, [id]);
    
    const reconciler = rows[0];
    return reconciler ? {
      ...reconciler,
      is_reconciled: reconciler.is_reconciled === 1
    } : null;
  },

  findByDateRange: async (dateFrom, dateTo, userId = null, onlyReconciled = false) => {
    let query = `
      SELECT 
        cdr.*,
        cdr.drop_entry_id,
        u.name as user_name,
        cd.drop_amount as system_drop_amount,
        cd.ws_label_amount,
        cd.variance,
        cd.label_image,
        cd.bank_dropped,
        cd.hundreds, cd.fifties, cd.twenties, cd.tens, cd.fives, cd.twos, cd.ones,
        cd.half_dollars, cd.quarters, cd.dimes, cd.nickels, cd.pennies,
        COALESCE(cdr.admin_count_amount, cd.drop_amount) as reconciled_amount,
        COALESCE(cdr.reconcile_delta, 0) as reconcile_delta,
        cd.submitted_at
      FROM cash_drop_reconcilers cdr
      JOIN cash_drops cd ON cdr.drop_entry_id = cd.id
      JOIN users u ON cd.user_id = u.id
      WHERE cdr.date >= ? AND cdr.date <= ?
    `;
    
    const params = [dateFrom, dateTo];
    
    if (onlyReconciled) {
      query += ' AND cdr.is_reconciled = 1';
    }
    
    if (userId) {
      query += ' AND cdr.user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY cdr.date DESC';
    
    const [rows] = await pool.execute(query, params);
    
    return rows.map(r => ({
      ...r,
      is_reconciled: r.is_reconciled === 1,
      bank_dropped: r.bank_dropped === 1
    }));
  },

  update: async (id, data) => {
    const fields = [];
    const values = [];
    
    if (data.admin_count_amount !== undefined) {
      fields.push('admin_count_amount = ?');
      values.push(data.admin_count_amount);
    }
    if (data.is_reconciled !== undefined) {
      fields.push('is_reconciled = ?');
      values.push(data.is_reconciled ? 1 : 0);
    }
    if (data.reconcile_delta !== undefined) {
      fields.push('reconcile_delta = ?');
      values.push(data.reconcile_delta);
    }
    
    if (fields.length === 0) return null;
    
    values.push(id);
    await pool.execute(`UPDATE cash_drop_reconcilers SET ${fields.join(', ')} WHERE id = ?`, values);
    return CashDropReconciler.findById(id);
  }
};
