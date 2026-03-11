import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://supportagentbackend.onrender.com'

function ConnectionManager({ connectionStatus, onStatusChange, socket }) {
  const [qrCode, setQRCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (socket) {
      socket.on('qr-code', (data) => {
        console.log('QR received via socket')
        if (data.qr) {
          setQRCode(data.qr)
          setShowQR(true)
          setLoading(false)
        }
      })

      socket.on('connected', () => {
        console.log('WhatsApp connected')
        onStatusChange('open')
        setShowQR(false)
        setQRCode(null)
        setLoading(false)
      })
    }

    return () => {
      if (socket) {
        socket.off('qr-code')
        socket.off('connected')
      }
    }
  }, [socket, onStatusChange])

  const fetchQRCode = async (attempt = 1) => {
    console.log(`Fetching QR code... (Attempt ${attempt})`)
    try {
      const response = await axios.get(`${API_URL}/api/whatsapp/qr-code`)
      console.log('QR response:', response.data)
      
      if (response.data.status === 'open') {
        onStatusChange('open')
        setShowQR(false)
        setLoading(false)
        return
      }

      if (response.data.qr) {
        setQRCode(response.data.qr)
        setShowQR(true)
        setLoading(false)
      } else if (attempt < 30) {
        // Poll for 60 seconds total (30 * 2s)
        setTimeout(() => fetchQRCode(attempt + 1), 2000)
      } else {
        setError('QR generation timed out. Please try again.')
        setLoading(false)
      }
    } catch (err) {
      console.error('Error fetching QR:', err)
      setError('Connection failed. Please check backend.')
      setLoading(false)
    }
  }

  const handleReconnect = async (force = false) => {
    console.log(`Reconnecting... (force: ${force})`)
    setLoading(true)
    setError(null)
    setQRCode(null)
    try {
      const response = await axios.post(`${API_URL}/api/whatsapp/reconnect`, { force })
      console.log('Reconnect response:', response.data)
      
      if (response.data.qrAvailable) {
        await fetchQRCode()
      } else {
        // Wait a bit longer for initial generation
        setTimeout(() => fetchQRCode(), 3000)
      }
    } catch (err) {
      console.error('Error reconnecting:', err)
      setError('Failed to initiate connection.')
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    console.log('Disconnecting...')
    setLoading(true)
    setError(null)
    try {
      await axios.post(`${API_URL}/api/whatsapp/disconnect`)
      onStatusChange('disconnected')
      setShowQR(false)
      setQRCode(null)
    } catch (err) {
      console.error('Error disconnecting:', err)
      setError('Failed to disconnect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      {connectionStatus !== 'open' && (
        <button
          onClick={() => handleReconnect(true)}
          disabled={loading}
          style={{
            padding: '8px 16px',
            background: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'normal'
          }}
          title="Force a new QR code by clearing existing session"
        >
          Reset Session
        </button>
      )}

      <button
        onClick={connectionStatus === 'open' ? handleDisconnect : () => handleReconnect(false)}
        disabled={loading}
        style={{
          padding: '8px 16px',
          background: connectionStatus === 'open' ? '#ff4444' : '#25D366',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold'
        }}
      >
        {loading ? 'Loading...' : connectionStatus === 'open' ? 'Disconnect' : 'Connect WhatsApp'}
      </button>

      {error && (
        <span style={{ color: 'red', fontSize: '12px' }}>{error}</span>
      )}

      {showQR && qrCode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '15px',
            textAlign: 'center',
            maxWidth: '400px'
          }}>
            <h3 style={{ marginBottom: '10px', color: '#333' }}>Scan QR Code with WhatsApp</h3>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Open WhatsApp on your phone, tap Menu or Settings, and select Linked Devices.
            </p>
            <img 
              src={qrCode} 
              alt="QR Code" 
              style={{ 
                width: '280px', 
                height: '280px',
                border: '1px solid #eee',
                borderRadius: '10px',
                padding: '10px'
              }} 
            />
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button 
                onClick={() => setShowQR(false)}
                style={{
                  padding: '10px 20px',
                  background: '#eee',
                  color: '#333',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button 
                onClick={() => handleReconnect(true)}
                style={{
                  padding: '10px 20px',
                  background: '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Retry Fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionManager
