# effects —— 品牌动效层

规格事实来源：`docs/pixel-wave-spec.md`（当前 §24 v2.12）；设计定义：`src/design/DEFINITION.md`。本目录落地双轨像素语言：焦点层 PixelOrb + 氛围层 PixelWave，共享锐利像素语言。

## PixelOrb（焦点层，全局唯一吉祥物）

高密度像素蝾螈：六枚珊瑚色外鳃、薄荷色身体、双爪压住深青桌沿、右侧卷尾与奶油圆形背板。1254px 图生母版预缩放到各尺寸的 2× 离屏 Canvas；运行时只重绘两枚像素瞳孔，因此 gaze 连续但身体轮廓不跳帧。闭眼使用独立 blink 母版，静态降级使用居中视线 master 母版。

### 状态词汇表（固定，全站共用）

| 状态       | 视觉                                 | 典型场景                  |
| ---------- | ------------------------------------ | ------------------------- |
| `idle`     | 呼吸浮动 + 偶尔眨眼                  | 默认态、侧栏 logo         |
| `waiting`  | 双瞳小幅扫描（loading 语义并入此态） | 提交中、加载、PageLoading |
| `success`  | 双瞳上看 + 弹跳一次                  | 操作成功                  |
| `error`    | 双瞳下沉 + 微震                      | 操作失败                  |
| `sleeping` | 闭眼母版 + 轻微下沉呼吸              | 空状态                    |

`thinking`：2 期 Agent 界面化身预留，**当前不实现**。

### 尺寸阶梯（合法 size：256 / 128 / 64 / 32，非法值开发环境 throw）

| 尺寸 | 渲染策略                  | 场景                                   |
| ---- | ------------------------- | -------------------------------------- |
| 256  | 512 内部 Canvas，完整细节 | 登录桌面主视觉                         |
| 128  | 256 内部 Canvas，状态保留 | 登录移动主视觉、空状态                 |
| 64   | 128 内部 Canvas           | 侧栏展开 logo、登录 logo、设置面板预览 |
| 32   | 64 内部 Canvas            | 侧栏折叠 rail logo、消息/Toast 图标    |

### 皮肤机制

- 皮肤 = 调色板数据（`PixelOrb/skins/v4.ts` 长春花蓝 / `v3.ts` 薄荷青），渲染器两肤共享。
- 默认 v3（↔ accent `mint`；v4 ↔ `periwinkle`）。切换入口：设置面板「吉祥物」（`mascotSkin`，persist）。
- 皮肤调色板影响动态瞳孔与品牌 accent；已确认的身体母版配色保持固定。

## PixelWave（氛围层，唯一背景语言）

连续浪潮·铅字浮雕（v2.11，spec §23）：**基态 = 干净白/黑背景**。默认 `flowlight` 保留原稀疏方形环与约 10fps 步进；登录专用 `letterpress` 使用 32px 固定完整网格，从随机角点发射欧氏波前，以 0.09s 快速抬升和 0.38s 指数长尾形成大面积不同高度柱体。每波由 `sessionSeed + waveIndex` 换新距离轮廓、点火、高度和空间连续色带。顶面严格为 `--background`（白底白块 / 黑底黑块），灰阶侧壁和剪影彩色流光只表达高度。letterpress 按 rAF 连续更新，不再经过 10fps 时间量化。

五彩（宪法 §5 程序化 oklch 豁免，禁 hex 字面量 / 色板文件）：

- hue = `--brand` 解析基准 hue（回退 280）+ hueSeed × 120° 色带 + 时间慢漂（±10° 正弦）；量化 24 道分桶渲染，fillStyle 每道每帧至多设一次。
- 明度/彩度明暗两档（亮 0.72/0.19、暗 0.6/0.16 防刺眼）；canvas fillStyle 直接吃 oklch 字符串，`CSS.supports` 失败时整组回退 `--brand`（五彩退化为单色块）。

沿袭 v2.1 的行为：

- **填充模式**：`cols`/`rows` 缺省时按容器尺寸 ÷ 8px 周期 **ceil** 推导铺满（`deriveGridCount`，ResizeObserver 重推导）；显式传值维持网格画布内居中（PageLoading 条带不受影响）。
- 性能：flowlight 的每格传导参数由 `createTypeCache` 预计算，场计算仅在步进边界执行；letterpress 的到达时刻 / 空间色相相位由 `createLetterpressCache` 预计算，活跃窗外在进入指数计算前短路。两者都复用场/道/高度缓冲、逐帧零分配；letterpress Canvas DPR 封顶 2。

