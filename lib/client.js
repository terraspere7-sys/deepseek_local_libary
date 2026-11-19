window.__ModuleLoader__.load({id:"cyberself",factory:(require)=>{var module={exports:{}};var exports=module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/shared/protocol.ts
/**
* Address that means "every partition of the global library". Passed wherever a
* partition directory is expected; the service merges the results.
*/
const ALL_PARTITIONS = "all";
/** Base path of the HTTP API. */
const API_PREFIX = "/cyberself/api";
/** Path of the endpoint listing the partitions of the global library. */
const PARTITIONS_PATH = "/cyberself/api/partitions";
/** Path of the endpoint that creates one partition. */
const PARTITION_CREATE_PATH = "/cyberself/api/partition";
/** Path of the endpoint that sets the answer scope of the global library. */
const SCOPE_PATH = "/cyberself/api/scope";
/** Path of the endpoint that reads and writes plugin settings. */
const SETTINGS_PATH = "/cyberself/api/settings";
/** Path of the endpoint that turns a workspace into a library, or back. */
const MARK_PATH = "/cyberself/api/mark";
/** Path of the plugin-wide report of what is stored on disk. */
const STORAGE_PATH = "/cyberself/api/storage";
/** Path of the endpoint that removes every document of one library. */
const PURGE_PATH = "/cyberself/api/purge";
/** Path of the endpoint that deletes one library together with its files. */
const FORGET_PATH = "/cyberself/api/forget";

//#endregion
//#region src/client/base.ts
const PREFIX = `${API_PREFIX.replace(/^\/+/u, "")}/`;
/** Absolute URL of one plugin route, anchored at the page itself. */
function endpoint(path) {
	const base = document.baseURI.replace(/[?#].*$/u, "");
	const rooted = base.endsWith("/") ? base : `${base}/`;
	const trimmed = path.replace(/^\/+/u, "");
	const relative = trimmed.startsWith(PREFIX) ? trimmed : `${PREFIX}${trimmed}`;
	return new URL(relative, rooted).toString();
}
async function failure(response) {
	const text = await response.text();
	try {
		const body = JSON.parse(text);
		if (typeof body.error === "string" && body.error !== "") return new Error(body.error);
	} catch {}
	return new Error(text === "" ? `请求失败（${response.status}）` : text);
}
/** POST JSON and decode the JSON response. */
async function postJson(path, body, signal) {
	const response = await fetch(endpoint(path), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw await failure(response);
	return await response.json();
}
/** POST JSON and deliver each server-sent event to the callback. */
async function postStream(path, body, onEvent, signal) {
	const response = await fetch(endpoint(path), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw await failure(response);
	if (response.body === null) throw new Error("回答流没有开始");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) break;
		buffer += decoder.decode(chunk.value, { stream: true });
		let boundary = buffer.indexOf("\n\n");
		while (boundary >= 0) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const line = frame.split("\n").find((part) => part.startsWith("data: "));
			if (line !== void 0) onEvent(JSON.parse(line.slice(6)));
			boundary = buffer.indexOf("\n\n");
		}
	}
}
/** Read a file as base64 without its data-URL prefix. */
async function readBase64(file) {
	const buffer = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	const step = 32768;
	for (let offset = 0; offset < buffer.length; offset += step) binary += String.fromCharCode(...buffer.subarray(offset, offset + step));
	return btoa(binary);
}
/** Human-readable byte count. */
function formatSize(bytes) {
	if (bytes < 1024) return `${bytes} 字节`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

//#endregion
//#region src/client/data.ts
const EMPTY = {
	view: null,
	error: null,
	loading: false,
	stale: false
};
const entries = /* @__PURE__ */ new Map();
const listeners = /* @__PURE__ */ new Set();
function read(dir) {
	return entries.get(dir) ?? EMPTY;
}
function publish(dir, patch) {
	entries.set(dir, {
		...read(dir),
		...patch
	});
	for (const listener of listeners) listener();
}
function subscribe$1(listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
/** Mark every cached library stale, so the next draw re-reads it. */
function invalidateLibraries() {
	for (const [dir, entry] of entries) entries.set(dir, {
		...entry,
		stale: true
	});
	for (const listener of listeners) listener();
}
/** Re-read one library and let every seat showing it redraw. */
function refreshLibrary(dir) {
	publish(dir, {
		loading: true,
		stale: false
	});
	postJson("library", { dir }).then((view) => {
		publish(dir, {
			view,
			error: null,
			loading: false,
			stale: false
		});
	}).catch((reason) => {
		publish(dir, {
			error: reason instanceof Error ? reason.message : String(reason),
			loading: false,
			stale: false
		});
	});
}
/** Load, and re-load, one library directory. */
function useLibrary(dir) {
	const entry = (0, react.useSyncExternalStore)(subscribe$1, () => dir === void 0 ? EMPTY : read(dir));
	const reload = (0, react.useCallback)(() => {
		if (dir !== void 0) refreshLibrary(dir);
	}, [dir]);
	(0, react.useEffect)(() => {
		if (dir === void 0) return;
		if (entries.get(dir) === void 0 || entry.stale) refreshLibrary(dir);
	}, [dir, entry.stale]);
	return {
		view: entry.view,
		error: entry.error,
		loading: entry.loading,
		reload
	};
}
/** Mark or unmark one directory as a library, optionally changing its answer scope. */
async function markLibrary(dir, library, scope) {
	return await postJson(MARK_PATH, {
		dir,
		library,
		scope
	});
}
/** Every partition of the global library, with its counts. */
async function loadPartitions() {
	return await postJson(PARTITIONS_PATH, {});
}
/** Create one partition and return the refreshed picker state. */
async function createPartition(name$1) {
	return await postJson(PARTITION_CREATE_PATH, { name: name$1 });
}
/** Set the answer scope of the whole global library. */
async function setLibraryScope(scope) {
	return await postJson(SCOPE_PATH, { scope });
}
/** Upload one browser file through the import stream. */
async function importUpload(dir, file, onProgress, signal) {
	const data = await readBase64(file);
	let imported = null;
	await postStream("import", {
		dir,
		name: file.name,
		data
	}, (event) => {
		if (event.kind === "progress") onProgress(event);
		else if (event.kind === "import") imported = event.view;
		else if (event.kind === "error") throw new Error(event.message);
	}, signal);
	if (imported === null) throw new Error("导入没有返回结果");
	return imported;
}
/** Import one file that already lives on the Host. */
async function importPath(dir, path, onProgress, signal) {
	let imported = null;
	await postStream("import", {
		dir,
		path
	}, (event) => {
		if (event.kind === "progress") onProgress(event);
		else if (event.kind === "import") imported = event.view;
		else if (event.kind === "error") throw new Error(event.message);
	}, signal);
	if (imported === null) throw new Error("导入没有返回结果");
	return imported;
}
/** Files under one directory that the plugin can import. */
async function scanDirectory(dir, path) {
	return await postJson("scan", {
		dir,
		path
	});
}
/** Start filling in missing vectors; the run continues after the response. */
async function embedMissing(dir, onProgress, signal) {
	let done = { remaining: 0 };
	await postStream("embed", { dir }, (event) => {
		if (event.kind === "progress") onProgress(event);
		else if (event.kind === "embedded") done = { remaining: event.remaining };
		else if (event.kind === "error") throw new Error(event.message);
	}, signal);
	return done;
}
async function removeDocument(dir, id) {
	return await postJson("delete", {
		dir,
		id
	});
}
/** Remove every document of one library, keeping the library itself. */
async function purgeLibrary(dir) {
	return await postJson(PURGE_PATH, { dir });
}
/** Delete one library together with its files. */
async function forgetLibrary(dir) {
	return await postJson(FORGET_PATH, { dir });
}
/** What the Host stores for this plugin, and where. */
async function loadStorage() {
	return await postJson(STORAGE_PATH, {});
}
async function loadDocument(dir, id) {
	return await postJson("document", {
		dir,
		id
	});
}
async function searchLibrary(dir, query) {
	return await postJson("search", {
		dir,
		query
	});
}

//#endregion
//#region src/client/workspaces.ts
let source;
/** Point this module at the client Workspace state once the plugin applies. */
function setWorkspaceSource(next) {
	source = next;
}
function subscribe(listener) {
	if (source === void 0) return () => {};
	return source.subscribe(listener);
}
function directoryOf(sessionId) {
	if (source === void 0) return void 0;
	return source.getSnapshot().items.find((item) => item.sessionIds.some((id) => String(id) === sessionId))?.path;
}
/** Directory of the workspace that owns the session, once the workspace list knows it. */
function useSessionDirectory(sessionId) {
	return (0, react.useSyncExternalStore)(subscribe, () => sessionId === void 0 ? void 0 : directoryOf(sessionId));
}

//#endregion
//#region src/client/panel.tsx
const PHASES = {
	parse: "解析",
	write: "写入"
};
/** Imports in flight at once; each one spends most of its time waiting on the model. */
const IMPORT_CONCURRENCY = 3;
/** Browser key that remembers the partition the user picked last. */
const PARTITION_KEY = "cyberself.partition";
async function importAll(items, work) {
	let next = 0;
	const run = async () => {
		for (;;) {
			const index = next;
			next += 1;
			if (index >= items.length) return;
			const item = items[index];
			if (item === void 0) continue;
			await work(item, index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, items.length) }, () => run()));
}
const SCOPE_OPTIONS$1 = [{
	value: "library",
	label: "仅资料库"
}, {
	value: "open",
	label: "允许补充"
}];
function place(page, heading) {
	const parts = [];
	if (page !== null) parts.push(`第 ${page} 页`);
	if (heading !== null && heading !== "") parts.push(heading);
	return parts.join(" · ");
}
function message$1(reason) {
	return reason instanceof Error ? reason.message : String(reason);
}
function percent(done, total) {
	return total === 0 ? 0 : Math.round(done / total * 100);
}
function rememberedPartition() {
	try {
		return window.localStorage.getItem(PARTITION_KEY) ?? "";
	} catch {
		return "";
	}
}
function rememberPartition(name$1) {
	try {
		window.localStorage.setItem(PARTITION_KEY, name$1);
	} catch {}
}
/** Management panel, drawn as the body of the library tab in the right sidebar. */
function LibraryTabBody(props) {
	const sessionDir = useSessionDirectory(props.sessionId);
	const [catalog, setCatalog] = (0, react.useState)(null);
	const [selectedName, setSelectedName] = (0, react.useState)(rememberedPartition);
	const [creating, setCreating] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [progress, setProgress] = (0, react.useState)(null);
	const [busy, setBusy] = (0, react.useState)(false);
	const [folder, setFolder] = (0, react.useState)("");
	const [query, setQuery] = (0, react.useState)("");
	const [hits, setHits] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(null);
	const [note, setNote] = (0, react.useState)(null);
	const [confirming, setConfirming] = (0, react.useState)(false);
	const [pendingFolder, setPendingFolder] = (0, react.useState)(null);
	const picker = (0, react.useRef)(null);
	const globalMode = catalog?.global === true;
	const current = globalMode ? catalog.partitions.find((partition) => partition.name === selectedName) ?? catalog.partitions[0] : void 0;
	const dir = globalMode ? current?.dir : sessionDir;
	const state = useLibrary(dir);
	const view = state.view;
	const running = view?.stats?.embedding.running === true;
	const reloadCatalog = () => {
		loadPartitions().then((next) => {
			setCatalog(next);
		}).catch((reason) => {
			setError(message$1(reason));
		});
	};
	(0, react.useEffect)(() => {
		reloadCatalog();
	}, []);
	(0, react.useEffect)(() => {
		if (!running || dir === void 0) return;
		const timer = setInterval(() => {
			refreshLibrary(dir);
		}, 1500);
		return () => {
			clearInterval(timer);
		};
	}, [running, dir]);
	const pick = (name$1) => {
		setSelectedName(name$1);
		rememberPartition(name$1);
		setHits(null);
		setOpen(null);
		setNote(null);
	};
	const create = () => {
		const name$1 = (creating ?? "").trim();
		if (name$1 === "") return;
		setBusy(true);
		setError(null);
		createPartition(name$1).then((next) => {
			setCatalog(next);
			pick(name$1);
			setCreating(null);
			invalidateLibraries();
		}).catch((reason) => {
			setError(message$1(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	if (catalog === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "cs-panel",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "cs-muted",
			children: "正在读取资料库"
		})
	});
	if (globalMode && dir === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cs-panel",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-empty",
				children: "全局资料库还没有分区。建一个分区（例如 STM32、数学），把资料导进去；之后任何对话都能检索它。"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
					value: creating ?? "",
					placeholder: "分区名，例如 STM32",
					onChange: (event) => {
						setCreating(event.currentTarget.value);
					},
					onKeyDown: (event) => {
						if (event.key === "Enter") create();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: create,
					children: "新建分区"
				})]
			}),
			error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-error",
				children: error
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-muted cs-path",
				title: catalog.root,
				children: catalog.root
			})
		]
	});
	if (dir === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "cs-panel",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "cs-muted",
			children: "正在读取工作区"
		})
	});
	const enable = () => {
		setBusy(true);
		setError(null);
		markLibrary(dir, true).then(() => {
			invalidateLibraries();
			state.reload();
		}).catch((reason) => {
			setError(message$1(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	if (view === null) {
		const failure$1 = state.error;
		return failure$1 === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "cs-panel",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "cs-muted",
				children: "正在读取资料库"
			})
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "cs-panel",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "cs-error",
				children: failure$1
			})
		});
	}
	if (!view.library) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cs-panel",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-empty",
				children: "这个工作区还不是资料库。启用之后，在这个工作区里的对话都能检索它的资料。"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-row",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: enable,
					children: busy ? "启用中" : "设为资料库"
				})
			}),
			error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-error",
				children: error
			})
		]
	});
	const run = async (work) => {
		setBusy(true);
		setError(null);
		setNote(null);
		try {
			setNote(await work());
			state.reload();
			reloadCatalog();
		} catch (reason) {
			setError(message$1(reason));
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};
	const upload = (files) => {
		if (files === null || files.length === 0) return;
		run(async () => {
			const list = Array.from(files);
			const names = new Array(list.length).fill("");
			await importAll(list, async (file, index) => {
				names[index] = (await importUpload(dir, file, setProgress)).duplicateOf === null ? file.name : `${file.name}（已存在）`;
			});
			return `已导入：${names.join("、")}`;
		});
	};
	const importFolder = () => {
		const path = folder.trim();
		if (path === "") return;
		setBusy(true);
		setError(null);
		setNote(null);
		scanDirectory(dir, path).then((scan) => {
			if (scan.files.length === 0) {
				setNote("该目录里没有可导入的文件");
				return;
			}
			setPendingFolder({
				files: scan.files,
				skipped: scan.skipped,
				totalBytes: scan.totalBytes,
				images: scan.images
			});
		}).catch((reason) => {
			setError(message$1(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const importPendingFolder = () => {
		const target = pendingFolder;
		if (target === null) return;
		setPendingFolder(null);
		run(async () => {
			let imported = 0;
			await importAll(target.files, async (file) => {
				await importPath(dir, file, setProgress);
				imported += 1;
			});
			setFolder("");
			const skipped = target.skipped.length === 0 ? "" : `，跳过 ${target.skipped.length} 个不支持的文件`;
			return `已导入 ${imported} 个文件${skipped}`;
		});
	};
	const embed = () => {
		run(async () => {
			const result = await embedMissing(dir, setProgress);
			return result.remaining === 0 ? "所有分块都已有向量" : `已开始向量化，${result.remaining} 段待处理`;
		});
	};
	const changeScope = (next) => {
		if (next === (globalMode ? catalog.scope : view.scope)) return;
		setBusy(true);
		setError(null);
		if (globalMode) {
			setLibraryScope(next).then((next2) => {
				setCatalog(next2);
				invalidateLibraries();
				state.reload();
			}).catch((reason) => {
				setError(message$1(reason));
			}).finally(() => {
				setBusy(false);
			});
			return;
		}
		markLibrary(dir, true, next).then(() => {
			invalidateLibraries();
			state.reload();
		}).catch((reason) => {
			setError(message$1(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const search = () => {
		const text = query.trim();
		if (text === "") return;
		setBusy(true);
		setError(null);
		searchLibrary(globalMode ? ALL_PARTITIONS : dir, text).then((result) => {
			setHits(result.citations);
			setNote(result.note);
		}).catch((reason) => {
			setError(message$1(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const remove = (document$1) => {
		run(async () => {
			await removeDocument(dir, document$1.id);
			if (open !== null && open.document.id === document$1.id) setOpen(null);
			return `已删除《${document$1.title}》`;
		});
	};
	const purge = () => {
		setConfirming(false);
		run(async () => {
			const result = await purgeLibrary(dir);
			setOpen(null);
			setHits(null);
			return result.removed === 0 ? "资料库本来就是空的" : `已删除 ${result.removed} 份资料，释放 ${formatSize(result.reclaimed)}`;
		});
	};
	const inspect = (document$1) => {
		if (open !== null && open.document.id === document$1.id) {
			setOpen(null);
			return;
		}
		loadDocument(dir, document$1.id).then((detail) => {
			setOpen(detail);
		}).catch((reason) => {
			setError(message$1(reason));
		});
	};
	const scope = globalMode ? catalog.scope : view.scope;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cs-panel",
		children: [
			globalMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row cs-partition",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					className: "cs-select",
					value: current?.name ?? "",
					disabled: busy,
					onChange: (event) => {
						pick(event.currentTarget.value);
					},
					"aria-label": "分区",
					children: catalog.partitions.map((partition) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: partition.name,
						children: `${partition.name}（${partition.documents} 份）`
					}, partition.name))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "outline",
					disabled: busy,
					onClick: () => {
						setCreating(creating === null ? "" : null);
					},
					children: creating === null ? "新建分区" : "取消"
				})]
			}) : null,
			creating === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
					value: creating,
					placeholder: "新分区名，例如 STM32",
					onChange: (event) => {
						setCreating(event.currentTarget.value);
					},
					onKeyDown: (event) => {
						if (event.key === "Enter") create();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "primary",
					disabled: busy,
					onClick: create,
					children: "创建"
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-panel-head",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "cs-panel-title",
						children: [
							"资料（",
							view.documents.length,
							"）"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cs-grow" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "primary",
						disabled: busy,
						onClick: () => {
							picker.current?.click();
						},
						children: "上传文件"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "outline",
						disabled: busy || running,
						onClick: embed,
						children: running ? "向量化中" : "向量化全部"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "outline",
						disabled: busy || view.documents.length === 0,
						onClick: () => {
							setConfirming(true);
						},
						children: "清空资料"
					})
				]
			}),
			confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row cs-confirm",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "cs-muted",
						children: [
							"将删除本分区全部 ",
							view.documents.length,
							" 份资料、",
							view.stats?.chunks ?? 0,
							" 段分块与它们的向量，只保留资料库本身。"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "primary",
						disabled: busy,
						onClick: purge,
						children: "确认清空"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						disabled: busy,
						onClick: () => {
							setConfirming(false);
						},
						children: "取消"
					})
				]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-summary",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-tag",
						children: scope === "open" ? "允许补充" : "仅资料库"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-muted",
						children: view.stats === null ? "" : `${view.stats.documents} 份 · ${view.stats.chunks} 段 · 已向量化 ${view.stats.embedded} 段 · 占用 ${formatSize(view.stats.bytes)}`
					}),
					view.stats !== null && !view.stats.embeddingReady ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-warn",
						children: "嵌入不可用"
					}) : null,
					state.error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-error",
						children: state.error
					})
				]
			}),
			globalMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-summary",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cs-muted",
					children: `全部 ${catalog.totals.partitions} 个分区 · ${catalog.totals.documents} 份 · ${catalog.totals.chunks} 段 · 已向量化 ${catalog.totals.embedded} 段 · 占用 ${formatSize(catalog.totals.bytes)}`
				})
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				ref: picker,
				type: "file",
				multiple: true,
				hidden: true,
				accept: ".pdf,.docx,.xlsx,.xls,.csv,.md,.markdown,.txt,.text,.log,.html,.htm,.png,.jpg,.jpeg,.webp,.gif",
				onChange: (event) => {
					upload(event.target.files);
					event.target.value = "";
				}
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-scope",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-muted",
						children: "回答范围"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
						id: `cs-scope-${props.sessionId}`,
						value: scope,
						options: SCOPE_OPTIONS$1,
						onChange: changeScope,
						label: "回答范围",
						disabled: busy,
						className: "cs-segments"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-muted",
						children: scope === "library" ? "只依据资料原文回答" : "可以补充资料库外的内容"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
					value: folder,
					placeholder: "导入目录（Host 上的绝对路径）",
					onChange: (event) => {
						setFolder(event.currentTarget.value);
					},
					onKeyDown: (event) => {
						if (event.key === "Enter") importFolder();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "outline",
					disabled: busy,
					onClick: importFolder,
					children: "导入目录"
				})]
			}),
			pendingFolder === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-confirm",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "cs-muted",
					children: [
						`将导入 ${pendingFolder.files.length} 个文件，合计 ${formatSize(pendingFolder.totalBytes)}`,
						pendingFolder.images === 0 ? "" : `，其中 ${pendingFolder.images} 张图片要交给视觉模型转写`,
						pendingFolder.skipped.length === 0 ? "" : `，另有 ${pendingFolder.skipped.length} 个不支持的文件会跳过`
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cs-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "primary",
						disabled: busy,
						onClick: importPendingFolder,
						children: "确认导入"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "outline",
						disabled: busy,
						onClick: () => {
							setPendingFolder(null);
						},
						children: "取消"
					})]
				})]
			}),
			progress === null && !running ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-progress",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: progress === null ? `向量化 ${view.stats?.embedding.done ?? 0} / ${view.stats?.embedding.total ?? 0}` : `${PHASES[progress.phase]} ${progress.done} / ${progress.total}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cs-progress-track",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cs-progress-bar",
						style: { width: `${progress === null ? percent(view.stats?.embedding.done ?? 0, view.stats?.embedding.total ?? 0) : percent(progress.done, progress.total)}%` }
					})
				})]
			}),
			view.stats?.embedding.error === null || view.stats?.embedding.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-error",
				children: view.stats.embedding.error
			}),
			error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-error",
				children: error
			}),
			note === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-muted",
				children: note
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-list",
				children: view.documents.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cs-empty",
					children: "还没有资料。上传文件，或导入一个目录。"
				}) : view.documents.map((document$1) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cs-doc",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "cs-doc-main",
						onClick: () => {
							inspect(document$1);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cs-name",
							children: document$1.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "cs-muted",
							children: [
								document$1.kind,
								" · ",
								formatSize(document$1.bytes),
								" · ",
								document$1.chunkCount,
								" 段 · 向量 ",
								document$1.embeddedChunks
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						disabled: busy,
						onClick: () => {
							remove(document$1);
						},
						children: "删除"
					})]
				}, document$1.id))
			}),
			open === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-detail",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cs-panel-head",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cs-panel-title",
							children: open.document.title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cs-grow" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "ghost",
							onClick: () => {
								setOpen(null);
							},
							children: "关闭"
						})
					]
				}), open.chunks.map((chunk) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cs-chunk",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-muted",
						children: [
							"#",
							chunk.ordinal,
							" ",
							place(chunk.page, chunk.heading)
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: chunk.text })]
				}, chunk.id))]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
					value: query,
					placeholder: globalMode ? "检索全部分区，不调用模型" : "只用资料库检索，不调用模型",
					onChange: (event) => {
						setQuery(event.currentTarget.value);
					},
					onKeyDown: (event) => {
						if (event.key === "Enter") search();
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
					size: "sm",
					variant: "outline",
					disabled: busy,
					onClick: search,
					children: "检索"
				})]
			}),
			hits === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-hits",
				children: hits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cs-empty",
					children: "资料库里没有匹配的内容。"
				}) : hits.map((hit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cs-cite",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-cite-head",
						children: [
							"[",
							hit.index,
							"] ",
							hit.partition === void 0 ? "" : `${hit.partition} · `,
							hit.title,
							" ",
							place(hit.page, hit.heading)
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: hit.text })]
				}, hit.chunkId))
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-panel-foot",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-muted",
						children: view.stats === null ? "" : view.stats.embeddingReady ? `嵌入模型 ${view.stats.embeddingModel}` : "嵌入不可用，导入的资料无法生成向量"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cs-grow" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cs-muted cs-path",
						title: view.stats?.file ?? "",
						children: view.stats === null ? "" : `${view.stats.file} · ${formatSize(view.stats.bytes)}`
					})
				]
			})
		]
	});
}
/** Header entry that opens the library panel. */
function LibraryToggle(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
		size: "sm",
		variant: "ghost",
		onClick: props.openPanel,
		title: "资料库",
		children: "资料库"
	});
}

