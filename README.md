# LeafMark

[![CI](https://github.com/Jocx-H/leafmark/actions/workflows/ci.yml/badge.svg)](https://github.com/Jocx-H/leafmark/actions/workflows/ci.yml)

**A focused, cross-platform naming manager for Markdown files.**

LeafMark 是一个独立、功能聚焦的 Markdown 文档命名管理器。它不阅读、不编辑 Markdown 正文，只通过文件名管理编号、标签和标题，帮助大量笔记形成统一、可读、可排序的树形结构。

> 设计基线见 [docs/design.md](docs/design.md)；实现阶段的取舍记录在 [docs/implementation-notes.md](docs/implementation-notes.md)。

## 它做什么

文件名即元数据：

```text
AABBCC_[标签1][标签2]_文章标题.md
010203_[CUDA][SpMM]_稀疏矩阵乘优化.md
```

- `AA` 一级分类、`BB` 二级分类、`CC` 文档序号，各两位数字；
- 标签写在方括号里，可排序、可跨分类筛选；
- 编号在整个工作区范围内唯一，调整分类会生成新编号并重命名文件；
- 文件名就是唯一权威来源，没有数据库、没有索引文件、没有账号和云同步。

界面为三栏布局：左侧分类树与异常视图，中间文档列表、搜索与标签筛选，右侧命名编辑与实时校验。

## 功能范围（MVP）

- 选择并记忆工作区，读取 / 创建 / 校验 `.leafmark.json`
- 递归扫描 Markdown 文件，解析编号、标签、标题
- 分类树、文档列表、标题筛选、标签「包含全部 / 任一」筛选
- 未纳入管理、命名异常、编号冲突三组独立视图，错误信息精确到具体原因
- 新建空 Markdown 文档，自动推荐下一个序号
- 将已有文件纳入规范，修改分类、序号、标签、标题
- 重命名预览、编号与路径冲突检查、原子提交、当前会话撤销
- 文件系统监听（400 ms 防抖）与手动重新扫描
- 配置错误时进入只读状态，可恢复默认配置
- macOS / Windows 构建配置，GitHub Actions 双平台验证

暂不包含：Markdown 编辑与预览、全文搜索、云同步、Git、附件管理、批量操作、正文链接自动修复。

## 快速开始

需要 Node.js **22.12 或更高版本**。

```bash
npm install
npm run dev        # Vite + esbuild 监听，自动重启 Electron
npm run dev -- /path/to/notes   # 带工作区启动开发模式
npm run build      # 生成 out/main、out/preload、out/renderer
npm start -- /path/to/notes   # 构建后启动，可传入工作区路径
```

常用命令：

```bash
npm run typecheck  # 主进程 + 渲染进程类型检查
npm test           # Vitest：解析、校验、编号分配、配置、扫描、重命名、撤销
npm run e2e        # 构建后用 Playwright 驱动真实 Electron 完成改名/撤销/新建/设置
npm run package:mac
npm run package:win
```

### 中国大陆网络

Electron 二进制默认从 GitHub Releases 下载，可能超时。安装前设置镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

Windows PowerShell：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
```

## 使用说明

1. 启动后选择一个本地目录作为工作区。若目录中没有 `.leafmark.json`，界面会提示创建；不创建也可以使用内存中的默认配置。
2. 已有 Markdown 文件会出现在「全部文件」；未使用规范命名的文件进入「未纳入管理」。
3. 选中文件后，在右侧选择分类、序号、标签和标题。目标文件名与校验结果实时更新。
4. 提交时主进程会重新检查源文件指纹、目标名称占用、编号冲突和工作区边界；任何可能覆盖文件的情况都会安全失败。
5. 重命名只改变文件名，不移动物理目录，也不修改正文；当前会话内可用「撤销」恢复。

### 编号规则

- 六位数字，`AA` / `BB` / `CC` 各两位，`00` 合法；
- 自动推荐「当前分类最大值 + 1」，不主动填补中间空缺；
- 已用到 `99` 时要求手动选择空闲序号，100 个序号全部占用则提示分类已满；
- 编号在整个工作区唯一，不同物理目录出现相同编号都会被标记为冲突。

### 文件状态

| 状态 | 含义 |
| --- | --- |
| 已管理 `valid` | 命名完全合法且编号唯一 |
| 未纳入管理 `unmanaged` | 普通 Markdown 文件，尚未采用规范命名 |
| 命名异常 `invalid` | 看起来采用了规范，但编号、标签或标题不合法 |
| 编号冲突 `conflict` | 两个及以上文件使用相同六位编号 |

### 配置文件

工作区根目录下的 `.leafmark.json` 只保存规则与展示信息，不保存文件列表、绝对路径、编号映射或缓存。写入采用「临时文件 + 原子替换」；损坏时会显示错误位置并进入只读状态。

删除该文件不会丢失任何文档元数据：编号、标签、标题都可以从文件名恢复。

## 安全与隐私

- 默认不联网，不上传文件名、目录结构或正文；
- 不读取 Markdown 正文，只在扫描时读取目录项和文件元数据；
- 所有文件系统写操作只发生在 Electron 主进程；
- Renderer 禁用 Node.js 集成，启用 `contextIsolation` 与 `sandbox`，只能通过 preload 暴露的受限业务接口访问主进程；
- 每个 IPC 调用都会校验来源窗口、主框架、请求结构和参数；
- 生产环境使用限制性 CSP，禁止远程资源、任意导航和新窗口；
- 从不覆盖已有文件，失败时保留源文件。

## 工程结构

```text
src/
├── main/                  Electron 主进程（文件操作与规则校验的唯一权威）
│   ├── config/            配置读取、校验、原子写入
│   ├── scanner/           目录扫描与忽略规则
│   ├── rename/            预览、原子重命名、大小写中转
│   ├── session/           工作区会话、撤销栈、快照
│   ├── watcher/           文件系统监听与防抖
│   ├── ipc/               IPC Handler 与调用来源校验
│   └── appState.ts        工作区与最近列表管理
├── preload/               contextBridge 白名单接口
├── renderer/              React 三栏界面
└── shared/                纯规则模块（解析、生成、校验、编号分配、配置、IPC 契约）
tests/                     Vitest 单元与真实文件系统集成测试
scripts/                   构建、开发、启动与 e2e 脚本
docs/                      设计基线与实现说明
```

纯规则模块不依赖 Electron 或 React，可以直接用普通单元测试验证。

## 测试

- `tests/parse.test.ts`：设计文档 §18.1 的全部文件名用例及边界情况；
- `tests/allocate.test.ts`：空分类、不补空缺、99 特判、分类已满；
- `tests/validate.test.ts`：标签 / 标题字符规则、Unicode NFC、200 字节上限；
- `tests/config.test.ts`：默认值、损坏 JSON 定位、未知字段保留、原子写入；
- `tests/scan.test.ts`：状态判定、跨目录冲突、忽略规则、符号链接、大小写扩展名；
- `tests/rename.test.ts`：内容不变、目标占用、预览后修改、大小写改名、撤销、并发冲突；
- `npm run e2e`：真实 Electron 中完成重命名、撤销、新建、配置保存、标签筛选与只读状态验证。

## 已知限制

- 撤销仅限当前应用会话，不跨重启；
- 不自动修复 Markdown 中的相对链接或 Wiki Link；
- 物理目录不随逻辑分类移动；
- 尚未实现批量操作、拖拽排序与全文搜索；
- Windows 安装包未签名，macOS 安装包未公证；
- 自动更新与遥测不在当前范围内。

## 许可证

[MIT](LICENSE)
