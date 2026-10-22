/**
 * 核心配置：连接与监听、提示词模板、投递过滤，以及功能包清单（features）。
 *
 * 功能包自身的配置不写死在这里，而是：
 *  1) 在 activate 时通过 host.registerConfigSection({id,title,fields}) 声明字段与默认值；
 *  2) 存于 worlds.qqbot.modules[featureId][field]；
 *  3) 由控制台「功能模块」页统一渲染与编辑。
 * normalizeConfig 会在启动时把各功能段声明的默认值补齐到 modules 中。
 */
import type { ConfigGroup as FrameworkConfigGroup, ConfigProperty } from 'cortico/core/types.ts';
import type { ConfigGroup, ConfigSection, QQCoreConfig } from './types.ts';
import { toIds } from './types.ts';

export const QQ_LITE_DEFAULTS = {
  enabled: false,
  mode: 'reverse' as const,
  wsUrl: '',
  wsHost: '127.0.0.1',
  wsPort: 3001,
  wsPath: '/',
  token: '',
  groups: [] as number[],
  privates: [] as number[],
  timezone: 'Asia/Shanghai',
  selfName: '机器人',
  emojiDir: '',
  deliverImageAttachments: true,
  splitReplyBySentence: true,
  sentencesPerMessage: 1,
  sendIntervalMs: 600,
  maxMessageBytes: 1500,
  filterInternalThoughts: true,
  forwardExpandLimit: 8,
  privateAggregationWindow: 5,
  maxSequenceGap: 3,
  replyMaxGapSec: 120,
  features: [] as string[],
  modules: {} as Record<string, Record<string, unknown>>,
  env: '你是 {{selfName}}，运行在 QQ 上。\n当前时间：{{now}}（{{timezone}}）。\n你在监听：{{listen}}。',
};

export function coreDefaults(): QQCoreConfig {
  return JSON.parse(JSON.stringify(QQ_LITE_DEFAULTS));
}

/**
 * 规整：补齐缺失字段、把 groups/privates 统一成数字数组，并把功能段默认值写入 modules。
 * 注意：这里返回**新对象**（不就地改 raw），避免污染框架 `worlds.qqbot` 的 live 节点，
 * 否则一次 config.set 就会把默认空值（如 features:[]）固化进 config.json。
 * 控制台读取实时配置改由 world 持有的 `liveCfg`（框架 live 引用）完成，见 world.ts。
 */
export function normalizeConfig(
  raw: Record<string, unknown> | undefined,
  sections: ConfigSection[] = [],
): QQCoreConfig {
  const base = coreDefaults() as unknown as Record<string, unknown>;
  const merged = { ...base, ...(raw || {}) } as Record<string, unknown>;

  merged.groups = toIds(merged.groups);
  merged.privates = toIds(merged.privates);
  // features 同样是「逗号/空白分隔的清单」，控制台 list 字段以字符串形式存回；
  // 统一解析为包名数组（去空、去首尾空白），避免被当成非数组清空成 []。
  merged.features = toFeatureList(merged.features);
  if (typeof merged.modules !== 'object' || merged.modules === null) merged.modules = {};

  const cfg = merged as unknown as QQCoreConfig;

  // 把已注册功能段的字段默认值补进 modules[id]，用户已配置的值优先。
  for (const sec of sections) {
    const bucket = (cfg.modules[sec.id] = cfg.modules[sec.id] || {});
    for (const f of sec.fields) {
      if (!(f.key in bucket)) bucket[f.key] = f.default;
    }
  }
  return cfg;
}

/** 将「空格/逗号分隔字符串」或「字符串数组」统一成包名数组（去空、去首尾空白）。 */
function toFeatureList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

