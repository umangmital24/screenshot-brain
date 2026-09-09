import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const fragmentsDir = join(root, 'src', 'fragments')
const srcDir = join(root, 'src')

async function rebuild(prefix, output) {
  const files = (await readdir(fragmentsDir))
    .filter((name) => name.startsWith(prefix))
    .sort()

  if (!files.length) throw new Error(`No fragments found for ${output}`)

  const parts = await Promise.all(
    files.map((name) => readFile(join(fragmentsDir, name), 'utf8')),
  )

  await writeFile(join(srcDir, output), parts.join(''), 'utf8')
  console.log(`Rebuilt ${output} from ${files.length} fragments`)
}

await rebuild('LandingPage.part', 'LandingPage.jsx')
await rebuild('index.part', 'index.css')
