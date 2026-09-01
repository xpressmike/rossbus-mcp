// Ядро MCP-инструментов rossbus: чистые функции над mcp-data.json.
// Отдельно от транспорта, чтобы гоняться node:test без сети.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'data/mcp-data.json'), 'utf8'));
const AFF = JSON.parse(readFileSync(path.join(ROOT, 'data/affiliates.json'), 'utf8'));
const SLUG_MAP = JSON.parse(readFileSync(path.join(ROOT, 'data/unitiki_slug_map.json'), 'utf8'));

const UNITIKI = AFF.providers.find((p) => p.id === 'unitiki');

// ── города: поиск по слагу или русскому имени ────────────────────────────
const BY_RU = new Map();
for (const [slug, c] of Object.entries(DATA.cities)) BY_RU.set(c.ru.toLowerCase().replace(/ё/g, 'е'), slug);

export function resolveCity(q) {
  if (!q) return null;
  const s = String(q).trim().toLowerCase().replace(/ё/g, 'е');
  if (DATA.cities[s]) return s;
  return BY_RU.get(s) ?? null;
}
export const cityRu = (slug) => DATA.cities[slug]?.ru ?? slug;

// ── партнёрская ссылка: тот же шаблон, что у редиректора ─────────────────
function mapSlug(s) { return SLUG_MAP[s] ?? s; }
function dmy(iso) { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
function tomorrowIso() {
  const t = new Date(Date.now() + 24 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}
export function buyUrl(from, to, dateIso) {
  const today = new Date().toISOString().slice(0, 10);
  // прошедшая или пустая дата → завтра (кнопки без даты ведут на пустую выдачу)
  const date = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) && dateIso > today ? dateIso : tomorrowIso();
  const sub_id = `${from}-${to}__agent__unit__rossbus`;
  return UNITIKI.deep_link_template
    .replace('{sub_id}', encodeURIComponent(sub_id))
    .replace('{from}', mapSlug(from))
    .replace('{to}', mapSlug(to))
    .replace('{date_dmy}', encodeURIComponent(dmy(date)));
}

const dataDate = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// ── инструменты ──────────────────────────────────────────────────────────
export function getRoute(fromQ, toQ, dateIso) {
  const from = resolveCity(fromQ), to = resolveCity(toQ);
  if (!from || !to) return { error: `Город не найден: ${!from ? fromQ : toQ}. Используйте русское название или слаг.` };
  const r = DATA.routes[`${from}__${to}`];
  if (!r) {
    const t = findTransfer(fromQ, toQ);
    return { direct: false, note: 'Прямых рейсов в продаже нет.', transfer: t.error ? null : t,
             page: `https://rossbus.ru/buses/${from}/${to}/` };
  }
  return {
    direct: true, from: cityRu(from), to: cityRu(to),
    price_rub: { min: r.min, max: r.max }, trips_on_sale: r.trips,
    data_date: dataDate(r.ts),
    distance_km: r.km, drive_minutes: r.drive_min,
    rub_per_km: rubPerKm(r.min, r.km),
    departures: r.times, schedule_date: r.date,
    from_station: r.from_station, to_stations: r.to_stations,
    carriers: r.carriers,
    buy_url: buyUrl(from, to, dateIso),
    page: `https://rossbus.ru/buses/${from}/${to}/`,
  };
}

export function searchRoutes(fromQ, limit = 15) {
  const from = resolveCity(fromQ);
  if (!from) return { error: `Город не найден: ${fromQ}` };
  const out = [];
  for (const [key, r] of Object.entries(DATA.routes)) {
    if (!key.startsWith(from + '__')) continue;
    const to = key.slice(from.length + 2);
    out.push({ to: cityRu(to), to_slug: to, min_rub: r.min, trips: r.trips, km: r.km });
  }
  out.sort((a, b) => b.trips - a.trips);
  return { from: cityRu(from), total: out.length, routes: out.slice(0, limit),
           page: `https://rossbus.ru/buses/${from}/` };
}

export function cityDepartures(cityQ, limit = 20) {
  const from = resolveCity(cityQ);
  if (!from) return { error: `Город не найден: ${cityQ}` };
  const deps = [];
  for (const [key, r] of Object.entries(DATA.routes)) {
    if (!key.startsWith(from + '__') || !r.times.length) continue;
    const to = key.slice(from.length + 2);
    deps.push({ to: cityRu(to), first: r.times[0], last: r.times[r.times.length - 1],
                departures: r.times.length, schedule_date: r.date, min_rub: r.min });
  }
  deps.sort((a, b) => a.first.localeCompare(b.first));
  return { city: cityRu(from), directions: deps.length, board: deps.slice(0, limit) };
}

export function getStation(cityQ) {
  const c = resolveCity(cityQ);
  if (!c) return { error: `Город не найден: ${cityQ}` };
  const names = DATA.stations[c] ?? [];
  return { city: cityRu(c), stations: names,
           note: names.length ? 'Названия станций — из расписания партнёра.' : 'Станций этого города в данных партнёра нет.',
           page: `https://rossbus.ru/avtovokzaly/${c}/` };
}

export function getDistance(fromQ, toQ) {
  const from = resolveCity(fromQ), to = resolveCity(toQ);
  if (!from || !to) return { error: `Город не найден: ${!from ? fromQ : toQ}` };
  const rd = DATA.roads[`${from}__${to}`] ?? DATA.roads[`${to}__${from}`];
  if (!rd?.km) return { error: 'Дороги между этими городами в данных нет.' };
  return { from: cityRu(from), to: cityRu(to), road_km: rd.km,
           drive_minutes: rd.drive_min, has_direct_bus: !!DATA.routes[`${from}__${to}`],
           page: `https://rossbus.ru/rasstoyanie/${from}/${to}/` };
}

export function findTransfer(fromQ, toQ) {
  const from = resolveCity(fromQ), to = resolveCity(toQ);
  if (!from || !to) return { error: `Город не найден: ${!from ? fromQ : toQ}` };
  if (DATA.routes[`${from}__${to}`]) return { note: 'Есть прямой маршрут — пересадка не нужна.', direct: getRoute(from, to) };
  let best = null;
  for (const key of Object.keys(DATA.routes)) {
    if (!key.startsWith(from + '__')) continue;
    const hub = key.slice(from.length + 2);
    const leg2 = DATA.routes[`${hub}__${to}`];
    if (!leg2) continue;
    const leg1 = DATA.routes[key];
    const total = leg1.min + leg2.min;
    if (!best || total < best.total_min_rub) {
      best = { via: cityRu(hub), via_slug: hub, total_min_rub: total,
               leg1: { to: cityRu(hub), min_rub: leg1.min, trips: leg1.trips, buy_url: buyUrl(from, hub) },
               leg2: { from: cityRu(hub), min_rub: leg2.min, trips: leg2.trips, buy_url: buyUrl(hub, to) } };
    }
  }
  return best ?? { error: 'Пересадочного варианта через один город не нашлось.' };
}

// ₽/км пары: те же гарды, что на сайте (реальная дорога от 10 км, полоса 0.3–40)
export function rubPerKm(min, km) {
  if (!min || !km || km < 10) return null;
  const v = min / km;
  return v > 0.3 && v < 40 ? Math.round(v * 100) / 100 : null;
}

export function pricePerKmStats(regionQ) {
  const pk = DATA.perkm;
  if (!pk) return { error: 'Данных индекса нет.' };
  const base = { median_rub_per_km: pk.median, routes_in_index: pk.count, data_date: pk.built,
                 method: 'минимальная цена билета партнёра ÷ длина дороги по OSRM',
                 page: 'https://rossbus.ru/cena-kilometra/' };
  if (!regionQ) {
    return { ...base,
      cheapest_regions: pk.regions.slice(0, 5).map((r) => ({ region: r.name, median: r.median, routes: r.n })),
      most_expensive_regions: pk.regions.slice(-5).reverse().map((r) => ({ region: r.name, median: r.median, routes: r.n })) };
  }
  const q = String(regionQ).trim().toLowerCase().replace(/ё/g, 'е');
  const i = pk.regions.findIndex((r) => r.slug === q || r.name.toLowerCase().replace(/ё/g, 'е').includes(q));
  if (i < 0) return { error: `Региона «${regionQ}» в индексе нет (в индексе ${pk.regions.length} регионов с 5+ маршрутами).`, ...base };
  const r = pk.regions[i];
  return { region: r.name, median_rub_per_km: r.median, routes: r.n,
           rank: `${i + 1} из ${pk.regions.length} (1 — самый дешёвый километр)`,
           russia_median: pk.median, data_date: pk.built,
           region_page: `https://rossbus.ru/napravleniya/${r.slug}/`, page: base.page };
}

export function cheapestDestinations(fromQ, maxPriceRub, limit = 15) {
  const from = resolveCity(fromQ);
  if (!from) return { error: `Город не найден: ${fromQ}` };
  const out = [];
  for (const [key, r] of Object.entries(DATA.routes)) {
    if (!key.startsWith(from + '__')) continue;
    if (maxPriceRub && r.min > maxPriceRub) continue;
    const to = key.slice(from.length + 2);
    out.push({ to: cityRu(to), to_slug: to, min_rub: r.min, km: r.km,
               rub_per_km: rubPerKm(r.min, r.km), trips: r.trips,
               page: `https://rossbus.ru/buses/${from}/${to}/` });
  }
  out.sort((a, b) => a.min_rub - b.min_rub);
  return { from: cityRu(from), budget_rub: maxPriceRub ?? null, found: out.length,
           destinations: out.slice(0, limit), page: `https://rossbus.ru/buses/${from}/` };
}

export const stats = () => ({ cities: Object.keys(DATA.cities).length, routes: Object.keys(DATA.routes).length, built: DATA.built });
