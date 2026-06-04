type RatingIconProps = {
  className?: string;
};

export function RatingIcon({ className = "h-5 w-5" }: RatingIconProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <img className="h-full w-full object-contain brightness-0 invert" src="/icons/flash-rating.png" alt="" />
    </span>
  );
}
