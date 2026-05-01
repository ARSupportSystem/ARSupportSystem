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

export async function listFaultsRequest(token) {
  const response = await fetch(`${API_BASE_URL}/api/faults`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response);
}

export async function getFaultByMarkerRequest(token, markerId) {
  const response = await fetch(`${API_BASE_URL}/api/faults/marker/${encodeURIComponent(markerId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response);
}
