# effects · 当前品牌效果入口

现行视觉规则见[设计定义](../design/DEFINITION.md)，引擎边界见[前端 AGENTS.md](../../AGENTS.md)。本目录的旧 Mint Bonk、PixelBean 与 RetroGrid 代码仅供兼容或历史追溯；不要据此恢复旧登录舞台。

| 入口                    | 当前职责                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PixelOrb/`             | 五状态吉祥物兼容 API；384/256 尺寸在可见且允许动效时按需委托 `webgpu/slime/`，小尺寸和降级使用同模型海报。            |
| `webgpu/slime/`         | Three.js WebGPU 角色；形变、表情、气泡、碰撞与材质参数集中在此域。无 WebGL fallback，退出/隐藏/失败须释放或暂停资源。 |
| `PixelWave/`            | PixelScale 仍用于加载/进度；PixelWave 铅字浪潮只在开发态动效实验室默认关闭的预览中挂载，登录与数据正文不用。          |
| `registry/PixelBubble/` | 8bitcn 来源的像素边框空态组件。                                                                                       |
| `registry/RetroGrid/`   | Magic UI 来源的已弃用兼容代码，新功能不得引用。                                                                       |

所有动效遵守 `prefers-reduced-motion` 与全局动画开关。数据表面用中性 Skeleton；Dialog、AlertDialog 与 Sheet 的真实内容由 `components/motion/PixelDialogMotion.tsx` 编排，不叠加独立装饰层。登录文案的逐字入场在 `views/login/TaglineReveal.tsx` 内独立实现。

外部移植代码与直接依赖的原始授权由[第三方声明](../../../THIRD_PARTY_NOTICES.md)索引；本目录文件头中的来源只描述具体适配，不决定 Apocalypse 项目自身的许可。
