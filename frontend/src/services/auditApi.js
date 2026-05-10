import { API_BASE_URL, authHeaders, buildQuery, parseResponse } from './http';

export async function listAuditLogsRequest(token, filters = {}) {
  const query = buildQuery(filters);
  const response = await fetch(`${API_BASE_URL}/api/audit${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}

export async function listSecurityEventsRequest(token, filters = {}) {
  const query = buildQuery(filters);
  const response = await fetch(`${API_BASE_URL}/api/audit/security-events${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}
