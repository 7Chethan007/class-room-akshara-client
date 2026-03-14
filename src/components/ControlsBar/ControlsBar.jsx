import { useState } from 'react';
import './ControlsBar.css';

/**
 * ControlsBar — bottom control buttons for the classroom
 *
 * Each toggle button uses React state. "End Class" navigates
 * back to landing (will be swapped for real logic later).
 */
function ControlsBar() {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [shareOn, setShareOn] = useState(true);
  const [transcriptOn, setTranscriptOn] = useState(false);
  const [recordOn, setRecordOn] = useState(false);

  const handleEndClass = () => {
    if (window.confirm('Are you sure you want to end the class?')) {
      window.location.href = '/';
    }
  };

  return (
    <div className="controls" id="controls-bar">
      <button
        className={`ctrl-btn${micOn ? ' active' : ''}`}
        id="btn-mic"
        type="button"
        onClick={() => setMicOn(!micOn)}
      >
        🎤 {micOn ? 'Mic On' : 'Mic Off'}
      </button>

      <button
        className={`ctrl-btn${cameraOn ? ' active' : ''}`}
        id="btn-camera"
        type="button"
        onClick={() => setCameraOn(!cameraOn)}
      >
        📷 {cameraOn ? 'Camera On' : 'Camera Off'}
      </button>

      <button
        className={`ctrl-btn${shareOn ? ' active' : ''}`}
        id="btn-share"
        type="button"
        onClick={() => setShareOn(!shareOn)}
      >
        🖥 {shareOn ? 'Share' : 'Share Off'}
      </button>

      <button
        className={`ctrl-btn${transcriptOn ? ' active' : ''}`}
        id="btn-transcript"
        type="button"
        onClick={() => setTranscriptOn(!transcriptOn)}
      >
        📝 {transcriptOn ? 'Transcript On' : 'Transcript'}
      </button>

      <button
        className={`ctrl-btn${recordOn ? ' active' : ''}`}
        id="btn-record"
        type="button"
        onClick={() => setRecordOn(!recordOn)}
      >
        ⏺ {recordOn ? 'Recording...' : 'Record'}
      </button>

      <button
        className="ctrl-btn danger"
        id="btn-end"
        type="button"
        onClick={handleEndClass}
      >
        ✕ End Class
      </button>
    </div>
  );
}

export default ControlsBar;
