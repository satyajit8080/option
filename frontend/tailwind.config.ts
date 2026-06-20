import type { Config } from "tailwindcss";

// --- "Amber Terminal" design tokens -----------------------------------------
// A deliberate departure from the generic "near-black + neon green" trading
// dashboard look: deep navy-charcoal surfaces, a warm amber/gold brand accent
// (closer to a Bloomberg-terminal heritage than a crypto-app one), and a
// desaturated teal/coral pair for CE/PE instead of pure red/green — easier on
// the eyes across a full trading session and still instantly scannable.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0A0D13",
          raised: "#10141D",
        },
        surface: {
          DEFAULT: "#131826",
          2: "#181E2E",
          border: "#242B3D",
        },
        text: {
          primary: "#E8EAF0",
          muted: "#8B92A8",
          faint: "#565D72",
        },
        accent: {
          DEFAULT: "#D4A24E",
          soft: "#D4A24E1F",
          strong: "#E8B864",
        },
        bullish: {
          DEFAULT: "#2DD4A7",
          soft: "#2DD4A71A",
        },
        bearish: {
          DEFAULT: "#F2607D",
          soft: "#F2607D1A",
        },
        warn: {
          DEFAULT: "#E8B339",
          soft: "#E8B3391A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.5)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
