import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    this.init();
  }

  async init() {
    try {
      // Create customers table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          phone_number VARCHAR(50) UNIQUE NOT NULL,
          push_name VARCHAR(255),
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          unread_count INTEGER DEFAULT 0
        )
      `);

      // Create conversations table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'AI_ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(customer_id)
        )
      `);

      // Create messages table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
          sender VARCHAR(20) NOT NULL,
          message TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          read BOOLEAN DEFAULT FALSE
        )
      `);

      // Create indexes for better performance
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number)
      `);
      
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp)
      `);

      console.log('[Database] Tables initialized successfully');
    } catch (error) {
      console.error('[Database] Initialization error:', error);
    }
  }

  // Customer operations
  async getOrCreateCustomer(phoneNumber, pushName = null) {
    const result = await this.pool.query(`
      INSERT INTO customers (phone_number, push_name)
      VALUES ($1, $2)
      ON CONFLICT (phone_number) DO UPDATE SET
        push_name = COALESCE(NULLIF($2, ''), customers.push_name),
        last_message_time = CURRENT_TIMESTAMP
      RETURNING *
    `, [phoneNumber, pushName]);
    
    return result.rows[0];
  }

  async getAllCustomers() {
    const result = await this.pool.query(`
      SELECT 
        c.*,
        con.status as conversation_status,
        (SELECT message FROM messages WHERE conversation_id = con.id ORDER BY timestamp DESC LIMIT 1) as last_message
      FROM customers c
      LEFT JOIN conversations con ON c.id = con.customer_id
      ORDER BY c.last_message_time DESC
    `);
    return result.rows;
  }

  async getCustomer(customerId) {
    const result = await this.pool.query(`
      SELECT * FROM customers WHERE id = $1
    `, [customerId]);
    return result.rows[0];
  }

  async getCustomerByPhone(phoneNumber) {
    const result = await this.pool.query(`
      SELECT * FROM customers WHERE phone_number = $1
    `, [phoneNumber]);
    return result.rows[0];
  }

  async incrementUnreadCount(phoneNumber) {
    await this.pool.query(`
      UPDATE customers SET unread_count = unread_count + 1 
      WHERE phone_number = $1
    `, [phoneNumber]);
  }

  async resetUnreadCount(phoneNumber) {
    await this.pool.query(`
      UPDATE customers SET unread_count = 0 WHERE phone_number = $1
    `, [phoneNumber]);
  }

  // Conversation operations
  async getOrCreateConversation(customerId) {
    const result = await this.pool.query(`
      INSERT INTO conversations (customer_id, status)
      VALUES ($1, 'AI_ACTIVE')
      ON CONFLICT (customer_id) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [customerId]);
    return result.rows[0];
  }

  async getConversation(conversationId) {
    const result = await this.pool.query(`
      SELECT * FROM conversations WHERE id = $1
    `, [conversationId]);
    return result.rows[0];
  }

  async getConversationByCustomerId(customerId) {
    const result = await this.pool.query(`
      SELECT * FROM conversations WHERE customer_id = $1
    `, [customerId]);
    return result.rows[0];
  }

  async updateConversationStatus(conversationId, status) {
    await this.pool.query(`
      UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [status, conversationId]);
  }

  // Message operations
  async addMessage(conversationId, sender, message) {
    const result = await this.pool.query(`
      INSERT INTO messages (conversation_id, sender, message)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [conversationId, sender, message]);
    
    // Update conversation timestamp
    await this.pool.query(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [conversationId]);
    
    return result.rows[0];
  }

  async getMessages(conversationId, limit = 50) {
    const result = await this.pool.query(`
      SELECT * FROM messages 
      WHERE conversation_id = $1 
      ORDER BY timestamp ASC 
      LIMIT $2
    `, [conversationId, limit]);
    return result.rows;
  }

  async markMessagesAsRead(conversationId) {
    await this.pool.query(`
      UPDATE messages SET read = TRUE WHERE conversation_id = $1 AND sender = 'customer'
    `, [conversationId]);
  }

  // Get recent conversation messages for AI context
  async getConversationHistory(conversationId, limit = 10) {
    const result = await this.pool.query(`
      SELECT sender, message, timestamp 
      FROM messages 
      WHERE conversation_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `, [conversationId, limit]);
    return result.rows.reverse();
  }
}

export default new DatabaseService();
