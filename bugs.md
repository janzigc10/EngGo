# EngGo 已知问题与环境坑

## 长期环境约束
- 当前 `C:\Users\Chen\Desktop\EngGo` 不是独立 git 仓库；直接执行 git 时会落到 `C:\` 的 git 根，并触发 `dubious ownership / safe.directory` 问题。
- 当前目录下存在 `.superpowers/brainstorm/` 与 `.playwright-cli/` 产物；如果后续初始化 git，需要明确忽略策略。
- 在当前桌面环境里，`rg.exe` 可能不可用或报 `Access is denied`，检索时需要准备 PowerShell 回退方案。

## 已确认并需要记住的问题
- 当前项目只有设计文档，没有正式代码骨架；任何实现计划都需要先考虑初始化成本。
- 通过某些终端读取中文 Markdown 时，可能出现编码显示异常；文件内容本身未必损坏，但阅读时要小心误判。

## 已延期但仍待处理
- 正式仓库初始化
- `.gitignore` 策略确定
- PostgreSQL 实例与环境变量配置落地
- 首版 Sentry 与部署环境配置落地

## 不要重复走的失败路径
- 不要在没有 implementation plan 的情况下直接开始大规模搭项目。
- 不要把首页重新做回“搜索结果页”或“词书首页”。
- 不要把 `.superpowers/brainstorm/` 中的探索页面误当成正式前端实现。
- 不要把 `AGENTS.md` 写成长期 session 流水账；历史过程应压缩为滚动交接或单独归档。
- 不要在未确认设计变更时直接改实现；先记录问题，再决定是否调整 spec / plan。
