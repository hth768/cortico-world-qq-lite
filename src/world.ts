/**
 * QQ 世界核心（lite 基础包）。
 *
 * 职责：
 *  - 管理 OneBot 连接（driver）；
 *  - 把入站消息规整为 QQContext，按监听名单 + 投递门控决定是否送入主 session，并分发给功能包事件处理器；
 *  - 通过 outputTap 把主 session 的助手输出发回对应 QQ 会话；
 *  - 聚合功能包注册的工具 / 提示词片段 / 环境变量；
 *  - 按部署配置 worlds.qqbot.features 动态加载功能包（cortico-world-qq-*），调用其 activate(host)。
 *
 * 已剔除：voxcpm 侧车、语音电话（call）、桌宠（pet）、CUA（cua）——它们属于独立功能包或不存在于基础包。
 */
import type {
  World,
  WorldHost,
  OutputTap,
  EventEnvelope,
  ToolDef,
  Logger,
  PrefixSegment,
  SystemPrefixContext,
  WorldStreamSocket,
} from 'cortico';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as fs from 'node:fs';
import { nowIso, shortTime } from 'cortico/core/util.ts';
import { QQHostImpl, type WorldBridge } from './host.ts';
import { OneBotDriver } from './driver.ts';
import { normalizeConfig } from './config.ts';
import { renderIncoming, buildOutgoing, splitReplyIntoMessages, stripInternalThoughts } from './normalize.ts';
import { assembleSystemPrefix } from './prompt.ts';
import type {
  QQCoreConfig,
  QQContext,
  OneBotMessage,
  OneBotEvent,
  SessionSendOptions,
} from './types.ts';

interface StartOpts {
  cfg: Record<string, unknown>;
  packageDir: string;
  dataDir: string;
}

const ENV_PROMPT_FILE = fileURLToPath(new URL('../prompts/env.md', import.meta.url));

/** npm 上不属于"本体世界包"的 qq 功能包集合，搜索时排除它们（只列可挂载的功能包）。 */
const MAIN_QQ_WORLDS = new Set<string>([
  'cortico-world-qq', 'cortico-world-qq-lite', 'cortico-world-qq-final',
  'cortico-world-qq-final-beta', 'cortico-world-qq-better', 'cortico-oh-my-qq-world',
]);

function isMentioned(ev: OneBotMessage, selfId: number): boolean {
  const segs = ev.message;
  if (typeof segs === 'string') return false;
  if (!Array.isArray(segs)) return false;
  return segs.some((s) => s.type === 'at' && String(s.data.qq) === String(selfId));
}

/** 功能包发现结果。 */
type FeatureHit = { name: string; version: string; description: string; keywords: string[]; npm: string; installed: boolean; enabled: boolean; local?: boolean };

export class QQWorld implements World, WorldBridge {
  readonly id = 'qqbot';
  private cfg!: QQCoreConfig;
  /** 框架 `worlds.qqbot` 的 live 引用；控制台 GET 优先读它，才能反映运行期改动的配置（修复"改完跳回原值"）。 */
  private liveCfg!: Record<string, unknown>;
  private readonly packageDir: string;
  private readonly dataDir: string;
  private driver!: OneBotDriver;
  private hostImpl!: QQHostImpl;
  private frameworkHost: WorldHost | null = null;
  private activeConv = '';
  private tapText = '';
  private selfId = 0;
  private readonly eventSubs = new Set<WorldStreamSocket>();

  constructor(opts: StartOpts) {
    this.packageDir = opts.packageDir;
    this.dataDir = opts.dataDir;
    // liveCfg 持有框架 worlds.qqbot 的 live 引用（config.set 会就地改它），GET 读它。
    this.liveCfg = opts.cfg as unknown as Record<string, unknown>;
    this.cfg = normalizeConfig(opts.cfg as Record<string, unknown>);
  }

  // ---- 框架生命周期 ----

  async start(host: WorldHost): Promise<void> {
    this.frameworkHost = host;
    const logger: Logger = host.log;
    // 先以空段规整核心默认，便于功能包读取 modules 容器。
    this.cfg = normalizeConfig(this.cfg as unknown as Record<string, unknown>, []);
    this.driver = new OneBotDriver({
      mode: this.cfg.mode,
      wsUrl: this.cfg.wsUrl,
      wsHost: this.cfg.wsHost,
      wsPort: this.cfg.wsPort,
      wsPath: this.cfg.wsPath,
      token: this.cfg.token,
      log: logger,
      onEvent: (ev) => void this.onOneBot(ev),
    });
    this.hostImpl = new QQHostImpl({
      config: this.cfg,
      packageDir: this.packageDir,
      dataDir: this.dataDir,
      driver: this.driver,
      log: logger,
      world: this,
      frameworkHost: host,
    });

    await this.driver.start();
    const identity = await this.driver.refreshIdentity().catch(() => null);
    if (identity) this.selfId = identity.selfId;

    await this.loadFeatures();

    // 功能包注册完配置段后，把模块默认值补齐进 config（原地修改）。
    for (const sec of this.hostImpl.configSections) {
      const bucket = (this.cfg.modules[sec.id] = this.cfg.modules[sec.id] || {});
      for (const f of sec.fields) if (!(f.key in bucket)) bucket[f.key] = f.default;
    }
    await this.hostImpl.runLifecycle('start');
    logger.info('cortico-world-qq-lite 已启动', { features: this.cfg.features, selfId: this.selfId });
  }

