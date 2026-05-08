const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null
      ? payload.detail || JSON.stringify(payload)
      : payload || 'Request failed';
    throw new Error(detail);
  }

  return payload;
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function listAnnotationsRequest(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.fault_id) {
    params.set('fault_id', String(filters.fault_id));
  }
  if (filters.ar_marker_id) {
    params.set('ar_marker_id', String(filters.ar_marker_id));
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/annotations${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function createAnnotationRequest(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/annotations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}
