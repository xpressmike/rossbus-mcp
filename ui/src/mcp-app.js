// Вью MCP Apps rossbus: карточка маршрута, табло отправлений, «куда дёшево».
// Один HTML на три инструмента — ветвление по structuredContent.kind.
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import './mcp-app.css';

const root = document.getElementById('app');
const app = new App({ name: 'rossbus', version: '1.2.0' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtN = (n) => Number(n).toLocaleString('ru-RU');
const fmtV = (v) => Number(v).toFixed(1).replace('.', ',');
const ruDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };

function render(d) {
  if (!d || d.error) return `<p class="err">${esc(d?.error ?? 'Нет данных')}</p>`;
  if (d.kind === 'route') return d.direct ? routeCard(d) : transferCard(d);
  if (d.kind === 'board') return boardTable(d);
  if (d.kind === 'cheapest') return cheapestList(d);
  return `<pre class="raw">${esc(JSON.stringify(d, null, 1))}</pre>`;
}

function routeCard(d) {
  const trips = d.trips_on_sale ?? 0;
  const facts = [
    d.price_rub?.min ? `<div class="fact"><b>от ${fmtN(d.price_rub.min)} ₽</b><span>цена партнёра на ${esc(ruDate(d.data_date))}</span></div>` : '',
    trips ? `<div class="fact"><b>${trips}</b><span>${plural(trips, 'рейс', 'рейса', 'рейсов')} в продаже</span></div>` : '',
    d.distance_km ? `<div class="fact"><b>${fmtN(Math.round(d.distance_km))} км</b><span>по дороге${d.drive_minutes ? ` · ${Math.floor(d.drive_minutes / 60)} ч ${String(d.drive_minutes % 60).padStart(2, '0')} м на машине` : ''}</span></div>` : '',
    d.rub_per_km ? `<div class="fact"><b>${fmtV(d.rub_per_km)} ₽/км</b><span>цена километра</span></div>` : '',
  ].join('');
  // сотни рейсов в сутки — показываем первые 24, остальные по клику
  const all = d.departures ?? [];
  const chip = (t, hidden) => `<button class="chip${hidden ? ' more' : ''}" data-open="${esc(d.buy_url)}" title="Купить на завтра у партнёра">${esc(t)}</button>`;
  const times = all.slice(0, 24).map((t) => chip(t)).join('') + all.slice(24).map((t) => chip(t, true)).join('')
    + (all.length > 24 ? `<button class="chip chip-more" data-more>+${all.length - 24} ещё</button>` : '');
  return `
    <header class="head"><span class="brand">ross<b>bus</b></span><h2>Автобус ${esc(d.from)} — ${esc(d.to)}</h2></header>
    <div class="facts">${facts}</div>
    ${times ? `<p class="lbl">Отправления ${d.schedule_date ? esc(ruDate(d.schedule_date)) : ''}${d.from_station ? ` · ${esc(d.from_station)}` : ''}</p><div class="chips">${times}</div>` : '<p class="muted">Времена отправления показывает партнёр.</p>'}
    <div class="actions">
      <button class="btn btn-cta" data-open="${esc(d.buy_url)}">Смотреть рейсы и купить →</button>
      <button class="btn btn-ghost" data-open="${esc(d.page)}">Страница маршрута</button>
    </div>
    <p class="note">Покупка у партнёра, цена та же. Данные — снимок продаж, не оценка.</p>`;
}

function transferCard(d) {
  const t = d.transfer;
  const legs = t ? `
    <div class="legs">
      <div class="leg"><span>1. → ${esc(t.leg1.to)}</span><b>от ${fmtN(t.leg1.min_rub)} ₽</b><button class="btn btn-ghost" data-open="${esc(t.leg1.buy_url)}">билет</button></div>
      <div class="leg"><span>2. ${esc(t.leg2.from)} →</span><b>от ${fmtN(t.leg2.min_rub)} ₽</b><button class="btn btn-ghost" data-open="${esc(t.leg2.buy_url)}">билет</button></div>
    </div>
    <p class="lbl">Итого от ${fmtN(t.total_min_rub)} ₽ с пересадкой в городе ${esc(t.via)}</p>` : '<p class="muted">Варианта с одной пересадкой тоже не нашлось.</p>';
  return `
    <header class="head"><span class="brand">ross<b>bus</b></span><h2>Прямых рейсов в продаже нет</h2></header>
    ${legs}
    <div class="actions"><button class="btn btn-ghost" data-open="${esc(d.page)}">Страница маршрута</button></div>`;
}

function boardTable(d) {
  const rows = (d.board ?? []).map((r) => `
    <tr class="row" data-route="${esc(d.city_slug)}|${esc(r.to_slug)}">
      <td class="name">${esc(r.to)}</td><td class="t">${esc(r.first)}</td><td class="t">${esc(r.last)}</td>
      <td class="n">${r.departures}</td><td class="n">${r.min_rub ? `от ${fmtN(r.min_rub)} ₽` : ''}</td>
    </tr>`).join('');
  return `
    <header class="head"><span class="brand">ross<b>bus</b></span><h2>Табло: автобусы из города ${esc(d.city)}</h2></header>
    <p class="lbl">${d.directions} ${plural(d.directions, 'направление', 'направления', 'направлений')} · нажмите строку — откроется маршрут</p>
    <table class="tbl"><thead><tr><th>Куда</th><th>первый</th><th>последний</th><th>рейсов</th><th>цена</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function cheapestList(d) {
  const rows = (d.destinations ?? []).map((r) => `
    <tr class="row" data-route="${esc(d.from_slug)}|${esc(r.to_slug)}">
      <td class="name">${esc(r.to)}</td><td class="n"><b>от ${fmtN(r.min_rub)} ₽</b></td>
      <td class="n">${r.km ? `${fmtN(Math.round(r.km))} км` : ''}</td><td class="n">${r.rub_per_km ? `${fmtV(r.rub_per_km)} ₽/км` : ''}</td><td class="n">${r.trips}</td>
    </tr>`).join('');
  return `
    <header class="head"><span class="brand">ross<b>bus</b></span><h2>Куда уехать из города ${esc(d.from)}${d.budget_rub ? ` до ${fmtN(d.budget_rub)} ₽` : ' дешевле всего'}</h2></header>
    <p class="lbl">${d.found} ${plural(d.found, 'направление', 'направления', 'направлений')} · нажмите строку — откроется маршрут</p>
    <table class="tbl"><thead><tr><th>Куда</th><th>билет</th><th>дорога</th><th>₽/км</th><th>рейсов</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function show(d) { root.innerHTML = render(d); }

root.addEventListener('click', async (e) => {
  const more = e.target.closest('[data-more]');
  if (more) { root.querySelectorAll('.chip.more').forEach((c) => c.classList.remove('more')); more.remove(); return; }
  const open = e.target.closest('[data-open]');
  if (open) { app.openLink({ url: open.dataset.open }).catch(() => {}); return; }
  const row = e.target.closest('[data-route]');
  if (!row) return;
  const [from, to] = row.dataset.route.split('|');
  row.classList.add('busy');
  try {
    const res = await app.callServerTool({ name: 'get_route', arguments: { from, to } });
    show(res.structuredContent ?? { error: 'Пустой ответ' });
  } catch (err) { show({ error: String(err?.message ?? err) }); }
});

app.ontoolresult = (result) => show(result.structuredContent ?? { error: result.content?.[0]?.text ?? 'Нет данных' });
app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) { const { top, right, bottom, left } = ctx.safeAreaInsets; document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`; }
};
app.onteardown = async () => ({});
app.onerror = console.error;
await app.connect();
