import pool from '../config/database.js';
import { AdminSettings } from '../models/adminSettingsModel.js';
import { getPSTDate } from '../utils/dateUtils.js';
import { isAllowedCashDropDateWithSettings } from '../utils/dateUtils.js';

function parseSettings(raw) {
  const imgReq = raw.cash_drop_receipt_image_required;
  const imageRequired =
    String(imgReq ?? 'false').toLowerCase() === 'true' ||
    imgReq === '1' ||
    imgReq === 1;
  return {
    cash_drop_date_range: raw.cash_drop_date_range || 'last_2_days',
    // Always true: no cash drops for days where bank drop is done
    cash_drop_only_before_bank_drop: true,
    cash_drop_receipt_image_required: imageRequired
  };
}

/** Whether admins require a receipt image on cash drop submit (stored in admin_settings). */
export async function isCashDropReceiptImageRequired() {
  const raw = await AdminSettings.getAll();
  return parseSettings(raw).cash_drop_receipt_image_required;
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

/**
 * Same per-day counts as cash-drop calendar (submitted/reconciled/bank_dropped; excludes drafted/ignored).
 * Used to verify `accept_bank_drop_mismatch` only when the day is in the orange "under max with bank activity" state.
 */
async function getCashDropDayCountsForPolicy(dateStr) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS cnt,
       SUM(CASE WHEN (cd.bank_dropped = 1 OR cd.status = 'bank_dropped') THEN 1 ELSE 0 END) AS bank_cnt
     FROM cash_drops cd
     WHERE cd.date = ?
       AND (cd.ignored IS NULL OR cd.ignored = 0)
       AND cd.status NOT IN ('drafted', 'ignored')`,
    [dateStr]
  );
  const row = rows?.[0] || {};
  return {
    cnt: Number(row.cnt) || 0,
    bankCnt: Number(row.bank_cnt) || 0
  };
}

/**
 * When the calendar shows needsBankDropCountConfirm (orange), policy uses effective "bank done" = false.
 * This path is only valid if server-side stats match that scenario; callers must still send user acknowledgement.
 */
export async function isDateAllowedWhenBankDropMismatchAcknowledged(dateStr) {
  if (!dateStr) return false;
  const raw = await AdminSettings.getAll();
  const settings = parseSettings(raw);
  const maxPerDay = Math.max(1, parseInt(String(raw.max_cash_drops_per_day ?? 10), 10) || 10);
  const { cnt, bankCnt } = await getCashDropDayCountsForPolicy(dateStr);
  const needsBankDropCountConfirm = bankCnt >= 1 && cnt < maxPerDay;
  if (!needsBankDropCountConfirm) return false;
  const today = getPSTDate();
  return isAllowedCashDropDateWithSettings(
    dateStr,
    today,
    settings.cash_drop_date_range,
    settings.cash_drop_only_before_bank_drop,
    false
  );
}

/** Submitted cash drops: optional mismatch acknowledgement (must match calendar orange rules on the server). */
export async function isDateAllowedForSubmittedCashDrop(dateStr, acceptBankDropMismatch) {
  if (!dateStr) return false;
  if (acceptBankDropMismatch) {
    const ok = await isDateAllowedWhenBankDropMismatchAcknowledged(dateStr);
    if (ok) return true;
  }
  return isDateAllowedForCashDrop(dateStr);
}
