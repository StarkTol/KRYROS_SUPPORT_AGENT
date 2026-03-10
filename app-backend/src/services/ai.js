import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

class AIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.systemPrompt = `You are a professional customer support assistant for Kryros, a technology company. 
Your role is to help customers with their inquiries, answer questions about products and services, 
and provide excellent customer service.

Guidelines:
- Be friendly, professional, and helpful
- Keep responses concise but informative
- If you don't know something, be honest and offer to connect them with a human agent
- Use the conversation context to provide relevant responses
- Always maintain a positive attitude

If the customer wants to speak with a human, acknowledge their request and let them know a human agent will be with them shortly.`;

    this.humanRequestKeywords = [
      'want to speak with a human',
      'want to talk to a human',
      'agent please',
      'talk to support',
      'speak to someone',
      'talk to a human',
      'human please',
      'connect me to agent',
      'need human help',
      'speak with an agent'
    ];
  }

  checkForHumanRequest(message) {
    const lowerMessage = message.toLowerCase();
    return this.humanRequestKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
  }

  buildConversationContext(messages) {
    if (!messages || messages.length === 0) {
      return '';
    }

    return messages.map(msg => {
      const role = msg.sender === 'customer' ? 'Customer' : 
                   msg.sender === 'ai' ? 'Assistant' : 'Agent';
      return `${role}: ${msg.message}`;
    }).join('\n');
  }

  async generateResponse(customerMessage, conversationHistory = []) {
    try {
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt
        }
      ];

      // Add conversation history for context
      if (conversationHistory.length > 0) {
        const context = this.buildConversationContext(conversationHistory);
        messages.push({
          role: 'system',
          content: `Previous conversation:\n${context}`
        });
      }

      // Add current customer message
      messages.push({
        role: 'user',
        content: customerMessage
      });

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      return response.choices[0]?.message?.content || 
        'I apologize, but I could not generate a response. Please try again.';
    } catch (error) {
      console.error('[AI] Error generating response:', error.message);
      
      // Return fallback message on error
      return 'Thank you for your message. A human agent will be with you shortly to assist you better.';
    }
  }

  async generateGreeting() {
    return "Hello! Welcome to Kryros support. How can I help you today?";
  }

  async generateHumanHandoffMessage() {
    return "I understand you'd like to speak with a human agent. Please wait a moment while I connect you with one of our team members who will be happy to assist you.";
  }

  async generateAgentResponse(customerMessage, agentName, conversationHistory = []) {
    // When agent is actively responding, we don't use AI
    // This is just a placeholder if you want agent-assist suggestions
    try {
      const messages = [
        {
          role: 'system',
          content: `You are helping a human agent named ${agentName} at Kryros customer support. 
Provide helpful suggestions if needed, but the agent will type their own response.`
        }
      ];

      if (conversationHistory.length > 0) {
        const context = this.buildConversationContext(conversationHistory);
        messages.push({
          role: 'system',
          content: `Conversation history:\n${context}`
        });
      }

      messages.push({
        role: 'user',
        content: `Customer asked: ${customerMessage}`
      });

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 200,
        temperature: 0.5
      });

      return response.choices[0]?.message?.content;
    } catch (error) {
      console.error('[AI] Agent assist error:', error.message);
      return null;
    }
  }
}

export default new AIService();
