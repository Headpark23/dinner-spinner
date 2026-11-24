import React from 'react';
import type { FlagComponent } from 'country-flag-icons/react/3x2';
import { IT, GR, GB, FR, US, MX, CN, IN, TH, JP, KR, MA, PL, ES, TR, VN } from 'country-flag-icons/react/3x2';

const FLAGS: Record<string, FlagComponent> = { IT, GR, GB, FR, US, MX, CN, IN, TH, JP, KR, MA, PL, ES, TR, VN };

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
