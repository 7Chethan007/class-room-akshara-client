/* ClassRoom Live — Classroom page logic (vanilla JS) */
const API_BASE = '/api';
const SOCKET_URL = window.location.origin;

let socket = null;
let device = null;
let sendTransport = null;
let recvTransport = null;
let cameraStream = null;
let screenStream = null;
const producers = {}; // kind -> producer
let mediaRecorder = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let currentUserRole = 'student';
let activeSessionId = null;
let currentToken = null;
let transcriptRecognition = null;
let transcriptEnabled = false;
let transcriptBuffer = [];
let transcriptFlushTimer = null;
const consumedProducerIds = new Set();
const transcriptStatus = { whisperEnabled: false };

function setButtonState(button, isActive, onText, offText) {
  if (!button) return;
  button.classList.toggle('active', isActive);
  button.textContent = isActive ? onText : offText;
}

/**
 * guardAuth — ensure token/user/sessionId exist
 */
function guardAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const sessionId = localStorage.getItem('sessionId');
  if (!token || !user || !sessionId) {
    window.location.href = 'index.html';
    return null;
  }
  return { token, user: JSON.parse(user), sessionId };
}

/**
 * setSubjectLabel — updates topbar subject text
 */
function setSubjectLabel(subject) {
  const el = document.querySelector('.tb-subject');
  if (el) el.textContent = subject || 'Live Class';
}

/**
 * setPresenterName — updates presenter label with user name
 */
function setPresenterName(name) {
  const el = document.querySelector('.presenter-name');
  if (el) el.textContent = name || 'Presenter';
}

/**
 * connectSocket — initializes socket.io connection
 */
function connectSocket(token, sessionId, user) {
  socket = io(SOCKET_URL, { auth: { token } });

  socket.on('connect', () => {
    console.log('Socket connected', socket.id);
    socket.emit('join-room', {
      sessionId,
      userId: user._id || user.id,
      role: user.role,
      name: user.name,
    });
    addParticipant({ userId: user._id || user.id, role: user.role, name: user.name });
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error', err.message);
    alert('Connection failed. Redirecting...');
    window.location.href = 'index.html';
  });

  socket.on('user-joined', addParticipant);
  socket.on('user-left', removeParticipant);
  socket.on('class-ended', handleClassEnded);
  socket.on('chat-message', ({ name, message }) => console.log(`${name}: ${message}`));
  socket.on('new-producer', ({ producerId, userId, kind }) => {
    console.log('New producer', producerId, kind);
    fetchProducers(sessionId);
  });
}

/**
 * addParticipant — renders participant row
 */
function addParticipant({ userId, role, name }) {
  const list = document.querySelector('.panel-list');
  if (!list) return;
  const id = `p-${userId}`;
  if (document.getElementById(id)) return;
  const color = getColor(userId);
  const div = document.createElement('div');
  div.id = id;
  div.className = 'p-item';
  div.innerHTML = `
    <div class="p-av" style="background:${color}">${getInitials(name)}</div>
    <div class="p-name">${name} • ${role}</div>
  `;
  list.appendChild(div);
  updateParticipantCount();
}

/**
 * removeParticipant — removes participant row
 */
function removeParticipant({ userId }) {
  const el = document.getElementById(`p-${userId}`);
  if (el && el.parentNode) el.parentNode.removeChild(el);
  updateParticipantCount();
}

/**
 * handleClassEnded — cleanup and redirect
 */
function handleClassEnded() {
  alert('Class has ended');
  localStorage.setItem('lastEndedSessionId', activeSessionId || localStorage.getItem('sessionId') || '');
  localStorage.removeItem('sessionId');
  setTimeout(() => (window.location.href = 'index.html'), 2000);
}

/**
 * initMediasoup — sets up device and transports
 */
