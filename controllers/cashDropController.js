import { CashDrop } from '../models/cashDropModel.js';
import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';
import { CashDrawer } from '../models/cashDrawerModel.js';
import { User } from '../models/authModel.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getPSTDateTime, isStrictlyBeforePSTYesterday } from '../utils/dateUtils.js';
import { isDateAllowedForCashDrop, isCashDropReceiptImageRequired } from '../services/cashDropDateService.js';
import { uploadImageToDrive, isDriveEnabled, getDriveImageProxyUrl } from '../services/googleDriveService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single source of truth for drop amount from denomination counts (must match frontend denom config including twos/half_dollars)
const DENOMINATION_VALUES = { hundreds: 100, fifties: 50, twenties: 20, tens: 10, fives: 5, twos: 2, ones: 1, half_dollars: 0.5, quarters: 0.25, dimes: 0.1, nickels: 0.05, pennies: 0.01 };
const ROLL_VALUES = { quarter_rolls: 10, dime_rolls: 5, nickel_rolls: 2, penny_rolls: 0.5 };

function computeDropAmountFromDenominations(denom) {
  let sum = 0;
  Object.keys(DENOMINATION_VALUES).forEach(f => { sum += (parseFloat(denom[f]) || 0) * DENOMINATION_VALUES[f]; });
  Object.keys(ROLL_VALUES).forEach(f => { sum += (parseFloat(denom[f]) || 0) * ROLL_VALUES[f]; });
  return Math.round(sum * 100) / 100;
}

