import { AdminSettings } from '../models/adminSettingsModel.js';

export const getAdminSettings = async (req, res) => {
  try {
    const settings = await AdminSettings.getAll();
    // Parse JSON strings for complex settings
    const parsedSettings = {
      shifts: settings.shifts ? JSON.parse(settings.shifts) : [],
      workstations: settings.workstations ? JSON.parse(settings.workstations) : [],
      starting_amount: settings.starting_amount ? parseFloat(settings.starting_amount) : 200.00,
      max_cash_drops_per_day: settings.max_cash_drops_per_day ? parseInt(settings.max_cash_drops_per_day) : 10
    };
    res.json(parsedSettings);
  } catch (error) {
    console.error('Get admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateAdminSettings = async (req, res) => {
  try {
    const { shifts, workstations, starting_amount, max_cash_drops_per_day } = req.body;

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

    const updatedSettings = await AdminSettings.getAll();
    const parsedSettings = {
      shifts: updatedSettings.shifts ? JSON.parse(updatedSettings.shifts) : [],
      workstations: updatedSettings.workstations ? JSON.parse(updatedSettings.workstations) : [],
      starting_amount: updatedSettings.starting_amount ? parseFloat(updatedSettings.starting_amount) : 200.00,
      max_cash_drops_per_day: updatedSettings.max_cash_drops_per_day ? parseInt(updatedSettings.max_cash_drops_per_day) : 10
    };
    res.json(parsedSettings);
  } catch (error) {
    console.error('Update admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
