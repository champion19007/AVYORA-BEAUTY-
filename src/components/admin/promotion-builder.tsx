'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  compilePromotion,
  DEFAULT_CATEGORIES,
  INITIAL_PROMOTION,
  parseHundredths,
  previewPromotion,
  type CategoryOption,
  type PromotionForm,
  type PromotionPayload,
} from './promotion-model';

const control =
  'mt-2 min-h-11 w-full rounded-md border border-slate-500 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16265e]';
const secondaryButton =
  'min-h-11 rounded-md border border-slate-500 px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16265e] disabled:cursor-wait disabled:opacity-60';

type Props = {
  categories?: CategoryOption[];
  /** Optional external API adapter. Reject on failure; do not put API secrets in the browser. */
  onSubmit?: (payload: PromotionPayload) => Promise<void>;
};

export function PromotionBuilder({ categories = DEFAULT_CATEGORIES, onSubmit }: Props) {
  const prefix = useId();
  const [form, setForm] = useState<PromotionForm>(() => ({
    ...INITIAL_PROMOTION,
    categoryIds: categories.some((category) => category.id === 'serum')
      ? ['serum']
      : categories.slice(0, 1).map((category) => category.id),
  }));
  const [sample, setSample] = useState({
    categoryId: categories.some((category) => category.id === 'serum') ? 'serum' : (categories[0]?.id ?? ''),
    eligibleSpend: '50',
    couponApplied: false,
    onSale: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PromotionPayload | null>(null);
  const [notice, setNotice] = useState('');
  const [submitError, setSubmitError] = useState('');
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { errors } = compilePromotion(form, categories, now);
  const preview = previewPromotion(form, { ...sample, basePriceMinor: 5000 });
  const money = (minor: number) =>
    new Intl.NumberFormat(form.currency === 'USD' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency: form.currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  const fieldId = (field: string) => `${prefix}-${field}`;
  function update<K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
    setNotice('');
    setSubmitError('');
  }
  function error(field: keyof PromotionForm) {
    return showErrors && errors[field] ? (
      <p id={fieldId(`${field}-error`)} className="mt-2 text-sm text-red-800">
        {errors[field]}
      </p>
    ) : null;
  }
  function attributes(field: keyof PromotionForm) {
    return {
      id: fieldId(field),
      'aria-invalid': showErrors && Boolean(errors[field]),
      'aria-describedby': showErrors && errors[field] ? fieldId(`${field}-error`) : undefined,
    };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const compiled = compilePromotion(form, categories, Date.now());
    setNow(Date.now());
    setShowErrors(true);
    setSubmitError('');
    setNotice('');
    if (!compiled.payload) {
      window.requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      if (onSubmit) await onSubmit(compiled.payload);
      setResult(compiled.payload);
      setNotice(onSubmit ? 'Your API accepted the promotion.' : 'JSON prepared. No storefront prices have changed.');
    } catch {
      setSubmitError('The promotion could not be submitted. Your inputs are still here. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'promotion.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('JSON downloaded.');
  }

  return (
    <section
      aria-labelledby={fieldId('heading')}
      className="rounded-xl border border-slate-300 bg-[#faf8f3] p-4 font-sans text-[#16265e] sm:p-7"
    >
      <div className="mb-7 max-w-2xl">
        <h2 id={fieldId('heading')} className="font-headline text-3xl tracking-tight">
          Build a promotion
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose who qualifies, set the saving, and check the customer view before handing the rule to your commerce
          platform.
        </p>
        <p className="mt-2 text-sm font-medium">
          {onSubmit ? 'Submission uses your connected API.' : 'Draft workspace · Exporting does not publish an offer.'}
        </p>
      </div>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <form onSubmit={submit} noValidate className="min-w-0 space-y-7">
          <div
            ref={errorSummary}
            tabIndex={-1}
            className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16265e]"
          >
            {showErrors && Object.keys(errors).length > 0 ? (
              <p role="alert" className="rounded-md border border-red-700 bg-red-50 p-3 text-sm text-red-800">
                Check the highlighted fields below. Your promotion has not been exported.
              </p>
            ) : null}
          </div>
          <fieldset disabled={busy} className="min-w-0 space-y-7 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <div>
                <label htmlFor={fieldId('name')} className="text-sm font-semibold">
                  Offer name
                </label>
                <input
                  {...attributes('name')}
                  value={form.name}
                  maxLength={80}
                  placeholder="e.g. October serum offer"
                  onChange={(event) => update('name', event.target.value)}
                  className={control}
                />
                {error('name')}
              </div>
              <div>
                <label htmlFor={fieldId('currency')} className="text-sm font-semibold">
                  Currency
                </label>
                <select
                  id={fieldId('currency')}
                  value={form.currency}
                  onChange={(event) => update('currency', event.target.value as PromotionForm['currency'])}
                  className={control}
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-600">
              Changing currency keeps the entered numbers. It does not convert amounts at an exchange rate.
            </p>

            <fieldset className="min-w-0 border-t border-slate-300 pt-5">
              <legend className="pr-3 text-lg font-semibold">When a customer shops…</legend>
              <p className="mb-3 text-sm text-slate-600">Any of these categories qualifies.</p>
              <div
                role="group"
                aria-label="Eligible categories"
                className="flex flex-wrap gap-2"
                {...attributes('categoryIds')}
              >
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-500 bg-white px-3 py-2 text-sm has-[:checked]:border-[#16265e] has-[:checked]:bg-[#e9edf7]"
                  >
                    <input
                      type="checkbox"
                      value={category.id}
                      checked={form.categoryIds.includes(category.id)}
                      onChange={(event) =>
                        update(
                          'categoryIds',
                          event.target.checked
                            ? [...form.categoryIds, category.id]
                            : form.categoryIds.filter((id) => id !== category.id)
                        )
                      }
                      className="h-4 w-4 accent-[#16265e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16265e]"
                    />
                    {category.label}
                  </label>
                ))}
              </div>
              {!categories.length ? (
                <p className="text-sm text-red-800">Add categories to your catalogue before building an offer.</p>
              ) : null}
              {error('categoryIds')}
              <label htmlFor={fieldId('minimumSpend')} className="mt-5 block text-sm font-medium">
                And spends at least ({form.currency})
              </label>
              <input
                {...attributes('minimumSpend')}
                type="number"
                inputMode="decimal"
                min="0"
                max="1000000"
                step="0.01"
                value={form.minimumSpend}
                onChange={(event) => update('minimumSpend', event.target.value)}
                className={control}
              />
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Total of eligible items before discounts, excluding tax and shipping. Enter 0 for no minimum. Sale items
                do not qualify when excluded below.
              </p>
              {error('minimumSpend')}
            </fieldset>

            <fieldset className="min-w-0 border-t border-slate-300 pt-5">
              <legend className="pr-3 text-lg font-semibold">Then reduce each eligible item by…</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={fieldId('discountType')} className="text-sm font-medium">
                    Discount type
                  </label>
                  <select
                    id={fieldId('discountType')}
                    value={form.discountType}
                    onChange={(event) => update('discountType', event.target.value as PromotionForm['discountType'])}
                    className={control}
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="fixed_amount">Fixed amount off</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={fieldId('discountValue')} className="text-sm font-medium">
                    {form.discountType === 'percentage' ? 'Percentage (%)' : `Amount (${form.currency})`}
                  </label>
                  <input
                    {...attributes('discountValue')}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max={form.discountType === 'percentage' ? 100 : 1000000}
                    step="0.01"
                    value={form.discountValue}
                    onChange={(event) => update('discountValue', event.target.value)}
                    className={control}
                  />
                  {error('discountValue')}
                </div>
              </div>
            </fieldset>

            <fieldset className="min-w-0 space-y-4 border-t border-slate-300 pt-5">
              <legend className="pr-3 text-lg font-semibold">Keep the offer safe</legend>
              <Toggle
                id={fieldId('stacking')}
                checked={form.preventCouponStacking}
                onChange={(value) => update('preventCouponStacking', value)}
                label="Prevent coupon stacking"
                description="Do not apply this offer when a coupon is already used."
              />
              <Toggle
                id={fieldId('sale')}
                checked={form.excludeSaleItems}
                onChange={(value) => update('excludeSaleItems', value)}
                label="Exclude items already on sale"
                description="Protect products that already have a reduced price."
              />
              <div>
                <label htmlFor={fieldId('maxDiscountPercent')} className="text-sm font-medium">
                  Never discount an item by more than (%)
                </label>
                <input
                  {...attributes('maxDiscountPercent')}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={form.maxDiscountPercent}
                  onChange={(event) => update('maxDiscountPercent', event.target.value)}
                  className={control}
                />
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Fixed discounts are capped at this limit for each item. Other automatic promotions use the single best
                  offer.
                </p>
                {error('maxDiscountPercent')}
              </div>
              {!form.preventCouponStacking ||
              !form.excludeSaleItems ||
              (parseHundredths(form.maxDiscountPercent) ?? 0) > 5000 ? (
                <p className="rounded-md border border-amber-700 bg-amber-50 p-3 text-sm text-amber-900">
                  Review your margin: {!form.preventCouponStacking ? 'coupons can combine with this offer. ' : ''}
                  {!form.excludeSaleItems ? 'Sale items can receive another discount. ' : ''}
                  {(parseHundredths(form.maxDiscountPercent) ?? 0) > 5000
                    ? 'Your safety limit allows discounts above 50%.'
                    : ''}
                </p>
              ) : null}
            </fieldset>

            <fieldset className="min-w-0 space-y-4 border-t border-slate-300 pt-5">
              <legend className="pr-3 text-lg font-semibold">Run the offer…</legend>
              <div>
                <label htmlFor={fieldId('timezone')} className="text-sm font-medium">
                  Schedule timezone
                </label>
                <select
                  id={fieldId('timezone')}
                  value={form.timezone}
                  onChange={(event) => update('timezone', event.target.value as PromotionForm['timezone'])}
                  className={control}
                >
                  <option value="Asia/Kolkata">India Standard Time (UTC+05:30)</option>
                  <option value="UTC">UTC (UTC+00:00)</option>
                </select>
                <p className="mt-2 text-xs text-slate-600">Changing this zone reinterprets the times entered below.</p>
              </div>
              <div>
                <label htmlFor={fieldId('startMode')} className="text-sm font-medium">
                  Start
                </label>
                <select
                  id={fieldId('startMode')}
                  value={form.startMode}
                  onChange={(event) => update('startMode', event.target.value as PromotionForm['startMode'])}
                  className={control}
                >
                  <option value="immediately">When published by the commerce platform</option>
                  <option value="scheduled">At a specific date and time</option>
                </select>
              </div>
              {form.startMode === 'scheduled' ? (
                <div>
                  <label htmlFor={fieldId('startsAt')} className="text-sm font-medium">
                    Starts at ({form.timezone})
                  </label>
                  <input
                    {...attributes('startsAt')}
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => update('startsAt', event.target.value)}
                    className={control}
                  />
                  {error('startsAt')}
                </div>
              ) : null}
              <Toggle
                id={fieldId('hasEnd')}
                checked={form.hasEnd}
                onChange={(value) => update('hasEnd', value)}
                label="Set an end date"
                description="Stop automatically at the selected time."
              />
              {form.hasEnd ? (
                <div>
                  <label htmlFor={fieldId('endsAt')} className="text-sm font-medium">
                    Ends at ({form.timezone})
                  </label>
                  <input
                    {...attributes('endsAt')}
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => update('endsAt', event.target.value)}
                    className={control}
                  />
                  {error('endsAt')}
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  No end date. The offer will need to be stopped manually after publication.
                </p>
              )}
            </fieldset>
            <button
              type="submit"
              disabled={!categories.length}
              className="min-h-12 w-full rounded-md bg-[#16265e] px-5 py-3 text-sm font-semibold text-white hover:bg-[#243b7c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16265e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Preparing promotion…' : onSubmit ? 'Submit promotion to API' : 'Prepare promotion JSON'}
            </button>
          </fieldset>
          <p role="status" className="text-sm leading-6">
            {notice}
          </p>
          {submitError ? (
            <p role="alert" className="text-sm text-red-800">
              {submitError}
            </p>
          ) : null}
        </form>

        <aside aria-label="Storefront preview" className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <div className="border-b border-slate-300 px-5 py-4">
              <h3 className="text-lg font-semibold">Storefront preview</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Illustrative $50 product, or ₹50 when INR is selected. This is not a catalogue price.
              </p>
            </div>
            <div className="px-5 pb-6 pt-5">
              <p className="font-headline text-2xl">Sample skincare product</p>
              <p className="mt-1 text-sm text-slate-600">
                {categories.find((category) => category.id === sample.categoryId)?.label ?? 'Choose a category below'}
              </p>
              <div aria-live="polite" aria-atomic="true" className="mt-5">
                <div className="flex flex-wrap items-baseline gap-3">
                  {preview.savingMinor > 0 ? (
                    <del className="text-lg text-slate-600">
                      <span className="sr-only">Original price </span>
                      {money(5000)}
                    </del>
                  ) : null}
                  <span className="text-4xl font-semibold tracking-tight">
                    <span className="sr-only">Preview price </span>
                    {money(preview.priceMinor)}
                  </span>
                  {preview.savingMinor > 0 ? (
                    <span className="rounded bg-[#f3e5b5] px-2 py-1 text-sm font-semibold text-[#16265e]">
                      {Number((preview.savingMinor / 50).toFixed(2))}% OFF
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm">{preview.reason}</p>
                {preview.savingMinor > 0 ? (
                  <p className="mt-1 text-sm">
                    Customer saves {money(preview.savingMinor)} per item.
                    {preview.capped ? ' Your safety limit capped this discount.' : ''}
                  </p>
                ) : null}
              </div>
              <p className="mt-5 border-t border-slate-300 pt-4 text-xs leading-5 text-slate-600">
                Preview assumes the offer is within its active schedule.{' '}
                {form.startMode === 'scheduled'
                  ? 'Scheduled offers will not appear before their start time.'
                  : 'Exporting alone will not activate it.'}
              </p>
            </div>
          </div>
          <fieldset className="min-w-0 space-y-4 rounded-lg border border-slate-300 bg-white p-5">
            <legend className="px-1 text-sm font-semibold">Try a sample basket</legend>
            <div>
              <label htmlFor={fieldId('sampleCategory')} className="text-sm font-medium">
                Sample product category
              </label>
              <select
                id={fieldId('sampleCategory')}
                value={sample.categoryId}
                onChange={(event) => setSample((current) => ({ ...current, categoryId: event.target.value }))}
                className={control}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('sampleSpend')} className="text-sm font-medium">
                Eligible spend ({form.currency})
              </label>
              <input
                id={fieldId('sampleSpend')}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={sample.eligibleSpend}
                onChange={(event) => setSample((current) => ({ ...current, eligibleSpend: event.target.value }))}
                className={control}
              />
              <p className="mt-2 text-xs text-slate-600">
                Test the qualifying basket total independently of the sample product price.
              </p>
            </div>
            <Toggle
              id={fieldId('sampleCoupon')}
              checked={sample.couponApplied}
              onChange={(value) => setSample((current) => ({ ...current, couponApplied: value }))}
              label="Basket has a coupon"
            />
            <Toggle
              id={fieldId('sampleSale')}
              checked={sample.onSale}
              onChange={(value) => setSample((current) => ({ ...current, onSale: value }))}
              label="Sample item is already on sale"
            />
          </fieldset>
        </aside>
      </div>
      {result ? (
        <div className="mt-7 min-w-0 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">API payload</h3>
            <button type="button" onClick={download} className={secondaryButton}>
              Download JSON
            </button>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer rounded py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16265e]">
              Inspect JSON
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-100 p-4 text-xs text-slate-900">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label id={`${id}-label`} htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p id={`${id}-description`} className="mt-1 text-xs leading-5 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16265e] ${checked ? 'bg-[#16265e]' : 'bg-white'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full ${checked ? 'right-0.5 bg-white' : 'left-0.5 bg-slate-600'}`}
        />
      </button>
    </div>
  );
}
