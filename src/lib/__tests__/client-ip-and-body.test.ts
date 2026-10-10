import { describe, expect, it } from 'vitest';
import { proxyMode, trustedClientIp } from '../client-ip';
import { readBoundedText } from '../request-body';

const h = (entries: Record<string, string>) => new Headers(entries);

describe('trusted client address', () => {
  it('trusts the proxy-written header only on a verified proxy', () => {
    expect(proxyMode({ VERCEL: '1' })).toBe('vercel');
    expect(proxyMode({})).toBe('none');
    expect(proxyMode({ TRUSTED_PROXY: 'x-forwarded-for' })).toBe('x-forwarded-for');
    expect(proxyMode({ VERCEL: '1', TRUSTED_PROXY: 'none' })).toBe('none');
  });

  it('uses the first forwarded address on Vercel', () => {
    expect(trustedClientIp(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), 'vercel')).toBe('203.0.113.7');
    expect(trustedClientIp(h({ 'x-forwarded-for': '2001:DB8::1' }), 'vercel')).toBe('2001:db8::1');
  });

  it('ignores forwarded headers when no proxy is trusted (they are client-controlled)', () => {
    expect(trustedClientIp(h({ 'x-forwarded-for': '203.0.113.7' }), 'none')).toBeNull();
  });

  it('never trusts x-real-ip alone, or a value that is not an address', () => {
    expect(trustedClientIp(h({ 'x-real-ip': '203.0.113.7' }), 'vercel')).toBeNull();
    expect(trustedClientIp(h({ 'x-forwarded-for': 'unknown' }), 'vercel')).toBeNull();
    expect(trustedClientIp(h({ 'x-forwarded-for': "1.2.3.4'; DROP TABLE" }), 'vercel')).toBeNull();
    expect(trustedClientIp(h({ 'x-forwarded-for': '999.1.1.1' }), 'vercel')).toBeNull();
  });
});

describe('bounded request bodies', () => {
  const stream = (chunks: number, size: number) => {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= chunks) return controller.close();
        sent += 1;
        controller.enqueue(new Uint8Array(size).fill(97));
      },
    });
  };

  it('reads a body within the limit', async () => {
    const r = await readBoundedText(new Request('http://x', { method: 'POST', body: '{"a":1}' }), 100);
    expect(r).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('refuses on the declared length before reading anything', async () => {
    const r = await readBoundedText(
      new Request('http://x', { method: 'POST', body: 'x'.repeat(10), headers: { 'content-length': '5000' } }),
      100
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it('refuses a chunked body once it passes the limit, without reading the rest', async () => {
    let pulled = 0;
    const body = stream(1_000, 1_024);
    const counted = body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
      })
    );
    const r = await readBoundedText(
      new Request('http://x', { method: 'POST', body: counted, duplex: 'half' } as RequestInit),
      4 * 1024
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(await r.response.json()).toMatchObject({ error: { code: 'payload_too_large' } });
    expect(pulled).toBeLessThan(20);
  });
});
