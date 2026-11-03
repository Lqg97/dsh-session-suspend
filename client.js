/**
 * Browser half of the session-suspend bundle.
 *
 * 挂起模式落在侧边栏会话列表上：Session 行的「...」菜单和悬停按钮各多一项
 * 「挂起会话」，把空闲会话收进侧边栏底部的「已挂起」折叠组；折叠组默认收起，
 * 点开后可逐个恢复（或恢复并打开）以及全部恢复。
 *
 * 列表本身由 ui-workspace 渲染，插件无法从列表里“拿走”一行，因此挂起的落点
 * 借用宿主已有的归档状态：Host 的默认归档筛选会把已归档行移出列表，而本插件
 * 只记录“由挂起动作归档”的会话，只有这些会话出现在自己的折叠组里；用户在
 * 宿主的归档筛选里手动取消归档时，本集合按 Workspace 快照自动清理。
 */
window.__ModuleLoader__.load({
	id: '@local/dsh-session-suspend',
	factory: (require) => {
		const React = require('react');
		const ReactDOM = require('react-dom');
		const h = React.createElement;

		/** 本插件拥有的 Client locale 命名空间。 */
		const NS = 'dsh-session-suspend';
		/** 挂起集合的浏览器本地存储键。 */
		const STORAGE_KEY = 'dsh.session-suspend.v1';
		/** Session 行「...」菜单：排在宿主 archive（400）之后、session-id（450）之前。 */
		const MENU_SLOT = 'sidebar.workspaces.session.menu.item';
		const MENU_ID = 'session-suspend.suspend';
		const MENU_ORDER = 420;
		/** Session 行悬停按钮：排在宿主 archive（100）之前。 */
		const ROW_ACTION_SLOT = 'sidebar.workspaces.session.row.action';
		const ROW_ACTION_ID = 'session-suspend.suspend';
		const ROW_ACTION_ORDER = 90;
		/** 侧边栏底部：收起态折叠组的入口。 */
		const GROUP_SLOT = 'sidebar.footer.action';
		const GROUP_ID = 'session-suspend.group';
		const GROUP_ORDER = 20;
		/** 全帧浮层：挂起 / 恢复的提示条，不依赖侧边栏底部是否可见。 */
		const TOAST_SLOT = 'shell.overlay';
		const TOAST_ID = 'session-suspend.toast';
		const TOAST_ORDER = 30;
		/** 刚归档的会话可能还没进 Workspace 快照，留出这段宽限再清理本地集合。 */
		const PRUNE_GRACE_MS = 8000;
		/** 提示条停留时长。 */
		const NOTICE_MS = 5000;

		/** 简体中文字典（键集以此为准）。 */
		const zh = {
			'meta.title': '会话挂起',
			'meta.description': '给侧边栏会话列表加挂起模式：把空闲会话收进侧边栏底部的折叠组，需要时再恢复回列表。',
			'group.label': '已挂起 {n}',
			'group.aria': '已挂起 {n} 个会话，点击展开',
			'group.title': '已挂起',
			'group.count': '{n} 个',
			'group.empty': '没有挂起的会话',
			'group.hint': '挂起会把会话从列表收起，恢复后回到原位置。',
			'group.resumeAll': '全部恢复',
			'group.collapse': '收起',
			'group.tip': '点开已挂起会话组',
			'row.open': '恢复并打开',
			'row.resume': '恢复',
			'row.openAria': '恢复并打开「{title}」',
			'row.resumeAria': '恢复「{title}」',
			'menu.suspend': '挂起会话',
			'menu.resume': '取消挂起',
			'action.suspend': '挂起会话',
			'toast.suspended': '已挂起「{title}」',
			'toast.restored': '已恢复「{title}」',
			'toast.busy': '「{title}」还在运行，停止后再挂起',
			'toast.failed': '无法挂起「{title}」',
			'toast.restoreFailed': '无法恢复「{title}」',
			'toast.undo': '撤销',
			'toast.close': '关闭',
			'time.justNow': '刚刚',
			'time.minutes': '{n} 分钟前',
			'time.hours': '{n} 小时前',
			'time.days': '{n} 天前',
			'session.untitled': '未命名会话',
			'session.new': '新会话',
			'workspace.defaultName': '工作区',
		};

		/** English dictionary. */
		const en = {
			'meta.title': 'Session Suspend',
			'meta.description': 'Adds a suspend mode to the sidebar session list: fold idle sessions into a collapsed group at the sidebar foot and restore them there.',
			'group.label': '{n} suspended',
			'group.aria': '{n} suspended sessions, open the group',
			'group.title': 'Suspended',
			'group.count': '{n} total',
			'group.empty': 'No suspended sessions',
			'group.hint': 'Suspending folds a session out of the list; restoring puts it back where it was.',
			'group.resumeAll': 'Restore all',
			'group.collapse': 'Collapse',
			'group.tip': 'Open the suspended group',
			'row.open': 'Restore and open',
			'row.resume': 'Restore',
			'row.openAria': 'Restore and open "{title}"',
			'row.resumeAria': 'Restore "{title}"',
			'menu.suspend': 'Suspend session',
			'menu.resume': 'Unsuspend session',
			'action.suspend': 'Suspend session',
			'toast.suspended': 'Suspended "{title}"',
			'toast.restored': 'Restored "{title}"',
			'toast.busy': '"{title}" is still running — stop it before suspending',
			'toast.failed': 'Could not suspend "{title}"',
			'toast.restoreFailed': 'Could not restore "{title}"',
			'toast.undo': 'Undo',
			'toast.close': 'Close',
			'time.justNow': 'just now',
			'time.minutes': '{n} min ago',
			'time.hours': '{n} h ago',
			'time.days': '{n} d ago',
			'session.untitled': 'Untitled session',
			'session.new': 'New session',
			'workspace.defaultName': 'Workspace',
		};

		/** 插件自己的样式；只引用宿主主题变量，容器与控件跟随宿主外观。 */
		const CSS = `
.dss-menu-row{position:relative}
.dss-menu-row-separator{height:.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
.dss-menu-button{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left}
.dss-menu-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dss-menu-button:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dss-menu-button-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary))}
.dss-menu-button-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dss-row-button{border-radius:var(--dsw-radius-xs);cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:transparent;border:none;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}
.dss-row-button:hover{color:var(--dsw-alias-label-primary)}
.dss-row-button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dss-tooltip-host{display:inline-flex;align-items:center}
.dss-tooltip{display:inline-flex;align-items:safe center;gap:8px;position:fixed;z-index:1100;width:max-content;box-sizing:border-box;max-width:min(50vw,calc(100vw - 24px));padding:3px 7px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-tooltip-bg,rgba(20,22,28,.92));color:var(--dsw-static-neutral-bluish-00,#fff);font-size:13px;line-height:20px;white-space:pre-line;overflow-wrap:break-word;pointer-events:none;animation:dss-tooltip-in .15s var(--ds-ease-in-out,ease-out)}
.dss-tooltip[data-side="bottom"]{transform:translate(-50%)}
.dss-tooltip[data-side="bottom"][data-align="end"]{transform:translate(-100%)}
.dss-tooltip[data-side="top"]{transform:translate(-50%,-100%)}
.dss-tooltip[data-side="top"][data-align="end"]{transform:translate(-100%,-100%)}
.dss-tooltip-label{min-width:0}
@keyframes dss-tooltip-in{0%{opacity:0}100%{opacity:1}}
.dss-chip{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:16px;flex:none;position:relative}
.dss-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-chip[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-chip:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dss-chip[data-fresh="true"]{animation:dss-chip-pulse 1.2s var(--ds-ease-in-out,ease-out)}
@keyframes dss-chip-pulse{0%{box-shadow:0 0 0 0 var(--dsw-alias-brand-primary)}60%{box-shadow:0 0 0 5px rgba(0,0,0,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}
.dss-chip[data-rail="true"]{padding:0;width:28px}
.dss-chip-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:132px}
.dss-panel{position:fixed;z-index:130;box-sizing:border-box;width:288px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel,var(--dsw-radius-md));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));pointer-events:auto;animation:dss-panel-in .12s var(--ds-ease-in-out,ease-out)}
.dss-panel:focus{outline:none}
@keyframes dss-panel-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dss-panel-header{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dss-panel-title{flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dss-panel-count{font-weight:400;color:var(--dsw-alias-label-tertiary)}
.dss-panel-action{border:none;background:transparent;padding:2px 4px;border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11px;line-height:16px;flex:none}
.dss-panel-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-panel-action:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dss-panel-list{display:flex;flex-direction:column;gap:2px;padding:4px;overflow-y:auto;overscroll-behavior:contain}
.dss-panel-item{position:relative;display:flex;align-items:center;gap:8px}
.dss-panel-item-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;text-align:left;font:inherit;color:var(--dsw-alias-label-primary)}
.dss-panel-item-body:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dss-panel-item-body:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dss-panel-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px}
.dss-panel-item-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dss-panel-item-restore{flex:none;border:none;background:transparent;width:24px;height:24px;border-radius:var(--dsw-radius-xs);display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}
.dss-panel-item-restore:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-panel-item-restore:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dss-panel-empty{padding:14px 10px;text-align:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dss-panel-hint{padding:6px 10px 8px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dss-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:140;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:max-content;max-width:min(520px,calc(100vw - 48px));padding:12px 12px 12px 16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,var(--dsw-radius-md));background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));pointer-events:none;animation:dss-toast-in .16s ease-out}
.dss-toast-icon{display:grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary)}
.dss-toast-icon[data-kind="restored"]{color:var(--dsw-alias-state-success-primary)}
.dss-toast-icon[data-kind="busy"],.dss-toast-icon[data-kind="failed"],.dss-toast-icon[data-kind="restoreFailed"]{color:var(--dsw-alias-state-warn-primary)}
.dss-toast-icon[data-kind="failed"],.dss-toast-icon[data-kind="restoreFailed"]{color:var(--dsw-alias-state-error-primary)}
.dss-toast-text{min-width:0}
.dss-toast-action{border:none;background:none;padding:0;margin-inline:2px;color:var(--dsw-alias-brand-primary);cursor:pointer;font:inherit;font-size:14px;line-height:22px;flex:none;pointer-events:auto}
.dss-toast-action:hover{opacity:.8}
.dss-toast-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;pointer-events:auto}
.dss-toast-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dss-toast-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:-2px}
@keyframes dss-toast-in{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
`;

		/**
		 * 读取本地挂起集合：`{ [sessionId]: 挂起时间戳 }`。坏数据一律当作空集合，
		 * 不让一次存储异常挡住整个插件。
		 * @returns {Record<string, number>} 挂起集合。
		 */
		function readSuspended() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return {};
				const parsed = JSON.parse(raw);
				const ids = parsed === null || typeof parsed !== 'object' ? undefined : parsed.ids;
				if (ids === null || typeof ids !== 'object') return {};
				const next = {};
				for (const [id, at] of Object.entries(ids)) {
					if (typeof at === 'number' && Number.isFinite(at)) next[id] = at;
				}
				return next;
			} catch (reason) {
				console.warn('[session-suspend] 读取本地挂起集合失败:', reason);
				return {};
			}
		}

		/** 挂起集合的当前快照（不可变对象，只在写入时换引用）。 */
		let suspended = readSuspended();
		/** 挂起集合的订阅者。 */
		const suspendListeners = new Set();

		/**
		 * 写入挂起集合并持久化。
		 * @param {Record<string, number>} next - 新集合。
		 * @returns {void}
		 */
		function commitSuspended(next) {
			suspended = next;
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: next }));
			} catch (reason) {
				console.warn('[session-suspend] 写入本地挂起集合失败:', reason);
			}
			for (const listener of [...suspendListeners]) listener();
		}

		/**
		 * 订阅挂起集合。
		 * @param {() => void} listener - 变更回调。
		 * @returns {() => void} 取消订阅。
		 */
		function subscribeSuspended(listener) {
			suspendListeners.add(listener);
			return () => {
				suspendListeners.delete(listener);
			};
		}

		/** 组件侧读取挂起集合的 Hook。 */
		function useSuspendedMap() {
			return React.useSyncExternalStore(subscribeSuspended, () => suspended, () => suspended);
		}

		/**
		 * 标记会话已挂起；已存在时保持原时间戳，避免重复写入。
		 * @param {string} sessionId - 会话 id。
		 * @returns {void}
		 */
		function markSuspended(sessionId) {
			if (Object.prototype.hasOwnProperty.call(suspended, sessionId)) return;
			commitSuspended({ ...suspended, [sessionId]: Date.now() });
		}

		/**
		 * 标记会话已恢复（含在宿主任意入口取消归档后的本地清理）。
		 * @param {string} sessionId - 会话 id。
		 * @returns {void}
		 */
		function markResumed(sessionId) {
			if (!Object.prototype.hasOwnProperty.call(suspended, sessionId)) return;
			const next = { ...suspended };
			delete next[sessionId];
			commitSuspended(next);
		}

		/**
		 * 批量清理：只删本地集合，不改 Host 状态。
		 * @param {string[]} sessionIds - 待清理的会话 id。
		 * @returns {void}
		 */
		function pruneSuspended(sessionIds) {
			const next = { ...suspended };
			let changed = false;
			for (const sessionId of sessionIds) {
				if (!Object.prototype.hasOwnProperty.call(next, sessionId)) continue;
				delete next[sessionId];
				changed = true;
			}
			if (changed) commitSuspended(next);
		}

		/** 当前提示条内容（`{ kind, sessionId }`），null 表示没有提示。 */
		let notice = null;
		/** 提示条订阅者。 */
		const noticeListeners = new Set();
		/** 提示条自动收起计时器。 */
		let noticeTimer = null;

		/**
		 * 发布一条提示，替换上一条并重新计时。
		 * @param {{ kind: string, sessionId: string } | null} next - 新提示。
		 * @returns {void}
		 */
		function publishNotice(next) {
			notice = next;
			if (noticeTimer !== null) {
				window.clearTimeout(noticeTimer);
				noticeTimer = null;
			}
			if (next !== null) {
				noticeTimer = window.setTimeout(() => {
					notice = null;
					noticeTimer = null;
					for (const listener of [...noticeListeners]) listener();
				}, NOTICE_MS);
			}
			for (const listener of [...noticeListeners]) listener();
		}

		/**
		 * 订阅提示条。
		 * @param {() => void} listener - 变更回调。
		 * @returns {() => void} 取消订阅。
		 */
		function subscribeNotice(listener) {
			noticeListeners.add(listener);
			return () => {
				noticeListeners.delete(listener);
			};
		}

		/** 组件侧读取提示条的 Hook。 */
		function useNotice() {
			return React.useSyncExternalStore(subscribeNotice, () => notice, () => notice);
		}

		/** 新月图标：挂起 / 收起。 */
		function MoonIcon({ size = 14 }) {
			return h('svg', {
				viewBox: '0 0 16 16',
				width: size,
				height: size,
				fill: 'none',
				'aria-hidden': true,
				style: { display: 'block' },
			}, h('path', {
				d: 'M13.2 9.7A5.7 5.7 0 1 1 6.3 2.8a4.6 4.6 0 0 0 6.9 6.9Z',
				stroke: 'currentColor',
				strokeWidth: 1.4,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
			}));
		}

		/** 回退箭头图标：恢复。 */
		function RestoreIcon({ size = 14 }) {
			return h('svg', {
				viewBox: '0 0 16 16',
				width: size,
				height: size,
				fill: 'none',
				'aria-hidden': true,
				style: { display: 'block' },
			}, h('path', {
				d: 'M3 7.2a5 5 0 1 1 1.5 4.6M3 3.4v3.8h3.8',
				stroke: 'currentColor',
				strokeWidth: 1.4,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
			}));
		}

		/** 警告图标：失败 / 会话仍在运行。 */
		function WarnIcon({ size = 16 }) {
			return h('svg', {
				viewBox: '0 0 16 16',
				width: size,
				height: size,
				fill: 'none',
				'aria-hidden': true,
				style: { display: 'block' },
			},
				h('circle', { cx: 8, cy: 8, r: 6.4, stroke: 'currentColor', strokeWidth: 1.4 }),
				h('path', { d: 'M8 4.9v3.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
				h('circle', { cx: 8, cy: 11.2, r: 0.85, fill: 'currentColor' }));
		}

		/** 关闭图标。 */
		function CloseIcon({ size = 14 }) {
			return h('svg', {
				viewBox: '0 0 16 16',
				width: size,
				height: size,
				fill: 'none',
				'aria-hidden': true,
				style: { display: 'block' },
			}, h('path', {
				d: 'M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8',
				stroke: 'currentColor',
				strokeWidth: 1.5,
				strokeLinecap: 'round',
			}));
		}

		/**
		 * 悬浮提示：宿主 Tooltip 的简化版——默认 500ms 延迟、在触发元素下方右对齐，
		 * 气泡 portal 到 body（Session 行与侧边栏都是 overflow/transform 容器，就地
		 * 渲染会被裁切）。
		 * @param {object} props - 文案、方向、对齐、延迟与触发元素。
		 * @returns {unknown} 触发元素与提示气泡。
		 */
		function Tooltip({ label, side = 'bottom', align = 'end', delayMs = 500, children }) {
			const [anchor, setAnchor] = React.useState(null);
			const hostRef = React.useRef(null);
			const timerRef = React.useRef(null);
			const clearTimer = React.useCallback(() => {
				if (timerRef.current === null) return;
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}, []);
			React.useEffect(() => clearTimer, [clearTimer]);
			const hide = React.useCallback(() => {
				clearTimer();
				setAnchor(null);
			}, [clearTimer]);
			const schedule = () => {
				clearTimer();
				timerRef.current = window.setTimeout(() => {
					timerRef.current = null;
					const node = hostRef.current;
					if (node === null) return;
					const rect = node.getBoundingClientRect();
					setAnchor({ left: rect.right, top: rect.bottom + 6 });
				}, delayMs);
			};
			const bubble = anchor === null ? null : ReactDOM.createPortal(
				h('span', {
					className: 'dss-tooltip',
					role: 'tooltip',
					'data-side': side,
					'data-align': align,
					style: { left: `${anchor.left}px`, top: `${anchor.top}px` },
				}, h('span', { className: 'dss-tooltip-label' }, label)),
				document.body,
			);
			return h(React.Fragment, null,
				h('span', {
					ref: hostRef,
					className: 'dss-tooltip-host',
					onMouseEnter: schedule,
					onMouseLeave: hide,
					onFocus: schedule,
					onBlur: hide,
					onClick: hide,
				}, children),
				bubble);
		}

		/**
		 * 判断归档拒绝是否属于“会话还有工作在跑”。
		 * @param {unknown} reason - `archiveSession` 的拒绝原因。
		 * @returns {boolean} 是否是活动拒绝。
		 */
		function isActiveRefusal(reason) {
			if (!(reason instanceof Error) || reason.name !== 'WorkspaceArchiveError') return false;
			const code = reason.rpcError === undefined || reason.rpcError === null ? undefined : reason.rpcError.code;
			return code === 'workspace/session-active';
		}

		/**
		 * 会话显示标题；没有摘要时退回占位文案。
		 * @param {{ blank?: boolean, title?: string, displayTitle?: string } | undefined} node - 会话摘要节点。
		 * @param {(key: string, params?: Record<string, unknown>) => string} t - 本命名空间的翻译函数。
		 * @returns {string} 显示标题。
		 */
		function sessionTitle(node, t) {
			if (node === undefined || node === null) return t('session.untitled');
			if (node.blank === true) return t('session.new');
			const title = typeof node.displayTitle === 'string' && node.displayTitle !== '' ? node.displayTitle : node.title;
			return typeof title === 'string' && title.trim() !== '' ? title.trim() : t('session.untitled');
		}

		/**
		 * 会话所属 Workspace 的显示标题。
		 * @param {Array<{ title?: string, sessionIds?: string[] }>} workspaceItems - Workspace 列表。
		 * @param {string} sessionId - 会话 id。
		 * @param {(key: string, params?: Record<string, unknown>) => string} t - 翻译函数。
		 * @returns {string | undefined} 标题；会话不在任何已注册 Workspace 中时为 undefined。
		 */
		function workspaceTitle(workspaceItems, sessionId, t) {
			for (const workspace of workspaceItems) {
				if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(sessionId)) continue;
				const title = typeof workspace.title === 'string' ? workspace.title.trim() : '';
				return title === '' ? t('workspace.defaultName') : title;
			}
			return undefined;
		}

		/**
		 * 相对时间文案。
		 * @param {number} at - 毫秒时间戳。
		 * @param {(key: string, params?: Record<string, unknown>) => string} t - 翻译函数。
		 * @returns {string} 相对时间。
		 */
		function relativeTime(at, t) {
			const delta = Date.now() - at;
			if (!(delta >= 60_000)) return t('time.justNow');
			const minutes = Math.floor(delta / 60_000);
			if (minutes < 60) return t('time.minutes', { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return t('time.hours', { n: hours });
			return t('time.days', { n: Math.floor(hours / 24) });
		}

		/**
		 * 菜单行：结构与宿主的菜单项一致（wrap + role="menuitem" 按钮 + 图标 + 文字），
		 * 让本插件的一行与内置的置顶、重命名等行在同一列里对齐。
		 * @param {{ icon: unknown, label: string, onSelect: () => void }} props - 行内容。
		 * @returns {unknown} 菜单行。
		 */
		function MenuRow({ icon, label, onSelect }) {
			return h('div', { className: 'dss-menu-row' }, h('button', {
				type: 'button',
				role: 'menuitem',
				className: 'dss-menu-button',
				onClick: onSelect,
			}, h('span', { className: 'dss-menu-button-icon' }, icon), h('span', { className: 'dss-menu-button-label' }, label)));
		}

		/**
		 * Session 行「...」菜单里的挂起项：本插件挂起的会话在这里是「取消挂起」，
		 * 宿主的归档行负责别的已归档会话。
		 * @param {object} props - owner share、标准 Hook、注入面与本命名空间的翻译函数。
		 * @returns {unknown} 菜单行或 null。
		 */
		function SuspendMenuItem({ sessionId, useMenuOpenState, useWorkspaces, suspendSession, restoreSession, t }) {
			const [, setMenuOpen] = useMenuOpenState();
			const suspendedMap = useSuspendedMap();
			const archivedIds = useWorkspaces((state) => state.archivedSessionIds);
			const archived = Array.isArray(archivedIds) && archivedIds.includes(sessionId);
			const owned = Object.prototype.hasOwnProperty.call(suspendedMap, sessionId);
			if (archived && !owned) return null;
			const resume = owned || archived;
			return h(MenuRow, {
				icon: resume ? h(RestoreIcon, { size: 14 }) : h(MoonIcon, { size: 14 }),
				label: t(resume ? 'menu.resume' : 'menu.suspend'),
				onSelect: () => {
					setMenuOpen(false);
					if (resume) restoreSession(sessionId, false);
					else suspendSession(sessionId);
				},
			});
		}

		/**
		 * Session 行尾部悬停按钮：只对在列表里的行显示「挂起」。
		 * @param {object} props - owner share、标准 Hook、注入面与翻译函数。
		 * @returns {unknown} 图标按钮或 null。
		 */
		function SuspendRowButton({ sessionId, useWorkspaces, suspendSession, t }) {
			const archivedIds = useWorkspaces((state) => state.archivedSessionIds);
			if (Array.isArray(archivedIds) && archivedIds.includes(sessionId)) return null;
			const label = t('action.suspend');
			return h(Tooltip, { label }, h('button', {
				type: 'button',
				className: 'dss-row-button',
				'aria-label': label,
				onClick: () => suspendSession(sessionId),
			}, h(MoonIcon, { size: 14 })));
		}

		/**
		 * 侧边栏底部的「已挂起」折叠组：收起时只有一枚带计数的月亮按钮，展开后
		 * 是固定定位的浮层列表（恢复 / 恢复并打开 / 全部恢复）。
		 * @param {object} props - 列宽标志、标准 Hook、注入面与翻译函数。
		 * @returns {unknown} 折叠组。
		 */
		function SuspendGroup({ wide, useWorkspaces, useSessions, restoreSession, t }) {
			const suspendedMap = useSuspendedMap();
			const archivedIds = useWorkspaces((state) => state.archivedSessionIds);
			const workspacePhase = useWorkspaces((state) => state.phase);
			const workspaceStreamState = useWorkspaces((state) => state.state);
			const workspaceItems = useWorkspaces((state) => state.items);
			const nodes = useSessions((state) => state.byId);
			const workspaceReady = workspacePhase === 'ready' && workspaceStreamState !== 'loading';
			const [open, setOpen] = React.useState(false);
			const [anchor, setAnchor] = React.useState(null);
			const [pruneTick, setPruneTick] = React.useState(0);
			const [fresh, setFresh] = React.useState(false);
			const chipRef = React.useRef(null);
			const panelRef = React.useRef(null);
			const previousCount = React.useRef(0);
			const archivedSet = React.useMemo(() => new Set(Array.isArray(archivedIds) ? archivedIds : []), [archivedIds]);
			const items = React.useMemo(() => {
				return Object.entries(suspendedMap)
					.filter(([sessionId]) => !workspaceReady || archivedSet.has(sessionId))
					.sort((a, b) => b[1] - a[1])
					.map(([sessionId, at]) => ({
						sessionId,
						at,
						title: sessionTitle(nodes[sessionId], t),
						workspace: workspaceTitle(Array.isArray(workspaceItems) ? workspaceItems : [], sessionId, t),
					}));
			}, [suspendedMap, workspaceReady, archivedSet, nodes, workspaceItems, t]);
			const count = items.length;

			// 在宿主的归档筛选或行菜单里取消归档后，本地集合跟着收缩；刚归档的
			// 行还没进快照时用时间宽限避开这一帧。落在宽限期里的项排一个唤醒，
			// 避免“快照此后不再变化”时把残留项一直留在组里。
			React.useEffect(() => {
				if (!workspaceReady) return undefined;
				const now = Date.now();
				const stale = [];
				let wakeAfter = Infinity;
				for (const [sessionId, at] of Object.entries(suspendedMap)) {
					if (archivedSet.has(sessionId) || typeof at !== 'number') continue;
					const remaining = at + PRUNE_GRACE_MS - now;
					if (remaining <= 0) stale.push(sessionId);
					else if (remaining < wakeAfter) wakeAfter = remaining;
				}
				if (stale.length > 0) pruneSuspended(stale);
				if (wakeAfter === Infinity) return undefined;
				const handle = window.setTimeout(() => setPruneTick((tick) => tick + 1), wakeAfter + 50);
				return () => window.clearTimeout(handle);
			}, [workspaceReady, archivedSet, suspendedMap, pruneTick]);

			// 组里已经没有会话时收起自家浮层。
			React.useEffect(() => {
				if (count === 0) setOpen(false);
			}, [count]);

			// 新收进会话时让底部入口闪一下，说明会话被收到了哪里。
			React.useEffect(() => {
				const previous = previousCount.current;
				previousCount.current = count;
				if (count <= previous) return undefined;
				setFresh(true);
				const handle = window.setTimeout(() => setFresh(false), 1200);
				return () => window.clearTimeout(handle);
			}, [count]);

			React.useEffect(() => {
				if (!open) return undefined;
				const panel = panelRef.current;
				if (panel !== null) panel.focus();
				const closeOnOutside = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (panel !== null && panel.contains(target)) return;
					const chip = chipRef.current;
					if (chip !== null && chip.contains(target)) return;
					setOpen(false);
				};
				const closeOnKey = (event) => {
					if (event.key !== 'Escape') return;
					setOpen(false);
					const chip = chipRef.current;
					if (chip !== null) chip.focus();
				};
				const closeOnResize = () => setOpen(false);
				document.addEventListener('pointerdown', closeOnOutside, true);
				document.addEventListener('keydown', closeOnKey);
				window.addEventListener('resize', closeOnResize);
				return () => {
					document.removeEventListener('pointerdown', closeOnOutside, true);
					document.removeEventListener('keydown', closeOnKey);
					window.removeEventListener('resize', closeOnResize);
				};
			}, [open]);

			const toggle = () => {
				if (open) {
					setOpen(false);
					return;
				}
				const chip = chipRef.current;
				if (chip === null) return;
				const rect = chip.getBoundingClientRect();
				setAnchor({
					left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
					bottom: window.innerHeight - rect.top + 6,
				});
				setOpen(true);
			};

			const restoreAll = () => {
				for (const item of items) restoreSession(item.sessionId, false);
				setOpen(false);
			};

			const chipLabel = wide === false ? t('group.label', { n: count }) : t('group.tip');
			const chip = count === 0 ? null : h(Tooltip, { label: chipLabel }, h('button', {
				ref: chipRef,
				type: 'button',
				className: 'dss-chip',
				'data-rail': wide === false ? 'true' : undefined,
				'data-fresh': fresh ? 'true' : undefined,
				'aria-haspopup': 'dialog',
				'aria-expanded': open,
				'aria-label': t('group.aria', { n: count }),
				onClick: toggle,
			}, h(MoonIcon, { size: 14 }), wide === false
				? null
				: h('span', { className: 'dss-chip-label' }, t('group.label', { n: count }))));

			const left = anchor === null ? 12 : anchor.left;
			const bottom = anchor === null ? 56 : anchor.bottom;
			const rows = items.length === 0
				? h('div', { className: 'dss-panel-empty' }, t('group.empty'))
				: items.map((item) => h('div', { className: 'dss-panel-item', key: item.sessionId },
					h('button', {
						type: 'button',
						className: 'dss-panel-item-body',
						'aria-label': t('row.openAria', { title: item.title }),
						title: t('row.open'),
						onClick: () => {
							setOpen(false);
							restoreSession(item.sessionId, true);
						},
					},
						h('span', { className: 'dss-panel-item-title' }, item.title),
						h('span', { className: 'dss-panel-item-meta' }, [item.workspace, relativeTime(item.at, t)].filter((part) => part !== undefined).join(' · ')),
					),
					h('button', {
						type: 'button',
						className: 'dss-panel-item-restore',
						'aria-label': t('row.resumeAria', { title: item.title }),
						title: t('row.resume'),
						onClick: () => restoreSession(item.sessionId, false),
					}, h(RestoreIcon, { size: 14 })),
				));

			const panel = open
				? h('div', {
					ref: panelRef,
					className: 'dss-panel',
					role: 'dialog',
					'aria-label': t('group.title'),
					tabIndex: -1,
					style: { left: `${left}px`, bottom: `${bottom}px`, maxHeight: 'min(60vh, 420px)' },
				}, [
					h('div', { className: 'dss-panel-header', key: 'header' }, [
						h('span', { className: 'dss-panel-title', key: 'title' }, [
							h('span', { key: 'text' }, t('group.title')),
							h('span', { className: 'dss-panel-count', key: 'count' }, t('group.count', { n: count })),
						]),
						count === 0 ? null : h('button', {
							key: 'restore-all',
							type: 'button',
							className: 'dss-panel-action',
							onClick: restoreAll,
						}, t('group.resumeAll')),
						h('button', {
							key: 'collapse',
							type: 'button',
							className: 'dss-panel-action',
							'aria-label': t('group.collapse'),
							onClick: () => {
								setOpen(false);
								const chipNode = chipRef.current;
								if (chipNode !== null) chipNode.focus();
							},
						}, t('group.collapse')),
					]),
					h('div', { className: 'dss-panel-list', key: 'list' }, rows),
					h('div', { className: 'dss-panel-hint', key: 'hint' }, t('group.hint')),
				])
				: null;

			return h(React.Fragment, null, chip, panel);
		}

		/**
		 * 提示条的水平中心：对齐中间内容列（侧边栏、右侧栏之外那一列）而不是整个
		 * 窗口，避免被侧边栏宽度带偏；拿不到布局时返回 null，由 CSS 退回 50%。
		 * @returns {number | null} 中心横坐标（px），或 null。
		 */
		function measureToastCenter() {
			try {
				const layer = document.querySelector('[data-shell-overlay]');
				const frame = layer === null ? null : layer.parentElement;
				if (frame === null) return null;
				const rect = frame.getBoundingClientRect();
				const columns = getComputedStyle(frame).gridTemplateColumns.split(' ').map((part) => Number.parseFloat(part));
				if (columns.length < 2 || !Number.isFinite(columns[0]) || !Number.isFinite(columns[1])) return null;
				return rect.left + columns[0] + columns[1] / 2;
			} catch (reason) {
				console.warn('[session-suspend] 读取布局列宽失败:', reason);
				return null;
			}
		}

		/**
		 * 挂起动作的提示条：挂在 `shell.overlay`，与侧边栏底部是否可见无关，
		 * 侧边栏收起或宿主隐藏底栏时也不会丢反馈。
		 * @param {object} props - 标准 Hook 与本命名空间的翻译函数。
		 * @returns {unknown} 提示条或 null。
		 */
		function SuspendToast({ useSessions, restoreSession, t }) {
			const currentNotice = useNotice();
			const nodes = useSessions((state) => state.byId);
			const [center, setCenter] = React.useState(null);
			const visible = currentNotice !== null;
			React.useEffect(() => {
				if (!visible) return undefined;
				const update = () => setCenter(measureToastCenter());
				update();
				window.addEventListener('resize', update);
				return () => window.removeEventListener('resize', update);
			}, [visible]);
			if (!visible) return null;
			const title = sessionTitle(nodes[currentNotice.sessionId], t);
			const TOAST_KEYS = {
				busy: 'toast.busy',
				restoreFailed: 'toast.restoreFailed',
				failed: 'toast.failed',
				restored: 'toast.restored',
				suspended: 'toast.suspended',
			};
			const key = TOAST_KEYS[currentNotice.kind] === undefined ? 'toast.suspended' : TOAST_KEYS[currentNotice.kind];
			const undo = currentNotice.kind === 'suspended'
				? h('button', {
					type: 'button',
					className: 'dss-toast-action',
					onClick: () => {
						const sessionId = currentNotice.sessionId;
						publishNotice(null);
						restoreSession(sessionId, false);
					},
				}, t('toast.undo'))
				: null;
			const icon = currentNotice.kind === 'restored'
				? h(RestoreIcon, { size: 16 })
				: currentNotice.kind === 'suspended'
					? h(MoonIcon, { size: 16 })
					: h(WarnIcon, { size: 16 });
			return h('div', {
				className: 'dss-toast',
				role: 'status',
				style: center === null ? undefined : { left: `${center}px` },
			},
				h('span', { className: 'dss-toast-icon', 'data-kind': currentNotice.kind }, icon),
				h('span', { className: 'dss-toast-text' }, t(key, { title })),
				undo,
				h('button', {
					type: 'button',
					className: 'dss-toast-close',
					'aria-label': t('toast.close'),
					onClick: () => publishNotice(null),
				}, h(CloseIcon, { size: 14 })));
		}

		/** 插件声明的依赖：槽系统、词典、侧边栏会话操作与 Workspace 快照。 */
		const inject = ['slots', 'locale', 'uiWorkspace', 'workspaces'];

		/**
		 * Client 半身：词典、样式、折叠组、行菜单项、行悬停按钮与提示条五处注册。
		 * @param {import('@deepseek-ai/cordis').Context} ctx - Client 根上下文。
		 * @returns {void}
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-suspend: dictionaries');
			ctx.effect(() => {
				const tag = document.createElement('style');
				tag.dataset.plugin = '@local/dsh-session-suspend';
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, 'session-suspend: styles');

			/**
			 * 宿主当前的归档集合。动作是否“已挂起”按它判定，而不是按本地记录，
			 * 这样同一行被再点一次只会恢复，绝不会再归档一次。读不到快照时返回
			 * null，调用方按“未知”处理：照请求动作走，不据此跳过 Host 调用。
			 * @returns {string[] | null} 已归档会话 id，或 null。
			 */
			const archivedNow = () => {
				try {
					const snapshot = ctx.workspaces.list.getSnapshot();
					const ids = snapshot === undefined || snapshot === null ? undefined : snapshot.archivedSessionIds;
					return Array.isArray(ids) ? ids : null;
				} catch (reason) {
					console.warn('[session-suspend] 读取 Workspace 快照失败:', reason);
					return null;
				}
			};

			/**
			 * 导航到一个会话；打开失败只记日志，不影响已经完成的恢复。
			 * @param {string} sessionId - 会话 id。
			 * @returns {void}
			 */
			const openSession = (sessionId) => {
				try {
					ctx.uiWorkspace.openSession(sessionId);
				} catch (reason) {
					console.warn('[session-suspend] 打开会话失败:', reason);
				}
			};

			/**
			 * 挂起一个空闲会话：Host 的归档集合是唯一事实来源，成功后只补本地
			 * 记录，失败按“仍在运行 / 其他”给出不同提示。已经归档的会话再点
			 * 一次会走恢复，避免“再点一下又归档一个”。
			 * @param {string} sessionId - 会话 id。
			 * @returns {void}
			 */
			const suspendSession = (sessionId) => {
				const archivedIds = archivedNow();
				if (archivedIds !== null && archivedIds.includes(sessionId)) {
					restoreSession(sessionId, false);
					return;
				}
				void ctx.uiWorkspace.archiveSession(sessionId).then(() => {
					markSuspended(sessionId);
					publishNotice({ kind: 'suspended', sessionId });
				}).catch((reason) => {
					const busy = isActiveRefusal(reason);
					if (!busy) console.warn('[session-suspend] 归档被拒绝:', reason);
					publishNotice({ kind: busy ? 'busy' : 'failed', sessionId });
				});
			};

			/**
			 * 恢复一个挂起的会话；`open` 为真时顺带打开它。没有归档标记时只清理
			 * 本地记录，不打扰 Host。
			 * @param {string} sessionId - 会话 id。
			 * @param {boolean} open - 是否在恢复后导航到该会话。
			 * @returns {void}
			 */
			const restoreSession = (sessionId, open) => {
				const archivedIds = archivedNow();
				if (archivedIds !== null && !archivedIds.includes(sessionId)) {
					markResumed(sessionId);
					if (open === true) openSession(sessionId);
					return;
				}
				void ctx.uiWorkspace.unarchiveSession(sessionId).then(() => {
					markResumed(sessionId);
					publishNotice({ kind: 'restored', sessionId });
					if (open === true) openSession(sessionId);
				}).catch((reason) => {
					console.warn('[session-suspend] 取消归档被拒绝:', reason);
					publishNotice({ kind: 'restoreFailed', sessionId });
				});
			};

			/** 所有注册项共用的注入面。 */
			const face = { suspendSession, restoreSession };

			ctx.slots.inject(MENU_SLOT, () => ctx.slots.register({
				name: MENU_SLOT,
				id: MENU_ID,
				order: MENU_ORDER,
				locale: NS,
				inject: () => face,
			}, SuspendMenuItem));

			ctx.slots.inject(ROW_ACTION_SLOT, () => ctx.slots.register({
				name: ROW_ACTION_SLOT,
				id: ROW_ACTION_ID,
				order: ROW_ACTION_ORDER,
				locale: NS,
				inject: () => face,
			}, SuspendRowButton));

			ctx.slots.inject(GROUP_SLOT, () => ctx.slots.register({
				name: GROUP_SLOT,
				id: GROUP_ID,
				order: GROUP_ORDER,
				locale: NS,
				inject: () => face,
			}, SuspendGroup));

			ctx.slots.inject(TOAST_SLOT, () => ctx.slots.register({
				name: TOAST_SLOT,
				id: TOAST_ID,
				order: TOAST_ORDER,
				locale: NS,
				inject: () => face,
			}, SuspendToast));
		}

		return { inject, apply };
	},
});
