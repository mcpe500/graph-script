import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const nodeBuiltins = ['fs', 'path', 'child_process', 'crypto', 'os', 'stream', 'url', 'http', 'https', 'buffer', 'util', 'process'];
const externalPkgs = ['sharp', '@mathjax/src'];

export default {
  input: 'src/browser.ts',
  output: [
    {
      file: 'dist/browser/graphscript.esm.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/browser/graphscript.js',
      format: 'umd',
      name: 'GraphScript',
      sourcemap: true,
      exports: 'named',
    },
  ],
  external: [...nodeBuiltins, ...externalPkgs],
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.browser.json',
      declaration: true,
      declarationDir: 'dist/browser',
    }),
  ],
  onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    if (warning.code === 'UNRESOLVED_IMPORT') return;
    warn(warning);
  },
};
