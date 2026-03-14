import { useState, useEffect, useRef } from 'react';
import './ClassroomNavbar.css';

/**
 * ClassroomNavbar — dark-themed top bar for the live classroom
 *
 * Displays: Logo | Divider | Subject name | LIVE dot + label + timer
 * Timer ticks via useEffect/setInterval (React state, not DOM).
 */
function ClassroomNavbar() {
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
      <div className="nav-subject">Mathematics — Chapter 5</div>

      <div className="nav-live-row">
        <span className="live-dot" aria-hidden="true"></span>
        <span className="live-label">LIVE</span>
        <span className="nav-timer" aria-live="polite">{h}:{m}:{s}</span>
      </div>
    </nav>
  );
}

export default ClassroomNavbar;