const conn: ConfigGroup = {
  id: 'qq',
  title: 'QQ 连接',
  description: 'NapCat / OneBot v11 的连接方式。反向（容器/局域网常用）由本世界监听端口等待 NapCat 来连；正向则去连 NapCat 已开的反向 WS。',
  fields: [
    {
      key: 'mode',
      label: '连接模式',
      type: 'select',
      default: 'reverse',
      options: [
        { value: 'reverse', label: '反向（本世界监听端口，NapCat 主动连入）' },
        { value: 'forward', label: '正向（连接 NapCat 的反向 WS 地址）' },
      ],
      description: '反向模式在容器内最稳：NapCat 配置反向 WS 指向本世界端口即可。',
    },
    { key: 'wsUrl', label: '正向 WS 地址', type: 'string', default: '', placeholder: 'ws://127.0.0.1:3001', description: '仅正向模式使用。' },
    { key: 'wsHost', label: '监听地址', type: 'string', default: '127.0.0.1', description: '反向模式监听的网卡地址。' },
    { key: 'wsPort', label: '监听端口', type: 'number', default: 3001, description: '反向模式监听的端口（NapCat 反向 WS 指向此处）。' },
    { key: 'wsPath', label: 'WS 路径', type: 'string', default: '/', description: '反向模式监听的 URL 路径。' },
    { key: 'token', label: 'Access Token', type: 'string', default: '', description: 'NapCat 配置的 access_token，留空表示不校验。' },
    { key: 'selfName', label: '自称', type: 'string', default: '机器人', description: '用于提示词与 @ 识别。' },
    { key: 'timezone', label: '时区', type: 'string', default: 'Asia/Shanghai', description: '用于作息/时间相关提示词渲染。' },
    { key: 'emojiDir', label: '表情目录', type: 'string', default: '', description: '存放表情包图片的目录（功能包 hth-qq-sticker 使用）。' },
  ],
};

const listen: ConfigGroup = {
  id: 'listen',
  title: '监听名单',
  description: '只在这些群/私聊里参与对话。留空表示不限制。',
  fields: [
    { key: 'groups', label: '监听群号', type: 'list', default: [], description: '只在这些群里发言与倾听（数字，逗号或换行分隔）。' },
    { key: 'privates', label: '监听私聊 QQ', type: 'list', default: [], description: '只对这些 QQ 开启私聊（数字）。' },
  ],
};

const deliver: ConfigGroup = {
  id: 'deliver',
  title: '投递与拆分',
  description: '控制消息如何拆条、限速与附件投递。',
  fields: [
    { key: 'deliverImageAttachments', label: '投递图片附件', type: 'boolean', default: true, description: '把事件里的图片以附件形式投递给主 session。' },
    { key: 'splitReplyBySentence', label: '按句拆分回复', type: 'boolean', default: true, description: '长回复按句拆成多条发送。' },
    { key: 'sentencesPerMessage', label: '每包句数', type: 'number', default: 1 },
    { key: 'sendIntervalMs', label: '发送间隔(ms)', type: 'number', default: 600 },
    { key: 'maxMessageBytes', label: '单条最大字节', type: 'number', default: 1500 },
    { key: 'filterInternalThoughts', label: '屏蔽括号内心理活动', type: 'boolean', default: true, description: '发送前滤除（）、() 内的心理活动/旁白，保留在对话上下文中但不发到 QQ。' },
    { key: 'forwardExpandLimit', label: '转发件展开上限', type: 'number', default: 8 },
    { key: 'privateAggregationWindow', label: '私聊聚合窗口(秒)', type: 'number', default: 5 },
    { key: 'maxSequenceGap', label: '最大序号间隙', type: 'number', default: 3 },
    { key: 'replyMaxGapSec', label: '回复最大间隔(秒)', type: 'number', default: 120 },
  ],
};

