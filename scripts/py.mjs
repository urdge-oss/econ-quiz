// Runs a Python 3 script: `node scripts/py.mjs <script.py> [args…]`.
// Tries python3, then python, then py: on Windows "python3" is often a Microsoft Store stub.
import { spawnSync } from 'node:child_process'

const cmd = ['python3', 'python', 'py'].find((c) => /^Python 3\./.test(spawnSync(c, ['--version'], { encoding: 'utf8' }).stdout ?? ''))
if (!cmd) {
  console.error('Python 3 not found (tried python3, python, py). Install Python 3.10+.')
  process.exit(1)
}
const r = spawnSync(cmd, process.argv.slice(2), { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
process.exit(r.status ?? 1)
