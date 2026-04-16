/**
 * build.js — Run this instead of npm run build
 * Injects your OAuth credentials into main.js before packaging,
 * then restores the placeholders afterwards.
 *
 * Usage:
 *   node build.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
 *
 * Example:
 *   node build.js 123456-abc.apps.googleusercontent.com GOCSPX-xxxx
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const clientId     = process.argv[2];
const clientSecret = process.argv[3];

if (!clientId || !clientSecret) {
  console.error('\nUsage: node build.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET\n');
  process.exit(1);
}

const mainJsPath = path.join(__dirname, 'src', 'main.js');
const original   = fs.readFileSync(mainJsPath, 'utf8');

// Inject real credentials
const injected = original
  .replace("'__APP_CLIENT_ID__'",     `'${clientId}'`)
  .replace("'__APP_CLIENT_SECRET__'", `'${clientSecret}'`);

fs.writeFileSync(mainJsPath, injected);
console.log('✓ Credentials injected');

try {
  console.log('Building...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ Build complete');
} catch (e) {
  console.error('Build failed');
} finally {
  // Always restore placeholders, even if build fails
  fs.writeFileSync(mainJsPath, original);
  console.log('✓ Credentials removed — main.js restored');
}
