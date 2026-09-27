/**
 * Преобразует ссылку Google Drive /file/d/ID/view в прямую загрузку.
 */
export function toDirectPhotoUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return null;

  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  const openMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (openMatch && trimmed.includes('drive.google.com')) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }

  return trimmed;
}

export function looksLikeInventoryNumber(text) {
  const value = String(text || '').trim();
  return /^\d{4,10}$/.test(value);
}
