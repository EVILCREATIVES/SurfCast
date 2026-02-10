import { build } from "esbuild";
import { readFile } from "fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf-8"));
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// Bundle these into the function to reduce cold start
const allowlist = [
  "connect-pg-simple",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-session",
  "memorystore",
  "nanoid",
  "openai",
  "p-limit",
  "p-retry",
  "passport",
  "passport-local",
  "pg",
  "zod",
];

const externals = allDeps.filter((dep) => !allowlist.includes(dep));

console.log("building api/index.js for Vercel...");

await build({
  entryPoints: ["server/vercel-entry.ts"],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: "api/index.js",
  alias: {
    "@shared": "./shared",
    "@": "./client/src",
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: true,
  external: externals,
  logLevel: "info",
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log("api/index.js built successfully");
