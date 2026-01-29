import db from '../config/database.js';
import { TOTP, generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';

// Create test admin user
const email = 'admin@test.com';
const name = 'Test Admin';
const isAdmin = true;

// Generate TOTP secret
const secret = generateSecret();

// Check if user already exists
const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

if (existingUser) {
  console.log('User already exists. Updating TOTP secret...');
  const stmt = db.prepare('UPDATE users SET totp_secret = ?, is_admin = ? WHERE email = ?');
  stmt.run(secret, isAdmin ? 1 : 0, email);
  console.log('User updated!');
} else {
  // Create new user
  const stmt = db.prepare(`
    INSERT INTO users (email, name, is_admin, totp_secret)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(email, name, isAdmin ? 1 : 0, secret);
  console.log('User created!');
}

// Generate QR code URI
const totp = new TOTP();
const otpAuthUrl = totp.toURI({
  secret,
  label: email,
  issuer: 'TOTP App'
});

// Generate QR code as data URL
QRCode.toDataURL(otpAuthUrl, (err, qrCodeDataUrl) => {
  if (err) {
    console.error('Error generating QR code:', err);
    return;
  }

  console.log('\n========================================');
  console.log('TEST ADMIN USER CREATED');
  console.log('========================================');
  console.log('Email:', email);
  console.log('Name:', name);
  console.log('Is Admin: Yes');
  console.log('\nTOTP Secret:', secret);
  console.log('\nOTP Auth URL:', otpAuthUrl);
  console.log('\nQR Code (base64):');
  console.log(qrCodeDataUrl);
  console.log('\n========================================');
  console.log('INSTRUCTIONS:');
  console.log('1. Open Google Authenticator app');
  console.log('2. Click the "+" button to add an account');
  console.log('3. Choose "Enter a setup key"');
  console.log('4. Enter the account name:', email);
  console.log('5. Enter the secret key:', secret);
  console.log('6. Choose "Time-based"');
  console.log('7. Click "Add"');
  console.log('\nOR scan the QR code above (copy the base64 string and paste it in a QR code viewer)');
  console.log('========================================\n');
});
