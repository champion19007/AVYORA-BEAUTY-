export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-6xl font-extrabold tracking-tighter font-headline">
          New Project
        </h1>
        <p className="text-xl text-muted-foreground">
          Everything has been cleared. You are now working with a blank canvas. Start by editing <code>src/app/page.tsx</code> or adding new components.
        </p>
        <div className="pt-8">
          <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-medium">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Ready to build
          </div>
        </div>
      </div>
    </div>
  );
}
