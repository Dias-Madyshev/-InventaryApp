import { parse } from 'csv-parse/sync';
import { toDirectPhotoUrl, looksLikeInventoryNumber } from './utils.js';

/**
 * Скачивает CSV из Google Sheets (таблица должна быть доступна по ссылке).
 */
export async function fetchSheetRows(csvUrl) {
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(
      `Не удалось скачать таблицу: HTTP ${response.status}. Проверьте доступ «все, у кого есть ссылка».`,
    );
  }

  const text = await response.text();
  return parseCsv(text);
}

export function parseCsv(text) {
  return parse(text, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });
}

/**
 * Отчёт 1С: объединённые ячейки дают пустые колонки.
 * Маппим поля по заголовкам, а не по фиксированным индексам.
 */
export function parseAssetsFromRows(rows) {
  let headerIndex = -1;

  for (let i = 0; i < rows.length; i += 1) {
    const cell = String(rows[i][0] || '').toLowerCase();
    if (cell.includes('инвентарный')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('Не найдена строка заголовков («Инвентарный номер»)');
  }

  const map = buildHeaderMap(rows[headerIndex]);
  const assets = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const inventoryNumber = String(cell(row, map, 'inventory') || '').trim();

    if (!looksLikeInventoryNumber(inventoryNumber)) continue;

    const name = String(cell(row, map, 'name') || '').trim();
    if (!name) continue;

    assets.push({
      inventory_number: inventoryNumber,
      name,
      solidary_mol: emptyToNull(cell(row, map, 'solidary_mol')),
      manufacture_date: emptyToNull(cell(row, map, 'manufacture_date')),
      accounting_date: emptyToNull(cell(row, map, 'accounting_date')),
      useful_life_months: emptyToNull(cell(row, map, 'useful_life_months')),
      factory_number: emptyToNull(cell(row, map, 'factory_number')),
      passport_number: emptyToNull(cell(row, map, 'passport_number')),
      photo_url: toDirectPhotoUrl(emptyToNull(cell(row, map, 'photo_url'))),
      line_length: emptyToNull(cell(row, map, 'line_length')),
      transformer_power: emptyToNull(cell(row, map, 'transformer_power')),
      transformer_voltage: emptyToNull(cell(row, map, 'transformer_voltage')),
      inventory_count: emptyToNull(cell(row, map, 'inventory_count')),
      cost_initial: emptyToNull(cell(row, map, 'cost_initial')),
      amortization: emptyToNull(cell(row, map, 'amortization')),
      residual_value: emptyToNull(cell(row, map, 'residual_value')),
    });
  }

  return assets;
}

function buildHeaderMap(headerRow) {
  const map = {};

  headerRow.forEach((raw, index) => {
    const h = String(raw || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (!h) return;

    if (h.includes('инвентарный номер')) map.inventory = index;
    else if (h.includes('основное средство') && !h.includes('группа')) map.name = index;
    else if (h.includes('солидарный')) map.solidary_mol = index;
    else if (h.includes('дата выпуска')) map.manufacture_date = index;
    else if (h.includes('дата принятия')) map.accounting_date = index;
    else if (h.includes('срок полезного')) map.useful_life_months = index;
    else if (h.includes('заводской')) map.factory_number = index;
    else if (h.includes('паспорт')) map.passport_number = index;
    else if (h.includes('ссылка на фото') || h === 'фото') map.photo_url = index;
    else if (h.includes('длина линии')) map.line_length = index;
    else if (h.includes('мощность трансформатора')) map.transformer_power = index;
    else if (h.includes('класс напряжения')) map.transformer_voltage = index;
    else if (h.includes('количество')) map.inventory_count = index;
    else if (h.includes('стоимость') && h.includes('началь')) map.cost_initial = index;
    else if (h.includes('амортизация')) map.amortization = index;
    else if (h.includes('остаточная')) map.residual_value = index;
  });

  if (map.inventory == null || map.name == null) {
    throw new Error(
      `Не удалось сопоставить колонки. Найдено: ${JSON.stringify(map)}`,
    );
  }

  return map;
}

function cell(row, map, key) {
  const index = map[key];
  if (index == null) return null;
  return row[index];
}

function emptyToNull(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}
