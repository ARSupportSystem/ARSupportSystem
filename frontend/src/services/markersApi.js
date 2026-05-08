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

export async function listMarkersRequest(token, activeOnly = false) {
  const response = await fetch(`${API_BASE_URL}/api/markers?active_only=${activeOnly ? 'true' : 'false'}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function createMarkerRequest(token, markerPayload) {
  const response = await fetch(`${API_BASE_URL}/api/markers`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(markerPayload),
  });

  return parseResponse(response);
}

export async function createMarkersBulkRequest(token, markers) {
  const response = await fetch(`${API_BASE_URL}/api/markers/bulk`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ markers }),
  });

  return parseResponse(response);
}

export async function updateMarkerRequest(token, markerId, markerPayload) {
  const response = await fetch(`${API_BASE_URL}/api/markers/${encodeURIComponent(markerId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(markerPayload),
  });

  return parseResponse(response);
}

export async function uploadMarkerImagesRequest(token, files) {
  const body = new FormData();
  files.forEach((file) => {
    body.append('files', file);
  });

  const response = await fetch(`${API_BASE_URL}/api/markers/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  return parseResponse(response);
}
