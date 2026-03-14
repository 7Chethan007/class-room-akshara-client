import './PresenterTile.css';

/**
 * PresenterTile — large video mock area for the instructor
 *
 * Shows: scanline overlay, presenter label, screen sharing badge,
 * centered avatar, and presenter name.
 */
function PresenterTile() {
  return (
    <div className="presenter-tile" id="presenter-tile">
      <div className="scanline-overlay" aria-hidden="true"></div>

      <div className="presenter-label">
        <svg width="10" height="10" aria-hidden="true">
          <circle cx="5" cy="5" r="5" fill="#E84040" />
        </svg>
        Presenter
      </div>

      <div className="screen-badge" id="screen-badge">🖥 Screen Sharing</div>

      <div className="presenter-avatar">Ms</div>

      <div className="presenter-name">Ms. Priya Sharma</div>
    </div>
  );
}

export default PresenterTile;
