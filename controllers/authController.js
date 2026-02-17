import { User } from '../models/authModel.js';
import jwt from 'jsonwebtoken';
import { verify, generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'cbjdVCQVE;OCLQ CBMASBCVICVQOFQefkbkjwebv;w';
const ACCESS_TOKEN_LIFETIME = '60m';
const REFRESH_TOKEN_LIFETIME = '1d';

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin === 1 },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_LIFETIME }
  );
  
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_LIFETIME }
  );
  
  return { accessToken, refreshToken };
};

export const login = async (req, res) => {
  try {
    const { email, totp_code } = req.body;
    
    if (!email || !totp_code) {
      return res.status(400).json({ error: 'Email and TOTP code are required' });
    }
    
    const user = await User.findByEmail(email);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.totp_secret) {
      return res.status(400).json({ error: 'TOTP not configured for this user' });
    }
    
    // verify is async in otplib v13 and returns { valid: boolean }
    const result = await verify({ token: totp_code, secret: user.totp_secret });
    
    if (!result.valid) {
      return res.status(400).json({ error: 'Invalid TOTP code' });
    }
    
    const { accessToken, refreshToken } = generateTokens(user);
    
    res.json({
      access: accessToken,
      refresh: refreshToken,
      is_admin: user.is_admin === 1
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin === 1
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin === 1
    })));
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, isAdmin } = req.body;
    
    console.log('Create user request:', { name, email, isAdmin });
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Generate TOTP secret
    let secret;
    try {
      secret = generateSecret();
      console.log('Secret generated successfully');
    } catch (secretError) {
      console.error('Error generating secret:', secretError);
      return res.status(500).json({ error: 'Failed to generate TOTP secret: ' + secretError.message });
    }
    
    // Create user
    let user;
    try {
      user = await User.create(email, name, isAdmin || false, secret);
      console.log('User created successfully:', user.id);
    } catch (createError) {
      console.error('Error creating user:', createError);
      return res.status(500).json({ error: 'Failed to create user: ' + createError.message });
    }
    
    // Generate QR code
    let otpAuthUrl;
    try {
      otpAuthUrl = generateURI({
        secret,
        label: email,
        issuer: 'TOTP App'
      });
      console.log('URI generated successfully');
    } catch (uriError) {
      console.error('Error generating URI:', uriError);
      // Still return success with secret, just without QR code
      return res.status(201).json({
        secret: secret,
        qr_code: null,
        error: 'QR code generation failed, but user was created. Use the secret manually.'
      });
    }
    
    let qrCodeDataUrl;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
      console.log('QR code generated successfully');
    } catch (qrError) {
      console.error('Error generating QR code image:', qrError);
      // Still return success with secret, just without QR code
      return res.status(201).json({
        secret: secret,
        qr_code: null,
        error: 'QR code image generation failed, but user was created. Use the secret manually.'
      });
    }
    
    res.status(201).json({
      secret: secret,
      qr_code: qrCodeDataUrl
    });
  } catch (error) {
    console.error('Create user error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(parseInt(id));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin === 1
    });
  } catch (error) {
    console.error('Get user by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isAdmin } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (isAdmin !== undefined) updateData.is_admin = isAdmin;
    
    const user = await User.update(parseInt(id), updateData);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin === 1
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(parseInt(id));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await User.delete(parseInt(id));
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = (req, res) => {
  // In a production app, you might want to blacklist the refresh token
  // For now, we'll just return success
  res.json({ message: 'Logged out successfully' });
};

export const refreshToken = async (req, res) => {
  try {
    const { refresh } = req.body;
    
    if (!refresh) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    jwt.verify(refresh, JWT_SECRET, async (err, decoded) => {
      if (err) {
        console.error('Refresh token verification error:', err.message);
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }
      
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { accessToken } = generateTokens(user);
      res.json({ access: accessToken });
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserCount = async (req, res) => {
  console.log('[auth] GET /user-count requested');
  try {
    const count = await User.count();
    console.log('[auth] User count:', count);
    res.json({ count });
  } catch (error) {
    console.error('Get user count error:', error.message || error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
