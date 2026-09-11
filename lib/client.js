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
		function fetchReview() {
			return fetch("/plugin-management/api/review").then((r) => r.json());
		}
		function PluginManagementView({ close }) {
			const [items, setItems] = (0, react.useState)([]);
			const [review, setReview] = (0, react.useState)(null);
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
				fetchReview().then(setReview).catch(() => {});
			}, []);
			const markReviewed = async () => {
				try {
					await fetch("/plugin-management/api/review", { method: "POST" });
					const d = await fetchReview();
					setReview(d);
					setMsg("已记录回顾，14 天后到期再提醒。");
				} catch (e) {
					setMsg(`回顾确认失败：${String(e)}`);
				}
			};
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
							color: "var(--text-3, #7a7a7a)",
							marginBottom: 8
						},
						children: msg
					}),
					review?.due && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							background: "var(--card-2, #f5f5f7)",
							border: "1px solid var(--border, #e0e0e0)",
							borderRadius: 8,
							padding: "10px 12px",
							marginBottom: 12
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "flex-start",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
								width: "16",
								height: "16",
								viewBox: "0 0 24 24",
								fill: "none",
								"aria-hidden": "true",
								style: {
									flexShrink: 0,
									marginTop: 2,
									color: "var(--text-3, #7a7a7a)"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
										d: "M12 6.25C12.4142 6.25 12.75 6.58579 12.75 7V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V7C11.25 6.58579 11.5858 6.25 12 6.25Z",
										fill: "currentColor"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
										d: "M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z",
										fill: "currentColor"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
										fillRule: "evenodd",
										clipRule: "evenodd",
										d: "M1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z",
										fill: "currentColor"
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { flex: 1 },
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: { fontWeight: 600 },
										children: "按需插件停用回顾提醒"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											fontSize: 12,
											color: "#6b7280",
											margin: "4px 0"
										},
										children: [
											review.daysSince == null ? "尚未做过回顾。" : `已 ${review.daysSince} 天未回顾（周期 ${review.periodDays} 天）。`,
											"请逐项确认以下插件停用 / 保留：",
											review.candidates.join(" / ")
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: markReviewed,
										style: {
											marginTop: 4,
											background: "var(--accent, #0066cc)",
											color: "#fff",
											border: "none",
											borderRadius: 999,
											padding: "6px 16px",
											fontSize: 13,
											fontWeight: 600,
											cursor: "pointer"
										},
										children: "已回顾（下次到期再提醒）"
									})
								]
							})]
						})
					}),
					review && !review.due && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							color: "rgba(0,0,0,.35)",
							fontSize: 12,
							marginBottom: 8
						},
						children: [
							"按需插件回顾：",
							review.daysSince ?? 0,
							" 天前已做，到期后会再提醒。"
						]
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
										it.isCore && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												color: "var(--text-3, #7a7a7a)",
												fontSize: 12,
												display: "inline-flex",
												alignItems: "center",
												gap: 3,
												marginLeft: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												width: "16",
												height: "16",
												viewBox: "0 0 24 24",
												fill: "none",
												"aria-hidden": "true",
												style: { flexShrink: 0 },
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													fillRule: "evenodd",
													clipRule: "evenodd",
													d: "M5.25 9.30277V8C5.25 4.27208 8.27208 1.25 12 1.25C15.7279 1.25 18.75 4.27208 18.75 8V9.30277C18.9768 9.31872 19.1906 9.33948 19.3918 9.36652C20.2919 9.48754 21.0497 9.74643 21.6517 10.3483C22.2536 10.9503 22.5125 11.7081 22.6335 12.6082C22.75 13.4752 22.75 14.5775 22.75 15.9451V16.0549C22.75 17.4225 22.75 18.5248 22.6335 19.3918C22.5125 20.2919 22.2536 21.0497 21.6517 21.6516C21.0497 22.2536 20.2919 22.5125 19.3918 22.6335C18.5248 22.75 17.4225 22.75 16.0549 22.75H7.94513C6.57754 22.75 5.47522 22.75 4.60825 22.6335C3.70814 22.5125 2.95027 22.2536 2.34835 21.6516C1.74643 21.0497 1.48754 20.2919 1.36652 19.3918C1.24996 18.5248 1.24998 17.4225 1.25 16.0549V15.9451C1.24998 14.5775 1.24996 13.4752 1.36652 12.6082C1.48754 11.7081 1.74643 10.9503 2.34835 10.3483C2.95027 9.74643 3.70814 9.48754 4.60825 9.36652C4.80938 9.33948 5.02317 9.31872 5.25 9.30277ZM6.75 8C6.75 5.10051 9.10051 2.75 12 2.75C14.8995 2.75 17.25 5.10051 17.25 8V9.25344C16.8765 9.24999 16.4784 9.24999 16.0549 9.25H7.94513C7.52161 9.24999 7.12353 9.24999 6.75 9.25344V8ZM3.40901 11.409C3.68577 11.1322 4.07435 10.9518 4.80812 10.8531C5.56347 10.7516 6.56459 10.75 8 10.75H16C17.4354 10.75 18.4365 10.7516 19.1919 10.8531C19.9257 10.9518 20.3142 11.1322 20.591 11.409C20.8678 11.6858 21.0482 12.0743 21.1469 12.8081C21.2484 13.5635 21.25 14.5646 21.25 16C21.25 17.4354 21.2484 18.4365 21.1469 19.1919C21.0482 19.9257 20.8678 20.3142 20.591 20.591C20.3142 20.8678 19.9257 21.0482 19.1919 21.1469C18.4365 21.2484 17.4354 21.25 16 21.25H8C6.56459 21.25 5.56347 21.2484 4.80812 21.1469C4.07435 21.0482 3.68577 20.8678 3.40901 20.591C3.13225 20.3142 2.9518 19.9257 2.85315 19.1919C2.75159 18.4365 2.75 17.4354 2.75 16C2.75 14.5646 2.75159 13.5635 2.85315 12.8081C2.9518 12.0743 3.13225 11.6858 3.40901 11.409Z",
													fill: "currentColor"
												})
											}), "核心"]
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