import './ParticipantsPanel.css';

/**
 * ParticipantsPanel — right sidebar with live participant list
 *
 * Data comes from server via room-participants event.
 */
function ParticipantsPanel({ participants = [] }) {
  // Helper to get initials for avatar
  const getInitials = (name = '') => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Helper to get deterministic color from userId
  const getColor = (userId = '') => {
    const colors = [
      '#5B7FD4',
      '#6BAA7A',
      '#D47A5B',
      '#A06BB8',
      '#D4A55B',
      '#7BAAD4',
      '#AA6B6B',
      '#7A9E7A',
      '#B07AAA',
    ];
    const code = (userId || '').charCodeAt(0) || 0;
    return colors[code % colors.length];
  };

  // Sort: teachers first, then students
  const sortedParticipants = [...participants].sort((a, b) => {
    const roleWeight = (r) => (r === 'teacher' ? 0 : 1);
    const byRole = roleWeight(a.role) - roleWeight(b.role);
    if (byRole !== 0) return byRole;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <aside className="participants" id="participants-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">Participants</div>
        <div className="panel-count">{sortedParticipants.length}</div>
      </div>

      {/* Scrollable list */}
      <div className="panel-list">
        {sortedParticipants.length === 0 ? (
          <div className="panel-section" style={{ color: '#888' }}>
            No one here yet
          </div>
        ) : (
          <>
            {sortedParticipants.map(({ userId, role, name }) => (
              <div
                key={userId}
                className={`p-item ${role === 'teacher' ? 'presenter-row' : ''}`}
              >
                <div
                  className="p-av"
                  style={{ background: getColor(userId) }}
                >
                  {getInitials(name)}
                </div>
                <div className="p-name">
                  {name} {role === 'teacher' ? '👨‍🏫' : ''}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

export default ParticipantsPanel;
