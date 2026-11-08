import { _electron as electron } from 'playwright-core'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shotsDir = process.env.LEAFMARK_SHOT_DIR ?? path.join(os.tmpdir(), 'leafmark-shots')

const CONFIG = {
  schemaVersion: 1,
  scan: {
    recursive: true,
    extensions: ['.md'],
    followSymlinks: false,
    ignoreGlobs: ['.git/**', 'node_modules/**', 'attachments/**']
  },
  categories: {
    '00': { name: '未分类', children: { '00': '未分类' } },
    '01': { name: '科研', children: { '01': '论文阅读', '02': '实验记录' } },
    '02': { name: '课程', children: { '01': '课程笔记' } }
  },
  pinnedTags: ['LLM', 'CUDA'],
  behavior: { confirmBeforeRename: true, warnAboutLinks: true }
}

const FILES = {
  '.leafmark.json': `${JSON.stringify(CONFIG, null, 2)}\n`,
  '000000_临时记录.md': '# 临时记录\n',
  '010100_[论文][稀疏]_SpInfer阅读笔记.md': '# SpInfer\n',
  '010101_[论文][SpMM]_FlexSemi实验记录.md': '# FlexSemi\n',
  '010200_[CUDA]_MMA指令说明.md': '# MMA\n',
  '普通草稿.md': '# 草稿\n',
  'archive/020100_[课程]_并行计算复习.md': '# 并行计算\n',
  '010301_[重复编号]_冲突文件A.md': '# conflict\n',
  '010301_[重复编号]_冲突文件B.md': '# conflict\n',
  '01030_编号异常.md': '# invalid\n',
  '[GPU]使用CUDAGraph.md': '# GPU\n'
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-e2e-'))
  for (const [relativePath, content] of Object.entries(FILES)) {
    const absolute = path.join(root, relativePath)
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, content, 'utf8')
  }
  return root
}

