import React from 'react';
import type { FlagComponent } from 'country-flag-icons/react/3x2';
import { IT, GR, GB, FR, US, MX, CN, IN, TH, JP, KR, MA, PL, ES, TR, VN, PT, DE, IE, JM, LB, ID, BR, PE, ET, NG } from 'country-flag-icons/react/3x2';
import { POPULAR_CUISINES } from '../data/popularCuisines';

const FLAGS: Record<string, FlagComponent> = { IT, GR, GB, FR, US, MX, CN, IN, TH, JP, KR, MA, PL, ES, TR, VN, PT, DE, IE, JM, LB, ID, BR, PE, ET, NG };

const EXTRA: Record<string, string> = {
  portuguese: 'PT', german: 'DE', irish: 'IE', caribbean: 'JM', jamaican: 'JM', lebanese: 'LB', indonesian: 'ID', brazilian: 'BR',
  peruvian: 'PE', ethiopian: 'ET', nigerian: 'NG', 'west african': 'NG', english: 'GB', scottish: 'GB', welsh: 'GB', 'uk': 'GB',
  mediterranean: 'GR', cajun: 'US', 'tex-mex': 'MX', 'middle eastern': 'LB',
};

/** The flag code for a cuisine name ("Italian" gives IT), or undefined when no country fits. */
export const flagCodeFor = (cuisine?: string): string | undefined => {
  const c = (cuisine || '').trim().toLowerCase();
  if (!c) return undefined;
  return POPULAR_CUISINES.find((p) => p.id.toLowerCase() === c || p.label.toLowerCase() === c)?.code || EXTRA[c];
};

/** A square tile of a cuisine's flag, used where a dish has no photo. */
export const FlagTile: React.FC<{ code: string; size: number; className?: string }> = ({ code, size, className }) => {
  const Flag = FLAGS[code];
  if (!Flag) return null;
  return (
    <span
      aria-hidden="true"
      className={'relative inline-block shrink-0 overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ' + (className || '')}
      style={{ width: size, height: size }}
    >
      <Flag className="absolute top-0 left-1/2 -translate-x-1/2" width={size * 1.5} height={size} preserveAspectRatio="xMidYMid slice" />
    </span>
  );
};

/** A small flag image for a country code, or a plain symbol (🌍, 🕌, 🍽️) where there is no flag. Decorative: the chip's text names it. */
export const CuisineFlag: React.FC<{ code?: string; symbol?: string }> = ({ code, symbol }) => {
  const Flag = code ? FLAGS[code] : undefined;
  if (Flag) return <Flag aria-hidden="true" className="h-3.5 w-5 shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" />;
  return symbol ? (
    <span aria-hidden="true" className="text-[15px] leading-none">
      {symbol}
    </span>
  ) : null;
};
