/* ClassRoom Live — Classroom page logic (vanilla JS) */
const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

let socket = null;
let device = null;
let sendTransport = null;
let recvTransport = null;
let cameraStream = null;
let screenStream = null;
const producers = {}; // kind -> producer

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
 * connectSocket — initializes socket.io connection
 */
function connectSocket(token, sessionId, user) {
  socket = io(SOCKET_URL, { auth: { token } });

  socket.on('connect', () => {
    console.log('Socket connected', socket.id);
    socket.emit('join-room', {
      sessionId,
      userId: user._id,
      role: user.role,
      name: user.name,
    });
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
  sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
    emitAsync('produce', { transportId: sendTransport.id, kind, rtpParameters, sessionId })
      .then(({ producerId }) => {
        producers[kind] = { id: producerId };
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
  if (videoTrack) producers.video = await sendTransport.produce({ track: videoTrack });
  if (audioTrack) producers.audio = await sendTransport.produce({ track: audioTrack });

  if (role === 'teacher') {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(() => null);
    if (screenStream) {
      const screenTrack = screenStream.getVideoTracks()[0];
      producers.screen = await sendTransport.produce({ track: screenTrack });
      document.querySelector('.screen-badge')?.classList.remove('hidden');
    }
  }
}

/**
 * fetchProducers — consumes existing producers
 */
async function fetchProducers(sessionId) {
  const { producers: list } = await emitAsync('get-producers', { sessionId });
  for (const p of list) {
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
  const stream = new MediaStream([consumer.track]);
  attachVideo('.student-tiles', stream, params.kind);
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
  container.appendChild(el);
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
function bindControls(role, token, sessionId) {
  const buttons = document.querySelectorAll('.ctrl-btn');
  if (buttons.length < 6) return;
  const [micBtn, camBtn, shareBtn, transcriptBtn, recordBtn, endBtn] = buttons;

  if (role !== 'teacher') {
    shareBtn.style.display = 'none';
    transcriptBtn.style.display = 'none';
    recordBtn.style.display = 'none';
    endBtn.style.display = 'none';
  }

  micBtn.addEventListener('click', () => {
    const p = producers.audio;
    if (!p) return;
    if (micBtn.classList.contains('active')) {
      p.pause();
      micBtn.classList.remove('active');
      micBtn.textContent = '🎤 Mic Off';
    } else {
      p.resume();
      micBtn.classList.add('active');
      micBtn.textContent = '🎤 Mic On';
    }
  });

  camBtn.addEventListener('click', () => {
    const p = producers.video;
    if (!p) return;
    if (camBtn.classList.contains('active')) {
      p.pause();
      camBtn.classList.remove('active');
      camBtn.textContent = '📷 Camera Off';
    } else {
      p.resume();
      camBtn.classList.add('active');
      camBtn.textContent = '📷 Camera On';
    }
  });

  shareBtn.addEventListener('click', async () => {
    if (role !== 'teacher') return;
    if (shareBtn.classList.contains('active')) {
      producers.screen?.pause();
      shareBtn.classList.remove('active');
      document.querySelector('.screen-badge')?.classList.add('hidden');
    } else {
      if (!screenStream) {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true }).catch(() => null);
        if (screenStream) {
          const track = screenStream.getVideoTracks()[0];
          producers.screen = await sendTransport.produce({ track });
        }
      }
      shareBtn.classList.add('active');
      document.querySelector('.screen-badge')?.classList.remove('hidden');
    }
  });

  transcriptBtn.addEventListener('click', () => {
    const enabled = !transcriptBtn.classList.contains('active');
    transcriptBtn.classList.toggle('active');
    transcriptBtn.textContent = enabled ? '📝 Transcript On' : '📝 Transcript';
    socket.emit('toggle-transcript', { sessionId, enabled });
  });

  recordBtn.addEventListener('click', () => {
    const enabled = !recordBtn.classList.contains('active');
    recordBtn.classList.toggle('active');
    recordBtn.textContent = enabled ? '⏺ Recording...' : '⏺ Record';
    socket.emit('toggle-record', { sessionId, enabled });
  });

  endBtn.addEventListener('click', async () => {
    if (role !== 'teacher') return;
    if (!confirm('End the class for everyone?')) return;
    try {
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
  setSubjectLabel(localStorage.getItem('subject') || 'Live Class');
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

  bindControls(user.role, token, sessionId);
  cleanup(sessionId, user._id);
});
