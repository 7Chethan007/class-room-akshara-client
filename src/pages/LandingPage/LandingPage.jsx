import Navbar from '../../components/Navbar/Navbar';
import Hero from '../../components/Hero/Hero';
import Footer from '../../components/Footer/Footer';
import { quickAccessUser, createClassSession, joinClassSession } from '../../services/classroomApi';
import { useState } from 'react';
import './LandingPage.css';

/**
 * LandingPage — composes Navbar, Hero, Footer
 *
 * This is the single page entry-point for the app.
 * Additional sections (e.g. Pricing, Testimonials) can
 * be inserted between Hero and Footer without modifying
 * existing components (Open/Closed Principle).
 */
function LandingPage() {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Mathematics - Chapter 1');
  const [classCode, setClassCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const persistAuth = ({ token, user, sessionId, subject }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('sessionId', sessionId);
    localStorage.setItem('subject', subject || 'Live Class');
  };

  const openLiveClass = () => {
    window.location.href = '/classroom';
  };

  const resetPanel = () => {
    setMode(null);
    setName('');
    setEmail('');
    setSubject('Mathematics - Chapter 1');
    setClassCode('');
    setBusy(false);
    setError('');
  };

  const ensureBaseFields = () => {
    if (!name.trim()) throw new Error('Name is required');
    if (!email.trim()) throw new Error('Email is required');
  };

  const handleSchedule = () => {
    setMode('schedule');
    setError('');
  };

  const handleJoin = () => {
    setMode('join');
    setError('');
  };

  const handleContinue = async () => {
    setBusy(true);
    setError('');
    try {
      ensureBaseFields();

      if (mode === 'schedule' && !subject.trim()) {
        throw new Error('Class subject is required');
      }

      if (mode === 'join' && !classCode.trim()) {
        throw new Error('Class code is required');
      }

      const auth = await quickAccessUser({
        name: name.trim(),
        email: email.trim(),
        role: mode === 'schedule' ? 'teacher' : 'student',
      });

      if (mode === 'schedule') {
        if (auth.user.role !== 'teacher') {
          throw new Error('This profile is not a teacher profile.');
        }

        const session = await createClassSession({ token: auth.token, subject: subject.trim() });

        persistAuth({
          token: auth.token,
          user: auth.user,
          sessionId: session.sessionId,
          subject: subject.trim(),
        });

        window.alert(`Class created. Share this class code: ${session.sessionId}`);
        openLiveClass();
        return;
      }

      if (auth.user.role !== 'student') {
        throw new Error('This profile is not a student profile.');
      }

      const session = await joinClassSession({
        token: auth.token,
        sessionId: classCode.trim(),
      });

      persistAuth({
        token: auth.token,
        user: auth.user,
        sessionId: session.sessionId,
        subject: session.subject,
      });

      openLiveClass();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const panelTitle = mode === 'schedule' ? 'Create Classroom' : 'Join Classroom';
  const ctaText = mode === 'schedule' ? 'Create Class' : 'Join Class';

  return (
    <div className="landing-page">
      <Navbar onSchedule={handleSchedule} onJoin={handleJoin} />
      <Hero onSchedule={handleSchedule} onJoin={handleJoin} />

      {mode && (
        <section className="action-panel" aria-live="polite">
          <div className="action-card">
            <h2>{panelTitle}</h2>

            <label htmlFor="entry-name">Name</label>
            <input
              id="entry-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={mode === 'schedule' ? 'Instructor name' : 'Student name'}
            />

            <label htmlFor="entry-email">Email</label>
            <input
              id="entry-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />

            {mode === 'schedule' && (
              <>
                <label htmlFor="entry-subject">Class Subject</label>
                <input
                  id="entry-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Mathematics - Chapter 1"
                />
              </>
            )}

            {mode === 'join' && (
              <>
                <label htmlFor="entry-code">Class Code</label>
                <input
                  id="entry-code"
                  value={classCode}
                  onChange={(event) => setClassCode(event.target.value)}
                  placeholder="Enter code shared by teacher"
                />
              </>
            )}

            {error && <p className="action-error">{error}</p>}

            <div className="action-row">
              <button type="button" className="action-cancel" onClick={resetPanel} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="action-submit" onClick={handleContinue} disabled={busy}>
                {busy ? 'Please wait...' : ctaText}
              </button>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}

export default LandingPage;
