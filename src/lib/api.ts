import Swal from 'sweetalert2';
import { safeLocalStorage } from './theme';

type CreateApiFetchArgs = {
  getSessionToken: () => string | null;
  getGoogleToken: () => string | null;
  onUnauthorized: () => void;
};

export function createApiFetch({ getSessionToken, getGoogleToken, onUnauthorized }: CreateApiFetchArgs) {
  return async function apiFetch(url: string, options: RequestInit & { body?: any } = {}) {
    const apiBaseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
    const headers = new Headers(options.headers || {});

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const sessionToken = getSessionToken();
    if (sessionToken) headers.set('X-Session-Token', sessionToken);

    const googleToken = getGoogleToken();
    if (googleToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${googleToken}`);
    }

    const response = await fetch(`${apiBaseUrl}${url}`, { ...options, headers });

    if (response.status === 401 && !url.includes('/login')) {
      safeLocalStorage.removeItem('session_token');
      onUnauthorized();
      Swal.fire('Session expired', 'Silakan login ulang.', 'warning');
    }

    return response;
  };
}
