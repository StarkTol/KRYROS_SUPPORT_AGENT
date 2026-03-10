import express from 'express';
import database from '../services/database.js';
import axios from 'axios';

const router = express.Router();

const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';

// Get conversation
router.get('/:id', async (req, res) => {
  try {
    const conversation = await database.getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await database.getMessages(req.params.id);
    const customer = await database.getCustomer(conversation.customer_id);

    res.json({
      conversation,
      messages,
      customer
    });
  } catch (error) {
    console.error('[Conversations] Get error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Agent takeover - switch from AI to human
router.post('/:id/takeover', async (req, res) => {
  try {
    const { agentName = 'Agent' } = req.body;
    const conversation = await database.getConversation(req.params.id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update conversation status
    await database.updateConversationStatus(req.params.id, 'HUMAN_ACTIVE');

    // Get customer info
    const customer = await database.getCustomer(conversation.customer_id);

    // Send takeover notification message
    const takeoverMessage = `You are now connected with ${agentName}. How may I assist you today?`;
    
    // Send message to customer
    await axios.post(`${gatewayUrl}/send-message`, {
      phone: customer.phone_number,
      message: takeoverMessage
    });

    // Store the message
    await database.addMessage(req.params.id, 'agent', takeoverMessage);

    // Emit events to dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('agent-takeover', {
        conversationId: conversation.id,
        customerId: customer.id,
        status: 'HUMAN_ACTIVE',
        message: takeoverMessage
      });

      io.emit('new-message', {
        conversationId: conversation.id,
        customerId: customer.id,
        phoneNumber: customer.phone_number,
        message: takeoverMessage,
        sender: 'agent',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      status: 'HUMAN_ACTIVE',
      message: takeoverMessage
    });
  } catch (error) {
    console.error('[Conversations] Takeover error:', error);
    res.status(500).json({ error: 'Failed to take over conversation' });
  }
});

// Resume AI - switch from human to AI
router.post('/:id/resume-ai', async (req, res) => {
  try {
    const conversation = await database.getConversation(req.params.id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update conversation status
    await database.updateConversationStatus(req.params.id, 'AI_ACTIVE');

    // Get customer info
    const customer = await database.getCustomer(conversation.customer_id);

    // Send AI resume notification
    const resumeMessage = "I've resumed automated assistance. Feel free to chat with me or request a human agent at any time.";
    
    // Send message to customer
    await axios.post(`${gatewayUrl}/send-message`, {
      phone: customer.phone_number,
      message: resumeMessage
    });

    // Store the message
    await database.addMessage(req.params.id, 'ai', resumeMessage);

    // Emit events to dashboard
    const io = req.app.get('io');
    if (io) {
      io.emit('ai-resume', {
        conversationId: conversation.id,
        customerId: customer.id,
        status: 'AI_ACTIVE',
        message: resumeMessage
      });

      io.emit('new-message', {
        conversationId: conversation.id,
        customerId: customer.id,
        phoneNumber: customer.phone_number,
        message: resumeMessage,
        sender: 'ai',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      status: 'AI_ACTIVE',
      message: resumeMessage
    });
  } catch (error) {
    console.error('[Conversations] Resume AI error:', error);
    res.status(500).json({ error: 'Failed to resume AI' });
  }
});

export default router;
