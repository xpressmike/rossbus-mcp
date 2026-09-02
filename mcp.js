// MCP-сервер rossbus: расписания, цены и партнёрские ссылки для AI-агентов.
// Streamable HTTP (stateless) на 127.0.0.1:3012, наружу — через nginx /mcp.
import http from 'node:http';
import { appendFile } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { readFileSync } from 'node:fs';
import * as core from './mcp-core.js';

const PORT = Number(process.env.MCP_PORT || 3012);
const LOG_PATH = process.env.MCP_LOG_PATH
  || path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'data/mcp-calls.jsonl');

// Лог агентского спроса: какие пары/города спрашивают агенты — сигнал, куда
// расширять каталог. Fire-and-forget: сбой записи не должен ломать ответ.
function logCall(tool, args) {
  appendFile(LOG_PATH, JSON.stringify({ ts: Math.floor(Date.now() / 1000), tool, args }) + '\n', () => {});
}

// MCP Apps: один самодостаточный HTML (ui/dist, сборка `npm run build:ui`)
// рисует карточку маршрута, табло и «куда дёшево» прямо в чате хоста.
// Хосты без UI получают тот же текстовый ответ — виджет только надстройка.
const UI_URI = 'ui://rossbus/app.html';
let UI_HTML = null;
try { UI_HTML = readFileSync(new URL('../ui/dist/mcp-app.html', import.meta.url), 'utf8'); }
catch { console.warn('MCP Apps: ui/dist/mcp-app.html не собран — инструменты работают без виджета'); }

const INSTRUCTIONS = `Справочник автобусного сообщения России (rossbus.ru): 1000+ городов, 4500+ маршрутов.
Все данные реальные — снимок продаж партнёра, расписания, дороги OSRM; ничего не оценивается и не выдумывается.
Если маршрута нет в данных, его скорее всего не существует — используйте find_transfer для пересадок.
Города принимаются по-русски («Казань») или слагом (kazan). Покупка — по buy_url у партнёра (агент передаёт ссылку человеку).
Bus routes, schedules and prices across Russia; ask in Russian city names or slugs. All data is real partner data, nothing is estimated.`;

function build() {
  const s = new McpServer({ name: 'rossbus', version: '1.2.0' }, { instructions: INSTRUCTIONS });
  // каждый вызов инструмента — в лог спроса
  const reg = s.registerTool.bind(s);
  s.registerTool = (name, def, handler) => reg(name, def, async (args) => { logCall(name, args); return handler(args); });
  const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }] });
  // ответ с UI: текст для модели + structuredContent для виджета
  const rich = (kind, v) => ({ ...json(v), structuredContent: { kind, ...v } });
  const ui = UI_HTML ? { _meta: { ui: { resourceUri: UI_URI } } } : {};
  const appTool = (name, cfg, handler) => UI_HTML ? registerAppTool(s, name, { ...cfg, ...ui }, handler) : s.registerTool(name, cfg, handler);
  if (UI_HTML) registerAppResource(s, 'rossbus UI', UI_URI, { mimeType: RESOURCE_MIME_TYPE },
    async () => ({ contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: UI_HTML }] }));
  const city = z.string().describe('Город: русское название («Москва») или слаг (moskva)');

  appTool('get_route', {
    title: 'Маршрут между городами',
    description: 'Цены, число рейсов в продаже, времена отправления, станции, перевозчики и ссылка на покупку у партнёра. Только реальные данные; если прямых рейсов нет — предложит пересадку.',
    inputSchema: { from: city, to: city, date: z.string().optional().describe('YYYY-MM-DD; прошедшая или пустая → завтра') },
  }, async ({ from, to, date }) => rich('route', core.getRoute(from, to, date)));

  s.registerTool('search_routes', {
    title: 'Куда можно уехать из города',
    description: 'Список направлений из города с ценой «от», числом рейсов и километражем.',
    inputSchema: { from: city, limit: z.number().int().min(1).max(50).optional() },
  }, async ({ from, limit }) => json(core.searchRoutes(from, limit ?? 15)));

  appTool('city_departures', {
    title: 'Табло отправлений города',
    description: 'Первое/последнее отправление и число рейсов по каждому направлению (по расписанию партнёра).',
    inputSchema: { city, limit: z.number().int().min(1).max(60).optional() },
  }, async (a) => rich('board', core.cityDepartures(a.city, a.limit ?? 20)));

  s.registerTool('get_station', {
    title: 'Автовокзалы города',
    description: 'Названия автовокзалов и автостанций города из данных партнёра.',
    inputSchema: { city },
  }, async (a) => json(core.getStation(a.city)));

  s.registerTool('get_distance', {
    title: 'Расстояние между городами',
    description: 'Километры по автомобильной дороге (OSRM) и время на машине; есть ли прямой автобус.',
    inputSchema: { from: city, to: city },
  }, async ({ from, to }) => json(core.getDistance(from, to)));

  s.registerTool('find_transfer', {
    title: 'Маршрут с пересадкой',
    description: 'Когда прямого автобуса нет: самый дешёвый вариант через один пересадочный город, с ценами обоих плеч.',
    inputSchema: { from: city, to: city },
  }, async ({ from, to }) => json(core.findTransfer(from, to)));

  appTool('cheapest_destinations', {
    title: 'Куда уехать дёшево',
    description: 'Направления из города по возрастанию цены билета, при желании — в пределах бюджета («куда уехать из Казани до 1000 ₽»). С ценой километра каждого варианта.',
    inputSchema: { from: city, max_price_rub: z.number().int().positive().optional().describe('Бюджет в рублях'),
                   limit: z.number().int().min(1).max(50).optional() },
  }, async ({ from, max_price_rub, limit }) => rich('cheapest', core.cheapestDestinations(from, max_price_rub, limit ?? 15)));

  s.registerTool('price_per_km_stats', {
    title: 'Индекс цены километра',
    description: 'Сколько стоит километр на автобусе: медиана по России, самые дешёвые и дорогие регионы; с параметром region — медиана и место конкретного региона.',
    inputSchema: { region: z.string().optional().describe('Название региона по-русски («Татарстан») или слаг') },
  }, async ({ region }) => json(core.pricePerKmStats(region)));

  return s;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200).end('ok'); return; }
  if (!url.pathname.startsWith('/mcp')) { res.writeHead(404).end(); return; }
  try {
    // stateless: транспорт на запрос — без хранения сессий
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    const mcp = build();
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null }));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`rossbus MCP on 127.0.0.1:${PORT} (${JSON.stringify(core.stats())})`));
