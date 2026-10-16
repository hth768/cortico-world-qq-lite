/**
 * cortico-world-qq-lite 公共类型与插件宿主 API。
 *
 * 功能包（cortico-world-qq-*）安装后，由本基础包在启动时按部署配置 `worlds.qqbot.features`
 * 列出的包名动态 import()，并调用其导出的 `activate(host)`。功能包通过 `host` 把配置段、
 * 事件处理器、提示词片段、环境变量、工具与生命周期钩子注册进 QQ 世界。
 *
 * 本文件重导出框架（cortico）的关键类型，功能包应仅依赖本文件与 `cortico` 的基础类型，
 * 不应直接 import 本基础包的内部模块。
 */
import type {
  World,
  WorldHost,
  EventEnvelope,
  Candidate,
  ToolDef,
  ToolOutcome,
  OutputTap,
  CognitionRequest,
  SessionSendOptions,
  WorldStreamSocket,
  SystemPrefixContext,
  PrefixSegment,
} from 'cortico';

export type {
  World,
  WorldHost,
  EventEnvelope,
  Candidate,
  ToolDef,
  ToolOutcome,
  OutputTap,
  CognitionRequest,
  SessionSendOptions,
  WorldStreamSocket,
  SystemPrefixContext,
  PrefixSegment,
};

/** OneBot 消息段（发送/接收共用）。 */
export type OneBotSegment =
  | { type: 'text'; data: { text: string } }
  | { type: 'at'; data: { qq: number | string; name?: string } }
  | { type: 'face'; data: { id: number | string } }
  | { type: 'image'; data: { file: string; url?: string; summary?: string } }
  | { type: 'record'; data: { file: string; url?: string } }
  | { type: 'video'; data: { file: string; url?: string } }
  | { type: 'file'; data: { file: string; url?: string; name?: string } }
  | { type: 'reply'; data: { id: string } }
  | { type: 'forward'; data: { id: string } }
  | { type: 'json'; data: { data: string } }
  | { type: 'xml'; data: { data: string } };

export interface OneBotSender {
  user_id?: number;
  nickname?: string;
  sex?: string;
  age?: number;
  card?: string;
  role?: string;
  title?: string;
  level?: string;
}

/** OneBot v11 上报帧 / API 回包（统一模型）。 */
export interface OneBotMessage {
  time?: number;
  self_id?: number;
  post_type?: 'message' | 'message_sent' | 'notice' | 'meta_event' | 'request';
  message_type?: 'private' | 'group' | 'guild';
  sub_type?: string;
  message_id?: number;
  group_id?: number;
  user_id?: number;
  target_id?: number;
  sender?: OneBotSender;
  anonymous?: { id: number; name: string; flag: string } | null;
  message?: OneBotSegment[] | string;
  raw_message?: string;
  font?: number;
  notice_type?: string;
  operator_id?: number;
  comment?: string;
  flag?: string;
  meta_event_type?: string;
  status?: string | Record<string, unknown>;
  echo?: string | number;
  retcode?: number;
  data?: unknown;
  [key: string]: unknown;
}

export interface QQSenderBrief {
  userId: number;
  name: string;
  card?: string;
  role?: string;
  title?: string;
}

export type ConvKind = 'group' | 'private';

export interface QQIdentity {
  selfId: number;
  nickname: string;
  groups: Map<number, string>;
  friends: Map<number, { nickname: string; remark?: string }>;
  knownPeers: Map<number, { nickname: string; card?: string }>;
  nicknameConflicts: Set<number>;
  loadedAt: number;
}

/** OneBot v11 原始上报事件（与 OneBotMessage 同型，便于阅读）。 */
export type OneBotEvent = OneBotMessage;

