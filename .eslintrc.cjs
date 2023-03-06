module.exports = {
  plugins: ['html', 'jsx'],
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {},
};
