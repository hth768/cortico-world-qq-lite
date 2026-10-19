# 更新日志

## 0.2.2

- 修复控制台「功能模块 / 功能市场」启用时安装失败仍提示「已启用」的误导性问题：`featureInstall` 失败现在会在 `catch` 中提示「操作失败」，不再误报成功。
- 重建 `dist/console.js`，使发布的控制台 bundle 与当前 `src/console/client.ts` 源码保持一致（此前发布的 0.2.1 控制台 bundle 落后于源码，缺失部分已实现的面板与逻辑）。
