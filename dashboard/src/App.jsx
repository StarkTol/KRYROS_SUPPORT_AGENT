import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import axios from 'axios'
import { format } from 'date-fns'

// Production URLs
const API_URL = import.meta.env.VITE_API_URL || 'https://supportagentbackend.onrender.com'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://supportagentbackend.onrender.com'

// Initialize socket
const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling']
})

import ConnectionManager from './ConnectionManager'

function App() {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [messages, setMessages] = useState([])
  const [conversation, setConversation] = useState(null)
  const [messageInput, setMessageInput] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  // Load customers on mount
  useEffect(() => {
    fetchCustomers()
    fetchConnectionStatus()

    // Socket event listeners
    socket.on('new-message', (data) => {
      if (selectedCustomer && data.phoneNumber === selectedCustomer.phone_number) {
        setMessages(prev => [...prev, {
          sender: data.sender,
          message: data.message,
          timestamp: data.timestamp || new Date().toISOString()
        }])
      }
      fetchCustomers()
    })

    socket.on('message-sent', (data) => {
      if (selectedCustomer && data.phoneNumber === selectedCustomer.phone_number) {
        setMessages(prev => [...prev, {
          sender: data.sender,
          message: data.message,
          timestamp: data.timestamp || new Date().toISOString()
        }])
      }
    })

    socket.on('connection-status', (status) => {
      setConnectionStatus(status)
    })

    socket.on('agent-takeover', (data) => {
      if (conversation && data.conversationId === conversation.id) {
        setConversation(prev => ({ ...prev, status: 'HUMAN_ACTIVE' }))
      }
      fetchCustomers()
    })

    socket.on('ai-resume', (data) => {
      if (conversation && data.conversationId === conversation.id) {
        setConversation(prev => ({ ...prev, status: 'AI_ACTIVE' }))
      }
      fetchCustomers()
    })

    // Poll for connection status
    const statusInterval = setInterval(fetchConnectionStatus, 5000)

    return () => {
      socket.off('new-message')
      socket.off('message-sent')
      socket.off('connection-status')
      socket.off('agent-takeover')
      socket.off('ai-resume')
      clearInterval(statusInterval)
    }
  }, [selectedCustomer, conversation])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/customers`)
      setCustomers(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching customers:', error)
      setLoading(false)
    }
  }

  const fetchConnectionStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/whatsapp/status`)
      setConnectionStatus(response.data.status || 'disconnected')
    } catch (error) {
      setConnectionStatus('disconnected')
    }
  }

  const selectCustomer = async (customer) => {
    try {
      const response = await axios.get(`${API_URL}/api/customers/${customer.id}/conversation`)
      setSelectedCustomer(response.data.customer)
      setConversation(response.data.conversation)
      setMessages(response.data.messages || [])
    } catch (error) {
      console.error('Error fetching conversation:', error)
    }
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !conversation) return

    try {
      await axios.post(`${API_URL}/api/messages/send`, {
        phoneNumber: selectedCustomer.phone_number,
        message: messageInput,
        sender: 'agent',
        conversationId: conversation.id
      })
      setMessageInput('')
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleTakeover = async () => {
    if (!conversation) return

    try {
      await axios.post(`${API_URL}/api/conversations/${conversation.id}/takeover`, {
        agentName: 'Support Agent'
      })
      setConversation(prev => ({ ...prev, status: 'HUMAN_ACTIVE' }))
    } catch (error) {
      console.error('Error taking over:', error)
    }
  }

  const handleResumeAI = async () => {
    if (!conversation) return

    try {
      await axios.post(`${API_URL}/api/conversations/${conversation.id}/resume-ai`)
      setConversation(prev => ({ ...prev, status: 'AI_ACTIVE' }))
    } catch (error) {
      console.error('Error resuming AI:', error)
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    try {
      return format(new Date(timestamp), 'HH:mm')
    } catch {
      return ''
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    try {
      return format(new Date(timestamp), 'MMM d, yyyy')
    } catch {
      return ''
    }
  }

  const getInitials = (phone) => {
    return phone ? phone.slice(-4) : '??'
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">Kryros Chat</div>
        </div>
        <div className="header-right">
          <ConnectionManager 
            connectionStatus={connectionStatus} 
            onStatusChange={setConnectionStatus} 
            socket={socket}
          />
        </div>
      </header>

      {/* Main Container */}
      <div className="main-container">
        {/* Chat List */}
        <div className="chat-list">
          <div className="chat-list-header">
            <h2>Conversations ({customers.length})</h2>
          </div>
          <div className="chat-items">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className={`chat-item ${selectedCustomer?.id === customer.id ? 'active' : ''}`}
                onClick={() => selectCustomer(customer)}
              >
                <div className="chat-avatar">{getInitials(customer.phone_number)}</div>
                <div className="chat-info">
                  <div className="chat-info-header">
                    <span className="chat-phone">+{customer.phone_number}</span>
                    <span className="chat-time">
                      {customer.last_message_time ? formatTime(customer.last_message_time) : ''}
                    </span>
                  </div>
                  <div className="chat-preview">
                    <span className="chat-last-message">
                      {customer.last_message || 'No messages yet'}
                    </span>
                    {customer.unread_count > 0 && (
                      <span className="unread-badge">{customer.unread_count}</span>
                    )}
                  </div>
                  {customer.conversation_status && (
                    <span className={`status-badge ${customer.conversation_status === 'AI_ACTIVE' ? 'ai' : 'human'}`}>
                      {customer.conversation_status === 'AI_ACTIVE' ? 'AI' : 'Human'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {customers.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <p>No conversations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Window */}
        <div className="chat-window">
          {selectedCustomer ? (
            <>
              <div className="chat-window-header">
                <div className="chat-window-info">
                  <h3>+{selectedCustomer.phone_number}</h3>
                  <p>
                    Status: {conversation?.status === 'AI_ACTIVE' ? 'AI Active' : 'Human Agent'}
                  </p>
                </div>
                <div className="chat-window-actions">
                  {conversation?.status === 'AI_ACTIVE' ? (
                    <button className="btn btn-takeover" onClick={handleTakeover}>
                      Take Over
                    </button>
                  ) : (
                    <button className="btn btn-ai" onClick={handleResumeAI}>
                      Resume AI
                    </button>
                  )}
                </div>
              </div>

              <div className="messages-container">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.sender}`}>
                    <div className="message-bubble">
                      {msg.sender !== 'customer' && (
                        <div className="message-sender">
                          {msg.sender === 'ai' ? 'AI Assistant' : 'Agent'}
                        </div>
                      )}
                      <div className="message-text">{msg.message}</div>
                      <div className="message-time">{formatTime(msg.timestamp)}</div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button className="btn-send" onClick={sendMessage}>
                  Send
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <h3>Select a conversation</h3>
              <p>Choose a customer from the list to start chatting</p>
            </div>
          )}
        </div>

        {/* Customer Info Panel */}
        {selectedCustomer && (
          <div className="customer-info">
            <div className="customer-info-header">
              <div className="customer-avatar-large">
                {getInitials(selectedCustomer.phone_number)}
              </div>
              <h3>+{selectedCustomer.phone_number}</h3>
              <p>{selectedCustomer.push_name || 'Unknown'}</p>
            </div>
            <div className="customer-details">
              <div className="detail-item">
                <span className="detail-label">First Seen</span>
                <span className="detail-value">
                  {selectedCustomer.first_seen ? formatDate(selectedCustomer.first_seen) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last Message</span>
                <span className="detail-value">
                  {selectedCustomer.last_message_time ? formatTime(selectedCustomer.last_message_time) : '-'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  {conversation?.status === 'AI_ACTIVE' ? 'AI Active' : 'Human Agent'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Unread</span>
                <span className="detail-value">{selectedCustomer.unread_count || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
