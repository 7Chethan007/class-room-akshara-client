import './StudentTiles.css';

const TILE_STUDENTS = [
  { initials: 'AK', name: 'Arjun K.',    color: 'var(--av-blue)' },
  { initials: 'RV', name: 'Rhea V.',     color: 'var(--av-green)' },
  { initials: 'NP', name: 'Nikhil P.',   color: 'var(--av-coral)' },
  { initials: 'SK', name: 'Sneha K.',    color: 'var(--av-purple)' },
  { initials: 'PP', name: 'Prashant P.', color: 'var(--av-amber)' },
];

/**
 * StudentTiles — row of student video tile placeholders
 *
 * Data-driven from array for easy scalability.
 */
function StudentTiles() {
  return (
    <div className="student-tiles" id="student-tiles">
      {TILE_STUDENTS.map((s) => (
        <div className="s-tile" key={s.initials}>
          <div className="s-av" style={{ background: s.color }}>{s.initials}</div>
          <div className="s-name">{s.name}</div>
        </div>
      ))}
      <div className="s-tile s-more">+9 more</div>
    </div>
  );
}

export default StudentTiles;
