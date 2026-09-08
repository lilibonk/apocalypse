# LIL-85 品牌替换 · 设计 QA

final result: passed

2026-09-08 第一版验收：用户明确“第一版验收提交”，接受包含修订 03 的当前版本并授权本地 Git 提交；不推送。下方历史“待确认”均描述当时的检查状态，不覆盖本次验收结论；已记录的测试与设备边界保持不变。

## 最新修订 03 · 暗色对比度

2026-09-08 用户再次要求更换暗色史莱姆颜色、增强设计对比度。本节优先于下方修订 02 的暗色色名与测试数；人工验收尚待用户确认。

- Source visual truth：已实现角色的 `docs/brand-slime/revision-03-before-dark.png`，加用户明确的暗色改色意图；形状参考继续为 `docs/brand-slime/target-v1.png`。不把亮色目标图当作暗色颜色必须相同的依据。
- 实现证据：`revision-03-after-dark.png`、`revision-03-login-dark.png`、`revision-03-login-light.png`（均 1280×720）；`revision-03-mobile-dark.png`（390×844）；文件均在 `docs/brand-slime/`。
- 同框细节对比：`revision-03-dark-comparison.png`，1280×512；左右均为 640×512 的同尺度真实角色区域，旧图 x640/y0、新图 x640/y114，归一了滚动位置；源截图与实现截图均为 CSS 像素截图，640px 角色容器、1280px drawing buffer、DPR 2。不对角色图片二次改色。角色已占主要画面，因此不再另作局部放大。
- 比较历史第 9 次：P2 旧冷灰青身体层次偏弱；先改冰翡翠配方，首个候选仍偏灰，再提高暗色散射绿色明度。最终同框身体明显更亮、浅薄荷底缘与深墨绿五官分层；轮廓和布局保持，未发现本范围新增 P0/P1/P2。材质是否合意交由用户，不自动判定人工通过。
- 五个必查表面：字体/排版、布局/间距、文案/内容均沿用现状且未改；颜色改为同源 `.dark --slime-*` 冰翡翠绿，亮色保留；图像保持透明软体、高光与五官，暗色五状态静态海报重新导出（`revision-03-dark-posters.png`），没有背景矩形。手机无横向溢出。
- 交互复检：生产暗色初开与 light → dark 热切、窄屏；真实组件关闭 DOM 动画后零 Canvas 显示新暗色海报，恢复后一个 Canvas（`revision-03-static-dark.png`）。生产登录 console error 为空。气泡、gaze、物理代码和材质透明度/强度未改；本轮未重新声称 60 秒采样。
- 前端全量门禁：39 文件 / 288 测试通过；未新增依赖或改动架构规则。残余 P3 为下方已记录的实时/海报差异与非逐像素物理近似。
- 实现清单：暗色 token、真实 token 回归、五状态海报、桌面/窄屏/静态复检已完成；用户配色验收待定。具体修订见 `docs/brand-slime/revision-03.md`。

## 修订 02 历史证据

2026-09-08 修订 02：这是实现级复检，不代表用户人工验收通过。人工曾指出指针焦点框、暗色材质、静止/失真的气泡及浪潮/视线回归；用户最终明确登录不展示浪潮，改为实验室默认关闭开关。以下依据最新范围及修订证据；过程见 docs/brand-slime/revision-01.md。

## 视觉事实与比较方法

- Source visual truth：`docs/brand-slime/target-v1.png`，1254×1254 px；内置 ImageGen 单图先于实现。
- Implementation：真实 Three.js Renderer + WebGPUBackend，固定镜头，非静态图伪装实时。
- 同框对照：`docs/brand-slime/revision-02-comparison-light.png`，1280×720 px；左目标、右生产实现，light / idle / static。另重新打开 softie 参考页观察连续运动，截图 revision-02-source-bubbles.png，12 秒实现录屏 revision-02-bubbles.webm；不同角色/视口不做逐像素动态同一性声明。
- Viewport：1280×720 CSS px；两侧分别为 640×640 CSS px。源图由浏览器等比缩至 640；drawing buffer 为 1280×1280，DPR 2。截图按 CSS 尺寸归一，未拿双密度原图直接比较比例。
- Focused region：角色在每侧约 500×375 px，五官、透射边缘、高光与气泡在同框图中均清楚可辨，不另裁切产生密度差异；产品文本/焦点另以实际页面截图核对。
- 本次产品证据：`revision-02-login-light.png`、`revision-02-login-dark.png`（1280×720）；`revision-02-mobile-light.png`、`revision-02-mobile-dark.png`（390×844），均在 `docs/brand-slime/`。手机 document 宽度及 scrollWidth 均为 390，无横向溢出；仅一个 256px WebGPU canvas，零 letterpress。
- 目标图只定义角色，不定义整页。登录继承既有设计系统；舞台改为干净背景，桌面 384 / 手机 256。Logo、favicon、认证契约不改。

## 比较历史与修复

