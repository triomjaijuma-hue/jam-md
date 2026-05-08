// JAM-MD Startup Wrapper
// Uses ONLY built-in Node.js modules — no npm packages needed
// Installs all dependencies first, then launches the bot

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║        JAM-MD Startup Wrapper         ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

// Step 1: Install all dependencies from package.json
console.log('📦 Installing dependencies...');
try {
  execSync('npm install --no-audit --no-fund --legacy-peer-deps', {
    stdio: 'inherit',
    timeout: 300000
  });
  console.log('✅ All dependencies installed successfully!');
} catch (err) {
  console.warn('⚠️  npm install encountered issues, attempting to start anyway...');
}

console.log('');
console.log('🚀 Starting JAM-MD bot...');
console.log('');

// Step 2: Launch the actual bot (dynamic import so it runs AFTER npm install)
try {
  await import('./index.js');
} catch (err) {
  console.error('❌ Failed to start bot:', err.message);
  console.error(err.stack);
  process.exit(1);
}
