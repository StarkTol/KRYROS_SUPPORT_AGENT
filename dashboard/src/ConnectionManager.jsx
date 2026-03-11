import { useState, useEffect } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://supportagentbackend.onrender.com'

function ConnectionManager({ connectionStatus }) {
  const [qrCode, setQrCode] = useState('')

  const fetchQrCode = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/whatsapp/qr-code`)
      setQrCode(response.data.qr)
    } catch (error) {
      console.error('Error fetching QR code:', error)
    }
  }

  const handleReconnect = async () => {
    try {
      await axios.post(`${API_URL}/api/whatsapp/reconnect`)
    } catch (error) {
      console.error('Error reconnecting:', error)
    }
  }

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_URL}/api/whatsapp/disconnect`)
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  useEffect(() => {
    if (connectionStatus === 'close') {
      const timer = setInterval(fetchQrCode, 2000)
      return () => clearInterval(timer)
    }
  }, [connectionStatus])

  return (
    <div className="connection-manager">
      {connectionStatus === 'open' ? (
        <button onClick={handleDisconnect} className="btn btn-danger">Disconnect</button>
      ) : (
        <div>
          {qrCode ? (
            <div className="qr-code">
              <img src={qrCode} alt="QR Code" />
              <p>Scan this QR code with your WhatsApp app</p>
            </div>
          ) : (
            <button onClick={handleReconnect} className="btn">Connect to WhatsApp</button>
          )}
        </div>
      )}
    </div>
  )
}

export default ConnectionManager
