import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import crypto from 'crypto';
import {defineConfig} from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // The service worker's cache name comes from the built page, whose file names carry content hashes.
        // So it changes exactly when the shell does, and nobody has to remember to bump it by hand.
        name: 'sw-version',
        apply: 'build' as const,
        writeBundle(options: { dir?: string }) {
          const dir = options.dir || 'dist';
          const html = path.join(dir, 'index.html');
          const sw = path.join(dir, 'sw.js');
          if (!fs.existsSync(html) || !fs.existsSync(sw)) return;
          const hash = crypto.createHash('sha1').update(fs.readFileSync(html)).digest('hex').slice(0, 10);
          const source = fs.readFileSync(sw, 'utf8');
          fs.writeFileSync(sw, source.replace(/const VERSION = '[^']*';/, `const VERSION = 'b-${hash}';`));
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
