/** The cuisines the World Kitchen leads with. `id` is the cuisine name used in the recipe data. */
export const POPULAR_CUISINES: { id: string; label: string; flag: string }[] = [
  { id: 'Italian', label: 'Italian', flag: '🇮🇹' },
  { id: 'Greek', label: 'Greek', flag: '🇬🇷' },
  { id: 'British', label: 'UK', flag: '🇬🇧' },
  { id: 'French', label: 'French', flag: '🇫🇷' },
  { id: 'American', label: 'American', flag: '🇺🇸' },
  { id: 'Mexican', label: 'Mexican', flag: '🇲🇽' },
  { id: 'Chinese', label: 'Chinese', flag: '🇨🇳' },
  { id: 'Indian', label: 'Indian', flag: '🇮🇳' },
  { id: 'Thai', label: 'Thai', flag: '🇹🇭' },
  { id: 'Japanese', label: 'Japanese', flag: '🇯🇵' },
  { id: 'Korean', label: 'Korean', flag: '🇰🇷' },
  { id: 'Moroccan', label: 'Moroccan', flag: '🇲🇦' },
  { id: 'Middle Eastern', label: 'Middle Eastern', flag: '🕌' },
  { id: 'Polish', label: 'Polish', flag: '🇵🇱' },
  { id: 'Spanish', label: 'Spanish', flag: '🇪🇸' },
  { id: 'Turkish', label: 'Turkish', flag: '🇹🇷' },
  { id: 'Vietnamese', label: 'Vietnamese', flag: '🇻🇳' },
];

let flagsRender: boolean | undefined;
/**
 * Country flags are emoji, which phones and Macs draw as flags but Windows draws as two letters ("IT"). Drawing one
 * onto a canvas and looking for colour tells us which we have, so the letters can be left out.
 */
export function flagEmojiWorks(): boolean {
  if (flagsRender !== undefined) return flagsRender;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return (flagsRender = true);
    ctx.textBaseline = 'top';
    ctx.font = '26px sans-serif';
    ctx.fillText('\u{1F1EE}\u{1F1F9}', 0, 0);
    const px = ctx.getImageData(0, 0, 32, 32).data;
    let colour = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 0 && (Math.abs(px[i] - px[i + 1]) > 40 || Math.abs(px[i + 1] - px[i + 2]) > 40)) {
        colour = true;
        break;
      }
    }
    flagsRender = colour;
  } catch {
    flagsRender = true;
  }
  return flagsRender;
}

/** Whether this chip's symbol can be shown: country flags only where the device draws them. */
export const canShowFlag = (flag: string): boolean => !/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(flag) || flagEmojiWorks();
