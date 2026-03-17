import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_TRANSCRIPTION_WS_URL || 'ws://localhost:3001';

// Converts Float32 PCM to 16-bit PCM
function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
  }
  return int16;
}

export default function useTranscription(sessionId, isTeacher) {
  const [transcript, setTranscript] = useState('');
  const [partialText, setPartialText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioContextRef = useRef(null);

  const stopTranscription = useCallback(() => {
    try {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    } finally {
      processorRef.current = null;
      mediaStreamRef.current = null;
      audioContextRef.current = null;
      wsRef.current = null;
      setIsTranscribing(false);
      setPartialText('');
    }
  }, []);

  const startTranscription = useCallback(async () => {
    if (!sessionId || !isTeacher || isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ sessionId }));
        setIsTranscribing(true);
      };

      ws.onerror = () => {
        console.error('Transcription WS error');
        setIsTranscribing(false);
      };

      ws.onclose = () => {
        setIsTranscribing(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'result' && data.text) {
            setTranscript((prev) => prev + data.text + ' ');
            setPartialText('');
          } else if (data.type === 'partial' && data.text) {
            setPartialText(data.text);
          }
        } catch (err) {
          console.error('Error parsing transcription message', err);
        }
      };

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(float32);
        wsRef.current.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      console.error('Failed to start transcription', err);
      stopTranscription();
    }
  }, [isTeacher, isTranscribing, sessionId, stopTranscription]);

  useEffect(() => {
    return () => {
      if (isTranscribing) {
        stopTranscription();
      }
    };
  }, [isTranscribing, stopTranscription]);

  return {
    transcript,
    partialText,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}
