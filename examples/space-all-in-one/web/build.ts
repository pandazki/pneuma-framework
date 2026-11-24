// Builds the owner page's client into web/dist (not committed):
//   app.js   the views and Beautiful UI's components, with React, bundled by Bun
//   app.css  Tailwind v4 over Beautiful UI's foundation and the classes the views use
//   fonts/   Inter and JetBrains Mono (latin and latin-ext; other scripts use the system's fonts), OFL
// Run by the Host's image build and by `bun run dev:page`; `bun run build:page` by hand. Nothing is fetched at
// run time: the page works on a machine with no network.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const WEB = import.meta.dir;
const OUT = join(WEB, "dist");

export async function buildPage(options: { quiet?: boolean } = {}): Promise<void> {
  const say = (line: string) => options.quiet || console.log(`[page] ${line}`);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "fonts"), { recursive: true });

  const js = await Bun.build({
    entrypoints: [join(WEB, "src", "main.tsx")],
    outdir: OUT,
    naming: "app.js",
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!js.success) throw new Error(`the page's script did not build:\n${js.logs.map(String).join("\n")}`);
  writeFileSync(join(OUT, "app.js"), `${SCRIPT_NOTICE}\n${readFileSync(join(OUT, "app.js"), "utf8")}`);

  const require = createRequire(join(WEB, "..", "package.json"));
  const cli = join(dirname(require.resolve("@tailwindcss/cli/package.json")), "dist", "index.mjs");
  const css = Bun.spawnSync([process.execPath, cli, "--input", join(WEB, "app.css"), "--output", join(OUT, "app.css"), "--minify"], { cwd: WEB, stderr: "pipe", stdout: "pipe" });
  if (css.exitCode !== 0) throw new Error(`the page's stylesheet did not build:\n${css.stderr.toString()}`);

  const fonts: [pkg: string, family: string, file: string, range: string][] = [];
  for (const [pkg, family, stem] of [
    ["@fontsource-variable/inter", "Inter Variable", "inter"],
    ["@fontsource-variable/jetbrains-mono", "JetBrains Mono Variable", "jetbrains-mono"],
  ] as const) {
    const dir = dirname(require.resolve(`${pkg}/package.json`));
    for (const [subset, range] of [
      ["latin", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"],
      ["latin-ext", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"],
    ] as const) {
      const file = `${stem}-${subset}-wght-normal.woff2`;
      copyFileSync(join(dir, "files", file), join(OUT, "fonts", file));
      fonts.push([pkg, family, file, range]);
    }
    copyFileSync(join(dir, "LICENSE"), join(OUT, "fonts", `${stem}.LICENSE.txt`));
  }
  const faces = fonts
    .map(([, family, file, range]) => `@font-face{font-family:"${family}";font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/fonts/${file}) format("woff2");unicode-range:${range}}`)
    .join("");
  // The foundation's @theme reads --font-inter and --font-mono-face, which next/font sets on the library's site.
  writeFileSync(join(OUT, "app.css"), `${STYLE_NOTICE}\n${faces}:root{--font-inter:"Inter Variable";--font-mono-face:"JetBrains Mono Variable"}${readFileSync(join(OUT, "app.css"), "utf8")}`);
  say(`built ${OUT}: app.js ${kb(join(OUT, "app.js"))}, app.css ${kb(join(OUT, "app.css"))}`);
}

// The minifier drops comments, so the notices the licences ask for are put back at the top of each file.
const MIT =
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";
const BEAUTIFUL_UI = "Beautiful UI (https://www.beautifului.dev), adapted: Copyright (c) 2026 Shane Levine, MIT License.";
const SCRIPT_NOTICE = `/*! ${[
  BEAUTIFUL_UI,
  "React, React DOM and scheduler: Copyright (c) Meta Platforms, Inc. and affiliates, MIT License.",
  "clsx: Copyright (c) Luke Edwards, MIT License.",
  "class-variance-authority: Copyright 2022 Joe Bell, Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).",
  `MIT License: ${MIT}`,
].join("\n")} */`;
const STYLE_NOTICE = `/*! ${BEAUTIFUL_UI}\nInter and JetBrains Mono: SIL Open Font License 1.1, see fonts/*.LICENSE.txt.\nMIT License: ${MIT} */`;

function kb(file: string): string {
  return `${(readFileSync(file).length / 1024).toFixed(0)} KB`;
}

if (import.meta.main) await buildPage();
