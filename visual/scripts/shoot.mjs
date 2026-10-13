// Minimal Chrome DevTools Protocol driver (no dependencies, Node 22+ and a local Google Chrome):
// emulate a device, optionally reduced motion and a colour scheme, load a URL, report horizontal
// overflow and console errors, and save a screenshot (viewport or the whole page).
//
//   node visual/scripts/shoot.mjs <url> <out.png> <width> <height> [flags]
//   flags: --full  --dark  --reduced  --scroll=<px>  --wait=<ms>  --eval=<js expression to run first>
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, w, h, ...flags] = process.argv.slice(2);
const has = (f) => flags.includes(f);
const val = (name, d) =>
  (flags.find((f) => f.startsWith(`--${name}=`)) ?? "").slice(name.length + 3) || d;
const width = Number(w),
  height = Number(h);
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "--window-size=1200,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = () => {
  try {
    chrome.kill("SIGKILL");
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
};
const timer = setTimeout(() => {
  console.log("timeout");
  kill();
  process.exit(2);
}, 70000);

try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.length) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type))
      logs.push(
        `${msg.params.type}: ${msg.params.args
          .map((a) => a.value ?? a.description ?? "")
          .join(" ")
          .slice(0, 900)}`,
      );
    if (msg.method === "Runtime.exceptionThrown")
      logs.push(
        `exception: ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description?.slice(0, 300) ?? ""}`,
      );
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  const features = [];
  if (has("--reduced")) features.push({ name: "prefers-reduced-motion", value: "reduce" });
  features.push({ name: "prefers-color-scheme", value: has("--dark") ? "dark" : "light" });
  await send("Emulation.setEmulatedMedia", { features });
  // Keep every console.error with its arguments, so a warning's detail can be read with --eval=window.__errs
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "(()=>{const o=console.error;window.__errs=[];console.error=(...a)=>{window.__errs.push(a.map(String).join(' ').slice(0,500));o(...a)}})()",
  });
  await send("Page.navigate", { url });
  await sleep(Number(val("wait", "3500")));
  const scroll = Number(val("scroll", "0"));
  if (scroll) {
    await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${scroll})` });
    await sleep(900);
  }
  const ev = val("eval", "");
  if (ev) {
    const r = await send("Runtime.evaluate", {
      expression: ev,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log("eval:", JSON.stringify(r.result?.result?.value ?? r.result));
  }
  const measure = () =>
    send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => { const de = document.documentElement; const wide = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > innerWidth + 1) wide.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,3).join('.') : '')); } return { innerWidth, scrollWidth: de.scrollWidth, docHeight: de.scrollHeight, overflowX: de.scrollWidth > innerWidth + 1, offenders: [...new Set(wide)].slice(0, 8), theme: de.className + ' ' + (de.dataset.theme||'') }; })()`,
    });
  let m = await measure();
  console.log("layout:", JSON.stringify(m.result.result.value));
  let clip;
  if (has("--full")) {
    const full = m.result.result.value.docHeight;
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: Math.min(full, 16000),
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await sleep(900);
    // The page can lay out differently at full height (charts re-measure), so measure again.
    m = await measure();
    console.log("layout (full height):", JSON.stringify(m.result.result.value));
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  // The harness renders the root route's document shell (an <html> element) inside #root, which React
  // reports once; it is an artifact of the harness, not of the app, so it is not shown.
  const real = logs;
  if (real.length) console.log("console:", real.slice(0, 6).join(" | "));
  console.log("saved", out);
  ws.close();
} catch (e) {
  console.log("failed", e?.message ?? e);
}
clearTimeout(timer);
kill();
process.exit(0);
