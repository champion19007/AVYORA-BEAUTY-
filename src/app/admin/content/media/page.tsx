import type { Metadata } from 'next';
import Link from 'next/link';
import { isDatabaseConfigured } from '@/db';
import { objectStorage } from '@/infrastructure/storage';
import { recentMedia } from '@/modules/cms/media';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  if (!isDatabaseConfigured()) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-[15px] text-muted-foreground">
        No database is configured on this deployment.
      </p>
    );
  }

  const storage = objectStorage();
  const assets = await recentMedia();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/content"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-primary"
        >
          ← Content
        </Link>
        <h1 className="mt-2 font-headline text-3xl font-normal tracking-tight">Media library</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {storage
            ? `JPEG, PNG, WebP or AVIF, up to 4 MB. Stored in ${storage.kind}.`
            : 'Uploads are off: no object storage is configured on this deployment.'}
        </p>
      </div>

      {storage && <UploadForm />}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets.map((asset) => (
          <li key={asset.id} className="overflow-hidden rounded-xl border border-border bg-card">
            {asset.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- storage hosts vary; no loader configured for them
              <img src={asset.url} alt={asset.alt} className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square w-full bg-muted" />
            )}
            <div className="space-y-1 p-3 text-[12px]">
              <p className="truncate">{asset.alt || 'No description'}</p>
              <code className="block select-all break-all text-muted-foreground">{asset.id}</code>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
