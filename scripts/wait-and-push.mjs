import { spawnSync } from 'node:child_process'

const maxWaitMs = 300_000
const intervalMs = 5_000
const start = Date.now()

function cli(args) {
  return spawnSync('npx', ['supabase@latest', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
  })
}

function isAuthed() {
  const check = cli(['projects', 'list'])
  return check.status === 0 && !/Access token not provided|LegacyPlatformAuthRequiredError/i.test(`${check.stdout}${check.stderr}`)
}

console.log('Waiting for Supabase CLI auth (up to 5 min)...')
while (Date.now() - start < maxWaitMs) {
  if (isAuthed()) {
    console.log('CLI authenticated.')
    break
  }
  process.stdout.write('.')
  await new Promise((r) => setTimeout(r, intervalMs))
}
console.log('')

if (!isAuthed()) {
  console.error('Timed out. In terminal 5: press Enter at login prompt, finish browser auth.')
  process.exit(1)
}

function run(args) {
  const result = cli(args)
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['link', '--project-ref', 'zhcedsmvpvpaqezbdiiy', '--yes'])
run(['db', 'push', '--linked', '--yes'])
console.log('Migrations pushed successfully.')
