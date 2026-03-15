import { useEffect, useRef } from 'react';
import './TranscriptionPanel.css';

/**
 * TranscriptionPanel — displays live transcription
 * 
 * Shows segments as they arrive, scrolls to bottom
 * Teacher can toggle visibility but recording continues
 */
function TranscriptionPanel({ segments = [], isRecording, fullText, isVisible }) {
  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  /**
   * Auto-scroll to bottom when new segments arrive
   */
  useEffect(() => {
    if (scrollRef.current && isVisible) {
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [segments, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="transcription-panel" ref={containerRef}>
      <div className="transcription-header">
        <h3>📝 Live Transcript</h3>
        <div className="status-badge">
          {isRecording ? (
            <>
              <span className="recording-dot"></span>
              Recording
            </>
          ) : (
            'Completed'
          )}
        </div>
      </div>

      <div className="transcription-content" ref={scrollRef}>
        {segments.length === 0 ? (
          <div className="empty-state">
            <p>Waiting for speech...</p>
            <p className="hint">Teacher's voice will appear here</p>
          </div>
        ) : (
          <div className="segments-list">
            {segments.map((segment, idx) => (
              <div key={idx} className="transcript-segment">
                <span className="segment-time">
                  {formatTime(segment.timestamp)}
                </span>
                <span className="segment-text">{segment.text}</span>
                <span className="segment-confidence">
                  {(segment.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="transcription-footer">
        <div className="word-count">
          {fullText.split(/\s+/).filter((w) => w).length} words
        </div>
        <div className="char-count">{fullText.length} characters</div>
      </div>
    </div>
  );
}

/**
 * Format milliseconds to MM:SS
 */
function formatTime(ms) {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default TranscriptionPanel;
