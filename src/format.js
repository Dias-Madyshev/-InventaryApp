function line(label, value) {
  if (value == null || String(value).trim() === '') return null;
  return `${label}: ${value}`;
}

export function formatAssetMessage(asset) {
  const lines = [
    `📦 Инв. № ${asset.inventory_number}`,
    asset.name,
    '',
    line('Солидарный МОЛ', asset.solidary_mol),
    line('Дата выпуска', asset.manufacture_date),
    line('Дата принятия к учёту', asset.accounting_date),
    line('СПИ, мес.', asset.useful_life_months),
    line('Заводской номер', asset.factory_number),
    line('Номер паспорта', asset.passport_number),
    line('Длина линии', asset.line_length),
    line('Мощность трансформатора', asset.transformer_power),
    line('Класс напряжения', asset.transformer_voltage),
    line('Количество', asset.inventory_count),
    line('Стоимость (нач.)', asset.cost_initial),
    line('Амортизация', asset.amortization),
    line('Остаточная стоимость', asset.residual_value),
  ].filter((item) => item !== null);

  return lines.join('\n');
}
