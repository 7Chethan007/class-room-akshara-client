/* ClassRoom Live — Landing/Login logic (vanilla JS) */
const API_BASE = 'http://localhost:5000/api';

// State
let selectedRole = 'student';

/**
 * createLoginCard — injects a lightweight login/join card into the page
 */
function createLoginCard() {
  if (document.getElementById('login-card')) return;

  // Inject minimal styles for login card + tabs
  if (!document.getElementById('login-card-styles')) {
    const style = document.createElement('style');
    style.id = 'login-card-styles';
    style.textContent = `
      .role-tab { flex:1; border:1px solid #E2CBBA; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; color:#C07050; cursor:pointer; }
      .role-tab.active { background:#C07050; color:#fff; border-color:#C07050; }
    `;
    document.head.appendChild(style);
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'login-card';
  wrapper.style.maxWidth = '360px';
  wrapper.style.margin = '30px auto 60px';
  wrapper.style.padding = '18px';
  wrapper.style.borderRadius = '14px';
  wrapper.style.border = '1px solid #E2CBBA';
  wrapper.style.boxShadow = '0 8px 24px rgba(150,90,60,0.12)';
  wrapper.style.background = '#fff';
  wrapper.style.fontFamily = "'Nunito', sans-serif";

  wrapper.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="role-tab active" data-role="student">Student</button>
      <button class="role-tab" data-role="teacher">Teacher</button>
      <button class="role-tab" data-role="admin">Admin</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <input id="email-input" type="email" placeholder="Email" style="padding:10px 12px;border:1px solid #E2CBBA;border-radius:10px;font-size:14px;">
      <input id="password-input" type="password" placeholder="Password" style="padding:10px 12px;border:1px solid #E2CBBA;border-radius:10px;font-size:14px;">
      <button id="sign-in-btn" style="background:#C07050;color:#fff;border:none;border-radius:12px;padding:12px;font-weight:700;cursor:pointer;">Sign In</button>
      <button id="join-code-btn" style="background:transparent;color:#C07050;border:2px solid #C07050;border-radius:12px;padding:10px;font-weight:700;cursor:pointer;">Join with Class Code</button>
    </div>
    <div id="toast" style="position:fixed;top:16px;right:16px;padding:10px 14px;background:#2e7d32;color:#fff;border-radius:10px;font-weight:700;display:none;z-index:9999;"></div>
  `;

  document.body.appendChild(wrapper);
}

/**
 * attachRoleTabs — sets up role tab switching
 */
function attachRoleTabs() {
  document.querySelectorAll('.role-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.role-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role;
      console.log('Role selected:', selectedRole);
    });
  });
}

/**
 * scrollToLogin — smooth scroll to login card and focus email
 */
function scrollToLogin() {
  const card = document.getElementById('login-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => document.getElementById('email-input').focus(), 400);
  }
}

/**
 * handleJoinNowButtons — nav + hero join buttons
 */
function handleJoinNowButtons() {
  document.querySelectorAll('.nav-link, .nav-btn-fill, .cta-btn-outline').forEach((btn) => {
    if (btn.textContent.toLowerCase().includes('join')) {
      btn.addEventListener('click', scrollToLogin);
    }
  });
}

/**
 * handleScheduleButtons — prompt only (no backend yet)
 */
function handleScheduleButtons() {
  document.querySelectorAll('.nav-btn-outline, .cta-btn-fill').forEach((btn) => {
    if (btn.textContent.toLowerCase().includes('schedule')) {
      btn.addEventListener('click', () => {
        const subject = prompt('Subject name?');
        const when = prompt('Date & time?');
        if (subject && when) {
          alert(`Scheduled locally: ${subject} at ${when}. (No backend call yet)`);
        } else {
          scrollToLogin();
        }
      });
    }
  });
}

/**
 * apiRequest — helper for JSON fetch with auth
 */
async function apiRequest(url, method, body, token) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

/**
 * handleLoginSubmit — login + branch flow
 */
async function handleLoginSubmit() {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value.trim();
  if (!email || !password) {
    alert('Please fill all fields');
    return;
  }
  try {
    const loginRes = await apiRequest(`${API_BASE}/auth/login`, 'POST', { email, password });
    const { token, user } = loginRes.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    console.log('Logged in as', user.role);

    if (selectedRole === 'teacher') {
      const sess = await apiRequest(
        `${API_BASE}/session/create`,
        'POST',
        { subject: 'Mathematics — Chapter 5' },
        token
      );
      localStorage.setItem('sessionId', sess.data.sessionId);
    } else if (selectedRole === 'student') {
      const sid = prompt('Enter class code:');
      if (!sid) return alert('Class code required');
      await apiRequest(`${API_BASE}/session/join`, 'POST', { sessionId: sid }, token);
      localStorage.setItem('sessionId', sid);
    } else if (selectedRole === 'admin') {
      alert('Admin panel coming soon');
      return;
    }

    window.location.href = 'classroom.html';
  } catch (err) {
    alert(err.message);
  }
}

/**
 * handleJoinWithCode — join using existing token
 */
async function handleJoinWithCode() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login first');
    return;
  }
  const sid = prompt('Enter your class code:');
  if (!sid) return;
  try {
    await apiRequest(`${API_BASE}/session/join`, 'POST', { sessionId: sid }, token);
    localStorage.setItem('sessionId', sid);
    window.location.href = 'classroom.html';
  } catch (err) {
    alert(err.message);
  }
}

/**
 * showWelcomeToast — greets returning user
 */
function showWelcomeToast() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (!token || !user) return;
  const toast = document.getElementById('toast');
  const name = JSON.parse(user).name || 'back';
  toast.textContent = `Welcome back, ${name}!`;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 3000);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  createLoginCard();
  attachRoleTabs();
  handleJoinNowButtons();
  handleScheduleButtons();
  document.getElementById('sign-in-btn').addEventListener('click', handleLoginSubmit);
  document.getElementById('join-code-btn').addEventListener('click', handleJoinWithCode);
  showWelcomeToast();
});
