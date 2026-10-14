import type { Config } from "prettier";

/** @type {import("prettier").Config} */
const config: Config = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',

  plugins: ['@trivago/prettier-plugin-sort-imports'],

  overrides: [
    {
      files: '*.ts',
      options: {
        parser: 'typescript',
      },
    },
    {
      files: '*.mts',
      options: {
        parser: 'typescript',
      },
    }
  ],

  importOrder: [
    '^.*\\u0000$',            // type-only imports
    '<THIRD_PARTY_MODULES>',  // node_modules
    '^@/(.*)$',               // project alias
    '^\\.{2}/.*',             // ../.. imports
    '^\\./.*'                 // same-folder imports
  ],

  importOrderSeparation: false,
  importOrderSortSpecifiers: true,
  importOrderParserPlugins: ['decorators-legacy', 'typescript'],
};

export default config;
