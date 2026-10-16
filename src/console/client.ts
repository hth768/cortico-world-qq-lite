import type {
  WebUiClientBundle,
  WebUiPanel,
  WebUiPanelContext,
} from 'cortico/web/shared/client-panel.ts';

type FieldDef = {
  key: string;
  type: string;
  title: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  xHot: boolean;
};
type SchemaResp = { groupId: string; title?: string; properties: FieldDef[]; values: Record<string, unknown> };
type ModuleSpec = {
  id: string;
  title: string;
  desc: string;
  group: string;
  prefix: string;
  topOnly: boolean;
};

// 与 world.ts console() 的面板 id 一一对应。group 是框架已注册的配置组 id
// （qq/listen/deliver/prompt/modules 及每个功能段 id）；prefix 用于按段过滤属性。
const CONFIG: ModuleSpec[] = [
  { id: 'qq', title: 'QQ 连接', desc: 'NapCat / OneBot v11 的连接方式。反向（容器/局域网常用）由本世界监听端口等待 NapCat 来连。', group: 'qq', prefix: '', topOnly: true },
  { id: 'listen', title: '监听名单', desc: '只在这些群/私聊里参与对话。留空表示不限制。', group: 'listen', prefix: '', topOnly: true },
  { id: 'deliver', title: '投递与拆分', desc: '控制消息如何拆条、限速与附件投递。', group: 'deliver', prefix: '', topOnly: true },
  { id: 'prompt', title: '提示词模板', desc: '当前时间/时区/自称/监听名单等占位符与系统提示词片段。', group: 'prompt', prefix: '', topOnly: true },
  { id: 'sticker', title: '表情包', desc: '从 emojiDir 按文件名关键词匹配并发送表情图片。', group: 'sticker', prefix: 'modules.sticker.', topOnly: false },
  { id: 'groupspeak', title: '群聊限速', desc: '限制机器人在群内的发信频率，避免刷屏。', group: 'groupspeak', prefix: 'modules.groupspeak.', topOnly: false },
  { id: 'antiloop', title: '防刷与话题结束', desc: '拦截刷屏/复读，并引导机器人话题收尾、不过度续话。', group: 'antiloop', prefix: 'modules.antiloop.', topOnly: false },
  { id: 'routine', title: '作息', desc: '设定休息时段；休息时抑制响应并可选播报晚安/早安。', group: 'routine', prefix: 'modules.routine.', topOnly: false },
  { id: 'festival', title: '节日节气', desc: '把今日节日/节气/农历注入提示词。', group: 'festival', prefix: 'modules.festival.', topOnly: false },
  { id: 'emotion', title: '情绪系统', desc: '感知群氛围并注入提示词，调整语气。', group: 'emotion', prefix: 'modules.emotion.', topOnly: false },
  { id: 'affinity', title: '好感度', desc: '按用户记录关系分，注入语境。', group: 'affinity', prefix: 'modules.affinity.', topOnly: false },
  { id: 'admin', title: '群管理', desc: '仅白名单内的管理员可使用禁言/踢人/封禁。', group: 'admin', prefix: 'modules.admin.', topOnly: false },
  { id: 'reminder', title: '提醒与记事', desc: '自然语言定时提醒，到点发到群/私聊。', group: 'reminder', prefix: 'modules.reminder.', topOnly: false },
  { id: 'notebook', title: '笔记本', desc: '让 AI 记录/检索自己想记的东西（记忆插件启用时写入其笔记库）。', group: 'notebook', prefix: 'modules.notebook.', topOnly: false },
  { id: 'history', title: '历史查询', desc: '回溯/检索 QQ 消息记录（依赖框架事件存储）。', group: 'history', prefix: 'modules.history.', topOnly: false },
  { id: 'voice', title: '语音收发', desc: '语音识别与合成。供应商：native/custom/local（已剔除 voxcpm 与语音电话）。', group: 'voice', prefix: 'modules.voice.', topOnly: false },
  { id: 'qzone', title: '空间动态', desc: '抓取并摘要 QQ 空间新鲜事，主动分享到群。需配置 Cookie。', group: 'qzone', prefix: 'modules.qzone.', topOnly: false },
  { id: 'proactive', title: '主动说话', desc: '定时结合 LLM 主动找群聊冒泡/分享动态。', group: 'proactive', prefix: 'modules.proactive.', topOnly: false },
];

