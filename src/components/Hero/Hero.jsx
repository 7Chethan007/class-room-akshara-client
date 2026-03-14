import './Hero.css';

/* Student avatar data — easy to extend */
const STUDENTS = [
  { initials: 'AK', color: '#5B7FD4' },
  { initials: 'RV', color: '#6BAA7A' },
  { initials: 'NP', color: '#D47A5B' },
  { initials: 'SK', color: '#A06BB8' },
  { initials: '+',  color: '#D4A55B' },
];

const FEATURES = [
  'Live video & audio for teacher and students',
  'Screen sharing in one click',
  'Auto transcription & cloud recording',
  'Schedule classes in advance',
];

/**
 * Hero — two-column landing section
 *
 *  Left:  badge → headline → subtitle → features
 *  Right: live class preview card → CTA buttons
 */
function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-inner">
        {/* ---- Left column ---- */}
        <div className="hero-left">
          <div className="badge">✦ Virtual Learning Platform</div>

          <h1>
            Learn Together,<br />
            <span>Anywhere.</span>
          </h1>

          <p className="hero-sub">
            Join live classes, interact in real-time, and access
            recordings — all in one warm and welcoming space.
          </p>

          <div className="features-list">
            {FEATURES.map((text) => (
              <div className="feat-row" key={text}>
                <span className="feat-dot" aria-hidden="true"></span>
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* ---- Right column ---- */}
        <div className="hero-right">
          {/* Class card */}
          <div className="class-card">
            {/* Header */}
            <div className="card-header">
              <div className="avatar">Ms</div>
              <div className="card-meta">
                <div className="card-title">Math — Chapter 5</div>
                <div className="card-sub">Ms. Priya · 8:00 AM</div>
              </div>
              <div className="live-pill">● LIVE</div>
            </div>

            {/* Video mock */}
            <div className="video-mock">
              <div className="play-btn" role="button" aria-label="Play video" tabIndex={0}>
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
                  <path d="M1 1l10 6-10 6V1z" fill="white" />
                </svg>
              </div>
              <span className="presenter-tag">Ms. Priya (Presenter)</span>
            </div>

            {/* Students row */}
            <div className="students-row">
              {STUDENTS.map((s) => (
                <div
                  className="stud-av"
                  key={s.initials}
                  style={{ background: s.color }}
                >
                  {s.initials}
                </div>
              ))}
              <span className="stud-count">12 students joined</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="cta-buttons">
            <button className="cta-btn-fill" id="btn-schedule-cta" type="button">
              📅 Schedule Now
            </button>
            <button className="cta-btn-outline" id="btn-join-cta" type="button">
              🚀 Join Now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
