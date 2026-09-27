# Telegram-бот ОС АО ОЭСК (Node + PostgreSQL + Render)

Поиск основного средства по **инвентарному номеру**: текст + фото (если есть ссылка в таблице).

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

## 4. Деплой на Render

### База данных

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **PostgreSQL**
2. Имя: `oesk-db`
3. Скопируйте **Internal Database URL** (для сервиса на Render)  
   или **External Database URL** (для импорта с вашего компьютера)

> С марта 2025 бесплатный Postgres на Render часто недоступен — может понадобиться план **Starter** (~$7/мес).  
> Free Web Service при этом «засыпает» без трафика (~15 мин).

### Web Service (бот)

1. Залейте проект на GitHub
2. Render → **New** → **Web Service** → укажите репозиторий
3. Настройки:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Environment Variables:

| Key | Value |
|-----|--------|
| `BOT_TOKEN` | токен BotFather |
| `DATABASE_URL` | Internal Database URL из Postgres |
| `SHEETS_CSV_URL` | CSV-ссылка на таблицу |
| `ALLOWED_USER_IDS` | опционально: ваши Telegram id через запятую |
| `NODE_VERSION` | `20` |

5. Deploy

### Импорт данных в БД

После первого деплоя БД пустая. Импорт удобнее с компьютера (External URL):

```bash
DATABASE_URL="postgresql://...external..." SHEETS_CSV_URL="https://docs.google.com/..." npm run import
```

Либо в Render → ваш Web Service → **Shell**:

```bash
npm run import
```

Когда обновите таблицу — снова запустите `npm run import`.

## 5. Как пользоваться

В Telegram напишите боту:

```text
065829
```

Ответ: карточка ОС + фото (если ссылка есть и Drive открыт).

## Важно про Free Render

- Web Free **засыпает** без запросов — первое сообщение после сна может идти 30–60 сек.
- Чтобы не спал: платный **Starter** у Web Service, либо перенос на Oracle Always Free / VPS.
- Код уже готов к Render: слушает `PORT` и отвечает `200` на HTTP.
