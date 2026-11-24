/**
 * Scale a photo down to at most `maxSide` px and re-encode it as JPEG. Phone photos are 3-10 MB, and the
 * host rejects uploads over about 4.5 MB, so every photo is shrunk before it is sent. Text and food stay
 * readable at this size. Returns null if the browser can't decode the image.
 */
export const shrinkImage = (dataUrl: string, maxSide = 1800) =>
  new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
