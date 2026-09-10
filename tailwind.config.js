/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        main: 'var(--main-color)',
        accent: 'var(--accent-color)'
      },
      fontFamily: {
        serif: ['"Noto Serif JP"', 'serif'],
        sans: ['"Inter"', '"Noto Sans JP"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
