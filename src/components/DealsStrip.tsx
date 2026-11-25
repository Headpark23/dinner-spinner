import React, { useState } from 'react';
import { Check, ChevronDown, Copy, Plus, Tag, Trash2, X } from 'lucide-react';
import {
  eligibilityLabel,
  GROCERY_PROVIDERS,
  PROVIDER_NAMES,
  TAKEAWAY_PROVIDERS,
  type DeliveryDeal,
  type DeliveryProviderId,
} from '../utils/deliveryDeals';
import { useDeliveryDeals } from '../utils/useDeliveryDeals';
import { Button, Card, Chip, Select, TextInput, cx } from './ui';

const CodeCopyButton: React.FC<{ code: string; compact?: boolean }> = ({ code, compact }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy discount code ${code}`}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-tomato/45 bg-tomato-soft/75 font-mono font-semibold text-tomato transition-colors hover:bg-tomato-soft',
        compact ? 'px-2 py-1 text-[11.5px]' : 'px-2.5 py-1.5 text-[12.5px]'
      )}
    >
      <span>{code}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-sage" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const DealBadges: React.FC<{ deal: DeliveryDeal }> = ({ deal }) => (
  <div className="flex flex-wrap items-center gap-1">
    <Chip tone={deal.eligibility === 'household' ? 'tomato' : deal.eligibility === 'everyone' ? 'sage' : 'neutral'}>
      {eligibilityLabel(deal.eligibility)}
    </Chip>
    {deal.minSpend && <Chip tone="outline">{deal.minSpend}</Chip>}
    {deal.isAffiliate && <Chip tone="outline">Ad</Chip>}
  </div>
);

/**
 * Compact Warm Editorial Kitchen card for TakeawayView showing tonight's winning delivery firm,
 * other delivery firms' active offers, and a quick "+ Got a code?" household pin form.
 */
export const TakeawayDealsCard: React.FC = () => {
  const { topPick, ranked, pinDeal, removePin, savingPin } = useDeliveryDeals('takeaway');
  const [expanded, setExpanded] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [providerId, setProviderId] = useState<DeliveryProviderId>('ubereats');
  const [headline, setHeadline] = useState('');
  const [code, setCode] = useState('');

  const handlePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim()) return;
    await pinDeal({ providerId, headline: headline.trim(), code: code.trim() || undefined });
    setHeadline('');
    setCode('');
    setShowPinForm(false);
  };

  if (!topPick) return null;
  const others = ranked.slice(1);

  return (
    <Card className="p-4" aria-label="Best delivery deal tonight">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5 text-tomato">
            <Tag className="h-3 w-3" /> Best delivery deal tonight
          </p>
          <p className="mt-1 font-display text-[19px] leading-snug font-semibold text-ink">
            {topPick.providerName} · {topPick.headline}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPinForm((v) => !v)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-paper px-2.5 text-[12px] font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
        >
          {showPinForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5 text-tomato" />}
          {showPinForm ? 'Close' : 'Got a code?'}
        </button>
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{topPick.detail}</p>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <DealBadges deal={topPick} />
        <div className="flex items-center gap-1.5">
          {topPick.code && <CodeCopyButton code={topPick.code} />}
          {topPick.source === 'household' && (
            <button
              type="button"
              onClick={() => removePin(topPick.id)}
              aria-label="Remove pinned code"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-sunk hover:text-tomato"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showPinForm && (
        <form onSubmit={handlePin} className="fade-up mt-3 space-y-2 rounded-2xl border border-line bg-sunk/60 p-3">
          <p className="text-[12.5px] font-medium text-ink-2">
            Got a targeted app code by email or notification? Pin it for tonight so everyone knows which app to use.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value as DeliveryProviderId)}
              aria-label="Delivery firm"
              className="h-10 text-[13.5px]"
            >
              {TAKEAWAY_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_NAMES[id]}
                </option>
              ))}
            </Select>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code (optional)"
              aria-label="Discount code"
              className="h-10 font-mono text-[13px] uppercase"
            />
          </div>
          <div className="flex gap-2">
            <TextInput
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. 40% off £20+ on my account"
              aria-label="Offer details"
              className="h-10 text-[13.5px]"
              required
            />
            <Button type="submit" variant="primary" size="sm" disabled={savingPin || !headline.trim()}>
              Pin
            </Button>
          </div>
        </form>
      )}

      {others.length > 0 && (
        <div className="mt-3 border-t border-line/80 pt-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between text-[12.5px] font-semibold text-ink-2 hover:text-ink"
          >
            <span>Compare {others.map((o) => o.providerName).join(' & ')}</span>
            <ChevronDown className={cx('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
          {expanded && (
            <ul className="fade-up mt-2 divide-y divide-line/80">
              {others.map((deal) => (
                <li key={deal.id} className="flex items-start justify-between gap-2 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {deal.providerName} · <span className="font-medium text-ink-2">{deal.headline}</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{deal.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {deal.code && <CodeCopyButton code={deal.code} compact />}
                    {deal.source === 'household' && (
                      <button
                        type="button"
                        onClick={() => removePin(deal.id)}
                        aria-label={`Remove ${deal.providerName} pin`}
                        className="p-1 text-ink-3 hover:text-tomato"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
};

/**
 * Compact grocery offer banner inside DeliverySheet for the selected supermarket/delivery app.
 */
export const GroceryDealBanner: React.FC<{
  shopId: string;
  deal?: DeliveryDeal;
  onPin: (input: { providerId: DeliveryProviderId; headline: string; code?: string }) => Promise<void>;
  onRemovePin: (id: string) => Promise<void>;
}> = ({ shopId, deal, onPin, onRemovePin }) => {
  const [showPin, setShowPin] = useState(false);
  const [headline, setHeadline] = useState('');
  const [code, setCode] = useState('');

  const validShopId = (GROCERY_PROVIDERS.includes(shopId as DeliveryProviderId)
    ? shopId
    : 'tesco') as DeliveryProviderId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim()) return;
    await onPin({ providerId: validShopId, headline: headline.trim(), code: code.trim() || undefined });
    setHeadline('');
    setCode('');
    setShowPin(false);
  };

  return (
    <div className="rounded-2xl border border-line/90 bg-sunk/65 p-3">
      {deal ? (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-tomato">
                <Tag className="h-3 w-3" /> {deal.activeToday ? 'Offer today' : 'Worth checking'}
              </p>
              <p className="mt-0.5 text-[14px] font-semibold leading-snug text-ink">{deal.headline}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="shrink-0 text-[12px] font-semibold text-ink-2 hover:text-ink"
            >
              {showPin ? 'Close' : '+ Code'}
            </button>
          </div>
          <p className="text-[12.5px] leading-snug text-ink-2">{deal.detail}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <DealBadges deal={deal} />
            <div className="flex items-center gap-1">
              {deal.code && <CodeCopyButton code={deal.code} compact />}
              {deal.source === 'household' && (
                <button
                  type="button"
                  onClick={() => onRemovePin(deal.id)}
                  aria-label="Remove pinned code"
                  className="p-1 text-ink-3 hover:text-tomato"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12.5px] text-ink-2">No live voucher listed for {PROVIDER_NAMES[validShopId]} today.</p>
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="shrink-0 text-[12px] font-semibold text-tomato hover:underline"
          >
            {showPin ? 'Close' : '+ Pin a code'}
          </button>
        </div>
      )}

      {showPin && (
        <form onSubmit={submit} className="fade-up mt-2.5 flex flex-wrap gap-2 border-t border-line pt-2.5">
          <TextInput
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder={`e.g. £15 off £60 at ${PROVIDER_NAMES[validShopId]}`}
            aria-label="Offer details"
            className="h-9 min-w-[160px] flex-1 text-[13px]"
            required
          />
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code"
            aria-label="Voucher code"
            className="h-9 w-28 font-mono text-[12.5px] uppercase"
          />
          <Button type="submit" variant="primary" size="sm" className="min-h-9 h-9" disabled={!headline.trim()}>
            Pin
          </Button>
        </form>
      )}
    </div>
  );
};
