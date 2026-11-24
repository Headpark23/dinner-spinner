/**
 * The cuisines the World Kitchen leads with. `id` is the cuisine name used in the recipe data. `code` is the country
 * whose flag is drawn (as an image, so it looks the same on every device); `symbol` is used where there is no flag.
 */
export const POPULAR_CUISINES: { id: string; label: string; code?: string; symbol?: string }[] = [
  { id: 'Italian', label: 'Italian', code: 'IT' },
  { id: 'Greek', label: 'Greek', code: 'GR' },
  { id: 'British', label: 'UK', code: 'GB' },
  { id: 'French', label: 'French', code: 'FR' },
  { id: 'American', label: 'American', code: 'US' },
  { id: 'Mexican', label: 'Mexican', code: 'MX' },
  { id: 'Chinese', label: 'Chinese', code: 'CN' },
  { id: 'Indian', label: 'Indian', code: 'IN' },
  { id: 'Thai', label: 'Thai', code: 'TH' },
  { id: 'Japanese', label: 'Japanese', code: 'JP' },
  { id: 'Korean', label: 'Korean', code: 'KR' },
  { id: 'Moroccan', label: 'Moroccan', code: 'MA' },
  { id: 'Middle Eastern', label: 'Middle Eastern', symbol: '🕌' },
  { id: 'Polish', label: 'Polish', code: 'PL' },
  { id: 'Spanish', label: 'Spanish', code: 'ES' },
  { id: 'Turkish', label: 'Turkish', code: 'TR' },
  { id: 'Vietnamese', label: 'Vietnamese', code: 'VN' },
];
