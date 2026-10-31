const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
console.log('>>> [RENDER DIAGNOSTIC] Current directory:', process.cwd());
console.log('>>> [RENDER DIAGNOSTIC] Files in root:', fs.readdirSync(process.cwd()));

const distDir = path.resolve(process.cwd(), 'dist');
console.log('>>> [RENDER DIAGNOSTIC] Checking dist at:', distDir);

if (fs.existsSync(distDir)) {
  console.log('>>> [RENDER DIAGNOSTIC] SUCCESS: dist directory exists!');
  console.log('>>> [RENDER DIAGNOSTIC] Files inside dist:', fs.readdirSync(distDir));

  // Mirror to build directory just in case
  const buildDir = path.resolve(process.cwd(), 'build');
  fs.cpSync(distDir, buildDir, { recursive: true });
  console.log('>>> [RENDER DIAGNOSTIC] Mirrored dist to build directory as well.');
} else {
  console.error('>>> [RENDER DIAGNOSTIC] FAIL: dist directory DOES NOT exist at', distDir);
}
console.log('----------------------------------------------------');
