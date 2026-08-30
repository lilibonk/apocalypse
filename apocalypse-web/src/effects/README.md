# effects —— 品牌动效层

规格事实来源：`docs/pixel-wave-spec.md`（当前 §28 v2.16）；设计定义：`src/design/DEFINITION.md`。本目录落地双轨像素语言：焦点层 PixelOrb + 氛围层 PixelWave，共享锐利像素语言。

## PixelOrb（焦点层，全局唯一吉祥物）

Mint Bonk 直接使用批准设计稿的透明状态母版 `public/brand/mint-bonk-design-sprites-v1.png`：长软左触角、短圆右触角、梨豆形薄荷身体、深青像素描边、白色腹斑、腮红和短手脚。母版为 1536×1024 的 3×2 网格，每格 512×512；组件只按状态裁切，不用 Canvas、SVG、CSS 或代码栅格重画角色。

### 状态词汇表（固定，全站共用）

| 状态       | 视觉                            | 典型场景             |
| ---------- | ------------------------------- | -------------------- |
| `idle`     | 上排左：默认站立稿 + 轻呼吸位移 | 默认态、登录值守向导 |
| `waiting`  | 上排中：思考等待稿 + 三阶踮脚   | 提交中、加载         |
| `success`  | 上排右：成功稿 + 短跳           | 操作成功             |
| `error`    | 下排左：错误稿 + 两次整像素微震 | 操作失败             |
| `sleeping` | 下排中：闭眼休眠稿 + 慢呼吸     | 空状态、密码回避     |

`thinking`：2 期 Agent 界面化身预留，**当前不实现**。

### 尺寸阶梯（合法 size：256 / 128 / 64 / 32，非法值开发环境 throw）

| 尺寸 | 渲染策略                 | 场景                   |
| ---- | ------------------------ | ---------------------- |
| 256  | 512 源帧裁切后显示为 256 | 登录桌面主视觉         |
| 128  | 512 源帧裁切后显示为 128 | 登录移动主视觉、空状态 |
| 64   | 512 源帧裁切后显示为 64  | 紧凑空态               |
| 32   | 512 源帧裁切后显示为 32  | 消息/Toast 等反馈图标  |

### 素材兼容边界

- 正式角色固定使用批准稿的薄荷色，不提供吉祥物换肤入口。
- `skin`、`skins/` 与 `mascotSkin` store 字段只为旧调用兼容；PixelOrb 不消费它们绘制角色。`gaze` 在 idle 时移动从同一批准稿裁出的两枚眼部高光，并以同图黑色眼内裁片覆盖静态高光。
- 右下背面设定稿仅用于设计参考，不映射任何运行状态。

## PixelWave（氛围层，唯一背景语言）

连续浪潮·铅字浮雕（v2.11，spec §23）：**基态 = 干净白/黑背景**。默认 `flowlight` 保留原稀疏方形环与约 10fps 步进；登录专用 `letterpress` 使用 32px 固定完整网格，从随机角点发射欧氏波前，以 0.09s 快速抬升和 0.38s 指数长尾形成大面积不同高度柱体。每波由 `sessionSeed + waveIndex` 换新距离轮廓、点火、高度和空间连续色带。顶面严格为 `--background`（白底白块 / 黑底黑块），灰阶侧壁和剪影彩色流光只表达高度。letterpress 按 rAF 连续更新，不再经过 10fps 时间量化。

CRUD 不再属于 PixelWave。Dialog / AlertDialog / Sheet 统一使用 `components/motion/PixelDialogMotion.tsx` 直接揭示真实内容，不创建 Canvas、rAF 或独立装饰 DOM。

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
- 引擎分域：能 CSS 不 JS，能 motion 不 GSAP/WebGL；PixelOrb 是 CSS 图片裁切，PixelWave 是 Canvas 2D，不引入新引擎。

## 目录结构

```
effects/
├── PixelOrb/         # 焦点层：批准的 3×2 Mint Bonk 状态母版
│   ├── skins/        # 历史调色板，只保留旧 API 兼容
│   ├── sprites.ts    # 素材路径、网格与五状态坐标
│   ├── PixelOrb.tsx  # React 图片裁切 + CSS 状态动效
│   └── index.ts      # barrel 导出
├── PixelWave/        # 氛围层：flowlight / letterpress 两个受控形态
│   ├── wave.ts       # flowlight / letterpress 场计算、缓存与程序化 hue
│   ├── render.ts     # 像素块与铅字 Canvas 材质渲染
│   ├── PixelWave.tsx # React 封装 + 两形态时钟 / 降级（恒 pointer-events-none）
│   └── index.ts
├── PixelBean/        # 【已弃用】历史兼容
├── registry/         # copy-paste 动效组件（RetroGrid 已冻结）
└── README.md
```

## 挂载点

- 登录页：`views/login/index.tsx`——品牌舞台 / 移动品牌头挂载 letterpress PixelWave（同底色块面、每波独立噪声），表单区隔离；单一 256px Mint Bonk 批准状态帧，idle 原稿高光视线跟随 + 32px 正式品牌标记与编辑式品牌排版。
- 侧栏 logo：`components/layout/AppLayout.tsx` 使用独立静态 `BrandSignature`；PixelOrb 不承担 favicon、侧栏标志或正式签名职责。
- 路由加载：`components/PageLoading.tsx`——PixelScale 16 柱页面音阶；登录提交使用 6 柱 inline 音阶。
- 空状态（DynaTable）只使用 sleeping PixelOrb + 简短提示，不挂 PixelWave。
