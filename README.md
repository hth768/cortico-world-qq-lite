# cortico-world-qq-lite

轻量化 QQ 世界基础包（Cortico 框架 `kind: world`，api 5）。

从 `cortico-world-qq-final` 抽出的**轻量核心**：只保留连接与监听（OneBot 反向/正向 WS）、实时事件分发、监听名单、配置基础设施、提示词模板机制，并暴露一套**插件宿主 API**（`QQHost` / `createFeatureContext`）。

其它功能（表情包、主动说话、群聊限速、防刷、作息、语音、空间、情绪、好感度、群管理、提醒、笔记本、节日、历史）各自成为独立的 npm 包，声明 `dependencies: { "cortico-world-qq-lite": "*" }`，在运行时由本基础包按部署配置（`worlds.qqbot.features`）动态 `import()` 并调用其 `activate(host)`。

## 已剔除（不在本包）

`voxcpm` 侧车、语音电话（`call`）、桌宠（`desktop-pet`）、`cua`。

## 配置示例

```jsonc
{
  "worlds": {
    "qqbot": {
      "mode": "reverse",
      "wsHost": "0.0.0.0",
      "wsPort": 3001,
      "groups": [123456789],
      "features": ["cortico-world-qq-sticker", "cortico-world-qq-voice"],
      "modules": { "voice": { "enabled": true, "provider": "native" } }
    }
  }
}
```

## 许可

MIT
