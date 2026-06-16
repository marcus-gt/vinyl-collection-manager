// Client-side image preparation for the photo-recognition feature.
//
// Downscales a captured/selected photo to a sensible max edge and re-encodes it
// as JPEG before upload. This keeps requests small and fast and stays well under
// the vision API's per-image size limit, without affecting recognition quality
// (the API downsamples large images server-side anyway). Re-encoding to JPEG
// also normalizes formats the API doesn't accept when the browser can decode them.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

export interface PreparedImage {
  dataUrl: string;
  mediaType: string;
}

/**
 * Returns a JPEG data URL scaled so its longest edge is at most `maxEdge`.
 * Falls back to the original file (as a data URL) if the browser can't decode
 * it for canvas re-encoding (e.g. some HEIC files on desktop).
 */
export async function prepareImageForUpload(
  file: File,
  maxEdge = 1568,
  quality = 0.85
): Promise<PreparedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxEdge / longest);
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas is not supported');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    return { dataUrl: canvas.toDataURL('image/jpeg', quality), mediaType: 'image/jpeg' };
  } catch {
    // Couldn't decode/re-encode - send the original and let the backend validate.
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, mediaType: file.type || 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
