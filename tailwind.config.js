/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        khmer: ['Battambang', 'Khmer OS Battambang', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
