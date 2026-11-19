#!/usr/bin/env node
/*
  sync-layout.mjs — copies the shared header, footer and <head> tags into every page.

  You only need this if you change the menu, header or footer (rare).
  Edit the files in tools/partials/, then run from the website folder:

      node tools/sync-layout.mjs

  Each page marks where the shared parts go with comments like
  <!-- LAYOUT:HEADER START --> ... <!-- LAYOUT:HEADER END -->.
  Everything between those markers is replaced; nothing else is touched.
  No packages to install — it uses only what comes with Node.
*/
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://www.legionpost432.com/";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const part = (n) => readFileSync(join(root, "tools", "partials", n + ".html"), "utf8").trim();
const head = part("head"), header = part("header"), footer = part("footer");

const esc = (s) => s.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, "&amp;").replace(/"/g, "&quot;");
const block = (html, name, inner) => {
  const re = new RegExp(`(<!-- LAYOUT:${name} START -->)[\\s\\S]*?(<!-- LAYOUT:${name} END -->)`);
  if (!re.test(html)) return null;
  return html.replace(re, `$1\n${inner}\n$2`);
};

let count = 0;
for (const file of readdirSync(root).filter((f) => f.endsWith(".html"))) {
  let html = readFileSync(join(root, file), "utf8");
  if (!html.includes("<!-- LAYOUT:HEADER START -->")) continue; // e.g. redirect pages

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || "American Legion Post 432";
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const url = SITE + (file === "index.html" ? "" : file);
  const ogTitle = title.split(" | ")[0];
  const pageHead = [
    head,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    desc ? `<meta property="og:description" content="${desc}">` : "",
  ].filter(Boolean).join("\n");

  // Mark the current page in the menus.
  const mark = (h) => h.replace(new RegExp(`href="${file.replace(".", "\\.")}"(?![^>]*aria-current)`, "g"), `href="${file}" aria-current="page"`);

  html = block(html, "HEAD", pageHead) ?? html;
  html = block(html, "HEADER", mark(header)) ?? html;
  html = block(html, "FOOTER", footer) ?? html;
  writeFileSync(join(root, file), html);
  count++;
}
console.log(`Updated layout on ${count} pages.`);
