/**
 * OneBot 消息的入站渲染与出站构建。
 * - renderIncoming：把消息段渲染为对模型友好的纯文本（含引用/表情/@ 标注）。
 * - buildOutgoing：把待发送文本里的 [表情包:x] / [表情N] / [中文名] / @名字 解析为发送段。
 * - splitReplyIntoMessages：按句/按字节拆条，配合框架的发送节奏。
 * 移植自 cortico-world-qq-final（fat-fish 风格）。
 */
import { nowIso, shortTime } from 'cortico/core/util.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { faceName, faceIdByName } from './qface-map.ts';
import type { OneBotSegment } from './types.ts';

export function renderIncoming(
  segments: OneBotSegment[] | string | undefined,
  ctx: { timezone: string; selfId: number; replyText?: string; replyRef?: string },
): string {
  if (typeof segments === 'string') return segments;
  if (!segments || !Array.isArray(segments)) return '';
  const out: string[] = [];
  if (ctx.replyText && ctx.replyRef) {
    out.push(`「引用 ${ctx.replyRef}${ctx.replyText ? '：' + ctx.replyText : ''}」`);
  }
  for (const seg of segments) {
    switch (seg.type) {
      case 'text':
        out.push(seg.data.text ?? '');
        break;
      case 'at':
        out.push(formatMention(seg.data.qq, seg.data.name, ctx.selfId));
        break;
      case 'face':
        out.push(`[表情${seg.data.id}：${faceName(Number(seg.data.id))}]`);
        break;
      case 'image':
        out.push(seg.data.summary ? `[图片：${seg.data.summary}]` : '[图片]');
        break;
      case 'record':
        out.push('[语音]');
        break;
      case 'video':
        out.push('[视频]');
        break;
      case 'file':
        out.push(`[文件：${seg.data.name ?? seg.data.file}]`);
        break;
      case 'forward':
        out.push('[合并转发消息]');
        break;
      case 'json':
      case 'xml': {
        const card = parseJsonCard(seg.data.data);
        out.push(card ? `[卡片：${card}]` : '[卡片]');
        break;
      }
      default:
        out.push(`[${seg.type}]`);
    }
  }
  return out.join('').trim();
}

function formatMention(qq: string | number, name: string | undefined, selfId: number): string {
  const id = Number(qq);
  if (id === selfId) return '@我';
  return name ? `@${name}` : `@${qq}`;
}

export function renderSegmentsPlain(segments: OneBotSegment[] | string | undefined): string {
  if (typeof segments === 'string') return segments;
  if (!segments || !Array.isArray(segments)) return '';
  return segments
    .map((seg) => {
      switch (seg.type) {
        case 'text':
          return seg.data.text ?? '';
        case 'at':
          return `@${seg.data.name ?? seg.data.qq}`;
        case 'face':
          return `[表情${seg.data.id}]`;
        case 'image':
          return '[图片]';
        case 'record':
          return '[语音]';
        case 'video':
          return '[视频]';
        case 'file':
          return `[文件:${seg.data.name ?? ''}]`;
        case 'forward':
          return '[合并转发]';
        default:
          return `[${seg.type}]`;
      }
    })
    .join('');
}

/**
 * 把待发送文本构建为 OneBot 发送段：
 *   - [表情包:文件名] → image 段（位于 emojiDir 下；文件缺失则丢弃，不报错）
 *   - [表情N] / [表情N:名称] → face 段
 *   - [中文表情名]（命中映射）→ face 段
 *   - @名字 / @QQ号 → at 段
 *   - 其它 [..] → 普通文本（保留方括号原样）
 * emojiDir 为空时不解析表情包标记。
 */
export function buildOutgoing(text: string, emojiDir = ''): OneBotSegment[] {
  const segments: OneBotSegment[] = [];
  const re = /\[([^\[\]]{1,40})\]|@([^\s@]{1,30})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', data: { text: text.slice(last, m.index) } });
    if (m[1] !== undefined) {
      const inner = m[1];
      const whole = m[0];
      if (inner.startsWith('表情包:')) {
        const fname = inner.slice('表情包:'.length).trim();
        if (emojiDir && fname) {
          const p = join(emojiDir, fname);
          if (existsSync(p)) segments.push({ type: 'image', data: { file: p } });
        }
      } else if (/^表情\s*\d+(?:[:：][^\]]*)?$/.test(inner)) {
        const id = inner.match(/^表情\s*(\d+)/)![1];
        segments.push({ type: 'face', data: { id: Number(id) } });
      } else {
        const fid = faceIdByName(inner);
        if (fid !== null) segments.push({ type: 'face', data: { id: fid } });
        else segments.push({ type: 'text', data: { text: whole } });
      }
    } else if (m[2] !== undefined) {
      segments.push({ type: 'at', data: { qq: m[2], name: /^(\d{5,})$/.test(m[2]) ? undefined : m[2] } });
    }
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ type: 'text', data: { text: text.slice(last) } });
  if (segments.length === 0) segments.push({ type: 'text', data: { text } });
  return segments;
}

