// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const SECRET_KEY = 'your-secret-key-change-in-production';
const PORT = 8000;

// In-memory storage
const usersDb = new Map(); // username -> { password, role }
const activeConnections = new Map(); // username -> WebSocket
const userStatus = new Map(); // username -> status (ONLINE/BUSY)

// Helper functions
const createToken = (username, role) => {
  return jwt.sign(
    { username, role },
    SECRET_KEY,
    { expiresIn: '24h' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
};

// API Endpoints
app.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ detail: 'Missing required fields' });
  }
  
  if (usersDb.has(username)) {
    return res.status(400).json({ detail: 'Username already exists' });
  }
  
  if (role !== 'PATIENT' && role !== 'DOCTOR') {
    return res.status(400).json({ detail: 'Invalid role' });
  }
  
  usersDb.set(username, { password, role });
  
  if (role === 'DOCTOR') {
    userStatus.set(username, 'ONLINE');
  }
  
  const token = createToken(username, role);
  res.json({ token, role });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ detail: 'Missing credentials' });
  }
  
  const user = usersDb.get(username);
  
  if (!user || user.password !== password) {
    return res.status(401).json({ detail: 'Invalid credentials' });
  }
  
  const token = createToken(username, user.role);
  res.json({ token, role: user.role });
});

app.post('/doctors/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  
  if (req.user.role !== 'DOCTOR') {
    return res.status(403).json({ detail: 'Only doctors can set status' });
  }
  
  if (status !== 'ONLINE' && status !== 'BUSY') {
    return res.status(400).json({ detail: 'Invalid status' });
  }
  
  userStatus.set(req.user.username, status);
  broadcastUserList();
  
  res.json({ status: 'updated' });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  let username = null;
  let role = null;
  
  // Extract token from query string
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const token = urlParams.get('token');
  
  if (!token) {
    ws.close(1008, 'No token provided');
    return;
  }
  
  try {
    const userData = verifyToken(token);
    username = userData.username;
    role = userData.role;
    
    // Store connection
    activeConnections.set(username, ws);
    
    // Set initial status for doctors
    if (role === 'DOCTOR' && !userStatus.has(username)) {
      userStatus.set(username, 'ONLINE');
    }
    
    // Send initial user list
    broadcastUserList();
    
    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(username, message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      activeConnections.delete(username);
      userStatus.delete(username);
      broadcastUserList();
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      activeConnections.delete(username);
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    ws.close(1008, 'Authentication failed');
  }
});

const handleWebSocketMessage = (fromUser, message) => {
  const { type, to } = message;
  
  switch (type) {
    case 'chat':
      if (activeConnections.has(to)) {
        const targetWs = activeConnections.get(to);
        targetWs.send(JSON.stringify({
          type: 'chat',
          from: fromUser,
          to: to,
          message: message.message
        }));
      }
      break;
    
    case 'call_offer':
      if (activeConnections.has(to)) {
        const targetWs = activeConnections.get(to);
        targetWs.send(JSON.stringify({
          type: 'call_offer',
          from: fromUser,
          offer: message.offer
        }));
      }
      break;
    
    case 'call_answer':
      if (activeConnections.has(to)) {
        const targetWs = activeConnections.get(to);
        targetWs.send(JSON.stringify({
          type: 'call_answer',
          from: fromUser,
          answer: message.answer
        }));
      }
      break;
    
    case 'ice_candidate':
      if (activeConnections.has(to)) {
        const targetWs = activeConnections.get(to);
        targetWs.send(JSON.stringify({
          type: 'ice_candidate',
          from: fromUser,
          candidate: message.candidate
        }));
      }
      break;
    
    case 'call_ended':
      if (activeConnections.has(to)) {
        const targetWs = activeConnections.get(to);
        targetWs.send(JSON.stringify({
          type: 'call_ended',
          from: fromUser
        }));
      }
      break;
    
    default:
      console.log('Unknown message type:', type);
  }
};

const broadcastUserList = () => {
  const usersList = [];
  
  for (const [username, ws] of activeConnections.entries()) {
    if (usersDb.has(username)) {
      const user = usersDb.get(username);
      usersList.push({
        username,
        role: user.role,
        status: userStatus.get(username) || 'ONLINE'
      });
    }
  }
  
  const message = JSON.stringify({
    type: 'user_list',
    users: usersList
  });
  
  for (const ws of activeConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
};

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Telemedicine API Server',
    activeUsers: activeConnections.size
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});