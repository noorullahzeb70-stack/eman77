import * as esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const r = await esbuild.build({
  entryPoints: ['client/main.jsx'], bundle: true, write: false, minify: true, format: 'iife',
  jsx: 'automatic', outdir: '/tmp/pv', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.svg': 'text' },
});
const js = r.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = r.outputFiles.find(f => f.path.endsWith('.css')).text;
const logo = (await readFile('public/logo.svg')).toString('base64');
let html = await readFile('client/index.html', 'utf8');
html = html
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />', `<link rel="icon" href="data:image/svg+xml;base64,${logo}" />`)
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '')
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace('<!--CSS-->', () => `<style>${css}</style>`)
  .replace('<!--JS-->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile('/home/claude/EMAN-preview.html', html);
console.log('size KB', Math.round(html.length/1024));
