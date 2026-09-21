/** @type {import('tailwindcss').Config} */
// Tokens live in src/styles/globals.css (single source of truth); this file only
// mirrors them into utility names so components can use Tailwind classes.
// Palette = EDURA brand kit v2 (turquoise / terracotta / sand / graphite).
module.exports = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
    // the static preview harness renders the real components, so its sources
    // must be scanned too or their utility classes get tree-shaken away
    "./src/preview/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        deep: { DEFAULT: "#17434A", 700: "#1F545C", 900: "#0E2E33" },
        brand: { DEFAULT: "#3F9DA5", strong: "#2A6E75", light: "#7FC4CA", tint: "#DFEEEF" },
        accent: { DEFAULT: "#BF6743", strong: "#9E5231", hover: "#8A4629", tint: "#F8E9E1" },
        sand: { DEFAULT: "#D7C097", tint: "#F3EADA" },
        ink: { DEFAULT: "#33383A", soft: "#4A5254", mute: "#666E70" },
        surface: { DEFAULT: "#FFFFFF", warm: "#FBF8F2", line: "#E7DFD2", strong: "#8B8375" },
        ok: "#2E7D5B",
        warn: "#8A5410",
        danger: "#B4392C",
        gold: "#A8813C",
      },
      fontFamily: {
        // --font-* are set per locale on <html> by the locale layout
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
      },
      borderRadius: { card: "14px", field: "10px" },
      boxShadow: {
        card: "0 1px 2px rgba(23,67,74,.04), 0 8px 24px -12px rgba(23,67,74,.16)",
        lift: "0 2px 4px rgba(23,67,74,.06), 0 18px 40px -18px rgba(23,67,74,.24)",
      },
      maxWidth: { shell: "1180px" },
      transitionTimingFunction: { out: "cubic-bezier(.2,.7,.3,1)" },
    },
  },
  plugins: [],
};
