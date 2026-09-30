// Builds the EMAN client (React SPA) and server into ./dist
// Usage: node scripts/build.mjs [--watch]
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const prod = !watch;

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'public', 'assets'), { recursive: true });
if (existsSync(path.join(root, 'public'))) {
  await cp(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
}

/** @type {esbuild.BuildOptions} */
const clientOpts = {
  entryPoints: { app: path.join(root, 'client/main.jsx') },
  outdir: path.join(out, 'public/assets'),
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  target: ['es2022', 'safari16'],
  jsx: 'automatic',
  loader: { '.svg': 'text' },
  entryNames: prod ? '[name]-[hash]' : '[name]',
  chunkNames: 'chunk-[hash]',
  metafile: true,
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const serverOpts = {
  entryPoints: [path.join(root, 'server/index.ts')],
  outfile: path.join(out, 'server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: 'linked',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
};

async function writeIndexHtml(meta) {
  const outputs = Object.keys(meta.outputs).map((f) => path.relative(path.join(out, 'public'), path.join(root, f)));
  const js = outputs.find((f) => /assets\/app(-[A-Z0-9]+)?\.js$/.test(f));
  const css = outputs.find((f) => /assets\/app(-[A-Z0-9]+)?\.css$/.test(f));
  const template = await readFile(path.join(root, 'client/index.html'), 'utf8');
  const html = template
    .replace('<!--CSS-->', css ? `<link rel="stylesheet" href="/${css}">` : '')
    .replace('<!--JS-->', `<script type="module" src="/${js}"></script>`);
  await writeFile(path.join(out, 'public/index.html'), html);
}

if (watch) {
  const ctx = await esbuild.context({
    ...clientOpts,
    plugins: [{ name: 'html', setup(b) { b.onEnd((r) => r.metafile && writeIndexHtml(r.metafile)); } }],
  });
  await ctx.watch();
  console.log('Watching client…');
} else {
  const client = await esbuild.build(clientOpts);
  await writeIndexHtml(client.metafile);
  await esbuild.build(serverOpts);
  await cp(path.join(root, 'server/db/migrations'), path.join(out, 'migrations'), { recursive: true });
  console.log('Build complete → dist/');
}
