import type { EventDescribe } from 'cortico/core/types.ts';
import type { WorldDefinition } from 'cortico/world.ts';
import { QQWorld } from './src/world.ts';
import { coreDefaults, qqTimezoneOptions } from './src/config.ts';

const EVENTS: EventDescribe[] = [
  {
    type: 'chat',
    description: {
      zh: '一条已进入投递范围的 QQ 消息:群聊需满足提及/免提及条件,并已通过限速、防刷与作息等门控。',
      en: 'A QQ message cleared for delivery: groups must satisfy the mention rule, and rate-limit, anti-loop and quiet-hours gating must pass.',
    },
  },
];

export const definition: WorldDefinition = {
  id: 'qqbot',
  label: 'QQ 轻量世界',
  defaults: () => coreDefaults(),
  configOptions: (kind: string) =>
    kind === 'qq-timezone' ? qqTimezoneOptions() : [],
  create: (opts: { cfg: Record<string, unknown>; packageDir: string; dataDir: string }) =>
    new QQWorld({ cfg: opts.cfg, packageDir: opts.packageDir, dataDir: opts.dataDir }),
  describe: {
    // 工具全部由功能包在运行期经插件宿主挂载,静态解析时 tools() 为空,故声明空表。
    tools: [],
    events: EVENTS,
  },
};
