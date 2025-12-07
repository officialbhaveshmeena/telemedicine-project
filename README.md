# Telemedicine App - Node.js Backend

A real-time telemedicine application backend built with Node.js, Express, WebSockets, and WebRTC signaling.

## Tech Stack

- **Backend Framework:** Express.js (Node.js)
- **WebSocket Library:** ws
- **Authentication:** JWT (jsonwebtoken)
- **Real-time Communication:** WebSockets for chat and WebRTC signaling

## Features

✅ User registration and authentication with JWT
✅ Two user roles: PATIENT and DOCTOR
✅ Real-time chat messaging via WebSockets
✅ WebRTC signaling for peer-to-peer audio calls
✅ Doctor availability status management (ONLINE/BUSY)
✅ In-memory data storage (no database required)
✅ CORS enabled for cross-origin requests

## Project Structure
```
telemedicine-backend/
├── server.js           # Main server file
├── package.json        # Dependencies and scripts
└── README.md          # Documentation
```

## Installation

1. **Clone or create the project directory:**
```bash
mkdir telemedicine-backend
cd telemedicine-backend
```

2. **Initialize and install dependencies:**
```bash
npm init -y
npm install express ws jsonwebtoken cors
npm install --save-dev nodemon
```

3. **Copy the server.js file** into your project directory

## Running the Server

### Development mode (with auto-restart):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

The server will start on **http://localhost:8000**

## API Endpoints

### Authentication

#### POST `/register`
Register a new user (PATIENT or DOCTOR)

**Request Body:**
```json
{
  "username": "bhavesh",
  "password": "password123",
  "role": "PATIENT"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "PATIENT"
}
```

#### POST `/login`
Login existing user

**Request Body:**
```json
{
  "username": "bhavesh",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "role": "PATIENT"
}
```

### Doctor Status (Protected)

#### POST `/doctors/status`
Update doctor availability status

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "status": "ONLINE"
}
```

**Response:**
```json
{
  "status": "updated"
}
```

### WebSocket Connection

#### WS `/ws?token=<jwt_token>`
Establish WebSocket connection for real-time features

**Connection URL:**
```
ws://localhost:8000/ws?token=<your_jwt_token>
```

## WebSocket Message Types

### Client → Server

#### Chat Message
```json
{
  "type": "chat",
  "to": "recipient_username",
  "message": "Hello!"
}
```

#### Call Offer (WebRTC)
```json
{
  "type": "call_offer",
  "to": "doctor_username",
  "offer": { /* RTCSessionDescription */ }
}
```

#### Call Answer (WebRTC)
```json
{
  "type": "call_answer",
  "to": "patient_username",
  "answer": { /* RTCSessionDescription */ }
}
```

#### ICE Candidate (WebRTC)
```json
{
  "type": "ice_candidate",
  "to": "other_username",
  "candidate": { /* RTCIceCandidate */ }
}
```

#### Call Ended
```json
{
  "type": "call_ended",
  "to": "other_username"
}
```

### Server → Client

#### User List Update
```json
{
  "type": "user_list",
  "users": [
    {
      "username": "doctor1",
      "role": "DOCTOR",
      "status": "ONLINE"
    }
  ]
}
```

#### Received Chat Message
```json
{
  "type": "chat",
  "from": "sender_username",
  "to": "recipient_username",
  "message": "Hello!"
}
```

## Design Decisions

### 1. **In-Memory Storage**
- Uses JavaScript `Map` objects for fast lookups
- Perfect for demo/prototype without database overhead
- Easy to replace with real database later

### 2. **JWT Authentication**
- Stateless authentication
- Tokens valid for 24 hours
- Used for both REST API and WebSocket connections

### 3. **Single WebSocket Endpoint**
- Handles all real-time features (chat, WebRTC signaling)
- Message routing based on `type` field
- Efficient and maintainable

### 4. **WebRTC Signaling**
- Server acts as signaling server only
- Actual audio/video flows peer-to-peer
- Supports offer, answer, and ICE candidate exchange

### 5. **Automatic Status Management**
- Doctor status automatically broadcast on updates
- Connections cleaned up on disconnect
- Real-time user list updates

## Security Considerations

⚠️ **For Production, you should:**

1. **Hash passwords** - Use bcrypt instead of plain text
2. **Environment variables** - Store SECRET_KEY in .env file
3. **HTTPS/WSS** - Use secure connections
4. **Rate limiting** - Prevent abuse
5. **Input validation** - Validate all user inputs
6. **Database** - Replace in-memory storage with proper DB

## Testing the Server

### 1. Test Registration
```bash
curl -X POST http://localhost:8000/register \
  -H "Content-Type: application/json" \
  -d '{"username":"doctor1","password":"pass123","role":"DOCTOR"}'
```

### 2. Test Login
```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"doctor1","password":"pass123"}'
```

### 3. Test Status Update
```bash
curl -X POST http://localhost:8000/doctors/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"status":"BUSY"}'
```

### 4. Test WebSocket
Use a WebSocket client or the React frontend to test real-time features.

## Frontend Integration

The React frontend (from the artifact) is already configured to connect to this backend. Make sure:

1. Backend is running on `http://localhost:8000`
2. WebSocket URL is `ws://localhost:8000/ws`
3. CORS is enabled (already configured)

## Troubleshooting

### Port already in use
```bash
# Change PORT in server.js or kill the process
lsof -ti:8000 | xargs kill -9
```



## License

MIT
