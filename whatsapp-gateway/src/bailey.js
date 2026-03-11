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

const AUTH_DIR = './whatsapp-auth';

class WhatsAppClient {
  constructor(eventEmitter) {
    this.socket = null;
    this.eventEmitter = eventEmitter;
    this.connectionStatus = 'disconnected';
    this.qrCode = null;
    this.currentQR = null;
  }

  async connect() {
    try {
      // Ensure auth directory exists
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }

      console.log('[Baileys] Setting up auth and version...');
      let version = [2, 3000, 1015901307]; // Fallback version
      try {
        const latest = await fetchLatestBaileysVersion();
        if (latest && latest.version) {
          version = latest.version;
          console.log(`[Baileys] Using latest version v${version.join('.')}`);
        }
      } catch (vErr) {
        console.warn('[Baileys] Could not fetch latest version, using fallback:', version.join('.'));
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      
      console.log('[Baileys] Initializing socket with extended timeouts...');
      this.socket = makeWASocket({
        version,
        printQRInTerminal: true,
        browser: ['Kryros Chat', 'Chrome', '110.0.5481.177'],
        auth: state,
        connectTimeoutMs: 120000, // 2 minutes for slow cloud starts
        qrTimeoutMs: 60000,      // QR lasts 60s
        keepAliveIntervalMs: 25000, // More frequent keep-alive for Render
        retryRequestDelayMs: 5000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: false, // Save memory/CPU
        syncFullHistory: false,               // Save memory/CPU
        markOnlineOnConnect: true,
        logger: {
          level: 'info',
          info: (m) => console.log('[Baileys-Info]', m),
          debug: (m) => console.log('[Baileys-Debug]', m),
          error: (m) => console.error('[Baileys-Error]', m),
          warn: (m) => console.warn('[Baileys-Warn]', m),
          trace: () => {},
          fatal: (m) => console.error('[Baileys-Fatal]', m),
          child: () => this.socket.logger
        }
      });
      console.log('[Baileys] Socket object created');

      // Handle credentials update
      this.socket.ev.on('creds.update', async () => {
        console.log('[Baileys] Credentials updated event received');
        await saveCreds();
      });

      console.log('[Baileys] Registered creds.update listener');

      // Handle connection events
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log('[Baileys] connection.update event:', JSON.stringify({ 
          connection, 
          hasQR: !!qr,
          error: lastDisconnect?.error?.message,
          statusCode: lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode
        }));

        if (qr) {
          console.log('[Baileys] QR code received in connection.update');
          this.handleQRCode(qr);
        }

        if (connection) {
          this.connectionStatus = connection;
          this.eventEmitter.emit('connection-status', connection);
          
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 
                             lastDisconnect?.error?.statusCode || 
                             DisconnectReason.unknown;
            
            console.log('[Baileys] Connection closed. Status Code:', statusCode);
            
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('[Baileys] Should reconnect?', shouldReconnect);
            
            if (shouldReconnect) {
              const delay = 5000;
              console.log(`[Baileys] Reconnecting in ${delay/1000}s...`);
              setTimeout(() => this.connect(), delay);
            } else {
              console.log('[Baileys] Logged out. Clearing auth directory...');
              if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
              }
              this.qrCode = null;
              this.currentQR = null;
            }
          } else if (connection === 'open') {
            console.log('[Baileys] Connection established successfully');
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
          if (message) {
            await this.forwardToBackend(message);
          }
        }
      });

    } catch (error) {
      console.error('[Baileys] Connection error:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async handleQRCode(qr) {
    try {
      console.log('[Baileys] Generating data URL for QR...');
      // Generate QR code as data URL
      this.qrCode = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 400
      });
      this.currentQR = qr;
      
      console.log('[Baileys] QR Data URL generated length:', this.qrCode.length);
      
      // Display QR in terminal
      QRCodeTerminal.generate(qr, { small: true });
      
      // Emit QR code event
      this.eventEmitter.emit('qr-code', {
        qr: this.qrCode,
        qrString: qr
      });
    } catch (error) {
      console.error('[Baileys] QR generation error:', error);
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
