import { CashDrop } from '../models/cashDropModel.js';
import { CashDropReconciler } from '../models/cashDropReconcilerModel.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
    
    const data = {
      user_id: req.user.id,
      drawer_entry_id: req.body.drawer_entry || req.body.drawer_entry_id || null,
      workstation: req.body.workstation,
      shift_number: req.body.shift_number,
      date: req.body.date,
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
      submitted_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    
    const drop = await CashDrop.create(data);
    
    // Auto-create reconciler entry (equivalent to Django signal)
    if (drop) {
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
      return res.status(400).json({ error: 'Cash drop entry already exists for this workstation, shift, and date' });
    }
    console.error('Create cash drop error:', error);
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
