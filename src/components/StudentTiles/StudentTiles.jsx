import { useEffect, useRef } from 'react';
import './StudentTiles.css';

/**
 * StudentTiles — row of remote student video streams
 * 
 * Filters out screen streams (those are displayed elsewhere)
 * Only shows camera/audio from students
 */
function StudentTiles({ remoteStreams = new Map() }) {
  const videoRefsRef = useRef(new Map());

  // Filter out screen streams - only show camera streams
  const cameraStreams = Array.from(remoteStreams.entries()).filter(
    ([_, entry]) => entry.kind !== 'screen'
  );

  /**
   * Update video element srcObject bindings when cameraStreams changes
   */
  useEffect(() => {
    console.log('[STUDENTS] Updating', cameraStreams.length, 'camera streams');

    // Bind each stream to its video element
    for (const [producerId, entry] of cameraStreams) {
      const videoEl = videoRefsRef.current.get(producerId);
      if (videoEl && entry.stream) {
        console.log('[STUDENTS] 📷 Binding camera stream:', producerId);
        videoEl.srcObject = entry.stream;
        videoEl.onloadedmetadata = () => {
          console.log('[STUDENTS] Camera loaded:', producerId);
          videoEl.play().catch((e) => {
            console.error('[STUDENTS] Play error:', producerId, e);
          });
        };
      }
    }

    // Cleanup: remove refs for streams that no longer exist
    for (const producerId of videoRefsRef.current.keys()) {
      if (!cameraStreams.some(([pId]) => pId === producerId)) {
        const videoEl = videoRefsRef.current.get(producerId);
        if (videoEl) {
          videoEl.srcObject = null;
        }
        videoRefsRef.current.delete(producerId);
      }
    }
  }, [cameraStreams]);

  if (cameraStreams.length === 0) {
    return (
      <div className="student-tiles" id="student-tiles">
        <div
          className="s-tile s-more"
          style={{ flex: 1, justifyContent: 'center', color: '#888' }}
        >
          No other students...
        </div>
      </div>
    );
  }

  return (
    <div className="student-tiles" id="student-tiles">
      {cameraStreams.map(([producerId, entry]) => (
        <div className="s-tile" key={producerId} title={`Camera from ${entry.userId}`}>
          <video
            ref={(el) => {
              if (el) {
                videoRefsRef.current.set(producerId, el);
              } else {
                videoRefsRef.current.delete(producerId);
              }
            }}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '10px',
              backgroundColor: '#1a1008',
            }}
            onError={(e) => console.error('[STUDENTS] Video error:', producerId, e)}
          />
        </div>
      ))}
    </div>
  );
}

export default StudentTiles;
