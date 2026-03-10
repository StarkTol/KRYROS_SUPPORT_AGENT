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

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      this.socket = makeWASocket({
        print: (message) => console.log('[Baileys]', message),
        browser: ['Kryros Chat', 'Chrome', '120.0.0'],
        auth: state,
        version,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
      });

      // Handle credentials update
      this.socket.ev.on('creds.update', saveCreds);

      // Handle connection events
      this.socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.handleQRCode(qr);
        }

        if (connection) {
          this.connectionStatus = connection;
          this.eventEmitter.emit('connection-status', connection);
          
          if (connection === 'close') {
            const reason = lastDisconnect?.error
              ? new Boom(lastDisconnect.error).output.statusCode
              : DisconnectReason.unknown;
            
            console.log('[Baileys] Connection closed:', DisconnectReason[reason]);
            
            // Reconnect if not logged out
            if (reason !== DisconnectReason.loggedOut) {
              this.connect();
            }
          } else if (connection === 'open') {
            console.log('[Baileys] Connected to WhatsApp');
            this.qrCode = null;
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
      // Generate QR code as data URL
      this.qrCode = await qrcode.toDataURL(qr);
      this.currentQR = qr;
      
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
      const backendUrl = process.env.APP_BACKEND_URL || 'http://localhost:3000';
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
