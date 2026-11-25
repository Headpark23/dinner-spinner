import credits from './photoCredits.json';

export interface PhotoCredit {
  file?: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

export const PHOTO_CREDITS = credits as Record<string, PhotoCredit>;

/** Locally stored exact photo for a bundled dish id, if one exists. */
export const photoFor = (mealId: string): string | undefined =>
  PHOTO_CREDITS[mealId] ? `/photos/${mealId}.webp` : undefined;

/** Ordered from most specific dish style to broader main-ingredient archetypes. Every id exists in PHOTO_CREDITS. */
const ARCHETYPE_RULES: [RegExp, string][] = [
  [/\bwellington\b/i, 'w_beef_wellington'],
  [/\btoad in the hole\b/i, 'w_toad_hole'],
  [/\b(shepherd'?s|cottage)\s+pie\b/i, 'meal_7'],
  [/\bpasty\b/i, 'w_cornish_pasty'],
  [/\bempanada/i, 'w_empanadas'],
  [/\bpie\b/i, 'w_steak_ale_pie'],
  [/\b(sunday|roast\s+(?:beef|lamb|chicken|pork|sirloin)|yorkshire|k[uū]mara)\b/i, 'meal_10'],
  [/\b(sausages?|bangers|cumberland)\b/i, 'meal_4'],
  [/\bfish\s*(?:&|and)\s*chips\b/i, 'w_fish_chips'],
  [/\b(poke|ceviche|tartare|sashimi)\b/i, 'w_ceviche'],
  [/\b(prawn|shrimp|goan\s+fish|fish\s+curry|seafood\s+curry)\b/i, 'meal_9'],
  [/\bgambas\b/i, 'w_gambas'],
  [/\b(chowder|clam|mussels?|moules)\b/i, 'w_chowder'],
  [/\b(salmon|teriyaki|trout|mackerel)\b/i, 'w_teriyaki'],
  [/\b(kedgeree|cod|haddock|bacalhau|sea\s*bass|plaice|halibut|fish)\b/i, 'w_kedgeree'],
  [/\blasagn[ea]\b/i, 'w_lasagne'],
  [/\b(mac\s*(?:&|and)\s*cheese|macaroni)\b/i, 'w_mac_cheese'],
  [/\bcarbonara\b/i, 'w_carbonara'],
  [/\b(pesto|gnocchi|trofie)\b/i, 'w_pesto_trofie'],
  [/\b(aglio|spaghetti|linguine|tagliatelle|fettuccine)\b/i, 'w_aglio_olio'],
  [/\b(pasta|rigatoni|penne|fusilli|orzo|arrabbiata|bolognese|ragu)\b/i, 'meal_1'],
  [/\brisotto\b/i, 'w_risotto_milanese'],
  [/\b(pizza|margherita|calzone)\b/i, 'w_margherita'],
  [/\b(khachapuri|lahmacun|flatbread)\b/i, 'w_lahmacun'],
  [/\bfajitas?\b/i, 'w_chicken_fajitas'],
  [/\btacos?\b/i, 'w_tacos_pastor'],
  [/\b(enchiladas?|burritos?|quesadillas?)\b/i, 'w_enchiladas'],
  [/\b(chilli|chili)\b/i, 'meal_6'],
  [/\b(halloumi|fattoush|feta|salad)\b/i, 'w_halloumi_salad'],
  [/\b(shawarma|gyros|doner|wrap|kebab)\b/i, 'w_shawarma'],
  [/\bsouvlaki\b/i, 'w_souvlaki'],
  [/\b(kofta|meatballs?|k[oö]ttbullar)\b/i, 'w_kofta'],
  [/\bfalafel\b/i, 'w_falafel'],
  [/\b(moussaka|aubergine|eggplant|parmigiana)\b/i, 'w_parmigiana'],
  [/\b(spanakopita|filo|spinach\s+pie)\b/i, 'w_spanakopita'],
  [/\b(shakshuka|baked\s+eggs|huevos)\b/i, 'w_shakshuka'],
  [/\b(quiche|frittata|omelette|tortilla\s+espa)/i, 'w_quiche'],
  [/\bramen\b/i, 'w_shoyu_ramen'],
  [/\bph[oở]\b/i, 'w_pho'],
  [/\blaksa\b/i, 'w_laksa'],
  [/\bpad\s+thai\b/i, 'w_pad_thai'],
  [/\b(chow\s+mein|stir[- ]?fry|dan\s+dan|lo\s+mein|noodles?)\b/i, 'meal_3'],
  [/\b(dumplings?|gyoza|jiaozi|momo|pierogi)\b/i, 'w_dumplings_jiaozi'],
  [/\bkatsu\b/i, 'w_katsu'],
  [/\b(biryani|plov|pilaf|pilau)\b/i, 'w_biryani'],
  [/\b(fried\s+rice|nasi\s+goreng)\b/i, 'w_egg_fried_rice'],
  [/\b(paella|jambalaya|jollof)\b/i, 'w_paella'],
  [/\b(paneer|palak|saag)\b/i, 'w_palak_paneer'],
  [/\b(dal|dhal|lentils?|chana|chickpeas?|mujaddara)\b/i, 'w_chana_masala'],
  [/\b(tikka|butter\s+chicken|korma|masala|dopiaza)\b/i, 'w_butter_chicken'],
  [/\b(rogan\s+josh|bunny\s+chow|rendang|massaman|curry)\b/i, 'w_rogan_josh'],
  [/\b(jerk|peri[- ]?peri)\b/i, 'w_jerk_chicken'],
  [/\b(burgers?|smash|sliders?)\b/i, 'w_smash_burger'],
  [/\b(pulled\s+pork|pork\s+belly|char\s+siu|sweet\s*(?:&|and)\s*sour|pork)\b/i, 'w_char_siu'],
  [/\b(schnitzel|escalope| Milanese)\b/i, 'w_schnitzel'],
  [/\b(stroganoff|mushrooms?)\b/i, 'w_mushroom_stroganoff'],
  [/\b(tofu|mapo|tempeh)\b/i, 'w_mapo_tofu'],
  [/\b(tagine|couscous)\b/i, 'w_tagine'],
  [/\b(stew|casserole|hotpot|bourguignon|goulash|cassoulet|shin|brisket|beef)\b/i, 'w_bourguignon'],
  [/\b(cacciatore|coq\s+au\s+vin|paprikash|adobo|chicken|turkey|duck)\b/i, 'w_cacciatore'],
  [/\b(lamb|suya|farikal|fårikål)\b/i, 'w_irish_stew'],
  [/\b(soup|broth|borscht|tom\s+yum|pozole|caldo)\b/i, 'w_tom_yum'],
  [/\b(banh\s+mi|bánh\s+mì|croque|sandwich|toastie|baguette|arepas?)\b/i, 'w_banh_mi'],
  [/\b(ratatouille|courgette|cauliflower|aloo\s+gobi|traybake|veg)/i, 'w_ratatouille'],
];

const CUISINE_PHOTO: Record<string, string> = {
  italian: 'w_carbonara',
  indian: 'w_butter_chicken',
  british: 'meal_10',
  uk: 'meal_10',
  irish: 'w_irish_stew',
  chinese: 'w_kung_pao',
  mexican: 'w_tacos_pastor',
  thai: 'w_pad_thai',
  japanese: 'w_katsu',
  korean: 'w_bibimbap',
  vietnamese: 'w_pho',
  greek: 'w_souvlaki',
  mediterranean: 'w_halloumi_salad',
  french: 'w_coq_au_vin',
  spanish: 'w_paella',
  portuguese: 'w_gambas',
  'middle eastern': 'w_shakshuka',
  lebanese: 'w_shawarma',
  turkish: 'w_kofta',
  moroccan: 'w_tagine',
  american: 'w_smash_burger',
  caribbean: 'w_jerk_chicken',
  jamaican: 'w_jerk_chicken',
  polish: 'w_pierogi',
  hungarian: 'w_paprikash',
  russian: 'w_stroganoff',
  indonesian: 'w_nasi_goreng',
  malaysian: 'w_laksa',
  brazilian: 'w_feijoada',
  peruvian: 'w_lomo_saltado',
  ethiopian: 'w_doro_wat',
  'west african': 'w_jollof',
  'south african': 'w_bobotie',
  takeaway: 'w_smash_burger',
};

const EDITORIAL_FALLBACKS = [
  'w_cacciatore',
  'w_risotto_milanese',
  'w_shakshuka',
  'w_paella',
  'w_ratatouille',
  'meal_1',
  'w_tagine',
  'w_halloumi_salad',
];

const hashText = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export interface ResolvedPhoto {
  url: string;
  credit?: PhotoCredit;
  /** True when the image was matched by dish style/ingredients rather than an exact recipe photo. */
  guessed: boolean;
  /** Local fallback URL if an external `imageUrl` fails to load. */
  fallbackUrl: string;
}

/**
 * Resolves a real, appetizing food photo for ANY dish (exact bundled photo, imported URL, or smart local
 * culinary match from our 120 licensed photos). Never falls back to flags or initial letters.
 */
export function resolveMealPhoto(input?: {
  id?: string;
  title?: string;
  cuisine?: string;
  ingredients?: string[];
  imageUrl?: string;
  photoCredit?: PhotoCredit;
}): ResolvedPhoto {
  if (input?.id && PHOTO_CREDITS[input.id]) {
    const exactUrl = `/photos/${input.id}.webp`;
    return { url: exactUrl, credit: PHOTO_CREDITS[input.id], guessed: false, fallbackUrl: exactUrl };
  }

  // Pick the closest local food photo by title first, then ingredients, then cuisine, then deterministic hash.
  const titleText = input?.title || '';
  const ingText = (input?.ingredients || []).join(' ');
  let matchedId: string | undefined;

  for (const [re, photoId] of ARCHETYPE_RULES) {
    if (re.test(titleText)) {
      matchedId = photoId;
      break;
    }
  }
  if (!matchedId && ingText) {
    for (const [re, photoId] of ARCHETYPE_RULES) {
      if (re.test(ingText)) {
        matchedId = photoId;
        break;
      }
    }
  }
  if (!matchedId && input?.cuisine) {
    matchedId = CUISINE_PHOTO[input.cuisine.trim().toLowerCase()];
  }
  if (!matchedId) {
    const seed = `${titleText}|${input?.cuisine || ''}|${input?.id || ''}`;
    matchedId = EDITORIAL_FALLBACKS[hashText(seed) % EDITORIAL_FALLBACKS.length];
  }

  const fallbackUrl = `/photos/${matchedId}.webp`;
  const fallbackCredit = PHOTO_CREDITS[matchedId];

  if (input?.imageUrl) {
    return {
      url: input.imageUrl,
      credit: input.photoCredit,
      guessed: false,
      fallbackUrl,
    };
  }

  return {
    url: fallbackUrl,
    credit: fallbackCredit,
    guessed: true,
    fallbackUrl,
  };
}

/** Convenience helper returning a guaranteed dish photo URL for any meal. */
export const mealPhotoUrl = (meal?: {
  id?: string;
  title?: string;
  cuisine?: string;
  ingredients?: string[];
  imageUrl?: string;
}): string => resolveMealPhoto(meal).url;

/** Representative dish thumbnail URL for a cuisine filter chip (replaces country flags). */
export const cuisinePhotoUrl = (cuisineId: string): string => {
  if (cuisineId === 'all') return '/photos/w_paella.webp';
  if (cuisineId === 'other') return '/photos/w_tagine.webp';
  const id = CUISINE_PHOTO[cuisineId.trim().toLowerCase()] || 'w_shakshuka';
  return `/photos/${id}.webp`;
};