  async stop(): Promise<void> {
    await this.hostImpl?.runLifecycle('stop');
    await this.driver?.stop();
  }

  onHandoffEnded(): void {
    void this.hostImpl?.runLifecycle('handoffEnded');
  }

  onTurnEnded(): void {
    void this.hostImpl?.runLifecycle('turnEnded');
  }

  // ---- 功能包动态加载 ----

  private async loadFeatures(): Promise<void> {
    const specs = this.cfg.features ?? [];
    for (const spec of specs) {
      if (!spec || typeof spec !== 'string') continue;
      try {
        const mod = (await import(spec)) as Record<string, unknown>;
        const activate =
          (mod.activate as ((h: QQHostImpl) => void | Promise<void>) | undefined) ??
          (typeof mod.default === 'function' ? (mod.default as (h: QQHostImpl) => void | Promise<void>) : undefined) ??
          (typeof (mod as { feature?: { activate?: unknown } }).feature?.activate === 'function'
            ? ((mod as { feature: { activate: (h: QQHostImpl) => void | Promise<void> } }).feature.activate)
            : undefined);
        if (typeof activate === 'function') {
          await activate(this.hostImpl);
          this.hostImpl.log('info', '功能包已激活', { spec });
        } else {
          this.hostImpl.log('warn', '功能包未导出 activate，已跳过', { spec });
        }
      } catch (e) {
        this.hostImpl.log('error', '加载功能包失败', { spec, err: String(e) });
      }
    }
  }

  // ---- 入站事件 ----

  private async onOneBot(ev: OneBotMessage): Promise<void> {
    if (!ev || !ev.post_type) return;
    if (ev.post_type === 'meta_event') return; // 连接/心跳由 driver 处理
    // 实时事件面板广播（除心跳/生命周期外都推）。
    this.broadcastEvent(ev);
    if (ev.post_type !== 'message' || (ev.message_type !== 'group' && ev.message_type !== 'private')) {
      await this.hostImpl.runLifecycle('event', ev as OneBotEvent);
      return;
    }
    const isGroup = ev.message_type === 'group';
    const gid = String(ev.group_id ?? '');
    const uid = String(ev.user_id ?? '');
    const address = isGroup ? `group:${gid}` : `private:${uid}`;

    // 监听名单门控（基础包内置）。
    if (isGroup) {
      if (this.cfg.groups.length && !this.cfg.groups.includes(Number(gid))) return;
    } else {
      if (this.cfg.privates.length && !this.cfg.privates.includes(Number(uid))) return;
    }

    const text = renderIncoming(ev.message, { timezone: this.cfg.timezone, selfId: this.selfId });
    const isAt = isGroup ? isMentioned(ev, this.selfId) : true;

    // 回复目标恒等于消息来源地址：私聊回私聊、群聊回群。
    // （早期版本存在「私聊无条件重定向到首个监听群」的缺陷逻辑，已移除。）
    const dispatchAddress = address;
    this.activeConv = dispatchAddress;

    const ctx: QQContext = this.hostImpl.makeContext(dispatchAddress, ev as OneBotEvent, text, isAt);

    // 投递门控（群聊限速/防刷/作息等）。
    const deliver = await this.hostImpl.runDeliverFilters(ctx);
    if (deliver) {
      this.pushEvent({
        type: 'chat',
        source: `qq:${dispatchAddress}`,
        contextKey: `qq:${dispatchAddress}`,
        senderKey: `qq:user:${uid}`,
        text,
        ts: (ev.time ?? 0) * 1000 || Date.now(),
        meta: {
          qqGroup: isGroup ? gid : undefined,
          qqUser: uid,
          qqNick: ev.sender?.card || ev.sender?.nickname || undefined,
          qqAt: isAt,
          qqRaw: JSON.stringify(ev),
        },
      } as Partial<EventEnvelope>);
    }

    await this.hostImpl.runEventHandlers(ctx);
    await this.hostImpl.runLifecycle('event', ev as OneBotEvent);
  }

  // ---- 出站：主 session 助手输出（通过 outputTap 接收） ----

