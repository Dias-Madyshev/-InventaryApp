import 'dotenv/config';
import http from 'node:http';
import { Telegraf, Markup } from 'telegraf';
import { pool, query } from './db.js';
import { replyWithAsset, largestPhoto } from './assets.js';
import { ensureSchema } from './schema.js';
import { getSession, setSession, clearSession } from './sessions.js';
import { looksLikeInventoryNumber, toDirectPhotoUrl } from './utils.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN не задан');
}

const allowedIds = (process.env.ALLOWED_USER_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const bot = new Telegraf(token);

const menuKeyboard = Markup.keyboard([
  ['🔎 Поиск', '➕ Новый номер'],
  ['🖼 Добавить фото', '❌ Отмена'],
])
  .resize()
  .persistent();

function isAllowed(ctx) {
  if (allowedIds.length === 0) return true;
  const userId = String(ctx.from?.id || '');
  return allowedIds.includes(userId);
}

function helpText() {
  return [
    'Бот поиска основных средств АО ОЭСК.',
    '',
    'Команды:',
    '/search — поиск по инвентарному номеру',
    '/add — добавить новый инвентарный номер',
    '/photo — привязать фото к номеру',
    '/cancel — отменить текущий ввод',
    '',
    'Быстрый поиск: просто отправьте номер, например 065829',
    'Быстрое фото: отправьте фото с подписью = инвентарный номер',
  ].join('\n');
}

bot.use(async (ctx, next) => {
  if (!isAllowed(ctx)) {
    await ctx.reply('Доступ ограничен. Обратитесь к администратору.');
    return;
  }
  return next();
});

bot.start(async (ctx) => {
  await ctx.reply(helpText(), menuKeyboard);
});

bot.help(async (ctx) => {
  await ctx.reply(helpText(), menuKeyboard);
});

bot.command('cancel', async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply('Ввод отменён.', menuKeyboard);
});

bot.command('skip', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (session?.action !== 'add_wait_photo') {
    await ctx.reply('Сейчас нечего пропускать.');
    return;
  }
  const asset = await createAsset(session.draft);
  clearSession(ctx.from.id);
  await ctx.reply(`Создано: № ${asset.inventory_number}`, menuKeyboard);
  await replyWithAsset(ctx, asset);
});

bot.hears('❌ Отмена', async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply('Ввод отменён.', menuKeyboard);
});

bot.command('search', async (ctx) => {
  setSession(ctx.from.id, { action: 'search_wait_number' });
  await ctx.reply('Введите инвентарный номер:');
});

bot.hears('🔎 Поиск', async (ctx) => {
  setSession(ctx.from.id, { action: 'search_wait_number' });
  await ctx.reply('Введите инвентарный номер:');
});

bot.command('add', async (ctx) => {
  setSession(ctx.from.id, { action: 'add_wait_number', draft: {} });
  await ctx.reply(
    'Добавление ОС.\nВведите новый инвентарный номер (только цифры):\n\n/cancel — отмена',
  );
});

bot.hears('➕ Новый номер', async (ctx) => {
  setSession(ctx.from.id, { action: 'add_wait_number', draft: {} });
  await ctx.reply(
    'Добавление ОС.\nВведите новый инвентарный номер (только цифры):\n\n/cancel — отмена',
  );
});

bot.command('photo', async (ctx) => {
  setSession(ctx.from.id, { action: 'photo_wait_number' });
  await ctx.reply(
    'Привязка фото.\nВведите инвентарный номер:\n\n/cancel — отмена',
  );
});

bot.hears('🖼 Добавить фото', async (ctx) => {
  setSession(ctx.from.id, { action: 'photo_wait_number' });
  await ctx.reply(
    'Привязка фото.\nВведите инвентарный номер:\n\n/cancel — отмена',
  );
});