function isLongText(key: string, def: FieldDef): boolean {
  if (def.type !== 'string') return false;
  const k = key.toLowerCase();
  if (/prompt|greeting|farewell|notice|描述|systemprompt|voicedesc|voicedesign|extra|system/.test(k)) return true;
  if (def.description && def.description.length > 90) return true;
  return false;
}

function fmtVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? '开' : '关';
  if (Array.isArray(v)) return v.length ? v.join(' / ') : '（空）';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function loadSchema(ctx: WebUiPanelContext, m: ModuleSpec): Promise<SchemaResp | null> {
  return ctx.invoke<SchemaResp>('config', [m.group, m.prefix, m.topOnly]).catch(() => null);
}

function renderField(ctx: WebUiPanelContext, def: FieldDef, value: unknown, commit: (v: unknown) => void): HTMLElement {
  const ui = ctx.ui;
  const wrap = document.createElement('div');
  wrap.style.margin = '10px 0';
  const lab = document.createElement('div');
  lab.style.fontWeight = '600';
  lab.style.marginBottom = '3px';
  lab.textContent = def.title + (def.xHot ? '' : '（改完需重启生效）');
  wrap.appendChild(lab);

  let control: HTMLElement;
  if (def.type === 'boolean') {
    control = ui.checkbox('', { checked: !!value, onChange: (v: boolean) => commit(v) }).el;
  } else if (def.enum && def.enum.length) {
    const v = def.enum.includes(String(value)) ? String(value) : def.enum[0];
    control = ui.select({
      value: v,
      options: def.enum.map((e: string) => ({ value: e, label: e })),
      onChange: (v: string) => commit(v),
    });
  } else if (def.type === 'integer' || def.type === 'number') {
    control = ui.input({
      value: value == null ? '' : String(value),
      type: 'number',
      onChange: (v: string) => commit(def.type === 'integer' ? parseInt(v || '0', 10) : parseFloat(v || '0')),
    });
  } else if (isLongText(def.key, def)) {
    control = ui.textarea({ value: value == null ? '' : String(value), rows: 4, onChange: (v: string) => commit(v) });
  } else if (/secret|key|token/i.test(def.key) || /key|密钥|token/i.test(def.title)) {
    control = ui.input({ value: value == null ? '' : String(value), type: 'password', onChange: (v: string) => commit(v) });
  } else {
    control = ui.input({ value: value == null ? '' : String(value), onChange: (v: string) => commit(v) });
  }
  wrap.appendChild(control);

  if (def.description) {
    const h = document.createElement('div');
    h.style.fontSize = '11px';
    h.style.opacity = '0.6';
    h.style.marginTop = '3px';
    h.style.lineHeight = '1.4';
    h.textContent = def.description;
    wrap.appendChild(h);
  }
  return wrap;
}

function makeConfigPanel(m: ModuleSpec): WebUiPanel {
  return {
    mount(ctx: WebUiPanelContext) {
      const ui = ctx.ui;
      const toast = (msg: string) => { try { ui.toast(msg); } catch { /* noop */ } };

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const debounceCommit = (fn: () => void) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fn, 350);
      };
      const commit = (fn: () => void) => debounceCommit(fn);

      const sheet = ui.sheet({ title: m.title, desc: m.desc });
      const formWrap = document.createElement('div');

      const renderForm = (s: SchemaResp) => {
        formWrap.replaceChildren();
        if (!s.properties.length) {
          const empty = document.createElement('div');
          empty.style.opacity = '0.6';
          empty.textContent = '该模块暂无可配置项。';
          formWrap.appendChild(empty);
          return;
        }
        const head = document.createElement('div');
        head.style.fontWeight = '700';
        head.style.margin = '4px 0 8px';
        head.textContent = s.title || '配置项';
        formWrap.appendChild(head);
        const reload = () => { void loadSchema(ctx, m).then((s2) => { if (s2) renderForm(s2); }); };
        for (const def of s.properties) {
          formWrap.appendChild(renderField(ctx, def, s.values[def.key], (v) => {
            void ctx.setConfig(m.group, { [def.key]: v })
              .then(() => toast('已保存：' + (def.key.split('.').pop() || def.key)))
              .catch((e: unknown) => toast('保存失败：' + (e instanceof Error ? e.message : String(e))))
              .finally(reload);
          }));
        }
      };

      sheet.body.appendChild(formWrap);
      ctx.root.appendChild(sheet.el);

      void loadSchema(ctx, m).then((schema) => {
        if (!schema) {
          formWrap.replaceChildren();
          formWrap.textContent = '配置读取失败（模块未启用或未注册配置段）。';
        } else {
          renderForm(schema);
        }
      });
    },
  };
}