async function initMediasoup(sessionId) {
  device = new mediasoupClient.Device();
  const rtpCaps = await emitAsync('get-router-rtp-capabilities', { sessionId });
  await device.load({ routerRtpCapabilities: rtpCaps });

  const sendParams = await emitAsync('create-transport', { sessionId, direction: 'send' });
  sendTransport = device.createSendTransport(sendParams);
  sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitAsync('connect-transport', { transportId: sendTransport.id, dtlsParameters })
      .then(callback)
      .catch(errback);
  });
  sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
    emitAsync('produce', {
      transportId: sendTransport.id,
      kind,
      rtpParameters,
      sessionId,
      appData: appData || {},
    })
      .then(({ producerId }) => {
        callback({ id: producerId });
      })
      .catch(errback);
  });

  const recvParams = await emitAsync('create-transport', { sessionId, direction: 'recv' });
  recvTransport = device.createRecvTransport(recvParams);
  recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitAsync('connect-transport', { transportId: recvTransport.id, dtlsParameters })
      .then(callback)
      .catch(errback);
  });
}

/**
 * startLocalStreams — gets camera/screen and produces
 */
async function startLocalStreams(role) {
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  attachVideo('.presenter-tile', cameraStream);

  const videoTrack = cameraStream.getVideoTracks()[0];
  const audioTrack = cameraStream.getAudioTracks()[0];
  if (videoTrack) producers.video = await sendTransport.produce({ track: videoTrack, appData: { source: 'camera' } });
  if (audioTrack) producers.audio = await sendTransport.produce({ track: audioTrack, appData: { source: 'mic' } });
}

/**
 * fetchProducers — consumes existing producers
 */
async function fetchProducers(sessionId) {
  const { producers: list } = await emitAsync('get-producers', { sessionId });
  for (const p of list) {
    if (consumedProducerIds.has(p.producerId || p.id)) {
      continue;
    }
    await consumeProducer(sessionId, p.producerId || p.id);
  }
}

/**
 * consumeProducer — create consumer and render track
 */
async function consumeProducer(sessionId, producerId) {
  const params = await emitAsync('consume', {
    sessionId,
    producerId,
    transportId: recvTransport.id,
    rtpCapabilities: device.rtpCapabilities,
  });
  const consumer = await recvTransport.consume({
    id: params.consumerId || params.id,
    producerId,
    kind: params.kind,
    rtpParameters: params.rtpParameters,
  });
  consumedProducerIds.add(producerId);
  const stream = new MediaStream([consumer.track]);
  attachRemoteStream(stream, {
    kind: params.kind,
    producerKind: params.producerKind,
    producerUserId: params.producerUserId,
  });
  await emitAsync('resume-consumer', { consumerId: consumer.id });
}

/**
 * emitAsync — promisified socket.emit
 */
function emitAsync(event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (res && res.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}

/**
 * attachVideo — append video/audio element to selector
 */
function attachVideo(selector, stream, kind = 'video') {
  const container = document.querySelector(selector);
  if (!container) return;
  const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
  el.autoplay = true;
  el.playsInline = true;
  el.muted = selector === '.presenter-tile'; // self view muted
  el.srcObject = stream;
  if (kind !== 'audio') {
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.objectFit = 'cover';
  }
  container.appendChild(el);
}

function attachRemoteStream(stream, meta) {
  const kind = meta.producerKind || meta.kind;

  if (kind === 'audio') {
    attachVideo('body', stream, 'audio');
    return;
  }

  if (kind === 'screen') {
    const existing = document.querySelector('.presenter-tile video.remote-screen');
    if (existing) {
      existing.srcObject = stream;
      return;
    }
    const tile = document.querySelector('.presenter-tile');
    if (!tile) return;
    const screenVideo = document.createElement('video');
    screenVideo.className = 'remote-screen';
    screenVideo.autoplay = true;
    screenVideo.playsInline = true;
    screenVideo.srcObject = stream;
    screenVideo.style.position = 'absolute';
    screenVideo.style.inset = '0';
    screenVideo.style.width = '100%';
    screenVideo.style.height = '100%';
    screenVideo.style.objectFit = 'cover';
    tile.appendChild(screenVideo);
    return;
  }

  if (kind === 'video' && currentUserRole === 'student') {
    const existing = document.querySelector('.presenter-tile video.remote-presenter');
    if (existing) {
      existing.srcObject = stream;
      return;
    }
    const tile = document.querySelector('.presenter-tile');
    if (!tile) return;
    const presenterVideo = document.createElement('video');
    presenterVideo.className = 'remote-presenter';
    presenterVideo.autoplay = true;
    presenterVideo.playsInline = true;
    presenterVideo.srcObject = stream;
    presenterVideo.style.position = 'absolute';
    presenterVideo.style.inset = '0';
    presenterVideo.style.width = '100%';
    presenterVideo.style.height = '100%';
    presenterVideo.style.objectFit = 'cover';
    tile.appendChild(presenterVideo);
    return;
  }

  attachVideo('.student-tiles', stream, 'video');
}

async function uploadSessionRecording(token, sessionId, blob, durationMs) {
  const formData = new FormData();
  formData.append('recording', blob, `session-${sessionId}.webm`);
  formData.append('durationMs', String(durationMs || 0));

  const res = await fetch(`${API_BASE}/session/${sessionId}/recording/file`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || 'Failed to upload recording');
  }
}

