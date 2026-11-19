/**
 * The library seats inside a conversation: the entry in the session header
 * utilities and the management panel as a tab of the right sidebar.
 *
 * In the global mode the panel targets one partition of the shared library
 * root, and the search box covers every partition; in the per-workspace mode
 * it keeps targeting the session's own workspace.
 * @module cyberself/client/panel
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button, Input, SegmentedControl, type SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ALL_PARTITIONS, type AnswerScope, type Citation, type DocumentView, type PartitionsView } from '../shared/protocol.ts'
import {
  createPartition,
  embedMissing,
  importPath,
  importUpload,
  invalidateLibraries,
  loadDocument,
  loadPartitions,
  markLibrary,
  purgeLibrary,
  refreshLibrary,
  removeDocument,
  scanDirectory,
  searchLibrary,
  setLibraryScope,
  useLibrary,
  type DocumentDetail,
  type Progress,
} from './data.ts'
import { useSessionDirectory } from './workspaces.ts'
import { formatSize } from './base.ts'

/** Every seat addressed to one session receives its identity. */
export interface SessionSeatProps {
  sessionId: SessionId
}

const PHASES: Record<Progress['phase'], string> = {
  parse: '解析',
  write: '写入',
}

/** Imports in flight at once; each one spends most of its time waiting on the model. */
const IMPORT_CONCURRENCY = 3

/** Browser key that remembers the partition the user picked last. */
const PARTITION_KEY = 'cyberself.partition'

/** A scanned directory waiting for the user to accept the import. */
interface PendingFolder {
  files: string[]
  skipped: string[]
  totalBytes: number
  images: number
}

async function importAll<T>(items: readonly T[], work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const run = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) continue
      await work(item, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, items.length) }, () => run()))
}

const SCOPE_OPTIONS: readonly SegmentedControlOption<AnswerScope>[] = [
  { value: 'library', label: '仅资料库' },
  { value: 'open', label: '允许补充' },
]

