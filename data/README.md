Runtime data files (not committed):

- `mcp-data.json` — compact snapshot of rossbus.ru data (cities, routes with
  partner prices and schedules, stations, OSRM roads, price-per-km index).
  Built weekly by the site pipeline (`scripts/build_mcp_data.mjs` in the
  private site repo).
- `affiliates.json` — partner deep-link template used by `buyUrl()`.
- `unitiki_slug_map.json` — city slug overrides for the partner.
- `mcp-calls.jsonl` — append-only log of tool calls (demand signal).

The public server at https://rossbus.ru/mcp runs with these files; this
repository documents the code and the tool contract.
