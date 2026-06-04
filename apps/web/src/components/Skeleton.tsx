export function SkeletonCard() {
  return (
    <div className="app-panel animate-pulse p-4">
      <div className="h-5 w-2/3 rounded bg-white/10" />
      <div className="mt-4 h-3 w-full rounded bg-white/10" />
      <div className="mt-2 h-3 w-4/5 rounded bg-white/10" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="h-12 rounded bg-white/10" />
        <div className="h-12 rounded bg-white/10" />
      </div>
    </div>
  );
}
