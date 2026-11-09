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
    '02': { name: '课程', children: { '01': '课程笔记' } },
    '03': { name: '空分类', children: { '00': '子类' } }
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
  // collapsing and expanding a primary category in the settings
  const researchCard = page
    .locator('.category-card')
    .filter({ has: page.locator('.code-pill', { hasText: /^01$/ }) })
  assert(
    (await researchCard.locator('.category-row.is-child').count()) === 0,
    'categories should be collapsed by default'
  )
  assert(
    ((await researchCard.locator('.category-summary').textContent()) ?? '').includes('2 个二级分类'),
    'collapsed summary is missing'
  )
  await researchCard.locator('.category-toggle').click()
  assert((await researchCard.locator('.category-row.is-child').count()) === 2, 'children did not expand')

  await page.getByLabel('一级分类 02 名称').fill('课程资料')

  // inserting at 00 shifts the existing child to 01 without touching documents
  const emptyCategory = page
    .locator('.category-card')
    .filter({ has: page.locator('.code-pill', { hasText: /^03$/ }) })
  await emptyCategory.locator('.category-toggle').click()
  await emptyCategory.getByRole('button', { name: '+ 添加二级分类' }).click()
  await emptyCategory.getByLabel('新二级分类编号').selectOption('00')
  await emptyCategory.getByLabel('新二级分类名称').fill('新子类')
  await emptyCategory.getByRole('button', { name: '添加', exact: true }).click()
  await page.waitForTimeout(300)
  const insertedChildren = await emptyCategory
    .locator('.category-row.is-child input')
    .evaluateAll((inputs) => inputs.map((input) => input.value))
  assert(insertedChildren.includes('新子类'), `inserted category missing: ${insertedChildren.join(',')}`)

  await page.getByRole('button', { name: '保存设置' }).click()
  await page.getByText('课程资料').first().waitFor({ timeout: 15_000 })
  const savedConfig = JSON.parse(await fs.readFile(path.join(workspace, '.leafmark.json'), 'utf8'))
  assert(savedConfig.categories['02'].name === '课程资料', 'config was not persisted')
  assert(savedConfig.categories['03'].children['00'] === '新子类', 'inserted category is missing')
  assert(savedConfig.categories['03'].children['01'] === '子类', 'existing child was not shifted')

  await page.screenshot({ path: path.join(shotsDir, '06-final.png') })

  // ---- collapsible category tree in the sidebar ------------------------
  const researchGroup = page
    .locator('.tree-group')
    .filter({ has: page.locator('.tree-primary', { hasText: '科研' }) })
  await researchGroup.locator('.tree-toggle').click()
  assert((await researchGroup.locator('.tree-children').count()) === 0, 'sidebar children did not collapse')
  await page.screenshot({ path: path.join(shotsDir, '07-sidebar-collapsed.png') })
  await researchGroup.locator('.tree-toggle').click()
  assert((await researchGroup.locator('.tree-children').count()) === 1, 'sidebar children did not expand')

  // ---- add-primary scrolls to the new card and dragging reorders ----------
  await page.getByTestId('settings').click()
  await page.waitForSelector('.modal')
  await page.getByRole('button', { name: '添加一级分类' }).click()
  await page.waitForTimeout(500)
  const focusedLabel = await page.evaluate(() => {
    const element = document.activeElement
    return element instanceof HTMLInputElement ? element.getAttribute('aria-label') : null
  })
  assert(focusedLabel === '一级分类 04 名称', `new primary was not focused: ${focusedLabel}`)

  const card03 = page.locator('.category-card').filter({ has: page.locator('.code-pill', { hasText: /^03$/ }) })
  const card04 = page.locator('.category-card').filter({ has: page.locator('.code-pill', { hasText: /^04$/ }) })
  assert(await card04.isVisible(), 'new primary is not scrolled into view')
  await card04.locator('.drag-handle').dragTo(card03)
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '保存设置' }).click()
  await page.waitForTimeout(800)
  const reorderedConfig = JSON.parse(await fs.readFile(path.join(workspace, '.leafmark.json'), 'utf8'))
  assert(reorderedConfig.categories['03'].name === '新分类', 'dragged category did not take the target slot')
  assert(reorderedConfig.categories['04'].name === '空分类', 'target category was not shifted down')

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

  // ---- batch category move renames documents and can be undone ----------
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'leafmark-batch-e2e-'))
  const batchConfig = {
    schemaVersion: 1,
    categories: {
      '00': { name: 'A', children: { '00': 'a' } },
      '01': { name: 'B', children: { '00': 'b' } }
    }
  }
  await fs.writeFile(path.join(batchRoot, '.leafmark.json'), `${JSON.stringify(batchConfig, null, 2)}\n`)
  await fs.writeFile(path.join(batchRoot, '000100_[标签]_a.md'), 'A 内容')
  await fs.writeFile(path.join(batchRoot, '010100_b.md'), 'B 内容')

  const batchApp = await electron.launch({
    executablePath: electronPath,
    cwd: project,
    args: ['--no-sandbox', `--user-data-dir=${path.join(batchRoot, 'userdata')}`, project, batchRoot],
    env,
    timeout: 60_000
  })
  const batchPage = await batchApp.firstWindow()
  await batchPage.waitForSelector('[data-testid="content"]', { timeout: 30_000 })
  await batchPage.getByTestId('settings').click()
  await batchPage.waitForSelector('.modal')

  const batchCard = (code) =>
    batchPage.locator('.category-card').filter({ has: batchPage.locator('.code-pill', { hasText: new RegExp(`^${code}$`) }) })
  await batchCard('01').locator('.drag-handle').dragTo(batchCard('00'))
  await batchPage.waitForTimeout(300)
  assert((await batchPage.locator('.rename-badge').count()) === 1, 'batch rename badge is missing')
  await batchPage.getByRole('button', { name: /保存并重命名/ }).click()
  await batchPage.getByRole('button', { name: '确认保存并改名' }).waitFor({ timeout: 5_000 })
  await batchPage.screenshot({ path: path.join(shotsDir, '10-batch-confirm.png') })
  await batchPage.getByRole('button', { name: '确认保存并改名' }).click()
  await batchPage.waitForTimeout(1200)

  const movedFiles = await fs.readdir(batchRoot)
  assert(movedFiles.includes('010100_[标签]_a.md'), 'batch rename did not move the first document')
  assert(movedFiles.includes('000100_b.md'), 'batch rename did not move the second document')
  assert(
    (await fs.readFile(path.join(batchRoot, '010100_[标签]_a.md'), 'utf8')) === 'A 内容',
    'batch rename changed file content'
  )
  const movedConfig = JSON.parse(await fs.readFile(path.join(batchRoot, '.leafmark.json'), 'utf8'))
  assert(movedConfig.categories['00'].name === 'B', 'batch rename did not reorder the config')

  await batchPage.getByTestId('undo').click()
  await batchPage.waitForTimeout(1200)
  const restoredFiles = await fs.readdir(batchRoot)
  assert(restoredFiles.includes('000100_[标签]_a.md'), 'undo did not restore the first document')
  assert(restoredFiles.includes('010100_b.md'), 'undo did not restore the second document')
  await batchApp.close()
  await fs.rm(batchRoot, { recursive: true, force: true })

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
