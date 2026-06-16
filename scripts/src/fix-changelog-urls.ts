#!/usr/bin/env node
// fallow-ignore-file unused-file
import fs from 'node:fs';
import path from 'node:path';

const packagesDir = 'packages';
const files = fs.readdirSync(packagesDir);

for (const file of files) {
  const filePath = path.join(packagesDir, file, 'CHANGELOG.md');
  const normalizedPath = path.normalize(filePath);

  // Validate path stays within packagesDir to prevent path traversal
  if (!normalizedPath.startsWith(path.normalize(packagesDir))) {
    console.error(`Invalid path: ${filePath} escaped allowed directory`);
    continue;
  }

  if (fs.existsSync(filePath) && !file.startsWith('.')) {
    // nosemgrep: typescript.lang.security.detect-non-literal-fs-filename -- path is from fs.readdirSync of own packages dir, not user input
    let content = fs.readFileSync(filePath, 'utf-8');
    // Add angle brackets around GitHub URLs in commit references
    content = content.replaceAll(
      /by @selfagency in (https:\/\/github\.com\/selfagency\/agentsy\/pull\/\d+)/gu,
      'by @selfagency in <$1>'
    );
    fs.writeFileSync(filePath, content);
  }
}
