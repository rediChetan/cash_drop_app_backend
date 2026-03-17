import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';
import { CashDrop } from '../models/cashDropModel.js';
import { User } from '../models/authModel.js';
import { getDriveImageProxyUrl } from '../services/googleDriveService.js';

export const getCashDropReconcilers = async (req, res) => {
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
    const reconcilers = await CashDropReconciler.findByDateRange(from, to, userId);
    
    // Add full URL for label images
    const reconcilersWithImageUrl = reconcilers.map(reconciler => {
      const result = { ...reconciler };
      
      if (reconciler.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        result.label_image_url = reconciler.label_image.startsWith('http') ? (getDriveImageProxyUrl(baseUrl, reconciler.label_image) || reconciler.label_image) : `${baseUrl}${reconciler.label_image}`;
      }
      
      return result;
    });
    
    res.json(reconcilersWithImageUrl);
  } catch (error) {
    console.error('Get cash drop reconcilers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCashDropReconciler = async (req, res) => {
  try {
    const { id } = req.body;
    const { admin_count_amount, is_reconciled, notes } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }
    
    const reconciler = await CashDropReconciler.findById(id);
    
    if (!reconciler) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    // If unreconciling (setting is_reconciled to false)
    if (is_reconciled === false) {
      const updated = await CashDropReconciler.update(id, {
        is_reconciled: false,
        notes: null // Clear notes when unreconciling
      });
      
      // Add image URL if present (Drive URL as-is or local with baseUrl)
      if (updated && updated.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        updated.label_image_url = updated.label_image.startsWith('http') ? (getDriveImageProxyUrl(baseUrl, updated.label_image) || updated.label_image) : `${baseUrl}${updated.label_image}`;
      }
      
      return res.json(updated);
    }
    
    // If reconciling, we need admin_count_amount
    if (is_reconciled === true && admin_count_amount === undefined) {
      return res.status(400).json({ error: 'admin_count_amount is required when reconciling' });
    }
    
    // Get the drop entry to compare amounts
    const dropEntry = await CashDrop.findById(reconciler.drop_entry_id);
    
    if (!dropEntry) {
      return res.status(404).json({ error: 'Associated cash drop not found' });
    }
    
    const adminCounted = parseFloat(admin_count_amount || 0);
    const systemDrop = parseFloat(dropEntry.drop_amount);
    
    // Calculate reconcile delta (difference between counted and system drop)
    const reconcileDelta = adminCounted - systemDrop;
    const hasDelta = Math.abs(reconcileDelta) > 0.01;

    // When there is a delta, require custom denominations (so CD dashboard and bank drop use counted breakdown)
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies', 'quarter_rolls', 'dime_rolls', 'nickel_rolls', 'penny_rolls'];
    const denominationValues = { hundreds: 100, fifties: 50, twenties: 20, tens: 10, fives: 5, twos: 2, ones: 1, half_dollars: 0.5, quarters: 0.25, dimes: 0.1, nickels: 0.05, pennies: 0.01, quarter_rolls: 10, dime_rolls: 5, nickel_rolls: 2, penny_rolls: 0.5 };
    let customDenoms = null;
    if (hasDelta) {
      // Build full set of denominations from request (missing => 0) so cash drop gets a complete overwrite
      const provided = {};
      let anyProvided = false;
      for (const f of denominationFields) {
        const val = (req.body[f] !== undefined && req.body[f] !== null) ? (parseFloat(req.body[f]) || 0) : 0;
        provided[f] = val;
        if (val !== 0) anyProvided = true;
      }
      if (anyProvided) {
        const rawSum = denominationFields.reduce((s, f) => s + (provided[f] || 0) * (denominationValues[f] || 0), 0);
        const sum = Math.round(rawSum * 100) / 100;
        if (Math.abs(sum - adminCounted) > 0.02) {
          return res.status(400).json({ error: `Custom denominations total ($${sum.toFixed(2)}) must equal counted amount ($${adminCounted.toFixed(2)}).` });
        }
        // Store as integers for DB INT columns; summary and display use these same values
        customDenoms = {};
        for (const f of denominationFields) {
          customDenoms[f] = Math.round(Number(provided[f]) || 0);
        }
      } else {
        return res.status(400).json({ error: 'When counted amount differs from drop amount, you must provide custom denominations that match what you counted.' });
      }
    }

    // Update the reconciler with notes if provided
    const updateData = {
      admin_count_amount: adminCounted,
      is_reconciled: true,
      reconcile_delta: reconcileDelta
    };
    
    if (notes !== undefined) {
      updateData.notes = notes || null;
    }
    
    const updated = await CashDropReconciler.update(id, updateData);
    
    // Update cash drop: status to 'reconciled', and when there's a delta persist custom denominations so CD dashboard / bank drop summary match
    if (is_reconciled === true && updated && updated.drop_entry_id) {
      const dropUpdate = { status: 'reconciled' };
      if (customDenoms) {
        Object.assign(dropUpdate, customDenoms);
        dropUpdate.drop_amount = adminCounted;
      }
      try {
        await CashDrop.update(updated.drop_entry_id, dropUpdate);
      } catch (error) {
        console.error('Error updating cash drop status/denominations:', error);
        return res.status(500).json({ error: 'Reconciler updated but cash drop update failed. Please contact support.' });
      }
    }
    
    // Add image URL if present (Drive URL as-is or local with baseUrl)
    if (updated && updated.label_image) {
      const baseUrl = req.protocol + '://' + req.get('host');
      updated.label_image_url = updated.label_image.startsWith('http') ? (getDriveImageProxyUrl(baseUrl, updated.label_image) || updated.label_image) : `${baseUrl}${updated.label_image}`;
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Update cash drop reconciler error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const createCashDropReconciler = async (req, res) => {
  try {
    const data = {
      user_id: req.user.id,
      drop_entry_id: req.body.drop_entry_id,
      workstation: req.body.workstation,
      shift_number: req.body.shift_number,
      date: req.body.date
    };
    
    const reconciler = await CashDropReconciler.create(data);
    res.status(201).json(reconciler);
  } catch (error) {
    console.error('Create cash drop reconciler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
