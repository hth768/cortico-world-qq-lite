/**
 * 功能包接线 SDK：把 QQHost 能力包装成功能包类熟悉的回调集合。
 * 功能包（cortico-world-qq-*）在 activate 里调用 createFeatureContext(host, id) 拿到：
 *  - cfg：本模块在 worlds.qqbot.modules[id] 下的配置
 *  - log：带子名的框架 Logger
 *  - dataDir：持久化目录
 *  - callApi：直连 OneBot 的 API 调用
 *  - chat：基于模块配置的 OpenAI 兼容端点做 LLM 补全（无配置时返回空，功能优雅降级）
 *  - sendGroup / sendPrivate / pushEvent：发送与事件注入
 *  - groups / privates：监听名单（主动说话等用）
 */
import type { Logger } from 'cortico/core/types.ts';
import type { SessionSendOptions } from 'cortico';
import type { QQHost } from './types.ts';

export interface FeatureContext {
  id: string;
  cfg: Record<string, unknown>;
  log: Logger;
  dataDir: string;
  packageDir: string;
  callApi: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
  chat: (
    messages: Array<{ role: string; content: string }>,
    opts?: { temperature?: number; json?: boolean },
  ) => Promise<string>;
  sendGroup: (gid: string, text: string, opts?: SessionSendOptions) => Promise<string>;
  sendPrivate: (uid: string, text: string, opts?: SessionSendOptions) => Promise<string>;
  pushEvent: (ev: Record<string, unknown>) => void;
  groups: number[];
  privates: number[];
  /** 框架事件存储（用于历史查询等；可能为 null）。 */
  store: unknown | null;
}

function resolveApiKey(secret: string): string {
  if (!secret) return '';
  if (secret.startsWith('ENV:')) return process.env[secret.slice(4)] ?? '';
  return process.env[secret] ?? secret;
}

export function createFeatureContext(host: QQHost, id: string): FeatureContext {
  const cfg = (host.config().modules[id] ?? {}) as Record<string, unknown>;
  const endpoint = String(cfg.endpoint ?? '').replace(/\/$/, '');
  const apiKeySecret = String(cfg.apiKeySecret ?? '');
  const model = String(cfg.model ?? '');
  const log = host.childLogger(id);

  const chat: FeatureContext['chat'] = async (messages, opts) => {
    if (!endpoint || !model) {
      log.warn('未配置 LLM endpoint/model，chat 不可用', { id });
      return '';
    }
    const key = resolveApiKey(apiKeySecret);
    if (!key) {
      log.warn('缺少 LLM API Key', { secret: apiKeySecret });
      return '';
    }
    try {
      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: opts?.temperature ?? 0.7,
          response_format: opts?.json ? { type: 'json_object' } : undefined,
          messages,
        }),
      });
      if (!res.ok) return '';
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return json.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (e) {
      log.warn('LLM 调用失败', { err: String(e) });
      return '';
    }
  };

  const core = host.config();
  return {
    id,
    cfg,
    log,
    dataDir: host.dataDir,
    packageDir: host.packageDir,
    callApi: (action, params) =>
      (host.driver as { callApi: (a: string, p?: Record<string, unknown>) => Promise<unknown> }).callApi(action, params),
    chat,
    sendGroup: (gid, text, opts) => host.sendGroup(gid, text, opts),
    sendPrivate: (uid, text, opts) => host.sendPrivate(uid, text, opts),
    pushEvent: (ev) => host.pushEvent(ev as never),
    groups: core.groups,
    privates: core.privates,
    store: (host as { frameworkWorldHost?: { store?: unknown } | null }).frameworkWorldHost?.store ?? null,
  };
}
