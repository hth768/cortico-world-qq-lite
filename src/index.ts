/**
 * cortico-world-qq-lite 公共入口。
 * - 默认导出：WorldDefinition（供 Cortico 框架加载本世界）。
 * - 命名导出：插件宿主 API 与类型（供功能包 cortico-world-qq-* 依赖与使用）。
 */
import type { WorldDefinition } from 'cortico/world.ts';
import { definition } from '../definition.ts';
import type { QQFeature, ActivateFn } from './types.ts';

export * from './types.ts';

export { QQWorld } from './world.ts';
export { definition };
export { createFeatureContext } from './sdk.ts';
export type { FeatureContext } from './sdk.ts';
export type { WorldDefinition };

/** 便捷构造一个功能包描述对象。 */
export function defineFeature(id: string, activate: ActivateFn): QQFeature {
  return { id, activate };
}

export default definition;
