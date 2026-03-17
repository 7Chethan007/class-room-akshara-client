import { useCallback, useEffect, useRef, useState } from 'react';

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function useWebRTC(socket, sessionId, isInstructor) {
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [remoteStreams, setRemoteStreams] = useState([]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const cleanupPeer = useCallback((peerId) => {
    const peer = peersRef.current[peerId];
    if (peer) {
      peer.getSenders().forEach((s) => s.track && s.track.stop());
      peer.getReceivers().forEach((r) => r.track && r.track.stop());
      peer.close();
      delete peersRef.current[peerId];
    }
    setRemoteStreams((prev) => prev.filter((s) => s.id !== peerId));
  }, []);

  const createPeerConnection = useCallback(
    (peerId) => {
      if (peersRef.current[peerId]) return peersRef.current[peerId];
      const peer = new RTCPeerConnection(iceConfig);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          peer.addTrack(track, localStreamRef.current);
        });
      }

      peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('ice-candidate', {
            sessionId,
            candidate: event.candidate,
            to: peerId,
          });
        }
      };

      peer.ontrack = (event) => {
        const stream = event.streams[0];
        setRemoteStreams((prev) => {
          const exists = prev.find((s) => s.id === peerId);
          if (exists) {
            return prev.map((s) => (s.id === peerId ? { id: peerId, stream } : s));
          }
          return [...prev, { id: peerId, stream }];
        });
        setConnectionStatus('connected');
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setConnectionStatus('failed');
        }
      };

      peersRef.current[peerId] = peer;
      return peer;
    },
    [sessionId, socket]
  );

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
    });

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.autoplay = true;
      localVideoRef.current.playsInline = true;
    }

    Object.keys(peersRef.current).forEach((peerId) => {
      const peer = peersRef.current[peerId];
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    });

    if (socket) {
      socket.emit('webrtc-join', { sessionId, isInstructor }, ({ peers = [] } = {}) => {
        if (isInstructor) {
          peers.forEach((peerId) => {
            const peer = createPeerConnection(peerId);
            peer
              .createOffer()
              .then((offer) => peer.setLocalDescription(offer))
              .then(() => {
                socket.emit('offer', {
                  to: peerId,
                  sdp: peer.localDescription,
                  sessionId,
                });
              })
              .catch((err) => console.error('[WebRTC] Offer error', err));
          });
        }
      });
    }
  }, [createPeerConnection, isInstructor, sessionId, socket]);

  const stopCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (!isInstructor) return;
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    if (localStreamRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender && cameraTrack) {
          sender.replaceTrack(cameraTrack);
        }
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    setIsScreenSharing(false);
    socket?.emit('screen-share-stopped', { sessionId });
  }, [isInstructor, sessionId, socket]);

  const startScreenShare = useCallback(async () => {
    if (!isInstructor) return;
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', displaySurface: 'monitor' },
      audio: true,
    });

    screenStreamRef.current = screenStream;
    const videoTrack = screenStream.getVideoTracks()[0];

    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = screenStream;
    }

    setIsScreenSharing(true);
    socket?.emit('screen-share-started', { sessionId });

    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare();
      };
    }
  }, [isInstructor, sessionId, socket, stopScreenShare]);

  const uploadRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    if (blob.size === 0) return;
    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('file', blob, `recording-${sessionId}-${Date.now()}.webm`);
    try {
      await fetch('/api/recording/upload', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error('[Recording] Upload failed', err);
    } finally {
      setIsRecording(false);
    }
  }, [sessionId]);

  const startRecording = useCallback(() => {
    const streamToRecord = screenStreamRef.current || localStreamRef.current;
    if (!streamToRecord) {
      console.error('[Recording] No stream to record');
      return;
    }

    chunksRef.current = [];

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(streamToRecord, {
      mimeType,
      videoBitsPerSecond: 2500000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      await uploadRecording();
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
    socket?.emit('recording-started', { sessionId });
  }, [sessionId, socket, uploadRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      socket?.emit('recording-stopped', { sessionId });
    }
  }, [sessionId, socket]);

  const handleOffer = useCallback(
    async ({ from, sdp }) => {
      const peer = createPeerConnection(from);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket?.emit('answer', { to: from, sdp: peer.localDescription, sessionId });
    },
    [createPeerConnection, sessionId, socket]
  );

  const handleAnswer = useCallback(async ({ from, sdp }) => {
    const peer = peersRef.current[from];
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
  }, []);

  const handleCandidate = useCallback(async ({ from, candidate }) => {
    const peer = peersRef.current[from];
    if (!peer || !candidate) return;
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] ICE add error', err);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onOffer = (payload) => handleOffer(payload);
    const onAnswer = (payload) => handleAnswer(payload);
    const onCandidate = (payload) => handleCandidate(payload);
    const onPeerLeft = ({ peerId }) => cleanupPeer(peerId);
    const onPeerJoined = ({ peerId }) => {
      if (isInstructor && localStreamRef.current) {
        const peer = createPeerConnection(peerId);
        peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            socket.emit('offer', { to: peerId, sdp: peer.localDescription, sessionId });
          })
          .catch((err) => console.error('[WebRTC] Offer error', err));
      }
    };

    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onCandidate);
    socket.on('peer-left', onPeerLeft);
    socket.on('peer-joined', onPeerJoined);

    return () => {
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onCandidate);
      socket.off('peer-left', onPeerLeft);
      socket.off('peer-joined', onPeerJoined);
    };
  }, [cleanupPeer, createPeerConnection, handleAnswer, handleCandidate, handleOffer, isInstructor, sessionId, socket]);

  useEffect(() => {
    return () => {
      Object.keys(peersRef.current).forEach(cleanupPeer);
      stopRecording();
      stopScreenShare();
      stopCamera();
    };
  }, [cleanupPeer, stopCamera, stopRecording, stopScreenShare]);

  return {
    localVideoRef,
    remoteStreams,
    isScreenSharing,
    isRecording,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    startRecording,
    stopRecording,
    connectionStatus,
  };
}
