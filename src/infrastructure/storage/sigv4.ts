import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, for S3-compatible object storage.
 *
 * Hand-written instead of pulling in the AWS SDK: signing is about sixty lines,
 * the SDK is megabytes, and the same signature works for AWS S3, Cloudflare R2,
 * Backblaze B2 and MinIO. The tests check it against the worked examples in
 * AWS's own S3 documentation, so a mistake here fails loudly rather than
 * surfacing as a 403 in production.
 */

export type SigV4Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
};

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC 3986 encoding, which is stricter than encodeURIComponent. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalUri(pathname: string): string {
  // The URL parser has already percent-encoded some characters; decode first
  // so nothing is encoded twice.
  return pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/');
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function amzDates(now: Date) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(creds: SigV4Credentials, dateStamp: string): Buffer {
  const service = creds.service ?? 's3';
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, creds.region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function signature(
  creds: SigV4Credentials,
  amzDate: string,
  dateStamp: string,
  canonicalRequest: string
): { scope: string; signature: string } {
  const scope = `${dateStamp}/${creds.region}/${creds.service ?? 's3'}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  return {
    scope,
    signature: createHmac('sha256', signingKey(creds, dateStamp)).update(stringToSign).digest('hex'),
  };
}

/**
 * Signs a request with an Authorization header.
 *
 * `headers` should include every header to be signed other than `host`,
 * `x-amz-date` and `x-amz-content-sha256`, which are added here. Returns the
 * complete header set to send.
 */
export function signRequest(options: {
  method: string;
  url: URL;
  headers?: Record<string, string>;
  payloadHash: string;
  credentials: SigV4Credentials;
  now?: Date;
}): Record<string, string> {
  const { amzDate, dateStamp } = amzDates(options.now ?? new Date());

  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])
    ),
    host: options.url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': options.payloadHash,
  };

  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri(options.url.pathname),
    canonicalQuery(options.url.searchParams),
    names.map((n) => `${n}:${headers[n].replace(/\s+/g, ' ')}\n`).join(''),
    signedHeaders,
    options.payloadHash,
  ].join('\n');

  const { scope, signature: sig } = signature(options.credentials, amzDate, dateStamp, canonicalRequest);

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${options.credentials.accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${sig}`,
  };
}

/** A pre-signed URL: anyone holding it may perform `method` until it expires. */
export function presignUrl(options: {
  method: string;
  url: URL;
  expiresSeconds: number;
  credentials: SigV4Credentials;
  now?: Date;
}): string {
  const { amzDate, dateStamp } = amzDates(options.now ?? new Date());
  const scope = `${dateStamp}/${options.credentials.region}/${options.credentials.service ?? 's3'}/aws4_request`;

  const url = new URL(options.url.toString());
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', `${options.credentials.accessKeyId}/${scope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(options.expiresSeconds));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri(url.pathname),
    canonicalQuery(url.searchParams),
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const { signature: sig } = signature(options.credentials, amzDate, dateStamp, canonicalRequest);
  return `${url.origin}${canonicalUri(url.pathname)}?${canonicalQuery(url.searchParams)}&X-Amz-Signature=${sig}`;
}
