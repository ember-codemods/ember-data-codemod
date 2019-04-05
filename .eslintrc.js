module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2017,
  },
  env: {
    node: true,
  },
  rules: {
    'prettier/prettier': ['error', {singleQuote: true}],
  },
  overrides: [
    {
      files: ['bin/**/*.js'],

      rules: {
        'no-console': ['off'],
        'no-process-exit': ['off']
      },
    },
    {
      files: ['__tests__/*.test.js'],
      plugins: ['jest'],

      // can't use `extends` in nested config :sob:
      rules: require('eslint-plugin-jest').configs.recommended.rules,

      env: {
        jest: true,
      },
    },
  ],
};
