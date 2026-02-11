import { CashDrawer } from '../models/cashDrawerModel.js';

export const createCashDrawer = async (req, res) => {
  try {
    // Handle both snake_case and camelCase field names from frontend
    const data = {
      user_id: req.user.id,
      workstation: req.body.workstation || req.body.workStation,
      shift_number: req.body.shift_number || req.body.shiftNumber,
      date: req.body.date,
      starting_cash: req.body.starting_cash || req.body.startingCash,
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
      quarter_rolls: req.body.quarter_rolls || req.body.quarterRolls || 0,
      dime_rolls: req.body.dime_rolls || req.body.dimeRolls || 0,
      nickel_rolls: req.body.nickel_rolls || req.body.nickelRolls || 0,
      penny_rolls: req.body.penny_rolls || req.body.pennyRolls || 0,
      total_cash: req.body.total_cash || req.body.totalCash,
      status: req.body.status || 'submitted'
    };
    
    // Validate required fields
    if (!data.workstation || !data.shift_number || !data.date || !data.starting_cash || data.total_cash === undefined) {
      return res.status(400).json({ error: 'Missing required fields: workstation, shift_number, date, starting_cash, and total_cash are required' });
    }
    
    const drawer = await CashDrawer.create(data);
    res.status(201).json(drawer);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE') || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Cash drawer entry already exists for this workstation, shift, and date' });
    }
    console.error('Create cash drawer error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const updateCashDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {};
    
    // Handle both snake_case and camelCase
    if (req.body.workstation !== undefined) updateData.workstation = req.body.workstation;
    else if (req.body.workStation !== undefined) updateData.workstation = req.body.workStation;
    
    if (req.body.shift_number !== undefined) updateData.shift_number = req.body.shift_number;
    else if (req.body.shiftNumber !== undefined) updateData.shift_number = req.body.shiftNumber;
    
    if (req.body.date !== undefined) updateData.date = req.body.date;
    
    if (req.body.starting_cash !== undefined) updateData.starting_cash = parseFloat(req.body.starting_cash);
    else if (req.body.startingCash !== undefined) updateData.starting_cash = parseFloat(req.body.startingCash);
    
    if (req.body.total_cash !== undefined) updateData.total_cash = parseFloat(req.body.total_cash);
    else if (req.body.totalCash !== undefined) updateData.total_cash = parseFloat(req.body.totalCash);
    
    const denominationFields = ['hundreds', 'fifties', 'twenties', 'tens', 'fives', 'twos', 'ones', 
                                'half_dollars', 'quarters', 'dimes', 'nickels', 'pennies',
                                'quarter_rolls', 'dime_rolls', 'nickel_rolls', 'penny_rolls'];
    denominationFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = parseInt(req.body[field]) || 0;
      }
    });
    
    // Handle camelCase for halfDollars
    if (req.body.halfDollars !== undefined && updateData.half_dollars === undefined) {
      updateData.half_dollars = parseInt(req.body.halfDollars) || 0;
    }
    
    // Handle camelCase for coin rolls
    if (req.body.quarterRolls !== undefined && updateData.quarter_rolls === undefined) {
      updateData.quarter_rolls = parseInt(req.body.quarterRolls) || 0;
    }
    if (req.body.dimeRolls !== undefined && updateData.dime_rolls === undefined) {
      updateData.dime_rolls = parseInt(req.body.dimeRolls) || 0;
    }
    if (req.body.nickelRolls !== undefined && updateData.nickel_rolls === undefined) {
      updateData.nickel_rolls = parseInt(req.body.nickelRolls) || 0;
    }
    if (req.body.pennyRolls !== undefined && updateData.penny_rolls === undefined) {
      updateData.penny_rolls = parseInt(req.body.pennyRolls) || 0;
    }
    
    if (req.body.status !== undefined) {
      updateData.status = req.body.status;
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    const updated = await CashDrawer.update(parseInt(id), updateData);
    if (!updated) {
      return res.status(404).json({ error: 'Cash drawer not found or update failed' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Update cash drawer error:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const deleteCashDrawer = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Cash drawer ID is required' });
    }
    
    const drawer = await CashDrawer.findById(parseInt(id));
    if (!drawer) {
      return res.status(404).json({ error: 'Cash drawer not found' });
    }
    
    // Only allow users to delete their own drawers (unless admin)
    if (!req.user.is_admin && drawer.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own cash drawers' });
    }
    
    const deleted = await CashDrawer.delete(parseInt(id));
    
    if (deleted) {
      res.json({ message: 'Cash drawer deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete cash drawer' });
    }
  } catch (error) {
    console.error('Delete cash drawer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCashDrawers = async (req, res) => {
  try {
    const { datefrom, dateto } = req.query;
    
    if (!datefrom || !dateto) {
      return res.status(400).json({ error: 'Both datefrom and dateto are required' });
    }
    
    const userId = req.user.is_admin ? null : req.user.id;
    const drawers = await CashDrawer.findByDateRange(datefrom, dateto, userId);
    
    res.json(drawers);
  } catch (error) {
    console.error('Get cash drawers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCashDrawerById = async (req, res) => {
  try {
    const { id } = req.params;
    const drawer = await CashDrawer.findById(parseInt(id));
    res.json(drawer);
  } catch (error) {
    console.error('Get cash drawer by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
