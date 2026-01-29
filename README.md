# Cash Drop App - Node.js Backend

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a test admin user:**
   ```bash
   npm run create-test-user
   ```
   This will create a test admin user with email `admin@test.com` and provide you with a TOTP secret to add to Google Authenticator.

3. **Start the server:**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:8000`

4. **Verify the server is running:**
   Visit `http://localhost:8000/health` in your browser or run:
   ```bash
   curl http://localhost:8000/health
   ```
   You should see: `{"status":"ok"}`

## Environment Variables

Create a `.env` file (optional):
```
PORT=8000
JWT_SECRET=your-secret-key-change-this-in-production
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/login` - Login with email and TOTP code
- `GET /api/auth/users/me` - Get current user
- `GET /api/auth/users` - Get all users (admin only)
- `POST /api/auth/users` - Create new user (admin only)
- `GET /api/cash-drop-app1/cash-drawer` - Get cash drawers
- `POST /api/cash-drop-app1/cash-drawer` - Create cash drawer
- `GET /api/cash-drop-app1/cash-drop` - Get cash drops
- `POST /api/cash-drop-app1/cash-drop` - Create cash drop
- `GET /api/cash-drop-app1/cash-drop-reconciler` - Get reconciliations
- `PATCH /api/cash-drop-app1/cash-drop-reconciler` - Update reconciliation

## Troubleshooting

### "Failed to fetch" error in frontend

1. **Check if the server is running:**
   ```bash
   curl http://localhost:8000/health
   ```

2. **Check if port 8000 is in use:**
   ```bash
   lsof -ti:8000
   ```

3. **Make sure the server started successfully:**
   Look for the message: `Server is running on http://localhost:8000`

4. **Check CORS configuration:**
   The server is configured to accept requests from `http://localhost:3000` and `http://127.0.0.1:3000`

### Database Issues

The database file is `db.sqlite3` in the server_nodejs directory. If you need to reset it, delete the file and restart the server (it will be recreated automatically).