/** 一条被本世界识别为「需投递给主 session」的消息上下文。 */
export interface QQContext {
  /** 会话唯一 id（群=group:<gid>，私聊=private:<uid>）。 */
  id: string;
  type: 'group' | 'private';
  groupId?: string;
  userId: string;
  /** 已规整后的纯文本（去除了 CQ 码等非文本部分，但保留了 [标记]）。 */
  text: string;
  /** 是否 @ 了机器人。 */
  isAt: boolean;
  /** 原始 OneBot 事件。 */
  raw: OneBotEvent;
  /** 在本会话内回复（群聊会自动带 @，除非显式关）。 */
  send: (text: string, opts?: SessionSendOptions) => Promise<string>;
  /** 向指定群发消息。 */
  sendGroup: (gid: string, text: string, opts?: SessionSendOptions) => Promise<string>;
  /** 向指定私聊发消息。 */
  sendPrivate: (uid: string, text: string, opts?: SessionSendOptions) => Promise<string>;
  /** 向主 session 注入一条自定义事件（进入上下文）。 */
  pushEvent: (ev: Partial<EventEnvelope>) => void;
}

/** 事件处理器：返回 falsy 表示「不消费」，truthy 表示已处理（仍可被其它处理器继续消费，除非需短路请见 onQQEvent 文档）。 */
export type QQEventHandler = (ctx: QQContext) => void | Promise<void>;

/** 事件匹配器：决定该事件是否交由此处理器处理。 */
export type QQEventMatcher = (ctx: QQContext) => boolean;

/** 提示词片段提供者：返回要拼入 system 前缀的文本，或 PrefixSegment 数组。 */
export type PromptSegmentProvider = (
  ctx: SystemPrefixContext,
) => string | PrefixSegment[] | null | undefined | Promise<string | PrefixSegment[] | null | undefined>;

/** 环境变量提供者：返回要合并进 env 模板渲染的变量。 */
export type EnvVarProvider = () => Record<string, string> | null | undefined | Promise<Record<string, string> | null | undefined>;

export type LifecyclePhase =
  | 'start'
  | 'stop'
  | 'resume'
  | 'pause'
  | 'restart'
  | 'event'
  | 'turnEnded'
  | 'handoffEnded';

export type LifecycleFn = (ctx: { phase: LifecyclePhase; event?: OneBotEvent; qq: QQHost }) => void | Promise<void>;

/** 一个功能包在 `activate` 时注册到控制台「功能模块」页的配置字段。 */
export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiline' | 'list';
  default?: unknown;
  options?: Array<{ value: string | number; label: string }>;
  description?: string;
}

/** 功能包注册的一段配置（渲染为控制台「功能模块」里的分组编辑器）。 */
export interface ConfigSection {
  /** 模块 id，须与 activate 时使用的 id 一致；配置存于 worlds.qqbot.modules[id]。 */
  id: string;
  title: string;
  description?: string;
  fields: ConfigField[];
}

/**
 * Lite 面向声明的配置组（与框架 ConfigGroup 不同形）。框架 ConfigGroup 用
 * `schema.properties` 的点分路径；Lite 用 `fields` 数组更便于功能包声明。
 * 基础包在暴露给框架前会把它转换成框架 ConfigGroup（见 host.ts）。
 */
export interface ConfigGroup {
  id: string;
  title: string;
  description?: string;
  fields: ConfigField[];
}

/**
 * QQ 世界宿主：功能包通过它注册能力与读配置。由基础包在启动时实例化并传给 activate。
 */