export interface SplitReplyOptions {
  splitBySentence: boolean;
  sentencesPerMessage: number;
  maxBytes: number;
}

export function splitReplyIntoMessages(segments: OneBotSegment[], opts: SplitReplyOptions): OneBotSegment[][] {
  const images = segments.filter((s) => s.type === 'image');
  const textParts = segments.filter((s) => s.type !== 'image');
  const groups: OneBotSegment[][] = [];

  if (textParts.length) {
    if (!opts.splitBySentence) {
      groups.push(textParts);
    } else {
      const fullText = textParts
        .filter((s) => s.type === 'text')
        .map((s) => (s.data as { text?: string }).text ?? '')
        .join('');
      const faces = textParts.filter((s) => s.type === 'face');
      const sentences = fullText
        .split(/(?<=[。！？!?；;])/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (sentences.length <= 1) {
        groups.push(textParts);
      } else {
        for (let i = 0; i < sentences.length; i += opts.sentencesPerMessage) {
          const chunk = sentences.slice(i, i + opts.sentencesPerMessage).join('');
          if (opts.maxBytes > 0 && Buffer.byteLength(chunk, 'utf8') > opts.maxBytes) {
            for (const sub of splitLongText(chunk, opts.maxBytes)) {
              groups.push([{ type: 'text', data: { text: sub } }]);
            }
          } else {
            groups.push([{ type: 'text', data: { text: chunk } }]);
          }
        }
        if (faces.length && groups.length) groups[groups.length - 1].push(...faces);
      }
    }
  }
  for (const img of images) groups.push([img]);
  return groups.length ? groups : [[{ type: 'text', data: { text: '' } }]];
}

export function renderTextWithFaces(text: string): string {
  return text.replace(/\[表情(\d+)(?::[^\]]*)?\]/g, (_m, id) => `[表情${id}：${faceName(Number(id))}]`);
}

/**
 * 去除「括号内心理活动 / 旁白 / 动作描写」（成对的全角（）与半角() 内容）。
 * 这些属于角色内心戏：保留在模型输出历史（对话上下文）里，但不应发到 QQ。
 * 只去除成对括号及其内部文本，不触碰 [表情]/[表情包] 等方括号标记。
 * 括号整体移除后顺手清理遗留的空行与多余空白，避免发出空气泡。
 */
export function stripInternalThoughts(text: string): string {
  if (!text) return text;
  let out = text
    // 角色内心戏：成对全角（）与半角()，保留在上下文但不发到 QQ。
    .replace(/（[^（）]*）/g, '')
    .replace(/\([^()]*\)/g, '')
    // 推理模型可能以 <think>…</think> 输出思维链（含未闭合的流式截断尾巴）。
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    // 部分模型/提示词用「【思考】…【/思考】」或「思考：…」包裹推理。
    .replace(/【思考】[\s\S]*?(?:【\/思考】|$)/g, '')
    .replace(/思考[:：][\s\S]*?(?=\n\n|$|(?=。{0,2}\n))/g, '');
  out = out.replace(/[ \t]*\r?\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}

export function splitLongText(text: string, maxBytes: number): string[] {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let cur = '';
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, 'utf8');
    const curBytes = Buffer.byteLength(cur, 'utf8');
    if (lineBytes > maxBytes) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      let rest = line;
      while (Buffer.byteLength(rest, 'utf8') > maxBytes) {
        let cut = maxBytes;
        while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), 'utf8') > maxBytes) cut -= 8;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      cur = rest;
      continue;
    }
    if (curBytes + lineBytes + 1 > maxBytes && cur) {
      chunks.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function parseJsonCard(data: string | undefined): string | null {
  if (!data) return null;
  try {
    const card = JSON.parse(data);
    const prompt = card?.meta?.detail_1?.text ?? card?.prompt;
    if (typeof prompt === 'string' && prompt.trim()) return prompt.trim().slice(0, 200);
    if (Array.isArray(card?.app) === false && typeof card?.text === 'string') return (card as { text: string }).text.slice(0, 200);
  } catch {
    /* 非 JSON，忽略 */
  }
  return null;
}

export function eventClock(timezone: string, d: Date = new Date()): string {
  return shortTime(timezone, d);
}

export function eventTs(timezone: string, d: Date = new Date()): string {
  return nowIso(timezone, d);
}
