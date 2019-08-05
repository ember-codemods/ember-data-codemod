module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2017
  },
  env: {
    node: true
  },
  rules: {
    'prettier/prettier': ['error', { singleQuote: true }]
  },
  overrides: [
    {
      files: ['transforms/**/test.js'],
      plugins: ['jest'],

      // can't use `extends` in nested config :sob:
      rules: require('eslint-plugin-jest').configs.recommended.rules,

      env: {
        jest: true
      }
    }
  ]
};
