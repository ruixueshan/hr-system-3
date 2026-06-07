module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  extends: [
    'plugin:vue/vue3-essential',
    '@vue/eslint-config-typescript'
  ],
  rules: {
    'prefer-const': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-unused-vars': 'warn'
  },
  overrides: [
    {
      files: ['src/**/*.{ts,vue}'],
      excludedFiles: ['src/api/cloud.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "CallExpression[callee.object.name='cloud'][callee.property.name='callFunction']",
            message: 'Web API modules must use callFunction from @/api/cloud instead of calling cloud.callFunction directly.'
          }
        ]
      }
    }
  ]
};
