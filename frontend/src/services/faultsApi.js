import { API_BASE_URL, authHeaders, parseResponse } from './http';

export async function listFaultsRequest(token) {
  const response = await fetch(`${API_BASE_URL}/api/faults`, {
    method: 'GET',
    headers: authHeaders(token, false),
  });

  return parseResponse(response);
}

export async function createFaultRequest(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/faults`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function getFaultByMarkerRequest(token, markerId) {
  const response = await fetch(`${API_BASE_URL}/api/faults/marker/${encodeURIComponent(markerId)}`, {
    method: 'GET',
    headers: authHeaders(token, false),
  });

  return parseResponse(response);
}

export async function updateFaultStatusRequest(token, faultId, status) {
  const response = await fetch(`${API_BASE_URL}/api/faults/${faultId}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });

  return parseResponse(response);
}

export async function deleteFaultRequest(token, faultId) {
  const response = await fetch(`${API_BASE_URL}/api/faults/${faultId}`, {
    method: 'DELETE',
    headers: authHeaders(token, false),
  });

  return parseResponse(response);
}
