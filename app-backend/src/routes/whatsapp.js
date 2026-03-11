import express from 'express';
import axios from 'axios';

const router = express.Router();

const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'https://supportagentgateway.onrender.com';

// Get connection status (proxy to gateway)
router.get('/status', async (req, res) => {
  try {
    const response = await axios.get(`${gatewayUrl}/connection-status`);
    res.json(response.data);
  } catch (error) {
    res.json({ status: 'unavailable', error: error.message });
  }
});

// Get QR code (proxy to gateway)
router.get('/qr-code', async (req, res) => {
  try {
    const response = await axios.get(`${gatewayUrl}/qr-code`);
    res.json(response.data);
  } catch (error) {
    res.json({ qr: null, status: 'unavailable', error: error.message });
  }
});

// Send message (proxy to gateway)
router.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    const response = await axios.post(`${gatewayUrl}/send-message`, { phone, message });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect (proxy to gateway)
router.post('/disconnect', async (req, res) => {
  try {
    const response = await axios.post(`${gatewayUrl}/disconnect`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reconnect (proxy to gateway)
router.post('/reconnect', async (req, res) => {
  try {
    const response = await axios.post(`${gatewayUrl}/reconnect`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
