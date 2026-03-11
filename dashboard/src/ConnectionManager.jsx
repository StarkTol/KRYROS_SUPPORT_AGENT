import { useState } from 'react'
import axios from 'axios'

const API_URL = 'https://supportagentbackend.onrender.com'

function ConnectionManager({ connectionStatus, onStatusChange }) {
  const [showQR, setShowQR] = useState(false)
  const [qrCode, setQRCode] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchQRCode = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/api/whatsapp/qr-code`)
      if (response.data.qr) {
        setQRCode(response.data.qr)
        setShowQR(true)
      }
      onStatusChange(response.data.status)
    } catch (error) {
      console.error('Error fetching QR:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReconnect = async () => {
    try {
      setLoading(true)
      await axios.post(`${API_URL}/api/whatsapp/reconnect`)
      await fetchQRCode()
    } catch (error) {
      console.error('Error reconnecting:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setLoading(true)
      await axios.post(`${API_URL}/api/whatsapp/disconnect`)
      onStatusChange('disconnected')
    } catch (error) {
      console.error('Error disconnecting:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      {connectionStatus === 'disconnected' ? (
        <button 
          onClick={handleReconnect}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: '#25D366',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? 'Connecting...' : 'Connect WhatsApp'}
        </button>
      ) : (
        <button 
          onClick={handleDisconnect}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: '#ff4444',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? 'Processing...' : 'Disconnect'}
        </button>
      )}
      
      {showQR && qrCode && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          padding: '20px',
          borderRadius: '10px',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          <h3 style={{ marginBottom: '15px', textAlign: 'center' }}>Scan QR Code</h3>
          <img src={qrCode} alt="QR Code" style={{ maxWidth: '300px' }} />
          <button 
            onClick={() => setShowQR(false)}
            style={{
              marginTop: '15px',
              width: '100%',
              padding: '10px',
              background: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

export default ConnectionManager
