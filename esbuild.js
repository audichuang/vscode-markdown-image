const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: [
    'vscode',
    'jsdom',          // jsdom 有外部資源檔案，不能打包
    'canvas',         // jsdom 選擇性依賴
    'bufferutil',     // jsdom 選擇性依賴
    'utf-8-validate', // jsdom 選擇性依賴
  ],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !watch,
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete');
  }
}

build().catch(() => process.exit(1));
