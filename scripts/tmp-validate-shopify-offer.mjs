import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const skillRoot =
  'C:\\Users\\DELL\\.cursor\\plugins\\cache\\cursor-public\\shopify-plugin\\c164cf45c4bc1d17bbc105168d99a4f744cfaac2\\skills\\shopify-liquid'
const files = [
  {
    path: path.join(
      process.cwd(),
      'scripts',
      'tmp-live-main',
      'sections__lurvox-client-login.liquid'
    ),
    filename: 'lurvox-client-login.liquid',
    artifact: 'lurvox-client-login-welcome',
  },
  {
    path: path.join(
      process.cwd(),
      'scripts',
      'tmp-live-main',
      'sections__lurvox-offer-home.liquid'
    ),
    filename: 'lurvox-offer-home.liquid',
    artifact: 'lurvox-offer-home-welcome',
  },
]

for (const file of files) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(skillRoot, 'scripts', 'validate.mjs'),
      '--filename',
      file.filename,
      '--filetype',
      'sections',
      '--code',
      fs.readFileSync(file.path, 'utf8'),
      '--model',
      'gpt-5.6',
      '--client-name',
      'cursor',
      '--client-version',
      '1',
      '--artifact-id',
      file.artifact,
      '--revision',
      '1',
    ],
    { cwd: skillRoot, encoding: 'utf8' }
  )
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.status !== 0) process.exit(result.status || 1)
}
