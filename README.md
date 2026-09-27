# Telegram-бот ОС АО ОЭСК (Node + Neon PostgreSQL + Render)

Поиск основного средства по **инвентарному номеру**: текст + фото (если есть ссылка в таблице).

**Стек:** бот на Render Free, база на [Neon](https://neon.tech) Free (без срока 30 дней Render Postgres).

## Что внутри

- `src/index.js` — Telegram-бот (Telegraf) + HTTP healthcheck для Render
- `src/import.js` — загрузка данных из Google Sheets (CSV) в PostgreSQL
- `src/migrate.js` — создание таблицы `assets`
- `render.yaml` — шаблон сервиса и БД на Render

## Команды бота

| Действие | Как |
|----------|-----|
| Поиск | номер в чат или `/search` |
| Новый инвентарный номер | `/add` или кнопка «➕ Новый номер» |
| Добавить фото | `/photo` или фото с подписью = номер |
| Отмена ввода | `/cancel` |

При `/add`: номер → название → заводской № → фото (или `/skip`).  
Фото из Telegram сохраняется как `file_id` в Postgres (бесплатно, без Drive).

## 1. Telegram-бот

1. Откройте [@BotFather](https://t.me/BotFather)
2. `/newbot` → получите `BOT_TOKEN`

## 2. Google Sheet

Таблица должна быть доступна **«всем, у кого есть ссылка»** (хотя бы Viewer).

CSV-ссылка (уже подставлена ваша таблица):

```text
https://docs.google.com/spreadsheets/d/1xGJ0HWJNxwkxuTfVwm_5HbjyprBkfpsoUM9IaTe2qdI/export?format=csv&gid=1271224169
```

Файлы фото на Google Drive тоже откройте по ссылке.

## 3. Локальный запуск (проверка)

```bash
cp .env.example .env
# заполните BOT_TOKEN и DATABASE_URL

npm install
npm run migrate
npm run import
npm start
```

Для локальной БД можно поднять Postgres в Docker:

```bash
docker run --name oesk-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=oesk -p 5432:5432 -d postgres:16
```

`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oesk`

## 4. База данных — Neon (бесплатно)

1. Откройте [console.neon.tech](https://console.neon.tech) → зарегистрируйтесь
2. **Create a project** (имя например `oesk`)
3. Скопируйте **Connection string** (URI), вида:
   `postgresql://...@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
4. Вставьте её в `.env` как `DATABASE_URL` (локально) и в Render Env Vars

Локальный импорт после этого:

```bash
npm run import
```

## 5. Деплой бота на Render

Postgres на Render **не нужен**. Только Web Service.

1. GitHub-репозиторий уже есть
2. Render → **New** → **Web Service** → укажите репозиторий
3. Настройки:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Environment Variables:

| Key | Value |
|-----|--------|
| `BOT_TOKEN` | токен BotFather |
| `DATABASE_URL` | Connection string из **Neon** |
| `SHEETS_CSV_URL` | CSV-ссылка на таблицу |
| `ALLOWED_USER_IDS` | опционально: ваши Telegram id через запятую |
| `NODE_VERSION` | `20` |

5. Deploy

### Импорт данных

После деплоя: Render → Web Service → **Shell**:

```bash
npm run import
```

Или локально с `DATABASE_URL` из Neon:

```bash
npm run import
```

Когда обновите таблицу — снова `npm run import`.

## 6. Как пользоваться

В Telegram напишите боту:

```text
065829
```

Ответ: карточка ОС + фото (если ссылка есть и Drive открыт).

## Важно про Free Render

- Web Free **засыпает** без запросов — первое сообщение после сна может идти 30–60 сек.
- Neon Free тоже может «засыпать» БД — обычно просыпается за 1–3 сек.
- Чтобы бот не спал: платный Starter на Render или VPS (Oracle Always Free).
- Код уже готов к Render: слушает `PORT` и отвечает `200` на HTTP.
