// Сборка вью MCP Apps в один самодостаточный HTML (CSP хостов запрещает
// внешние ресурсы) → ui/dist/mcp-app.html, коммитится вместе с сервером.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  plugins: [viteSingleFile()],
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, rollupOptions: { input: path.join(root, 'mcp-app.html') } },
});
