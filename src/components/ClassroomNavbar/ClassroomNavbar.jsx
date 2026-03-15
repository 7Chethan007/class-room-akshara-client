import { useState, useEffect, useRef } from 'react';
import './ClassroomNavbar.css';

/**
 * ClassroomNavbar — dark-themed top bar for the live classroom
 *
 * Displays: Logo | Divider | Subject name | User + LIVE dot + label + timer
 */
function ClassroomNavbar({ sessionId, userName }) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');

  return (
    <nav className="classroom-nav" id="classroom-navbar">
      <div className="logo">ClassRoom Live</div>
      <div className="nav-divider" aria-hidden="true"></div>
      <div className="nav-subject">
        {localStorage.getItem('subject') || 'Live Class'}
      </div>

      <div className="nav-live-row">
        <span style={{ marginLeft: 'auto', marginRight: '16px', fontSize: '12px' }}>
          👤 {userName || 'User'}
        </span>
        <span className="live-dot" aria-hidden="true"></span>
        <span className="live-label">LIVE</span>
        <span className="nav-timer" aria-live="polite">
          {h}:{m}:{s}
        </span>
      </div>
    </nav>
  );
}

export default ClassroomNavbar;
