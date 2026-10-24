'use client';

import { useEffect, useState } from 'react';
import { promotionCovers, type Promotion } from '@/modules/offers/promotions';

/** One request per page load, shared by every badge and hint on it. */
let request: Promise<Promotion[]> | null = null;

function load(): Promise<Promotion[]> {
  request ??= fetch('/api/offers/active')
    .then((r) => (r.ok ? r.json() : { promotions: [] }))
    .then((j: { promotions?: Promotion[] }) => j.promotions ?? [])
    .catch(() => []);
  return request;
}

/** The automatic offers running now, and whether they have loaded (empty on any failure). */
export function usePromotionsState(): { list: Promotion[]; loaded: boolean } {
  const [state, setState] = useState<{ list: Promotion[]; loaded: boolean }>({ list: [], loaded: false });
  useEffect(() => {
    let live = true;
    void load().then((list) => live && setState({ list, loaded: true }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The automatic offers running now (empty until loaded). */
export const usePromotions = (): Promotion[] => usePromotionsState().list;

/** The offers covering one product, best-known first (buy-X-get-Y leads: it is what shoppers look for). */
export function promotionsFor(list: Promotion[], productId: string): Promotion[] {
  return list
    .filter((p) => promotionCovers(p, productId))
    .sort((a, b) => Number(b.kind === 'buy_x_get_y') - Number(a.kind === 'buy_x_get_y'));
}
