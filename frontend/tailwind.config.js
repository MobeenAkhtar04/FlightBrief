/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        // flight rules colors
        vfr: '#22c55e',
        mvfr: '#3b82f6',
        ifr: '#ef4444',
        lifr: '#a855f7',
      },
    },
  },
  plugins: [],
}
