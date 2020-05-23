module.exports = {
	parserOptions: {
		ecmaVersion: 2019,
		project: './tsconfig.json'
	},
	env: {
		es6: true,
		node: true
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended'
	],
	rules: {
		'no-else-return': 'warn',
		'no-redeclare': 'error',
		'no-useless-escape': 'warn',
		'no-inner-declarations': 'off',
		'array-bracket-spacing': ['warn', 'never'],
		'brace-style': 'off',
		'@typescript-eslint/brace-style': ['warn', '1tbs', { allowSingleLine: true }],
		curly: ['warn', 'multi'],
		'no-trailing-spaces': 'warn',
		'@typescript-eslint/space-before-function-paren': ['warn', {
			anonymous: 'never',
			named: 'never',
			asyncArrow: 'always'
		}],
		'arrow-spacing': 'warn',
		'@typescript-eslint/comma-spacing': ['warn', {
			'before': false,
			'after': true
		}],
		'comma-dangle': 'warn',
		'func-call-spacing': 'off',
		'@typescript-eslint/func-call-spacing': ['error', 'never'],
		indent: 'off',
		'@typescript-eslint/indent': ['error', 'tab', { SwitchCase: 1 }],
		'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
		quotes: 'off',
		'@typescript-eslint/quotes': ['error', 'single', {
			avoidEscape: true,
			allowTemplateLiterals: true
		}],
		'array-callback-return': 'error',
		eqeqeq: ['warn', 'always', { null: 'ignore' }],
		'no-eval': 'error',
		'no-implied-eval': 'error',
		'no-return-assign': 'error',
		'no-unmodified-loop-condition': 'off',
		'no-empty': 'error',
		'@typescript-eslint/no-extra-semi': 'error',
		'no-invalid-regexp': 'error',
		'no-irregular-whitespace': 'error',
		'no-regex-spaces': 'error',
		'no-unreachable': 'error',
		'no-warning-comments': ['warn', {
			terms: ['todo', 'fixme'],
			location: 'start'
		}],
		'valid-typeof': ['error', { requireStringLiterals: false }],
		'constructor-super': 'error',
		'no-const-assign': 'error',
		'no-dupe-class-members': 'off',
		'no-var': 'error',
		'prefer-const': ['error', {
			destructuring: 'all',
			ignoreReadBeforeAssign: false
		}],
		'no-lonely-if': 'error',
		'no-extra-parens': 'off',
		'@typescript-eslint/no-extra-parens': ['warn', 'all', {
			ignoreJSX: 'multi-line',
			nestedBinaryExpressions: false
		}],
		'object-shorthand': ['error', 'always', {
			ignoreConstructors: false,
			avoidQuotes: true
		}],
		'block-spacing': ['error', 'always'],
		'eol-last': ['error', 'always'],
		semi: 'off',
		'@typescript-eslint/semi': 'error',
		'@typescript-eslint/consistent-type-assertions': 'off',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/interface-name-prefix': 'off'
	}
};