bot.on('photo', async (ctx) => {
  const session = getSession(ctx.from.id);
  const photo = largestPhoto(ctx.message.photo);
  const fileId = photo?.file_id;
  const caption = (ctx.message.caption || '').trim();

  if (!fileId) {
    await ctx.reply('Не удалось получить фото.');
    return;
  }

  // Быстрый путь: фото с подписью = инв. номер
  if ((!session || !session.action) && looksLikeInventoryNumber(caption)) {
    const ok = await savePhoto(caption, fileId);
    if (!ok) {
      await ctx.reply(
        `Номер ${caption} не найден. Сначала добавьте его через /add`,
      );
      return;
    }
    const asset = await findAsset(caption);
    await ctx.reply(`Фото сохранено для № ${caption}`);
    await replyWithAsset(ctx, asset);
    return;
  }

  if (session?.action === 'photo_wait_photo') {
    const number = session.inventory_number;
    const ok = await savePhoto(number, fileId);
    clearSession(ctx.from.id);
    if (!ok) {
      await ctx.reply(`Номер ${number} не найден.`, menuKeyboard);
      return;
    }
    const asset = await findAsset(number);
    await ctx.reply(`Фото сохранено для № ${number}`, menuKeyboard);
    await replyWithAsset(ctx, asset);
    return;
  }

  if (session?.action === 'add_wait_photo') {
    const draft = session.draft;
    const asset = await createAsset({
      ...draft,
      photo_file_id: fileId,
    });
    clearSession(ctx.from.id);
    await ctx.reply(`Создано: № ${asset.inventory_number}`, menuKeyboard);
    await replyWithAsset(ctx, asset);
    return;
  }

  await ctx.reply(
    'Чтобы привязать фото: /photo или отправьте фото с подписью = инвентарный номер.',
  );
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const session = getSession(ctx.from.id);

  if (text.startsWith('/')) return;

  // меню уже обработано hears — сюда меню-кнопки не дойдут как обычный поиск
  if (['🔎 Поиск', '➕ Новый номер', '🖼 Добавить фото', '❌ Отмена'].includes(text)) {
    return;
  }

  if (session?.action === 'search_wait_number') {
    clearSession(ctx.from.id);
    await handleSearch(ctx, text);
    return;
  }

  if (session?.action === 'photo_wait_number') {
    if (!looksLikeInventoryNumber(text)) {
      await ctx.reply('Нужен инвентарный номер цифрами, например 065829');
      return;
    }
    const asset = await findAsset(text);
    if (!asset) {
      clearSession(ctx.from.id);
      await ctx.reply(
        `Номер ${text} не найден. Добавьте через /add`,
        menuKeyboard,
      );
      return;
    }
    setSession(ctx.from.id, {
      action: 'photo_wait_photo',
      inventory_number: text,
    });
    await ctx.reply(
      `Номер ${text}: ${asset.name}\nТеперь отправьте фото (или ссылку Google Drive):\n\n/cancel — отмена`,
    );
    return;
  }

  if (session?.action === 'photo_wait_photo') {
    const url = toDirectPhotoUrl(text);
    if (!url) {
      await ctx.reply(
        'Пришлите фото файлом или прямую/Drive ссылку.\n/cancel — отмена',
      );
      return;
    }
    await query(
      `UPDATE assets
       SET photo_url = $2, updated_at = NOW()
       WHERE inventory_number = $1`,
      [session.inventory_number, url],
    );
    const asset = await findAsset(session.inventory_number);
    clearSession(ctx.from.id);
    await ctx.reply(
      `Ссылка на фото сохранена для № ${session.inventory_number}`,
      menuKeyboard,
    );
    await replyWithAsset(ctx, asset);
    return;
  }

  if (session?.action === 'add_wait_number') {
    if (!looksLikeInventoryNumber(text)) {
      await ctx.reply('Нужен инвентарный номер цифрами, например 065829');
      return;
    }
    const existing = await findAsset(text);
    if (existing) {
      await ctx.reply(
        `Номер ${text} уже есть: ${existing.name}\nВведите другой номер или /cancel`,
      );
      return;
    }
    setSession(ctx.from.id, {
      action: 'add_wait_name',
      draft: { inventory_number: text },
    });
    await ctx.reply('Введите наименование основного средства:');
    return;
  }

  if (session?.action === 'add_wait_name') {
    if (text.length < 2) {
      await ctx.reply('Слишком короткое название. Введите ещё раз:');
      return;
    }
    setSession(ctx.from.id, {
      action: 'add_wait_factory',
      draft: { ...session.draft, name: text },
    });
    await ctx.reply(
      'Заводской номер (или «-» чтобы пропустить):',
    );
    return;
  }

  if (session?.action === 'add_wait_factory') {
    const factory = text === '-' ? null : text;
    setSession(ctx.from.id, {
      action: 'add_wait_photo',
      draft: { ...session.draft, factory_number: factory },
    });
    await ctx.reply(
      [
        'Отправьте фото ОС.',
        'Или ссылку Google Drive.',
        'Или напишите «-» / /skip чтобы сохранить без фото.',
      ].join('\n'),
    );
    return;
  }

  if (session?.action === 'add_wait_photo') {
    if (text === '-' || text.toLowerCase() === '/skip' || text.toLowerCase() === 'skip') {
      const asset = await createAsset(session.draft);
      clearSession(ctx.from.id);
      await ctx.reply(`Создано: № ${asset.inventory_number}`, menuKeyboard);
      await replyWithAsset(ctx, asset);
      return;
    }

    const url = toDirectPhotoUrl(text);
    if (!url) {
      await ctx.reply(
        'Пришлите фото, ссылку Drive, «-» чтобы пропустить, или /cancel',
      );
      return;
    }

    const asset = await createAsset({
      ...session.draft,
      photo_url: url,
    });
    clearSession(ctx.from.id);
    await ctx.reply(`Создано: № ${asset.inventory_number}`, menuKeyboard);
    await replyWithAsset(ctx, asset);
    return;
  }

  // Обычный поиск без режима
  await handleSearch(ctx, text);
});

