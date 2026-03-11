import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = 'https://supportagentbackend.onrender.com'

function ConnectionManager({ connectionStatus, onStatusChange }) {
  const [qrCode, setQRCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [error, setError] = useState(null)

  console.log('ConnectionManager rendering, status:', connectionStatus)

  const fetchQRCode = async () => {
    console.log('Fetching QR code...')
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_URL}/api/whatsapp/qr-code`)
      console.log('QR response:', response.data)
      if (response.data.qr) {
        setQRCode(response.data.qr)
        setShowQR(true)
      }
      if (response.data.status) {
        onStatusChange(response.data.status)
      }
    } catch (err) {
      console.error('Error fetching QR:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReconnect = async () => {
    console.log('Reconnecting...')
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post(`${API_URL}/api/whatsapp/reconnect`)
      console.log('Reconnect response:', response.data)
      await fetchQRCode()
    } catch (err) {
      console.error('Error reconnecting:', err)
      setError(err.message)
    } finally {
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
    } catch (err) {
      console.error('Error disconnecting:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <button
        onClick={connectionStatus === 'open' ? handleDisconnect : handleReconnect}
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
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: '20px', color: '#333' }}>Scan QR Code with WhatsApp</h3>
            <img 
              src={qrCode} 
              alt="QR Code" 
              style={{ 
                width: '280px', 
                height: '280px',
                border: '2px solid #ddd',
                borderRadius: '10px'
              }} 
            />
            <button 
              onClick={() => setShowQR(false)}
              style={{
                marginTop: '20px',
                padding: '12px 30px',
                background: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectionManager
