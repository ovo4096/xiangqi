import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const output = path.resolve('release');
const files = (await readdir(output)).filter((name) => name.endsWith('.exe')).sort();
if (!files.length) throw new Error('No release executables found. Run electron:dist first.');
const hashes = [];
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path.join(output, name))) hash.update(chunk);
  hashes.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(path.join(output, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(`SHA256SUMS.txt generated for ${files.length} executables.`);
