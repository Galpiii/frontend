import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const apiBase =
  "import.meta.env = { VITE_API_BASE_URL: 'https://backend.example.test' };\n"

/**
 * Transpiles `src/` modules (paths without extension, e.g.
 * `features/auth/session`) into a temporary directory with the same layout,
 * and returns `load(...names)`, which imports them and merges their exports in
 * order. A module's relative imports of other listed modules must spell the
 * `.ts` extension, which is rewritten to the transpiled `.mjs`.
 */
export async function loadSources(t, files) {
  const dir = await mkdtemp(join(tmpdir(), 'galpi-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const file of files) {
    const target = join(dir, `${file}.mjs`)
    await mkdir(dirname(target), { recursive: true })
    const source = await readFile(
      new URL(`../../src/${file}.ts`, import.meta.url),
      'utf8',
    )
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
      },
    })
    await writeFile(
      target,
      (file === 'lib/api' ? apiBase : '') +
        outputText.replaceAll(".ts'", ".mjs'"),
    )
  }
  return async (...names) => {
    const modules = []
    for (const name of names)
      modules.push(await import(pathToFileURL(join(dir, `${name}.mjs`)).href))
    return Object.assign({}, ...modules)
  }
}
