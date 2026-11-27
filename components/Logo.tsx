export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="15" cy="20" r="11" fill="#123C2E" />
      <circle cx="25" cy="20" r="11" fill="#E0A84C" fillOpacity="0.92" />
      <circle cx="20" cy="20" r="4.5" fill="#F7F1E7" />
    </svg>
  );
}