// 只读「功能模块总览」：列出已注册段与各段当前值摘要。
const modulesViewPanel: WebUiPanel = {
  mount(ctx: WebUiPanelContext) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: '功能模块总览', desc: '已加载功能包及其配置摘要；逐项配置见上方各分组面板。' });
    sheet.body.textContent = '加载功能模块…';
    ctx.root.appendChild(sheet.el);
    void ctx.invoke('getModules').then(
      (r) => {
        const data = r as { sections?: Array<{ id: string; title: string; description?: string }>; values?: Record<string, unknown> };
        sheet.body.replaceChildren();
        const secs = data.sections || [];
        if (!secs.length) {
          const p = document.createElement('div');
          p.style.opacity = '0.6';
          p.textContent = '（未加载任何功能包）';
          sheet.body.appendChild(p);
          return;
        }
        for (const sec of secs) {
          const block = document.createElement('div');
          block.style.margin = '8px 0';
          block.style.padding = '8px 10px';
          block.style.background = 'rgba(127,127,127,0.10)';
          block.style.borderRadius = '6px';
          const h = document.createElement('div');
          h.style.fontWeight = '600';
          h.textContent = sec.title;
          block.appendChild(h);
          if (sec.description) {
            const d = document.createElement('div');
            d.style.fontSize = '11px';
            d.style.opacity = '0.6';
            d.style.marginTop = '2px';
            d.textContent = sec.description;
            block.appendChild(d);
          }
          const vals = (data.values && (data.values as Record<string, unknown>)[sec.id]) as Record<string, unknown> | undefined;
          if (vals) {
            const vd = document.createElement('div');
            vd.style.fontSize = '12px';
            vd.style.marginTop = '4px';
            vd.style.fontFamily = 'ui-monospace, monospace';
            vd.textContent = Object.entries(vals).map(([k, v]) => `${k}: ${fmtVal(v)}`).join('  ·  ');
            block.appendChild(vd);
          }
          sheet.body.appendChild(block);
        }
      },
      (e: unknown) => { sheet.body.textContent = '读取失败：' + (e instanceof Error ? e.message : String(e)); },
    );
  },
};

// 只读「监听名单」：服务端 getRoster 返回 groups/privates/selfId。
const rosterPanel: WebUiPanel = {
  mount(ctx: WebUiPanelContext) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: '监听名单', desc: '当前监听的群与私聊。改动走 config.json。' });
    sheet.body.textContent = '加载监听名单…';
    ctx.root.appendChild(sheet.el);
    void ctx.invoke('getRoster').then(
      (r) => {
        const data = r as { selfId?: number | null; selfName?: string; groups?: number[]; privates?: number[] };
        sheet.body.replaceChildren();
        const info = document.createElement('div');
        info.style.fontSize = '12px';
        info.style.opacity = '0.7';
        info.style.marginBottom = '8px';
        info.textContent = `selfId: ${data.selfId ?? '—'}  selfName: ${data.selfName ?? '—'}  群数: ${(data.groups || []).length}  私聊数: ${(data.privates || []).length}`;
        sheet.body.appendChild(info);
        const sec = (title: string, items: number[]) => {
          const w = document.createElement('div');
          const h = document.createElement('div');
          h.style.fontWeight = '600';
          h.style.margin = '8px 0 4px';
          h.textContent = title + (items.length ? ` (${items.length})` : '');
          w.appendChild(h);
          if (!items.length) {
            const p = document.createElement('div');
            p.style.opacity = '0.5';
            p.textContent = '（空）';
            w.appendChild(p);
          }
          for (const it of items) {
            const d = document.createElement('div');
            d.style.padding = '2px 0';
            d.style.fontSize = '13px';
            d.textContent = String(it);
            w.appendChild(d);
          }
          return w;
        };
        sheet.body.appendChild(sec('监听群', data.groups || []));
        sheet.body.appendChild(sec('监听私聊', data.privates || []));
      },
      (e: unknown) => { sheet.body.textContent = '监听名单读取失败：' + (e instanceof Error ? e.message : String(e)); },
    );
  },
};