export interface QQHost {
  /** 世界 id，固定为 'qqbot'。 */
  readonly id: string;
  /** 扩展包目录（绝对路径）。 */
  readonly packageDir: string;
  /** 数据目录（绝对路径）。 */
  readonly dataDir: string;
  /** 已规整（normalize）后的核心配置（含 modules 子对象）。 */
  config(): QQCoreConfig;
  /** 把相对扩展/数据的路径解析为绝对路径。 */
  resolvePath(p: string): string;
  /** 注册一个工具（框架 assembleTools 会收集）。 */
  registerTool(tool: ToolDef): void;
  /** 注册一段提示词片段，priority 越大越靠后（默认 0）。 */
  registerPromptSegment(provider: PromptSegmentProvider, priority?: number): void;
  /** 注册一组 env 模板变量。 */
  registerEnvVar(provider: EnvVarProvider): void;
  /** 注册一段控制台可编辑的功能配置（渲染在「功能模块」页）。 */
  registerConfigSection(section: ConfigSection): void;
  /** 注册生命周期钩子。 */
  registerLifecycle(phase: LifecyclePhase, fn: LifecycleFn): void;
  /**
   * 注册一个 QQ 事件处理器。
   * - onQQEvent(handler)：处理所有被本世界识别为消息的事件。
   * - onQQEvent(matcher, handler)：仅当 matcher(ctx) 为 true 时调用。
   */
  onQQEvent(matcher: QQEventMatcher | QQEventHandler, handler?: QQEventHandler): void;
  /**
   * 注册一个投递门控。每条被识别为「人类消息」的事件在投递给主 session 之前，
   * 会依次询问所有门控；任一返回 false 则本次不投递（但事件处理器仍会收到）。
   * 群聊限速、防刷、作息静默时段等用它来抑制机器人响应。
   */
  registerDeliverFilter(fn: (ctx: QQContext) => boolean | Promise<boolean>): void;
  /**
   * 注册一个发送门控。机器人（含功能包）每次调用 send/sendGroup/sendPrivate 前会依次询问；
   * 任一返回 false 则本次不发送（用于群聊限速：限制机器人在某群/私聊的发信频率）。
   */
  registerSendGate(fn: (address: string, text: string, opts?: SessionSendOptions) => boolean | Promise<boolean>): void;
  /** 在默认（主）会话内回复当前上下文。 */
  send(text: string, opts?: SessionSendOptions): Promise<string>;
  /** 向指定群发消息。 */
  sendGroup(gid: string, text: string, opts?: SessionSendOptions): Promise<string>;
  /** 向指定私聊发消息。 */
  sendPrivate(uid: string, text: string, opts?: SessionSendOptions): Promise<string>;
  /** 向主 session 注入一条自定义事件。 */
  pushEvent(ev: Partial<EventEnvelope>): void;
  /** 底层连接管理器（高级用法）。 */
  readonly driver: unknown;
  /** 日志。 */
  log: (level: 'info' | 'warn' | 'error', ...args: unknown[]) => void;
  /** 带子名的框架 Logger（供功能包使用，支持 .info/.warn/.error）。 */
  childLogger(name: string): Logger;
}

/** 一个功能包导出的入口。 */
export interface QQFeature {
  /** 唯一模块 id。 */
  id: string;
  /** 在宿主上注册自身能力；可异步（如需要预拉模型）。 */
  activate(host: QQHost): void | Promise<void>;
}

/** 功能包模块应导出的 activate 函数签名。 */
export type ActivateFn = (host: QQHost) => void | Promise<void>;

// ---------------------------------------------------------------------------
// 核心配置类型（lite 基础包自身关心的字段；功能包配置在 modules 下，由各自定义）
// ---------------------------------------------------------------------------

export interface QQCoreConfig {
  mode: 'reverse' | 'forward';
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  wsPath: string;
  token: string;
  groups: number[];
  privates: number[];
  timezone: string;
  selfName: string;

  emojiDir: string;
  deliverImageAttachments: boolean;
  splitReplyBySentence: boolean;
  sentencesPerMessage: number;
  sendIntervalMs: number;
  maxMessageBytes: number;
  forwardExpandLimit: number;
  privateAggregationWindow: number;
  maxSequenceGap: number;
  replyMaxGapSec: number;
  /** 要动态加载的功能包列表（npm 包名或相对/绝对路径）。 */
  features: string[];
  /** 各功能包的配置容器：modules[featureId][field] = value。 */
  modules: Record<string, Record<string, unknown>>;
  enabled?: boolean;
  [key: string]: unknown;
}

/** 将「空格/逗号分隔字符串」或「数字数组」统一成数字数组。空串/纯空白视为未限制（[]）。 */
export function toIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n));
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    return s.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  }
  return [];
}
