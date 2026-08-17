'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MESSAGES = [
  "Buy 2, Get 3rd Free on Best Sellers",
  "Up to 33% OFF + Freebies on orders above ₹1199",
  "Get a Free Surprise Gift on orders above ₹1199",
  "Build Your Own Bundle — Save an additional up to 15%"
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
    <div className="bg-primary text-primary-foreground text-xs py-2 px-4 flex items-center justify-between font-medium">
      <button onClick={() => setIndex((prev) => (prev - 1 + MESSAGES.length) % MESSAGES.length)} className="hover:opacity-70">
        <ChevronLeft className="h-3 w-3" />
      </button>
      <div className="text-center flex-1 transition-all duration-500 ease-in-out">
        {MESSAGES[index]}
      </div>
      <button onClick={() => setIndex((prev) => (prev + 1) % MESSAGES.length)} className="hover:opacity-70">
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
