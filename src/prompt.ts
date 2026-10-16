/**
 * 提示词模板机制（lite 核心能力之一）。
 * - renderTemplate：把 {{key}} 占位符替换为变量值。
 * - coreEnvVars：基础包提供的环境变量（时间/时区/自称/监听名单）。
 * - assembleSystemPrefix：把「环境提示词模板(env)」+ 各功能包注册的提示词片段拼成 PrefixSegment[]。
 */
import { nowIso } from 'cortico/core/util.ts';
import type { PrefixSegment, SystemPrefixContext } from 'cortico';
import type { QQHostImpl } from './host.ts';
import type { QQCoreConfig } from './types.ts';

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => (k in vars ? vars[k] : '未知'));
}

function fmtDate(tz: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildListenSummary(cfg: QQCoreConfig): string {
  const g = cfg.groups.length ? `群 ${cfg.groups.join('/')}` : '全部群';
  const p = cfg.privates.length ? `，私聊 ${cfg.privates.join('/')}` : '';
  return `${g}${p}`;
}

export function coreEnvVars(cfg: QQCoreConfig): Record<string, string> {
  const tz = cfg.timezone || 'Asia/Shanghai';
  return {
    now: nowIso ? nowIso(tz) : new Date().toISOString(),
    date: fmtDate(tz),
    timezone: tz,
    selfName: cfg.selfName || '机器人',
    listen: buildListenSummary(cfg),
  };
}

export async function assembleSystemPrefix(host: QQHostImpl, ctx?: SystemPrefixContext): Promise<PrefixSegment[]> {
  const cfg = host.config();
  const base = coreEnvVars(cfg);
  const extra: Record<string, string> = {};
  for (const p of host.envVars) {
    try {
      const v = await p();
      if (v) Object.assign(extra, v);
    } catch (e) {
      host.log('error', 'env 变量提供者异常', { err: String(e) });
    }
  }
  const all = { ...base, ...extra };
  const segs: PrefixSegment[] = [];

  const envText = renderTemplate(cfg.env ?? '', all);
  if (envText.trim()) segs.push({ title: '环境', text: envText, sourceKey: 'env' });

  const sorted = [...host.promptSegments].sort((a, b) => a.priority - b.priority);
  for (const reg of sorted) {
    try {
      const r = await reg.provider(ctx as SystemPrefixContext);
      if (!r) continue;
      if (typeof r === 'string') {
        if (r.trim()) segs.push({ title: reg.id, text: r, sourceKey: `seg:${reg.id}` });
      } else {
        segs.push(...r);
      }
    } catch (e) {
      host.log('error', '提示词片段提供者异常', { err: String(e) });
    }
  }
  return segs;
}
