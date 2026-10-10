'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IS_SAMPLE_CATALOGUE, isShopPath } from '@/lib/catalogue-mode';

/**
 * Shown on the shopping pages (listing, product, compare and checkout) while the sample catalogue is in use
 * (lib/catalogue-mode.ts), so sample inventory is never mistaken for real
 * products. A small fixed note, so the measured page layout is unchanged;
 * it steps aside while the footer is on screen rather than covering it.
 */

export function SampleNotice() {
  const pathname = usePathname() ?? '';
  const [footerVisible, setFooterVisible] = useState(false);
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting));
    io.observe(footer);
    return () => io.disconnect();
  }, []);
  if (!IS_SAMPLE_CATALOGUE || !isShopPath(pathname) || footerVisible) return null;
  return (
    <p
      role="note"
      className="pointer-events-none fixed bottom-4 left-4 z-40 max-w-xs rounded-full bg-black/80 px-4 py-2 text-xs leading-snug text-white shadow-lg"
    >
      Preview shop: products shown are samples, not real stock.
    </p>
  );
}
