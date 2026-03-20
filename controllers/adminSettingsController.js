import { AdminSettings } from '../models/adminSettingsModel.js';
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

/** GET /api/admin-settings/cash-drop-calendar?year=2025&month=2 - returns { dates: [{ date, canCashDrop, isCurrentDay }] } for that month (PST). */
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
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isCurrentDay = dateStr === today;
      const isBankDropDone = await isBankDropDoneForDate(dateStr);
      const canCashDrop = isAllowedCashDropDateWithSettings(
        dateStr,
        today,
        parsed.cash_drop_date_range,
        parsed.cash_drop_only_before_bank_drop,
        isBankDropDone
      );
      dates.push({ date: dateStr, canCashDrop, isCurrentDay });
    }
    res.json({ dates });
  } catch (error) {
    console.error('Cash drop calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
