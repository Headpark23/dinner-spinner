import { Meal } from '../types';
import { CardCanvas, CardImage, ShareResult, cardContent, deliverCard, drawRecipeCard } from './recipeCard';

const loadPhoto = (src: string): Promise<(CardImage & CanvasImageSource) | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // a photo that will not load just means a plain card
    img.src = src;
  });

/** Draws the card in the browser and shares, copies or downloads it. */
export async function shareRecipeCard(
  meal: Meal,
  extras: { photo?: string; credit?: Meal['photoCredit'] }
): Promise<ShareResult> {
  const photo = extras.photo ? await loadPhoto(extras.photo) : null;
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const canvas = document.createElement('canvas');
  // A photo that failed to load is not on the card, so it must not be credited either.
  drawRecipeCard(canvas as unknown as CardCanvas, cardContent(meal, photo ? extras : {}), photo);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch {
      resolve(null); // a photo from another site can taint the canvas
    }
  });
  if (!blob) throw new Error('Could not make the picture');
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  return deliverCard(blob, meal.title, {
    share: nav.share ? (d) => nav.share(d) : undefined,
    canShare: nav.canShare ? (d) => nav.canShare!(d) : undefined,
    copyImage:
      typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
        ? (b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
        : undefined,
    makeFile: (b, name) => new File([b], name, { type: 'image/png' }),
    download: (b, name) => {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
}
