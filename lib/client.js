window.__ModuleLoader__.load({
	id: "dsh-plugin-management",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/PluginManagementView.tsx
		const CAT_LABEL = {
			memory: "记忆与工作流",
			visual: "会话结构",
			files: "文件与工作区",
			dev: "开发与工程",
			quant: "量化数据",
			ecosystem: "生态与通知",
			skill: "外部技能",
			other: "其他"
		};
		function fetchInventory() {
			return fetch("/plugin-management/api/inventory").then((r) => r.json()).then((d) => d.items ?? []);
		}
		function PluginManagementView({ close }) {
			const [items, setItems] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)("loading");
			const [msg, setMsg] = (0, react.useState)("");
			const reload = () => {
				setLoading("loading");
				fetchInventory().then((its) => {
					setItems(its);
					setLoading("ready");
				}).catch(() => setLoading("error"));
			};
			(0, react.useEffect)(() => {
				reload();
			}, []);
			const toggle = async (name, enabled) => {
				try {
					const d = await (await fetch("/plugin-management/api/toggle", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							name,
							enabled
						})
					})).json();
					if (!d.ok) {
						setMsg(d.reason === "locked" ? "核心/基础插件不可停用" : `变更失败：${d.reason ?? "unknown"}`);
						return;
					}
					setMsg(`已${enabled ? "启用" : "停用"} ${name} —— 需重启 dsh web 生效；变更已备份。`);
					reload();
				} catch (e) {
					setMsg(`请求失败：${String(e)}`);
				}
			};
			if (loading === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { padding: 16 },
				children: "加载中…"
			});
			if (loading === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { padding: 16 },
				children: ["加载失败 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: reload,
					children: "重试"
				})]
			});
			const groups = Object.entries(items.reduce((acc, it) => {
				(acc[it.category] ??= []).push(it);
				return acc;
			}, {}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { padding: 16 },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
						"插件管理 · ",
						items.length,
						" 个插件"
					] }),
					msg && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: "#b45309",
							marginBottom: 8
						},
						children: msg
					}),
					groups.map(([cat, list]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginBottom: 20 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
							style: { margin: "8px 0" },
							children: CAT_LABEL[cat] ?? cat
						}), list.map((it) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "6px 8px",
								borderBottom: "1px solid #eee"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { flex: 1 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { fontWeight: 600 },
									children: [
										it.name,
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: "rgba(0,0,0,.35)",
												fontSize: 11
											},
											children: it.loadKind
										}),
										it.isCore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: "#b45309",
												fontSize: 12
											},
											children: "核心"
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										color: "#6b7280",
										fontSize: 12
									},
									children: it.description || it.spec || ""
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								disabled: it.isCore,
								onClick: () => toggle(it.name, !it.enabled),
								style: { cursor: it.isCore ? "not-allowed" : "pointer" },
								children: it.enabled ? "停用" : "启用"
							})]
						}, it.name))]
					}, cat))
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("pm", {
				zh: { "nav.label": "插件管理" },
				en: { "nav.label": "Plugins" }
			}), "pm: locale");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "plugin-management",
				order: 999,
				locale: "pm",
				label: () => ctx.locale.bind("pm")("nav.label"),
				inject: (owner) => ({ close: owner?.close })
			}, PluginManagementView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map