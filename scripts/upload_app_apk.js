const fs = require('fs');
const path = require('path');
const { Blob } = require('buffer');

function readHiddenInput(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Run this script from an interactive terminal.'));
      return;
    }

    let value = '';
    const onData = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          input.setRawMode(false);
          input.pause();
          input.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else if (char >= ' ') {
          value += char;
        }
      }
    };

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const apkPath = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(apkPath) || path.extname(apkPath).toLowerCase() !== '.apk') {
    throw new Error('Usage: node scripts/upload_app_apk.js /path/to/signed-app.apk');
  }

  const backendUrl = (process.env.APP_BACKEND_URL || 'https://smartgrowup.com').replace(/\/$/, '');
  const adminToken = await readHiddenInput('Admin session token (hidden): ');
  if (!adminToken) throw new Error('Admin session token is required.');

  const bytes = await fs.promises.readFile(apkPath);
  const form = new FormData();
  form.append('apk', new Blob([bytes], { type: 'application/vnd.android.package-archive' }), path.basename(apkPath));

  const response = await fetch(`${backendUrl}/api/admin/app-apk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody.error || `Upload failed (HTTP ${response.status}).`);
  }

  console.log(responseBody.message || 'APK uploaded successfully.');
  console.log(`Download page: ${backendUrl}/download/REFERRAL_CODE`);
}

main().catch((error) => {
  console.error(error.message || 'Unable to upload APK.');
  process.exitCode = 1;
});
