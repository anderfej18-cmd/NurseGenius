import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Frontend/backend boundary: UI code may only reach server code through client-safe
    // `*.functions.ts` modules in src/functions/ (see AGENTS.md). Privileged helpers stay server-side.
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    ignores: ["src/routes/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
            {
              name: "@/integrations/supabase/client.server",
              message: "The service-role client is backend-only. Use it from src/server/ or server routes.",
            },
            {
              name: "@/integrations/supabase/auth-middleware",
              message: "Server auth middleware is backend-only. Import it from src/server/ code.",
            },
          ],
          patterns: [
            {
              group: ["@/server/**"],
              message:
                "src/server/ is backend-only (TanStack import protection also denies it in client builds). Call server code through a `*.functions.ts` module in src/functions/.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
