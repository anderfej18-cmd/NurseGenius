// The visual-QA harness: a separate Vite app that renders the real route tree and the real components
// with a stub Supabase client and typed fixtures in place of every server function. It exists only to be
// screenshotted (see README.md). Nothing under src/ may import it, and its data never reaches a build.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "..");

/**
 * Replaces every `@/functions/<name>.functions` module with one exporting the same names, each answering
 * from the fixtures. The names come from the real file, so a renamed function breaks the harness loudly.
 */
function fakeServerFunctions(): Plugin {
  const prefix = "\0fake-functions:";
  return {
    name: "fake-server-functions",
    enforce: "pre",
    resolveId(source) {
      // The `@/` alias may already have turned the specifier into an absolute path.
      const match = /(?:^@\/functions\/|\/src\/functions\/)([\w-]+)\.functions$/.exec(source);
      return match ? `${prefix}${match[1]}` : null;
    },
    load(id) {
      if (!id.startsWith(prefix)) return null;
      const name = id.slice(prefix.length);
      const source = readFileSync(join(root, "src/functions", `${name}.functions.ts`), "utf8");
      const exported = [...source.matchAll(/export const (\w+) = createServerFn/g)].map(
        (m) => m[1],
      );
      return exported
        .map(
          (fn) =>
            `export const ${fn} = (input) => globalThis.__harnessCall(${JSON.stringify(fn)}, input?.data);`,
        )
        .join("\n");
    },
  };
}

export default defineConfig({
  root: here,
  publicDir: join(root, "public"),
  plugins: [fakeServerFunctions(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@tanstack\/react-start$/, replacement: join(here, "fakes/react-start.ts") },
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: join(here, "fakes/supabase-client.ts"),
      },
      { find: /^@\//, replacement: `${join(root, "src")}/` },
    ],
  },
  server: { host: "127.0.0.1", port: 5188, strictPort: true, fs: { allow: [root] } },
  cacheDir: join(root, "node_modules/.vite-visual"),
});