const prompt: ConfigGroup = {
  id: 'prompt',
  title: '提示词模板',
  description: '可用占位符：{{now}} 当前时间、{{date}} 日期、{{timezone}} 时区、{{selfName}} 自称、{{listen}} 监听名单摘要。各功能包会追加自己的片段。',
  fields: [
    {
      key: 'env',
      label: '环境提示词(env)',
      type: 'multiline',
      default:
        '你是 {{selfName}}，运行在 QQ 上。\n当前时间：{{now}}（{{timezone}}）。\n你在监听：{{listen}}。',
      description: '渲染后作为 env（环境上下文）注入 system 前缀。',
    },
  ],
};

const modules: ConfigGroup = {
  id: 'modules',
  title: '功能模块',
  description: '列出要启用的功能包（npm 包名，例如 hth-qq-sticker）。留空则只运行基础能力。功能包自身的配置见控制台「功能模块」页。',
  fields: [
    { key: 'features', label: '启用功能包', type: 'list', default: [], description: '动态加载并挂载的功能包清单。' },
  ],
};

export function coreConfigGroups(): ConfigGroup[] {
  return [conn, listen, deliver, prompt, modules];
}

/** 供控制台下拉「时区」选项（configOptions 的 kind='qq-timezone'）。 */
export function qqTimezoneOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
    { value: 'Asia/Tokyo', label: '东京 (UTC+9)' },
    { value: 'Asia/Hong_Kong', label: '香港 (UTC+8)' },
    { value: 'Asia/Taipei', label: '台北 (UTC+8)' },
    { value: 'Asia/Singapore', label: '新加坡 (UTC+8)' },
    { value: 'Asia/Seoul', label: '首尔 (UTC+9)' },
    { value: 'America/New_York', label: '纽约 (UTC-5)' },
    { value: 'America/Los_Angeles', label: '洛杉矶 (UTC-8)' },
    { value: 'Europe/London', label: '伦敦 (UTC+0)' },
    { value: 'UTC', label: 'UTC' },
  ];
}

/**
 * 把 Lite 声明式配置组转换成框架 ConfigGroup（供控制台通用编辑器使用）。
 * 属性路径使用完整路径 `worlds.qqbot.<field>`（功能段为 `worlds.qqbot.modules.<id>.<field>`）：
 * 框架的 getByPath/setByPath 是相对部署根 cfg 解析的，而本世界运行态配置位于 worlds.qqbot，
 * 控制台读写必须落到该节点，否则会写进顶层字段、被运行态真相值覆盖（表现为“保存后回退”）。
 * resolveConfigValue 读取时会先剥掉 `worlds.qqbot.` 前缀再相对 liveCfg 遍历，读写两侧一致。
 */
export function toFrameworkConfigGroup(group: ConfigGroup, prefix = ''): FrameworkConfigGroup {
  const properties: Record<string, ConfigProperty> = {};
  for (const f of group.fields) {
    const base = prefix ? `${prefix}.${f.key}` : f.key;
    const key = `worlds.qqbot.${base}`;
    properties[key] = toConfigProperty(f);
  }
  return {
    id: group.id,
    owner: 'world:qqbot',
    schema: { type: 'object', title: group.title, description: group.description, properties },
  };
}

function toConfigProperty(f: ConfigField): ConfigProperty {
  const p: ConfigProperty = { title: f.label, description: f.description };
  switch (f.type) {
    case 'boolean':
      p.type = 'boolean';
      break;
    case 'number':
      p.type = 'number';
      break;
    case 'select':
      p.type = 'string';
      if (f.options && f.options.length) p.enum = f.options.map((o) => String(o.value));
      break;
    case 'list':
      // 框架目前只把 type:'array' 当作「二元数组（恰好 2 个数字）」校验（见框架
      // config-schema.ts 的 needsPair），而 list 字段（groups/privates/features）是
      // 任意长度的清单。改声明成 string，让框架按逗号/空白分隔串接受；运行期由
      // toIds / toFeatureList 解析为数组，避免「需要两个数」的误报。
      p.type = 'string';
      break;
    case 'multiline':
    case 'string':
    default:
      p.type = 'string';
      break;
  }
  return p;
}