1. `comparison-01.png`：P1 背景偏灰、模糊塑料质感、气泡缺失；P2 五官重影。修复同源 sRGB 背景、气泡材质和脸部透明排序。
2. `comparison-02.png`：重影消除；P2 高光位置/底部反光仍明显。调整窗光、轮廓光、体型和接触阴影。
3. `comparison-03.png` / `comparison-04.png`：比例与颜色收敛；P2 气泡可见度与局部光泽不足。调整清漆、透射厚度与底部散射近似。
4. `comparison-05.png`：轮廓、两眼一嘴、mint 半透明材质、高光和阴影达到同一方向，之后才开始交互细化。
5. `comparison-06.png`：进一步减小透射厚度，去除残余气泡重复折射。最终无可见悬浮脸、重影或背景接缝。
6. 人工反馈重新打开 P2 焦点框/暗色材质/静止气泡及 P1 视线/浪潮遗漏。修订 01 区分 pointer/keyboard、全量主题更新、恢复 gaze/浪潮；但用户指出三轴气泡摆动失真，未将单元测试通过视为体验通过。
7. 修订 02：气泡从前表面金属亮珠改为 56 枚体内非金属透明气泡，缩小尺寸、取消脸区留空，缓慢单向上浮、微量横漂、在透明边界区重生。`revision-02-comparison-light.png` 中无原来的前景亮珠圈；12 秒录屏为连续上浮，没有可见的循环跳跃。用户随后明确去掉登录浪潮；实验室默认关闭，展开开启仅局部预览，收起/关闭即卸载（revision-02-wave-lab-on/off.png）。
8. 最终登录明暗按压：canvas 保持 focus，但 pointer outline 为 none 0px；Shift+Tab 为 keyboard，solid 1.5px（revision-02-keyboard-focus.png）。暗色直开及热切自动读取冷青绿配方；密码聚焦仍闭眼。无新增可见 P0/P1/P2，材料微细节差异归入下述 P3。

## 必查的五个表面

| 表面       | 结论与证据                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 字体/排版  | 目标为纯角色图，无字体可匹配。产品沿用既有 sans/mono 栈、语义字号与权重；1280/390 宽度的中英文标题、字段与按钮均可读、无遮挡。未新增字体依赖。 |
| 布局/间距  | 同框角色构图、底部接触面和留白已对齐；产品桌面分屏/窄屏单列。手机主按钮在 844 高视口内，主题/语言可滚动到达，没有固定控件裁切。                |
| 颜色/token | mint / 冷青绿使用统一 --slime-*；明暗全量更新身体、衰减、散射与灯光，海报同步切换；没有原暗色灰白身体或矩形接缝。                              |
| 图像质量   | 用户明确要求可交互 3D，故采用真实 WebGPU 场景。五官与身体共享形变；气泡为体积内透明空气夹杂，非金属珠。最终场景重新导出明暗各五张海报。        |
| 内容/状态  | 认证操作与文案保持；新增操作提示/失败说明为 zh/en 同键词条。五状态共用；密码聚焦闭眼、空表单校验正常。                                         |

## 交互与运行证据

- 实际鼠标拖拽、释放、持续按压与空格戳动已操作；证据：`pressed.png`、`drag-release.png`、`keyboard-poke.png`、`interaction.webm`。
- DOM 动画关闭后大角色切静态；恢复、卸载/重挂后恢复 WebGPU，小角色始终静态。全局设置在既有 DEV 实验室验证，生产沿用原本默认设置裁剪规则。
- `static-fallback.png`：全局关闭后的 384/64 海报；`device-lost.png`：实际 GPUDevice.destroy 后 lost 提示，无 WebGL 回退。
- 无 API/adapter、构造/初始化异常、初始化期间 abort、幂等释放和 reduced-motion 组合由自动化覆盖，未修改用户 OS 辅助功能设置。
- 后台暂停、blur/pointercancel/lostpointercapture 清理做实现审查；未模拟 OS 挂起或真实驱动崩溃。
- 正式登录及设备丢失页 console error 为空。未使用真实账号提交登录，受保护业务的服务端联调不是本次已验证项。
- 本轮生产场景 10 秒预热 + 60 秒混合交互：7129 帧 / 60007.7 ms，平均 118.80 FPS，p95 9.30 ms，>25ms 为 0；WebGPU/Apple Metal 3，buffer 1280×1280、DPR 2。原始记录 `docs/brand-slime/revision-02-performance-60s.json`。初版 performance-60s.json 及中断的 revision-01 采样不作为本轮证据。
- 实验室默认 unchecked 且零 letterpress；开启为 1，收起/关闭为 0。PixelScale 的 data-effect 同名不能误计为浪潮 Canvas。DEV 实际 SettingsDrawer 通过独立本地验收文档挂载，没有认证绕过或新业务路由。
- 最终正式登录与性能页 console error 均为空；39 文件 / 287 自动测试通过。

## 非阻塞差异与验收边界

- P3：源图摄影级微纹理、气泡分布、底部散射与实时近似不逐像素一致；是否继续追求更清透或更软，由人工验收决定。
- P3：实时材质比目标略偏乳浊、气泡边缘更柔；窄屏低密度的高光细节不如大画布平滑。保留透明/软体方向，不把本次近似说成示例源码或完整流体仿真。
- P3：透明海报与实时透射在背景上的亮度略有差异；海报仅服务于静态降级，不算实时性能通过。
- 仅本机 WebGPU 性能通过；移动视口不是实体手机 GPU 测量，不保证所有设备 60 FPS。

## 实现清单

- [x] 目标图 → 静态场景 → 同框修复 → 软体交互，保留顺序证据。
- [x] 实际登录与五状态兼容入口完成，未把 3D 扩散到业务正文。
- [x] 明暗、390px、键盘、动效开关、卸载/重建与 strict WebGPU 检查完成。
- [x] 设计定义、批准的前端规则、依赖锁与测试同步维护。
- [x] 用户于 2026-09-08 接受当前第一版并授权本地提交；未授权推送。
