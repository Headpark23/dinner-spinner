/** UK supermarket search links. They open the store's own search for an item; we never send anything else. */
export interface Store {
  id: string;
  name: string;
  searchUrl: (query: string) => string;
}

const q = (s: string) => encodeURIComponent(s.trim());

export const STORES: Store[] = [
  { id: 'tesco', name: 'Tesco', searchUrl: (s) => `https://www.tesco.com/groceries/en-GB/search?query=${q(s)}` },
  { id: 'sainsburys', name: 'Sainsbury’s', searchUrl: (s) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${q(s)}` },
  { id: 'asda', name: 'Asda', searchUrl: (s) => `https://groceries.asda.com/search/${q(s)}` },
  { id: 'ocado', name: 'Ocado', searchUrl: (s) => `https://www.ocado.com/search?entry=${q(s)}` },
  { id: 'aldi', name: 'Aldi', searchUrl: (s) => `https://groceries.aldi.co.uk/en-GB/Search?keywords=${q(s)}` },
];

const KEY = 'ds_store_v1';

export const loadStoreId = (): string => {
  try {
    const id = localStorage.getItem(KEY);
    if (id && STORES.some((s) => s.id === id)) return id;
  } catch {
    // ignore
  }
  return STORES[0].id;
};

export const saveStoreId = (id: string) => {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
};