async function fileExists(root, relativePath) {
  try {
    await fs.stat(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const workspace = await createFixture()
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-userdata-'))
  await fs.mkdir(shotsDir, { recursive: true })

  const env = { ...process.env, LEAFMARK_E2E: '1' }
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronPath,
    cwd: project,
    args: ['--no-sandbox', `--user-data-dir=${userData}`, project, workspace],
    env,
    timeout: 60_000
  })

  const page = await app.firstWindow()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  await page.waitForSelector('[data-testid="content"]', { timeout: 30_000 })
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="doc-row"]').length >= 8, null, {
    timeout: 30_000
  })

  const rows = await page.locator('[data-testid="doc-row"]').count()
  assert(rows === 10, `expected 10 rows, got ${rows}`)
  await page.screenshot({ path: path.join(shotsDir, '01-overview.png') })

  // ---- leading tags are extracted when adopting an existing file --------
  await page.locator('[data-testid="doc-row"]', { hasText: '使用CUDAGraph' }).click()
  await page.waitForSelector('[data-testid="title-input"]')
  const adoptedTitle = await page.getByTestId('title-input').inputValue()
  assert(adoptedTitle === '使用CUDAGraph', `leading tag was not extracted, title=${adoptedTitle}`)
  await page.locator('.tag-chip-label', { hasText: 'GPU' }).waitFor({ timeout: 5_000 })
  await page.screenshot({ path: path.join(shotsDir, '02-tag-extract.png') })

  // blurring the title extracts freshly typed leading tags
  await page.getByTestId('title-input').fill('[CUDA]GPU 使用说明')
  await page.locator('.editor-title').click()
  await page.waitForFunction(
    () => {
      const input = document.querySelector('[data-testid="title-input"]')
      return input instanceof HTMLInputElement && input.value === 'GPU 使用说明'
    },
    null,
    { timeout: 5_000 }
  )
  const chipLabels = await page.locator('.tag-chip-label').allTextContents()
  assert(chipLabels.includes('GPU') && chipLabels.includes('CUDA'), 'title blur did not extract tags')

  // ---- rename a valid document through the editor -----------------------
  await page.locator('[data-testid="doc-row"]', { hasText: 'MMA指令说明' }).click()
  await page.waitForSelector('[data-testid="title-input"]')
  await page.screenshot({ path: path.join(shotsDir, '02-editor.png') })

  await page.getByTestId('title-input').fill('MMA指令说明（修订）')
  await page.getByText('可以提交').waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: '保存重命名' }).click()
  await page.getByRole('button', { name: '确认重命名' }).click()
  await page.locator('.editor-title', { hasText: 'MMA指令说明（修订）' }).waitFor({ timeout: 15_000 })
  assert(
    await fileExists(workspace, '010200_[CUDA]_MMA指令说明（修订）.md'),
    'renamed file is missing on disk'
  )
  assert(!(await fileExists(workspace, '010200_[CUDA]_MMA指令说明.md')), 'old file still exists after rename')
  await page.screenshot({ path: path.join(shotsDir, '03-after-rename.png') })

  // ---- undo -------------------------------------------------------------
  await page.getByTestId('undo').click()
  await page.locator('.editor-title', { hasText: /^MMA指令说明$/ }).waitFor({ timeout: 15_000 })
  assert(await fileExists(workspace, '010200_[CUDA]_MMA指令说明.md'), 'undo did not restore the file name')
  assert(
    !(await fileExists(workspace, '010200_[CUDA]_MMA指令说明（修订）.md')),
    'undo left the renamed file behind'
  )

  // ---- create a document ------------------------------------------------
  await page.getByTestId('new-document').click()
  await page.waitForSelector('.modal')
  await page.screenshot({ path: path.join(shotsDir, '04-create.png') })
  await page.locator('.modal').getByTestId('title-input').fill('新建测试文档')
  await page.getByRole('button', { name: '创建文档' }).click()
  await page.locator('.editor-title', { hasText: '新建测试文档' }).waitFor({ timeout: 15_000 })
  const createdFiles = await fs.readdir(workspace)
  assert(
    createdFiles.some((name) => name.endsWith('_新建测试文档.md')),
    'created file is missing on disk'
  )

  // ---- settings: rename a category and persist the config --------------
  await page.getByTestId('settings').click()
  await page.waitForSelector('.modal')
  await page.screenshot({ path: path.join(shotsDir, '05-settings.png') })
  await page.getByLabel('一级分类 02 名称').fill('课程资料')
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('课程资料').first().waitFor({ timeout: 15_000 })
  const savedConfig = JSON.parse(await fs.readFile(path.join(workspace, '.leafmark.json'), 'utf8'))
  assert(savedConfig.categories['02'].name === '课程资料', 'config was not persisted')

  await page.screenshot({ path: path.join(shotsDir, '06-final.png') })

  // ---- unmanaged view stays readable -----------------------------------
  await page.getByRole('button', { name: '未纳入管理' }).click()
  await page.waitForTimeout(200)
  const unmanagedRows = await page.locator('[data-testid="doc-row"]').count()
  assert(unmanagedRows === 2, `expected two unmanaged rows, got ${unmanagedRows}`)

  // ---- conflict view ----------------------------------------------------
  await page.getByRole('button', { name: '编号冲突' }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="doc-row"]').length === 2, null, {
    timeout: 10_000
  })
  await page.locator('[data-testid="doc-row"]').first().click()
  await page.getByText('编号冲突', { exact: true }).first().waitFor({ timeout: 10_000 })
  await page.screenshot({ path: path.join(shotsDir, '06-conflict.png') })

  // ---- tag filter -------------------------------------------------------
  await page.getByRole('button', { name: '全部文件' }).click()
  await page.getByRole('button', { name: /标签筛选/ }).click()
  await page.locator('.tag-option', { hasText: 'CUDA' }).locator('input').check()
  await page.locator('.tag-filter-popover .tag-option', { hasText: 'CUDA' }).waitFor()
  await page.locator('.popover-backdrop').click({ position: { x: 6, y: 6 } })
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="doc-row"]').length === 1, null, {
    timeout: 10_000
  })
  await page.screenshot({ path: path.join(shotsDir, '07-tag-filter.png') })
  await page.getByRole('button', { name: /标签筛选/ }).click()
  await page.getByRole('button', { name: '清除标签筛选' }).click()
  await page.locator('.popover-backdrop').click({ position: { x: 4, y: 4 } })

  // ---- broken configuration becomes read only --------------------------
  const configPath = path.join(workspace, '.leafmark.json')
  await fs.writeFile(configPath, '{ broken json', 'utf8')
  await page.getByText('工作区配置文件存在错误', { exact: false }).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: path.join(shotsDir, '08-config-error.png') })
  await fs.writeFile(configPath, `${JSON.stringify(savedConfig, null, 2)}\n`, 'utf8')
  await page.waitForFunction(() => !document.body.innerText.includes('工作区配置文件存在错误'), null, {
    timeout: 15_000
  })

  await app.close()

  // ---- empty workspace with recent list --------------------------------
  const emptyApp = await electron.launch({
    executablePath: electronPath,
    cwd: project,
    args: ['--no-sandbox', `--user-data-dir=${userData}`, project],
    env,
    timeout: 60_000
  })
  const emptyPage = await emptyApp.firstWindow()
  await emptyPage.waitForSelector('.empty-workspace', { timeout: 20_000 })
  await emptyPage.screenshot({ path: path.join(shotsDir, '09-empty.png') })
  await emptyApp.close()
  console.log(`rows: ${rows}, screenshots: ${shotsDir}`)

  if (consoleErrors.length > 0) {
    console.error('renderer console errors:')
    for (const error of consoleErrors) console.error(` - ${error}`)
    process.exitCode = 1
  }

  await fs.rm(workspace, { recursive: true, force: true })
  await fs.rm(userData, { recursive: true, force: true })
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
