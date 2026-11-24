import React, { useState } from 'react';
import { Bike, Check, Copy, ExternalLink } from 'lucide-react';
import { Button, Sheet, cx } from './ui';
import { DELIVERY_SHOPS, listText, searchTerm, shopById } from '../utils/delivery';

const KEY = 'ds_delivery_shop';

/** Pick a shop, copy the list, and open the shop's own search for each item. Nothing is ordered from here. */
export const DeliverySheet: React.FC<{ isOpen: boolean; onClose: () => void; items: string[] }> = ({ isOpen, onClose, items }) => {
  const [shopId, setShopId] = useState(() => {
    try {
      return localStorage.getItem(KEY) || 'tesco';
    } catch {
      return 'tesco';
    }
  });
  const [copied, setCopied] = useState(false);
  const shop = shopById(shopId);

  const choose = (id: string) => {
    setShopId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // not saved; it still works for this visit
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listText(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the list is still visible below
    }
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Get it delivered" subtitle="Pick a shop. You finish the order there." labelledBy="delivery-title">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Where to order from" className="flex flex-wrap gap-1.5">
          {DELIVERY_SHOPS.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={shopId === s.id}
              onClick={() => choose(s.id)}
              className={cx(
                'h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                shopId === s.id ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:border-line-strong'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy list'}
          </Button>
          <a
            href={shop.home}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-[15px] font-semibold text-paper"
          >
            <Bike className="h-4 w-4" /> Open {shop.name}
          </a>
        </div>

        {shop.search ? (
          items.length === 0 ? (
            <p className="text-[14px] text-ink-2">Your list is empty. Add what you need, then come back.</p>
          ) : (
            <section aria-label={`Find each item at ${shop.name}`}>
              <p className="mb-1.5 text-[13px] text-ink-2">Tap an item to find it at {shop.name}.</p>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href={shop.search!(searchTerm(item))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-12 items-center justify-between gap-3 px-3.5 py-2 text-[15px] hover:bg-sunk"
                    >
                      <span className="min-w-0 truncate">{item}</span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-ink-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
        ) : (
          <p className="rounded-xl bg-sunk px-3.5 py-3 text-[14px] text-ink-2">
            {shop.note} Copy your list first and paste it into the search, item by item.
          </p>
        )}

        <p className="text-[12px] text-ink-3">
          Delivery depends on your postcode, and each shop checks that when you start an order. We can’t fill a basket for
          you, so the list is yours to copy.
        </p>
      </div>
    </Sheet>
  );
};
