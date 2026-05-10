import { API_BASE_URL, authHeaders, parseResponse } from './http';

export async function loginRequest(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return parseResponse(response);
}

export async function getMeRequest(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: authHeaders(token, false),
  });

  return parseResponse(response);
}

export async function logoutRequest(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders(token, false),
  });

  return parseResponse(response);
}
