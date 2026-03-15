import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useTranscription — manages live transcription state and Socket.io events
 */
export function useTranscription(socketRef, sessionId, userId) {
  const [segments, setSegments] = useState([]); // array of transcribed segments
  const [isVisible, setIsVisible] = useState(false); // UI toggle
  const [fullText, setFullText] = useState('');
  const [error, setError] = useState('');

  // Use ref for isRecording to avoid stale closures in callbacks
  const isRecordingRef = useRef(false);
  const transcriptionIdRef = useRef(null);
  const segmentsRef = useRef([]);

  /**
   * Start transcription
   */
  const startTranscription = useCallback(async () => {
    if (!socketRef.current) {
      console.error('[TRANSCRIPTION] startTranscription: socketRef.current is null');
      return false;
    }
    if (isRecordingRef.current) {
      console.warn('[TRANSCRIPTION] startTranscription: already recording');
      return false;
    }

    console.log('[TRANSCRIPTION] startTranscription: Emitting to server with sessionId=', sessionId, 'userId=', userId);
    console.log('[TRANSCRIPTION] Socket connected:', socketRef.current.connected);

    // CRITICAL: Set recording flag IMMEDIATELY before emitting
    // This prevents audio chunks from being dropped while waiting for server callback
    isRecordingRef.current = true;
    console.log('[TRANSCRIPTION] 🔴 Recording flag set IMMEDIATELY - audio chunks will now flow');

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        console.error('[TRANSCRIPTION] Start timeout: server did not respond within 5 seconds');
        isRecordingRef.current = false;
        resolve(false);
      }, 5000);

      socketRef.current.emit(
        'start-transcription',
        { sessionId, userId },
        (response) => {
          clearTimeout(timeoutHandle);
          console.log('[TRANSCRIPTION] Start callback received:', response);
          
          if (response?.error) {
            console.error('[TRANSCRIPTION] Start error:', response.error);
            setError(response.error);
            isRecordingRef.current = false;
            resolve(false);
          } else if (response?.transcriptionId) {
            transcriptionIdRef.current = response.transcriptionId;
            setIsVisible(true);
            console.log('[TRANSCRIPTION] ✅ Started with transcriptionId:', response.transcriptionId);
            resolve(true);
          } else {
            console.error('[TRANSCRIPTION] Invalid response:', response);
            isRecordingRef.current = false;
            resolve(false);
          }
        }
      );
    });
  }, [socketRef, sessionId, userId]);

  /**
   * Stop transcription and save
   */
  const stopTranscription = useCallback(async () => {
    if (!socketRef.current || !isRecordingRef.current) return;

    console.log('[TRANSCRIPTION] Stopping transcription...');

    return new Promise((resolve) => {
      socketRef.current.emit(
        'end-transcription',
        { sessionId, userId },
        (response) => {
          if (response.error) {
            console.error('[TRANSCRIPTION] Error:', response.error);
            setError(response.error);
            resolve(false);
          } else {
            isRecordingRef.current = false; // Update ref immediately
            console.log('[TRANSCRIPTION] ✅ Stopped and saved:', response);
            resolve(true);
          }
        }
      );
    });
  }, [socketRef, sessionId, userId]);

  /**
   * Toggle visibility
   */
  const toggleVisibility = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  /**
   * Send audio chunk for transcription
   */
  const sendAudioChunk = useCallback(
    (audioBuffer, timestamp) => {
      if (!socketRef.current) {
        console.warn('[TRANSCRIPTION] sendAudioChunk: socketRef.current is null');
        return;
      }
      if (!isRecordingRef.current) {
        console.warn('[TRANSCRIPTION] sendAudioChunk: not recording, isRecording=', isRecordingRef.current);
        return;
      }

      console.log('[TRANSCRIPTION] Emitting audio-chunk to server...');
      socketRef.current.emit(
        'audio-chunk',
        {
          sessionId,
          audioBuffer, // Will be serialized if Buffer, or already base64
          timestamp,
        },
        (response) => {
          if (response?.error) {
            console.error('[TRANSCRIPTION] Send error:', response.error);
          }
        }
      );
    },
    [socketRef, sessionId]
  );

  /**
   * Listen for transcription segments from server
   */
  useEffect(() => {
    if (!socketRef.current) return;

    const onSegment = (data) => {
      console.log('[TRANSCRIPTION] New segment:', data.text.substring(0, 50));

      const newSegment = {
        timestamp: data.timestamp,
        text: data.text,
        confidence: data.confidence,
        index: data.segmentIndex,
      };

      segmentsRef.current.push(newSegment);
      setSegments([...segmentsRef.current]);

      // Update full text
      const newText = segmentsRef.current.map((s) => s.text).join(' ');
      setFullText(newText);
    };

    const onCompleted = (data) => {
      console.log('[TRANSCRIPTION] Transcription completed:', data);
      isRecordingRef.current = false; // Update ref immediately
    };

    socketRef.current.on('transcription-segment', onSegment);
    socketRef.current.on('transcription-completed', onCompleted);

    return () => {
      socketRef.current?.off('transcription-segment', onSegment);
      socketRef.current?.off('transcription-completed', onCompleted);
    };
  }, [socketRef]);

  return {
    segments,
    fullText,
    isRecording: isRecordingRef.current, // Return current ref value
    isVisible,
    error,
    startTranscription,
    stopTranscription,
    toggleVisibility,
    sendAudioChunk,
  };
}
