
'use client';

/**
 * AppLayout is now a thin wrapper as the main shell logic 
 * has been consolidated into ClientLayoutWrapper for a 
 * single persistent app shell as requested.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full">
      {children}
    </div>
  );
}
