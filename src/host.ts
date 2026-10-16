/**
 * QQ 宿主实现：功能包在 activate(host) 时通过它注册能力。
 * 所有注册先落入本对象，QQWorld 在需要时（tools()/systemPrompt()/事件分发）统一收集。
 */
import type {
  QQHost,
  QQCoreConfig,
  QQContext,
  QQEventHandler,
  QQEventMatcher,
  PromptSegmentProvider,
  EnvVarProvider,
  ConfigSection,
  LifecyclePhase,
  LifecycleFn,
  ToolDef,
  SessionSendOptions,
  EventEnvelope,
  OneBotEvent,
} from './types.ts';
import type { Logger, WorldHost, ConfigGroup as FrameworkConfigGroup } from 'cortico/core/types.ts';
import { resolve as resolvePathNode, join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { OneBotDriver } from './driver.ts';
import { coreConfigGroups, toFrameworkConfigGroup } from './config.ts';

interface PromptReg {
  priority: number;
  provider: PromptSegmentProvider;
}
interface LifecycleReg {
  phase: LifecyclePhase;
  fn: LifecycleFn;
}
interface EventReg {
  matcher: QQEventMatcher;
  handler: QQEventHandler;
}

export class QQHostImpl implements QQHost {
  readonly id = 'qqbot';
  readonly packageDir: string;
  readonly dataDir: string;
  private readonly _config: QQCoreConfig;
  private readonly _driver: OneBotDriver;
  private readonly _log: Logger;
  private readonly _world: WorldBridge;
  private readonly _fwHost: WorldHost | null;

  readonly tools: ToolDef[] = [];
  readonly promptSegments: PromptReg[] = [];
  readonly envVars: EnvVarProvider[] = [];
  readonly configSections: ConfigSection[] = [];
  readonly lifecycle: LifecycleReg[] = [];
  readonly eventHandlers: EventReg[] = [];
  readonly deliverFilters: ((ctx: QQContext) => boolean | Promise<boolean>)[] = [];
  readonly sendGates: ((address: string, text: string, opts?: SessionSendOptions) => boolean | Promise<boolean>)[] = [];

  constructor(opts: {
    config: QQCoreConfig;
    packageDir: string;
    dataDir: string;
    driver: OneBotDriver;
    log: Logger;
    world: WorldBridge;
    frameworkHost?: WorldHost | null;
  }) {
    this._config = opts.config;
    this.packageDir = opts.packageDir;
    this.dataDir = opts.dataDir;
    this._driver = opts.driver;
    this._log = opts.log;
    this._world = opts.world;
    this._fwHost = opts.frameworkHost ?? null;
  }

  get frameworkWorldHost(): WorldHost | null {
    return this._fwHost;
  }

  /**
   * 透传框架的 world 配置落盘能力（WorldHost.persistWorldConfig）：把补丁深合并进
   * worlds.qqbot 段，并写回 config.json（数组整体替换）。用于 features 列表、
   * modules 开关这类无法走框架通用 setConfig（其 schema 校验不支持自由字符串数组 /
   * 短键路径）的字段。
   */
  persist(patch: Record<string, unknown>): void {
    // 框架落盘：lease 活跃时生效，会同时更新内存 loaded.config 并写回 config.json。
    const fw = this._fwHost as unknown as { persistWorldConfig?(p: Record<string, unknown>): void } | null;
    fw?.persistWorldConfig?.(patch);
    // 兜底：框架 persistWorldConfig 带 `if(!lease.active) return` 守卫，当宿主生命周期 lease
    // 不活跃（如框架热重载 / 重复 makeHost 使旧 lease 失效）时会静默 no-op，导致 features /
    // modules 这类字段改动在重启后被磁盘上的旧 config 覆盖（"卸载/启用后重启又回来了"）。
    // 这里自行定位并直接写 config.json，保证落盘不依赖框架 lease 状态。
    this.persistConfigFile(patch);
  }

  /** 从 packageDir 向上回溯，定位含本 world 段（worlds.qqbot）的 config.json。 */
  private resolveConfigFile(): string | null {
    let dir = this.packageDir;
    for (let i = 0; i < 16; i++) {
      const cand = join(dir, 'config.json');
      if (existsSync(cand)) {
        try {
          const raw = JSON.parse(readFileSync(cand, 'utf8')) as { worlds?: Record<string, Record<string, unknown>> };
          if (raw?.worlds && raw.worlds[this.id]) return cand;
        } catch {
          /* 解析失败，继续上溯 */
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  /** 深合并补丁进 config.json 的 worlds.<id> 段并原子写回（数组整体替换，与框架 mergeConfigPatch 同语义）。 */
  private persistConfigFile(patch: Record<string, unknown>): void {
    const cfgPath = this.resolveConfigFile();
    if (!cfgPath) {
      this._log.warn('persist 兜底：未能定位 config.json，跳过直接写盘', { id: this.id, patch });
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, Record<string, Record<string, unknown>>>;
      const worlds = (raw.worlds ??= {}) as Record<string, Record<string, unknown>>;
      const section = (worlds[this.id] ??= {}) as Record<string, unknown>;
      this.mergePatch(section, patch);
      const tmp = `${cfgPath}.tmp-${Date.now()}`;
      writeFileSync(tmp, JSON.stringify(raw, null, 2), 'utf8');
      renameSync(tmp, cfgPath);
    } catch (e) {
      this._log.error('persist 兜底：直接写 config.json 失败', { err: String(e) });
    }
  }

  /** 深合并：对象递归合并，数组整体替换（不逐元素拼接）。 */
  private mergePatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(patch)) {
      if (Array.isArray(v)) {
        target[k] = v;
      } else if (v && typeof v === 'object' && !Array.isArray(target[k]) && typeof target[k] === 'object' && target[k] !== null) {
        this.mergePatch(target[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        target[k] = v;
      }
    }
  }

  config(): QQCoreConfig {
    return this._config;
  }

  get driver(): OneBotDriver {
    return this._driver;
  }

  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
    this._log[level](...args);
  }

  /** 返回框架原生 Logger（支持 .child()/.info/.warn/.error），供功能包使用。 */
  get frameworkLogger(): Logger {
    return this._log;
  }

  childLogger(name: string): Logger {
    if (typeof this._log.child === 'function') return this._log.child(name);
    return this._log;
  }

  resolvePath(p: string): string {
    if (/^https?:\/\//.test(p)) return p;
    if (p.startsWith('~/') || p.startsWith('~\\')) {
      const home = process.env.USERPROFILE ?? process.env.HOME ?? '.';
      return resolvePathNode(home, p.slice(2));
    }
    if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)) return resolvePathNode(p);
    return resolvePathNode(this.packageDir, p);
  }

  /**
   * 暴露给框架控制台的配置组（框架 ConfigGroup[]）。
   * 核心段直接转换；功能段加 'modules.<id>' 前缀，使框架写回落到
   * worlds.qqbot.modules.<id>.<field> 并自动持久化。
   */
  get frameworkConfigGroups(): FrameworkConfigGroup[] {
    const core = coreConfigGroups().map((g) => toFrameworkConfigGroup(g));
    const feat = this.configSections.map((sec) =>
      toFrameworkConfigGroup(
        { id: sec.id, title: sec.title, description: sec.description, fields: sec.fields },
        `modules.${sec.id}`,
      ),
    );
    return [...core, ...feat];
  }

  registerTool(tool: ToolDef): void {
    this.tools.push(tool);
  }

  registerPromptSegment(provider: PromptSegmentProvider, priority = 0): void {
    this.promptSegments.push({ priority, provider });
    this.promptSegments.sort((a, b) => b.priority - a.priority);
  }

  registerEnvVar(provider: EnvVarProvider): void {
    this.envVars.push(provider);
  }

  registerConfigSection(section: ConfigSection): void {
    // 同名段去重，避免重复注册。
    const i = this.configSections.findIndex((s) => s.id === section.id);
    if (i >= 0) this.configSections[i] = section;
    else this.configSections.push(section);
  }

  registerLifecycle(phase: LifecyclePhase, fn: LifecycleFn): void {
    this.lifecycle.push({ phase, fn });
  }

  onQQEvent(matcher: QQEventMatcher | QQEventHandler, handler?: QQEventHandler): void {
    if (handler) {
      this.eventHandlers.push({ matcher: matcher as QQEventMatcher, handler });
    } else {
      this.eventHandlers.push({ matcher: () => true, handler: matcher as QQEventHandler });
    }
  }

  registerDeliverFilter(fn: (ctx: QQContext) => boolean | Promise<boolean>): void {
    this.deliverFilters.push(fn);
  }

  registerSendGate(fn: (address: string, text: string, opts?: SessionSendOptions) => boolean | Promise<boolean>): void {
    this.sendGates.push(fn);
  }

  async runSendGates(address: string, text: string, opts?: SessionSendOptions): Promise<boolean> {
    for (const fn of this.sendGates) {
      try {
        if (!(await fn(address, text, opts))) return false;
      } catch (e) {
        this._log.error('发送门控异常', { err: String(e) });
      }
    }
    return true;
  }

  async send(text: string, opts?: SessionSendOptions): Promise<string> {
    return this._world.sendToActive(text, opts);
  }

  async sendGroup(gid: string, text: string, opts?: SessionSendOptions): Promise<string> {
    return this._world.sendToAddress(`group:${gid}`, text, opts);
  }

  async sendPrivate(uid: string, text: string, opts?: SessionSendOptions): Promise<string> {
    return this._world.sendToAddress(`private:${uid}`, text, opts);
  }

  pushEvent(ev: Partial<EventEnvelope>): void {
    this._world.pushEvent(ev);
  }

  /** 供 QQWorld 在事件分发时构造每个事件的上下文。 */
  makeContext(address: string, ev: OneBotEvent, text: string, isAt: boolean): QQContext {
    const [type, id] = address.split(':');
    return {
      id: address,
      type: type === 'group' ? 'group' : 'private',
      groupId: type === 'group' ? id : undefined,
      userId: String(ev.user_id ?? ''),
      text,
      isAt,
      raw: ev,
      send: (t, o) => this._world.sendToAddress(address, t, o),
      sendGroup: (g, t, o) => this._world.sendToAddress(`group:${g}`, t, o),
      sendPrivate: (u, t, o) => this._world.sendToAddress(`private:${u}`, t, o),
      pushEvent: (e) => this._world.pushEvent(e),
    };
  }

  async runLifecycle(phase: LifecyclePhase, ev?: OneBotEvent): Promise<void> {
    for (const reg of this.lifecycle) {
      if (reg.phase !== phase) continue;
      try {
        await reg.fn({ phase, event: ev, qq: this });
      } catch (e) {
        this._log.error('生命周期钩子异常', { phase, err: String(e) });
      }
    }
  }

  async runEventHandlers(ctx: QQContext): Promise<void> {
    for (const reg of this.eventHandlers) {
      try {
        if (reg.matcher(ctx)) await reg.handler(ctx);
      } catch (e) {
        this._log.error('事件处理器异常', { err: String(e) });
      }
    }
  }

  async runDeliverFilters(ctx: QQContext): Promise<boolean> {
    for (const fn of this.deliverFilters) {
      try {
        if (!(await fn(ctx))) return false;
      } catch (e) {
        this._log.error('投递门控异常', { err: String(e) });
      }
    }
    return true;
  }
}

/** QQWorld 暴露给宿主的桥接接口（避免循环依赖）。 */
export interface WorldBridge {
  sendToAddress(address: string, text: string, opts?: SessionSendOptions): Promise<string>;
  sendToActive(text: string, opts?: SessionSendOptions): Promise<string>;
  pushEvent(ev: Partial<EventEnvelope>): void;
}