**v2.3 移除交互**：删除鼠标涟漪 / 点击脉冲 / `interactive` prop 与全部 pointer/window 监听，组件恒 pointer-events-none。

降级（v2.2 起不变）：双开关（`prefers-reduced-motion` / 设置「动画」关闭）→ **零渲染纯背景**（清空画布，不起 rAF、不设观察者）；P10 持续低帧 → 清空画布定格纯背景 + console.info 一次。

### PixelScale（一维操作反馈形态）

`PixelScale` 位于 PixelWave 同目录并从同一 barrel 导出，不是第三套品牌视觉。它用 CSS
`steps()` 把 PixelWave 的格点传播压成 6/12/16 根离散像素柱，分别服务按钮、局部和页面
加载。只动画 transform / opacity；动效关闭或系统请求 reduced-motion 时停驻为静态音阶。
开发环境可在“界面设置 → 外观实验室”持续预览 card 规格，正式设置不暴露该演示项。

## 已弃用（历史兼容，禁止新代码引用）

- `PixelBean/`（肾形豆 + PixelTide）：被 PixelOrb + PixelWave 取代，目录仅保留供下游参考。
- `registry/RetroGrid/`：被 PixelWave 取代，冻结。

## registry/（copy-paste 动效组件）

react-bits / Magic UI / 8bitcn 等来源的改造组件（BlurText、SpotlightCard、PixelBubble 等），文件头标注来源与许可证；引擎只许 CSS/motion（AGENTS.md §5 分域）。

## 治理约束（与 AGENTS.md §5 一致）

- 所有动效必须同时尊重 `stores/settings.ts` 的 `motionEnabled` 与 `prefers-reduced-motion`；降级形态 = 静态帧（PixelOrb 仍有体积感）/ 零渲染纯背景（PixelWave，v2.2 起）。
- 颜色字面量只允许出现在 `effects/*/skins/*.ts`；光效走 `--brand`；PixelWave 的 flowlight / letterpress 剪影流光走程序化 oklch（宪法 §5 豁免，禁 hex 字面量 / 色板文件）；letterpress 顶面与侧壁只能取 `--background` / `--border` / 低透明 `--foreground`。
- 引擎分域：能 CSS 不 JS，能 motion 不 GSAP/WebGL；PixelOrb/PixelWave 为纯 Canvas 2D，不引入新引擎。

## 目录结构

```
effects/
├── PixelOrb/         # 焦点层：高密度像素蝾螈
│   ├── skins/        # 皮肤调色板（v4/v3）+ 注册表
│   ├── draw.ts       # 历史纯函数与 palette 解析
│   ├── eyes.ts       # 眨眼计时与历史纯函数兼容
│   ├── gaze.ts       # 视线跟随
│   ├── PixelOrb.tsx  # React 封装 + rAF 循环 + 状态机
│   └── index.ts      # barrel 导出
├── PixelWave/        # 氛围层：活字印刷像素块（v2.3）
│   ├── wave.ts       # 作息表/密度偏置/五彩 hue 纯函数 + 场计算 + 填充推导（v2.3 重做）
│   ├── render.ts     # Canvas 渲染（hue 道分桶 + 程序化 oklch 道色，alpha 恒 1 实心块，v2.3）
│   ├── PixelWave.tsx # React 封装 + letterpress 连续帧 / flowlight 10fps（恒 pointer-events-none）
│   └── index.ts
├── PixelBean/        # 【已弃用】历史兼容
├── registry/         # copy-paste 动效组件（RetroGrid 已冻结）
└── README.md
```

## 挂载点

- 登录页：`views/login/index.tsx`——品牌舞台 / 移动品牌头挂载 letterpress PixelWave（同底色块面、每波独立噪声），表单区隔离；单一 256px 像素蝾螈主视觉（实时视线 + 随机眨眼）+ 32px 正式品牌标记与编辑式品牌排版。
- 侧栏 logo：`components/layout/AppLayout.tsx` 使用独立静态 `BrandSignature`；PixelOrb 不承担 favicon、侧栏标志或正式签名职责。
- 路由加载：`components/PageLoading.tsx`——PixelScale 16 柱页面音阶；登录提交使用 6 柱 inline 音阶。
- 空状态（DynaTable）只使用 sleeping PixelOrb + 简短提示，不挂 PixelWave。