//#endregion
//#region src/client/settings.tsx
function message(reason) {
	return reason instanceof Error ? reason.message : String(reason);
}
const SCOPE_OPTIONS = [{
	value: "library",
	label: "仅资料库"
}, {
	value: "open",
	label: "允许补充"
}];
const DEDUPE_OPTIONS = [{
	value: "on",
	label: "只有数字不同就共用向量"
}, {
	value: "off",
	label: "每块单独生成"
}];
function LibrarySettings(props) {
	const [view, setView] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)(null);
	const [busy, setBusy] = (0, react.useState)(false);
	const [baseURL, setBaseURL] = (0, react.useState)("");
	const [model, setModel] = (0, react.useState)("");
	const [timeoutMs, setTimeoutMs] = (0, react.useState)("");
	const [batchSize, setBatchSize] = (0, react.useState)("");
	const [maxChars, setMaxChars] = (0, react.useState)("");
	const [dedupeNumbers, setDedupeNumbers] = (0, react.useState)(true);
	const [visionProvider, setVisionProvider] = (0, react.useState)("");
	const [visionModel, setVisionModel] = (0, react.useState)("");
	const [note, setNote] = (0, react.useState)(null);
	const [storage, setStorage] = (0, react.useState)(null);
	const [pending, setPending] = (0, react.useState)(null);
	const adopt = (0, react.useCallback)((next) => {
		setView(next);
		setBaseURL(next.embedding.baseURL);
		setModel(next.embedding.model);
		setTimeoutMs(String(next.embedding.timeoutMs));
		setBatchSize(String(next.embedding.batchSize));
		setMaxChars(String(next.embedding.maxChars));
		setDedupeNumbers(next.embedding.dedupeNumbers);
		setVisionProvider(next.vision.provider);
		setVisionModel(next.vision.model);
	}, []);
	const load = (0, react.useCallback)(() => {
		setBusy(true);
		postJson(SETTINGS_PATH, {}).then((next) => {
			adopt(next);
			setError(null);
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	}, [adopt]);
	(0, react.useEffect)(() => {
		load();
	}, [load]);
	const reloadStorage = (0, react.useCallback)(() => {
		loadStorage().then((next) => {
			setStorage(next);
		}).catch((reason) => {
			setError(message(reason));
		});
	}, []);
	(0, react.useEffect)(() => {
		reloadStorage();
	}, [reloadStorage]);
	const save = () => {
		setBusy(true);
		setError(null);
		setNote(null);
		postJson(SETTINGS_PATH, { embedding: {
			baseURL,
			model,
			timeoutMs: Number(timeoutMs),
			batchSize: Number(batchSize),
			maxChars: Number(maxChars),
			dedupeNumbers
		} }).then((next) => {
			adopt(next);
			setNote("已保存");
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const saveVision = () => {
		setBusy(true);
		setError(null);
		setNote(null);
		postJson(SETTINGS_PATH, { vision: {
			provider: visionProvider,
			model: visionModel
		} }).then((next) => {
			adopt(next);
			setNote("视觉模型已保存");
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const toggle = (workspace) => {
		setBusy(true);
		setError(null);
		setNote(null);
		markLibrary(workspace.path, !workspace.library).then((result) => {
			setView((current) => current === null ? current : {
				...current,
				workspaces: current.workspaces.map((candidate) => candidate.path === result.dir ? {
					...candidate,
					library: result.library,
					scope: result.scope
				} : candidate)
			});
			setNote(result.library ? `已把《${workspace.title}》设为资料库` : `已把《${workspace.title}》移出资料库`);
			invalidateLibraries();
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const changeScope = (workspace, next) => {
		if (next === workspace.scope) return;
		setBusy(true);
		setError(null);
		setNote(null);
		markLibrary(workspace.path, true, next).then((result) => {
			setView((current) => current === null ? current : {
				...current,
				workspaces: current.workspaces.map((candidate) => candidate.path === result.dir ? {
					...candidate,
					library: result.library,
					scope: result.scope
				} : candidate)
			});
			setNote(next === "library" ? `《${workspace.title}》只依据资料原文回答` : `《${workspace.title}》允许补充资料库外的内容`);
			invalidateLibraries();
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const clearData = (entry, mode) => {
		setPending(null);
		setBusy(true);
		setError(null);
		setNote(null);
		(mode === "purge" ? purgeLibrary(entry.dir) : forgetLibrary(entry.dir)).then(async (result) => {
			setNote(mode === "purge" ? `已清空《${entry.title}》：删除 ${result.removed} 份资料，释放 ${formatSize(result.reclaimed)}` : `已删除《${entry.title}》的资料库文件：${result.removed ? "已移除" : "本来就不存在"}`);
			invalidateLibraries();
			adopt(await postJson(SETTINGS_PATH, {}));
			reloadStorage();
		}).catch((reason) => {
			setError(message(reason));
		}).finally(() => {
			setBusy(false);
		});
	};
	const embedding = view?.embedding ?? null;
	const vision = view?.vision ?? null;
	const visionModels = (vision?.choices ?? []).filter((choice) => visionProvider === "" || choice.provider === visionProvider);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cs-settings",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cs-settings-head",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "cs-settings-title",
						children: "资料库"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cs-grow" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "outline",
						disabled: busy,
						onClick: load,
						children: "重新检测"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
						size: "sm",
						variant: "ghost",
						onClick: props.close,
						children: "关闭"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cs-settings-block",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cs-settings-subtitle",
						children: "嵌入服务"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cs-muted",
						children: ["资料分块后用这里的模型生成向量，检索时先算向量再补关键词。", view === null ? "" : `设置保存在 ${view.file}。`]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-settings-grid",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "服务地址" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: baseURL,
									placeholder: "http://127.0.0.1:11434",
									onChange: (event) => {
										setBaseURL(event.currentTarget.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "模型" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
										value: model,
										placeholder: "bge-m3:latest",
										list: "cyberself-models",
										onChange: (event) => {
											setModel(event.currentTarget.value);
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
										id: "cyberself-models",
										children: (embedding?.installed ?? []).map((name$1) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: name$1 }, name$1))
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "单次超时（毫秒）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: timeoutMs,
									onChange: (event) => {
										setTimeoutMs(event.currentTarget.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "每批条数" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: batchSize,
									onChange: (event) => {
										setBatchSize(event.currentTarget.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "每块字符上限（0 表示整块送进模型）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: maxChars,
									onChange: (event) => {
										setMaxChars(event.currentTarget.value);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cs-field cs-field-wide",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "表格分块去重" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
									id: "cs-settings-dedupe",
									value: dedupeNumbers ? "on" : "off",
									options: DEDUPE_OPTIONS,
									onChange: (next) => {
										setDedupeNumbers(next === "on");
									},
									label: "表格分块去重",
									className: "cs-segments"
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cs-muted",
						children: "模型、每块字符上限或表格分块去重改变后，保存会清空已有向量并在后台重新向量化全部资料。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-settings-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "primary",
								disabled: busy,
								onClick: save,
								children: "保存"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: embedding !== null && embedding.reachable ? "cs-ok" : "cs-warn",
								children: embedding === null ? "" : embedding.reachable ? "连接正常" : "连接失败"
							}),
							embedding?.note === null || embedding === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cs-error",
								children: embedding.note
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cs-settings-block",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cs-settings-subtitle",
						children: "视觉模型"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cs-muted",
						children: "图片、PDF 的扫描页和 Word 里的图片都由这里的模型转写成文字，再进入资料库。 留空表示使用对话里选中的模型。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-settings-grid",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "cs-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "模型路由" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: visionProvider,
									placeholder: "跟随对话",
									list: "cyberself-vision-routes",
									onChange: (event) => {
										setVisionProvider(event.currentTarget.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
									id: "cyberself-vision-routes",
									children: (vision?.routes ?? []).map((route) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: route.id,
										children: route.name
									}, route.id))
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "cs-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "模型" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Input, {
									value: visionModel,
									placeholder: "跟随对话",
									list: "cyberself-vision-models",
									onChange: (event) => {
										setVisionModel(event.currentTarget.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
									id: "cyberself-vision-models",
									children: visionModels.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: choice.model,
										children: [
											choice.providerName,
											" · ",
											choice.name
										]
									}, `${choice.provider}/${choice.model}`))
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cs-muted",
						children: [
							"现在使用 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: vision === null ? "" : `${vision.effectiveProvider}/${vision.effectiveModel}` }),
							vision === null || vision.choices.length === 0 ? "" : `；可选的视觉模型有 ${vision.choices.length} 个`,
							"。"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cs-settings-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
							size: "sm",
							variant: "primary",
							disabled: busy,
							onClick: saveVision,
							children: "保存"
						}), vision?.note === null || vision === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cs-error",
							children: vision.note
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cs-settings-block",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cs-settings-subtitle",
						children: "工作区"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cs-muted",
						children: "被设为资料库的工作区会建一个独立的库，对话里只检索这个库。回答范围决定模型能不能用其他工具取用资料库以外的内容。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cs-list",
						children: (view?.workspaces ?? []).map((workspace) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cs-doc",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cs-doc-main",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cs-name",
										children: workspace.title
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
									id: `cs-settings-scope-${workspace.id}`,
									value: workspace.scope,
									options: SCOPE_OPTIONS,
									onChange: (next) => {
										changeScope(workspace, next);
									},
									label: `${workspace.title} 的回答范围`,
									disabled: busy || !workspace.library,
									className: "cs-segments"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									disabled: busy,
									onClick: () => {
										toggle(workspace);
									},
									children: workspace.library ? "移出资料库" : "设为资料库"
								})
							]
						}, workspace.id))
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cs-settings-block",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cs-settings-subtitle",
						children: "存储"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cs-muted",
						children: [
							"每个资料库各自一个 SQLite 文件，放在工作区下的 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: storage?.root ?? ".cyberself" }),
							" 目录里； 资料原文、分块与向量都只存在这些文件中。插件自身的设置保存在 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: storage?.settingsFile ?? "" }),
							"。"
						]
					}),
					storage === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cs-muted",
						children: "正在读取存储信息"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cs-storage-totals",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [storage.libraries.length, " 个资料库"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [storage.totals.documents, " 份资料"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [storage.totals.chunks, " 段分块"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"已向量化 ",
									storage.totals.embedded,
									" 段"
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["合计占用 ", formatSize(storage.totals.bytes)] })
							]
						}),
						storage.libraries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "cs-muted",
							children: "还没有资料库。把某个工作区设为资料库后，这里会显示它占用的空间。"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cs-list",
							children: storage.libraries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cs-doc cs-storage-row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cs-doc-main",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cs-name",
												children: entry.title
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "cs-muted",
												children: [
													entry.documents,
													" 份 · ",
													entry.chunks,
													" 段 · 已向量化 ",
													entry.embedded,
													" 段 · ",
													formatSize(entry.bytes)
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cs-muted cs-path",
												title: entry.file,
												children: entry.file
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "cs-muted",
												children: entry.updatedAt === null ? "尚未写入" : `最后写入 ${new Date(entry.updatedAt).toLocaleString()}`
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy || entry.documents === 0,
										onClick: () => {
											setPending({
												dir: entry.dir,
												mode: "purge"
											});
										},
										children: "清空资料"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											setPending({
												dir: entry.dir,
												mode: "forget"
											});
										},
										children: "删除数据"
									})
								]
							}, entry.dir))
						}),
						pending === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cs-row cs-confirm",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cs-muted",
									children: pending.mode === "purge" ? "清空后这个工作区仍是资料库，所有资料、分块与向量都会被删除，数据库文件随之缩小。" : "删除数据会移除整个 .cyberself 目录（数据库、向量与资料库标记），这个工作区将不再是资料库。"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "primary",
									disabled: busy,
									onClick: () => {
										const entry = storage?.libraries.find((candidate) => candidate.dir === pending.dir);
										if (entry !== void 0) clearData(entry, pending.mode);
									},
									children: "确认"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									disabled: busy,
									onClick: () => {
										setPending(null);
									},
									children: "取消"
								})
							]
						})
					] })
				]
			}),
			error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-error",
				children: error
			}),
			note === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cs-muted",
				children: note
			})
		]
	});
}

