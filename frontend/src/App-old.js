import React, { useState, useEffect, useRef } from 'react';

// --- STUN Servers (Required for WebRTC over Internet) ---
const peerConnectionConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function App() {
  // State
  const [user, setUser] = useState(null); // Logged in user
  const [doctors, setDoctors] = useState([]);
  const [token, setToken] = useState(null);
  const [view, setView] = useState('login'); // login, dashboard
  const [incomingCall, setIncomingCall] = useState(null);
  const [inCall, setInCall] = useState(false);
  
  // Refs
  const socket = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const remoteAudioRef = useRef();

  // Inputs
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('PATIENT');

  // --- 1. Auth & WebSocket Setup ---

  const handleRegister = async () => {
    await fetch('http://localhost:4000/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password', role })
    });
    alert("Registered! Now log in.");
  };

  const handleLogin = async () => {
    const res = await fetch('http://localhost:4000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'password' })
    });
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      setUser(data.user);
      connectWebSocket(data.token);
      setView('dashboard');
    }
  };

  const connectWebSocket = (authToken) => {
    socket.current = new WebSocket(`ws://localhost:4000?token=${authToken}`);
    
    socket.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    };
  };

  // --- 2. Signaling & WebRTC Logic ---

  const handleWsMessage = async (data) => {
    switch (data.type) {
      case 'USER_LIST':
        setDoctors(data.doctors);
        break;
        
      case 'CALL_REQUEST':
        // Only Doctors receive this
        setIncomingCall({ callerId: data.senderId });
        break;

      case 'CALL_ACCEPTED':
        // Patient receives this, start WebRTC offer
        startWebRTC(data.senderId, true); // true = initiator
        break;

      case 'WEBRTC_OFFER':
        handleOffer(data.offer, data.senderId);
        break;

      case 'WEBRTC_ANSWER':
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;

      case 'ICE_CANDIDATE':
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;

      case 'END_CALL':
        endCallCleanup();
        break;
      
      default: break;
    }
  };

  const startWebRTC = async (remoteUserId, isInitiator) => {
    setInCall(true);
    peerConnection.current = new RTCPeerConnection(peerConnectionConfig);

    // Get Local Audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.current = stream;
    stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));

    // Handle Remote Stream
    peerConnection.current.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE Candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current.send(JSON.stringify({
          type: 'ICE_CANDIDATE',
          targetId: remoteUserId,
          candidate: event.candidate
        }));
      }
    };

    if (isInitiator) {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      socket.current.send(JSON.stringify({
        type: 'WEBRTC_OFFER',
        targetId: remoteUserId,
        offer
      }));
    }
  };

  const handleOffer = async (offer, remoteUserId) => {
    setInCall(true);
    setIncomingCall(null); // Clear notification
    
    // Doctor needs to set status to BUSY via API or WS
    socket.current.send(JSON.stringify({ type: 'SET_STATUS_BUSY' }));

    peerConnection.current = new RTCPeerConnection(peerConnectionConfig);

    // Get Local Audio
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.current = stream;
    stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));

    peerConnection.current.ontrack = (event) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.current.send(JSON.stringify({
          type: 'ICE_CANDIDATE',
          targetId: remoteUserId,
          candidate: event.candidate
        }));
      }
    };

    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    socket.current.send(JSON.stringify({
      type: 'WEBRTC_ANSWER',
      targetId: remoteUserId,
      answer
    }));
  };

  // --- 3. User Actions ---

  const initiateCall = (doctorId) => {
    // 1. Send Request to Doctor
    socket.current.send(JSON.stringify({ type: 'CALL_REQUEST', targetId: doctorId }));
    alert("Calling Doctor... Waiting for acceptance.");
  };

  const answerCall = () => {
    // Send Accept to Patient
    socket.current.send(JSON.stringify({ 
      type: 'CALL_ACCEPTED', 
      targetId: incomingCall.callerId 
    }));
    // We wait for the Patient to send the WebRTC OFFER now
  };

  const endCall = () => {
    // Find who we were talking to? simplified: broadcast end to everyone active or track peer ID
    // For this simple demo, we rely on cleaning up local and relying on peer cleanup or refresh
    // Ideally, store `currentPeerId` in state.
    
    // Quick fix: Send End Call to whoever is connected if we could track ID. 
    // In this simplified version, we just close connections.
    endCallCleanup();
  };

  const endCallCleanup = () => {
    setInCall(false);
    setIncomingCall(null);
    if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.current) {
        peerConnection.current.close();
    }
    // If doctor, reset status
    if (user.role === 'DOCTOR') {
         // The server handles status reset on 'END_CALL' message usually, 
         // but we can also hit the REST endpoint.
         fetch('http://localhost:4000/doctors/status', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ userId: user.id, status: 'ONLINE' })
         });
    }
  };

  // --- 4. Render ---

  if (view === 'login') {
    return (
      <div style={{ padding: 20 }}>
        <h2>Sanatan Ayurveda - Login</h2>
        <input placeholder="Username" onChange={e => setUsername(e.target.value)} />
        <select onChange={e => setRole(e.target.value)}>
          <option value="PATIENT">Patient</option>
          <option value="DOCTOR">Doctor</option>
        </select>
        <button onClick={handleLogin}>Login</button>
        <button onClick={handleRegister}>Register</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Welcome, {user.username} ({user.role})</h1>

      {/* Audio Element for WebRTC */}
      <audio ref={remoteAudioRef} autoPlay />

      {inCall ? (
        <div style={{ background: '#e0ffe0', padding: 20 }}>
          <h2>📞 Audio Call in Progress</h2>
          <button onClick={endCall} style={{ background: 'red', color: 'white' }}>End Call</button>
        </div>
      ) : (
        <>
          {incomingCall && (
            <div style={{ background: '#ffeb3b', padding: 10 }}>
              <h3>Incoming Call...</h3>
              <button onClick={answerCall}>Answer</button>
            </div>
          )}

          <h3>Available Doctors</h3>
          <ul>
            {doctors.map(doc => (
              <li key={doc.id} style={{ marginBottom: 10 }}>
                Dr. {doc.username} - 
                <span style={{ color: doc.status === 'ONLINE' ? 'green' : 'red', fontWeight: 'bold' }}> {doc.status} </span>
                {user.role === 'PATIENT' && doc.status === 'ONLINE' && (
                  <button onClick={() => initiateCall(doc.id)}>Call Now</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default App;