async function transcribeSessionRecording(token, sessionId) {
  const res = await fetch(`${API_BASE}/session/${sessionId}/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || 'Failed to transcribe recording');
  }

  return res.json().catch(() => ({}));
}

async function flushTranscript(token, sessionId) {
  const text = transcriptBuffer.join(' ').trim();
  if (!text) return;
  transcriptBuffer = [];

  const res = await fetch(`${API_BASE}/session/${sessionId}/transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || 'Failed to save transcript');
  }
}

function startSpeechRecognition(token, sessionId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser.');
    return false;
  }

  transcriptRecognition = new SpeechRecognition();
  transcriptRecognition.continuous = true;
  transcriptRecognition.interimResults = false;
  transcriptRecognition.lang = 'en-US';

  transcriptRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        transcriptBuffer.push(result[0].transcript.trim());
      }
    }
  };

  transcriptRecognition.onend = () => {
    if (transcriptEnabled && transcriptRecognition) {
      transcriptRecognition.start();
    }
  };

  transcriptRecognition.start();
  transcriptFlushTimer = setInterval(() => {
    flushTranscript(token, sessionId).catch((err) => {
      console.warn('Transcript flush failed:', err.message);
    });
  }, 5000);
  return true;
}

async function stopSpeechRecognition(token, sessionId) {
  transcriptEnabled = false;
  if (transcriptRecognition) {
    transcriptRecognition.onend = null;
    transcriptRecognition.stop();
    transcriptRecognition = null;
  }
  if (transcriptFlushTimer) {
    clearInterval(transcriptFlushTimer);
    transcriptFlushTimer = null;
  }
  try {
    await flushTranscript(token, sessionId);
  } catch (err) {
    console.warn('Final transcript flush failed:', err.message);
  }
}

async function startRecordingCapture() {
  const tracks = [];
  if (cameraStream) tracks.push(...cameraStream.getTracks());
  if (screenStream) tracks.push(...screenStream.getVideoTracks());
  const mixedStream = new MediaStream(tracks.filter((t) => t.readyState === 'live'));
  if (!mixedStream.getTracks().length) {
    throw new Error('No active tracks to record');
  }

  const preferredMimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  const selectedMimeType = preferredMimeTypes.find(
    (mime) => window.MediaRecorder && MediaRecorder.isTypeSupported(mime)
  );

  if (!window.MediaRecorder) {
    throw new Error('MediaRecorder is not supported in this browser');
  }

  recordingChunks = [];
  mediaRecorder = selectedMimeType
    ? new MediaRecorder(mixedStream, { mimeType: selectedMimeType })
    : new MediaRecorder(mixedStream);
  recordingStartedAt = Date.now();

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordingChunks.push(event.data);
    }
  };

  mediaRecorder.start(1000);
}

function stopRecordingCapture() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const blobType = mediaRecorder.mimeType || 'video/webm';
      const blob = new Blob(recordingChunks, { type: blobType });
      const durationMs = Date.now() - recordingStartedAt;
      mediaRecorder = null;
      recordingChunks = [];
      resolve({ blob, durationMs });
    };

    mediaRecorder.stop();
  });
}

