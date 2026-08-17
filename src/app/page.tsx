export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">Clean Slate</h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
          Your project has been reset. You're ready to start building your next big idea from scratch.
        </p>
      </div>
    </div>
  );
}
