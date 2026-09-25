import { assertSafeKey, type ObjectStorage } from './object-storage';
import { EMPTY_SHA256, sha256Hex, signRequest, type SigV4Credentials } from './sigv4';

/**
 * Any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2, MinIO.
 *
 * Path-style addressing (`endpoint/bucket/key`), which every one of those
 * accepts. Reads for the storefront do not come through here; they go to
 * `publicUrl`, a public bucket domain or CDN in front of it.
 */
export type S3Config = {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  credentials: SigV4Credentials;
  timeoutMs?: number;
};

export class S3Storage implements ObjectStorage {
  readonly kind = 's3';

  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private objectUrl(key: string, query?: Record<string, string>): URL {
    assertSafeKey(key);
    const url = new URL(`${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}/${key}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    return url;
  }

  private async send(method: string, url: URL, body?: Uint8Array, extra?: Record<string, string>) {
    const headers = signRequest({
      method,
      url,
      headers: extra,
      payloadHash: body ? sha256Hex(body) : EMPTY_SHA256,
      credentials: this.config.credentials,
    });
    // `host` is set by fetch from the URL and may not be passed explicitly.
    const { host: _host, ...sendable } = headers;
    void _host;
    return this.fetchImpl(url, {
      method,
      headers: sendable,
      body: body ? Buffer.from(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const res = await this.send('PUT', this.objectUrl(key), body, { 'content-type': contentType });
    if (!res.ok) throw new Error(`Object storage PUT failed: ${res.status}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.send('GET', this.objectUrl(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Object storage GET failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async list(prefix: string): Promise<string[]> {
    const url = new URL(`${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}`);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    const res = await this.send('GET', url);
    if (!res.ok) throw new Error(`Object storage LIST failed: ${res.status}`);
    const xml = await res.text();
    // One page (up to 1,000 keys) is enough for the exports that use this.
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }
}
