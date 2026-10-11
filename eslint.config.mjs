import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import jsx from "eslint-plugin-jsx-a11y";
import globals from "globals";
export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    files: ["**/*.{ts,tsx,mjs}"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "jsx-a11y": jsx },
    rules: {
      ...hooks.configs.recommended.rules,
      ...jsx.configs.recommended.rules,
    },
  },
);
