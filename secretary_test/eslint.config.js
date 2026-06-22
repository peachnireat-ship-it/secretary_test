const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'warn',
    },
  },
];
