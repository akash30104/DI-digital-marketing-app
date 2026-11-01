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
          bg: '#000000',
          card: '#18181b',
          elevated: '#27272a',
          surface: '#323236',
          border: 'rgba(255, 255, 255, 0.1)',
          borderLight: 'rgba(255, 255, 255, 0.16)',
          muted: '#a1a1aa',
        },
        brand: {
          navy: '#18181b',
          blue: '#52525b',
          green: '#27272a',
          amber: '#3f3f46',
          red: '#71717a',
          purple: '#27272a',
          darkBg: '#000000',
          darkCard: '#18181b',
          darkBorder: 'rgba(255, 255, 255, 0.1)'
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
