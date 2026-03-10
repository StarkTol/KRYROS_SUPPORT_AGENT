import express from 'express';
import axios from 'axios';
import database from '../services/database.js';
import aiService from '../services/ai.js';

const router = express.Router();

const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';

// Receive message from WhatsApp Gateway
router.post('/receive', async (req, res) => {
  try {
    const { phoneNumber, message, pushName, type, timestamp } = req.body;
    
    console.log('[Messages] Received from:', phoneNumber, 'Message:', message);

    // Get or create customer
    const customer = await database.getOrCreateCustomer(phoneNumber, pushName);
    
    // Get or create conversation
    const conversation = await database.getOrCreateConversation(customer.id);
    
    // Store customer message
    await database.addMessage(conversation.id, 'customer', message);
    
    // Increment unread count
    await database.incrementUnreadCount(phoneNumber);
    
    // Emit to dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('new-message', {
        customerId: customer.id,
        phoneNumber,
        message,
        sender: 'customer',
        timestamp: new Date().toISOString()
      });
    }

    // Check if AI should respond
    if (conversation.status === 'AI_ACTIVE') {
      // Check for human request
      const wantsHuman = aiService.checkForHumanRequest(message);
      
      if (wantsHuman) {
        // Send human handoff message
        const handoffMessage = await aiService.generateHumanHandoffMessage();
        await sendWhatsAppMessage(phoneNumber, handoffMessage, conversation.id);
        
        // Emit takeover event
        if (io) {
          io.emit('agent-takeover', {
            customerId: customer.id,
            conversationId: conversation.id,
            reason: 'customer_request'
          });
        }
      } else {
        // Generate AI response
        await handleAIResponse(conversation.id, phoneNumber, message, customer.id);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Messages] Receive error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Send message (from agent or AI)
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, message, sender = 'agent', conversationId } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    // Send to WhatsApp
    const result = await sendWhatsAppMessage(phoneNumber, message, conversationId);
    
    // Store message in database
    if (conversationId) {
      await database.addMessage(conversationId, sender, message);
    }

    // Emit to dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('message-sent', {
        conversationId,
        phoneNumber,
        message,
        sender,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('[Messages] Send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Helper function to send message via WhatsApp Gateway
async function sendWhatsAppMessage(phoneNumber, message, conversationId) {
  try {
    const response = await axios.post(`${gatewayUrl}/send-message`, {
      phone: phoneNumber,
      message: message
    });
    return response.data;
  } catch (error) {
    console.error('[Messages] WhatsApp send error:', error.message);
    throw error;
  }
}

// Handle AI response generation
async function handleAIResponse(conversationId, phoneNumber, customerMessage, customerId) {
  try {
    // Get conversation history for context
    const history = await database.getConversationHistory(conversationId, 10);
    
    // Generate AI response
    const aiResponse = await aiService.generateResponse(customerMessage, history);
    
    // Send to WhatsApp
    await sendWhatsAppMessage(phoneNumber, aiResponse, conversationId);
    
    // Store AI message in database
    await database.addMessage(conversationId, 'ai', aiResponse);
    
    // Emit to dashboard
    const io = global.io;
    if (io) {
      io.emit('new-message', {
        conversationId,
        customerId,
        phoneNumber,
        message: aiResponse,
        sender: 'ai',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Messages] AI response error:', error);
  }
}

// Get messages for a conversation
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const messages = await database.getMessages(req.params.conversationId);
    res.json(messages);
  } catch (error) {
    console.error('[Messages] Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;
