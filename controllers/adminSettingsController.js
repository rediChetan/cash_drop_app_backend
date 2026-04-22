import { AdminSettings } from '../models/adminSettingsModel.js';
import pool from '../config/database.js';
import { getPSTDate } from '../utils/dateUtils.js';
import { isAllowedCashDropDateWithSettings } from '../utils/dateUtils.js';
import { isBankDropDoneForDate } from '../services/cashDropDateService.js';

const parseSettings = (raw) => {
  const imgReq = raw.cash_drop_receipt_image_required;
  const cash_drop_receipt_image_required =
    String(imgReq ?? 'false').toLowerCase() === 'true' ||
    imgReq === '1' ||
    imgReq === 1;
  return {
    shifts: raw.shifts ? JSON.parse(raw.shifts) : [],
    workstations: raw.workstations ? JSON.parse(raw.workstations) : [],
    starting_amount: raw.starting_amount ? parseFloat(raw.starting_amount) : 200.00,
    max_cash_drops_per_day: raw.max_cash_drops_per_day ? parseInt(raw.max_cash_drops_per_day) : 10,
    cash_drop_date_range: raw.cash_drop_date_range || 'last_2_days',
    cash_drop_receipt_image_required,
    // Always true: customers cannot add cash drops for days where bank drop is already done
    cash_drop_only_before_bank_drop: true
  };
};

export const getAdminSettings = async (req, res) => {
  try {
    const settings = await AdminSettings.getAll();
    res.json(parseSettings(settings));
  } catch (error) {
    console.error('Get admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminSettings = async (req, res) => {
  try {
    const { shifts, workstations, starting_amount, max_cash_drops_per_day, cash_drop_date_range, cash_drop_receipt_image_required } = req.body;

    if (shifts) {
      await AdminSettings.set('shifts', JSON.stringify(shifts));
    }
    if (workstations) {
      await AdminSettings.set('workstations', JSON.stringify(workstations));
    }
    if (starting_amount !== undefined) {
      await AdminSettings.set('starting_amount', starting_amount.toString());
    }
    if (max_cash_drops_per_day !== undefined) {
      await AdminSettings.set('max_cash_drops_per_day', max_cash_drops_per_day.toString());
    }
    if (cash_drop_date_range !== undefined) {
      await AdminSettings.set('cash_drop_date_range', cash_drop_date_range === 'all_previous' ? 'all_previous' : 'last_2_days');
    }
    if (cash_drop_receipt_image_required !== undefined) {
      const required =
        cash_drop_receipt_image_required === true ||
        cash_drop_receipt_image_required === 'true' ||
        cash_drop_receipt_image_required === 1 ||
        cash_drop_receipt_image_required === '1';
      await AdminSettings.set('cash_drop_receipt_image_required', required ? 'true' : 'false');
    }

    const updatedSettings = await AdminSettings.getAll();
    res.json(parseSettings(updatedSettings));
  } catch (error) {
    console.error('Update admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** GET .../cash-drop-calendar — { dates: [{ date, canCashDrop, atMaxCashDrops, needsBankDropCountConfirm, ... }] } (PST). */
export const getCashDropCalendar = async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Valid year and month query params required' });
    }
    const settings = await AdminSettings.getAll();
    const parsed = parseSettings(settings);
    const today = getPSTDate();
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const maxPerDay = Math.max(1, parseInt(String(parsed.max_cash_drops_per_day ?? 10), 10) || 10);

    /** mysql2 may coerce DATE_FORMAT to Date — build YMD in SQL so `d` is a plain calendar string. */
    const rowDateToYmd = (v) => {
      if (v == null || v === '') return '';
      if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(v)) return v.toString('utf8').slice(0, 10);
      if (v instanceof Date) {
        const y = v.getUTCFullYear();
        const mo = String(v.getUTCMonth() + 1).padStart(2, '0');
        const day = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
      }
      const s = String(v);
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : s.slice(0, 10);
    };

    // Per day: total submitted drops + how many are already bank-dropped (same GROUP BY for ONLY_FULL_GROUP_BY)
    const [countRows] = await pool.execute(
      `SELECT DATE_FORMAT(cd.date, '%Y-%m-%d') AS d,
        COUNT(*) AS cnt,
        SUM(CASE WHEN (cd.bank_dropped = 1 OR cd.status = 'bank_dropped') THEN 1 ELSE 0 END) AS bank_cnt
       FROM cash_drops cd
       WHERE cd.date >= ? AND cd.date <= ?
         AND (cd.ignored IS NULL OR cd.ignored = 0)
         AND cd.status NOT IN ('drafted', 'ignored')
       GROUP BY DATE_FORMAT(cd.date, '%Y-%m-%d')`,
      [monthStart, monthEnd]
    );
    const dropStatsByDate = new Map(
      (countRows || []).map((row) => [
        rowDateToYmd(row.d),
        {
          cnt: Number(row.cnt) || 0,
          bankCnt: Number(row.bank_cnt) || 0,
        },
      ])
    );

    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isCurrentDay = dateStr === today;
      const stats = dropStatsByDate.get(dateStr) ?? { cnt: 0, bankCnt: 0 };
      const countTowardLimit = stats.cnt;
      const bankDroppedCount = stats.bankCnt;
      const atMaxCashDrops = countTowardLimit >= maxPerDay;
      const isBankDropDoneActual = await isBankDropDoneForDate(dateStr);
      /**
       * Orange / confirm: at least one drop is bank-dropped this day, and you are still under the daily max
       * (includes: all bank-dropped but fewer than max drops, OR mix of bank-dropped + submitted/reconciled).
       */
      const needsBankDropCountConfirm =
        bankDroppedCount >= 1 && countTowardLimit < maxPerDay;
      const effectiveBankDoneForPolicy =
        isBankDropDoneActual && !needsBankDropCountConfirm;
      const canCashDrop = isAllowedCashDropDateWithSettings(
        dateStr,
        today,
        parsed.cash_drop_date_range,
        parsed.cash_drop_only_before_bank_drop,
        effectiveBankDoneForPolicy
      );
      dates.push({
        date: dateStr,
        canCashDrop,
        isCurrentDay,
        atMaxCashDrops,
        dropCountTowardLimit: countTowardLimit,
        bankDroppedCount,
        maxCashDropsPerDay: maxPerDay,
        needsBankDropCountConfirm,
      });
    }
    res.json({ dates, maxCashDropsPerDay: maxPerDay });
  } catch (error) {
    console.error('Cash drop calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
