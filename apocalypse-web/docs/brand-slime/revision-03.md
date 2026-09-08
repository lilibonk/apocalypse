# LIL-85 · 暗色配色与对比度修订

2026-09-08 用户要求：“暗色模式，更换史莱姆颜色，增加设计美感的对比度。”

## 适配性门禁

`not-required`：本次只在有效批准的 Three.js WebGPU 角色、同源明暗 token 和静态海报机制内调整暗色材质颜色，不新增依赖、API、模块、Schema、引擎、设置项或架构规则。已核对 `appearance.ts` 读取入口、`scene.ts` 全材质热切换与 `appearance.test.ts` 的清理回归。保持几何、透明度、光照强度、气泡、视线和软体交互原样。

现状截图 `revision-03-before-dark.png`：冷灰青身体与浅灰反射叠加，面部和身体中部的明度层次偏弱。选择同一 mint 品牌范围内更明亮的冰翡翠绿，配浅薄荷反光和深墨绿五官；不改全站主色或登录背景。亮色配方完全保留。视觉参数先登记 `src/design/DEFINITION.md`，再投影至 token。

## 验证计划

- 同构图暗色前后对照、真实登录明暗切换、窄屏和静态降级。
- 重新导出暗色五状态海报，保持透明通道；亮色海报不变。
- 自动化读取真实 token，验证明暗独立、暗色身体/脸部对比与全量热切换；执行 `pnpm check`。
- 本次不改几何或渲染负载，不重写上一轮性能数据；`revision-02-performance-60s.json` 仅为上一轮同引擎/同负载的记录。

## 实测结果

- `revision-03-dark-comparison.png`：旧冷灰青 → 新冰翡翠绿，五官与内部明度的区分增强，浅薄荷底缘保留；轮廓、五官位置、透明材质参数、背景未改。图为两张真实 1280×720 截图的角色区域并排：旧图右侧 x=640/y=0，新图右侧 x=640/y=114，各取 640×512，以抵消滚动位置差异；未改色、未缩放。初版候选内部仍偏灰，因此只进一步提高暗色散射 token 的绿色明度。
- 生产构建 `revision-03-login-dark.png`、`revision-03-login-light.png`：1280×720；暗色初始进入和 light → dark 热切均自动应用新配方，light body/glow 保持原值。UI 文案、字体、布局及登录逻辑未改。
- `revision-03-mobile-dark.png`：390×844，document width/scrollWidth 均 390，一个 256×256 角色画布，无横向溢出。验证后已撤销临时视口覆盖。
- `revision-03-static-dark.png`：真实 PixelOrb 组件关闭 DOM 动画后零 Canvas，大小两处展示新暗色海报；重新开启恢复一个实时画布。暗色五张 PNG 均为 1280×1280 RGBA，来自同源渲染；`revision-03-dark-posters.png` 是 idle/waiting/success/error/sleeping 的检查缩略图，不是运行时雪碧图。
- `pnpm check` 通过：39 文件 / 288 测试，格式、lint、类型与生产构建通过。真实 token 测试验证明暗配方及颜色明度关系；阈值仅为 token 级回归，不声称透明渲染具有同等 WCAG 比值。原有 8 个 lint warning / 大 chunk 提醒未扩大。
- 生产登录浏览器 console error 为空。没有提交真实登录，没有后端变更或 Maven 验证；本轮未重新执行 60 秒性能采样。

状态：实现级复检完成后，用户于 2026-09-08 明确“第一版验收提交”，接受包含本次新配色的第一版并授权本地提交；不推送。最终验收与提交门禁记录见 `acceptance.md`。
