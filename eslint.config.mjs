import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'vendor/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Decorator[expression.callee.name='Component'] > CallExpression > ObjectExpression > Property:matches([key.name='template'], [key.value='template'])",
          message: 'Angular components must use a separate HTML file with templateUrl.',
        },
        {
          selector:
            "Decorator[expression.callee.name='Component'] > CallExpression > ObjectExpression > Property:matches([key.name='styles'], [key.value='styles'])",
          message:
            'Angular component styles must use a separate stylesheet with styleUrl or styleUrls.',
        },
      ],
    },
  },
);
