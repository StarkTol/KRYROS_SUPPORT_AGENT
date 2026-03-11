import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from 'baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import QRCodeTerminal from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pino from 'pino';

const AUTH_DIR = './whatsapp-auth';

class WhatsAppClient {
  constructor(eventEmitter) {
    this.socket = null;
    this.eventEmitter = eventEmitter;
    this.connectionStatus = 'disconnected';
    this.qrCode = null;
    this.currentQR = null;
    this.logger = pino({ level: 'info' });
  }

  async connect() {
    try {
      console.log('[Baileys] Start connecting process...');
      
      // Ensure auth directory exists
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }

      console.log('[Baileys] Setting up auth and version...');
      let { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[Baileys] Using version v${version.join('.')}, isLatest: ${isLatest}`);

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      
      console.log('[Baileys] Initializing socket with pino logger...');
      this.socket = makeWASocket({
        version,
        logger: this.logger,
        printQRInTerminal: true,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: state,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false
      });

      // Handle credentials update
      this.socket.ev.on('creds.update', saveCreds);

      // Handle connection events
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log('[Baileys] Update:', JSON.stringify({ 
          connection, 
          hasQR: !!qr,
          statusCode: lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode
        }));

        if (qr) {
          console.log('[Baileys] New QR Code available');
          this.handleQRCode(qr);
        }

        if (connection) {
          this.connectionStatus = connection;
          this.eventEmitter.emit('connection-status', connection);
          
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 
                             lastDisconnect?.error?.statusCode || 
                             DisconnectReason.unknown;
            
            console.log('[Baileys] Connection closed. Reason:', statusCode);
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
              console.log('[Baileys] Reconnecting in 5s...');
              setTimeout(() => this.connect(), 5000);
            } else {
              console.log('[Baileys] Logged out. Manual reset needed.');
              if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
              }
              this.qrCode = null;
              this.currentQR = null;
            }
          } else if (connection === 'open') {
            console.log('[Baileys] Connected successfully');
            this.qrCode = null;
            this.currentQR = null;
            this.eventEmitter.emit('connected');
          }
        }
      });

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          const message = this.parseMessage(msg);
          if (message) await this.forwardToBackend(message);
        }
      });

    } catch (error) {
      console.error('[Baileys] Fatal connection error:', error.message);
      setTimeout(() => this.connect(), 10000);
    }
  }

  async handleQRCode(qr) {
    try {
      console.log('[Baileys] Rendering QR...');
      this.qrCode = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 400
      });
      this.currentQR = qr;
      QRCodeTerminal.generate(qr, { small: true });
      this.eventEmitter.emit('qr-code', { qr: this.qrCode });
    } catch (error) {
      console.error('[Baileys] QR Error:', error.message);
    }
  }

  parseMessage(msg) {
    if (!msg.key.remoteJid) return null;
    
    const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const messageText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption ||
                       msg.message?.videoMessage?.caption || '';
    
    const messageType = Object.keys(msg.message || {})[0] || 'unknown';
    
    return {
      id: msg.key.id,
      phoneNumber,
      message: messageText,
      type: messageType,
      timestamp: msg.messageTimestamp,
      fromMe: msg.key.fromMe,
      pushName: msg.pushName || phoneNumber
    };
  }

    async forwardToBackend(message) {
    try {
      const backendUrl = process.env.APP_BACKEND_URL || 'https://supportagentbackend.onrender.com';
      await axios.post(`${backendUrl}/api/messages/receive`, message);
      this.eventEmitter.emit('new-message', message);
    } catch (error) {
      console.error('[Baileys] Forward to backend error:', error.message);
    }
  }

  async sendMessage(phoneNumber, messageText) {
    if (!this.socket || this.connectionStatus !== 'open') {
      throw new Error('WhatsApp not connected');
    }

    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      const result = await this.socket.sendMessage(jid, { text: messageText });
      
      return {
        id: result.key.id,
        status: 'sent'
      };
    } catch (error) {
      console.error('[Baileys] Send message error:', error);
      throw error;
    }
  }

  async sendTyping(phoneNumber) {
    if (!this.socket || this.connectionStatus !== 'open') return;
    
    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      await this.socket.sendPresenceUpdate('composing', jid);
    } catch (error) {
      console.error('[Baileys] Send typing error:', error);
    }
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  getQRCode() {
    return this.qrCode;
  }

  async disconnect() {
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
      this.connectionStatus = 'disconnected';
    }
  }
}

export default WhatsAppClient;