export const createCashDrop = async (req, res) => {
  try {
    let labelImagePath = null;
    const date = req.body.date;
    const workstation = req.body.workstation;
    const shift_number = req.body.shift_number;
    const status = req.body.status || 'submitted';

    if (date && isStrictlyBeforePSTYesterday(date) && !req.user?.is_admin) {
      return res.status(403).json({ error: 'Cash drop is not allowed for this date.' });
    }

    // Handle file upload if present (Google Drive year/month/day or local fallback)
    if (req.file) {
      if (isDriveEnabled() && date) {
        const driveUrl = await uploadImageToDrive(
          req.file.buffer,
          date,
          workstation,
          shift_number,
          req.file.originalname
        );
        if (driveUrl) {
          labelImagePath = driveUrl;
        } else {
          console.warn('Cash drop create: Google Drive upload failed or returned null; saving image locally. Check server logs for Drive errors.');
        }
      } else if (req.file && isDriveEnabled() && !date) {
        console.warn('Cash drop create: date missing in request body; cannot upload to Drive (need YYYY-MM-DD). Saving image locally.');
      }
      if (!labelImagePath) {
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `cash_drop_${Date.now()}${fileExtension}`;
        const uploadPath = path.join(__dirname, '..', 'media', 'cash_drop_labels', fileName);
        fs.writeFileSync(uploadPath, req.file.buffer);
        labelImagePath = `/media/cash_drop_labels/${fileName}`;
      }
    }

    if (status === 'submitted' && date) {
      const allowed = await isDateAllowedForCashDrop(date);
      if (!allowed) {
        return res.status(400).json({ error: 'Cash drop is not allowed for this date (check admin settings: allowed date range and bank drop rule).' });
      }
    }

    if (status === 'submitted') {
      const imageRequired = await isCashDropReceiptImageRequired();
      if (imageRequired && !labelImagePath) {
        return res.status(400).json({ error: 'A cash drop receipt image is required. Upload an image before submitting.' });
      }
    }

    // Block duplicate: one drop per (workstation, shift_number, date)
    if (workstation != null && shift_number != null && date && status === 'submitted') {
      const existing = await CashDrop.findByWorkstationShiftDate(workstation, shift_number, date, status);
      if (existing && existing.user_name && status === 'submitted') {
        const isOtherUser = existing.user_id !== req.user.id;
        const message = isOtherUser
          ? `Cash drop entry already submitted by ${existing.user_name} for this register, shift, and date.`
          : 'A cash drop entry already exists for this register, shift, and date.';
        return res.status(400).json({ error: message });
      }
    }

    const data = {
      user_id: req.user.id,
      drawer_entry_id: req.body.drawer_entry || req.body.drawer_entry_id || null,
      workstation,
      shift_number,
      date,
      drop_amount: req.body.drop_amount,
      hundreds: req.body.hundreds || 0,
      fifties: req.body.fifties || 0,
      twenties: req.body.twenties || 0,
      tens: req.body.tens || 0,
      fives: req.body.fives || 0,
      twos: req.body.twos || 0,
      ones: req.body.ones || 0,
      half_dollars: req.body.half_dollars || 0,
      quarters: req.body.quarters || 0,
      dimes: req.body.dimes || 0,
      nickels: req.body.nickels || 0,
      pennies: req.body.pennies || 0,
      quarter_rolls: req.body.quarter_rolls || req.body.quarterRolls || 0,
      dime_rolls: req.body.dime_rolls || req.body.dimeRolls || 0,
      nickel_rolls: req.body.nickel_rolls || req.body.nickelRolls || 0,
      penny_rolls: req.body.penny_rolls || req.body.pennyRolls || 0,
      ws_label_amount: req.body.ws_label_amount || 0,
      variance: req.body.variance || 0,
      label_image: labelImagePath,
      notes: req.body.notes || null,
      status: status,
      submitted_at: status === 'drafted' ? null : getPSTDateTime()
    };
    // Backend computes drop_amount from denominations so validation/bank drop always match
    data.drop_amount = computeDropAmountFromDenominations(data);
    if (!Number.isFinite(data.drop_amount)) data.drop_amount = 0;
    const wsLabel = parseFloat(data.ws_label_amount) || 0;
    data.variance = Math.round((data.drop_amount - wsLabel) * 100) / 100;
    if (!Number.isFinite(data.variance)) data.variance = 0;

    const drop = await CashDrop.create(data);
    
    // Auto-create reconciler entry only for submitted cash drops (not drafts)
    if (drop && status === 'submitted') {
      const existingRec = await CashDropReconciler.findByDropEntryId(drop.id);
      if (!existingRec) {
        try {
          await CashDropReconciler.create({
            user_id: drop.user_id,
            drop_entry_id: drop.id,
            workstation: drop.workstation,
            shift_number: drop.shift_number,
            date: drop.date
          });
        } catch (reconcilerError) {
          if (reconcilerError.code !== 'ER_DUP_ENTRY') {
            console.error('Error creating reconciler entry:', reconcilerError);
          }
        }
      }
    }
    
    res.status(201).json(drop);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE') || error.code === 'ER_DUP_ENTRY') {
      const workstation = req.body.workstation;
      const shiftNumber = req.body.shift_number || req.body.shiftNumber;
      const date = req.body.date;
      if (workstation && shiftNumber != null && date) {
        try {
          const existing = await CashDrop.findByWorkstationShiftDate(workstation, shiftNumber, date);
          if (existing && existing.user_id !== req.user.id && existing.user_name) {
            return res.status(400).json({
              error: `Cash drop entry already done by ${existing.user_name} for this workstation, shift, and date.`
            });
          }
        } catch (e) {
          console.warn('Could not fetch existing drop for error message:', e);
        }
      }
      return res.status(400).json({ error: 'Cash drop entry already exists for this workstation, shift, and date' });
    }
    console.error('Create cash drop error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

/** Validate that a cash drop can be submitted (no duplicate for workstation/shift/date). Use before creating/updating drawer so drawer is only written when drop will succeed. */
export const validateCashDrop = async (req, res) => {
  try {
    const workstation = req.body.workstation;
    const shift_number = req.body.shift_number;
    const date = req.body.date;
    const draftId = req.body.draftId != null ? parseInt(req.body.draftId, 10) : null;

    if (workstation == null || shift_number == null || !date) {
      return res.status(400).json({ error: 'workstation, shift_number, and date are required.' });
    }

    if (isStrictlyBeforePSTYesterday(date) && !req.user?.is_admin) {
      return res.status(403).json({ error: 'Cash drop is not allowed for this date.' });
    }

    const existing = await CashDrop.findByWorkstationShiftDate(workstation, shift_number, date);
    if (!existing) {
      return res.status(200).json({ ok: true });
    }
    if (draftId != null && existing.id === draftId) {
      return res.status(200).json({ ok: true });
    }
    const message = existing.user_id !== req.user.id && existing.user_name
      ? `Cash drop entry already submitted by ${existing.user_name} for this register, shift, and date.`
      : 'A cash drop entry already exists for this register, shift, and date.';
    return res.status(400).json({ error: message });
  } catch (error) {
    console.error('Validate cash drop error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCashDrops = async (req, res) => {
  try {
    const { datefrom, dateto } = req.query;
    
    if (!datefrom || !dateto) {
      return res.status(400).json({ error: 'Both datefrom and dateto are required' });
    }
    
    const from = String(datefrom).slice(0, 10);
    const to = String(dateto).slice(0, 10);
    const currentUser = await User.findById(req.user.id);
    const isAdmin = currentUser && currentUser.is_admin === 1;
    const userId = isAdmin ? null : req.user.id;
    const drops = await CashDrop.findByDateRange(from, to, userId);
    
    // Add full URL for label images (local path or Drive URL as-is)
    const baseUrl = req.protocol + '://' + req.get('host');
    const dropsWithImageUrl = drops.map(drop => {
      if (drop.label_image) {
        return {
          ...drop,
          label_image_url: drop.label_image.startsWith('http') ? (getDriveImageProxyUrl(baseUrl, drop.label_image) || drop.label_image) : `${baseUrl}${drop.label_image}`
        };
      }
      return drop;
    });
    
    res.json(dropsWithImageUrl);
  } catch (error) {
    console.error('Get cash drops error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCashDropById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Cash drop ID is required' });
    }
    
    const drop = await CashDrop.findById(parseInt(id));
    
    if (!drop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }
    
    // Check if user has access (admin can access all, regular users can only access their own)
    if (!req.user.is_admin && drop.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Add full URL for label image if present
    if (drop.label_image) {
      const baseUrl = req.protocol + '://' + req.get('host');
      drop.label_image_url = drop.label_image.startsWith('http') ? (getDriveImageProxyUrl(baseUrl, drop.label_image) || drop.label_image) : `${baseUrl}${drop.label_image}`;
    }
    
    res.json(drop);
  } catch (error) {
    console.error('Get cash drop by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCashDrop = async (req, res) => {
  try {
    const { id } = req.params;
    const dropId = parseInt(id);
    const currentDrop = await CashDrop.findById(dropId);
    if (!currentDrop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }

    const effectiveDate =
      req.body.date !== undefined && req.body.date !== '' ? String(req.body.date).slice(0, 10) : currentDrop.date;
    if (isStrictlyBeforePSTYesterday(effectiveDate) && !req.user?.is_admin) {
      return res.status(403).json({ error: 'Cash drop is not allowed for this date.' });
    }

    // When submitting: validate date against admin settings
    if (req.body.status === 'submitted') {
      const dropDate = req.body.date || currentDrop.date;
      if (dropDate) {
        const allowed = await isDateAllowedForCashDrop(dropDate);
        if (!allowed) {
          return res.status(400).json({ error: 'Cash drop is not allowed for this date (check admin settings: allowed date range and bank drop rule).' });
        }
      }
    }

    // When submitting a draft: block if another drop already exists for same workstation/shift/date
    if (req.body.status === 'submitted') {
      const workstation = req.body.workstation || currentDrop.workstation;
      const shiftNumber = req.body.shift_number || currentDrop.shift_number;
      const date = req.body.date || currentDrop.date;
      if (workstation != null && shiftNumber != null && date) {
        const existing = await CashDrop.findByWorkstationShiftDate(workstation, shiftNumber, date);
        if (existing && existing.id !== dropId && existing.user_name) {
          return res.status(400).json({
            error: `Cash drop entry already submitted by ${existing.user_name} for this register, shift, and date.`
          });
        }
      }
    }

    const updateData = {};
    
    if (req.body.date !== undefined) updateData.date = req.body.date;
    if (req.body.workstation !== undefined) updateData.workstation = req.body.workstation;
    if (req.body.shift_number !== undefined) updateData.shift_number = req.body.shift_number;
    if (req.body.drawer_entry !== undefined || req.body.drawer_entry_id !== undefined) {
      const raw = req.body.drawer_entry ?? req.body.drawer_entry_id;
      if (raw === '' || raw === null || raw === undefined) {
        updateData.drawer_entry_id = null;
      } else {
        const n = parseInt(raw, 10);
        updateData.drawer_entry_id = Number.isFinite(n) ? n : null;
      }
    }
    
    // Handle file upload if present (Google Drive year/month/day or local fallback)
    if (req.file) {
      const existingDrop = await CashDrop.findById(parseInt(id));
      const dateStr = req.body.date ?? existingDrop?.date;
      const workstation = req.body.workstation ?? existingDrop?.workstation;
      const shift_number = req.body.shift_number ?? existingDrop?.shift_number;

      if (isDriveEnabled() && dateStr) {
        const driveUrl = await uploadImageToDrive(
          req.file.buffer,
          dateStr,
          workstation,
          shift_number,
          req.file.originalname
        );
        if (driveUrl) {
          updateData.label_image = driveUrl;
        } else {
          console.warn('Cash drop update: Google Drive upload failed or returned null; saving image locally. Check server logs for Drive errors.');
        }
      } else if (isDriveEnabled() && !dateStr) {
        console.warn('Cash drop update: date missing; cannot upload to Drive. Saving image locally.');
      }
      if (updateData.label_image === undefined) {
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `cash_drop_${Date.now()}${fileExtension}`;
        const uploadPath = path.join(__dirname, '..', 'media', 'cash_drop_labels', fileName);
        const uploadDir = path.dirname(uploadPath);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(uploadPath, req.file.buffer);
        updateData.label_image = `/media/cash_drop_labels/${fileName}`;
      }

      // Delete old local image if it existed (ignore Drive URLs)
      if (existingDrop && existingDrop.label_image && !existingDrop.label_image.startsWith('http')) {
        const oldImagePath = path.join(__dirname, '..', existingDrop.label_image);
        try {
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (deleteError) {
          console.warn('Error deleting old image:', deleteError);
        }
      }
    }
    
    // Update denominations (include twos and half_dollars so saved values display everywhere)
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones',
                                'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies',
                                'quarter_rolls', 'dime_rolls', 'nickel_rolls', 'penny_rolls'];
    denominationFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = parseInt(req.body[field]) || 0;
      }
    });
    if (req.body.quarterRolls !== undefined && updateData.quarter_rolls === undefined) updateData.quarter_rolls = parseInt(req.body.quarterRolls) || 0;
    if (req.body.dimeRolls !== undefined && updateData.dime_rolls === undefined) updateData.dime_rolls = parseInt(req.body.dimeRolls) || 0;
    if (req.body.nickelRolls !== undefined && updateData.nickel_rolls === undefined) updateData.nickel_rolls = parseInt(req.body.nickelRolls) || 0;
    if (req.body.pennyRolls !== undefined && updateData.penny_rolls === undefined) updateData.penny_rolls = parseInt(req.body.pennyRolls) || 0;

    const hasDenominationUpdate = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies', 'quarter_rolls', 'dime_rolls', 'nickel_rolls', 'penny_rolls'].some(f => updateData[f] !== undefined);
    if (hasDenominationUpdate) {
      const currentDrop = await CashDrop.findById(parseInt(id));
      const merged = { ...(currentDrop || {}), ...updateData };
      updateData.drop_amount = computeDropAmountFromDenominations(merged);
      const wsLabel = parseFloat(merged.ws_label_amount ?? updateData.ws_label_amount) || 0;
      updateData.variance = Math.round((updateData.drop_amount - wsLabel) * 100) / 100;
    } else if (req.body.drop_amount !== undefined) {
      updateData.drop_amount = parseFloat(req.body.drop_amount);
    }

    // Update other fields
    if (req.body.ws_label_amount !== undefined) updateData.ws_label_amount = parseFloat(req.body.ws_label_amount);
    if (req.body.variance !== undefined) updateData.variance = parseFloat(req.body.variance);
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.status !== undefined) {
      updateData.status = req.body.status;
      if (req.body.status === 'submitted') {
        updateData.submitted_at = getPSTDateTime();
      }
    }

    const finalStatus = updateData.status !== undefined ? updateData.status : currentDrop.status;
    if (finalStatus === 'submitted') {
      const imageRequired = await isCashDropReceiptImageRequired();
      const finalLabelImage =
        updateData.label_image !== undefined ? updateData.label_image : currentDrop.label_image;
      if (imageRequired && !finalLabelImage) {
        return res.status(400).json({ error: 'A cash drop receipt image is required. Upload an image before submitting.' });
      }
    }
    
    const updated = await CashDrop.update(parseInt(id), updateData);
    
    // Auto-create reconciler entry if status changed to submitted
    if (req.body.status === 'submitted' && updated) {
      const existingRec = await CashDropReconciler.findByDropEntryId(updated.id);
      if (!existingRec) {
        try {
          await CashDropReconciler.create({
            user_id: updated.user_id,
            drop_entry_id: updated.id,
            workstation: updated.workstation,
            shift_number: updated.shift_number,
            date: updated.date
          });
        } catch (reconcilerError) {
          if (reconcilerError.code !== 'ER_DUP_ENTRY') {
            console.error('Error creating reconciler entry:', reconcilerError);
          }
        }
      }
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Update cash drop error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const deleteCashDrop = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Cash drop ID is required' });
    }
    
    const drop = await CashDrop.findById(parseInt(id));
    if (!drop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }
    
    // Only allow deletion of drafts
    if (drop.status !== 'drafted') {
      return res.status(400).json({ error: 'Only drafts can be deleted' });
    }
    
    // Only allow users to delete their own drafts (unless admin)
    if (!req.user.is_admin && drop.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own drafts' });
    }
    
    const drawerId = drop.drawer_entry_id;
    const deleted = await CashDrop.delete(parseInt(id));
    
    if (deleted && drawerId) {
      try {
        const drawer = await CashDrawer.findById(drawerId);
        if (drawer && drawer.status === 'drafted') {
          await CashDrawer.delete(drawerId);
        }
      } catch (e) {
        console.warn('Could not delete linked drawer draft:', e);
      }
    }
    
    if (deleted) {
      res.json({ message: 'Draft deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete draft' });
    }
  } catch (error) {
    console.error('Delete cash drop error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const ignoreCashDrop = async (req, res) => {
  try {
    const { id, ignore_reason } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Cash drop ID is required' });
    }
    
    if (!ignore_reason || ignore_reason.trim() === '') {
      return res.status(400).json({ error: 'Ignore reason is required' });
    }
    
    const drop = await CashDrop.findById(id);
    if (!drop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }
    
    const updated = await CashDrop.update(id, {
      ignored: true,
      ignore_reason: ignore_reason.trim(),
      status: 'ignored'
    });

    // When a cash drop is ignored, also set the linked cash drawer to ignored
    if (drop.drawer_entry_id) {
      try {
        await CashDrawer.update(drop.drawer_entry_id, { status: 'ignored' });
      } catch (drawerErr) {
        console.warn('Could not update linked cash drawer to ignored:', drawerErr);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Ignore cash drop error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
