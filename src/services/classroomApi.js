const API_BASE = import.meta.env.VITE_API_PROXY_BASE || '/api';

async function requestJson(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return payload;
}

export async function quickAccessUser({ name, email, role }) {
  const result = await requestJson('/auth/quick-access', {
    method: 'POST',
    body: { name, email, role },
  });
  return result.data;
}

export async function createClassSession({ token, subject }) {
  const result = await requestJson('/session/create', {
    method: 'POST',
    token,
    body: { subject },
  });
  return result.data;
}

export async function joinClassSession({ token, sessionId }) {
  const result = await requestJson('/session/join', {
    method: 'POST',
    token,
    body: { sessionId },
  });
  return result.data;
}
