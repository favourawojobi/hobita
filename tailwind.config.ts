import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F7F1E7",
        sand: "#EFE5D6",
        ink: "#132A22",
        forest: "#123C2E",
        moss: "#2E6B52",
        sage: "#8FB3A1",
        gold: "#E0A84C",
        coral: "#D97757",
      },
      boxShadow: {
        soft: "0 18px 50px -24px rgba(18, 60, 46, 0.35)",
        lift: "0 10px 30px -18px rgba(18, 60, 46, 0.45)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
