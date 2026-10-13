// Screenshots every requested view at the five widths in both themes into one folder.
//
//   node visual/scripts/matrix.mjs <outDir> [viewId ...]
//
// The harness must be running (`bunx vite --config visual/vite.config.ts`). With no view ids, every
// view in fixtures/views.ts is shot. Each line it prints reports horizontal overflow and console errors.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const [out, ...requested] = process.argv.slice(2);
if (!out) throw new Error("usage: node visual/scripts/matrix.mjs <outDir> [viewId ...]");
mkdirSync(out, { recursive: true });

const source = readFileSync(join(here, "../fixtures/views.ts"), "utf8");
const all = [...source.matchAll(/^\s+"?([\w-]+)"?:\s*\{\s*path:/gm)].map((m) => m[1]);
const views = requested.length ? requested : all;
const widths = [
  [320, 700],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 900],
];
for (const view of views) {
  for (const theme of ["light", "dark"]) {
    for (const [width, height] of widths) {
      const file = join(out, `${view}-${theme}-${width}.png`);
      const flags = ["--full", "--wait=4500", ...(theme === "dark" ? ["--dark"] : [])];
      const url = `http://127.0.0.1:5188/?view=${view}&theme=${theme}`;
      const run = () =>
        execFileSync(
          "node",
          [join(here, "shoot.mjs"), url, file, String(width), String(height), ...flags],
          { encoding: "utf8" },
        );
      // A capture can time out when the machine is busy; one retry keeps a long run from stopping.
      let result;
      try {
        result = run();
      } catch {
        result = run();
      }
      const layout =
        /layout \(full height\): (\{.*\})/.exec(result)?.[1] ??
        /layout: (\{.*\})/.exec(result)?.[1] ??
        "{}";
      const info = JSON.parse(layout);
      const consoleLine = /console: (.*)/.exec(result)?.[1];
      console.log(
        `${view} ${theme} ${width}: overflow=${info.overflowX} ${info.offenders?.length ? `offenders=${info.offenders.join(",")}` : ""}${consoleLine ? ` console=${consoleLine.slice(0, 120)}` : ""}`,
      );
    }
  }
}
