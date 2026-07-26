/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,html}',
    './entrypoints/**/*.{js,ts,jsx,tsx,html}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // X.com color palette
        'x-bg-light': '#ffffff',
        'x-bg-dark': '#000000',
        'x-text-light': '#0f1419',
        'x-text-dark': '#e7e9ea',
        'x-accent': '#1d9bf0',
        'x-accent-hover': '#1a8cd8',
        'x-border-light': '#eff3f4',
        'x-border-dark': '#2f3336',
        'x-secondary-light': '#536471',
        'x-secondary-dark': '#71767b',
        'x-primary-light': '#0f1419',
        'x-primary-dark': '#f7f9f9',
        'x-hover-light': '#f7f9f9',
        'x-hover-dark': '#181818'
      }
    }
  },
  plugins: []
};
