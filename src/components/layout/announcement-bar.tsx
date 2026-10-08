'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FREE_DELIVERY_LINE } from '@/lib/money';

/*
 * Only what checkout actually applies. Buy 2 Get 3rd Free, "up to 33% off",
 * free gifts and bundle savings were advertised here, but no order ever
 * received them: there is no promotion engine, gift fulfilment or bundle
 * pricing yet (audit #07). They return when that exists (prompt 29).
 */
const MESSAGES = [
  FREE_DELIVERY_LINE,
  'Not sure where to start? Try the routine finder',
];

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-foreground text-background text-[10px] py-2 px-4 flex items-center justify-between font-semibold uppercase tracking-[0.2em] transition-colors duration-300">
      <button onClick={() => setIndex((prev) => (prev - 1 + MESSAGES.length) % MESSAGES.length)} className="hover:opacity-70 transition-opacity">
        <ChevronLeft className="h-3 w-3" />
      </button>
      <div className="text-center flex-1 transition-all duration-500 ease-in-out">
        {MESSAGES[index]}
      </div>
      <button onClick={() => setIndex((prev) => (prev + 1) % MESSAGES.length)} className="hover:opacity-70 transition-opacity">
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
