import { CashDrop } from '../models/cashDropModel.js';
import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';
import { CashDrawer } from '../models/cashDrawerModel.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getPSTDateTime, isAllowedCashDropDate } from '../utils/dateUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createCashDrop = async (req, res) => {
  try {
    let labelImagePath = null;
    
    // Handle file upload if present
    if (req.file) {
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `cash_drop_${Date.now()}${fileExtension}`;
      const uploadPath = path.join(__dirname, '..', 'media', 'cash_drop_labels', fileName);
      
      fs.writeFileSync(uploadPath, req.file.buffer);
      labelImagePath = `/media/cash_drop_labels/${fileName}`;
    }
    
    const status = req.body.status || 'submitted';
    const workstation = req.body.workstation;
    const shift_number = req.body.shift_number;
    const date = req.body.date;

    if (status === 'submitted' && date && !isAllowedCashDropDate(date)) {
      return res.status(400).json({ error: 'Cash drop can only be submitted for the current day or the previous day (PST).' });
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
      half_dollars: req.body.half_dollars || req.body.halfDollars || 0,
      quarters: req.body.quarters || 0,
      dimes: req.body.dimes || 0,
      nickels: req.body.nickels || 0,
      pennies: req.body.pennies || 0,
      ws_label_amount: req.body.ws_label_amount || 0,
      variance: req.body.variance || 0,
      label_image: labelImagePath,
      notes: req.body.notes || null,
      status: status,
      submitted_at: status === 'drafted' ? null : getPSTDateTime()
    };
    
    const drop = await CashDrop.create(data);
    
    // Auto-create reconciler entry only for submitted cash drops (not drafts)
    if (drop && status === 'submitted') {
      try {
        await CashDropReconciler.create({
          user_id: drop.user_id,
          drop_entry_id: drop.id,
          workstation: drop.workstation,
          shift_number: drop.shift_number,
          date: drop.date
        });
      } catch (reconcilerError) {
        // Log but don't fail the cash drop creation
        console.error('Error creating reconciler entry:', reconcilerError);
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
    res.status(500).json({ error: 'Internal server error' });
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
    
    const userId = req.user.is_admin ? null : req.user.id;
    const drops = await CashDrop.findByDateRange(datefrom, dateto, userId);
    
    // Add full URL for label images
    const dropsWithImageUrl = drops.map(drop => {
      if (drop.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        return {
          ...drop,
          label_image_url: `${baseUrl}${drop.label_image}`
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
      drop.label_image_url = `${baseUrl}${drop.label_image}`;
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

    // When submitting: only allow current or previous day (PST)
    if (req.body.status === 'submitted') {
      const dropDate = req.body.date || currentDrop.date;
      if (dropDate && !isAllowedCashDropDate(dropDate)) {
        return res.status(400).json({ error: 'Cash drop can only be submitted for the current day or the previous day (PST).' });
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
    
    // Handle file upload if present
    if (req.file) {
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `cash_drop_${Date.now()}${fileExtension}`;
      const uploadPath = path.join(__dirname, '..', 'media', 'cash_drop_labels', fileName);
      
      // Ensure directory exists
      const uploadDir = path.dirname(uploadPath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      fs.writeFileSync(uploadPath, req.file.buffer);
      updateData.label_image = `/media/cash_drop_labels/${fileName}`;
      
      // Delete old image if it exists
      const existingDrop = await CashDrop.findById(parseInt(id));
      if (existingDrop && existingDrop.label_image) {
        const oldImagePath = path.join(__dirname, '..', existingDrop.label_image);
        try {
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (deleteError) {
          console.warn('Error deleting old image:', deleteError);
          // Don't fail the update if old image deletion fails
        }
      }
    }
    
    // Update denominations
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 
                                'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies'];
    denominationFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = parseInt(req.body[field]) || 0;
      }
    });
    
    // Update other fields
    if (req.body.drop_amount !== undefined) updateData.drop_amount = parseFloat(req.body.drop_amount);
    if (req.body.ws_label_amount !== undefined) updateData.ws_label_amount = parseFloat(req.body.ws_label_amount);
    if (req.body.variance !== undefined) updateData.variance = parseFloat(req.body.variance);
    if (req.body.notes !== undefined) updateData.notes = req.body.notes;
    if (req.body.status !== undefined) {
      updateData.status = req.body.status;
      if (req.body.status === 'submitted') {
        updateData.submitted_at = getPSTDateTime();
      }
    }
    
    const updated = await CashDrop.update(parseInt(id), updateData);
    
    // Auto-create reconciler entry if status changed to submitted
    if (req.body.status === 'submitted' && updated) {
      try {
        await CashDropReconciler.create({
          user_id: updated.user_id,
          drop_entry_id: updated.id,
          workstation: updated.workstation,
          shift_number: updated.shift_number,
          date: updated.date
        });
      } catch (reconcilerError) {
        console.error('Error creating reconciler entry:', reconcilerError);
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