//#endregion
//#region src/client/icons.tsx
/**
* An open book, drawn in the same 16px outline style as the built-in icons.
* @param props - edge length handed over by the owner.
* @returns the glyph.
*/
function BookIcon(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: props.size ?? 16,
		height: props.size ?? 16,
		viewBox: "0 0 16 16",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": "true",
		strokeWidth: 1.3,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M2.5 4.15C4.4 3.25 6.4 3.35 8 4.55C9.6 3.35 11.6 3.25 13.5 4.15V12C11.6 11.1 9.6 11.2 8 12.4C6.4 11.2 4.4 11.1 2.5 12V4.15Z",
			stroke: "currentColor"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M8 4.55V12.4",
			stroke: "currentColor"
		})]
	});
}

//#endregion
//#region src/client/styles.ts
/**
* Styles ship as one text sheet: the client module system has no CSS pipeline
* for third-party plugins, so the seats install it once on first mount.
* @module cyberself/client/styles
*/
/** Attribute marking the injected sheet, so repeat installs are inert. */
const STYLE_MARKER = "data-cyberself-style";
const SHEET = `
.cs-grow { flex: 1 1 auto; }
.cs-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-tag {
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--dsw-alias-text-secondary, #6b6b6b);
  background: var(--dsw-alias-surface-sunken, rgba(0, 0, 0, 0.05));
}
.cs-segments { flex: none; }
.cs-scope { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cs-muted { color: var(--dsw-alias-text-secondary, #6b6b6b); font-size: 12px; }
.cs-warn { color: var(--dsw-alias-text-warning, #b26a00); font-size: 12px; }
.cs-ok { color: var(--dsw-alias-text-success, #2f7d32); font-size: 12px; }
.cs-error { color: var(--dsw-alias-text-danger, #b3261e); font-size: 12px; white-space: pre-wrap; }
.cs-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
}
.cs-panel-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
}
.cs-panel-head { display: flex; align-items: center; gap: 8px; }
.cs-panel-title { font-weight: 600; font-size: 13px; }
.cs-row { display: flex; align-items: center; gap: 8px; }
.cs-row > *:first-child { flex: 1 1 auto; }
.cs-partition > *:first-child { flex: 1 1 auto; }
.cs-select {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--dsw-alias-text-primary, inherit);
  background: var(--dsw-alias-bg-default, #fff);
  border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.12));
}
.cs-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.08));
  background: var(--dsw-alias-bg-subtle, rgba(0, 0, 0, 0.02));
}
.cs-confirm .cs-row > * { flex: none; }
.cs-progress { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.cs-progress-track { height: 4px; border-radius: 2px; background: var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.1)); overflow: hidden; }
.cs-progress-bar { height: 100%; background: var(--dsw-alias-accent, #4a6cf7); }
.cs-list { display: flex; flex-direction: column; gap: 2px; }
.cs-doc { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.cs-doc > button { flex: none; white-space: nowrap; }
.cs-doc-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
  background: none;
  border: none;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
}
.cs-doc-main:hover { background: var(--dsw-alias-surface-hover, rgba(0, 0, 0, 0.05)); }
.cs-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.cs-detail { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--dsw-alias-border-subtle, rgba(0, 0, 0, 0.12)); padding-top: 8px; }
.cs-chunk { display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.55; }
.cs-hits { display: flex; flex-direction: column; gap: 6px; }
.cs-cite { font-size: 12px; line-height: 1.55; padding: 6px 8px; border-radius: 8px; background: var(--dsw-alias-surface-sunken, rgba(0, 0, 0, 0.03)); }
.cs-cite-head { font-weight: 600; margin-bottom: 2px; }
.cs-empty { font-size: 12px; color: var(--dsw-alias-text-secondary, #6b6b6b); padding: 8px 0; }
.cs-settings { display: flex; flex-direction: column; gap: 20px; padding: 4px 2px 24px; }
.cs-settings-head { display: flex; align-items: center; gap: 8px; }
.cs-settings-title { margin: 0; font-size: 16px; font-weight: 600; }
.cs-settings-block { display: flex; flex-direction: column; gap: 8px; }
.cs-settings-subtitle { margin: 0; font-size: 13px; font-weight: 600; }
.cs-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.cs-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.cs-field-wide { grid-column: 1 / -1; }
.cs-field > .cs-segments { align-self: flex-start; }
.cs-settings-actions { display: flex; align-items: center; gap: 10px; }
.cs-confirm {
  padding: 8px;
  border-radius: 8px;
  background: var(--dsw-alias-surface-sunken, rgba(0, 0, 0, 0.04));
  flex-wrap: wrap;
}
.cs-path {
  font-family: var(--dsw-alias-font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.cs-storage-totals { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; }
.cs-storage-row { align-items: flex-start; }
`;
/** Insert the sheet once per document. */
function installStyles() {
	if (document.querySelector(`style[${STYLE_MARKER}]`) !== null) return;
	const style = document.createElement("style");
	style.setAttribute(STYLE_MARKER, "");
	style.textContent = SHEET;
	document.head.appendChild(style);
}

