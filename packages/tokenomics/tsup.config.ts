import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'roi/calculator': 'src/roi/calculator.ts',
    'roi/transparency-report': 'src/roi/transparency-report.ts',
    'roi/index': 'src/roi/index.ts',
    'ledger/store': 'src/ledger/store.ts',
    'ledger/index': 'src/ledger/index.ts',
    'attribution/git-ai-notes': 'src/attribution/git-ai-notes.ts',
    'attribution/index': 'src/attribution/index.ts',
    'learning/index': 'src/learning/index.ts',
    'ui/index': 'src/ui/index.ts'
  },
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