async function handleSearch(ctx, text) {
  if (!looksLikeInventoryNumber(text)) {
    await ctx.reply(
      'Пришлите инвентарный номер цифрами или выберите действие в меню.',
      menuKeyboard,
    );
    return;
  }

  const asset = await findAsset(text);
  if (!asset) {
    await ctx.reply(
      `По инвентарному номеру ${text} ничего не найдено.\nДобавить: /add`,
      menuKeyboard,
    );
    return;
  }

  await replyWithAsset(ctx, asset);
}

async function findAsset(inventoryNumber) {
  const { rows } = await query(
    'SELECT * FROM assets WHERE inventory_number = $1 LIMIT 1',
    [inventoryNumber],
  );
  return rows[0] || null;
}

async function savePhoto(inventoryNumber, fileId) {
  const result = await query(
    `UPDATE assets
     SET photo_file_id = $2, updated_at = NOW()
     WHERE inventory_number = $1`,
    [inventoryNumber, fileId],
  );
  return result.rowCount > 0;
}

async function createAsset(draft) {
  const { rows } = await query(
    `INSERT INTO assets (
       inventory_number, name, factory_number, photo_url, photo_file_id, updated_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [
      draft.inventory_number,
      draft.name,
      draft.factory_number || null,
      draft.photo_url || null,
      draft.photo_file_id || null,
    ],
  );
  return rows[0];
}

async function main() {
  await ensureSchema();

  const port = Number(process.env.PORT || 3000);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OESK inventory bot is running');
  });

  server.listen(port, () => {
    console.log(`HTTP healthcheck на порту ${port}`);
  });

  await bot.launch();
  console.log('Telegram-бот запущен');

  process.once('SIGINT', () => shutdown(server));
  process.once('SIGTERM', () => shutdown(server));
}

async function shutdown(server) {
  bot.stop('shutdown');
  server.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
