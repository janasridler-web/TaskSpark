/**
 * setup.js — Regenerates src/main.js from src/main.template.js
 *
 * Reads credentials from a local .env file and injects them into the
 * template, producing the src/main.js that Electron loads at runtime.
 *
 * Run manually:  node setup.js
 * Runs automatically before: npm start
 *
 * .env format:
 *   GOOGLE_CLIENT_ID=your_google_client_id
 *   GOOGLE_CLIENT_SECRET=your_google_client_secret
 *   OUTLOOK_CLIENT_ID=your_outlook_client_id        (optional)
 *   OUTLOOK_CLIENT_SECRET=your_outlook_client_secret (optional)
 */

const fs   = require('fs');
const path = require('path');

const envPath      = path.join(__dirname, '.env');
const templatePath = path.join(__dirname, 'src', 'main.template.js');
const outPath      = path.join(__dirname, 'src', 'main.js');

// Parse .env file
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return acc;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      acc[key] = val;
      return acc;
    }, {});
}

const env = parseEnv(envPath);

const googleId     = env.GOOGLE_CLIENT_ID     || '';
const googleSecret = env.GOOGLE_CLIENT_SECRET || '';
const outlookId    = env.OUTLOOK_CLIENT_ID    || '';
const outlookSecret= env.OUTLOOK_CLIENT_SECRET|| '';

if (!googleId || !googleSecret) {
  console.error('\n⚠  Missing credentials in .env');
  console.error('   Copy .env.example to .env and fill in your values.\n');
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');

const output = template
  .replace("'__APP_CLIENT_ID__'",       `'${googleId}'`)
  .replace("'__APP_CLIENT_SECRET__'",   `'${googleSecret}'`)
  .replace("'__OUTLOOK_CLIENT_ID__'",   `'${outlookId}'`)
  .replace("'__OUTLOOK_CLIENT_SECRET__'",`'${outlookSecret}'`);

fs.writeFileSync(outPath, output);
console.log('✓ src/main.js generated from template');
