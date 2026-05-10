import { API_BASE_URL, authHeaders, parseResponse } from './http';

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

export async function updateMarkerRequest(token, markerId, markerPayload) {
  const response = await fetch(`${API_BASE_URL}/api/markers/${encodeURIComponent(markerId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(markerPayload),
  });

  return parseResponse(response);
}
