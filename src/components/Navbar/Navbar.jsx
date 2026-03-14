import './Navbar.css';

/**
 * Navbar — sticky top navigation
 *
 * Sections:
 *   Logo  |  Center links  |  Action buttons
 */
function Navbar() {
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
          <a href="#home" id="nav-home">Home</a>
          <a href="#schedule" id="nav-schedule">Schedule Now</a>
          <a href="#join" id="nav-join">Join Now</a>
        </div>

        {/* Action buttons */}
        <div className="nav-actions">
          <button className="btn-outline" id="btn-schedule-nav" type="button">
            Schedule Now
          </button>
          <button className="btn-fill" id="btn-join-nav" type="button">
            Join Now
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
