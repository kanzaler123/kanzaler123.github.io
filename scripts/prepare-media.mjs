import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run prepare:music -- <path-to-source.flac>');
  process.exit(1);
}

await access(source);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(projectRoot, 'public/audio/star-moon-fields.mp3');
await mkdir(dirname(output), { recursive: true });

const result = spawnSync(
  ffmpegPath,
  [
    '-y',
    '-i', source,
    '-vn',
    '-codec:a', 'libmp3lame',
    '-q:a', '2',
    '-map_metadata', '-1',
    '-metadata', 'title=星月原野',
    '-metadata', 'artist=一颗狼星',
    output,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Prepared browser audio: ${output}`);
