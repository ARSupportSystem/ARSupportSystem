import { API_BASE_URL, authHeaders, parseResponse } from './http';

export async function listUsersRequest(token) {
  const response = await fetch(`${API_BASE_URL}/api/users/?page_size=100`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  return parseResponse(response);
}
