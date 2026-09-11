import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1B2430",
          50: "#F4F5F6",
          100: "#E4E7EA",
          400: "#5B6472",
          700: "#2B3542",
          900: "#1B2430"
        },
        paper: "#F7F5F0",
        seal: {
          DEFAULT: "#8A6D3B",
          light: "#C7A96B",
          dark: "#5F4B26"
        },
        border: "#DCD7CC",
        success: "#2F6F4E",
        danger: "#B3432B"
      },
      fontFamily: {
        // Self-hosted deployments shouldn't have to reach an external font
        // CDN, so this intentionally uses a refined system stack instead of
        // next/font/google: a serif for certificate-facing display text, a
        // clean grotesque for interface/UI text.
        display: ["Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        sans: [
          "-apple-system",
          "Segoe UI",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px"
      }
    }
  },
  plugins: []
};

export default config;
