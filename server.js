import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/authRoutes.js";
import cashDrawerRoutes from "./routes/cashDrawerRoutes.js";
import cashDropRoutes from "./routes/cashDropRoutes.js";
import cashDropReconcilerRoutes from "./routes/cashDropReconcilerRoutes.js";
import bankDropRoutes from "./routes/bankDropRoutes.js";

dotenv.config();

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

// API routes - matching Django URL structure
app.use("/api/auth", authRoutes);
app.use("/api/cash-drop-app1/cash-drawer", cashDrawerRoutes);
app.use("/api/cash-drop-app1/cash-drop", cashDropRoutes);
app.use("/api/cash-drop-app1/cash-drop-reconciler", cashDropReconcilerRoutes);
app.use("/api/bank-drop", bankDropRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler (must be after routes)
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;