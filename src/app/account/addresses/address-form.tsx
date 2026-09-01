'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { INDIAN_STATES } from '@/lib/address-schema';
import type { Address } from '@/lib/addresses';
import { saveAddress, type AddressFormState } from './actions';

/**
 * Add / edit address form.
 *
 * Field order follows what Indian customers are used to from Amazon and
 * Flipkart — name, mobile, PIN, then the address lines — because an unfamiliar
 * order on an address form reads as a broken form, not a fresh design.
 *
 * It is a real <form> posting to a server action, so it works before hydration.
 * `useActionState` only adds error display and the pending state on top.
 */
export function AddressForm({ address }: { address?: Address }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AddressFormState, FormData>(saveAddress, {});

  // The action cannot redirect itself without discarding form state on the
  // error paths, so success is signalled back and navigated here instead.
  useEffect(() => {
    if (state.values?.done === 'true') router.push('/account/addresses');
  }, [state, router]);

  // Prefer what the customer just typed, then the saved row, then empty.
  const value = (key: keyof Address | 'isDefault') =>
    state.values?.[key] ?? (address ? String(address[key as keyof Address] ?? '') : '');

  const err = (key: string) => state.fieldErrors?.[key];

  return (
    <form action={formAction} className="mt-8 max-w-xl">
      {address && <input type="hidden" name="id" value={address.id} />}

      {state.error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-[15px] leading-relaxed text-destructive"
        >
          {state.error}
        </p>
      )}

      <Field label="Country/Region">
        <div className="flex h-11 items-center rounded-md border border-border bg-muted/40 px-3 text-[15px] text-muted-foreground">
          India
        </div>
        {/* Only India ships today; the column still stores a country code so
            adding a second one later is a data change, not a schema change. */}
      </Field>

      <Field label="Full name (First and Last name)" htmlFor="fullName" error={err('fullName')}>
        <Input id="fullName" name="fullName" defaultValue={value('fullName')} autoComplete="name" required />
      </Field>

      <Field label="Mobile number" htmlFor="phone" error={err('phone')} hint="May be used to assist delivery">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          defaultValue={value('phone')}
          autoComplete="tel-national"
          required
        />
      </Field>

      <Field label="Pincode" htmlFor="postalCode" error={err('postalCode')}>
        <Input
          id="postalCode"
          name="postalCode"
          inputMode="numeric"
          maxLength={6}
          placeholder="6 digits [0-9] PIN code"
          defaultValue={value('postalCode')}
          autoComplete="postal-code"
          required
        />
      </Field>

      <Field
        label="Flat, House no., Building, Company, Apartment"
        htmlFor="line1"
        error={err('line1')}
      >
        <Input id="line1" name="line1" defaultValue={value('line1')} autoComplete="address-line1" required />
      </Field>

      <Field label="Area, Street, Sector, Village" htmlFor="line2" error={err('line2')}>
        <Input id="line2" name="line2" defaultValue={value('line2')} autoComplete="address-line2" />
      </Field>

      <Field label="Landmark" htmlFor="landmark" error={err('landmark')}>
        <Input
          id="landmark"
          name="landmark"
          placeholder="E.g. near apollo hospital"
          defaultValue={value('landmark')}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Town/City" htmlFor="city" error={err('city')}>
          <Input id="city" name="city" defaultValue={value('city')} autoComplete="address-level2" required />
        </Field>

        <Field label="State" htmlFor="state" error={err('state')}>
          <select
            id="state"
            name="state"
            defaultValue={value('state')}
            required
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-[15px] outline-none transition-colors focus:border-primary"
          >
            <option value="">Choose a state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="mt-2 flex items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Make this my default address
      </label>

      <div className="mt-8 flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="rounded-md px-10 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          {pending ? 'Saving…' : address ? 'Save changes' : 'Add address'}
        </Button>
        <Link href="/account/addresses">
          <Button
            type="button"
            variant="ghost"
            className="rounded-md px-6 py-6 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

/** One labelled row, with its error and hint text. */
function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <Label htmlFor={htmlFor} className="mb-1.5 block text-[15px] font-medium">
        {label}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
