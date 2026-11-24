/**
 * Scale a photo down to at most `maxSide` px and re-encode it as JPEG. Phone photos are 3-10 MB, and the
 * host rejects uploads over about 4.5 MB, so every photo is shrunk before it is sent. Text and food stay
 * readable at this size. Returns null if the browser can't decode the image.
 */
export const MAX_UPLOAD_CHARS = 4_000_000;

export const shrinkImage = (dataUrl: string, maxSide = 1800, quality = 0.85) =>
  new Promise<string | null>((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

export type PreparedPhoto =
  | { ok: true; imageBase64: string; mimeType: string }
  | { ok: false; error: string };

/** Shrinks a photo to safely fit serverless body limits (~4.5 MB), or returns a clear error if undecodable & oversized. */
export async function preparePhotoForUpload(dataUrl: string, mimeType = 'image/jpeg'): Promise<PreparedPhoto> {
  let small = await shrinkImage(dataUrl, 1800, 0.85);
  if (small && small.length > MAX_UPLOAD_CHARS) {
    small = await shrinkImage(dataUrl, 1280, 0.72);
  }
  if (small && small.length <= MAX_UPLOAD_CHARS) {
    return { ok: true, imageBase64: small, mimeType: 'image/jpeg' };
  }
  if (dataUrl.length <= MAX_UPLOAD_CHARS) {
    return { ok: true, imageBase64: dataUrl, mimeType: mimeType || 'image/jpeg' };
  }
  return {
    ok: false,
    error: 'That photo is over 4 MB and this browser couldn’t shrink its format (such as HEIC). Take the photo directly in the app or use a JPEG/PNG copy.',
  };
}