//#endregion
//#region src/client/index.tsx
/** Module identity used by the client module system. */
const name = "cyberself";
/** Client services this plugin needs before it applies. */
const inject = [
	"slots",
	"sidebarRight",
	"sidebarRightTabs",
	"workspaces"
];
/** Registry identity of the library tab type, which is also the seat key of its body. */
const TAB_ID = "cyberself";
/** Kind the library tab is opened by. */
const TAB_KIND = "cyberself.library";
/**
* Register the conversation seats, the sidebar tab and the settings page.
* @param ctx - client plugin scope.
*/
function apply(ctx) {
	installStyles();
	setWorkspaceSource(ctx.workspaces.list);
	const openPanel = () => {
		ctx.sidebarRight.openTab(TAB_KIND);
	};
	ctx.effect(() => ctx.sidebarRightTabs.register({
		id: TAB_ID,
		kind: TAB_KIND,
		title: () => "资料库",
		guide: [{
			order: 60,
			title: () => "资料库",
			description: () => "导入资料、查看分块、检索"
		}]
	}));
	ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
		name: "sidebar.right.pane.tab",
		key: TAB_ID
	}, function LibraryTabSeat(props) {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LibraryTabBody, { sessionId: props.sessionId });
	})));
	ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
		name: "conversation.session.header.utilities",
		id: "cyberself-toggle",
		order: 30
	}, function LibraryToggleSeat() {
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LibraryToggle, { openPanel });
	})));
	ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "cyberself",
		order: 55,
		label: "资料库"
	}, LibrarySettings)));
	ctx.effect(() => ctx.slots.inject("settings.section.icon", () => ctx.slots.register({
		name: "settings.section.icon",
		id: "cyberself"
	}, BookIcon)));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports}})