// 实时事件：走本面板的 stream 推送通道。
const eventsPanel: WebUiPanel = {
  mount(ctx: WebUiPanelContext) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: '实时事件', desc: 'QQ 消息与通知的实时流（离线也能看已存储的）。' });
    const status = document.createElement('div');
    status.style.fontSize = '11px';
    status.style.opacity = '0.6';
    status.style.marginBottom = '6px';
    status.textContent = '连接中…';
    const list = document.createElement('div');
    list.style.maxHeight = 'calc(100vh - 320px)';
    list.style.overflowY = 'auto';
    sheet.body.append(status, list);
    ctx.root.appendChild(sheet.el);
    const handle = ctx.stream({
      open: () => { status.textContent = '● 已连接'; },
      close: (willRetry: boolean) => { status.textContent = willRetry ? '○ 已断开，重连中…' : '○ 已断开'; },
      message: (text: string) => {
        let e: { ts?: string; type?: string; text?: string } = {};
        try { e = JSON.parse(text); } catch { e = { text }; }
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '6px';
        row.style.padding = '3px 0';
        row.style.borderBottom = '1px solid rgba(127,127,127,0.12)';
        row.style.fontSize = '12px';
        const t = document.createElement('span');
        t.style.opacity = '0.5';
        t.style.flex = '0 0 auto';
        t.textContent = (e.ts || '').slice(11, 19);
        const ty = document.createElement('span');
        ty.style.flex = '0 0 auto';
        ty.style.opacity = '0.7';
        ty.textContent = e.type || '';
        const tx = document.createElement('span');
        tx.style.flex = '1';
        tx.textContent = e.text || '';
        row.append(t, ty, tx);
        list.appendChild(row);
        while (list.childElementCount > 300) list.removeChild(list.firstChild as Node);
        list.scrollTop = list.scrollHeight;
      },
    });
    return handle;
  },
};

