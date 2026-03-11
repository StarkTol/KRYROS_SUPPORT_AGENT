import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { EventEmitter } from 'events';
import WhatsAppClient from './bailey.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['https://supportagentbackend.onrender.com', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

// Middleware
app.use(cors({
  origin: ['https://supportagentbackend.onrender.com', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Event emitter for WhatsApp events
const waEmitter = new EventEmitter();

// WhatsApp client instance
let waClient = null;
const AUTH_DIR = './whatsapp-auth';

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'whatsapp-gateway',
    timestamp: new Date().toISOString()
  });
});

app.get('/connection-status', (req, res) => {
  if (!waClient) {
    return res.json({ status: 'disconnected', message: 'Client not initialized' });
  }
  res.json({ status: waClient.getConnectionStatus() });
});

app.get('/qr-code', (req, res) => {
  const qr = waClient?.getQRCode();
  if (qr) {
    res.json({ qr, status: 'waiting' });
  } else {
    res.json({ qr: null, status: waClient?.getConnectionStatus() || 'disconnected' });
  }
});

app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  
  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message are required' });
  }

  try {
    // Send typing indicator
    await waClient.sendTyping(phone);
    
    // Send the message
    const result = await waClient.sendMessage(phone, message);
    
    // Emit message sent event
    io.emit('message-sent', { phone, message, id: result.id });
    
    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    await waClient.disconnect();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/reconnect', async (req, res) => {
  try {
    const { force = false } = req.body;
    console.log(`[Gateway] Reconnecting WhatsApp (force: ${force})...`);
    
    // Ensure auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    if (waClient) {
      try {
        console.log('[Gateway] Disconnecting existing client...');
        await waClient.disconnect();
      } catch (e) {
        console.warn('[Gateway] Disconnect error:', e.message);
      }
    }

    if (force) {
      try {
        if (fs.existsSync(AUTH_DIR)) {
          console.log('[Gateway] Clearing auth directory for fresh session');
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
      } catch (err) {
        console.warn('[Gateway] Warning: Could not clear auth directory:', err.message);
      }
    }
    
    // Create new client if it doesn't exist
    if (!waClient) {
      console.log('[Gateway] Initializing new WhatsApp client...');
      waClient = new WhatsAppClient(waEmitter);
    }
    
    // Listen for events once
    waEmitter.removeAllListeners('qr-code');
    waEmitter.removeAllListeners('connection-status');
    waEmitter.removeAllListeners('connected');
    waEmitter.removeAllListeners('new-message');

    waEmitter.on('qr-code', (data) => io.emit('qr-code', data));
    waEmitter.on('connection-status', (status) => io.emit('connection-status', status));
    waEmitter.on('connected', () => io.emit('connected'));
    waEmitter.on('new-message', (data) => io.emit('new-message', data));

    // Connect and wait a bit for QR code
    console.log('[Gateway] Starting WhatsApp connection...');
    waClient.connect();
    
    // Wait for QR code to be generated (initial window)
    let qrGenerated = false;
    const qrTimeout = setTimeout(() => {
      if (!qrGenerated) {
        console.log('[Gateway] QR code not generated within initial 10s');
      }
    }, 10000);

    waEmitter.once('qr-code', () => {
      qrGenerated = true;
      clearTimeout(qrTimeout);
    });
    
    res.json({ success: true, message: 'Connection sequence started...' });
  } catch (error) {
    console.error('[Gateway] Reconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO handling
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  // Send current connection status to new clients
  if (waClient) {
    socket.emit('connection-status', waClient.getConnectionStatus());
    
    const qr = waClient.getQRCode();
    if (qr) {
      socket.emit('qr-code', { qr });
    }
  }

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});

// Forward WhatsApp events to Socket.IO
waEmitter.on('connection-status', (status) => {
  io.emit('connection-status', status);
  console.log('[Gateway] Connection status:', status);
});

waEmitter.on('qr-code', (data) => {
  io.emit('qr-code', data);
  console.log('[Gateway] QR Code available');
});

waEmitter.on('new-message', (message) => {
  io.emit('new-message', message);
  console.log('[Gateway] New message from:', message.phoneNumber);
});

waEmitter.on('connected', () => {
  io.emit('connected');
  console.log('[Gateway] WhatsApp connected');
});

// Initialize WhatsApp client
async function initializeWhatsApp() {
  waClient = new WhatsAppClient(waEmitter);
  await waClient.connect();
}

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          🚀 Kryros WhatsApp Gateway Started               ║
║                                                           ║
║   Service: WhatsApp Gateway                               ║
║   Port: ${PORT}                                              ║
║   Status: Initializing...                                  ║
║                                                           ║
║   Scan the QR code to connect WhatsApp                    ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  initializeWhatsApp().catch(console.error);
});

export { app, io, waEmitter };
