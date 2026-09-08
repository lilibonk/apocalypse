# LIL-85 · WebGPU 软体品牌替换

日期：2026-09-08。状态：实现、截图对齐与本机性能验证完成；用户已接受包含修订 03 的第一版并授权本地提交，证据见 `acceptance.md`。

人工验收后的修订及最新范围见 `revision-01.md`：修复明暗焦点框、同源明暗材质与海报、恢复 gaze；气泡改为体内细小透明上浮，不再三轴往返。用户最终要求登录不展示浪潮，PixelWave 仅在开发态动效实验室通过默认关闭开关预览。旧性能记录不是修订后负载的证据。

## 授权、范围与基线

- 用户指定 Three.js + WebGPU、半透明软体、气泡、两眼一嘴、按压/拎起/回弹、轻重力与 60 FPS；先一张目标图，截图对齐后再做交互。
- 用户随后授权品牌替换，以及 Three.js/必要类型依赖、前端 AGENTS.md、设计定义、ESLint 与品牌契约测试的同步调整；2026-09-08 第一版验收时另行授权本地 commit，未授权 push。未涉及后端、公开 API、数据库或核心前端技术栈替换。
- 仓库现有 React 19 / Vite 7 / TypeScript strict / pnpm；PixelOrb 是全站角色入口，登录桌面/移动及 DynaTable 空态消费它。PageLoading 已使用 PixelScale，不恢复旧角色或额外引擎。静态 BrandSignature、favicon 与角色分工保持。
- 既有 PixelOrb 五状态、动效双开关、尺寸阶梯、主题、登录密码聚焦闭眼行为、DynaLayer 与权限/请求逻辑继续复用。
- 开始时 README.md 已有未提交修改，docs/opc-workflow.md 为用户未跟踪文件；不覆盖这些修改，不移动旧品牌资产。

## 比较与选择

| 方案                                      | 变更半径与耦合                                                              | 依赖/许可与离线                                                                | 安全/兼容/回滚                                                                       | 性能与可测性                                                     | 结论                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| 保持 PNG + CSS PixelOrb                   | 最小，调用点无需改变                                                        | 无新增，已内置                                                                 | 兼容最广，不能提供真实 WebGPU/局部软体                                               | 最便宜，已有契约                                                 | 不满足用户核心要求，仅保留历史文件和静态降级原则                     |
| Three.js WebGPU + 解析形变/少量弹簧自由度 | 保留 PixelOrb 兼容入口，引擎封装在 effects/webgpu；脸与身体使用同一形变函数 | three 0.185.1 / @types/three 0.185.4，MIT；无远程 HDR/CDN/物理库，打包离线运行 | 无 WebGPU 时静态新角色 + 明确提示；初始化失败/设备丢失关闭实时渲染；可单独回滚本任务 | 有界网格与气泡；纯函数物理/形变测试、真实 GPU 验证、可见测量面板 | **选择**；先验证轮廓/材质，后接局部按压与弹性形变                    |
| Three.js WebGPU + 全粒子 XPBD/体积约束    | 需要邻接/约束、碰撞求解、GPU compute 或更多 CPU 数据结构                    | 可自研或增加库；新库需额外授权                                                 | 自碰撞、快速拖拽、求解稳定性扩大维护面                                               | 对强拉伸/自接触更真实，但本次单角色/轻互动没有证明额外成本必要   | 本次弃选；强拉伸、自接触、多软体成为真实需求或解析方案验收失败时重评 |

不是把首个可行写法视为架构：优先复用现有角色入口、状态、设置与 UI；仅把已获授权的 3D 渲染限制在独立目录。渲染模型不是精确材料仿真，验收依据是局部形变、体积感、回弹稳定性与表面附着，而非物理学精度声明。

## WebGPU 运行时边界

- 上游 WebGPURenderer 构造器会主动提供 WebGL fallback，forceWebGL=false 不能排除回退。
- 采用 Three.js 公共导出的 Renderer + WebGPUBackend + StandardNodeLibrary，明确 getFallback=null。只使用 node materials；不创建 WebGLRenderer、WebGLBackend 或 WebGL 上下文。
- 初始化前检查 navigator.gpu；初始化后核验 backend.isWebGPUBackend；验证设备丢失、无 API、初始化异常和卸载期间异步完成的清理。固定版本并以契约测试守护这些假设。
- 页面隐藏或离开视口停止动画；reduced-motion/全局动画关闭使用静态新角色，不申请 GPU。小尺寸/空态静态角色与对应可访问状态文案优先，避免表格产生大量设备实例。
- 新目标图与静态资产均存入仓库，不以参考站资源为运行时依赖。

## 证据与重新评估

- [参考体验](https://softie.520ai.site/)：2026-09-07 操作观察，2026-09-08 再次查看。只记录视觉/交互，不声称验证其内部引擎/帧率。
- [WebGPURenderer 文档](https://threejs.org/docs/pages/WebGPURenderer.html)及 [r185 构造器](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgpu/WebGPURenderer.js)：默认 WebGL fallback。
- [r185 公共导出](https://github.com/mrdoob/three.js/blob/r185/src/Three.WebGPU.js)与 [Renderer](https://github.com/mrdoob/three.js/blob/r185/src/renderers/common/Renderer.js)：可显式组合 WebGPUBackend，getFallback 默认为 null。
- [MeshPhysicalNodeMaterial](https://threejs.org/docs/pages/MeshPhysicalNodeMaterial.html)：透射、厚度、衰减、清漆等材质能力。具体安装包源码和类型已在实现前核对。
- npm registry 在 2026-09-08 返回 three 0.185.1 / @types/three 0.185.4，许可 MIT；本次精确锁定，不升级其他依赖。
- `@types/three` 的传递依赖包含 Rapier、Tween、fflate、meshoptimizer 与 stats/WebXR 类型；这些由类型包引入，未作为应用物理或动画运行时使用。正式运行时仅新增 Three.js。
- 目标图：`target-v1.png`，内置 ImageGen 生成，先于实现。复核真实渲染同构图与状态后才进入交互细化。
- 自动化：纯函数确定性/极值、表面锚定、有限位移与体积补偿、初始化 fail-closed/cleanup、SSR 静态海报、引擎分域、pnpm check。
- 实机：记录 OS/GPU/browser/实际后端/DPR/渲染尺寸，预热后采集 60 秒混合操作，输出平均 FPS、p95 帧时、掉帧与样本数。静态海报不能算 WebGPU/60 FPS 通过。
- 重评触发：目标图对齐失败；解析形变无法达到软肉感；持续 60 FPS 失败；Three.js 升级；需要自接触/强拉伸/多实体；新挂载点导致多 GPU 实例；不支持 WebGPU 的用户占比不再接受静态降级。不得静默改用 WebGL。

## 目标图提示词（内置 ImageGen，单图）

Use case: stylized-concept. Single target studio rendering for Apocalypse's Three.js/WebGPU slime. Reference softie's translucent jelly, soft contact shadow and simple surface face, not its name, UI or exact silhouette. One mint-aqua green, round squat translucent slime on an invisible tabletop, plump organic dome and flattened yielding underside, no ears/horns/limbs. Two small glossy black bean eyes and one tiny curved smile directly on the front surface. Moderately soft gelatin, subtle milky mint interior, faint clear bubbles, not opaque plastic or a clear glass ball. Broad soft white upper-left studio-window highlight, softer right rim and mint-grey contact shadow. Near eye-level camera slightly looking down; orthographic product-render feeling. Centered square frame, warm off-white seamless background, generous margins, calm medium saturation. No typography, logos, interface, pedestal, grid, outlines or props.
