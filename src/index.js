import 'dotenv/config';
import http from 'node:http';
import { Telegraf } from 'telegraf';
import { pool, query } from './db.js';
import { replyWithAsset, largestPhoto } from './assets.js';
import { ensureSchema } from './schema.js';
import {
  MENU,
  mainMenu,
  wizardMenu,
  notFoundActions,
  isMenuText,
} from './keyboards.js';
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

function isAllowed(ctx) {
  if (allowedIds.length === 0) return true;
  const userId = String(ctx.from?.id || '');
  return allowedIds.includes(userId);
}

function helpText() {
  return [
    '📦 Бот основных средств АО ОЭСК',
    '',
    'Выберите действие кнопкой ниже или:',
    '• отправьте инвентарный номер (например 065829)',
    '• отправьте фото с подписью = номер',
    '',
    'Кнопки под карточкой: добавить фото, новый поиск, меню.',
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
  clearSession(ctx.from.id);
  await ctx.reply(helpText(), mainMenu());
});

bot.help(async (ctx) => {
  await ctx.reply(helpText(), mainMenu());
});

bot.command('cancel', async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply('Ввод отменён.', mainMenu());
});

bot.command('skip', async (ctx) => {
  await handleSkip(ctx);
});

bot.hears(MENU.CANCEL, async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply('Ввод отменён.', mainMenu());
});

bot.hears(MENU.SKIP, async (ctx) => {
  await handleSkip(ctx);
});

bot.hears(MENU.HELP, async (ctx) => {
  await ctx.reply(helpText(), mainMenu());
});

bot.command('search', async (ctx) => {
  await startSearch(ctx);
});

bot.hears(MENU.SEARCH, async (ctx) => {
  await startSearch(ctx);
});

bot.command('add', async (ctx) => {
  await startAdd(ctx);
});

bot.hears(MENU.ADD, async (ctx) => {
  await startAdd(ctx);
});

bot.command('photo', async (ctx) => {
  await startPhoto(ctx);
});

bot.hears(MENU.PHOTO, async (ctx) => {
  await startPhoto(ctx);
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data || '';
  await ctx.answerCbQuery();

  if (data === 'menu:home') {
    clearSession(ctx.from.id);
    await ctx.reply(helpText(), mainMenu());
    return;
  }

  if (data === 'menu:search') {
    await startSearch(ctx);
    return;
  }

  if (data === 'menu:add') {
    await startAdd(ctx);
    return;
  }

  if (data.startsWith('photo:')) {
    const number = data.slice('photo:'.length);
    const asset = await findAsset(number);
    if (!asset) {
      await ctx.reply(`Номер ${number} не найден.`, mainMenu());
      return;
    }
    setSession(ctx.from.id, {
      action: 'photo_wait_photo',
      inventory_number: number,
    });
    await ctx.reply(
      `№ ${number}: ${asset.name}\n\nОтправьте фото или ссылку Google Drive.`,
      wizardMenu(false),
    );
    return;
  }

  if (data.startsWith('addnum:')) {
    const number = data.slice('addnum:'.length);
    setSession(ctx.from.id, {
      action: 'add_wait_name',
      draft: { inventory_number: number },
    });
    await ctx.reply(
      `Номер ${number} выбран.\nВведите наименование ОС:`,
      wizardMenu(false),
    );
  }
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

  if ((!session || !session.action) && looksLikeInventoryNumber(caption)) {
    const ok = await savePhoto(caption, fileId);
    if (!ok) {
      await ctx.reply(
        `Номер ${caption} не найден.`,
        notFoundActions(caption),
      );
      return;
    }
    const asset = await findAsset(caption);
    await ctx.reply(`✅ Фото сохранено для № ${caption}`, mainMenu());
    await replyWithAsset(ctx, asset);
    return;
  }

  if (session?.action === 'photo_wait_photo') {
    const number = session.inventory_number;
    const ok = await savePhoto(number, fileId);
    clearSession(ctx.from.id);
    if (!ok) {
      await ctx.reply(`Номер ${number} не найден.`, mainMenu());
      return;
    }
    const asset = await findAsset(number);
    await ctx.reply(`✅ Фото сохранено для № ${number}`, mainMenu());
    await replyWithAsset(ctx, asset);
    return;
  }

  if (session?.action === 'add_wait_photo') {
    const asset = await createAsset({
      ...session.draft,
      photo_file_id: fileId,
    });
    clearSession(ctx.from.id);
    await ctx.reply(`✅ Создано: № ${asset.inventory_number}`, mainMenu());
    await replyWithAsset(ctx, asset);
    return;
  }

  await ctx.reply(
    'Чтобы привязать фото: нажмите «🖼 Добавить фото» или отправьте фото с подписью = номер.',
    mainMenu(),
  );
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const session = getSession(ctx.from.id);

  if (text.startsWith('/')) return;
  if (isMenuText(text)) return;

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
      await ctx.reply(`Номер ${text} не найден.`, notFoundActions(text));
      return;
    }
    setSession(ctx.from.id, {
      action: 'photo_wait_photo',
      inventory_number: text,
    });
    await ctx.reply(
      `№ ${text}: ${asset.name}\n\nОтправьте фото или ссылку Google Drive.`,
      wizardMenu(false),
    );
    return;
  }

  if (session?.action === 'photo_wait_photo') {
    const url = toDirectPhotoUrl(text);
    if (!url) {
      await ctx.reply(
        'Пришлите фото или ссылку Drive.\nИли нажмите «❌ Отмена».',
        wizardMenu(false),
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
      `✅ Ссылка сохранена для № ${session.inventory_number}`,
      mainMenu(),
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
        `Номер ${text} уже есть: ${existing.name}\nВведите другой или «❌ Отмена».`,
        wizardMenu(false),
      );
      return;
    }
    setSession(ctx.from.id, {
      action: 'add_wait_name',
      draft: { inventory_number: text },
    });
    await ctx.reply('Введите наименование ОС:', wizardMenu(false));
    return;
  }

  if (session?.action === 'add_wait_name') {
    if (text.length < 2) {
      await ctx.reply('Слишком короткое название. Ещё раз:');
      return;
    }
    setSession(ctx.from.id, {
      action: 'add_wait_factory',
      draft: { ...session.draft, name: text },
    });
    await ctx.reply(
      'Заводской номер:\nили нажмите «⏭ Пропустить»',
      wizardMenu(true),
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
      'Отправьте фото или ссылку Drive.\nИли «⏭ Пропустить» без фото.',
      wizardMenu(true),
    );
    return;
  }

  if (session?.action === 'add_wait_photo') {
    if (text === '-') {
      await finishAddWithoutPhoto(ctx, session.draft);
      return;
    }

    const url = toDirectPhotoUrl(text);
    if (!url) {
      await ctx.reply(
        'Пришлите фото, ссылку Drive или «⏭ Пропустить».',
        wizardMenu(true),
      );
      return;
    }

    const asset = await createAsset({
      ...session.draft,
      photo_url: url,
    });
    clearSession(ctx.from.id);
    await ctx.reply(`✅ Создано: № ${asset.inventory_number}`, mainMenu());
    await replyWithAsset(ctx, asset);
    return;
  }

  await handleSearch(ctx, text);
});