// 功能模块管理（原“功能模块清单”）：以勾选代替手写包名。内置模块勾选 cfg.modules.<id>.enabled；
// 外部功能包（市场安装）勾选是否加入 features 清单。
const modulesManagePanel: WebUiPanel = {
  mount(ctx: WebUiPanelContext) {
    const ui = ctx.ui;
    const sheet = ui.sheet({
      title: '功能模块',
      en: 'Feature Modules',
      desc: '勾选启用功能包：内置模块改动后重启生效；外部功能包将安装/启用或停用（保留文件）。',
    });
    const rowbar = ui.rowbar();
    const search = ui.input({ type: 'search', placeholder: '搜索功能包（名称 / 描述 / 关键字）' });
    rowbar.append(search);
    sheet.body.appendChild(rowbar);
    const msg = ui.msgline();
    sheet.body.appendChild(msg);
    const builtinWrap = document.createElement('div');
    builtinWrap.style.marginTop = '6px';
    const extWrap = document.createElement('div');
    extWrap.style.marginTop = '10px';
    sheet.body.appendChild(builtinWrap);
    sheet.body.appendChild(extWrap);
    ctx.root.appendChild(sheet.el);

    let modulesValues: Record<string, Record<string, unknown>> = {};
    let extHits: FeatureHit[] = [];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      msg.textContent = '';
      const busy = ui.busy('加载中', '读取功能包…');
      try {
        const [mv, ext] = await Promise.all([
          ctx.invoke<{ sections: Array<{ id: string; title: string }>; values: Record<string, Record<string, unknown>> }>('getModulesView').catch(() => ({ sections: [], values: {} })),
          ctx.invoke<FeatureHit[]>('featureSearch', [search.value]).catch(() => []),
        ]);
        modulesValues = mv.values || {};
        extHits = ext;
        render(mv.sections || []);
      } catch (e) {
        msg.textContent = '加载失败：' + (e instanceof Error ? e.message : String(e));
      } finally {
        busy.dispose();
      }
    };

    function sectionTitle(text: string): HTMLElement {
      const t = document.createElement('div');
      t.textContent = text;
      t.style.fontWeight = '700';
      t.style.fontSize = '12px';
      t.style.opacity = '0.7';
      t.style.margin = '8px 0 4px';
      return t;
    }

    function makeRow(labelText: string, sub: string, checked: boolean, onToggle: (v: boolean) => void): { row: HTMLElement; cb: ReturnType<typeof ui.checkbox> } {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '7px 6px';
      row.style.borderBottom = '1px solid rgba(127,127,127,0.12)';
      const cb = ui.checkbox({ label: '', checked });
      const label = document.createElement('div');
      label.style.flex = '1';
      const nm = document.createElement('div');
      nm.style.fontWeight = '600';
      nm.style.fontSize = '13px';
      nm.textContent = labelText;
      label.appendChild(nm);
      if (sub) {
        const dd = document.createElement('div');
        dd.style.fontSize = '11px';
        dd.style.opacity = '0.6';
        dd.textContent = sub;
        label.appendChild(dd);
      }
      row.append(cb, label);
      cb.onChange = onToggle;
      return { row, cb };
    }

    function render(builtinSections: Array<{ id: string; title: string }>): void {
      builtinWrap.replaceChildren();
      extWrap.replaceChildren();
      // 内置模块（启用标志在 cfg.modules.<id>.enabled）
      builtinWrap.appendChild(sectionTitle('内置功能模块（勾选启用，重启生效）'));
      if (!builtinSections.length) {
        const p = document.createElement('div');
        p.style.opacity = '0.6';
        p.textContent = '（无可配置内置模块）';
        builtinWrap.appendChild(p);
      }
      for (const s of builtinSections) {
        const bucket = modulesValues[s.id] || {};
        const enabled = bucket.enabled !== false;
        const { row, cb } = makeRow(s.title + '（' + s.id + '）', '', enabled, async (v: boolean) => {
          cb.disabled = true;
          const next = { ...bucket, enabled: v };
          modulesValues[s.id] = next;
          try {
            await ctx.invoke('setModuleEnabled', [s.id, v]);
            ui.toast(v ? `已启用 ${s.id}，重启后生效` : `已停用 ${s.id}，重启后生效`, 'ok');
          } catch (e) {
            ui.toast('操作失败：' + (e instanceof Error ? e.message : String(e)), 'bad');
          } finally {
            cb.disabled = false;
          }
        });
        builtinWrap.appendChild(row);
      }
      // 外部功能包（启用标志在 features 清单）
      extWrap.appendChild(sectionTitle('外部功能包（安装 / 启用 / 停用）'));
      if (!extHits.length) {
        const p = document.createElement('div');
        p.style.opacity = '0.6';
        p.textContent = '（无匹配）';
        extWrap.appendChild(p);
      }
      for (const h of extHits) {
        const isEnabled = h.enabled;
        const { row, cb } = makeRow(h.name + (h.version ? '  v' + h.version : ''), h.description || '', isEnabled, async (v: boolean) => {
          cb.disabled = true;
          const busy = ui.busy('处理中', (v ? '启用' : '停用') + ' ' + h.name + '…');
          try {
            if (v) {
              const r = await ctx.invoke<{ features: string[]; message: string }>('featureInstall', [h.name, h.version]);
              // 后端 featureInstall 已落盘 features（hostImpl.persist 框架路径 + 直接写 config.json 兜底）。
              if (r.message) ui.toast(r.message, 'ok');
              else ui.toast(`已启用 ${h.name}`, 'ok');
            } else {
              const r = await ctx.invoke<{ ok: boolean; message: string }>('featureDisable', [h.name]);
              if (r.message) ui.toast(r.message, 'ok');
              else ui.toast(`已停用 ${h.name}`, 'ok');
            }
            await load();
          } catch (e) {
            ui.toast('操作失败：' + (e instanceof Error ? e.message : String(e)), 'bad');
          } finally {
            busy.dispose();
            cb.disabled = false;
          }
        });
        const pill = ui.pill(
          isEnabled ? '已启用' : (h.installed ? '已安装' : '未安装'),
          isEnabled ? 'on' : (h.installed ? 'info' : 'off'),
        );
        row.appendChild(pill);
        extWrap.appendChild(row);
      }
    }

    search.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void load(), 350);
    });
    void load();
  },
};

// 功能模块市场：从 npm 发现并安装 cortico-world-qq-* 功能包（与 Cortico 扩展市场一致）。
type FeatureHit = { name: string; version: string; description: string; keywords: string[]; npm: string; installed: boolean; enabled: boolean };

