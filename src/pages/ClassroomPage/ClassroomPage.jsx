import { useState, useEffect, useRef } from 'react';
import ClassroomNavbar from '../../components/ClassroomNavbar/ClassroomNavbar';
import PresenterTile from '../../components/PresenterTile/PresenterTile';
import StudentTiles from '../../components/StudentTiles/StudentTiles';
import ParticipantsPanel from '../../components/ParticipantsPanel/ParticipantsPanel';
import TranscriptionPanel from '../../components/TranscriptionPanel/TranscriptionPanel';
import ControlsBar from '../../components/ControlsBar/ControlsBar';
import { useTranscription } from '../../hooks/useTranscription';
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
 * Helper function to encode raw audio samples to WAV format
 */
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Audio data (quantize to 16-bit PCM)
  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    index += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

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
  const [transcriptVisible, setTranscriptVisible] = useState(false);

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef({});
  const consumersRef = useRef(new Map());
  const remoteStreamsMapRef = useRef(new Map()); // producerId -> { stream, userId, kind }
  const audioRecorderRef = useRef(null); // MediaRecorder for capturing teacher's audio
  
  // Web Audio refs for transcription capture
  const audioContextRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const processorRef = useRef(null);
  const processingAudioRef = useRef(false);

  // Transcription hook
  const transcription = useTranscription(socketRef, sessionId ? String(sessionId) : null, user?._id || user?.id);

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
        // CLEANUP: Clear any stale remote streams from previous sessions
        console.log('[SETUP] 🧹 Clearing stale remote streams...');
        remoteStreamsMapRef.current.forEach((stream) => {
          stream.track?.stop();
        });
        remoteStreamsMapRef.current.clear();
        setRemoteStreams(new Map());
        consumersRef.current.clear();

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

                // Setup audio capture for transcription (teacher only)
                console.log('[TRANSCRIPTION] Setting up Web Audio capture...');
                try {
                  // Use the reusable setupWebAudioCapture function
                  const audioSetupSuccess = await setupWebAudioCapture(audioTrack);
                  
                  if (audioSetupSuccess) {
                    // Start transcription
                    const started = await transcription.startTranscription();
                    console.log('[TRANSCRIPTION] startTranscription() returned:', started);
                  } else {
                    throw new Error('Web Audio capture setup failed');
                  }
                } catch (err) {
                  console.warn('[TRANSCRIPTION] Web Audio setup failed:', err.message);
                  console.log('[TRANSCRIPTION] Falling back to MediaRecorder method...');
                  
                  // Fallback to MediaRecorder if Web Audio fails
                  try {
                    const audioStream = new MediaStream([audioTrack]);
                    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
                      ? 'audio/webm'
                      : 'audio/wav';

                    const mediaRecorder = new MediaRecorder(audioStream, { mimeType });
                    audioRecorderRef.current = mediaRecorder;
                    console.log('[TRANSCRIPTION] Using fallback MediaRecorder with mimeType:', mimeType);

                    let chunkCount = 0;
                    let lastChunkTime = 0;

                    mediaRecorder.ondataavailable = (evt) => {
                      if (evt.data && evt.data.size > 0) {
                        chunkCount++;
                        const now = Date.now();
                        const timeSinceLastChunk = now - lastChunkTime;

                        console.log(`[TRANSCRIPTION] Chunk #${chunkCount}: ${evt.data.size} bytes, time: ${timeSinceLastChunk}ms`);

                        if (timeSinceLastChunk > 500) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const base64 = reader.result.split(',')[1];
                            console.log(`[TRANSCRIPTION] Sending chunk: ${base64.length} bytes`);
                            if (transcription.sendAudioChunk) {
                              transcription.sendAudioChunk(base64, now - (lastChunkTime | 0));
                            }
                          };
                          reader.readAsDataURL(evt.data);
                          lastChunkTime = now;
                        }
                      }
                    };

                    mediaRecorder.start(1000);
                    const started = await transcription.startTranscription();
                    console.log('[TRANSCRIPTION] Fallback method started:', started);
                  } catch (fbErr) {
                    console.error('[TRANSCRIPTION] Fallback also failed:', fbErr.message);
                  }
                }
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

            // Infer stream kind so we can correctly place screen vs camera (PiP)
            let inferredKind = data.producerKind || data.kind;
            const trackSettings = consumer.track?.getSettings ? consumer.track.getSettings() : {};
            const label = consumer.track?.label || '';

            // DisplayMedia tracks expose displaySurface; labels often contain screen/display keywords
            if (trackSettings.displaySurface || /screen|display|monitor|window/i.test(label)) {
              inferredKind = 'screen';
            } else if (!inferredKind && consumer.track?.kind) {
              inferredKind = consumer.track.kind;
            }

            const entry = {
              producerId,
              stream,
              userId: data.producerUserId || userId,
              role: userRole,
              kind: inferredKind,
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
   * Setup or reconnect Web Audio capture for transcription
   * Call this whenever audio track changes (initial setup, mic toggle ON, etc.)
   */
  async function setupWebAudioCapture(audioTrack) {
    try {
      // Disconnect old processor if it exists
      if (processorRef.current && mediaSourceRef.current) {
        mediaSourceRef.current.disconnect();
        processorRef.current.disconnect();
        console.log('[TRANSCRIPTION] ✅ Disconnected old Web Audio processor');
      }

      // Create or reuse audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        console.log('[TRANSCRIPTION] Created new AudioContext');
      }
      const audioContext = audioContextRef.current;

      // Create new media source from the fresh audio track
      mediaSourceRef.current = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      console.log('[TRANSCRIPTION] Created new MediaStreamSource from fresh audio track');

      // Create new processor
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect processor
      mediaSourceRef.current.connect(processor);
      processor.connect(audioContext.destination);

      // Setup audio processing callback
      processor.onaudioprocess = (event) => {
        if (processingAudioRef.current) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // Only send chunks that have actual audio (not silence)
        const hasAudio = inputData.some(sample => Math.abs(sample) > 0.01);

        if (hasAudio) {
          processingAudioRef.current = true;
          // Convert audio samples to WAV format
          const wavBlob = encodeWAV(inputData, audioContext.sampleRate);

          // Convert blob to base64
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            console.log(`[TRANSCRIPTION] Sending audio chunk: ${base64.length} bytes`);

            if (transcription.sendAudioChunk) {
              transcription.sendAudioChunk(base64, Date.now());
            }
            processingAudioRef.current = false;
          };
          reader.readAsDataURL(wavBlob);
        }
      };

      console.log('[TRANSCRIPTION] ✅ Web Audio capture reconnected to fresh track');
      return true;
    } catch (err) {
      console.error('[TRANSCRIPTION] ❌ Failed to setup Web Audio capture:', err.message);
      return false;
    }
  }

  /**
   * Toggle microphone - properly stops/restarts audio hardware and transcription
   */
  const handleToggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    
    if (next) {
      // RE-ENABLE: Get fresh audio stream and RESTART TRANSCRIPTION
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
        const audioTrack = newStream.getAudioTracks()[0];
        if (audioTrack && producersRef.current.audio) {
          await producersRef.current.audio.replaceTrack(audioTrack);
          // Update localStream with new audio track
          localStream.getAudioTracks().forEach(t => t.stop());
          localStream.addTrack(audioTrack);
          producersRef.current.audio.resume();
          console.log('[CONTROL] 🎤 Audio producer resumed with fresh track');
          
          // CRITICAL: Reconnect Web Audio processor to the new track
          console.log('[CONTROL] 🔌 Reconnecting Web Audio capture to new track...');
          const audioSetupSuccess = await setupWebAudioCapture(audioTrack);
          if (!audioSetupSuccess) {
            console.warn('[CONTROL] ⚠️ Web Audio capture setup failed, but continuing...');
          }
          
          // CRITICAL: Restart transcription with new audio track
          if (transcription && typeof transcription.startTranscription === 'function') {
            console.log('[CONTROL] 🔄 Restarting transcription with new audio track...');
            const transcStarted = await transcription.startTranscription();
            console.log('[CONTROL] 🎙️ Transcription restarted:', transcStarted);
          }
        }
      } catch (err) {
        console.error('[CONTROL] ❌ Failed to re-enable mic:', err);
        setMicOn(false);
      }
    } else {
      // DISABLE: Stop audio hardware and transcription
      if (transcription && typeof transcription.stopTranscription === 'function') {
        console.log('[CONTROL] 🛑 Stopping transcription...');
        await transcription.stopTranscription();
      }
      
      if (localStream) {
        localStream.getAudioTracks().forEach((t) => {
          t.stop(); // Fully release audio hardware
        });
      }
      
      if (producersRef.current.audio) {
        producersRef.current.audio.pause();
        console.log('[CONTROL] 🎤 Audio producer paused and track stopped');
      }
    }
    
    console.log('[CONTROL] Mic:', next ? 'ON ✅ (fresh hardware)' : 'OFF (hardware released) ⏸️');
  };

  /**
   * Toggle camera - properly stops/restarts video hardware
   */
  const handleToggleCamera = async () => {
    const next = !cameraOn;
    setCameraOn(next);
    
    if (next) {
      // RE-ENABLE: Get fresh video stream from camera
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        const videoTrack = newStream.getVideoTracks()[0];
        if (videoTrack && producersRef.current.video) {
          await producersRef.current.video.replaceTrack(videoTrack);
          // Update localStream with new video track
          localStream.getVideoTracks().forEach(t => t.stop());
          localStream.addTrack(videoTrack);
          producersRef.current.video.resume();
          console.log('[CONTROL] 🎥 Video producer resumed with fresh track');
        }
      } catch (err) {
        console.error('[CONTROL] ❌ Failed to re-enable camera:', err);
        setCameraOn(false);
      }
    } else {
      // DISABLE: Stop video hardware completely - THIS TURNS OFF THE PHYSICAL CAMERA LIGHT
      if (localStream) {
        localStream.getVideoTracks().forEach((t) => {
          t.stop(); // Fully release camera hardware - LIGHT WILL TURN OFF
        });
      }
      
      if (producersRef.current.video) {
        producersRef.current.video.pause();
        console.log('[CONTROL] 🎥 Video producer paused and track stopped - CAMERA LIGHT OFF');
      }
    }
    
    console.log('[CONTROL] Camera:', next ? 'ON ✅ (fresh hardware)' : 'OFF (hardware released - light off) ⏸️');
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
  /**
   * Toggle transcription visibility
   */
  const handleToggleTranscript = () => {
    setTranscriptVisible((prev) => !prev);
    transcription.toggleVisibility();
    console.log('[CONTROL] Transcript:', transcriptVisible ? 'HIDDEN' : 'VISIBLE');
  };

  const handleEndClass = () => {
    if (!window.confirm('End class for everyone?')) return;
    
    // Stop transcription if recording
    if (transcription.isRecording) {
      transcription.stopTranscription().catch((err) => {
        console.warn('[TRANSCRIPTION] Stop error:', err);
      });
    }

    // Stop audio recording
    if (audioRecorderRef.current) {
      try {
        audioRecorderRef.current.stop();
      } catch (e) {
        console.warn('[TRANSCRIPTION] Could not stop recorder:', e);
      }
    }

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
          transcriptOn={transcriptVisible}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          onToggleShare={handleToggleShare}
          onToggleRecord={handleToggleRecord}
          onToggleTranscript={handleToggleTranscript}
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

      {/* Transcription panel - only visible when toggled by teacher */}
      {(user.role === 'teacher' || user.role === 'instructor') && (
        <TranscriptionPanel
          segments={transcription.segments}
          isRecording={transcription.isRecording}
          fullText={transcription.fullText}
          isVisible={transcriptVisible && transcription.isRecording}
        />
      )}
    </div>
  );
}

export default ClassroomPage;
