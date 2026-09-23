# 使用 Apocalypse

本目录面向从仓库获取脚手架、准备在其上开发业务模块的团队。当前仓库是开发版，尚未发布稳定版本；[根 README](../README.md) 说明现有能力和状态。

| 需要做什么 | 文档 |
| --- | --- |
| 在本机启动后端、前端并执行现有检查 | [快速开始](getting-started.md) |
| 理解模块边界，并按现有扩展点接入自己的业务域 | [模块开发](module-development.md) |
| 准备部署、数据库升级、配置和运行检查 | [运行与升级](operations.md) |
| 判断当前开发版与可发行版本的差距 | [发行与兼容契约](release.md) |
| 使用默认关闭的试验性 Calendar 能力 | [Calendar 手册](calendar/README.md) |
| 查看前端命令与目录 | [前端 README](../apocalypse-web/README.md) |

仓库中的 [AGENTS.md](../AGENTS.md) 和 [前端 AGENTS.md](../apocalypse-web/AGENTS.md) 是贡献者须遵守的架构约束。`docs/plans/`、设计走查和验收记录保存的是当时的决定或证据；如与当前代码及本目录使用说明冲突，应先核对当前实现，不把历史记录当作安装步骤。

使用这些文档无需访问维护者的私人知识库、Linear 项目或本机绝对路径。若本目录的操作需要这些资源才能完成，应视为文档缺陷。

新增文档先加入 Git 暂存区，再在仓库根运行 `node scripts/verify-public-docs.mjs`。它对照 Git 暂存区的跟踪清单检查上述公开入口及 Calendar 手册的本地链接，避免本机存在、干净克隆却不存在的目标被误判为有效；未暂存的新文件会被拒绝，外部网页内容不由此脚本校验。
