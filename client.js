window.__ModuleLoader__.load({
	id: 'dsh-webdav-sync',
	factory(require) {
		const React = require('react');
		const h = React.createElement;

		/** Dictionary namespace owned by this plugin. */
		const NS = 'uiWebdavSync';
		/** Id shared by the sidebar entry and the main panel it opens. */
		const PANEL_ID = 'webdav-sync';
		/** Document-relative form of the host route (leading `/` stripped). */
		const ROUTE = '/api/dsh-webdav-sync'.slice(1);

		/* ------------------------------------------------------------------ */
		/* Copy                                                                */
		/* ------------------------------------------------------------------ */

		const zh = {
			panel: 'WebDAV 同步',
			'page.title': 'WebDAV 同步',
			'page.intro': '把 DSH 的设置与状态同步到 WebDAV，供另一台设备拉取。',
			'page.source': '数据来自 dsh-webdav-sync 插件。',
			'ledger.title': '最近同步记录',
			'ledger.empty': '还没有同步记录',
			'ledger.push': '推送',
			'ledger.pull': '拉取',

			'card.connection': '连接配置',
			'card.actions': '同步操作',
			'card.status': '状态',
			'field.remoteUrl': 'WebDAV 地址',
			'field.remoteUrlHint': '例如 https://host/dav/',
			'field.username': '用户名',
			'field.usernameHint': '可留空（匿名访问）',
			'field.password': '密码',
			'field.passwordHint': '留空表示不修改',
			'field.passwordSet': '密码已设置',
			'field.passwordUnset': '密码未设置',
			'actions.save': '保存配置',
			'actions.saved': '配置已保存',
			'actions.status': '刷新状态',
			'actions.push': '推送到云端',
			'actions.pull': '从云端拉取',
			'actions.diff': '对比差异',
			'actions.apply': '应用变更',
			'actions.pending': '进行中…',

			'state.loading': '正在读取…',
			'state.error': '操作失败',
			'state.none': '尚未执行任何操作',
			'state.empty': '（空）',

			'summary.push': '已推送 {count} 个文件',
			'summary.pull': '已拉取 {count} 个文件，跳过 {skipped} 个',
			'summary.pullBackup': '拉取前的本地备份：{dir}',
			'summary.status': '共 {total} 项：一致 {up} · 本地有改动 {changed} · 仅本地 {localOnly} · 仅云端 {remoteOnly}',
			'summary.noRemote': '云端还没有数据，请先执行「推送到云端」。',
			'summary.diff': '差异：改动 {changed} 个，云端新增 {remoteOnly} 个，仅本地 {localOnly} 个',
			'summary.remotePushedBy': '云端由 {host} 于 {at} 推送',
			'list.upToDate': '一致',
			'list.changed': '本地有改动',
			'list.localOnly': '仅本地',
			'list.remoteOnly': '仅云端',
			'list.applied': '已同步',
			'list.skipped': '已跳过',
			'list.pushed': '已推送',
			'label.none': '—',
			'notice.error': '请求失败',
			'label.remoteUrlEmpty': '请先填写 WebDAV 地址。',
		};

		const en = {
			panel: 'WebDAV sync',
			'page.title': 'WebDAV sync',
			'page.intro': 'Sync DSH settings and state to WebDAV for another device to pull.',
			'page.source': 'Data comes from the dsh-webdav-sync plugin.',
			'ledger.title': 'Recent sync ledger',
			'ledger.empty': 'No sync records yet',
			'ledger.push': 'push',
			'ledger.pull': 'pull',

			'card.connection': 'Connection',
			'card.actions': 'Actions',
			'card.status': 'Status',
			'field.remoteUrl': 'WebDAV URL',
			'field.remoteUrlHint': 'e.g. https://host/dav/',
			'field.username': 'Username',
			'field.usernameHint': 'Leave empty for anonymous access',
			'field.password': 'Password',
			'field.passwordHint': 'Leave empty to keep unchanged',
			'field.passwordSet': 'Password set',
			'field.passwordUnset': 'No password',
			'actions.save': 'Save config',
			'actions.saved': 'Config saved',
			'actions.status': 'Refresh status',
			'actions.push': 'Push to cloud',
			'actions.pull': 'Pull from cloud',
			'actions.diff': 'Compare',
			'actions.apply': 'Apply changes',
			'actions.pending': 'Working…',

			'state.loading': 'Loading…',
			'state.error': 'Operation failed',
			'state.none': 'Nothing run yet',
			'state.empty': '(empty)',

			'summary.push': 'Pushed {count} files',
			'summary.pull': 'Pulled {count} files, skipped {skipped}',
			'summary.pullBackup': 'Local backup before pull: {dir}',
			'summary.status': '{total} items: up-to-date {up} · changed {changed} · local-only {localOnly} · remote-only {remoteOnly}',
			'summary.noRemote': 'Nothing on the cloud yet; push first.',
			'summary.diff': 'Diff: {changed} changed, {remoteOnly} new remote, {localOnly} local-only',
			'summary.remotePushedBy': 'Cloud pushed by {host} at {at}',
			'list.upToDate': 'Up to date',
			'list.changed': 'Changed locally',
			'list.localOnly': 'Local only',
			'list.remoteOnly': 'Remote only',
			'list.applied': 'Synced',
			'list.skipped': 'Skipped',
			'list.pushed': 'Pushed',
			'label.none': '—',
			'notice.error': 'Request failed',
			'label.remoteUrlEmpty': 'Fill in the WebDAV URL first.',
		};

		/* ------------------------------------------------------------------ */
		/* Styles                                                              */
		/* ------------------------------------------------------------------ */

		const CSS = `
.wds-page{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.wds-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.wds-content{max-width:860px;margin:0 auto;padding:0 clamp(20px,4vw,40px) 40px}
.wds-heading{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;padding-top:28px;margin-bottom:18px}
.wds-heading h1{margin:0;font-size:20px;font-weight:500;line-height:28px}
.wds-intro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.wds-card{display:flex;flex-direction:column;gap:14px;padding:16px 18px;margin-bottom:14px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-settings-card-fill)}
.wds-cardTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}
.wds-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
@media (max-width:640px){.wds-grid{grid-template-columns:minmax(0,1fr)}}
.wds-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.wds-field--full{grid-column:1/-1}
.wds-label{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}
.wds-input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.wds-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.wds-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.wds-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
.wds-badge{display:inline-flex;flex:none;align-items:center;height:20px;padding:0 8px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.wds-badge--on{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-state-success-primary)}
.wds-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:34px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
.wds-button:disabled{cursor:not-allowed;opacity:.4}
.wds-button--primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.wds-button--outline{box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3)}
.wds-button--danger{color:var(--dsw-alias-state-error-primary)}
.wds-actions{display:flex;flex-wrap:wrap;gap:8px}
.wds-notice{display:flex;align-items:flex-start;gap:8px;margin:0 0 12px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:20px;overflow-wrap:anywhere}
.wds-notice--ok{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-label-primary)}
.wds-notice--error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-label-primary)}
.wds-meta{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.wds-list{margin:4px 0 0;padding:0 0 0 18px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;max-height:220px;overflow:auto}
.wds-listTitle{margin:10px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}
.wds-diffFile{margin-top:10px}
.wds-diff{margin:0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-3);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:18px;max-height:260px;overflow:auto;white-space:pre}
.wds-diffLine-add{color:var(--dsw-alias-state-success-primary)}
.wds-diffLine-del{color:var(--dsw-alias-state-error-primary)}
.wds-diffLine-ctx{color:var(--dsw-alias-label-tertiary)}
`;

		/* ------------------------------------------------------------------ */
		/* Data access                                                         */
		/* ------------------------------------------------------------------ */

		function pageFetch() {
			const transport = globalThis.__DSH_TRANSPORT__;
			if (transport !== undefined && transport !== null && typeof transport.fetch === 'function') {
				return (input, init) => transport.fetch(input, init);
			}
			return (input, init) => globalThis.fetch(input, init);
		}

		async function requestSync(body) {
			const init = body === undefined
				? { method: 'GET', headers: { accept: 'application/json' } }
				: {
					method: 'POST',
					headers: { accept: 'application/json', 'content-type': 'application/json' },
					body: JSON.stringify(body)
				};
			const response = await pageFetch()(ROUTE, init);
			let data = null;
			try {
				data = await response.json();
			} catch (error) {
				data = null;
			}
			if (!response.ok) {
				const detail = data !== null && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
				throw new Error(detail);
			}
			if (data === null || typeof data !== 'object') throw new Error(`HTTP ${response.status}`);
			if (typeof data.error === 'string') throw new Error(data.error);
			return data;
		}

		function messageOf(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}

		/* ------------------------------------------------------------------ */
		/* Sidebar glyph                                                       */
		/* ------------------------------------------------------------------ */

		function SyncIcon(props) {
			const edge = props !== null && typeof props === 'object' && typeof props.size === 'number' ? props.size : 16;
			return h(
				'svg',
				{
					width: edge,
					height: edge,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeWidth: 1.6,
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					'aria-hidden': 'true',
					focusable: 'false'
				},
				h('path', { key: 'a', d: 'M20 7a8 8 0 0 0-14.5-2' }),
				h('path', { key: 'b', d: 'M5.5 5v3.5H9' }),
				h('path', { key: 'c', d: 'M4 17a8 8 0 0 0 14.5 2' }),
				h('path', { key: 'd', d: 'M18.5 19v-3.5H15' })
			);
		}

		/* ------------------------------------------------------------------ */
		/* Result rendering                                                    */
		/* ------------------------------------------------------------------ */

		function fileList(titleKey, items, t) {
			if (!Array.isArray(items) || items.length === 0) return null;
			return h(
				'div',
				null,
				h('div', { className: 'wds-listTitle' }, t(titleKey)),
				h('ul', { className: 'wds-list' }, items.map((item) => h('li', { key: item }, item)))
			);
		}

		function renderResult(result, t) {
			if (result === null || result === undefined) {
				return h('p', { className: 'wds-meta' }, t('state.none'));
			}
			if (typeof result.pushed === 'number') {
				return h(
					'div',
					null,
					h('p', { className: 'wds-meta' }, t('summary.push', { count: result.pushed })),
					fileList('list.pushed', result.files, t)
				);
			}
			if (typeof result.pulled === 'number') {
				return h(
					'div',
					null,
					h('p', { className: 'wds-meta' }, t('summary.pull', { count: result.pulled, skipped: result.skipped })),
					result.backupDir ? h('p', { className: 'wds-meta' }, t('summary.pullBackup', { dir: result.backupDir })) : null,
					fileList('list.applied', result.applied, t),
					fileList('list.skipped', result.skipped, t)
				);
			}
			if (result.remote === false) {
				return h('p', { className: 'wds-meta' }, t('summary.noRemote'));
			}
			if (Array.isArray(result.unchanged)) {
				const changed = Array.isArray(result.changed) ? result.changed : [];
				const remoteOnly = Array.isArray(result.remoteOnly) ? result.remoteOnly : [];
				const localOnly = Array.isArray(result.localOnly) ? result.localOnly : [];
				const pushedBy = result.pushedBy && typeof result.pushedBy === 'object' ? result.pushedBy : null;
				return h(
					'div',
					null,
					pushedBy
						? h('p', { className: 'wds-meta' }, t('summary.remotePushedBy', { host: pushedBy.host, at: String(result.generatedAt || '') }))
						: null,
					h('p', { className: 'wds-meta' }, t('summary.diff', { changed: changed.length, remoteOnly: remoteOnly.length, localOnly: localOnly.length })),
					changed.map((c) => h(
						'div',
						{ key: c.path, className: 'wds-diffFile' },
						h('div', { className: 'wds-listTitle' }, c.path),
						h(
							'pre',
							{ className: 'wds-diff' },
							(Array.isArray(c.diff) ? c.diff : []).map((d, i) => h(
								'div',
								{ key: i, className: `wds-diffLine wds-diffLine-${d.op === '+' ? 'add' : d.op === '-' ? 'del' : 'ctx'}` },
								`${d.op} ${d.line}`
							))
						)
					)),
					fileList('list.remoteOnly', remoteOnly, t),
					fileList('list.localOnly', localOnly, t)
				);
			}
			if (Array.isArray(result.upToDate)) {
				const total = result.upToDate.length + result.changed.length + result.localOnly.length + result.remoteOnly.length;
				return h(
					'div',
					null,
					h(
						'p',
						{ className: 'wds-meta' },
						t('summary.status', {
							total,
							up: result.upToDate.length,
							changed: result.changed.length,
							localOnly: result.localOnly.length,
							remoteOnly: result.remoteOnly.length
						})
					),
					fileList('list.changed', result.changed, t),
					fileList('list.localOnly', result.localOnly, t),
					fileList('list.remoteOnly', result.remoteOnly, t)
				);
			}
			return h('p', { className: 'wds-meta' }, JSON.stringify(result));
		}

		/* ------------------------------------------------------------------ */
		/* Page                                                                */
		/* ------------------------------------------------------------------ */

		function SyncPage(props) {
			const t = props.t !== undefined && props.t !== null ? props.t : props.translate;
			const [config, setConfig] = React.useState({ remoteUrl: '', username: '', password: '', passwordSet: false });
			const [loading, setLoading] = React.useState(true);
			const [notice, setNotice] = React.useState(null);
			const [result, setResult] = React.useState(null);
			const [ledger, setLedger] = React.useState([]);
			const [busy, setBusy] = React.useState(null);
			const alive = React.useRef(true);

			React.useEffect(() => {
				alive.current = true;
				void load();
				return () => {
					alive.current = false;
				};
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			async function load() {
				try {
					const data = await requestSync();
					if (!alive.current) return;
					if (data.config && typeof data.config === 'object') {
						setConfig({
							remoteUrl: typeof data.config.remoteUrl === 'string' ? data.config.remoteUrl : '',
							username: typeof data.config.username === 'string' ? data.config.username : '',
							password: '',
							passwordSet: data.config.passwordSet === true
						});
					}
					if (data.ledger && Array.isArray(data.ledger.entries)) {
						setLedger(data.ledger.entries);
					}
				} catch (error) {
					if (alive.current) setNotice({ kind: 'error', text: `${t('notice.error')}: ${messageOf(error)}` });
				} finally {
					if (alive.current) setLoading(false);
				}
			}

			const setField = (field) => (event) => {
				const value = event !== null && typeof event === 'object' && event.target !== undefined ? event.target.value : event;
				setConfig((current) => ({ ...current, [field]: value }));
			};

			const run = async (action) => {
				setBusy(action);
				setNotice(null);
				setResult(null);
				try {
					const data = await requestSync({ action });
					if (alive.current) setResult(data);
				} catch (error) {
					if (alive.current) setNotice({ kind: 'error', text: `${t('notice.error')}: ${messageOf(error)}` });
				} finally {
					if (alive.current) setBusy(null);
				}
			};

			const applyPull = async () => {
				setBusy('apply');
				setNotice(null);
				try {
					const data = await requestSync({ action: 'pull', apply: true });
					if (alive.current) setResult(data);
				} catch (error) {
					if (alive.current) setNotice({ kind: 'error', text: `${t('notice.error')}: ${messageOf(error)}` });
				} finally {
					if (alive.current) setBusy(null);
				}
			};

			const saveConfig = async () => {
				if (!config.remoteUrl.trim()) {
					setNotice({ kind: 'error', text: t('label.remoteUrlEmpty') });
					return;
				}
				setBusy('config');
				setNotice(null);
				try {
					const payload = { action: 'config', remoteUrl: config.remoteUrl.trim(), username: config.username };
					if (config.password !== '') payload.password = config.password;
					const data = await requestSync(payload);
					if (!alive.current) return;
					setConfig((current) => ({ ...current, password: '', passwordSet: data.passwordSet === true }));
					setNotice({ kind: 'ok', text: t('actions.saved') });
				} catch (error) {
					if (alive.current) setNotice({ kind: 'error', text: `${t('notice.error')}: ${messageOf(error)}` });
				} finally {
					if (alive.current) setBusy(null);
				}
			};

			const field = (key, labelKey, input, options) => {
				const opts = options !== undefined && options !== null ? options : {};
				return h(
					'div',
					{ key: key, className: `wds-field${opts.full ? ' wds-field--full' : ''}` },
					h('span', { className: 'wds-label' }, t(labelKey)),
					input,
					opts.hint ? h('p', { className: 'wds-hint' }, t(opts.hint)) : null
				);
			};

			const textInput = (key, placeholderKey, type) => h('input', {
				className: 'wds-input',
				type: type || 'text',
				value: config[key],
				placeholder: placeholderKey ? t(placeholderKey) : undefined,
				'aria-label': t(`field.${key}`),
				onChange: setField(key)
			});

			const isDiff = result !== null && typeof result === 'object' && Array.isArray(result.unchanged);
			const canApply = isDiff && (result.changed.length > 0 || result.remoteOnly.length > 0);

			return h(
				'div',
				{ className: 'wds-page' },
				h('style', { key: 'wds-styles' }, CSS),
				h(
					'div',
					{ className: 'wds-scroll' },
					h(
						'div',
						{ className: 'wds-content' },
						h(
							'header',
							{ className: 'wds-heading' },
							h(
								'div',
								null,
								h('h1', null, t('page.title')),
								h('p', { className: 'wds-intro' }, t('page.intro'))
							)
						),
						notice !== null
							? h('div', { className: `wds-notice wds-notice--${notice.kind}`, role: 'status' }, notice.text)
							: null,
						h(
							'section',
							{ className: 'wds-card' },
							h('h2', { className: 'wds-cardTitle' }, t('card.connection')),
							h(
								'div',
								{ className: 'wds-grid' },
								field('remoteUrl', 'field.remoteUrl', textInput('remoteUrl', 'field.remoteUrlHint'), { full: true, hint: 'field.remoteUrlHint' }),
								field('username', 'field.username', textInput('username'), { hint: 'field.usernameHint' }),
								field(
									'password',
									'field.password',
									h('input', {
										className: 'wds-input',
										type: 'password',
										value: config.password,
										placeholder: config.passwordSet ? t('field.passwordSet') : t('field.passwordHint'),
										'aria-label': t('field.password'),
										onChange: setField('password')
									}),
									{ hint: 'field.passwordHint' }
								)
							),
							h(
								'div',
								{ className: 'wds-actions' },
								h('span', { className: `wds-badge ${config.passwordSet ? 'wds-badge--on' : ''}` }, t(config.passwordSet ? 'field.passwordSet' : 'field.passwordUnset')),
								h(
									'button',
									{ type: 'button', className: 'wds-button wds-button--primary', disabled: busy !== null, onClick: saveConfig },
									busy === 'config' ? t('actions.pending') : t('actions.save')
								)
							)
						),
						h(
							'section',
							{ className: 'wds-card' },
							h('h2', { className: 'wds-cardTitle' }, t('card.actions')),
							h(
								'div',
								{ className: 'wds-actions' },
								h(
									'button',
									{ type: 'button', className: 'wds-button wds-button--outline', disabled: busy !== null, onClick: () => void run('status') },
									busy === 'status' ? t('actions.pending') : t('actions.status')
								),
								h(
									'button',
									{ type: 'button', className: 'wds-button wds-button--primary', disabled: busy !== null, onClick: () => void run('push') },
									busy === 'push' ? t('actions.pending') : t('actions.push')
								),
								h(
									'button',
									{ type: 'button', className: 'wds-button wds-button--outline', disabled: busy !== null, onClick: () => void run('pull') },
									busy === 'pull' ? t('actions.pending') : t('actions.diff')
								),
								canApply
									? h(
										'button',
										{ type: 'button', className: 'wds-button wds-button--danger', disabled: busy !== null, onClick: () => void applyPull() },
										busy === 'apply' ? t('actions.pending') : t('actions.apply')
									)
									: null
							)
						),
						h(
							'section',
							{ className: 'wds-card' },
							h('h2', { className: 'wds-cardTitle' }, t('card.status')),
							loading ? h('p', { className: 'wds-meta' }, t('state.loading')) : renderResult(result, t)
						),
						h(
							'section',
							{ className: 'wds-card' },
							h('h2', { className: 'wds-cardTitle' }, t('ledger.title')),
							ledger.length === 0
								? h('p', { className: 'wds-meta' }, t('ledger.empty'))
								: h(
									'ul',
									{ className: 'wds-list' },
									ledger.map((e, i) => h(
										'li',
										{ key: i },
										`${t(e.action === 'push' ? 'ledger.push' : 'ledger.pull')} · ${e.host} · ${e.count} · ${e.at}`
									))
								)
						),
						h('p', { className: 'wds-meta' }, t('page.source'))
					)
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* Plugin                                                              */
		/* ------------------------------------------------------------------ */

		const inject = ['slots', 'locale', 'layout'];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-webdav-sync: dictionaries');
			const t = ctx.locale.bind(NS);

			const disposeEntry = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
				name: 'sidebar.panellist',
				id: PANEL_ID,
				order: 30,
				label: () => t('panel'),
				locale: NS
			}, SyncIcon));

			const disposePage = ctx.slots.inject('main', () => ctx.slots.register({
				name: 'main',
				key: PANEL_ID,
				locale: NS,
				inject: () => ({
					openConversation: () => {
						ctx.layout.selectPanel(null);
					},
					translate: t
				})
			}, SyncPage));

			ctx.effect(() => () => {
				try {
					if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) ctx.layout.selectPanel(null);
				} catch (error) {
					/* the shell may already be tearing down; leaving the panel is best effort */
				}
				for (const dispose of [disposePage, disposeEntry]) {
					try {
						dispose();
					} catch (error) {
						/* the slot owner may have disposed the registration already */
					}
				}
			}, 'ui-webdav-sync: sidebar entry and page');
		}

		return { inject, apply };
	}
});
