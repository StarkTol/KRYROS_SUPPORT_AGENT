import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
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

const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'https://supportagentgateway.onrender.com';

// Socket.IO setup with production CORS
const io = new Server(httpServer, {
  cors: {
    origin: ['https://supportagentdashboard.onrender.com', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Bridge events from WhatsApp Gateway to Dashboard
console.log('[Socket.IO] Connecting to Gateway:', gatewayUrl);
const gatewaySocket = ioClient(gatewayUrl, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 45000,
  autoConnect: true
});

gatewaySocket.on('connect', () => {
  console.log('[Socket.IO] Connected to WhatsApp Gateway');
});

gatewaySocket.on('qr-code', (data) => {
  console.log('[Socket.IO] Received QR code from Gateway');
  io.emit('qr-code', data);
});

gatewaySocket.on('connection-status', (status) => {
  console.log('[Socket.IO] Received connection status from Gateway:', status);
  io.emit('connection-status', status);
});

gatewaySocket.on('connected', () => {
  console.log('[Socket.IO] WhatsApp fully connected');
  io.emit('connected');
});

gatewaySocket.on('new-message', (data) => {
  console.log('[Socket.IO] Received new message from Gateway');
  io.emit('new-message', data);
});

gatewaySocket.on('connect_error', (error) => {
  console.error('[Socket.IO] Gateway connection error:', error.message);
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
app.use('/api/whatsapp', whatsappRouter);

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
