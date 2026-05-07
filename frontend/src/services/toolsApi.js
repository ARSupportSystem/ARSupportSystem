const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

export async function listToolsRequest(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    params.set('owner_id', String(filters.owner_id));
  }

  const query = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/tools${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function createToolRequest(token, { name, marker_id, marker_image, owner_id }) {
  const response = await fetch(`${API_BASE_URL}/api/tools`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, marker_id, marker_image, owner_id }),
  });

  return parseResponse(response);
}

export async function updateToolRequest(token, toolId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/tools/${toolId}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function updateToolImageRequest(token, toolId, marker_image) {
  return updateToolRequest(token, toolId, { marker_image });
}

export async function deleteToolRequest(token, toolId) {
  const response = await fetch(`${API_BASE_URL}/api/tools/${toolId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function logToolActionRequest(token, { tool_id, action }) {
  const response = await fetch(`${API_BASE_URL}/api/tools/action`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ tool_id, action, timestamp: new Date().toISOString() }),
  });

  return parseResponse(response);
}
