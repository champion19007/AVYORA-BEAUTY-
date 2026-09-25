import { describe, it, expect } from 'vitest';
import { EMPTY_SHA256, presignUrl, sha256Hex, signRequest } from '../storage/sigv4';

/**
 * The worked examples from AWS's S3 documentation ("Signature Calculations
 * for the Authorization Header" and "Query String Authentication"). The
 * credentials are AWS's published example keys, not real ones.
 */
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};
const now = new Date('2013-05-24T00:00:00Z');

const signatureOf = (authorization: string) => authorization.split('Signature=')[1];

describe('SigV4', () => {
  it('matches the AWS GET Object example', () => {
    const headers = signRequest({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { Range: 'bytes=0-9' },
      payloadHash: EMPTY_SHA256,
      credentials,
      now,
    });
    expect(signatureOf(headers.authorization)).toBe(
      'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
    );
    expect(headers.authorization).toContain('SignedHeaders=host;range;x-amz-content-sha256;x-amz-date');
  });

  it('matches the AWS PUT Object example, including an encoded path', () => {
    const body = 'Welcome to Amazon S3.';
    const headers = signRequest({
      method: 'PUT',
      url: new URL('https://examplebucket.s3.amazonaws.com/test$file.text'),
      headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      payloadHash: sha256Hex(body),
      credentials,
      now,
    });
    expect(sha256Hex(body)).toBe('44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    expect(signatureOf(headers.authorization)).toBe(
      '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd'
    );
  });

  it('matches the AWS pre-signed URL example', () => {
    const url = presignUrl({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      expiresSeconds: 86_400,
      credentials,
      now,
    });
    expect(url).toContain(
      'X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'
    );
  });
});
