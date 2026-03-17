import { useEffect, useRef } from 'react';
import './PresenterTile.css';

/**
 * PresenterTile — large video area with local or screen stream + PiP
 * 
 * When screen sharing:
 * - Main video: screen stream (large)
 * - PiP overlay: local camera (small thumbnail, bottom-right)
 * 
 * When not sharing:
 * - Main video: local camera
 */
function PresenterTile({ localStream, screenStream, presenterName, videoRef }) {
  const mainVideoRef = videoRef || useRef(null);
  const pipVideoRef = useRef(null);

  /**
   * Bind main stream (screen > local)
   */
  useEffect(() => {
    const stream = screenStream || localStream;

    if (mainVideoRef.current && stream) {
      console.log('[PRESENTER] Binding main stream:', screenStream ? '🖥 screen' : '📷 local');
      mainVideoRef.current.srcObject = stream;
      mainVideoRef.current.onloadedmetadata = () => {
        console.log('[PRESENTER] Main video metadata loaded');
        mainVideoRef.current.play().catch((e) => {
          console.error('[PRESENTER] Main play error:', e);
        });
      };
    } else if (mainVideoRef.current) {
      mainVideoRef.current.srcObject = null;
    }
  }, [localStream, screenStream]);

  /**
   * Bind PiP stream (only when screen sharing)
   * Shows local camera as small overlay when screen is active
   */
  useEffect(() => {
    if (pipVideoRef.current && screenStream && localStream) {
      console.log('[PRESENTER] Binding PiP stream: local camera');
      pipVideoRef.current.srcObject = localStream;
      pipVideoRef.current.onloadedmetadata = () => {
        console.log('[PRESENTER] PiP video metadata loaded');
        pipVideoRef.current.play().catch((e) => {
          console.error('[PRESENTER] PiP play error:', e);
        });
      };
    } else if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null;
    }
  }, [screenStream, localStream]);

  const initials = (presenterName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hasVideo = !!(localStream || screenStream);

  return (
    <div className="presenter-tile" id="presenter-tile">
      <div className="scanline-overlay" aria-hidden="true"></div>

      {hasVideo ? (
        <>
          {/* Main video (screen or local) */}
          <video
            ref={mainVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '16px',
            }}
            onError={(e) => console.error('[PRESENTER] Main video error:', e)}
          />

          {/* Picture-in-Picture: local camera when screen sharing */}
          {screenStream && localStream && (
            <video
              ref={pipVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                width: '120px',
                height: '90px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '2px solid #C07050',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
              onError={(e) => console.error('[PRESENTER] PiP video error:', e)}
            />
          )}

          {screenStream && (
            <div className="screen-badge" id="screen-badge">
              🖥 Screen Sharing
            </div>
          )}
          <div className="presenter-label">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="5" fill="#E84040" />
            </svg>
            Presenter
          </div>
        </>
      ) : (
        <>
          <div className="presenter-label">
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="5" fill="#E84040" />
            </svg>
            Presenter
          </div>
          <div className="presenter-avatar">{initials}</div>
          <div className="presenter-name">{presenterName || 'Presenter'}</div>
        </>
      )}
    </div>
  );
}

export default PresenterTile;
