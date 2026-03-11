import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://supportagentbackend.onrender.com'

function ConnectionManager({ connectionStatus, onStatusChange, socket }) {
  const [qrCode, setQRCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (socket) {
      socket.on('qr-code', (data) => {
        console.log('QR received via socket')
        if (data.qr) {
          setQRCode(data.qr)
          setShowPanel(true)
          setLoading(false)
        }
      })

      socket.on('connection-status', (status) => {
        console.log('Status received via socket:', status)
        onStatusChange(status)
        if (status === 'open') {
          setShowPanel(false)
          setQRCode(null)
        }
      })

      socket.on('connected', () => {
        console.log('WhatsApp fully connected')
        onStatusChange('open')
        setShowPanel(false)
        setQRCode(null)
        setLoading(false)
      })
    }

    return () => {
      if (socket) {
        socket.off('qr-code')
        socket.off('connection-status')
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
        setShowPanel(false)
        setLoading(false)
        return
      }

      if (response.data.qr) {
        setQRCode(response.data.qr)
        setShowPanel(true)
        setLoading(false)
      } else if (attempt < 30) {
        setTimeout(() => fetchQRCode(attempt + 1), 2000)
      } else {
        setError('QR generation timed out. Please try Reset Session.')
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
    setShowPanel(true)
    try {
      const response = await axios.post(`${API_URL}/api/whatsapp/reconnect`, { force })
      console.log('Reconnect response:', response.data)
      
      if (response.data.qrAvailable) {
        await fetchQRCode()
      } else {
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
      setShowPanel(false)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '10px' }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: connectionStatus === 'open' ? '#25D366' : '#ff4444'
        }} />
        <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>
          {connectionStatus === 'open' ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {connectionStatus !== 'open' && (
        <button
          onClick={() => handleReconnect(true)}
          disabled={loading}
          style={{
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.3)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px'
          }}
        >
          Reset Session
        </button>
      )}

      <button
        onClick={connectionStatus === 'open' ? handleDisconnect : () => handleReconnect(false)}
        disabled={loading}
        style={{
          padding: '8px 16px',
          background: connectionStatus === 'open' ? '#ff4444' : '#ffffff',
          color: connectionStatus === 'open' ? '#ffffff' : '#128C7E',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold'
        }}
      >
        {loading ? 'Loading...' : connectionStatus === 'open' ? 'Disconnect' : 'Connect WhatsApp'}
      </button>

      {/* QR Code Side Panel */}
      {showPanel && (
        <div style={{
          position: 'fixed',
          top: '70px',
          right: '20px',
          width: '320px',
          background: 'white',
          boxShadow: '-5px 0 20px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          padding: '20px',
          zIndex: 1000,
          border: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>WhatsApp Connection</h3>
            <button 
              onClick={() => setShowPanel(false)}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}
            >
              ×
            </button>
          </div>

          {loading && !qrCode && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 15px' }}></div>
              <p style={{ color: '#666', fontSize: '14px' }}>Initializing WhatsApp...</p>
            </div>
          )}

          {error && (
            <div style={{ padding: '20px', background: '#fff5f5', color: '#d32f2f', borderRadius: '8px', fontSize: '13px', marginBottom: '15px', width: '100%' }}>
              {error}
            </div>
          )}

          {qrCode && (
            <>
              <p style={{ marginBottom: '15px', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                Scan this QR code with your WhatsApp app to link your account.
              </p>
              <div style={{ 
                padding: '15px', 
                background: '#f9f9f9', 
                borderRadius: '10px',
                border: '1px solid #eee'
              }}>
                <img 
                  src={qrCode} 
                  alt="WhatsApp QR Code" 
                  style={{ width: '240px', height: '240px', display: 'block' }} 
                />
              </div>
              <div style={{ marginTop: '20px', width: '100%' }}>
                <button 
                  onClick={() => handleReconnect(true)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#f0f0f0',
                    color: '#333',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Refresh QR Code
                </button>
              </div>
            </>
          )}

          {!loading && !qrCode && !error && (
            <p style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
              Waiting for gateway response...
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ConnectionManager
