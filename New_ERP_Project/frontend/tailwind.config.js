/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Override teal with #00FFEF-based palette
        teal: {
          50:  '#e6fffd',
          100: '#b3fffb',
          200: '#80fff9',
          300: '#4dfff5',
          400: '#00FFEF',
          500: '#00ccc0',
          600: '#009990',
          700: '#007a73',
          800: '#005c57',
          900: '#003d3a',
        },
        primary: {
          50: '#e6fffd',
          100: '#b3fffb',
          200: '#80fff9',
          300: '#4dfff5',
          400: '#00FFEF',
          500: '#00ccc0',
          600: '#009990',
          700: '#007a73',
          800: '#005c57',
          900: '#003d3a',
        },
        secondary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      animation: {
        'spin': 'spin 1s linear infinite',
      }
    },
  },
  safelist: [
    'col-span-2', 'col-span-3',
    'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-6',
  ],
  plugins: [],
}
