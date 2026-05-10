import { API_BASE_URL, authHeaders, buildQuery, parseResponse } from './http';

export async function listAnnotationsRequest(token, filters = {}) {
  const query = buildQuery({
    fault_id: filters.fault_id,
    ar_marker_id: filters.ar_marker_id,
  });
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
