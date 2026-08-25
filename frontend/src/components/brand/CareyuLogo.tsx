import { BRAND_NAME, LOGO_ASSET_PATH } from '@/lib/branding';

interface CareyuLogoProps {
  variant?: 'light' | 'dark' | 'auto';
  compact?: boolean;
  className?: string;
}

/**
 * Official CareYu lockup.
 * - light: used on navy auth panel — compact light plate only around the artwork
 * - dark: used on light backgrounds
 */
export default function CareyuLogo({
  variant = 'auto',
  compact = false,
  className = '',
}: CareyuLogoProps) {
  const onDark = variant === 'light';
  return (
    <div
      className={`careyu-lockup ${onDark ? 'careyu-lockup--on-dark' : 'careyu-lockup--on-light'} ${
        compact ? 'careyu-lockup--compact' : ''
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_ASSET_PATH} alt={BRAND_NAME} className="careyu-logo-img" />
    </div>
  );
}
