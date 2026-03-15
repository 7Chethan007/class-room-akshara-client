import './Navbar.css';

/**
 * Navbar — sticky top navigation
 *
 * Sections:
 *   Logo  |  Center links  |  Action buttons
 */
function Navbar({ onSchedule, onJoin }) {
  const handleHome = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSchedule = () => {
    onSchedule?.();
  };

  const handleJoin = () => {
    onJoin?.();
  };

  return (
    <nav className="navbar" id="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        {/* Logo */}
        <div className="logo">
          <span className="logo-dot" aria-hidden="true"></span>
          ClassRoom Live
        </div>

        {/* Center links — hidden on mobile */}
        <div className="nav-links">
          <button type="button" id="nav-home" className="nav-link-btn" onClick={handleHome}>Home</button>
          <button type="button" id="nav-schedule" className="nav-link-btn" onClick={handleSchedule}>Schedule Now</button>
          <button type="button" id="nav-join" className="nav-link-btn" onClick={handleJoin}>Join Now</button>
        </div>

        {/* Action buttons */}
        <div className="nav-actions">
          <button className="btn-outline" id="btn-schedule-nav" type="button" onClick={onSchedule}>
            Schedule Now
          </button>
          <button className="btn-fill" id="btn-join-nav" type="button" onClick={onJoin}>
            Join Now
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
