// Runs content/tools/build_bank.py and copies the result into public/data/.
// Tries python3, then python, then py: on Windows "python3" is often a Microsoft Store stub.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'

const script = 'content/tools/build_bank.py'
let ok = false
for (const cmd of ['python3', 'python', 'py']) {
  const r = spawnSync(cmd, [script], { encoding: 'utf8' })
  if (r.error || !/^(OK|ERRORS):/m.test(r.stdout ?? '')) continue // not a working Python
  process.stdout.write(r.stdout)
  process.stderr.write(r.stderr)
  if (r.status !== 0) process.exit(r.status ?? 1)
  ok = true
  break
}
if (!ok) {
  console.error('Python 3 not found (tried python3, python, py). Install Python 3.10+.')
  process.exit(1)
}
mkdirSync('public/data', { recursive: true })
copyFileSync('content/out/questions.json', 'public/data/questions.json')
copyFileSync('content/out/questions_preview.md', 'questions_preview.md')
console.log('Copied to public/data/questions.json and questions_preview.md')
