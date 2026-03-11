import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Routes
import customersRouter from './routes/customers.js';
import messagesRouter from './routes/messages.js';
import conversationsRouter from './routes/conversations.js';
import whatsappRouter from './routes/whatsapp.js';

// Database initialization (import to run init)
import './services/database.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with production CORS
const io = new Server(httpServer, {
  cors: {
    origin: ['https://supportagentdashboard.onrender.com', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: ['https://supportagentdashboard.onrender.com', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

// Make io accessible to routes
app.set('io', io);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'app-backend',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/customers', customersRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/conversations', conversationsRouter);

// Get WhatsApp connection status (proxy to gateway)
app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const axios = (await import('axios')).default;
    const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'https://supportagentgateway.onrender.com';
    const response = await axios.get(`${gatewayUrl}/connection-status`);
    res.json(response.data);
  } catch (error) {
    res.json({ status: 'unavailable', error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });

  // Handle typing events
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });

  // Handle read receipts
  socket.on('read', (data) => {
    socket.broadcast.emit('read', data);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🚀 Kryros Application Backend Started            ║
║                                                           ║
║   Service: Application Backend                            ║
║   Port: ${PORT}                                              ║
║   Status: Running                                          ║
║                                                           ║
║   API Endpoints:                                           ║
║   - GET  /health                                          ║
║   - GET  /api/customers                                   ║
║   - GET  /api/customers/:id                               ║
║   - GET  /api/conversations/:id                          ║
║   - POST /api/conversations/:id/takeover                 ║
║   - POST /api/conversations/:id/resume-ai                ║
║   - POST /api/messages/send                               ║
║   - POST /api/messages/receive                            ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export { app, io };
