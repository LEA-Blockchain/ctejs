import js from '@eslint/js';
import globals from 'globals';
import pluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
    {
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            'coverage/',
            'public/',
            '**/*.wasm',
            '**/*.md',
            '**/*.html',
            '**/*.css',
            '**/*.json',
            '**/*.png',
            'package-lock.json',
            'yarn.lock',
        ],
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['test/**/*.js', 'test/**/*.cjs'],
        languageOptions: {
            globals: {},
        },
        rules: {},
    },
    pluginPrettierRecommended,
];
