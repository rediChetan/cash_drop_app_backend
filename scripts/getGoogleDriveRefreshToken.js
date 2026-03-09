/**
 * One-time script to obtain GOOGLE_REFRESH_TOKEN for Drive OAuth.
 * Run: node scripts/getGoogleDriveRefreshToken.js
 * Requires in .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * In Google Cloud Console, set redirect URI to http://localhost:3080/oauth2callback (or the URL this script prints).
 */

import http from 'http';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const REDIRECT_PATH = '/oauth2callback';

function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    process.exit(1);
  }

  const envRedirect = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const redirectUri = envRedirect || `http://localhost:3080${REDIRECT_PATH}`;
  const port = envRedirect ? parseInt(new URL(redirectUri).port || '80', 10) : 3080;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // force refresh_token to be returned
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '', redirectUri);
    if (url.pathname !== REDIRECT_PATH) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code in callback. Try again.');
      return;
    }
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<h1>Success</h1><p>You can close this tab. Check the terminal for GOOGLE_REFRESH_TOKEN.</p>'
      );
      console.log('\nAdd this to your .env:\n');
      console.log('GOOGLE_REFRESH_TOKEN=' + (tokens.refresh_token || tokens.access_token));
      if (tokens.refresh_token) {
        console.log('\nGOOGLE_DRIVE_REDIRECT_URI=' + redirectUri);
        console.log('(Set the same redirect URI in Google Cloud Console if you have not.)');
      }
      server.close();
      process.exit(0);
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end('Error: ' + e.message);
    }
  });

  server.listen(port, () => {
    console.log('Open this URL in your browser and sign in with the Google account that will own the Drive folder:\n');
    console.log(authUrl);
    console.log('\nRedirect URI for this script: ' + redirectUri);
    console.log('Add this exact redirect URI in Google Cloud Console (APIs & Services > Credentials > your OAuth client > Authorized redirect URIs).\n');
  });
}

main();