// Helpers
function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
function getColor(userId = 'u') {
  const colors = ['#5B7FD4', '#6BAA7A', '#D47A5B', '#A06BB8', '#D4A55B', '#7BAAD4', '#AA6B6B', '#7A9E7A', '#B07AAA'];
  const code = userId.charCodeAt(0) || 0;
  return colors[code % colors.length];
}
function updateParticipantCount() {
  const count = document.querySelectorAll('.panel-list .p-item').length;
  const badge = document.querySelector('.panel-count');
  if (badge) badge.textContent = count;
}

/**
 * startTimer — simple HH:MM:SS counter
 */
function startTimer() {
  const timerEl = document.querySelector('.tb-timer');
  let seconds = 0;
  setInterval(() => {
    seconds += 1;
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

/**
 * bindControls — mic/cam/share/transcript/record/end
 */
function bindControls(user, token, sessionId) {
  const role = user.role;
  const buttons = document.querySelectorAll('.ctrl-btn');
  if (buttons.length < 6) return;
  const [micBtn, camBtn, shareBtn, transcriptBtn, recordBtn, endBtn] = buttons;

  setButtonState(micBtn, true, '🎤 Mic On', '🎤 Mic Off');
  setButtonState(camBtn, true, '📷 Camera On', '📷 Camera Off');
  setButtonState(shareBtn, false, '🖥 Sharing', '🖥 Share');

  if (role !== 'teacher') {
    shareBtn.style.display = 'none';
    transcriptBtn.style.display = 'none';
    recordBtn.style.display = 'none';
    endBtn.style.display = 'none';
  }

  micBtn.addEventListener('click', () => {
    const p = producers.audio;
    const audioTrack = cameraStream?.getAudioTracks?.()[0];
    const nextOff = micBtn.classList.contains('active');
    if (nextOff) {
      p?.pause?.();
      if (audioTrack) audioTrack.enabled = false;
      setButtonState(micBtn, false, '🎤 Mic On', '🎤 Mic Off');
    } else {
      p?.resume?.();
      if (audioTrack) audioTrack.enabled = true;
      setButtonState(micBtn, true, '🎤 Mic On', '🎤 Mic Off');
    }
  });

  camBtn.addEventListener('click', () => {
    const p = producers.video;
    const videoTrack = cameraStream?.getVideoTracks?.()[0];
    const nextOff = camBtn.classList.contains('active');
    if (nextOff) {
      p?.pause?.();
      if (videoTrack) videoTrack.enabled = false;
      setButtonState(camBtn, false, '📷 Camera On', '📷 Camera Off');
    } else {
      p?.resume?.();
      if (videoTrack) videoTrack.enabled = true;
      setButtonState(camBtn, true, '📷 Camera On', '📷 Camera Off');
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (role !== 'teacher') return;
    const currentlySharing = shareBtn.classList.contains('active');
    if (currentlySharing) {
      producers.screen?.close?.();
      producers.screen = null;
      screenStream?.getTracks?.().forEach((track) => track.stop());
      screenStream = null;
      setButtonState(shareBtn, false, '🖥 Sharing', '🖥 Share');
      document.querySelector('.screen-badge')?.classList.add('hidden');
      socket.emit('toggle-screen-share', { sessionId, enabled: false });
      return;
    }

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screenStream.getVideoTracks()[0];
      if (!track) {
        throw new Error('No screen track selected');
      }

      track.onended = () => {
        producers.screen?.close?.();
        producers.screen = null;
        screenStream = null;
        setButtonState(shareBtn, false, '🖥 Sharing', '🖥 Share');
        document.querySelector('.screen-badge')?.classList.add('hidden');
        socket.emit('toggle-screen-share', { sessionId, enabled: false });
      };

      producers.screen = await sendTransport.produce({
        track,
        appData: { source: 'screen' },
      });
      setButtonState(shareBtn, true, '🖥 Sharing', '🖥 Share');
      document.querySelector('.screen-badge')?.classList.remove('hidden');
      socket.emit('toggle-screen-share', { sessionId, enabled: true });
    } catch (err) {
      console.warn('Screen share failed:', err.message);
      setButtonState(shareBtn, false, '🖥 Sharing', '🖥 Share');
    }
  });

  transcriptBtn.addEventListener('click', () => {
    const enabled = !transcriptBtn.classList.contains('active');
    transcriptBtn.classList.toggle('active');
    transcriptBtn.textContent = enabled ? '📝 Transcript On' : '📝 Transcript';
    socket.emit('toggle-transcript', { sessionId, enabled });
    if (enabled) {
      transcriptEnabled = true;
      transcriptStatus.whisperEnabled = true;
      const started = startSpeechRecognition(token, sessionId);
      if (!started) {
        transcriptEnabled = false;
        transcriptBtn.textContent = '📝 Whisper Pending';
      }
    } else {
      transcriptStatus.whisperEnabled = false;
      stopSpeechRecognition(token, sessionId);
    }
  });

  recordBtn.addEventListener('click', async () => {
    const enabled = !recordBtn.classList.contains('active');
    recordBtn.classList.toggle('active');
    recordBtn.textContent = enabled ? '⏺ Recording...' : '⏺ Record';
    socket.emit('toggle-record', { sessionId, enabled });

    if (enabled) {
      try {
        await startRecordingCapture();
      } catch (err) {
        recordBtn.classList.remove('active');
        recordBtn.textContent = '⏺ Record';
        alert(`Recording failed: ${err.message}`);
      }
      return;
    }

    try {
      const payload = await stopRecordingCapture();
      if (payload?.blob && payload.blob.size > 0) {
        await uploadSessionRecording(token, sessionId, payload.blob, payload.durationMs);
        if (transcriptStatus.whisperEnabled) {
          try {
            await transcribeSessionRecording(token, sessionId);
          } catch (transcribeErr) {
            console.warn('Whisper transcription failed:', transcribeErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('Recording upload failed:', err.message);
    }
  });

  endBtn.addEventListener('click', async () => {
    if (role !== 'teacher') return;
    if (!confirm('End the class for everyone?')) return;
    try {
      if (recordBtn.classList.contains('active')) {
        recordBtn.classList.remove('active');
        recordBtn.textContent = '⏺ Record';
        const payload = await stopRecordingCapture();
        if (payload?.blob && payload.blob.size > 0) {
          await uploadSessionRecording(token, sessionId, payload.blob, payload.durationMs);
          if (transcriptStatus.whisperEnabled) {
            try {
              await transcribeSessionRecording(token, sessionId);
            } catch (transcribeErr) {
              console.warn('Whisper transcription failed:', transcribeErr.message);
            }
          }
        }
      }

      if (transcriptEnabled) {
        transcriptBtn.classList.remove('active');
        transcriptBtn.textContent = '📝 Transcript';
        await stopSpeechRecognition(token, sessionId);
      }

      await fetch(`${API_BASE}/session/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
    } catch (err) {
      console.warn('End session API failed', err.message);
    }
    socket.emit('end-class', { sessionId });
    localStorage.removeItem('sessionId');
    window.location.href = 'index.html';
  });
}

/**
 * bindChat — minimal console chat
 */
function bindChat(user, sessionId) {
  const sendBtn = document.querySelector('.chat-send');
  const input = document.querySelector('.chat-input');
  if (!sendBtn || !input) return;
  sendBtn.addEventListener('click', () => {
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chat-message', { sessionId, name: user.name, message: msg });
    input.value = '';
  });
}

/**
 * cleanup — stop tracks on unload
 */
function cleanup(sessionId, userId) {
  window.addEventListener('beforeunload', () => {
    socket?.emit('leave-room', { sessionId, userId });
    cameraStream?.getTracks().forEach((t) => t.stop());
    screenStream?.getTracks().forEach((t) => t.stop());
  });
}

// Main flow
document.addEventListener('DOMContentLoaded', async () => {
  const ctx = guardAuth();
  if (!ctx) return;
  const { token, user, sessionId } = ctx;
  currentUserRole = user.role;
  activeSessionId = sessionId;
  currentToken = token;
  setSubjectLabel(localStorage.getItem('subject') || 'Live Class');
  setPresenterName(user.name);
  connectSocket(token, sessionId, user);
  startTimer();
  bindChat(user, sessionId);

  try {
    await initMediasoup(sessionId);
    await startLocalStreams(user.role);
    await fetchProducers(sessionId);
  } catch (err) {
    console.warn('Media init failed:', err.message);
  }

  bindControls(user, token, sessionId);
  cleanup(sessionId, user._id);
});