const featureMarketPanel: WebUiPanel = {
  mount(ctx: WebUiPanelContext) {
    const ui = ctx.ui;
    const root = ctx.root;
    const sheet = ui.sheet({
      title: '功能模块市场',
      en: 'Feature Market',
      desc: '从 npm 发现并安装 cortico-world-qq-* 功能包；已安装的包可启用 / 停用 / 卸载。改动后需重启进程生效。',
    });
    root.appendChild(sheet.el);

    const rowbar = ui.rowbar();
    const input = ui.input({ type: 'search', placeholder: '搜索功能包（名称 / 描述 / 关键字）' });
    const searchBtn = ui.button('搜索', { variant: 'primary', onClick: () => void doSearch(input.value) });
    rowbar.append(input, searchBtn);
    sheet.body.appendChild(rowbar);

    const msg = ui.msgline();
    sheet.body.appendChild(msg);

    const table = ui.table({ head: ['功能包', '版本', '简介', '状态', '操作'] });
    table.el.style.marginTop = '8px';
    sheet.body.appendChild(table.el);

    let currentHits: FeatureHit[] = [];

    async function getEnabled(): Promise<Set<string>> {
      const m = await ctx.invoke<{ features: string[] }>('getFeatures').catch(() => null);
      return new Set<string>(m?.features ?? []);
    }

    function renderHits(hits: FeatureHit[], enabled: Set<string>): void {
      table.clear(hits.length ? undefined : '没有匹配的功能包');
      for (const h of hits) {
        const isEnabled = enabled.has(h.name);
        const nameEl = ui.h('span');
        nameEl.textContent = h.name;
        const statusEl = ui.pill(
          isEnabled ? '已启用' : (h.installed ? '已安装' : '未安装'),
          isEnabled ? 'on' : (h.installed ? 'info' : 'off'),
        );
        const actionCell = document.createElement('div');
        actionCell.style.display = 'flex';
        actionCell.style.gap = '6px';
        actionCell.appendChild(ui.button(
          isEnabled ? '停用' : (h.installed ? '启用' : '安装'),
          {
            variant: isEnabled ? 'danger' : 'primary',
            size: 'sm',
            onClick: () => { if (isEnabled) void doDisable(h.name); else void doInstall(h.name, h.version); },
          },
        ));
        if (h.installed) {
          actionCell.appendChild(ui.button('卸载', {
            variant: 'ghost',
            size: 'sm',
            onClick: () => void doUninstall(h.name),
          }));
        }
        table.addRow([nameEl, h.version, h.description || '—', statusEl, actionCell]);
      }
    }

    async function doSearch(q: string): Promise<void> {
      msg.textContent = '';
      const busy = ui.busy('正在搜索', '检索功能包…');
      try {
        const hits = await ctx.invoke<FeatureHit[]>('featureSearch', [q]);
        const enabled = await getEnabled();
        currentHits = hits;
        renderHits(hits, enabled);
      } catch (e) {
        msg.textContent = '搜索失败：' + (e instanceof Error ? e.message : String(e));
      } finally {
        busy.dispose();
      }
    }

    async function doInstall(name: string, version: string): Promise<void> {
      const busy = ui.busy('正在安装', `${version ? '安装' : '启用'} ${name}…`);
      try {
        const r = await ctx.invoke<{ ok: boolean; features: string[]; message: string }>('featureInstall', [name, version]);
        // 后端 featureInstall 已通过 hostImpl.persist 落盘 features，前端仅刷新状态。
        ui.toast(r.message, 'ok');
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast('操作失败：' + (e instanceof Error ? e.message : String(e)), 'bad');
      } finally {
        busy.dispose();
      }
    }

    async function doDisable(name: string): Promise<void> {
      const busy = ui.busy('正在停用', `停用 ${name}…`);
      try {
        const r = await ctx.invoke<{ ok: boolean; features: string[]; message: string }>('featureDisable', [name]);
        // 后端 featureDisable 已落盘 features。
        ui.toast(r.message, 'ok');
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast('停用失败：' + (e instanceof Error ? e.message : String(e)), 'bad');
      } finally {
        busy.dispose();
      }
    }

    async function doUninstall(name: string): Promise<void> {
      const ok = await ui.confirm({ title: '卸载功能包', body: `将把 ${name} 从功能清单移除并删除包文件，重启后不再加载（若只想停用保留文件，可在功能模块面板取消勾选）。` });
      if (!ok) return;
      const busy = ui.busy('正在卸载', `卸载 ${name}…`);
      try {
        const r = await ctx.invoke<{ ok: boolean; features: string[]; message: string }>('featureUninstall', [name]);
        // 后端 featureUninstall 已落盘 features。
        ui.toast(r.message, 'ok');
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast('卸载失败：' + (e instanceof Error ? e.message : String(e)), 'bad');
      } finally {
        busy.dispose();
      }
    }

    // 进入即拉取全部 qq 功能包
    void doSearch('');
  },
};

const panels: Record<string, WebUiPanel> = {};
for (const m of CONFIG) panels[m.id] = makeConfigPanel(m);
panels['modules'] = modulesManagePanel;
panels['modules-view'] = modulesViewPanel;
panels['roster'] = rosterPanel;
panels['events'] = eventsPanel;
panels['feature-market'] = featureMarketPanel;

const bundle: WebUiClientBundle = { panels };
export default bundle;
