import { formatAssetMessage } from './format.js';

/**
 * Отправляет карточку ОС: сначала Telegram file_id, иначе ссылка Drive/URL.
 */
export async function replyWithAsset(ctx, asset) {
  const caption = formatAssetMessage(asset);
  const photo = asset.photo_file_id || asset.photo_url;

  if (!photo) {
    await ctx.reply(caption);
    return;
  }

  try {
    await ctx.replyWithPhoto(photo, { caption });
  } catch (err) {
    console.error('Не удалось отправить фото:', err.message);
    await ctx.reply(
      `${caption}\n\n⚠️ Фото не удалось загрузить.`,
    );
  }
}

export function largestPhoto(photos) {
  if (!photos?.length) return null;
  return photos[photos.length - 1];
}
