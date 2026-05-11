#!/usr/bin/env node
// Phase 14.6 — i18n key-coverage check.
//
// Walks every locale namespace under client/src/i18n/locales/ and asserts
// that every key in the canonical (en) locale has a counterpart in every
// other locale (fr, de, es, zh). Fails with a non-zero exit code on
// missing keys so CI can gate on this signal.
//
// Mode: advisory by default — exits 1 only when --strict is passed (or
// HERM_I18N_STRICT=1 is set). The default exit code is 0 while still
// printing a missing-keys table; this gives the team time to backfill
// translations without blocking unrelated PRs. Switch to strict once
// the gap closes (or once HERM_I18N_STRICT becomes the default in CI).
//
// Selective strict via --locales=fr,de — only fail on these locales'
// missing keys (still prints all). Useful while ramping coverage one
// locale at a time. Phase 14.6 ships fr+de strict; es+zh stay advisory
// pending a coverage push.
//
// Usage:
//   node client/scripts/i18n-coverage.mjs                       (advisory, exit 0)
//   node client/scripts/i18n-coverage.mjs --strict              (exit 1 on any missing)
//   node client/scripts/i18n-coverage.mjs --strict --locales=fr,de
//
// Output table is grouped by locale → namespace → key list so a
// translator can pull from this script's output directly.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCALES_DIR = path.resolve(__dirname, '..', 'src', 'i18n', 'locales');
const CANONICAL = 'en';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flatten(obj, prefix = '') {
  const out = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value, full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function loadLocale(locale) {
  const dir = path.join(LOCALES_DIR, locale);
  if (!fs.existsSync(dir)) return {};
  const namespaces = {};
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const ns = entry.replace(/\.json$/, '');
    namespaces[ns] = flatten(readJson(path.join(dir, entry)));
  }
  return namespaces;
}

function diff(canonicalKeys, otherKeys) {
  const otherSet = new Set(otherKeys);
  return canonicalKeys.filter((k) => !otherSet.has(k));
}

function parseLocaleFilter() {
  const flag = process.argv.find((a) => a.startsWith('--locales='));
  if (!flag) return null;
  const list = flag
    .split('=')[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? new Set(list) : null;
}

function main() {
  const strict = process.argv.includes('--strict') || process.env.HERM_I18N_STRICT === '1';
  const localeFilter = parseLocaleFilter();
  const locales = fs
    .readdirSync(LOCALES_DIR)
    .filter((entry) => fs.statSync(path.join(LOCALES_DIR, entry)).isDirectory())
    .sort();

  if (!locales.includes(CANONICAL)) {
    console.error(`✗ Canonical locale "${CANONICAL}" not found under ${LOCALES_DIR}`);
    process.exit(1);
  }

  const canonical = loadLocale(CANONICAL);
  const otherLocales = locales.filter((l) => l !== CANONICAL);

  let totalMissing = 0;
  let strictMissing = 0;
  const report = [];

  for (const locale of otherLocales) {
    const other = loadLocale(locale);
    const localeMissing = [];
    for (const ns of Object.keys(canonical)) {
      const otherKeys = other[ns] ?? [];
      const missing = diff(canonical[ns], otherKeys);
      if (missing.length > 0) {
        localeMissing.push({ ns, missing });
        totalMissing += missing.length;
        if (!localeFilter || localeFilter.has(locale)) {
          strictMissing += missing.length;
        }
      }
    }
    report.push({ locale, namespaces: localeMissing });
  }

  if (totalMissing === 0) {
    console.log(`✓ i18n coverage clean — every key in "${CANONICAL}" exists in every other locale`);
    process.exit(0);
  }

  console.log(`i18n coverage — ${totalMissing} missing key${totalMissing === 1 ? '' : 's'} across ${otherLocales.length} locales`);
  console.log(`(canonical locale: "${CANONICAL}")\n`);

  for (const { locale, namespaces } of report) {
    if (namespaces.length === 0) {
      console.log(`  ${locale}: ✓`);
      continue;
    }
    const inFilter = !localeFilter || localeFilter.has(locale);
    const localeTotal = namespaces.reduce((acc, n) => acc + n.missing.length, 0);
    console.log(`  ${locale}: ${localeTotal} missing${strict && inFilter ? ' (gating)' : strict ? ' (advisory only)' : ''}`);
    for (const { ns, missing } of namespaces) {
      console.log(`    ${ns}.json — ${missing.length} key${missing.length === 1 ? '' : 's'}:`);
      for (const key of missing) {
        console.log(`      - ${key}`);
      }
    }
    console.log('');
  }

  if (strict && strictMissing > 0) {
    const scope = localeFilter ? `[${[...localeFilter].join(', ')}]` : 'all locales';
    console.error(`✗ i18n coverage strict mode (${scope}): ${strictMissing} missing key${strictMissing === 1 ? '' : 's'} — failing`);
    process.exit(1);
  }
  if (strict) {
    console.log(`✓ i18n coverage strict mode: gated locales clean`);
    process.exit(0);
  }
  console.log(
    `(advisory mode: exit 0. Pass --strict (optionally with --locales=fr,de) to fail CI on missing keys.)`,
  );
  process.exit(0);
}

main();
