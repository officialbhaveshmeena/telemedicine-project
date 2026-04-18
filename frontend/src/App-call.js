import React, { useState, useRef, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Copy, Check } from 'lucide-react';

export default function WebRTCAudioCall() {
  const [roomId, setRoomId] = useState('');
  const [currentRoom, setCurrentRoom] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const processedCandidatesRef = useRef(new Set());

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(currentRoom);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createPeerConnection = (stream, room, initiator) => {
    const pc = new RTCPeerConnection(configuration);
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      console.log('Received remote track');
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
        setCallStatus('Connected - Audio streaming');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        const prefix = initiator ? 'init_ice' : 'join_ice';
        const key = `${prefix}_${room}_${Date.now()}_${Math.random()}`;
        try {
          localStorage.setItem(key, JSON.stringify(event.candidate));
        } catch (error) {
          console.error('Error saving ICE candidate:', error);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        setCallStatus('Connected');
      } else if (pc.iceConnectionState === 'disconnected') {
        setCallStatus('Disconnected');
      } else if (pc.iceConnectionState === 'failed') {
        setCallStatus('Connection failed - try again');
      } else {
        setCallStatus(`Connecting... (${pc.iceConnectionState})`);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('Signaling state:', pc.signalingState);
    };

    return pc;
  };

  const startCall = async (room) => {
    try {
      setCallStatus('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: true 
      });
      localStreamRef.current = stream;

      setCallStatus('Creating call room...');
      const pc = createPeerConnection(stream, room, true);
      peerConnectionRef.current = pc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("-------",JSON.stringify(offer))
      localStorage.setItem(`offer_${room}`, JSON.stringify(offer));
      
      setCurrentRoom(room);
      setIsInCall(true);
      setIsInitiator(true);
      setCallStatus('Waiting for someone to join...');

      startPolling(room, true);
    } catch (error) {
      setCallStatus(`Error: ${error.message}`);
      console.error('Error starting call:', error);
    }
  };

  const joinCall = async (room) => {
    try {
      setCallStatus('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      localStreamRef.current = stream;

      setCallStatus('Looking for call room...');
      
      const offerStr = localStorage.getItem(`offer_${room}`);
      if (!offerStr) {
        setCallStatus('Room not found. Check the Room ID.');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const offerData = JSON.parse(offerStr);

      setCallStatus('Joining call...');
      const pc = createPeerConnection(stream, room, false);
      peerConnectionRef.current = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(offerData));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      localStorage.setItem(`answer_${room}`, JSON.stringify(answer));
      
      setCurrentRoom(room);
      setIsInCall(true);
      setIsInitiator(false);
      setCallStatus('Connecting...');

      startPolling(room, false);
    } catch (error) {
      setCallStatus(`Error: ${error.message}`);
      console.error('Error joining call:', error);
    }
  };

  const startPolling = (room, initiator) => {
    const checkInterval = 500;
    
    pollingIntervalRef.current = setInterval(() => {
      try {
        const pc = peerConnectionRef.current;
        if (!pc) return;

        // If initiator, check for answer
        if (initiator && pc.signalingState === 'have-local-offer') {
          const answerStr = localStorage.getItem(`answer_${room}`);
          if (answerStr) {
            console.log('Received answer');
            const answerData = JSON.parse(answerStr);
            pc.setRemoteDescription(new RTCSessionDescription(answerData));
            setCallStatus('Answer received, connecting...');
          }
        }

        // Check for ICE candidates from the other peer
        const icePrefix = initiator ? 'join_ice' : 'init_ice';
        
        // Get all localStorage keys
        const keys = Object.keys(localStorage);
        const candidateKeys = keys.filter(key => key.startsWith(`${icePrefix}_${room}_`));
        
        for (const key of candidateKeys) {
          if (processedCandidatesRef.current.has(key)) continue;
          
          try {
            const candidateStr = localStorage.getItem(key);
            if (candidateStr) {
              const candidate = JSON.parse(candidateStr);
              console.log('Adding ICE candidate');
              pc.addIceCandidate(new RTCIceCandidate(candidate));
              processedCandidatesRef.current.add(key);
              localStorage.removeItem(key);
            }
          } catch (error) {
            console.error('Error processing candidate:', error);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, checkInterval);
  };

  const endCall = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    if (currentRoom) {
      try {
        localStorage.removeItem(`offer_${currentRoom}`);
        localStorage.removeItem(`answer_${currentRoom}`);
        
        // Clean up ICE candidates
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith(`init_ice_${currentRoom}_`) || key.startsWith(`join_ice_${currentRoom}_`)) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }

    localStreamRef.current = null;
    peerConnectionRef.current = null;
    processedCandidatesRef.current.clear();
    setIsInCall(false);
    setCurrentRoom('');
    setCallStatus('');
    setIsMuted(false);
    setIsInitiator(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-3">
              <Phone className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Audio Call</h1>
            <p className="text-sm text-gray-600">WebRTC peer-to-peer calling</p>
          </div>

          {!isInCall ? (
            <div className="space-y-4">
              <div>
                <button
                  onClick={() => startCall(generateRoomId())}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center space-x-2"
                >
                  <Phone className="w-5 h-5" />
                  <span>Start New Call</span>
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">or</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Join Existing Call
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Enter Room ID"
                  maxLength={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3 text-center text-lg font-mono"
                />
                <button
                  onClick={() => roomId && joinCall(roomId)}
                  disabled={!roomId || roomId.length < 6}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition duration-200"
                >
                  Join Call
                </button>
              </div>

              {callStatus && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {callStatus}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">Room ID</p>
                <div className="flex items-center justify-center space-x-2">
                  <p className="text-2xl font-mono font-bold text-indigo-600">
                    {currentRoom}
                  </p>
                  <button
                    onClick={copyRoomId}
                    className="p-2 hover:bg-indigo-100 rounded-lg transition"
                    title="Copy Room ID"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-indigo-600" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Share this ID to invite someone</p>
              </div>

              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-3">
                  <Phone className={`w-10 h-10 text-green-600 ${callStatus.includes('Waiting') ? 'animate-pulse' : ''}`} />
                </div>
                <p className="text-base font-medium text-gray-800">{callStatus}</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={toggleMute}
                  className={`flex-1 ${
                    isMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
                  } text-white font-semibold py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center space-x-2`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  onClick={endCall}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center space-x-2"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>End</span>
                </button>
              </div>
            </div>
          )}

          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-600">🔒 Encrypted peer-to-peer connection</p>
          <p className="text-xs text-gray-500 mt-1">Uses localStorage for signaling</p>
        </div>
      </div>
    </div>
  );
}