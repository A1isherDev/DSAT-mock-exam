import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // This codebase is mid-migration to stricter TS rules.
      // Keep lint actionable by not failing builds on `any` in app pages.
      "@typescript-eslint/no-explicit-any": "off",

      // Admin/editor pages intentionally touch DOM nodes (highlighting, previews, etc.).
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",

      // Allow apostrophes in JSX text.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
