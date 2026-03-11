import express from 'express';
import axios from 'axios';

const router = express.Router();
const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'https://supportagentgateway.onrender.com';

router.get('/status', async (req, res) => {
  try {
    const response = await axios.get(`${gatewayUrl}/connection-status`);
    res.json(response.data);
  } catch (error) {
    res.json({ status: 'unavailable', error: error.message });
  }
});

router.get('/qr-code', async (req, res) => {
  try {
    const response = await axios.get(`${gatewayUrl}/qr-code`);
    res.json(response.data);
  } catch (error) {
    res.json({ qr: null, error: error.message });
  }
});

router.post('/reconnect', async (req, res) => {
  try {
    await axios.post(`${gatewayUrl}/reconnect`);
    res.status(200).json({ message: 'Reconnect initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await axios.post(`${gatewayUrl}/disconnect`);
    res.status(200).json({ message: 'Disconnect initiated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
