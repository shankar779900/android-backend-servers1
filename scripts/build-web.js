const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');

execFileSync('npx', ['expo', 'export', '--platform', 'web'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

const copyIfExists = (source, destination) => {
  if (!fs.existsSync(source)) {
    throw new Error(`Required PWA asset is missing: ${path.relative(projectRoot, source)}`);
  }
  fs.copyFileSync(source, destination);
};

copyIfExists(
  path.join(projectRoot, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'),
  path.join(outputDirectory, 'pwa-icon-192.png'),
);
copyIfExists(
  path.join(projectRoot, 'assets/icon_reference.png'),
  path.join(outputDirectory, 'pwa-icon-512.png'),
);
copyIfExists(
  path.join(projectRoot, 'assets/icon_reference.png'),
  path.join(outputDirectory, 'apple-touch-icon.png'),
);

const htmlPath = path.join(outputDirectory, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const installMetadata = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Upward">',
  '<meta name="mobile-web-app-capable" content="yes">',
].join('\n');

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${installMetadata}\n</head>`);
  fs.writeFileSync(htmlPath, html);
}

console.log('Prepared installable web app in dist/.');