async function startSearch(ctx) {
  setSession(ctx.from.id, { action: 'search_wait_number' });
  await ctx.reply('Введите инвентарный номер:', wizardMenu(false));
}

async function startAdd(ctx, presetNumber) {
  if (presetNumber) {
    setSession(ctx.from.id, {
      action: 'add_wait_name',
      draft: { inventory_number: presetNumber },
    });
    await ctx.reply(
      `Номер ${presetNumber}.\nВведите наименование ОС:`,
      wizardMenu(false),
    );
    return;
  }

  setSession(ctx.from.id, { action: 'add_wait_number', draft: {} });
  await ctx.reply(
    'Добавление ОС.\nВведите новый инвентарный номер:',
    wizardMenu(false),
  );
}

async function startPhoto(ctx) {
  setSession(ctx.from.id, { action: 'photo_wait_number' });
  await ctx.reply('Введите инвентарный номер для фото:', wizardMenu(false));
}

async function handleSkip(ctx) {
  const session = getSession(ctx.from.id);

  if (session?.action === 'add_wait_factory') {
    setSession(ctx.from.id, {
      action: 'add_wait_photo',
      draft: { ...session.draft, factory_number: null },
    });
    await ctx.reply(
      'Отправьте фото или ссылку Drive.\nИли «⏭ Пропустить» без фото.',
      wizardMenu(true),
    );
    return;
  }

  if (session?.action === 'add_wait_photo') {
    await finishAddWithoutPhoto(ctx, session.draft);
    return;
  }

  await ctx.reply('Сейчас нечего пропускать.', mainMenu());
}

async function finishAddWithoutPhoto(ctx, draft) {
  const asset = await createAsset(draft);
  clearSession(ctx.from.id);
  await ctx.reply(`✅ Создано: № ${asset.inventory_number}`, mainMenu());
  await replyWithAsset(ctx, asset);
}

async function handleSearch(ctx, text) {
  if (!looksLikeInventoryNumber(text)) {
    await ctx.reply(
      'Пришлите инвентарный номер цифрами или выберите кнопку меню.',
      mainMenu(),
    );
    return;
  }

  const asset = await findAsset(text);
  if (!asset) {
    await ctx.reply(
      `По номеру ${text} ничего не найдено.`,
      notFoundActions(text),
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

  startKeepAlive();

  await bot.launch();
  console.log('Telegram-бот запущен');

  process.once('SIGINT', () => shutdown(server));
  process.once('SIGTERM', () => shutdown(server));
}

const KEEP_ALIVE_MS = 10 * 60 * 1000;

function startKeepAlive() {
  const base = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
  if (!base) {
    console.log('Keep-alive выключен: нет RENDER_EXTERNAL_URL');
    return;
  }

  const url = `${base.replace(/\/$/, '')}/`;

  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      console.log(`keep-alive ${res.status}`);
    } catch (err) {
      console.error('keep-alive error:', err.message);
    }
  };

  // Render Free засыпает через 15 минут без входящего HTTP.
  // Пинг публичного URL считается входящим запросом.
  setTimeout(() => {
    ping();
    setInterval(ping, KEEP_ALIVE_MS);
  }, 60 * 1000);

  console.log(`Keep-alive каждые 10 мин: ${url}`);
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
