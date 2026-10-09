import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { privateStorage } from '@/modules/scans/private-storage';
import { hostedScansEnabled } from '@/modules/scans/scan-http';
import { ScanFlow } from './scan-flow';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Optional face photo', robots: { index: false } };

/**
 * Optional, flag-gated photo step (NEXT_PUBLIC_FACE_SCAN=1). The only route
 * whose Permissions-Policy allows the camera. Uploading additionally needs
 * FACE_SCAN_HOSTED=1, private storage and a signed-in account; otherwise
 * photos are checked in the browser and never leave it.
 */
export default async function ScanPage() {
  if (process.env.NEXT_PUBLIC_FACE_SCAN !== '1') notFound();
  const session = await auth().catch(() => null);
  const hosted = hostedScansEnabled() && privateStorage() !== null;
  return <ScanFlow hosted={hosted} signedIn={Boolean(session?.user?.id)} />;
}
