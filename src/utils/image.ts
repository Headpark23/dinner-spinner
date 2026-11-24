/**
 * Shrink a phone photo before uploading it for scanning. A 12-megapixel camera
 * shot is 3–8 MB (and HEIC on iPhone); 1600px JPEG is plenty to read labels,
 * uploads in a second on mobile data, and keeps the AI request fast.
 */
export async function prepareImageForScan(
  file: File,
  maxSide = 1600,
  quality = 0.82
): Promise<{ dataUrl: string; mimeType: string }> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' };
  } catch {
    // The browser couldn't decode it (rare): send the original and let the server try.
    return { dataUrl: original, mimeType: file.type || 'image/jpeg' };
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Couldn’t read that image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}
