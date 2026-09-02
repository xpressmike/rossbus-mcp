# rossbus-mcp

MCP server for intercity **bus travel across Russia** — routes, partner prices,
departure times, bus stations, transfers, road distances and a price‑per‑km index.
1 000+ cities, 4 500+ routes with tickets on sale.

**Remote endpoint (no auth):** `https://rossbus.ru/mcp` — Streamable HTTP.
Docs & examples: https://rossbus.ru/agents/ · Site: https://rossbus.ru

Data is real and only real: a dated snapshot of a ticket aggregator's sales,
schedules from the same snapshot, road geometry from OSRM. Nothing is
estimated. If a route is not in the data it most likely does not exist —
use `find_transfer`.

## Connect

```bash
# Claude Code
claude mcp add --transport http rossbus https://rossbus.ru/mcp
```

```json
// Cursor / VS Code — mcp.json
{ "mcpServers": { "rossbus": { "url": "https://rossbus.ru/mcp" } } }
```

Claude / ChatGPT: *Settings → Connectors → Add custom connector* → URL above, no auth.

## Tools

| tool | what it returns |
|---|---|
| `get_route(from, to, date?)` | min/max price, trips on sale, departure times, stations, carriers, road km, ₽/km, `buy_url`; if no direct bus — a transfer |
| `search_routes(from, limit?)` | every destination from a city with price "from", trips and km |
| `cheapest_destinations(from, max_price_rub?, limit?)` | destinations sorted by ticket price, optionally within a budget |
| `city_departures(city, limit?)` | departure board: first/last time per direction |
| `get_station(city)` | bus stations of a city (real names from schedules) |
| `get_distance(from, to)` | road km (OSRM), drive minutes, whether a direct bus exists |
| `find_transfer(from, to)` | cheapest one‑transfer option with both legs priced |
| `price_per_km_stats(region?)` | price‑per‑km index: Russia median, cheapest/most expensive regions, a region's rank |

Cities are accepted in Russian («Казань») or as slugs (`kazan`).

### MCP Apps (interactive UI)

`get_route`, `city_departures` and `cheapest_destinations` ship an
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) view
(`ui://rossbus/app.html`): in hosts that support the extension (Claude,
ChatGPT, VS Code, Goose) the route card, departure board or budget list
renders inline in the chat — rows are clickable and open the route, the buy
button opens the partner page. Text-only hosts get the same data as text.
The view is a single self-contained HTML built with Vite (`ui/`).

### Example

```bash
curl -X POST https://rossbus.ru/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"cheapest_destinations","arguments":{"from":"Казань","max_price_rub":700,"limit":3}}}'
```

```json
{ "from": "Казань", "budget_rub": 700, "found": 8,
  "destinations": [
    { "to": "Сокуры", "min_rub": 444, "km": 29.2, "rub_per_km": 15.21, "trips": 21,
      "page": "https://rossbus.ru/buses/kazan/sokury/" } ] }
```

## Buying tickets

rossbus does not sell tickets. `buy_url` is a partner deep link to the chosen
route and date; the agent hands it to the human, the human buys on the
partner's site. Ticket price is the same as on the partner. Past or empty
dates default to tomorrow.

## Run it yourself

The server is a thin wrapper (`mcp.js` transport, `mcp-core.js` pure
functions) over `data/mcp-data.json`, a compact snapshot produced weekly by
the site pipeline. See `data/README.md`. `npm i && npm start` listens on
`127.0.0.1:3012`; put nginx in front for TLS.

## Also for agents

- `https://rossbus.ru/llms.txt`, `https://rossbus.ru/llms-full.txt`
- Open data: `https://rossbus.ru/data/perkm.json` / `.csv` (price‑per‑km index, weekly)
- Discovery: `https://rossbus.ru/.well-known/mcp.json`

MIT © rossbus.ru
