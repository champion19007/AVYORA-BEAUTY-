'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { minProfitablePrice, type ProfitSettings } from '@/modules/offers/profit';
import type { EditableProduct } from '@/modules/catalog/product-store';
import { saveProductAction, uploadProductImage, type SaveProductState, type UploadImageState } from './actions';

type SizeRow = { label: string; price: string; cost: string };

const toRupees = (paise: number | null) => (paise === null ? '' : String(paise / 100));
const toPaise = (rupees: string) => (rupees.trim() === '' ? null : Math.round(Number(rupees) * 100));

const field = 'mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm';
const label = 'block text-sm font-medium';
const hint = 'mt-1 text-xs text-muted-foreground';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The product editor: every field the shop shows, sizes with selling and
 * cost prices, photos, and whether it is on the shop. The profit floor for
 * each size is shown as you type, and the server refuses a live product
 * priced below it.
 */
export function ProductEditor({
  product,
  categories,
  skinTypes,
  slots,
  settings,
}: {
  product: EditableProduct | null;
  categories: readonly (readonly [string, string])[];
  skinTypes: readonly string[];
  slots: { value: string; label: string }[];
  settings: ProfitSettings;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [status, setStatus] = useState(product?.status ?? 'draft');
  const [category, setCategory] = useState(product?.category ?? 'cleanser');
  const [tagline, setTagline] = useState(product?.tagline ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [howToUse, setHowToUse] = useState(product?.howToUse ?? '');
  const [keyIngredients, setKeyIngredients] = useState((product?.keyIngredients ?? []).join('\n'));
  const [fullIngredients, setFullIngredients] = useState(product?.fullIngredients ?? '');
  const [skin, setSkin] = useState<string[]>(product?.skinTypes ?? []);
  const [concerns, setConcerns] = useState((product?.concerns ?? []).join(', '));
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [routineSlot, setRoutineSlot] = useState(product?.routineSlot ?? '');
  const [isBestSeller, setBestSeller] = useState(product?.isBestSeller ?? false);
  const [isNew, setNew] = useState(product?.isNew ?? true);
  const [sortOrder, setSortOrder] = useState(String(product?.sortOrder ?? 0));
  const [sizes, setSizes] = useState<SizeRow[]>(
    product?.sizes.length
      ? product.sizes.map((s) => ({ label: s.label, price: toRupees(s.pricePaise), cost: toRupees(s.costPaise) }))
      : [{ label: '', price: '', cost: '' }]
  );
  const [dirty, setDirty] = useState(false);
  const [saved, save, saving] = useActionState<SaveProductState, FormData>(async (prev, form) => {
    const result = await saveProductAction(prev, form);
    if (result.savedId) setDirty(false);
    return result;
  }, {});
  // An upload adds its link to the list.
  const [upload, uploadAction, uploading] = useActionState<UploadImageState, FormData>(async (prev, form) => {
    const result = await uploadProductImage(prev, form);
    if (result.url) {
      setImages((list) => (list.includes(result.url!) ? list : [...list, result.url!]));
      setDirty(true);
    }
    return result;
  }, {});

  const payload = JSON.stringify({
    ...(product ? { id: product.id } : {}),
    name,
    status,
    category,
    tagline,
    description,
    howToUse,
    keyIngredients,
    fullIngredients,
    skinTypes: skin,
    concerns,
    images: images.join('\n'),
    routineSlot: routineSlot || null,
    isBestSeller,
    isNew,
    sortOrder,
    sizes: sizes
      .filter((s) => s.label.trim() || s.price.trim())
      .map((s) => ({ label: s.label.trim(), pricePaise: toPaise(s.price) ?? 0, costPaise: toPaise(s.cost) })),
  });

  const setSize = (i: number, patch: Partial<SizeRow>) =>
    setSizes((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6 pb-24" onChangeCapture={() => setDirty(true)}>
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All products
      </Link>
      <h1 className="font-headline text-3xl font-normal tracking-tight">{product ? product.name : 'Add a product'}</h1>

      <form id="product-form" action={save} className="space-y-6">
        <input type="hidden" name="product" value={payload} />

        <Section title="Basics">
          <label className={label}>
            Name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Category
              <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              On the shop?
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="draft">Draft: still writing it</option>
                <option value="live">Live: customers can buy it</option>
                <option value="hidden">Hidden: keep it, but off the shop</option>
              </select>
            </label>
          </div>
          <label className={label}>
            Short line under the name
            <input className={field} value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} />
          </label>
          <label className={label}>
            Description
            <textarea className={field} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className={hint}>What it is and who it is for. Describe it; do not promise medical results.</span>
          </label>
          <label className={label}>
            How to use
            <textarea className={field} rows={3} value={howToUse} onChange={(e) => setHowToUse(e.target.value)} />
          </label>
        </Section>

        <Section title="Sizes and prices">
          <p className={hint}>
            Selling price includes GST. Cost is what one unit costs you; customers never see it. The lowest price shown
            keeps cost + {settings.floorPercent}% after GST and a {settings.paymentFeePercent}% payment fee.
          </p>
          {sizes.map((s, i) => {
            const cost = toPaise(s.cost);
            const floor = cost === null ? null : minProfitablePrice(cost, settings);
            const price = toPaise(s.price);
            const below = floor !== null && price !== null && price < floor;
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
                <label className={label}>
                  Size
                  <input
                    className={field}
                    value={s.label}
                    placeholder="50ml"
                    onChange={(e) => setSize(i, { label: e.target.value })}
                  />
                </label>
                <label className={label}>
                  Price ₹
                  <input
                    className={field}
                    inputMode="decimal"
                    value={s.price}
                    onChange={(e) => setSize(i, { price: e.target.value })}
                    aria-invalid={below}
                  />
                </label>
                <label className={label}>
                  Cost ₹
                  <input
                    className={field}
                    inputMode="decimal"
                    value={s.cost}
                    onChange={(e) => setSize(i, { cost: e.target.value })}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove size ${s.label || i + 1}`}
                  onClick={() => setSizes((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <p className={`col-span-4 -mt-1 text-xs ${below ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {floor === null
                    ? 'Add the cost to see the lowest profitable price.'
                    : `Lowest profitable price: ₹${Math.ceil(floor / 100)}${below ? ' — this price is below it.' : '.'}`}
                </p>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setSizes((rows) => [...rows, { label: '', price: '', cost: '' }])}
          >
            <Plus className="h-4 w-4" /> Add a size
          </Button>
          <p className={hint}>Stock for each size is set on the Stock page.</p>
        </Section>

        <Section title="Ingredients and skin">
          <label className={label}>
            Key ingredients (one per line)
            <textarea
              className={field}
              rows={3}
              value={keyIngredients}
              onChange={(e) => setKeyIngredients(e.target.value)}
            />
          </label>
          <label className={label}>
            Full ingredient list
            <textarea
              className={field}
              rows={4}
              value={fullIngredients}
              onChange={(e) => setFullIngredients(e.target.value)}
            />
            <span className={hint}>Copy it exactly as printed on the pack.</span>
          </label>
          <fieldset>
            <legend className={label}>Suits skin types</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {skinTypes.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={skin.includes(t)}
                    onChange={(e) => setSkin((list) => (e.target.checked ? [...list, t] : list.filter((x) => x !== t)))}
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={label}>
            Concerns it is for (comma-separated)
            <input
              className={field}
              value={concerns}
              onChange={(e) => setConcerns(e.target.value)}
              placeholder="dryness, dullness"
            />
          </label>
        </Section>

        <Section title="Shop and routine finder">
          <label className={label}>
            Role in routines
            <select className={field} value={routineSlot} onChange={(e) => setRoutineSlot(e.target.value)}>
              <option value="">Not recommended by the routine finder</option>
              {slots.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className={hint}>The routine finder recommends the live product in each role.</span>
          </label>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isBestSeller} onChange={(e) => setBestSeller(e.target.checked)} /> Best
              seller
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isNew} onChange={(e) => setNew(e.target.checked)} /> New
            </label>
            <label className="flex items-center gap-2 text-sm">
              Position in lists
              <input
                className="w-20 rounded-md border border-border bg-background px-2 py-1"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </label>
          </div>
        </Section>
      </form>

      <Section title="Photos">
        {images.length === 0 && (
          <p className={hint}>No photos yet: the shop shows an Avyora &quot;photo coming soon&quot; image.</p>
        )}
        <ul className="flex flex-wrap gap-3">
          {images.map((url, i) => (
            <li key={url} className="relative h-28 w-28 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of an uploaded file */}
              <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setImages((list) => list.filter((x) => x !== url));
                  setDirty(true);
                }}
                className="absolute right-1 top-1 rounded bg-background/90 px-1.5 text-xs"
              >
                Remove
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 text-[10px]">Main</span>
              )}
            </li>
          ))}
        </ul>
        <form action={uploadAction} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="text-sm"
            required
          />
          <input type="hidden" name="alt" value={name} />
          <Button type="submit" variant="outline" className="gap-2" disabled={uploading}>
            <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload photo'}
          </Button>
        </form>
        {upload.error && (
          <p role="alert" className="text-sm text-destructive">
            {upload.error}
          </p>
        )}
        <p className={hint}>JPEG, PNG or WebP up to 4 MB. The first photo is the main one. Save after adding photos.</p>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {saved.errors?.length ? (
              <ul role="alert" className="list-disc pl-5 text-destructive">
                {saved.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : saved.savedId && !dirty ? (
              <p className="text-emerald-700">
                Saved. Publish from the Products page to put text and photo changes on the shop.
              </p>
            ) : dirty ? (
              <p className="text-muted-foreground">Unsaved changes.</p>
            ) : null}
          </div>
          <Button type="submit" form="product-form" disabled={saving}>
            {saving ? 'Saving…' : 'Save product'}
          </Button>
        </div>
      </div>
    </div>
  );
}
