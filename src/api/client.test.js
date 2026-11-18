import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http } from './client.js';

function stubFetch(response) {
  const fetchStub = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('http', () => {
  it('builds query strings, leaving out empty values', async () => {
    const fetchStub = stubFetch(json([]));

    await http.get('/commits', { ref: 'feature/a b', limit: 10, skip: undefined });

    expect(fetchStub.mock.calls[0][0]).toBe('/api/commits?ref=feature%2Fa+b&limit=10');
  });

  it('sends JSON and reads an empty reply as null', async () => {
    const fetchStub = stubFetch(new Response(null, { status: 204 }));

    await expect(http.post('/push', { force: true })).resolves.toBeNull();

    const [, init] = fetchStub.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"force":true}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('turns server errors into an ApiError', async () => {
    stubFetch(json({ error: { code: 'CONFLICTS', message: 'Stopped', details: 'raw' } }, 409));

    const error = await http.post('/merge').catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'CONFLICTS',
      message: 'Stopped',
      details: 'raw',
    });
  });

  it('passes a signal through, so a read can be called off', async () => {
    const fetchStub = stubFetch(json([]));
    const controller = new AbortController();

    await http.get('/status', undefined, { signal: controller.signal });

    expect(fetchStub.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('lets a request that was called off reject as such, not as an unreachable server', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    const error = await http
      .get('/status', undefined, { signal: controller.signal })
      .catch((caught) => caught);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('AbortError');
  });

  it('never takes a reply cut short by calling it off for an empty answer', async () => {
    const controller = new AbortController();
    const response = json({ files: [] });
    vi.spyOn(response, 'json').mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    stubFetch(response);

    await expect(
      http.get('/status', undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('handles replies that are not JSON, such as a failing dev proxy', async () => {
    stubFetch(new Response('Bad gateway', { status: 500 }));

    await expect(http.get('/status')).rejects.toMatchObject({ status: 500, code: 'UNKNOWN' });
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));

    await expect(http.get('/status')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
