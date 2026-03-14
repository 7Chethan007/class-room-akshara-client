import './ParticipantsPanel.css';

const INSTRUCTOR = { initials: 'Ms', name: 'Ms. Priya Sharma', color: 'var(--primary)' };

const STUDENTS = [
  { initials: 'AK', name: 'Arjun Kumar',    color: 'var(--av-blue)' },
  { initials: 'RV', name: 'Rhea Verma',     color: 'var(--av-green)' },
  { initials: 'NP', name: 'Nikhil Patel',   color: 'var(--av-coral)' },
  { initials: 'SK', name: 'Sneha Krishnan', color: 'var(--av-purple)' },
  { initials: 'PP', name: 'Prashant Pillai',color: 'var(--av-amber)' },
  { initials: 'AM', name: 'Anjali Mehta',   color: 'var(--av-blue-light)' },
  { initials: 'RS', name: 'Rohan Sharma',   color: 'var(--av-red-muted)' },
  { initials: 'DK', name: 'Divya Kapoor',   color: 'var(--av-green-muted)' },
  { initials: 'VR', name: 'Vikram Rao',     color: 'var(--av-mauve)' },
];

/**
 * ParticipantsPanel — right sidebar with participant list + chat
 *
 * Data-driven: instructor + students arrays can be swapped
 * for real data when backend integration happens.
 */
function ParticipantsPanel() {
  return (
    <aside className="participants" id="participants-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">Participants</div>
        <div className="panel-count">14</div>
      </div>

      {/* Scrollable list */}
      <div className="panel-list">
        <div className="panel-section">Instructor</div>
        <div className="p-item instructor-row">
          <div className="p-av" style={{ background: INSTRUCTOR.color }}>{INSTRUCTOR.initials}</div>
          <div className="p-name">{INSTRUCTOR.name}</div>
        </div>

        <div className="panel-section panel-section-students">Students (13)</div>
        {STUDENTS.map((s) => (
          <div className="p-item" key={s.initials}>
            <div className="p-av" style={{ background: s.color }}>{s.initials}</div>
            <div className="p-name">{s.name}</div>
          </div>
        ))}
        <div className="p-item overflow">
          <div className="p-av" style={{ background: 'var(--av-grey)' }}>+4</div>
          <div className="p-name">4 more</div>
        </div>
      </div>

      {/* Chat */}
      <div className="chat-area">
        <input
          className="chat-input"
          type="text"
          placeholder="Message everyone…"
          id="chat-input"
        />
        <button className="chat-send" id="chat-send" type="button">Send</button>
      </div>
    </aside>
  );
}

export default ParticipantsPanel;
