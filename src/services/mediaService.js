/**
 * mediaService.js — Socket.io + mediasoup-client wrapper
 *
 * Central module that every classroom component uses.
 * Connects to the server via the Vite proxy (/socket.io).
 */
import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';

// ─── Socket ────────────────────────────────────────────
let _socket = null;

export function initSocket(token) {
  if (_socket) return _socket;
  
  // Backend is on port 5001, client is on 5173
  const socketUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001'
    : window.location.origin;
  
  _socket = io(socketUrl, {
    path: '/socket.io',
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
  });
  
  console.log('[SOCKET] Connecting to:', socketUrl);
  return _socket;
}

export function getSocket() {
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

// ─── Device ────────────────────────────────────────────
export async function loadDevice(rtpCapabilities) {
  const device = new Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
  return device;
}

// ─── Transports ────────────────────────────────────────

/**
 * Ask the server to create a WebRTC transport, then build
 * the client-side sendTransport and wire up its events.
 */
export function createSendTransport(socket, device, sessionId) {
  return new Promise((resolve, reject) => {
    socket.emit('create-transport', { sessionId }, (data) => {
      if (data.error) return reject(new Error(data.error));
      const transport = device.createSendTransport(data);

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit(
          'connect-transport',
          { transportId: transport.id, dtlsParameters },
          (res) => (res.error ? errback(new Error(res.error)) : callback()),
        );
      });

      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        socket.emit(
          'produce',
          { transportId: transport.id, kind, rtpParameters, appData, sessionId },
          (res) => (res.error ? errback(new Error(res.error)) : callback({ id: res.producerId })),
        );
      });

      resolve(transport);
    });
  });
}

/**
 * Ask the server to create a WebRTC transport, then build
 * the client-side recvTransport and wire up its events.
 */
export function createRecvTransport(socket, device, sessionId) {
  return new Promise((resolve, reject) => {
    socket.emit('create-transport', { sessionId }, (data) => {
      if (data.error) return reject(new Error(data.error));
      const transport = device.createRecvTransport(data);

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit(
          'connect-transport',
          { transportId: transport.id, dtlsParameters },
          (res) => (res.error ? errback(new Error(res.error)) : callback()),
        );
      });

      resolve(transport);
    });
  });
}

// ─── Produce ───────────────────────────────────────────
export async function produce(sendTransport, track, appData = {}) {
  const producer = await sendTransport.produce({ track, appData });
  return producer;
}

// ─── Consume ───────────────────────────────────────────
/**
 * consumeProducer — asks the server for consumer params then
 * creates a local consumer on the recvTransport.
 * Returns { consumer, stream, meta }.
 */
export function consumeProducer(socket, recvTransport, device, producerId) {
  return new Promise((resolve, reject) => {
    socket.emit(
      'consume',
      {
        producerId,
        transportId: recvTransport.id,
        rtpCapabilities: device.rtpCapabilities,
      },
      async (data) => {
        if (data.error) return reject(new Error(data.error));
        try {
          const consumer = await recvTransport.consume({
            id: data.consumerId,
            producerId: data.producerId,
            kind: data.kind,
            rtpParameters: data.rtpParameters,
          });
          const stream = new MediaStream([consumer.track]);
          resolve({
            consumer,
            stream,
            meta: {
              producerUserId: data.producerUserId,
              producerKind: data.producerKind,
            },
          });
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}
