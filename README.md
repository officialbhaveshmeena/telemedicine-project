# Telemedicine Assignment

A peer-to-peer telemedicine application featuring WebRTC audio calling capabilities.

## Features

- **WebRTC Audio Calls**: Real-time peer-to-peer audio communication
- **Room-based Calling**: Create or join calls using unique room IDs
- **Encrypted Connections**: Secure peer-to-peer connections
- **Mute/Unmute**: Control audio during calls
- **Cross-platform**: Works in modern web browsers

## Architecture

- **Frontend**: React application with Tailwind CSS
- **Backend**: Node.js Express server with WebSocket support
- **Signaling**: Uses localStorage for simple signaling (not production-ready)

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Modern web browser with WebRTC support

## Running the Application

### Option 1: Docker Compose (Recommended)

```bash
docker-compose up
```

This will build and start both frontend and backend services.

### Option 2: Manual Docker Commands

```bash
# Build images
docker build -t telemedicine-backend ./backend
docker build -t telemedicine-frontend ./frontend

# Run containers
docker run -d -p 8000:8000 telemedicine-backend
docker run -d -p 80:80 telemedicine-frontend
```

### Option 3: Local Development

For development with hot reloading:

**Backend:**
```bash
cd backend
npm install
npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

## Usage

1. **Start a Call**: Click "Start New Call" to generate a room ID
2. **Share Room ID**: Copy and share the room ID with the other participant
3. **Join a Call**: Enter the room ID and click "Join Call"
4. **Audio Controls**: Use mute/unmute during the call
5. **End Call**: Click "End" to terminate the call

## Technologies Used

- **Frontend**: React, Tailwind CSS, Lucide React icons
- **Backend**: Node.js, Express, WebSocket, JWT
- **WebRTC**: Peer-to-peer audio communication
- **Docker**: Containerization

## Notes

- This is a demonstration application using localStorage for signaling
- For production use, implement proper signaling server (e.g., Socket.io)
- Ensure microphone permissions are granted in the browser
- The application works best with two browser tabs/windows for testing

## License

ISC