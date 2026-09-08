# effects —— 品牌动效层

当前事实来源：`docs/brand-slime/solution-fit.md` 与 `src/design/DEFINITION.md` 的 LIL-85 章节。

## 当前品牌（LIL-85，2026-09-08）

`PixelOrb` 是兼容入口，实际委托 `webgpu/slime/Slime.tsx`。角色为圆润、青绿半透明、带气泡的软体史莱姆；两眼一嘴与身体共用同一局部形变。384/256px 的可见舞台按需加载 Three.js WebGPU，128/64/32px 与动效关闭使用 `public/brand/slime/{state}.png` / `dark-{state}.png`。明暗各五张静态图由同一个真实模型导出。

- 状态：idle 放松、waiting 小 O 嘴、success 微眯眼大笑、error 担心、sleeping 闭眼；密码聚焦继续闭眼回避。
- Three.js 0.185.1，仅公共 `three/webgpu` / `three/tsl`。显式 `Renderer + WebGPUBackend + StandardNodeLibrary`，`getFallback: null`；无 WebGL 回退。所有颜色读取 `tokens.css` 的 `--slime-*`。
- 物理为有界的固定步长弹簧/局部压力场近似，不宣称完整体积有限元模拟；拎起限位、重力、落地挤压、阻尼复原；五官不是 DOM 贴片。
- 仅可见大尺寸且动效双开关允许时申请 GPU；离屏卸载设备，后台暂停；卸载、初始化失败、设备丢失释放资源。无 API/失败/丢失显示新角色静态图及明确提示。
- 登录不挂载 PixelWave；letterpress 浪潮只在开发态“外观实验室 → 动效实验室”通过默认关闭的 pixelWaveEnabled 开关预览。关闭、收起或离开设置即卸载，生产恒关闭。静态 BrandSignature、favicon、PixelScale 进度、PixelDialogMotion 与表单/认证原逻辑保留。
- `gaze` 在 idle 时让眼睛沿皮肤平滑、有限地跟随鼠标；56 枚细小非金属透明气泡分布在体内，缓慢上浮、小幅横漂，在不可见区淡出重生，不做三轴往返。均遵守暂停/静态模式。`skin` 与历史皮肤导出仅兼容，不改变新角色。
- 明暗独立材质/灯光 token、静态海报自动切换；主题更新释放并重建环境贴图。pointer 聚焦无外框，键盘 focus-visible 保留。
- 验收命令、截图、录屏与实机测量见 `docs/brand-slime/acceptance.md`；独立验收文档不会进入正常业务构建。

## 历史规格（LIL-85 前，仅供回滚参考）

以下 Mint Bonk 描述仅供历史参考；PixelWave letterpress 算法与 PixelScale 仍沿用，暂停治理以当前代码为准。

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
