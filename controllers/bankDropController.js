import { CashDrop } from '../models/cashDropModel.js';
import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';
import { BankDrop } from '../models/bankDropModel.js';

// Get all dropped batches (for History section)
export const getBatchHistory = async (req, res) => {
  try {
    const batches = await BankDrop.findAllBatchesWithAmount();
    res.json(batches);
  } catch (error) {
    console.error('Get batch history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get bank drop list items by batch number(s) (for viewing selected batches in the list)
export const getBankDropDataByBatches = async (req, res) => {
  try {
    const { batch_numbers } = req.body;
    if (!batch_numbers || !Array.isArray(batch_numbers) || batch_numbers.length === 0) {
      return res.status(400).json({ error: 'batch_numbers array is required' });
    }
    const userId = req.user.is_admin ? null : req.user.id;
    const reconcilers = await CashDropReconciler.findByBatchNumbers(batch_numbers, userId);
    const withImageUrl = reconcilers.map(reconciler => {
      const result = { ...reconciler };
      if (reconciler.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        result.label_image_url = `${baseUrl}${reconciler.label_image}`;
      } else {
        result.label_image_url = null;
      }
      result.drop_entry_id = reconciler.drop_entry_id;
      result.reconciled_amount = reconciler.admin_count_amount || reconciler.system_drop_amount;
      result.bank_drop_batch_number = reconciler.bank_drop_batch_number ?? null;
      result.bank_dropped = !!reconciler.bank_dropped;
      return result;
    });
    res.json(withImageUrl);
  } catch (error) {
    console.error('Get bank drop data by batches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get reconciled cash drops for bank drop (only reconciled ones)
export const getBankDropData = async (req, res) => {
  try {
    const { datefrom, dateto } = req.query;
    
    if (!datefrom || !dateto) {
      return res.status(400).json({ error: 'Both datefrom and dateto are required' });
    }
    
    const userId = req.user.is_admin ? null : req.user.id;
    // Only get reconciled items - use admin_count_amount (Counted Amount) for Bank Drop
    const reconcilers = await CashDropReconciler.findByDateRange(datefrom, dateto, userId, true);
    
    // Add full URL for label images and ensure batch# is included
    const reconcilersWithImageUrl = reconcilers.map(reconciler => {
      const result = { ...reconciler };
      
      if (reconciler.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        result.label_image_url = `${baseUrl}${reconciler.label_image}`;
      } else {
        result.label_image_url = null;
      }
      
      result.drop_entry_id = reconciler.drop_entry_id;
      result.reconciled_amount = reconciler.admin_count_amount || reconciler.system_drop_amount;
      result.bank_drop_batch_number = reconciler.bank_drop_batch_number ?? null;
      result.bank_dropped = !!reconciler.bank_dropped;
      return result;
    });
    
    res.json(reconcilersWithImageUrl);
  } catch (error) {
    console.error('Get bank drop data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get cash drop by ID with full denomination details
export const getCashDropById = async (req, res) => {
  try {
    const { id } = req.params;
    const drop = await CashDrop.findById(parseInt(id));
    
    if (!drop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }
    
    // Add image URL if present
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

// Update cash drop denominations
export const updateCashDropDenominations = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Validate that id exists
    const existingDrop = await CashDrop.findById(parseInt(id));
    if (!existingDrop) {
      return res.status(404).json({ error: 'Cash drop not found' });
    }
    
    // Recalculate drop_amount if denominations changed
    const denominationValues = {
      hundreds: 100,
      fifties: 50,
      twenties: 20,
      tens: 10,
      fives: 5,
      twos: 2,
      ones: 1,
      half_dollars: 0.5,
      quarters: 0.25,
      dimes: 0.1,
      nickels: 0.05,
      pennies: 0.01
    };
    
    let newDropAmount = 0;
    Object.keys(denominationValues).forEach(denom => {
      const count = updateData[denom] !== undefined ? updateData[denom] : existingDrop[denom];
      newDropAmount += count * denominationValues[denom];
    });
    
    updateData.drop_amount = newDropAmount;
    
    const updated = await CashDrop.update(parseInt(id), updateData);
    
    if (!updated) {
      return res.status(400).json({ error: 'Failed to update cash drop' });
    }
    
    // Add image URL if present
    if (updated.label_image) {
      const baseUrl = req.protocol + '://' + req.get('host');
      updated.label_image_url = `${baseUrl}${updated.label_image}`;
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Update cash drop denominations error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

// Get bank drop summary for selected cash drops or by batch number(s)
export const getBankDropSummary = async (req, res) => {
  try {
    const { cash_drop_ids, batch_numbers } = req.body;
    
    let drops = [];
    if (batch_numbers && Array.isArray(batch_numbers) && batch_numbers.length > 0) {
      drops = await CashDrop.findByBatchNumbers(batch_numbers);
    } else if (cash_drop_ids && Array.isArray(cash_drop_ids) && cash_drop_ids.length > 0) {
      const dropPromises = cash_drop_ids.map(id => CashDrop.findById(parseInt(id)));
      drops = (await Promise.all(dropPromises)).filter(d => d !== null);
    } else {
      return res.status(400).json({ error: 'Either cash_drop_ids or batch_numbers array is required' });
    }
    
    if (drops.length === 0) {
      return res.status(404).json({ error: 'No valid cash drops found' });
    }
    
    // Calculate totals
    const totals = {
      hundreds: 0,
      fifties: 0,
      twenties: 0,
      tens: 0,
      fives: 0,
      twos: 0,
      ones: 0,
      half_dollars: 0,
      quarters: 0,
      dimes: 0,
      nickels: 0,
      pennies: 0
    };
    
    drops.forEach(drop => {
      totals.hundreds += drop.hundreds || 0;
      totals.fifties += drop.fifties || 0;
      totals.twenties += drop.twenties || 0;
      totals.tens += drop.tens || 0;
      totals.fives += drop.fives || 0;
      totals.twos += drop.twos || 0;
      totals.ones += drop.ones || 0;
      totals.half_dollars += drop.half_dollars || 0;
      totals.quarters += drop.quarters || 0;
      totals.dimes += drop.dimes || 0;
      totals.nickels += drop.nickels || 0;
      totals.pennies += drop.pennies || 0;
    });
    
    // Calculate total amount
    const totalAmount = 
      totals.hundreds * 100 +
      totals.fifties * 50 +
      totals.twenties * 20 +
      totals.tens * 10 +
      totals.fives * 5 +
      totals.twos * 2 +
      totals.ones * 1 +
      totals.half_dollars * 0.5 +
      totals.quarters * 0.25 +
      totals.dimes * 0.1 +
      totals.nickels * 0.05 +
      totals.pennies * 0.01;
    
    res.json({
      cash_drops: drops,
      totals,
      total_amount: parseFloat(totalAmount.toFixed(2)),
      count: drops.length
    });
  } catch (error) {
    console.error('Get bank drop summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Generate a unique batch number for bank drops
function generateBankDropBatchNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `BATCH-${y}${m}${d}-${h}${min}${s}`;
}

// Mark cash drops as bank dropped (assign same batch# to all in the request; optional custom batch_number)
export const markAsBankDropped = async (req, res) => {
  try {
    const { cash_drop_ids, batch_number: customBatchNumber } = req.body;
    
    if (!cash_drop_ids || !Array.isArray(cash_drop_ids) || cash_drop_ids.length === 0) {
      return res.status(400).json({ error: 'cash_drop_ids array is required' });
    }
    
    const batchNumber = (typeof customBatchNumber === 'string' && customBatchNumber.trim() !== '')
      ? customBatchNumber.trim()
      : generateBankDropBatchNumber();
    const updated = [];
    const dropsWithAmount = []; // { id, drop_amount } for bank_drops table
    const errors = [];
    
    for (const id of cash_drop_ids) {
      const numId = parseInt(id, 10);
      if (Number.isNaN(numId) || numId < 1) {
        errors.push({ id, error: 'Invalid cash drop id' });
        continue;
      }
      try {
        const drop = await CashDrop.update(numId, {
          bank_dropped: true,
          bank_drop_batch_number: batchNumber
        });
        if (drop) {
          updated.push(drop.id);
          const amount = drop.drop_amount != null ? parseFloat(drop.drop_amount) : 0;
          dropsWithAmount.push({ id: drop.id, drop_amount: amount });
        } else {
          errors.push({ id, error: 'Cash drop not found' });
        }
      } catch (error) {
        console.error('Mark bank dropped update error for id', numId, error);
        errors.push({ id: numId, error: error.message });
      }
    }
    
    const batchDropAmount = dropsWithAmount.reduce((sum, d) => sum + d.drop_amount, 0);
    
    if (updated.length > 0) {
      try {
        await BankDrop.recordBatch(batchNumber, updated.length);
      } catch (e) {
        console.error('Failed to record bank_drop_batches:', e);
      }
      try {
        await BankDrop.recordDrops(batchNumber, dropsWithAmount, batchDropAmount);
      } catch (e) {
        console.error('Failed to record bank_drops:', e);
      }
    }
    
    if (updated.length === 0) {
      return res.status(400).json({
        error: 'No cash drops were updated.',
        errors: errors.length > 0 ? errors : undefined
      });
    }
    res.json({
      success: true,
      updated_count: updated.length,
      updated_ids: updated,
      batch_number: batchNumber,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Mark as bank dropped error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
