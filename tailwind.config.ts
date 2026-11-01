import type { Config } from "tailwindcss";

export default {
  // lib/ too: the syntax highlighter's token classes live there.
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.ts"],
  theme: {
    extend: {
      colors: {
        // Neutral scale: deep mocha brown (950) up to platinum (50).
        mocha: {
          50: "#f4f3f1",
          100: "#e5e4e2",
          200: "#d6d3cf",
          300: "#c0bcb7",
          400: "#a39b94",
          500: "#8a7e75",
          600: "#6a5a50",
          700: "#4f3f36",
          800: "#3a2d26",
          900: "#2a201b",
          950: "#1b1411",
        },
        // Accent: pale lavender.
        lavender: {
          50: "#f7f5fd",
          100: "#efeafb",
          200: "#e3dbf7",
          300: "#d3c7f1",
          400: "#c4b5ec",
          500: "#a996e0",
          600: "#8c76cf",
          700: "#7059b5",
          800: "#574590",
          900: "#43376e",
          950: "#2a2245",
        },
        platinum: "#e5e4e2",
        silver: "#c0c0c0",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "JetBrains Mono", "Consolas", "monospace"],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px) rotateX(12deg)" },
          to: { opacity: "1", transform: "translateY(0) rotateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) rotateX(6deg) rotateY(-6deg)" },
          "50%": { transform: "translateY(-10px) rotateX(-4deg) rotateY(6deg)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% center" },
          to: { backgroundPosition: "-200% center" },
        },
        "border-spin": {
          to: { "--border-angle": "360deg" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "spin-3d": {
          from: { transform: "rotateX(-24deg) rotateY(0deg)" },
          to: { transform: "rotateX(-24deg) rotateY(360deg)" },
        },
        flow: {
          from: { left: "0%", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          to: { left: "100%", opacity: "0" },
        },
        gauge: {
          from: { strokeDashoffset: "var(--gauge-from)" },
        },
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        bounce3d: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(6px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both",
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
        "border-spin": "border-spin 6s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.2, 0.7, 0.2, 1) infinite",
        "spin-3d": "spin-3d 9s linear infinite",
        flow: "flow 2.8s ease-in-out infinite",
        bounce3d: "bounce3d 1.8s ease-in-out infinite",
        "grow-x": "grow-x 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
