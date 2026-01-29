import { CashDrop } from '../models/cashDropModel.js';
import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';

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
    
    // Add full URL for label images
    const reconcilersWithImageUrl = reconcilers.map(reconciler => {
      const result = { ...reconciler };
      
      if (reconciler.label_image) {
        const baseUrl = req.protocol + '://' + req.get('host');
        result.label_image_url = `${baseUrl}${reconciler.label_image}`;
      } else {
        result.label_image_url = null;
      }
      
      // Ensure drop_entry_id is included
      result.drop_entry_id = reconciler.drop_entry_id;
      
      // Use admin_count_amount (Counted Amount) for reconciled_amount in Bank Drop
      result.reconciled_amount = reconciler.admin_count_amount || reconciler.system_drop_amount;
      
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

// Get bank drop summary for selected cash drops
export const getBankDropSummary = async (req, res) => {
  try {
    const { cash_drop_ids } = req.body;
    
    if (!cash_drop_ids || !Array.isArray(cash_drop_ids) || cash_drop_ids.length === 0) {
      return res.status(400).json({ error: 'cash_drop_ids array is required' });
    }
    
    // Get all cash drops
    const dropPromises = cash_drop_ids.map(id => CashDrop.findById(parseInt(id)));
    const drops = (await Promise.all(dropPromises)).filter(d => d !== null);
    
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

// Mark cash drops as bank dropped
export const markAsBankDropped = async (req, res) => {
  try {
    const { cash_drop_ids } = req.body;
    
    if (!cash_drop_ids || !Array.isArray(cash_drop_ids) || cash_drop_ids.length === 0) {
      return res.status(400).json({ error: 'cash_drop_ids array is required' });
    }
    
    const updated = [];
    const errors = [];
    
    for (const id of cash_drop_ids) {
      try {
        const drop = await CashDrop.update(parseInt(id), { bank_dropped: true });
        if (drop) {
          updated.push(drop.id);
        } else {
          errors.push({ id, error: 'Cash drop not found' });
        }
      } catch (error) {
        errors.push({ id, error: error.message });
      }
    }
    
    res.json({
      success: true,
      updated_count: updated.length,
      updated_ids: updated,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Mark as bank dropped error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
