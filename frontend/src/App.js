import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Send, Users, Radio, LogOut, User } from 'lucide-react';

const API_BASE = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('PATIENT');
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [inCall, setInCall] = useState(false);
  const [callWith, setCallWith] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  
  const ws = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const remoteAudio = useRef(null);

  useEffect(() => {
    if (isLoggedIn && token) {
      connectWebSocket();
    }
    return () => {
      if (ws.current) ws.current.close();
      if (pc.current) pc.current.close();
      if (localStream.current) {
        localStream.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [isLoggedIn, token]);

  const connectWebSocket = () => {
    ws.current = new WebSocket(`${WS_URL}?token=${token}`);
    
    ws.current.onopen = () => console.log('WebSocket connected');
    
    ws.current.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'user_list') {
        setOnlineUsers(data.users.filter(u => u.username !== user?.username));
      } else if (data.type === 'chat') {
        setMessages(prev => [...prev, data]);
      } else if (data.type === 'call_offer') {
        setIncomingCall(data);
      } else if (data.type === 'call_answer') {
        await handleAnswer(data.answer);
      } else if (data.type === 'ice_candidate') {
        if (pc.current && data.candidate) {
          await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } else if (data.type === 'call_ended') {
        endCall();
      }
    };
    
    ws.current.onerror = (error) => console.error('WebSocket error:', error);
    ws.current.onclose = () => console.log('WebSocket closed');
  };

  const handleAuth = async (isReg) => {
    try {
      const endpoint = isReg ? '/register' : '/login';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: isReg ? role : undefined })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setToken(data.token);
        setUser({ username, role: data.role });
        setIsLoggedIn(true);
      } else {
        alert(data.detail || 'Authentication failed');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const setDoctorStatus = async (status) => {
    try {
      await fetch(`${API_BASE}/doctors/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
    } catch (err) {
      console.error('Error setting status:', err);
    }
  };

  const sendMessage = () => {
    if (!chatInput.trim() || !selectedUser) return;
    
    ws.current.send(JSON.stringify({
      type: 'chat',
      to: selectedUser.username,
      message: chatInput
    }));
    
    setMessages(prev => [...prev, {
      type: 'chat',
      from: user.username,
      to: selectedUser.username,
      message: chatInput
    }]);
    
    setChatInput('');
  };

  const initiateCall = async (doctor) => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      pc.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      localStream.current.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream.current);
      });
      
      pc.current.ontrack = (event) => {
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = event.streams[0];
        }
      };
      
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'ice_candidate',
            to: doctor.username,
            candidate: event.candidate
          }));
        }
      };
      
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      
      ws.current.send(JSON.stringify({
        type: 'call_offer',
        to: doctor.username,
        offer: offer
      }));
      
      setInCall(true);
      setCallWith(doctor);
    } catch (err) {
      alert('Error starting call: ' + err.message);
    }
  };

  const acceptCall = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      pc.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      localStream.current.getTracks().forEach(track => {
        pc.current.addTrack(track, localStream.current);
      });
      
      pc.current.ontrack = (event) => {
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = event.streams[0];
        }
      };
      
      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current.send(JSON.stringify({
            type: 'ice_candidate',
            to: incomingCall.from,
            candidate: event.candidate
          }));
        }
      };
      
      await pc.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      
      ws.current.send(JSON.stringify({
        type: 'call_answer',
        to: incomingCall.from,
        answer: answer
      }));
      
      await setDoctorStatus('BUSY');
      
      setInCall(true);
      setCallWith({ username: incomingCall.from });
      setIncomingCall(null);
    } catch (err) {
      alert('Error accepting call: ' + err.message);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await pc.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  const endCall = () => {
    if (ws.current && callWith) {
      ws.current.send(JSON.stringify({
        type: 'call_ended',
        to: callWith.username
      }));
    }
    
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }
    
    if (user?.role === 'DOCTOR') {
      setDoctorStatus('ONLINE');
    }
    
    setInCall(false);
    setCallWith(null);
    setIncomingCall(null);
  };

  const logout = () => {
    if (ws.current) ws.current.close();
    setIsLoggedIn(false);
    setToken('');
    setUser(null);
    setOnlineUsers([]);
    setMessages([]);
    endCall();
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-6 text-indigo-600">
            Telemedicine App
          </h1>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            
            {isRegistering && (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="PATIENT">Patient</option>
                <option value="DOCTOR">Doctor</option>
              </select>
            )}
            
            <button
              onClick={() => handleAuth(isRegistering)}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              {isRegistering ? 'Register' : 'Login'}
            </button>
            
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="w-full text-indigo-600 hover:underline"
            >
              {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  console.log(onlineUsers,"onlineUsers","user",user)
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-md px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <User className="w-6 h-6 text-indigo-600" />
          <div>
            <div className="font-semibold">{user?.username}</div>
            <div className="text-sm text-gray-500">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="text-xl font-semibold">
                {user?.role === 'PATIENT' ? 'Available Doctors' : 'Online Users'}
              </h2>
            </div>
            
            <div className="space-y-2">
                
              {onlineUsers
              // .filter((u)=>u.role != "PATIENT")
              .map((u) => (
                <div
                  key={u.username}
                  onClick={() => setSelectedUser(u)}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    selectedUser?.username === u.username
                      ? 'bg-indigo-100 border-2 border-indigo-500'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs text-gray-500">{u.role}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Radio
                        className={`w-4 h-4 ${
                          u.status === 'ONLINE' ? 'text-green-500' : 'text-yellow-500'
                        }`}
                      />
                      <span className="text-xs">{u.status}</span>
                    </div>
                  </div>
                  
                  {
                  user?.role === 'PATIENT' && u.role === 'DOCTOR' && u.status === 'ONLINE' && !inCall &&
                  
                  (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        initiateCall(u);
                      }}
                      className="mt-2 w-full bg-green-500 text-white py-1 rounded flex items-center justify-center gap-2 hover:bg-green-600"
                    >
                      <Phone className="w-4 h-4" />
                      Call
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-lg shadow-md p-4 flex flex-col h-[600px]">
            {inCall ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-center mb-8">
                  <Phone className="w-16 h-16 text-green-500 mx-auto mb-4 animate-pulse" />
                  <h3 className="text-2xl font-bold mb-2">Call in Progress</h3>
                  <p className="text-gray-600">Connected with {callWith?.username}</p>
                </div>
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Call
                </button>
                <audio ref={remoteAudio} autoPlay />
              </div>
            ) : incomingCall ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-center mb-8">
                  <Phone className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-bounce" />
                  <h3 className="text-2xl font-bold mb-2">Incoming Call</h3>
                  <p className="text-gray-600">From {incomingCall.from}</p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={acceptCall}
                    className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    <Phone className="w-5 h-5" />
                    Accept
                  </button>
                  <button
                    onClick={() => setIncomingCall(null)}
                    className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    <PhoneOff className="w-5 h-5" />
                    Decline
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-4">
                  {selectedUser ? `Chat with ${selectedUser.username}` : 'Select a user to chat'}
                </h2>
                
                <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                  {messages
                    .filter(m => 
                      selectedUser && (
                        (m.from === user.username && m.to === selectedUser.username) ||
                        (m.from === selectedUser.username && m.to === user.username)
                      )
                    )
                    .map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg max-w-xs ${
                          msg.from === user.username
                            ? 'ml-auto bg-indigo-500 text-white'
                            : 'bg-gray-200'
                        }`}
                      >
                        <div className="text-xs opacity-75 mb-1">{msg.from}</div>
                        <div>{msg.message}</div>
                      </div>
                    ))}
                </div>
                
                {selectedUser && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={sendMessage}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;