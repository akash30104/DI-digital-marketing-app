const fs = require('fs');
const path = require('path');

console.log('----------------------------------------------------');
const cwd = process.cwd();
console.log('>>> [RENDER DIAGNOSTIC] Current directory:', cwd);
console.log('>>> [RENDER DIAGNOSTIC] Files in root:', fs.readdirSync(cwd));

const distDir = path.resolve(cwd, 'dist');
console.log('>>> [RENDER DIAGNOSTIC] Checking dist at:', distDir);

if (fs.existsSync(distDir)) {
  console.log('>>> [RENDER DIAGNOSTIC] SUCCESS: dist directory exists!');
  console.log('>>> [RENDER DIAGNOSTIC] Files inside dist:', fs.readdirSync(distDir));

  // Mirror 1: ./build
  try {
    const buildDir = path.resolve(cwd, 'build');
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
    fs.cpSync(distDir, buildDir, { recursive: true });
    console.log('>>> [RENDER DIAGNOSTIC] Mirrored to: ./build');
  } catch (e) {
    console.log('>>> [RENDER DIAGNOSTIC] Could not copy to ./build:', e.message);
  }

  // Mirror 2: ../dist (in case Render checks /opt/render/project/dist)
  try {
    const parentDist = path.resolve(cwd, '..', 'dist');
    if (fs.existsSync(parentDist)) {
      fs.rmSync(parentDist, { recursive: true, force: true });
    }
    fs.cpSync(distDir, parentDist, { recursive: true });
    console.log('>>> [RENDER DIAGNOSTIC] Mirrored to parent: ../dist');
  } catch (e) {
    console.log('>>> [RENDER DIAGNOSTIC] Could not copy to ../dist:', e.message);
  }

  // Mirror 3: ../build (in case Render checks /opt/render/project/build)
  try {
    const parentBuild = path.resolve(cwd, '..', 'build');
    if (fs.existsSync(parentBuild)) {
      fs.rmSync(parentBuild, { recursive: true, force: true });
    }
    fs.cpSync(distDir, parentBuild, { recursive: true });
    console.log('>>> [RENDER DIAGNOSTIC] Mirrored to parent: ../build');
  } catch (e) {
    console.log('>>> [RENDER DIAGNOSTIC] Could not copy to ../build:', e.message);
  }

  // Mirror 4: ./src/dist (in case Render checks src/dist)
  try {
    const srcDist = path.resolve(cwd, 'src', 'dist');
    if (fs.existsSync(srcDist)) {
      fs.rmSync(srcDist, { recursive: true, force: true });
    }
    fs.cpSync(distDir, srcDist, { recursive: true });
    console.log('>>> [RENDER DIAGNOSTIC] Mirrored to: ./src/dist');
  } catch (e) {
    console.log('>>> [RENDER DIAGNOSTIC] Could not copy to ./src/dist:', e.message);
  }
} else {
  console.error('>>> [RENDER DIAGNOSTIC] FAIL: dist directory DOES NOT exist at', distDir);
}
console.log('----------------------------------------------------');
