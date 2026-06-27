import { copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const outDir = 'dist-css';
const apacheCssPath = 'css/apache.css';

await build({
	configFile: false,
	publicDir: false,
	plugins: [tailwindcss()],
	build: {
		copyPublicDir: false,
		emptyOutDir: true,
		outDir,
		rollupOptions: {
			input: 'scripts/apache-css-entry.html'
		}
	}
});

const cssFile = readdirSync(join(outDir, 'assets')).find(file => file.endsWith('.css'));
if (!cssFile) {
	throw new Error('CSS build did not produce a stylesheet.');
}

copyFileSync(join(outDir, 'assets', cssFile), apacheCssPath);
rmSync(outDir, { recursive: true, force: true });

console.log(`Updated ${apacheCssPath}`);
