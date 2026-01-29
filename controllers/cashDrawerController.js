import { CashDrawer } from '../models/cashDrawerModel.js';

export const createCashDrawer = async (req, res) => {
  try {
    // Handle both snake_case and camelCase field names from frontend
    const data = {
      user_id: req.user.id,
      workstation: req.body.workstation,
      shift_number: req.body.shift_number,
      date: req.body.date,
      starting_cash: req.body.starting_cash,
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
      total_cash: req.body.total_cash
    };
    
    const drawer = await CashDrawer.create(data);
    res.status(201).json(drawer);
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE') || error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Cash drawer entry already exists for this workstation, shift, and date' });
    }
    console.error('Create cash drawer error:', error);
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
