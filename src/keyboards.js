import { Markup } from 'telegraf';

export const MENU = {
  SEARCH: '🔎 Поиск',
  ADD: '➕ Новый номер',
  PHOTO: '🖼 Добавить фото',
  HELP: 'ℹ️ Помощь',
  CANCEL: '❌ Отмена',
  SKIP: '⏭ Пропустить',
};

export function mainMenu() {
  return Markup.keyboard([
    [MENU.SEARCH, MENU.ADD],
    [MENU.PHOTO, MENU.HELP],
    [MENU.CANCEL],
  ])
    .resize()
    .persistent();
}

/** Клавиатура во время пошагового ввода */
export function wizardMenu(withSkip = false) {
  const rows = withSkip
    ? [[MENU.SKIP], [MENU.CANCEL]]
    : [[MENU.CANCEL]];
  return Markup.keyboard(rows).resize().persistent();
}

/** Кнопки под карточкой ОС */
export function assetActions(inventoryNumber) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '🖼 Фото',
        `photo:${inventoryNumber}`,
      ),
      Markup.button.callback('🔎 Ещё поиск', 'menu:search'),
    ],
    [
      Markup.button.callback('➕ Новый номер', 'menu:add'),
      Markup.button.callback('🏠 Меню', 'menu:home'),
    ],
  ]);
}

/** Если номер не найден */
export function notFoundActions(inventoryNumber) {
  const buttons = [
    [Markup.button.callback('🔎 Другой поиск', 'menu:search')],
    [Markup.button.callback('🏠 Меню', 'menu:home')],
  ];

  if (inventoryNumber) {
    buttons.unshift([
      Markup.button.callback(
        `➕ Добавить ${inventoryNumber}`,
        `addnum:${inventoryNumber}`,
      ),
    ]);
  }

  return Markup.inlineKeyboard(buttons);
}

export function isMenuText(text) {
  return Object.values(MENU).includes(text);
}
