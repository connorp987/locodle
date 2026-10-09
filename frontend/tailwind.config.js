/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Schibsted Grotesk Variable"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      colors: {
        // Chart ink: text, primary actions
        ink: {
          DEFAULT: "#172A36",
          soft: "#4A5D69",
          faint: "#8A99A3",
        },
        // Ocean teal accent
        primary: {
          50: "#EEF7F8",
          100: "#D5ECEF",
          200: "#AEDAE0",
          300: "#7BC1CB",
          400: "#45A1AF",
          500: "#23848F",
          600: "#186B77",
          700: "#175762",
          800: "#184851",
          900: "#173C44",
        },
        // Distance feedback scale, closest to farthest
        heat: {
          found: "#16A34A",
          fire: "#E0362C",
          hot: "#F2711C",
          warm: "#E8A317",
          chilly: "#4BA3D9",
          cold: "#2F6BC4",
          freezing: "#4B3FA8",
        },
      },
      boxShadow: {
        float: "0 1px 2px rgba(23,42,54,0.08), 0 8px 24px -6px rgba(23,42,54,0.25)",
      },
    },
  },
  plugins: [],
};
