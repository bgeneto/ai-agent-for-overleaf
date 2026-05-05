const { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } = require('fs');
const { resolve, join } = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const args = process.argv.slice(2);
const isFirefox = args.includes('--firefox');
const isChrome = args.includes('--chrome') || !isFirefox; // Default to Chrome

try {
  const buildDir = resolve(__dirname, 'build');

  // Auto-build if build/ directory doesn't exist
  if (!existsSync(buildDir)) {
    console.log('Build directory not found. Running webpack build...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  const manifest = JSON.parse(
    readFileSync(join(buildDir, 'manifest.json'), 'utf8')
  );
  const { name, version } = manifest;

  // Convert extension name to filename-safe format
  const safeName = name.toLowerCase().replace(/\s+/g, '-');

  const outdir = 'release';
  if (!existsSync(outdir)) {
    mkdirSync(outdir);
  }

  if (isFirefox) {
    // Firefox packaging
    const firefoxManifest = JSON.parse(
      readFileSync(resolve(__dirname, 'public', 'manifest-firefox.json'), 'utf8')
    );
    // Update version from main manifest
    firefoxManifest.version = version;

    const filename = `${safeName}-v${version}-firefox.xpi`;
    const zip = new AdmZip();
    zip.addLocalFolder(buildDir);

    // Replace manifest.json with Firefox version
    zip.deleteFile('manifest.json');
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(firefoxManifest, null, 2)));

    zip.writeZip(`${outdir}/${filename}`);

    console.log(
      `Success! Created ${filename} under ${outdir}/ directory.\n` +
      `You can submit this file to addons.mozilla.org for signing.`
    );
  } else {
    // Chrome/Chromium packaging (default)
    const filename = `${safeName}-v${version}-chrome.zip`;
    const zip = new AdmZip();
    zip.addLocalFolder(buildDir);
    zip.writeZip(`${outdir}/${filename}`);

    console.log(
      `Success! Created ${filename} under ${outdir}/ directory.\n` +
      `You can upload this file to Chrome Web Store or Edge Add-ons.`
    );
  }
} catch (e) {
  console.error('Error! Failed to generate package:', e.message);
  process.exit(1);
}
