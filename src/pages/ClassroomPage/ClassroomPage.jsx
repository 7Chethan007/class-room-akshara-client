import { useState, useEffect, useRef } from 'react';
import ClassroomNavbar from '../../components/ClassroomNavbar/ClassroomNavbar';
import PresenterTile from '../../components/PresenterTile/PresenterTile';
import StudentTiles from '../../components/StudentTiles/StudentTiles';
import ParticipantsPanel from '../../components/ParticipantsPanel/ParticipantsPanel';
import ControlsBar from '../../components/ControlsBar/ControlsBar';
import {
  initSocket,
  disconnectSocket,
  loadDevice,
  createSendTransport,
  createRecvTransport,
  produce,
} from '../../services/mediaService';
import './ClassroomPage.css';

/**
 * ClassroomPage — full-viewport dark-themed live class view with WORKING video
 * 
 * Following Omegle pattern:
 * 1. Get local media FIRST (before produce)
 * 2. Add tracks to transport (which triggers 'produce' event)
 * 3. Create recv transport with ontrack handler to collect remote tracks
 * 4. Bind MediaStreams to video elements (not individual tracks)
 */
function ClassroomPage() {
  const [user, setUser] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [shareOn, setShareOn] = useState(false);
  const [recordOn, setRecordOn] = useState(false);

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef({});
  const consumersRef = useRef(new Map());
  const remoteStreamsMapRef = useRef(new Map()); // producerId -> { stream, userId, kind }

  /**
   * STEP 1: Initialize auth from localStorage
   */
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const sid = localStorage.getItem('sessionId');

    if (!token || !userStr || !sid) {
      console.error('[SETUP] Missing auth - redirecting to home');
      setError('No active session. Redirecting to home...');
      setTimeout(() => (window.location.href = '/'), 2000);
      return;
    }

    try {
      const userData = JSON.parse(userStr);
      setUser(userData);
      setSessionId(sid);
      console.log('[SETUP] ✅ Auth loaded:', userData.name, `(${userData.role})`);
    } catch (e) {
      setError('Failed to parse auth data');
      console.error('[SETUP] ❌ Parse error:', e.message);
    }
  }, []);

  /**
   * STEP 2: Setup socket connection and media pipeline
   */
  useEffect(() => {
    if (!user || !sessionId) return;

    let isActive = true;

    async function setupPipeline() {
      try {
        const token = localStorage.getItem('token');
        const socket = initSocket(token);
        socketRef.current = socket;

        console.log('[SETUP] 🔌 Socket connecting...');

        // Join room
        socket.emit('join-room', {
          sessionId,
          userId: user._id || user.id,
          role: user.role,
          name: user.name,
        });
        console.log('[SETUP] Joined room:', sessionId);

        // Listen for participant updates
        socket.on('room-participants', ({ participants }) => {
          if (isActive) {
            console.log('[ROOM] Participants:', participants);
            setParticipants(Array.isArray(participants) ? participants : []);
          }
        });

        // Get RTP capabilities and initialize device
        socket.emit('get-router-rtp-capabilities', { sessionId }, async (rtpCaps) => {
          if (!isActive) return;
          if (rtpCaps?.error) {
            throw new Error('RTP capabilities error: ' + rtpCaps.error);
          }

          console.log('[DEVICE] Loading with RTP capabilities');
          const device = await loadDevice(rtpCaps);
          deviceRef.current = device;
          console.log('[DEVICE] Loaded successfully');

          // Create send transport
          console.log('[TRANSPORT] Creating send transport');
          const sendTransport = await createSendTransport(socket, device, sessionId);
          sendTransportRef.current = sendTransport;

          // Create recv transport WITH ontrack handler
          console.log('[TRANSPORT] Creating recv transport');
          const recvTransport = await createRecvTransport(socket, device, sessionId);
          recvTransportRef.current = recvTransport;

          // Handle recv transport connect
          recvTransport.on('connect', () => {
            console.log('[TRANSPORT] ✅ Recv transport connected');
          });

          console.log('[TRANSPORT] ✅ Both transports ready');

          // Listen for existing producers (sent by server when we join)
          socket.on('existing-producers', ({ producers }) => {
            if (!isActive) return;
            const producerList = Array.isArray(producers) ? producers : [];
            console.log('[EXISTING] 📦 Server sent:', producerList.length, 'producers -', producerList.map(p => `${p.kind}(${p.userId})`).join(', '));
            for (const p of producerList) {
              try {
                console.log('[EXISTING] Consuming producer:', p.kind, 'from', p.userId, 'id=', p.producerId);
                setupRemoteStream(p.producerId || p.id, p.userId);
              } catch (e) {
                console.warn('[PRODUCER] Failed to consume existing:', e.message);
              }
            }
          });

          // Listen for new producers (produced after we joined)
          socket.on('new-producer', ({ producerId, userId, kind }) => {
            if (!isActive) return;
            console.log('[NEW-PRODUCER] 🆕 Incoming:', kind, 'from', userId);
            setupRemoteStream(producerId, userId).catch((e) => {
              console.warn('[NEW-PRODUCER] Setup failed:', e.message);
            });
          });

          // USER LEFT
          socket.on('user-left', ({ userId }) => {
            console.log('[USER-LEFT]:', userId);
            // Remove all streams from this user
            for (const [producerId, entry] of remoteStreamsMapRef.current.entries()) {
              if (entry.userId === userId) {
                remoteStreamsMapRef.current.delete(producerId);
              }
            }
            updateRemoteStreams();
          });

          // PRODUCER CLOSED (screen share stopped, etc)
          socket.on('producer-closed', ({ producerId }) => {
            if (!isActive) return;
            console.log('[PRODUCER-CLOSED] 🛑 Producer closed:', producerId);
            remoteStreamsMapRef.current.delete(producerId);
            updateRemoteStreams();
          });

          // NOW request local media AFTER transport setup (Omegle pattern)
          if (user.role === 'teacher' || user.role === 'instructor') {
            console.log('[LOCAL-MEDIA] 🎥 Teacher: Requesting camera...');
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: { echoCancellation: true, noiseSuppression: true },
              });
              
              console.log('[LOCAL-MEDIA] Got stream with', stream.getTracks().length, 'tracks');
              console.log('[LOCAL-MEDIA] Video tracks:', stream.getVideoTracks().length);
              console.log('[LOCAL-MEDIA] Audio tracks:', stream.getAudioTracks().length);

              if (!isActive) {
                stream.getTracks().forEach((t) => t.stop());
                return;
              }

              setLocalStream(stream);

              // Add tracks to send transport (this will trigger 'produce' event automatically)
              const videoTrack = stream.getVideoTracks()[0];
              const audioTrack = stream.getAudioTracks()[0];

              if (videoTrack) {
                console.log('[PRODUCE] 🎥 Video track, appData={source:camera}');
                const videoProd = await produce(sendTransport, videoTrack, {
                  source: 'camera',
                });
                producersRef.current.video = videoProd;
                console.log('[PRODUCE] ✅ Video producer created:', videoProd.id);
              }

              if (audioTrack) {
                console.log('[PRODUCE] 🎤 Audio track, appData={source:mic}');
                const audioProd = await produce(sendTransport, audioTrack, {
                  source: 'mic',
                });
                producersRef.current.audio = audioProd;
                console.log('[PRODUCE] ✅ Audio producer created:', audioProd.id);
              }
            } catch (err) {
              console.error('[LOCAL-MEDIA] Failed:', err);
              setError('Camera access denied: ' + err.message);
            }
          } else {
            // Students: still get camera but don't produce (listen only initially)
            console.log('[LOCAL-MEDIA] Student - listen only mode');
          }
        });

        return () => {
          isActive = false;
        };
      } catch (err) {
        console.error('[SETUP] Error:', err);
        if (isActive) {
          setError(err.message);
        }
      }
    }

    setupPipeline();

    return () => {
      isActive = false;
      if (socketRef.current) {
        console.log('[CLEANUP] Leaving room');
        socketRef.current.emit('leave-room', {
          sessionId,
          userId: user._id || user.id,
        });
        disconnectSocket();
      }
      if (localStream) {
        console.log('[CLEANUP] Stopping local tracks');
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [user, sessionId]);

  /**
   * Setup remote stream by consuming a producer
   */
  async function setupRemoteStream(producerId, userId) {
    if (consumersRef.current.has(producerId)) {
      console.log('[REMOTE] Already consuming:', producerId);
      return;
    }

    if (!recvTransportRef.current || !deviceRef.current) {
      throw new Error('Transport/device not ready');
    }

    console.log('[REMOTE] Consuming producer:', producerId, 'from userId:', userId);

    // Emit consume event to server
    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        'consume',
        {
          producerId,
          transportId: recvTransportRef.current.id,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        },
        async (data) => {
          if (data?.error) {
            console.error('[REMOTE] ❌ Consume failed:', data.error);
            return reject(new Error(data.error));
          }

          try {
            console.log('[REMOTE] Consumer response received:', {
              consumerId: data.consumerId,
              kind: data.kind,
              producerKind: data.producerKind,
              producerUserId: data.producerUserId,
            });

            // Create consumer on recv transport
            const consumer = await recvTransportRef.current.consume({
              id: data.consumerId,
              producerId: data.producerId,
              kind: data.kind,
              rtpParameters: data.rtpParameters,
            });

            console.log('[REMOTE] Consumer created, track kind:', consumer.track.kind);

            consumersRef.current.set(producerId, consumer);

            // Create MediaStream and add track
            const stream = new MediaStream();
            stream.addTrack(consumer.track);

            console.log('[REMOTE] Stream created with track');

            // Find user role from participants
            const participant = participants.find((p) => p.userId === (data.producerUserId || userId));
            const userRole = participant?.role || 'student';

            const entry = {
              producerId,
              stream,
              userId: data.producerUserId || userId,
              role: userRole,
              kind: data.producerKind || data.kind,
            };

            console.log('[REMOTE] ✅ Adding to map:', {
              producerId,
              userId: entry.userId,
              role: entry.role,
              kind: entry.kind,
              streamTracks: stream.getTracks().length,
            });

            remoteStreamsMapRef.current.set(producerId, entry);
            updateRemoteStreams();

            //Resume consumer
            socketRef.current.emit('resume-consumer', { consumerId: consumer.id });
            console.log('[REMOTE] Consumer resumed');

            resolve(entry);
          } catch (err) {
            console.error('[REMOTE] Setup error:', err);
            reject(err);
          }
        },
      );
    });
  }

  /**
   * Update remote streams state from Map
   */
  function updateRemoteStreams() {
    const streams = Array.from(remoteStreamsMapRef.current.values());
    const cameras = streams.filter(s => s.kind !== 'screen');
    const screens = streams.filter(s => s.kind === 'screen');
    console.log('[STREAMS] Updated map:', {
      total: streams.length,
      cameras: cameras.length,
      screens: screens.length,
      entries: streams.map(s => ({ userId: s.userId, kind: s.kind, role: s.role })),
    });
    setRemoteStreams(new Map(remoteStreamsMapRef.current));
  }

  /**
   * Toggle mic
   */
  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    if (producersRef.current.audio) {
      if (next) producersRef.current.audio.resume();
      else producersRef.current.audio.pause();
    }
    console.log('[CONTROL] Mic:', next ? 'ON' : 'OFF');
  };

  /**
   * Toggle camera
   */
  const handleToggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    if (producersRef.current.video) {
      if (next) producersRef.current.video.resume();
      else producersRef.current.video.pause();
    }
    console.log('[CONTROL] Camera:', next ? 'ON' : 'OFF');
  };

  /**
   * Toggle screen share
   */
  const handleToggleShare = async () => {
    const next = !shareOn;

    if (next) {
      try {
        console.log('[SHARE] Requesting screen...');
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        });
        console.log('[SHARE] Screen stream obtained');
        setScreenStream(screen);

        const track = screen.getVideoTracks()[0];
        if (track) {
          const prod = await produce(sendTransportRef.current, track, {
            source: 'screen',
          });
          producersRef.current.screen = prod;
          console.log('[SHARE] Screen producer created');

          track.onended = () => {
            console.log('[SHARE] Screen ended by user');
            handleToggleShare();
          };
        }
        setShareOn(true);
      } catch (err) {
        console.error('[SHARE] Failed:', err);
        setError('Screen share failed: ' + err.message);
      }
    } else {
      // Stop screen sharing
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
        setScreenStream(null);
      }
      if (producersRef.current.screen) {
        const screenProdId = producersRef.current.screen.id;
        producersRef.current.screen.close();
        producersRef.current.screen = null;
        
        // Notify server to broadcast screen-closed event
        if (socketRef.current) {
          socketRef.current.emit('close-producer', { producerId: screenProdId });
          console.log('[SHARE] 📤 Notified server - screen producer closed:', screenProdId);
        }
      }
      setShareOn(false);
      console.log('[SHARE] 🛑 Stopped - all clients notified');
    }
  };

  /**
   * Toggle record
   */
  const handleToggleRecord = () => {
    const next = !recordOn;
    setRecordOn(next);
    if (socketRef.current) {
      socketRef.current.emit('toggle-record', { sessionId, enabled: next });
    }
    console.log('[RECORD]:', next ? 'STARTING' : 'STOPPED');
  };

  /**
   * End class
   */
  const handleEndClass = () => {
    if (!window.confirm('End class for everyone?')) return;
    if (socketRef.current && (user.role === 'teacher' || user.role === 'instructor')) {
      socketRef.current.emit('end-class', { sessionId });
    }
    localStorage.removeItem('sessionId');
    window.location.href = '/';
  };

  if (!user) {
    return (
      <div
        className="classroom-page theme-dark"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          {error ? (
            <>
              <div style={{ color: '#e84040', marginBottom: '16px' }}>⚠️ {error}</div>
              <div style={{ color: '#888', fontSize: '12px' }}>Redirecting...</div>
            </>
          ) : (
            <div>Loading classroom...</div>
          )}
        </div>
      </div>
    );
  }

  /**
   * For students: Extract teacher's/presenter's streams from remoteStreams
   * For teachers: Use their own local streams
   */
  let presenterLocalStream = localStream;
  let presenterScreenStream = screenStream;

  if (user.role === 'student' || user.role === 'student-guest') {
    console.log('[STUDENT-VIEW] Remote streams available:', remoteStreams.size, 'participants:', participants.length);
    
    // Find teacher in participants list
    const teacher = participants.find((p) => p.role === 'teacher' || p.role === 'instructor');
    
    if (teacher) {
      console.log('[STUDENT-VIEW] Found teacher:', teacher.name, 'userId:', teacher.userId);
      console.log('[STUDENT-VIEW] Remote stream entries:', Array.from(remoteStreams.entries()).map(([id, e]) => ({
        producerId: id,
        userId: e.userId,
        kind: e.kind,
        role: e.role
      })));
      
      // Find streams belonging to teacher
      for (const [producerId, entry] of remoteStreams.entries()) {
        console.log(`[STUDENT-VIEW] Checking stream ${producerId}: userId=${entry.userId} vs teacher=${teacher.userId}, match=${entry.userId === teacher.userId}`);
        if (entry.userId === teacher.userId) {
          if (entry.kind === 'screen') {
            presenterScreenStream = entry.stream;
            console.log('[STUDENT-VIEW] ✅ Found teacher SCREEN stream:', producerId);
          } else if (entry.kind === 'camera' || entry.kind === 'video') {
            presenterLocalStream = entry.stream;
            console.log('[STUDENT-VIEW] ✅ Found teacher CAMERA stream:', producerId, '(kind=' + entry.kind + ')');
          }
        }
      }
      
      if (!presenterLocalStream && !presenterScreenStream) {
        console.log('[STUDENT-VIEW] ❌ No streams found for teacher yet');
      }
    } else {
      console.log('[STUDENT-VIEW] ⚠️ Teacher not found in participants list');
    }
  }

  return (
    <div className="classroom-page theme-dark">
      <ClassroomNavbar sessionId={sessionId} userName={user.name} />

      <main className="classroom-main">
        <div className="video-area">
          <PresenterTile
            localStream={presenterLocalStream}
            screenStream={presenterScreenStream}
            presenterName={user.role === 'teacher' ? 'You' : 'Presenter'}
          />
          
          {/* Only teachers see student grid */}
          {(user.role === 'teacher' || user.role === 'instructor') && (
            <StudentTiles remoteStreams={remoteStreams} />
          )}
        </div>
        
        {/* Everyone sees participants panel */}
        <ParticipantsPanel participants={participants} />
      </main>

      {/* All users see controls (teachers get all buttons, students get Leave only) */}
      {(user.role === 'teacher' || user.role === 'instructor') && (
        <ControlsBar
          micOn={micOn}
          cameraOn={cameraOn}
          shareOn={shareOn}
          recordOn={recordOn}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          onToggleShare={handleToggleShare}
          onToggleRecord={handleToggleRecord}
          onEndClass={handleEndClass}
          userRole={user.role}
        />
      )}
      
      {(user.role === 'student' || user.role === 'student-guest') && (
        <ControlsBar
          userRole={user.role}
          onEndClass={handleEndClass}
        />
      )}
    </div>
  );
}

export default ClassroomPage;
