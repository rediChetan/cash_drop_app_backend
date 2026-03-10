import pool from '../config/database.js';
import { AdminSettings } from '../models/adminSettingsModel.js';
import { getPSTDate } from '../utils/dateUtils.js';
import { isAllowedCashDropDateWithSettings } from '../utils/dateUtils.js';

function parseSettings(raw) {
  return {
    cash_drop_date_range: raw.cash_drop_date_range || 'last_2_days',
    cash_drop_only_before_bank_drop: raw.cash_drop_only_before_bank_drop === 'true'
  };
}

/** Check if bank drop has been done for a given date. */
export async function isBankDropDoneForDate(dateStr) {
  const [rows] = await pool.execute(
    `SELECT 
       COUNT(*) AS total,
       SUM(CASE WHEN bank_dropped = 1 THEN 1 ELSE 0 END) AS dropped
     FROM cash_drops 
     WHERE date = ? AND status IN ('submitted', 'reconciled', 'bank_dropped') AND (ignored IS NULL OR ignored = 0)`,
    [dateStr]
  );
  const total = Number(rows[0]?.total ?? 0);
  const dropped = Number(rows[0]?.dropped ?? 0);
  return total > 0 && total === dropped;
}

/** Return whether the given date is allowed for cash drop (uses admin settings). */
export async function isDateAllowedForCashDrop(dateStr) {
  if (!dateStr) return false;
  const raw = await AdminSettings.getAll();
  const settings = parseSettings(raw);
  const today = getPSTDate();
  const isBankDropDone = await isBankDropDoneForDate(dateStr);
  return isAllowedCashDropDateWithSettings(
    dateStr,
    today,
    settings.cash_drop_date_range,
    settings.cash_drop_only_before_bank_drop,
    isBankDropDone
  );
}
