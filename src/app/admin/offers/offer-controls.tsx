'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ProfitSettings } from '@/modules/offers/profit';
import { saveProfitSettingsAction, toggleOfferAction, type SettingsState, type ToggleState } from './actions';

/** Start or stop. Starting re-runs the profit check, so a refusal is shown beside the button. */
export function OfferSwitch({ id, active }: { id: string; active: boolean }) {
  const [state, toggle, pending] = useActionState<ToggleState, FormData>(toggleOfferAction, {});
  return (
    <form action={toggle} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <Button type="submit" variant={active ? 'outline' : 'default'} className="h-8 px-3 text-xs" disabled={pending}>
        {active ? 'Stop' : 'Start'}
      </Button>
      {state.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function ProfitSettingsForm({ settings }: { settings: ProfitSettings }) {
  const [state, save, pending] = useActionState<SettingsState, FormData>(saveProfitSettingsAction, {});
  return (
    <form action={save} className="flex flex-wrap items-end gap-4">
      <label className="text-sm font-medium">
        Minimum profit over cost (%)
        <input
          name="floorPercent"
          defaultValue={settings.floorPercent}
          inputMode="decimal"
          className="mt-1.5 block w-28 rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="text-sm font-medium">
        Payment fee (%)
        <input
          name="paymentFeePercent"
          defaultValue={settings.paymentFeePercent}
          inputMode="decimal"
          className="mt-1.5 block w-28 rounded-md border border-border bg-background px-3 py-2"
        />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        Save
      </Button>
      {state.saved && <p className="text-sm text-emerald-700">Saved.</p>}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
