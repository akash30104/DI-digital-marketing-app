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
        stealth: {
          bg: '#08080A',
          card: '#141417',
          elevated: '#1C1C22',
          border: 'rgba(255, 255, 255, 0.08)',
          borderLight: 'rgba(255, 255, 255, 0.14)',
          muted: '#A1A1AA',
        },
        brand: {
          navy: '#0F172A',
          blue: '#3B82F6',
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          purple: '#8B5CF6',
          darkBg: '#08080A',
          darkCard: '#141417',
          darkBorder: 'rgba(255, 255, 255, 0.08)'
        }
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      letterSpacing: {
        'ultra': '0.22em',
      }
    },
  },
  plugins: [],
}
