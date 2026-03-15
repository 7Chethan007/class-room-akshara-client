import './ControlsBar.css';

/**
 * ControlsBar — bottom control buttons for the classroom
 *
 * All state and callbacks come from parent (ClassroomPage).
 * This is now a fully controlled component.
 */
function ControlsBar({
  micOn = false,
  cameraOn = false,
  shareOn = false,
  recordOn = false,
  onToggleMic = () => {},
  onToggleCamera = () => {},
  onToggleShare = () => {},
  onToggleRecord = () => {},
  onEndClass = () => {},
  userRole = 'student',
}) {
  return (
    <div className="controls" id="controls-bar">
      <button
        className={`ctrl-btn${micOn ? ' active' : ''}`}
        id="btn-mic"
        type="button"
        onClick={onToggleMic}
      >
        🎤 {micOn ? 'Mic On' : 'Mic Off'}
      </button>

      <button
        className={`ctrl-btn${cameraOn ? ' active' : ''}`}
        id="btn-camera"
        type="button"
        onClick={onToggleCamera}
      >
        📷 {cameraOn ? 'Camera On' : 'Camera Off'}
      </button>

      {userRole === 'teacher' && (
        <>
          <button
            className={`ctrl-btn${shareOn ? ' active' : ''}`}
            id="btn-share"
            type="button"
            onClick={onToggleShare}
          >
            🖥 {shareOn ? 'Sharing' : 'Share'}
          </button>

          <button
            className={`ctrl-btn${recordOn ? ' active' : ''}`}
            id="btn-record"
            type="button"
            onClick={onToggleRecord}
          >
            ⏺ {recordOn ? 'Recording...' : 'Record'}
          </button>

          <button
            className="ctrl-btn danger"
            id="btn-end"
            type="button"
            onClick={onEndClass}
          >
            ✕ End Class
          </button>
        </>
      )}

      {userRole !== 'teacher' && (
        <button
          className="ctrl-btn danger"
          id="btn-leave"
          type="button"
          onClick={onEndClass}
        >
          ✕ Leave Class
        </button>
      )}
    </div>
  );
}

export default ControlsBar;
