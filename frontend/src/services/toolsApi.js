import { API_BASE_URL, authHeaders, buildQuery, parseResponse } from './http';

export async function listToolsRequest(token, filters = {}) {
  const query = buildQuery({ owner_id: filters.owner_id });
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
    headers: authHeaders(token, false),
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

export async function listToolSessionsRequest(token, filters = {}) {
  const query = buildQuery({
    technician_id: filters.technician_id,
    session_status: filters.session_status,
  });
  const response = await fetch(`${API_BASE_URL}/api/tools/sessions${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function createToolSessionRequest(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/tools/sessions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function completeToolSessionRequest(token, sessionId, payload) {
  const response = await fetch(`${API_BASE_URL}/api/tools/sessions/${sessionId}/complete`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}
