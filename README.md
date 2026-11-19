# deepseek_local_libary · 全局资料库版 cyber-self

> 给 DeepSeek Harness 的**全局、可分区**本地资料库插件。
> 一次导入，所有对话共用；按主题分区，按需检索，回答带出处。

本项目基于 [MrLsss/cyber-self](https://github.com/MrLsss/cyber-self) 改造，保留其解析、分块、向量检索与引用回答的全部能力，把「一个工作区一个库」改成「**一个全局库 + 多个分区**」，并调整了检索预算与中文检索的短板。

---

## 一分钟理解

| 上游 cyber-self | 本项目 |
| --- | --- |
| 一个工作区 = 一个库，检索只在当前工作区 | **一个库根**（如 `D:\CyberSelf`），**所有对话都能检索** |
| 按工作区隔离 | 按**分区**（库根下的子目录）组织，`STM32`、`数学`、`读书笔记` 各一个库 |
| 面板按工作区切换 | 面板顶部**分区下拉 + 新建分区** |
| 检索 8 段 × 1200 字符 | 检索 **4 段 × 800 字符**，单文档最多 2 段 |
| 两字中文查询搜不到 | 加了 LIKE 兜底，能搜到 |

数据全部在本机 SQLite 里，不联网，不上传。

---

## 它解决什么问题

长对话里最贵的不是"想"，是"重新读"：每次要用某份资料，都得把正文塞进上下文，然后它就一直留在上下文里，每轮重发。

资料库把这件事拆开：

- **平时**：资料躺在硬盘上，0 token；
- **要用时**：检索把**最多 4 段**相关原文送进上下文，回答带 `[1]` `[2]` 编号；
- **换对话**：资料还在，不用重新导入、重新解释。

一次检索大约 1.5~2.5k token，直接读一份 300 页 PDF 是十几万。

---

## 功能

### 一条命令建立全局库

库根在配置文件里指定一次即可，之后所有会话共享：

```yaml
- id: cyberself
  config:
    libraryRoot: 'D:\CyberSelf'
```

### 分区 = 目录

```
D:\CyberSelf\
  ├─ 操作规范\.cyberself\kb.db
  ├─ STM32\.cyberself\kb.db
  ├─ 数学\.cyberself\kb.db
  └─ .scope.json            # 全局回答范围
```

- 面板里点「新建分区」即建目录，也可直接在资源管理器里建文件夹；
- 一个分区一个 `kb.db`，可以单独备份、单独删除、单独拷走；
- 检索默认跨全部分区，命中会标注来自哪个分区。

### 检索与引用

- 向量（Ollama + `bge-m3`）与关键词（SQLite FTS5 trigram）双路召回，RRF 融合；
- 返回片段带文档标题、页码、小节名、所属分区；
- 面板里有「只查库、不调模型」的检索框，用来核对原文。

### 导入

- 支持：`.pdf` `.docx` `.xlsx` `.xls` `.csv` `.md` `.markdown` `.txt` `.text` `.log` `.html` `.htm` `.png` `.jpg` `.jpeg` `.webp` `.gif`
- 单文件上限 64 MB；`.doc` 请先转 `.docx`
- 目录导入先扫描、报文件数/体积/图片数，确认后再导
- 按内容 sha256 去重：同一个文件换名字再导也会被认出
- 导入后自动在后台补向量，面板显示 `已向量化 K 段 / 共 M 段`

### 三个模型工具

| 工具 | 作用 |
| --- | --- |
| `cyberself_search` | 检索片段；`partition` 参数可选，不传则跨全部分区 |
| `cyberself_documents` | 列出资料及所属分区、段落数、向量化进度 |
| `cyberself_read` | 按文档 id 分段读取原文，用于核对上下文 |

### 回答范围（全局开关）

| 值 | 行为 |
| --- | --- |
| `open`（默认） | 资料优先；库外内容可补充，但须单独成句并标注「（资料库外）」 |
| `library` | 只能依据资料原文回答；库里没有就直说缺什么 |

切换入口在面板，落盘为 `D:\CyberSelf\.scope.json`，对所有会话生效。

---

## 安装

### 前置条件

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `>= 0.2.1-rc.4 < 0.3.0`
- Node.js `>= 22.5`（资料库用内置 `node:sqlite`）
- Ollama（推荐）：用于向量检索，`ollama pull bge-m3`。不装也能用，退化为纯关键词检索

### 方式一：从 GitHub 安装

```bash
dsh plugin --profile <你的 profile> add github:terraspere7-sys/deepseek_local_libary
```

> 桌面版（DSH Desktop / DSH Next）的 `desktop` profile 由应用自身管理，命令行写不进去。请在应用内的**插件市场 / 插件页**安装，或把仓库下载到本地后用下面的方式二。

### 方式二：从本地目录安装

```bash
git clone https://github.com/terraspere7-sys/deepseek_local_libary.git
dsh plugin --profile <你的 profile> add "<仓库绝对路径>"
```

仓库里带有构建好的 `lib/`，安装侧**不需要**再构建。

### 方式三：手动放入 profile

把整个目录放进 `~/.dsh/profiles/<profile>/node_modules/cyberself`，并确认 profile 的 `package.json` 里 `dsh.profile.bundles` 含 `"cyberself"`。

### 配置

在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 追加：

```yaml
- id: cyberself
  config:
    libraryRoot: 'D:\CyberSelf'     # 全局库根；留空 = 退回上游的"每工作区一个库"
    retrieval:
      topK: 4                        # 单次引用条数
      perDocument: 2                 # 单文档上限
    chunking:
      targetChars: 800               # 分块长度（只影响新导入）
```

改完重启应用，或改动该文件触发热重载。

---

## 使用

1. 打开任意对话，右栏「资料库」
2. 顶部下拉选择分区；没有就点「新建分区」
3. 「上传文件」或「导入目录」把资料放进去
4. 等 `已向量化` 追上总段数
5. 直接提问，回答会带 `[1]` `[2]` 和分区名

命令行/脚本方式（接口在本机回环免鉴权）：

```bash
# 列出分区
curl -s -X POST http://127.0.0.1:<端口>/cyberself/api/partitions -d '{}'

# 新建分区
curl -s -X POST http://127.0.0.1:<端口>/cyberself/api/partition \
  -H 'content-type: application/json' -d '{"name":"STM32"}'

# 导入文件
curl -s -X POST http://127.0.0.1:<端口>/cyberself/api/import \
  -H 'content-type: application/json' \
  -d '{"dir":"D:\\CyberSelf\\STM32","path":"C:\\资料\\手册.pdf"}'
```

端口取当前 DSH Web GUI 的地址。

---

## 数据与备份

| 内容 | 位置 |
| --- | --- |
| 各分区数据库 | `<libraryRoot>\<分区>\.cyberself\kb.db` |
| 全局回答范围 | `<libraryRoot>\.scope.json` |
| 嵌入服务设置 | `$DSH_HOME/cyberself/settings.json` |

- 库是自包含的：正文与向量都在 `kb.db` 里，**原文件删掉不影响查询**；
- 备份 = 复制整个库根目录；迁移 = 复制后改 `libraryRoot`；
- 若库根放在 Git 仓库里，记得把 `.cyberself/` 加进 `.gitignore`。

---

## 架构

```
┌──────────────────────────────────────────┐
│ 客户端：右栏面板（分区下拉 / 导入 / 检索）   │
├──────────────────────────────────────────┤
│ Host：路由（partitions / partition /      │
│       scope / import / search / ...）     │
│       工具（search / documents / read）    │
│       会话规则注入（库变化时才刷新）         │
├──────────────────────────────────────────┤
│ 存储：每分区一个 SQLite                   │
│   documents / chunks / chunks_fts(trigram)│
│   向量以 float32 blob 存在 chunks 行上     │
├──────────────────────────────────────────┤
│ 模型：Ollama bge-m3（1024 维）            │
└──────────────────────────────────────────┘
```

源码结构：

```
src/
├── host/
│   ├── index.ts        插件装配
│   ├── service.ts      分区发现、跨分区检索、导入、维护
│   ├── tools.ts        三个模型工具
│   ├── routes.ts       HTTP 接口
│   ├── policy.ts       会话规则注入
│   ├── config.ts       配置 schema
│   ├── settings.ts     全局设置与分区标记
│   ├── kb/             SQLite、分块、导入、检索
│   ├── parse/          pdf / docx / xlsx / html / 图片
│   ├── embed/          Ollama 客户端与批量向量化
│   └── answer/         可选的自答管线
├── client/             面板、设置页、样式
└── shared/protocol.ts  前后端共享类型
```

---

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build      # 产出 lib/index.js 与 lib/client.js
pnpm test       # node:test；93/95 通过
```

两个用例需要本地模型网关 `127.0.0.1:3425`，没有网关时按 CI 的方式跳过：

```bash
node --test --test-skip-pattern='an answer cites|asking streams' "test/**/*.test.ts"
```

`lib/` 随源码提交；CI 会在构建后校验 `lib/` 与 `src/` 一致，改了源码记得重新 build 再提交。

---

## 与上游的差异

| 项 | 上游 cyber-self | 本项目 |
| --- | --- | --- |
| 库位置 | `<工作区>/.cyberself` | `<libraryRoot>/<分区>/.cyberself` |
| 库数量 | 每工作区一个 | 全局一个根，多分区 |
| 跨库检索 | 无 | 有（默认全分区，可 `partition` 收窄） |
| 回答范围 | 每库一份标记 | 全局一份 `.scope.json`，默认 `open` |
| 检索预算 | topK 8、1200 字符 | topK 4、800 字符、单文档 2 段 |
| 两字中文查询 | trigram 无法命中 | 降级 LIKE 子串扫描 |
| 新增接口 | — | `/partitions`、`/partition`、`/scope` |
| 删除分区 | — | 连目录一起删，不留空壳 |

升级注意：本项目与上游数据结构兼容（表结构未改），但库目录布局不同；从上游迁移时把 `<工作区>/.cyberself` 整个复制到 `<libraryRoot>/<分区>/.cyberself` 即可，向量无需重建。

---

## 已知限制

- **`.doc` 不支持**，请转 `.docx` 或 PDF；
- **扫描版 PDF / 图片**需要能读图的模型，未配置时导入会失败；纯文字 PDF 不受影响；
- 向量检索在 JS 里逐块算余弦，耗时随分块数线性增长（万段量级约 1 秒）；
- **关键词模式对整句提问很弱**（问句会被切成跨词碎片），这也是需要 Ollama 的原因；
- 一个分区同一时间只跑一个向量化任务；
- HTTP 接口在本机回环免鉴权，**不要**把 DSH 暴露到不可信网络。

---

## 致谢

- [MrLsss/cyber-self](https://github.com/MrLsss/cyber-self)：本项目的上游，解析、分块、向量检索、面板与引用回答均来自它。
- [Ollama](https://ollama.com/) 与 [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)：本机嵌入模型。

## 许可

MIT，随上游保留原始版权声明，见 [LICENSE](./LICENSE)。