  outputTap(): OutputTap {
    // 每条回复只发送一次：OpenAI responses 流式协议会依次发出
    // response.output_item.done（带 item.content[0].text 全文）与 response.completed（结尾事件），
    // 两者都含完整文本。若都触发发送会重复，故用 flushed 标志锁定本轮只发一次，
    // 并在 response.created 时重置以覆盖下一轮。
    let flushed = false;
    return {
      onEvent: (event: unknown): void => {
        const e = event as {
          type?: string;
          delta?: string;
          text?: string;
          item?: { type?: string; content?: Array<{ type?: string; text?: string }> };
          response?: { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
        };
        const t = e.type ?? '';

        if (t === 'response.created') {
          flushed = false;
          this.tapText = '';
          return;
        }
        if (t === 'response.output_text.delta' || t.includes('OutputTextDelta')) {
          this.tapText += e.delta ?? e.text ?? '';
          return;
        }
        if (flushed) return; // 本轮已发送，忽略后续 done / completed 事件

        const messageText = (): string => {
          // 优先从 message 类型输出项取全文（排除 reasoning 等），回退累积的增量。
          if (e.item?.type === 'message' && Array.isArray(e.item.content)) {
            const parts = e.item.content
              .filter((p) => p.type === 'output_text' || typeof p.text === 'string')
              .map((p) => p.text ?? '')
              .join('');
            if (parts) return parts;
          }
          if (e.response?.output) {
            const texts: string[] = [];
            for (const item of e.response.output) {
              if (item.type === 'message' && Array.isArray(item.content)) {
                for (const p of item.content) {
                  if (p.type === 'output_text' && typeof p.text === 'string') texts.push(p.text);
                }
              }
            }
            if (texts.length) return texts.join('');
          }
          return (e.text ?? this.tapText).trim();
        };

        if (
          t === 'response.output_item.done' ||
          t === 'response.completed' ||
          t === 'response.output_text.done' ||
          t.includes('OutputTextDone') ||
          t.includes('Completed')
        ) {
          const full = messageText().trim();
          this.tapText = '';
          if (full && this.activeConv) {
            flushed = true;
            void this.sendToAddress(this.activeConv, full);
          }
        }
      },
    };
  }

  // ---- WorldBridge：发送 ----

  async sendToActive(text: string, opts?: SessionSendOptions): Promise<string> {
    if (!this.activeConv) return '';
    return this.sendToAddress(this.activeConv, text, opts);
  }

  async sendToAddress(address: string, text: string, opts?: SessionSendOptions): Promise<string> {
    if (!this.driver?.connected) return '';
    // 发送门控（群聊限速等）。
    const ok = await this.hostImpl.runSendGates(address, text, opts);
    if (!ok) return '';
    const [type, id] = address.split(':');
    const emojiDir = this.cfg.emojiDir ? this.hostImpl.resolvePath(this.cfg.emojiDir) : '';
    // 心理活动（括号内）保留在模型输出历史中，但发送前滤除，不投到 QQ。
    const outgoing = this.cfg.filterInternalThoughts ? stripInternalThoughts(text) : text;
    const segments = buildOutgoing(outgoing, emojiDir);
    const groups = splitReplyIntoMessages(segments, {
      splitBySentence: this.cfg.splitReplyBySentence,
      sentencesPerMessage: this.cfg.sentencesPerMessage,
      maxBytes: this.cfg.maxMessageBytes,
    });
    let lastId = '';
    for (const g of groups) {
      // 对齐 qq-final：投递前过滤掉空 text 段，避免发出空消息。
      const valid = g.filter(
        (s) => !(s.type === 'text' && !((s.data as { text?: string }).text ?? '').trim()),
      );
      if (!valid.length) continue;
      const params: Record<string, unknown> = {};
      if (type === 'group') params.group_id = Number(id);
      else params.user_id = Number(id);
      params.message = valid;
      try {
        const r = (await this.driver.callApi<{ message_id: number } | number>('send_msg', params)) as { message_id?: number } | number;
        lastId = typeof r === 'number' ? String(r) : String(r?.message_id ?? '');
        if (this.cfg.sendIntervalMs > 0) await new Promise((r) => setTimeout(r, this.cfg.sendIntervalMs));
      } catch (e) {
        this.hostImpl?.log('error', '发送失败', { address, err: String(e) });
      }
    }
    return lastId;
  }

  pushEvent(ev: Partial<EventEnvelope>): void {
    void this.frameworkHost?.pushEvent(ev as Parameters<WorldHost['pushEvent']>[0]);
  }

  // ---- 框架查询 ----

  tools(): ToolDef[] {
    return this.hostImpl?.tools ?? [];
  }

  envPromptVars(): Record<string, string> | null {
    if (!this.hostImpl) return null;
    const tz = this.cfg.timezone || 'Asia/Shanghai';
    const listen =
      (this.cfg.groups.length ? `群 ${this.cfg.groups.join('/')}` : '全部群') +
      (this.cfg.privates.length ? `，私聊 ${this.cfg.privates.join('/')}` : '');
    return {
      now: typeof nowIso === 'function' ? nowIso(tz) : new Date().toISOString(),
      time: typeof shortTime === 'function' ? shortTime(tz) : new Date().toTimeString().slice(0, 8),
      timezone: tz,
      selfName: this.cfg.selfName,
      listen,
    };
  }

  async systemPrompt(context?: SystemPrefixContext): Promise<PrefixSegment[]> {
    if (!this.hostImpl) return [];
    return assembleSystemPrefix(this.hostImpl, context);
  }

  // ── 功能模块市场：发现 / 安装 / 移除 cortico-world-qq-* 功能包（与 Cortico 扩展市场一致）──

  /**
   * 功能市场固定走官方 npm 源。原因：cortico-world 关键字与 Cortico 官方扩展市场均以
   * registry.npmjs.org 为准；用户镜像（如 npmmirror）对 `keywords:cortico-world` 搜索返回为空，
   * 会导致市场搜不到任何功能包。故这里直接返回官方源，安装同理强制 --registry。
   */
  private async npmRegistry(): Promise<string> {
    return 'https://registry.npmjs.org';
  }

  private runCmd(cmd: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((resolve, reject) => {
      // Windows 上 npm/pnpm 实为 *.cmd，spawn 不带 shell 时无法解析扩展名 → ENOENT。
      // 故强制 shell:true，由系统 shell 解析命令；退出码仍会透传（cmd 以子进程退出码退出）。
      const child = spawn(cmd, args, { cwd: cwd ?? this.packageDir, windowsHide: true, shell: true, env: env ?? process.env });
      let stdout = '', stderr = '';
      child.stdout?.on('data', (d: Buffer | string) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer | string) => { stderr += d.toString(); });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}：${stderr.trim() || stdout.trim()}`));
      });
    });
  }

  /** 扫描本地已部署 / link 的 cortico-world-qq-* 功能包（extensions/packages 与 extensions/node_modules）。 */
  private localFeaturePackages(): FeatureHit[] {
    const roots = [
      join(this.packageDir, 'node_modules'),               // 本包自己的 node_modules（featureInstall 拷入处）
      join(this.packageDir, '..'),                         // extensions/packages（兄弟功能包目录）
      join(this.packageDir, '..', '..', 'node_modules'),   // extensions/node_modules（pnpm link）
    ];
    const found = new Map<string, FeatureHit>();
    for (const root of roots) {
      let entries: string[] = [];
      try { entries = fs.readdirSync(root); } catch { continue; }
      for (const name of entries) {
        if (!name.startsWith('cortico-world-qq')) continue;
        if (name === 'cortico-world-qq-lite') continue;
        if (MAIN_QQ_WORLDS.has(name)) continue;
        if (found.has(name)) continue;
        let meta: { version?: string; description?: string; keywords?: string[] };
        try { meta = JSON.parse(fs.readFileSync(join(root, name, 'package.json'), 'utf8')); } catch { continue; }
        found.set(name, {
          name,
          version: meta.version ?? '',
          description: meta.description ?? '',
          keywords: meta.keywords ?? [],
          npm: `https://www.npmjs.com/package/${name}`,
          installed: false,
          local: true,
        });
      }
    }
    return [...found.values()];
  }

  /**
   * 发现 cortico-world-qq-* 功能包：先列本地已部署 / link 的包（如 sticker/voice/qzone/proactive…），
   * 再补 npm 上已发布的包。registry 在 keywords 过滤下不缩小结果，故按名称前缀 + 排除本体包后，
   * 客户端再用 text 做二次过滤。
   */
  async featureSearch(query: string): Promise<FeatureHit[]> {
    const enabled = new Set<string>(this.cfg.features ?? []);
    const byName = new Map<string, FeatureHit>();
    for (const p of this.localFeaturePackages()) byName.set(p.name, { ...p, installed: false, enabled: enabled.has(p.name) });

    const registry = await this.npmRegistry();
    const seen = new Set<string>();
    for (let from = 0; from < 80; from += 20) {
      const url = `${registry}/-/v1/search?text=${encodeURIComponent('keywords:cortico-world')}&size=20&from=${from}`;
      let data: { objects?: Array<{ package: { name?: string; version?: string; description?: string; keywords?: string[]; links?: { npm?: string } } }> };
      try {
        const resp = await fetch(url);
        if (!resp.ok) break;
        data = (await resp.json()) as typeof data;
      } catch { break; }
      const objects = data.objects ?? [];
      for (const obj of objects) {
        const p = obj.package;
        if (!p.name || !p.version) continue;
        if (!p.name.startsWith('cortico-world-qq')) continue;
        if (MAIN_QQ_WORLDS.has(p.name)) continue;
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        const existing = byName.get(p.name);
        if (existing) { existing.npm = p.links?.npm ?? existing.npm; continue; }
        byName.set(p.name, {
          name: p.name,
          version: p.version,
          description: p.description ?? '',
          keywords: p.keywords ?? [],
          npm: p.links?.npm ?? `https://www.npmjs.com/package/${p.name}`,
          installed: false,
          enabled: enabled.has(p.name),
        });
      }
      if (objects.length < 20) break;
    }
    // installed = 真正可在 node_modules 解析到（本地部署 / 已安装 / 已 link），而非仅“是否启用”。
    const req = createRequire(join(this.packageDir, 'package.json'));
    for (const h of byName.values()) {
      if (!h.installed) {
        try { req.resolve(h.name); h.installed = true; } catch { /* 未安装 */ }
      }
    }
    let hits = [...byName.values()];
    const q = (query ?? '').trim().toLowerCase();
    if (q) hits = hits.filter((h) =>
      h.name.toLowerCase().includes(q) ||
      h.description.toLowerCase().includes(q) ||
      h.keywords.some((k) => k.toLowerCase().includes(q)));
    // 排序：已启用 > 已安装 > 其余；同名按字典序
    hits.sort((a, b) => {
      const ra = a.enabled ? 0 : a.installed ? 1 : 2;
      const rb = b.enabled ? 0 : b.installed ? 1 : 2;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
    return hits;
  }

  /**
   * 安装一个 qq 功能包：若已可解析（如已 link 部署）则跳过下载，否则在临时干净目录
   * 下载后再并入 packageDir/node_modules，使 import(name) 可被 Node 解析。最后登记到 features。
   */
  async featureInstall(name: string, version?: string): Promise<{ ok: boolean; features: string[]; message: string }> {
    if (!/^cortico-world-qq-[a-z0-9-]+$/i.test(name)) throw new Error(`不是合法的 qq 功能包名：${name}`);
    const spec = version ? `${name}@${version}` : name;
    const req = createRequire(join(this.packageDir, 'package.json'));
    // 已可在本地解析（已 link 部署 / 已安装）则跳过下载，仅启用。
    const canResolve = () => { try { req.resolve(name); return true; } catch { return false; } };
    const wasInstalled = canResolve();
    let installed = wasInstalled;
    if (!installed) {
      // 本地已部署的功能包（extensions/packages/<name> 或 extensions/node_modules/<name>）直接拷入 packageDir/node_modules
      const localSrc = this.findLocalPackage(name);
      if (localSrc) {
        const dst = join(this.packageDir, 'node_modules', name);
        fs.rmSync(dst, { recursive: true, force: true });
        fs.cpSync(localSrc, dst, { recursive: true });
        installed = canResolve();
      }
    }
    if (!installed) {
      // 临时目录必须放在 lite 目录之外（用 os.tmpdir()）：否则 tmp 作为 lite 的子目录，npm 向上找项目根
      // 会越过 tmp 命中 lite 的 package.json（含 link: 兄弟依赖）→ EUNSUPPORTEDPROTOCOL。
      const tmp = join(tmpdir(), `cortico-qqfeat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      let installErr = '';
      try {
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'qqfeat-tmp', version: '1.0.0', private: true }));
        // Windows 上裸 `npm`/`pnpm` 可能只以 *.ps1 形式存在，cmd.exe（shell:true 默认 shell）无法解析
        // .ps1 扩展名 → ENOENT。统一经 `corepack` 调用（corepack.cmd 可直接执行，与框架扩展市场同一套机制）。
        // COREPACK_ENABLE_DOWNLOAD_PROMPT=0 避免在无缓存版本时交互式下载阻塞（与框架 runPnpm 一致）。
        const coreEnv = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
        try {
          await this.runCmd('corepack', ['pnpm', 'add', spec, '--ignore-workspace', '--dir', tmp, '--registry=https://registry.npmjs.org'], tmp, coreEnv);
        } catch (pnpmErr) {
          try {
            await this.runCmd('corepack', ['npm', 'install', spec, '--no-save', '--legacy-peer-deps', '--prefix', tmp, '--registry=https://registry.npmjs.org'], tmp, coreEnv);
          } catch (npmErr) {
            installErr = `corepack pnpm 与 corepack npm 均安装失败：${String((npmErr as Error)?.message || npmErr)}`;
          }
        }
        const srcNm = join(tmp, 'node_modules');
        const dstNm = join(this.packageDir, 'node_modules');
        // 跳过宿主自身（cortico-world-qq-lite）的依赖副本：功能包依赖 lite，npm 会把它提升安装到
        // tmp/node_modules/cortico-world-qq-lite；若一并拷进 packageDir/node_modules，会导致功能包
        // import('cortico-world-qq-lite') 解析到这份「第二份 lite」而非宿主自身，引发状态/API 错位。
        let hostPkgName = '';
        try { hostPkgName = JSON.parse(fs.readFileSync(join(this.packageDir, 'package.json'), 'utf8')).name || ''; } catch { /* ignore */ }
        if (fs.existsSync(srcNm)) {
          fs.mkdirSync(dstNm, { recursive: true });
          for (const entry of fs.readdirSync(srcNm)) {
            if (entry === '.package-lock.json' || entry === hostPkgName) continue;
            const from = join(srcNm, entry);
            const to = join(dstNm, entry);
            fs.rmSync(to, { recursive: true, force: true });
            fs.cpSync(from, to, { recursive: true });
          }
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      // 安装后必须验证：包真的能在本地解析到，才算成功；否则一律视为失败并抛错，
      // 由控制台走 catch 弹出红色「操作失败」提示，而不是误报「安装成功」。
      installed = canResolve();
      if (!installed) {
        throw new Error(installErr || `安装 ${spec} 后未能在本地解析到该包（可能下载失败或包不存在），已取消启用。请检查网络 / registry 或包名后重试。`);
      }
    }
    const features = Array.from(new Set([...(this.cfg.features ?? []), name]));
    this.cfg.features = features;
    this.hostImpl.persist({ features });
    return { ok: true, features, message: wasInstalled ? `已启用 ${name}，重启后加载` : `已安装 ${spec}，重启进程后加载` };
  }

  /** 查找本地功能包目录（兄弟 packages 或 extensions/node_modules），找不到返回 undefined。 */
  private findLocalPackage(name: string): string | undefined {
    for (const cand of [
      join(this.packageDir, '..', name),
      join(this.packageDir, '..', '..', 'node_modules', name),
    ]) {
      if (fs.existsSync(join(cand, 'package.json'))) return cand;
    }
    return undefined;
  }

  /** 从 features 清单移除功能包（并尽力清理已拷入的包目录）。 */
  async featureUninstall(name: string): Promise<{ ok: boolean; features: string[]; message: string }> {
    const features = (this.cfg.features ?? []).filter((f) => f !== name);
    this.cfg.features = features;
    this.hostImpl.persist({ features });
    try { fs.rmSync(join(this.packageDir, 'node_modules', name), { recursive: true, force: true }); } catch { /* 忽略 */ }
    return { ok: true, features, message: `已从功能清单移除并删除 ${name}，重启后不再加载` };
  }

  /** 仅从 features 清单停用功能包（保留已安装文件，可再次启用）。 */
  async featureDisable(name: string): Promise<{ ok: boolean; features: string[]; message: string }> {
    const before = this.cfg.features ?? [];
    const features = before.filter((f) => f !== name);
    if (features.length === before.length) {
      return { ok: false, features, message: `${name} 本就未启用` };
    }
    this.cfg.features = features;
    this.hostImpl.persist({ features });
    return { ok: true, features, message: `已停用 ${name}（文件保留，重启后可再次启用）` };
  }

  /** 设置内置功能模块的启用开关，并落盘（框架通用 setConfig 不支持此类短键/路径）。 */
  async setModuleEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; modules: Record<string, unknown> }> {
    const bucket = (this.cfg.modules[id] = (this.cfg.modules[id] as Record<string, unknown>) || {}) as Record<string, unknown>;
    bucket.enabled = enabled;
    this.hostImpl.persist({ modules: { [id]: { enabled } } });
    return { ok: true, modules: this.cfg.modules };
  }

  webUi(language?: string): unknown {
    // 固定面板集合：与 src/console/client.ts 的 bundle.panels 键一一对应。
    // （早期版本按 frameworkConfigGroups 动态生成，导致面板 id 不可枚举、无法提供浏览器产物。）
    const FEATURE_META: Record<string, { title: string; desc: string }> = {
      sticker: { title: '表情包', desc: '从 emojiDir 按文件名关键词匹配并发送表情图片。' },
      groupspeak: { title: '群聊限速', desc: '限制机器人在群内的发信频率，避免刷屏。' },
      antiloop: { title: '防刷与话题结束', desc: '拦截刷屏/复读，并引导机器人话题收尾、不过度续话。' },
      routine: { title: '作息', desc: '设定休息时段；休息时抑制响应并可选播报晚安/早安。' },
      festival: { title: '节日节气', desc: '把今日节日/节气/农历注入提示词。' },
      emotion: { title: '情绪系统', desc: '感知群氛围并注入提示词，调整语气。' },
      affinity: { title: '好感度', desc: '按用户记录关系分，注入语境。' },
      admin: { title: '群管理', desc: '仅白名单内的管理员可使用禁言/踢人/封禁。' },
      reminder: { title: '提醒与记事', desc: '自然语言定时提醒，到点发到群/私聊。' },
      notebook: { title: '笔记本', desc: '让 AI 记录/检索自己想记的东西（记忆插件启用时写入其笔记库）。' },
      history: { title: '历史查询', desc: '回溯/检索 QQ 消息记录（依赖框架事件存储）。' },
      voice: { title: '语音收发', desc: '语音识别与合成。供应商：native/custom/local（已剔除 voxcpm 与语音电话）。' },
      qzone: { title: '空间动态', desc: '抓取并摘要 QQ 空间新鲜事，主动分享到群。需配置 Cookie。' },
      proactive: { title: '主动说话', desc: '定时结合 LLM 主动找群聊冒泡/分享动态。' },
    };
    const FEATURE_IDS = Object.keys(FEATURE_META);
    const corePanels: Array<Record<string, unknown>> = [
      { id: 'qq', title: 'QQ 连接', description: 'NapCat / OneBot v11 的连接方式。反向（容器/局域网常用）由本世界监听端口等待 NapCat 来连；正向则去连 NapCat 已开的反向 WS。', group: 'world:qqbot', getMethods: ['config'] },
      { id: 'listen', title: '监听名单', description: '只在这些群/私聊里参与对话。留空表示不限制。', group: 'world:qqbot', getMethods: ['config'] },
      { id: 'deliver', title: '投递与拆分', description: '控制消息如何拆条、限速与附件投递。', group: 'world:qqbot', getMethods: ['config'] },
      { id: 'prompt', title: '提示词模板', description: '可用占位符：{{now}} 当前时间、{{date}} 日期、{{timezone}} 时区、{{selfName}} 自称、{{listen}} 监听名单摘要。', group: 'world:qqbot', getMethods: ['config'] },
      { id: 'modules', title: '功能模块', description: '勾选启用功能包；取消勾选仅停用（保留已安装文件）。改动需重启生效。', group: 'world:qqbot' },
    ];
    // 功能面板仅对已「安装/加载」的功能包显示：以 cfg.features（已安装包名）映射出的模块 id 为准。
    // 卸载功能包会从 features 移除 → 对应配置面板随之消失（而非永远挂在 cfg.modules 的静态键上）。
    const installedIds = this.installedModuleIds();
    const featurePanels: Array<Record<string, unknown>> = FEATURE_IDS
      .filter((id) => installedIds.has(id))
      .map((id) => ({
        id,
        title: FEATURE_META[id].title,
        description: FEATURE_META[id].desc,
        group: 'world:qqbot',
        prefix: `modules.${id}.`,
        topOnly: false,
        getMethods: ['config'],
      }));
    const panels: Array<Record<string, unknown>> = [
      ...corePanels,
      ...featurePanels,
      { id: 'modules-view', title: '功能模块总览', description: '已加载功能包及其状态摘要。逐项配置见上方各分组面板。', group: 'world:qqbot', getMethods: ['getModules'] },
      { id: 'roster', title: '监听名单', description: '当前监听的群与私聊。', group: 'world:qqbot', getMethods: ['getRoster'] },
      { id: 'events', title: '实时事件', description: 'QQ 消息 / 通知的实时流（WebSocket 推送）。', group: 'world:qqbot' },
      { id: 'feature-market', title: '功能模块市场', description: '从 npm 发现并安装 cortico-world-qq-* 功能包，与 Cortico 扩展市场一致。安装 / 移除后需重启生效。', group: 'world:qqbot' },
    ];

    const invoke = async (panel: string, method: string, args: unknown[]): Promise<unknown> => {
      if (method === 'config') {
        const groupId = typeof args[0] === 'string' && args[0] ? args[0] : 'qq';
        const prefix = typeof args[1] === 'string' ? args[1] : '';
        const topOnly = args[2] === true;
        return this.getConfigSchema(groupId, prefix, topOnly);
      }
      if (method === 'featureSearch') return this.featureSearch(String(args[0] ?? ''));
      if (method === 'featureInstall') return this.featureInstall(String(args[0]), typeof args[1] === 'string' && args[1] ? args[1] : undefined);
      if (method === 'featureUninstall') return this.featureUninstall(String(args[0]));
      if (method === 'featureDisable') return this.featureDisable(String(args[0]));
      if (method === 'setModuleEnabled') return this.setModuleEnabled(String(args[0]), args[1] === true || args[1] === 'true');
      if (method === 'getFeatures') return this.getFeatures();
      if (panel === 'modules' || method === 'getModules') return this.getModulesView();
      if (panel === 'roster' || method === 'getRoster') return this.getRoster();
      return { error: 'unknown method', panel, method };
    };

    const stream = (panel: string, socket: WorldStreamSocket): void => {
      if (panel !== 'events') {
        socket.close('该面板不支持流式');
        return;
      }
      this.eventSubs.add(socket);
      socket.onClose(() => this.eventSubs.delete(socket));
    };

    const groups = this.hostImpl ? this.hostImpl.frameworkConfigGroups : [];
    const napcatConnected = !!this.driver?.connected;
    const liveMode = (this.liveCfg?.mode as string) || this.cfg.mode;
    const liveFeatures = Array.isArray(this.liveCfg?.features) ? (this.liveCfg.features as unknown[]).length : this.cfg.features.length;
    return {
      label: `QQ 机器人 ${this.cfg.selfName || ''}`,
      lamps: [
        { label: 'NapCat', state: napcatConnected ? 'online' : 'offline', hint: napcatConnected ? '已连接' : '未连接' },
        { label: '连接模式', state: 'online', hint: liveMode === 'reverse' ? '反向' : '正向' },
        { label: '本机QQ', state: this.selfId ? 'online' : 'offline', hint: this.selfId ? String(this.selfId) : '未登录' },
        { label: '功能包', state: 'online', hint: String(liveFeatures) },
      ],
      badges: [
        { label: '监听群', value: this.cfg.groups.length, tone: 'plain' },
        { label: '监听私聊', value: this.cfg.privates.length, tone: 'plain' },
        { label: 'QQ', value: this.selfId || '-', tone: 'plain' },
      ],
      panels,
      invoke,
      stream,
      promptDocs: [
        {
          key: 'worlds.qqbot.env',
          title: '环境提示词模板',
          description: '可用占位符：{{now}} {{timezone}} {{selfName}} {{listen}}。',
          role: 'envPrompt',
          path: ENV_PROMPT_FILE,
          vars: [
            { name: 'now', description: '当前日期时间' },
            { name: 'timezone', description: '时区' },
            { name: 'selfName', description: '自称' },
            { name: 'listen', description: '监听名单摘要' },
          ],
        },
      ],
      config: groups,
    };
  }

  private getConfigSchema(groupId: string, keyPrefix: string, topOnly: boolean): unknown {
    const grp = this.hostImpl?.frameworkConfigGroups.find((g) => g.id === groupId);
    if (!grp || !grp.schema) return { error: 'unknown group', groupId };
    const props = (grp.schema.properties || {}) as Record<
      string,
      { type?: string; title?: string; description?: string; enum?: string[]; minimum?: number; maximum?: number; 'x-hot'?: boolean }
    >;
    const out: Array<{
      key: string;
      type: string;
      title: string;
      description?: string;
      enum?: string[];
      minimum?: number;
      maximum?: number;
      xHot: boolean;
    }> = [];
    const values: Record<string, unknown> = {};
    const QQBOT = 'worlds.qqbot.';
    for (const [key, def] of Object.entries(props)) {
      // property key 已是完整路径 worlds.qqbot.<field>；过滤/标题判定需基于剥前缀后的相对路径。
      const rel = key.startsWith(QQBOT) ? key.slice(QQBOT.length) : key;
      if (keyPrefix && !rel.startsWith(keyPrefix)) continue;
      if (topOnly) {
        const depth = rel.split('.').length;
        if (depth !== 1) continue;
      }
      out.push({
        key,
        type: def.type || 'string',
        title: def.title || rel.split('.').pop() || key,
        description: def.description,
        enum: def.enum,
        minimum: def.minimum,
        maximum: def.maximum,
        xHot: def['x-hot'] === true,
      });
      values[key] = this.resolveConfigValue(key);
    }
    return { groupId, title: grp.schema.title, properties: out, values };
  }

  private resolveConfigValue(key: string): unknown {
    // property key 可能是完整路径 worlds.qqbot.<field>；剥掉前缀后相对 liveCfg（即 worlds.qqbot 节点）遍历，
    // 与框架 getByPath/setByPath（相对部署根 cfg）写入 worlds.qqbot.<field> 保持一致，避免读写错位导致“回退”。
    const QQBOT = 'worlds.qqbot.';
    const rel = key.startsWith(QQBOT) ? key.slice(QQBOT.length) : key;
    const live = this.liveCfg as Record<string, unknown>;
    const get = (src: Record<string, unknown>): unknown =>
      rel.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), src);
    const liveVal = get(live);
    if (liveVal !== undefined) return liveVal;
    return get(this.cfg as unknown as Record<string, unknown>);
  }

  private broadcastEvent(ev: OneBotEvent): void {
    if (this.eventSubs.size === 0) return;
    const payload = JSON.stringify({
      t: Date.now(),
      post_type: ev.post_type,
      message_type: ev.message_type,
      group_id: ev.group_id,
      user_id: ev.user_id,
      raw_message: ev.raw_message,
      sender: ev.sender ? { nickname: ev.sender.nickname, card: ev.sender.card, role: ev.sender.role } : undefined,
    });
    for (const s of this.eventSubs) {
      try {
        s.send(payload);
      } catch {
        this.eventSubs.delete(s);
      }
    }
  }

  /** 已安装（cfg.features）功能包对应的模块 id 集合。功能包名 cortico-world-qq-<id> → id。 */
  private installedModuleIds(): Set<string> {
    const set = new Set<string>();
    for (const n of this.cfg.features ?? []) {
      if (typeof n !== 'string') continue;
      set.add(n.startsWith('cortico-world-qq-') ? n.slice('cortico-world-qq-'.length) : n);
    }
    return set;
  }

  /** 供控制台「功能模块」面板读取已注册段与当前值。仅列出已安装（cfg.features）的模块，
   *  卸载后其配置面板与勾选项一并消失。 */
  getModulesView(): { sections: unknown[]; values: Record<string, unknown> } {
    const allValues = (this.cfg.modules || {}) as Record<string, unknown>;
    // 只保留已安装的功能包（features 中的包名 → 模块 id），卸载后不再出现在勾选列表与总览里。
    const installedIds = this.installedModuleIds();
    const values: Record<string, unknown> = {};
    for (const [id, v] of Object.entries(allValues)) {
      if (installedIds.has(id)) values[id] = v;
    }
    const titles = new Map<string, string>(
      (this.hostImpl?.frameworkConfigGroups ?? []).map((g) => [g.id.replace(/^modules\./, ''), g.title]),
    );
    const sections = Object.keys(values).map((id) => ({
      id,
      title: titles.get(id) || id,
      description: '',
    }));
    return {
      sections,
      values,
    };
  }

  /** 供控制台“功能模块”勾选面板 / 市场读取 features 清单（外部功能包启用列表）。 */
  getFeatures(): string[] {
    return (this.cfg.features ?? []).filter((f) => typeof f === 'string');
  }

  /** 供控制台「功能模块」面板读取监听名单摘要。 */
  getRoster(): { groups: number[]; privates: number[]; selfId: number; selfName: string } {
    return {
      groups: this.cfg.groups,
      privates: this.cfg.privates,
      selfId: this.selfId,
      selfName: this.cfg.selfName,
    };
  }

  // 暴露给运行时诊断
  get status(): { connected: boolean; selfId: number; features: string[] } {
    return { connected: this.driver?.connected ?? false, selfId: this.selfId, features: this.cfg.features };
  }
}