function place(page: number | null, heading: string | null): string {
  const parts: string[] = []
  if (page !== null) parts.push(`第 ${page} 页`)
  if (heading !== null && heading !== '') parts.push(heading)
  return parts.join(' · ')
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function rememberedPartition(): string {
  try {
    return window.localStorage.getItem(PARTITION_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberPartition(name: string): void {
  try {
    window.localStorage.setItem(PARTITION_KEY, name)
  } catch {
    // A blocked storage only costs the memory of the picker.
  }
}

/** Management panel, drawn as the body of the library tab in the right sidebar. */
export function LibraryTabBody(props: SessionSeatProps): ReactElement | null {
  const sessionDir = useSessionDirectory(props.sessionId)
  const [catalog, setCatalog] = useState<PartitionsView | null>(null)
  const [selectedName, setSelectedName] = useState<string>(rememberedPartition)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [folder, setFolder] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Citation[] | null>(null)
  const [open, setOpen] = useState<DocumentDetail | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pendingFolder, setPendingFolder] = useState<PendingFolder | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const globalMode = catalog?.global === true
  const current = globalMode
    ? (catalog.partitions.find((partition) => partition.name === selectedName) ?? catalog.partitions[0])
    : undefined
  const dir = globalMode ? current?.dir : sessionDir
  const state = useLibrary(dir)
  const view = state.view
  const running = view?.stats?.embedding.running === true

  const reloadCatalog = (): void => {
    loadPartitions()
      .then((next) => { setCatalog(next) })
      .catch((reason: unknown) => { setError(message(reason)) })
  }

  useEffect(() => {
    reloadCatalog()
  }, [])

  useEffect(() => {
    if (!running || dir === undefined) return
    const timer = setInterval(() => {
      void refreshLibrary(dir)
    }, 1500)
    return () => {
      clearInterval(timer)
    }
  }, [running, dir])

  const pick = (name: string): void => {
    setSelectedName(name)
    rememberPartition(name)
    setHits(null)
    setOpen(null)
    setNote(null)
  }

  const create = (): void => {
    const name = (creating ?? '').trim()
    if (name === '') return
    setBusy(true)
    setError(null)
    createPartition(name)
      .then((next) => {
        setCatalog(next)
        pick(name)
        setCreating(null)
        invalidateLibraries()
      })
      .catch((reason: unknown) => { setError(message(reason)) })
      .finally(() => { setBusy(false) })
  }

  if (catalog === null) {
    return <div className="cs-panel"><span className="cs-muted">正在读取资料库</span></div>
  }

  if (globalMode && dir === undefined) {
    return (
      <div className="cs-panel">
        <div className="cs-empty">
          全局资料库还没有分区。建一个分区（例如 STM32、数学），把资料导进去；之后任何对话都能检索它。
        </div>
        <div className="cs-row">
          <Input
            value={creating ?? ''}
            placeholder="分区名，例如 STM32"
            onChange={(event) => { setCreating(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
            }}
          />
          <Button size="sm" variant="primary" disabled={busy} onClick={create}>新建分区</Button>
        </div>
        {error === null ? null : <div className="cs-error">{error}</div>}
        <div className="cs-muted cs-path" title={catalog.root}>{catalog.root}</div>
      </div>
    )
  }

  if (dir === undefined) {
    return <div className="cs-panel"><span className="cs-muted">正在读取工作区</span></div>
  }

  const enable = (): void => {
    setBusy(true)
    setError(null)
    markLibrary(dir, true)
      .then(() => {
        invalidateLibraries()
        state.reload()
      })
      .catch((reason: unknown) => {
        setError(message(reason))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  if (view === null) {
    const failure = state.error
    return failure === null
      ? <div className="cs-panel"><span className="cs-muted">正在读取资料库</span></div>
      : <div className="cs-panel"><span className="cs-error">{failure}</span></div>
  }

  if (!view.library) {
    return (
      <div className="cs-panel">
        <div className="cs-empty">这个工作区还不是资料库。启用之后，在这个工作区里的对话都能检索它的资料。</div>
        <div className="cs-row">
          <Button size="sm" variant="primary" disabled={busy} onClick={enable}>
            {busy ? '启用中' : '设为资料库'}
          </Button>
        </div>
        {error === null ? null : <div className="cs-error">{error}</div>}
      </div>
    )
  }

  const run = async (work: () => Promise<string | null>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const next = await work()
      setNote(next)
      state.reload()
      reloadCatalog()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const upload = (files: FileList | null): void => {
    if (files === null || files.length === 0) return
    void run(async () => {
      const list = Array.from(files)
      const names: string[] = new Array(list.length).fill('')
      await importAll(list, async (file, index) => {
        const imported = await importUpload(dir, file, setProgress)
        names[index] = imported.duplicateOf === null ? file.name : `${file.name}（已存在）`
      })
      return `已导入：${names.join('、')}`
    })
  }

  const importFolder = (): void => {
    const path = folder.trim()
    if (path === '') return
    setBusy(true)
    setError(null)
    setNote(null)
    scanDirectory(dir, path)
      .then((scan) => {
        if (scan.files.length === 0) {
          setNote('该目录里没有可导入的文件')
          return
        }
        setPendingFolder({ files: scan.files, skipped: scan.skipped, totalBytes: scan.totalBytes, images: scan.images })
      })
      .catch((reason: unknown) => {
        setError(message(reason))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const importPendingFolder = (): void => {
    const target = pendingFolder
    if (target === null) return
    setPendingFolder(null)
    void run(async () => {
      let imported = 0
      await importAll(target.files, async (file) => {
        await importPath(dir, file, setProgress)
        imported += 1
      })
      setFolder('')
      const skipped = target.skipped.length === 0 ? '' : `，跳过 ${target.skipped.length} 个不支持的文件`
      return `已导入 ${imported} 个文件${skipped}`
    })
  }

  const embed = (): void => {
    void run(async () => {
      const result = await embedMissing(dir, setProgress)
      return result.remaining === 0
        ? '所有分块都已有向量'
        : `已开始向量化，${result.remaining} 段待处理`
    })
  }

  const changeScope = (next: AnswerScope): void => {
    if (next === (globalMode ? catalog.scope : view.scope)) return
    setBusy(true)
    setError(null)
    if (globalMode) {
      setLibraryScope(next)
        .then((next2) => {
          setCatalog(next2)
          invalidateLibraries()
          state.reload()
        })
        .catch((reason: unknown) => {
          setError(message(reason))
        })
        .finally(() => {
          setBusy(false)
        })
      return
    }
    markLibrary(dir, true, next)
      .then(() => {
        invalidateLibraries()
        state.reload()
      })
      .catch((reason: unknown) => {
        setError(message(reason))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const search = (): void => {
    const text = query.trim()
    if (text === '') return
    setBusy(true)
    setError(null)
    searchLibrary(globalMode ? ALL_PARTITIONS : dir, text)
      .then((result) => {
        setHits(result.citations)
        setNote(result.note)
      })
      .catch((reason: unknown) => {
        setError(message(reason))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  const remove = (document: DocumentView): void => {
    void run(async () => {
      await removeDocument(dir, document.id)
      if (open !== null && open.document.id === document.id) setOpen(null)
      return `已删除《${document.title}》`
    })
  }

  const purge = (): void => {
    setConfirming(false)
    void run(async () => {
      const result = await purgeLibrary(dir)
      setOpen(null)
      setHits(null)
      return result.removed === 0
        ? '资料库本来就是空的'
        : `已删除 ${result.removed} 份资料，释放 ${formatSize(result.reclaimed)}`
    })
  }

  const inspect = (document: DocumentView): void => {
    if (open !== null && open.document.id === document.id) {
      setOpen(null)
      return
    }
    loadDocument(dir, document.id)
      .then((detail) => {
        setOpen(detail)
      })
      .catch((reason: unknown) => {
        setError(message(reason))
      })
  }

  const scope: AnswerScope = globalMode ? catalog.scope : view.scope

  return (
    <div className="cs-panel">
      {globalMode ? (
        <div className="cs-row cs-partition">
          <select
            className="cs-select"
            value={current?.name ?? ''}
            disabled={busy}
            onChange={(event) => { pick(event.currentTarget.value) }}
            aria-label="分区"
          >
            {catalog.partitions.map((partition) => (
              <option key={partition.name} value={partition.name}>
                {`${partition.name}（${partition.documents} 份）`}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setCreating(creating === null ? '' : null) }}>
            {creating === null ? '新建分区' : '取消'}
          </Button>
        </div>
      ) : null}

      {creating === null ? null : (
        <div className="cs-row">
          <Input
            value={creating}
            placeholder="新分区名，例如 STM32"
            onChange={(event) => { setCreating(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
            }}
          />
          <Button size="sm" variant="primary" disabled={busy} onClick={create}>创建</Button>
        </div>
      )}

      <div className="cs-panel-head">
        <span className="cs-panel-title">资料（{view.documents.length}）</span>
        <span className="cs-grow" />
        <Button size="sm" variant="primary" disabled={busy} onClick={() => { picker.current?.click() }}>上传文件</Button>
        <Button size="sm" variant="outline" disabled={busy || running} onClick={embed}>
          {running ? '向量化中' : '向量化全部'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy || view.documents.length === 0} onClick={() => { setConfirming(true) }}>
          清空资料
        </Button>
      </div>

      {confirming ? (
        <div className="cs-row cs-confirm">
          <span className="cs-muted">
            将删除本分区全部 {view.documents.length} 份资料、{view.stats?.chunks ?? 0} 段分块与它们的向量，只保留资料库本身。
          </span>
          <Button size="sm" variant="primary" disabled={busy} onClick={purge}>确认清空</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setConfirming(false) }}>取消</Button>
        </div>
      ) : null}

      <div className="cs-summary">
        <span className="cs-tag">{scope === 'open' ? '允许补充' : '仅资料库'}</span>
        <span className="cs-muted">
          {view.stats === null ? '' : `${view.stats.documents} 份 · ${view.stats.chunks} 段 · 已向量化 ${view.stats.embedded} 段 · 占用 ${formatSize(view.stats.bytes)}`}
        </span>
        {view.stats !== null && !view.stats.embeddingReady ? <span className="cs-warn">嵌入不可用</span> : null}
        {state.error === null ? null : <span className="cs-error">{state.error}</span>}
      </div>

      {globalMode ? (
        <div className="cs-summary">
          <span className="cs-muted">
            {`全部 ${catalog.totals.partitions} 个分区 · ${catalog.totals.documents} 份 · ${catalog.totals.chunks} 段 · 已向量化 ${catalog.totals.embedded} 段 · 占用 ${formatSize(catalog.totals.bytes)}`}
          </span>
        </div>
      ) : null}

      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.xlsx,.xls,.csv,.md,.markdown,.txt,.text,.log,.html,.htm,.png,.jpg,.jpeg,.webp,.gif"
        onChange={(event) => {
          upload(event.target.files)
          event.target.value = ''
        }}
      />

      <div className="cs-scope">
        <span className="cs-muted">回答范围</span>
        <SegmentedControl
          id={`cs-scope-${props.sessionId}`}
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={changeScope}
          label="回答范围"
          disabled={busy}
          className="cs-segments"
        />
        <span className="cs-muted">
          {scope === 'library' ? '只依据资料原文回答' : '可以补充资料库外的内容'}
        </span>
      </div>

      <div className="cs-row">
        <Input
          value={folder}
          placeholder="导入目录（Host 上的绝对路径）"
          onChange={(event) => { setFolder(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') importFolder()
          }}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={importFolder}>导入目录</Button>
      </div>

      {pendingFolder === null ? null : (
        <div className="cs-confirm">
          <span className="cs-muted">
            {`将导入 ${pendingFolder.files.length} 个文件，合计 ${formatSize(pendingFolder.totalBytes)}`}
            {pendingFolder.images === 0 ? '' : `，其中 ${pendingFolder.images} 张图片要交给视觉模型转写`}
            {pendingFolder.skipped.length === 0 ? '' : `，另有 ${pendingFolder.skipped.length} 个不支持的文件会跳过`}
          </span>
          <div className="cs-row">
            <Button size="sm" variant="primary" disabled={busy} onClick={importPendingFolder}>确认导入</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPendingFolder(null) }}>取消</Button>
          </div>
        </div>
      )}

      {progress === null && !running ? null : (
        <div className="cs-progress">
          <span>
            {progress === null
              ? `向量化 ${view.stats?.embedding.done ?? 0} / ${view.stats?.embedding.total ?? 0}`
              : `${PHASES[progress.phase]} ${progress.done} / ${progress.total}`}
          </span>
          <div className="cs-progress-track">
            <div
              className="cs-progress-bar"
              style={{
                width: `${progress === null
                  ? percent(view.stats?.embedding.done ?? 0, view.stats?.embedding.total ?? 0)
                  : percent(progress.done, progress.total)}%`,
              }}
            />
          </div>
        </div>
      )}

      {view.stats?.embedding.error === null || view.stats?.embedding.error === undefined
        ? null
        : <div className="cs-error">{view.stats.embedding.error}</div>}
      {error === null ? null : <div className="cs-error">{error}</div>}
      {note === null ? null : <div className="cs-muted">{note}</div>}

      <div className="cs-list">
        {view.documents.length === 0
          ? <div className="cs-empty">还没有资料。上传文件，或导入一个目录。</div>
          : view.documents.map((document) => (
            <div key={document.id} className="cs-doc">
              <button type="button" className="cs-doc-main" onClick={() => { inspect(document) }}>
                <span className="cs-name">{document.title}</span>
                <span className="cs-muted">
                  {document.kind} · {formatSize(document.bytes)} · {document.chunkCount} 段 · 向量 {document.embeddedChunks}
                </span>
              </button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { remove(document) }}>删除</Button>
            </div>
          ))}
      </div>

      {open === null ? null : (
        <div className="cs-detail">
          <div className="cs-panel-head">
            <span className="cs-panel-title">{open.document.title}</span>
            <span className="cs-grow" />
            <Button size="sm" variant="ghost" onClick={() => { setOpen(null) }}>关闭</Button>
          </div>
          {open.chunks.map((chunk) => (
            <div key={chunk.id} className="cs-chunk">
              <div className="cs-muted">#{chunk.ordinal} {place(chunk.page, chunk.heading)}</div>
              <div>{chunk.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className="cs-row">
        <Input
          value={query}
          placeholder={globalMode ? '检索全部分区，不调用模型' : '只用资料库检索，不调用模型'}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') search()
          }}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={search}>检索</Button>
      </div>

      {hits === null ? null : (
        <div className="cs-hits">
          {hits.length === 0
            ? <div className="cs-empty">资料库里没有匹配的内容。</div>
            : hits.map((hit) => (
              <div key={hit.chunkId} className="cs-cite">
                <div className="cs-cite-head">
                  [{hit.index}] {hit.partition === undefined ? '' : `${hit.partition} · `}{hit.title} {place(hit.page, hit.heading)}
                </div>
                <div>{hit.text}</div>
              </div>
            ))}
        </div>
      )}

      <div className="cs-panel-foot">
        <span className="cs-muted">
          {view.stats === null
            ? ''
            : view.stats.embeddingReady ? `嵌入模型 ${view.stats.embeddingModel}` : '嵌入不可用，导入的资料无法生成向量'}
        </span>
        <span className="cs-grow" />
        <span className="cs-muted cs-path" title={view.stats?.file ?? ''}>
          {view.stats === null ? '' : `${view.stats.file} · ${formatSize(view.stats.bytes)}`}
        </span>
      </div>
    </div>
  )
}

/** Header entry that opens the library panel. */
export function LibraryToggle(props: { openPanel: () => void }): ReactElement {
  return (
    <Button size="sm" variant="ghost" onClick={props.openPanel} title="资料库">
      资料库
    </Button>
  )
}
