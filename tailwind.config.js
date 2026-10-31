/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#172554',
          blue: '#3B82F6',
          green: '#16A34A',
          amber: '#D97706',
          red: '#DC2626',
          purple: '#8B5CF6',
          darkBg: '#0B1120',
          darkCard: '#1E293B',
          darkBorder: '#334155'
        }
      }
    },
  },
  plugins: [],
}
