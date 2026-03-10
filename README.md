# Kryros Chat - AI WhatsApp Customer Support System

A complete customer messaging platform that connects WhatsApp using Web automation, receives messages from customers, displays them in a web dashboard, and automatically replies using AI powered by ChatGPT API.

## Features

- **WhatsApp Connection**: Connect using Baileys library with persistent sessions
- **Real-time Messaging Dashboard**: Modern chat interface built with React
- **AI Auto Replies**: ChatGPT-powered automatic responses
- **Human Agent Takeover**: Agents can take over conversations manually
- **Conversation Management**: Track customer conversations and status
- **Persistent Sessions**: QR code only needs to be scanned once
- **Real-time Notifications**: Socket.IO for instant updates

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  WhatsApp User  │────▶│ WhatsApp Gateway │────▶│    NEON     │
│   (Customer)    │     │   (Baileys)      │     │  Database   │
└─────────────────┘     └────────┬─────────┘     └─────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  App Backend     │
                        │  (Express + IO) │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │   React Dashboard│
                        └──────────────────┘
```

## Project Structure

```
Kryros_chat/
├── whatsapp-gateway/      # Service 1: WhatsApp Connection
│   ├── src/
│   │   ├── index.js      # Main entry point
│   │   └── bailey.js     # Baileys WhatsApp handler
│   ├── package.json
│   └── .env
│
├── app-backend/           # Service 2: Application Backend
│   ├── src/
│   │   ├── index.js      # Main entry point
│   │   ├── routes/
│   │   │   ├── customers.js
│   │   │   ├── messages.js
│   │   │   └── conversations.js
│   │   └── services/
│   │       ├── ai.js     # ChatGPT integration
│   │       └── database.js
│   ├── package.json
│   └── .env
│
├── dashboard/            # React Frontend
│   ├── src/
│   │   ├── App.jsx       # Main dashboard component
│   │   ├── index.css     # Styles
│   │   └── main.jsx      # Entry point
│   ├── package.json
│   └── vite.config.js
│
└── whatsapp-auth/        # Created automatically for session storage
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL database (NEON)
- OpenAI API key

### Step 1: Clone and Install Dependencies

```bash
# Install WhatsApp Gateway dependencies
cd whatsapp-gateway
npm install

# Install App Backend dependencies
cd ../app-backend
npm install

# Install Dashboard dependencies
cd ../dashboard
npm install
```

### Step 2: Configure Environment Variables

#### whatsapp-gateway/.env
```env
PORT=3001
APP_BACKEND_URL=http://localhost:3000
```

#### app-backend/.env
```env
PORT=3000
DATABASE_URL=postgresql://user:password@host.neon.tech/db
WHATSAPP_GATEWAY_URL=http://localhost:3001
OPENAI_API_KEY=your_openai_key_here
```

### Step 3: Start the Services

```bash
# Terminal 1: Start WhatsApp Gateway
cd whatsapp-gateway
npm start

# Terminal 2: Start App Backend
cd app-backend
npm start

# Terminal 3: Start Dashboard
cd dashboard
npm run dev
```

### Step 4: Connect WhatsApp

1. Open browser to `http://localhost:5173`
2. The header will show "Disconnected" initially
3. A QR code will appear in the WhatsApp Gateway terminal
4. Scan the QR code with your WhatsApp app
5. Status will change to "Connected"

## API Endpoints

### WhatsApp Gateway (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/connection-status` | Get WhatsApp connection status |
| GET | `/qr-code` | Get QR code for authentication |
| POST | `/send-message` | Send message to customer |
| POST | `/disconnect` | Disconnect WhatsApp |
| POST | `/reconnect` | Reconnect WhatsApp |

### App Backend (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | Get all customers |
| GET | `/api/customers/:id` | Get customer details |
| GET | `/api/customers/:id/conversation` | Get customer conversation |
| POST | `/api/messages/send` | Send message |
| POST | `/api/messages/receive` | Receive message (internal) |
| POST | `/api/conversations/:id/takeover` | Agent takeover |
| POST | `/api/conversations/:id/resume-ai` | Resume AI |
| GET | `/api/whatsapp/status` | Get WhatsApp status |

## Testing Scenario

1. Start all three services
2. Scan QR code to connect WhatsApp
3. Send a message from another phone to your WhatsApp
4. Message appears in the dashboard
5. AI automatically replies
6. Customer receives reply on WhatsApp
7. Type "I want to speak with a human" or click "Take Over"
8. AI stops responding
9. Agent replies manually from dashboard

## Human Agent Takeover Logic

AI stops responding when:
- Customer says "I want to speak with a human"
- Customer says "agent please"
- Customer says "talk to support"
- Human agent clicks "Take Over" button

When takeover happens:
- Conversation status changes to `HUMAN_ACTIVE`
- Agent can send messages manually
- Click "Resume AI" to return to AI mode

## Dashboard Features

### Left Panel - Conversation List
- Customer phone number
- Last message preview
- Unread message count
- AI/Human status badge

### Center Panel - Chat Window
- Messages from customer, AI, and agent
- Real-time message updates
- Send message input

### Right Panel - Customer Info
- Phone number
- First seen date
- Last message time
- Conversation status
- Unread count

## License

MIT
