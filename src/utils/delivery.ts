/**
 * Ways to get a shopping list delivered. None of these shops lets another app fill a basket, so the app opens
 * the shop's own search for each item (and the shop's home page), and offers the whole list to copy.
 * Which shops deliver to you depends on your postcode; each site checks that when you start an order.
 */
export type DeliveryShop = {
  id: string;
  name: string;
  kind: 'supermarket' | 'app';
  home: string;
  /** Search address for one item; absent for apps that don't sell by item search. */
  search?: (item: string) => string;
  note?: string;
};

const q = encodeURIComponent;

export const DELIVERY_SHOPS: DeliveryShop[] = [
  { id: 'tesco', name: 'Tesco', kind: 'supermarket', home: 'https://www.tesco.com/groceries/', search: (i) => `https://www.tesco.com/groceries/en-GB/search?query=${q(i)}` },
  { id: 'sainsburys', name: 'Sainsbury’s', kind: 'supermarket', home: 'https://www.sainsburys.co.uk/shop/gb/groceries', search: (i) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${q(i)}` },
  { id: 'asda', name: 'Asda', kind: 'supermarket', home: 'https://groceries.asda.com/', search: (i) => `https://groceries.asda.com/search/${q(i)}` },
  { id: 'morrisons', name: 'Morrisons', kind: 'supermarket', home: 'https://groceries.morrisons.com/', search: (i) => `https://groceries.morrisons.com/search?entry=${q(i)}` },
  { id: 'ocado', name: 'Ocado', kind: 'supermarket', home: 'https://www.ocado.com/', search: (i) => `https://www.ocado.com/search?entry=${q(i)}` },
  { id: 'waitrose', name: 'Waitrose', kind: 'supermarket', home: 'https://www.waitrose.com/ecom/shop/browse/groceries', search: (i) => `https://www.waitrose.com/ecom/shop/search?&searchTerm=${q(i)}` },
  { id: 'ubereats', name: 'Uber Eats', kind: 'app', home: 'https://www.ubereats.com/gb', note: 'Choose Grocery, then a shop near you.' },
  { id: 'justeat', name: 'Just Eat', kind: 'app', home: 'https://www.just-eat.co.uk/', note: 'Choose Groceries, then a shop near you.' },
];

export const shopById = (id: string) => DELIVERY_SHOPS.find((s) => s.id === id) || DELIVERY_SHOPS[0];

/** The list as plain text, ready to paste into a shop's notes or a message. */
export const listText = (items: string[]) => (items.length ? `Shopping list:\n${items.map((i) => `- ${i}`).join('\n')}` : 'Shopping list: all done!');

/** Strips quantities like "2 x" or "500g" so a shop search finds the product, not the amount. */
export function searchTerm(item: string): string {
  return (
    item
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^\s*\d+(?:[./]\d+)?\s*(?:x|×)?\s*(?:kg|g|ml|l|litres?|tbsp|tsp|cups?|oz|lbs?|tins?|cans?|packs?|bunch(?:es)?|cloves?)?\b\s*(?:of\s+)?/i, '')
      .replace(/\s+/g, ' ')
      .trim() || item.trim()
  );
}
