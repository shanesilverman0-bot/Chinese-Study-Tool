/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Noto Serif TC"', 'serif'],
        sans: ['"Noto Sans TC"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#1a1614',
        paper: '#f4efe6',
        cinnabar: '#c0392b',
        seal: '#a8201a',
        jade: '#2d6a4f',
        gold: '#b8860b',
        mist: '#e8e0d2',
      },
    },
  },
  plugins: [],
}
