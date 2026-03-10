import express from 'express';
import database from '../services/database.js';

const router = express.Router();

// Get all customers
router.get('/', async (req, res) => {
  try {
    const customers = await database.getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('[Customers] Get all error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customer = await database.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    console.error('[Customers] Get one error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Get customer conversation
router.get('/:id/conversation', async (req, res) => {
  try {
    const customer = await database.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const conversation = await database.getConversationByCustomerId(customer.id);
    if (!conversation) {
      return res.json({ messages: [] });
    }

    const messages = await database.getMessages(conversation.id);
    
    // Reset unread count when conversation is opened
    await database.resetUnreadCount(customer.phone_number);
    
    res.json({
      conversation,
      messages,
      customer
    });
  } catch (error) {
    console.error('[Customers] Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Reset unread count
router.post('/:id/reset-unread', async (req, res) => {
  try {
    const customer = await database.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await database.resetUnreadCount(customer.phone_number);
    res.json({ success: true });
  } catch (error) {
    console.error('[Customers] Reset unread error:', error);
    res.status(500).json({ error: 'Failed to reset unread count' });
  }
});

export default router;
