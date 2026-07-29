import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFetch } from '../api';

describe('createApiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches session and google tokens to requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const apiFetch = createApiFetch({
      getSessionToken: () => 'session-123',
      getGoogleToken: () => 'google-123',
      onUnauthorized: vi.fn(),
    });

    await apiFetch('/api/pr', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('X-Session-Token')).toBe('session-123');
    expect(headers.get('Authorization')).toBe('Bearer google-123');
  });

  it('calls unauthorized callback on protected 401 responses', async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    const apiFetch = createApiFetch({
      getSessionToken: () => 'session-123',
      getGoogleToken: () => null,
      onUnauthorized,
    });

    await apiFetch('/api/pr');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
