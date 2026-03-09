import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import pool, { initDatabase } from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import cashDrawerRoutes from "./routes/cashDrawerRoutes.js";
import cashDropRoutes from "./routes/cashDropRoutes.js";
import cashDropReconcilerRoutes from "./routes/cashDropReconcilerRoutes.js";
import bankDropRoutes from "./routes/bankDropRoutes.js";
import adminSettingsRoutes from "./routes/adminSettingsRoutes.js";
import driveImageRoutes from "./routes/driveImageRoutes.js";

dotenv.config();

// Log Drive status without loading googleapis until first use
if (process.env.GOOGLE_DRIVE_ENABLED) {
  const enabled = String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase() === 'true';
  const hasCreds = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  console.log('Google Drive:', enabled && hasCreds ? 'enabled (uploads will use Drive)' : 'config incomplete (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// CORS configuration - Allow all localhost ports for development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port for development
    if (origin.match(/^http:\/\/localhost:\d+$/) || 
        origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
      return callback(null, true);
    }
    
    // In production, you should specify exact origins
    callback(null, true); // For now, allow all origins in development
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve media files
app.use('/media', express.static(path.join(__dirname, 'media')));

// Quick liveness check (no DB) - use this to confirm server is listening
app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'pong' });
});

// API routes - matching Django URL structure
app.use("/api/auth", authRoutes);
app.use("/api/cash-drop-app1/cash-drawer", cashDrawerRoutes);
app.use("/api/cash-drop-app1/cash-drop", cashDropRoutes);
app.use("/api/cash-drop-app1/cash-drop-reconciler", cashDropReconcilerRoutes);
app.use("/api/bank-drop", bankDropRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);
app.use("/api/drive-image", driveImageRoutes);

// Health check endpoint (includes database check)
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const [rows] = await pool.execute('SELECT 1 as ok');
    dbStatus = rows && rows[0] && rows[0].ok === 1 ? 'ok' : 'error';
  } catch (err) {
    dbStatus = 'error';
    console.error('Health check DB error:', err.message);
    res.status(503).json({ status: 'error', database: 'error', message: err.message });
    return;
  }
  res.json({ status: 'ok', database: dbStatus });
});

// Global error handler (must be after routes)
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  // Listen first so /ping and /health are reachable even if DB is slow or down
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Ping (no DB): http://localhost:${PORT}/ping`);
    console.log(`Health (with DB): http://localhost:${PORT}/health`);
  });

  try {
    await initDatabase();
    console.log('Database: OK');
  } catch (err) {
    console.error('Database: FAILED -', err.message || err);
    console.error('Ensure MySQL is running and .env has DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.');
    // Do not exit: server stays up so /ping works and /health returns 503
  }
}
start();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;