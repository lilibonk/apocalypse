# 方案文档：PixelWave + PixelOrb 品牌动效系统

> 当前版本：v2.15
> 日期：2026-08-30
> 适用范围：Apocalypse Web 品牌表面（登录舞台、Loading、空状态、进度）  
> 目标：
>
> 1. 以 PixelWave 抽象像素网格流体替换 RetroGrid/CSS 网格背景
> 2. 以 PixelOrb 像素化球体吉祥物替换 PixelBean 肾形豆，解决像素设计质量问题

---

## 1. 设计诊断与转向

### 1.1 当前问题

| 元素                      | 问题                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **PixelBean（肾形豆）**   | 形态为不对称肾形，五官（豆豆眼+小嘴）卡通感过重，像素边缘生硬，整体气质偏「可爱」而非「科技」 |
| **RetroGrid 背景**        | 纯 CSS 合成波网格，无品牌像素语言，与吉祥物割裂                                               |
| **PixelTide（一维水面）** | 仅用于 Loading，效果单调，一维高度场缺乏视觉张力                                              |
| **整体**                  | 具象吉祥物 + 抽象背景 = 两套语言打架，没有统一的像素视觉体系                                  |

### 1.2 新方向：双轨像素语言

| 层级       | 元素      | 作用                              | 气质                 |
| ---------- | --------- | --------------------------------- | -------------------- |
| **氛围层** | PixelWave | 抽象像素棋盘格流体，作为背景/环境 | 克制、流动、数字感   |
| **焦点层** | PixelOrb  | 像素化球体吉祥物，作为品牌识别    | 精确、现代、有生命力 |

**核心主张**：氛围层用抽象流体营造空间感，焦点层用精致像素球体建立品牌记忆。两者共享同一套 4px 像素网格语言。

---

## 2. PixelOrb：像素化球体品牌形象

### 2.1 设计方向

参考 Kimi Bot（蓝色圆球+简洁双眼）、Grok（橙色圆球）的**球体品牌范式**，但用**像素化语言重新演绎**。

**为什么球体？**

- 球体是自然界最完美的几何形态，象征完整、统一、科技
- 球体的体积感（高光、阴影、反射）天然适合像素化渲染（每个像素格可以表达不同的明暗层次）
- 球体对称、稳定，不挑角度，不像肾形豆有「正面/侧面」问题

**像素设计质量改进（针对 PixelBean 的问题）：**

| PixelBean 的问题             | PixelOrb 的解决                                          |
| ---------------------------- | -------------------------------------------------------- |
| 肾形不对称，像素边缘参差不齐 | 正圆 SDF，边缘像素按距离梯度排列，规整锐利               |
| 豆豆眼+小嘴，卡通感过重      | 极简几何眼：两个等距圆点，无嘴或仅在特定状态显示极简横线 |
| 身体颜色平涂，无体积感       | 球体表面有法线渐变：高光区 → 中间调 → 暗部 → 边缘反光    |
| 星核装饰（琥珀四角星）突兀   | 替换为球体表面的「光斑」或「能量核」，与球体融为一体     |
| 皮肤只换颜色，形状不变       | 球体为通用形态，皮肤通过颜色+表面纹理变化表达            |

### 2.2 视觉规格

#### 基础形态

- **形状**：正圆形，直径 = 128 栅格（内部栅格保持 128×128）
- **表面**：像素化球体渲染，有法线渐变（类似 3D 渲染中的 diffuse + specular）
- **眼睛**：两个等距圆点，位于球体横轴上方约 1/3 处，眼距 = 球径 × 0.35
- **高光**：球体左上方（假设光源左上）有像素化高光区，呈椭圆或弧形
- **边缘反光**：球体底部/右侧有 subtle 的反光带，增加体积感

#### 眼睛设计（关键改进）

眼睛是品牌识别度的核心，必须设计得**简洁、现代、有灵动感**：

```
像素化眼睛（8×6 栅格示例，实际按 128 栅格缩放）：

  ........
  ..##....  ← 上眼睑/眉弓阴影
  .####...
  .####...  ← 眼球主体
  ..##....
  ........

眼球内瞳孔：
  ...
  .#.
  ...  ← 极简圆点瞳孔

高光点（使眼睛有神）：
  .#.
  ...  ← 1~2 个像素的高光偏移
```

**关键规则**：

- 眼睛始终为深色（`#101218` 或更深的 `#0a0a0f`），与球体颜色形成高对比
- 眼球内部有 1~2 个像素的高光点（白色），位置随视线方向偏移
- 无眼白概念：深色眼球直接嵌入球体表面，像两个深邃的观测窗
- 眨眼：上眼睑（像素线）向下扫过，1~2 帧完成，不拖泥带水

#### 球体表面渲染（像素化体积感）

使用**像素化球体 SDF + 法线近似**：

```typescript
// 对每个像素格，计算其在球体表面的位置
// 然后用法线方向估算光照强度

function sphereShade(x: number, y: number, radius: number): number {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)

  // 球体表面法线（简化）
  const nx = dx / radius // [-1, 1]
  const ny = dy / radius // [-1, 1]
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))

  // 光源方向：左上 (Lx=-0.5, Ly=-0.5, Lz=0.7)
  const lx = -0.5,
    ly = -0.5,
    lz = 0.707

  // Diffuse
  let shade = nx * lx + ny * ly + nz * lz

  // Specular highlight（高光区）
  const hx = (nx + lx) / 2,
    hy = (ny + ly) / 2,
    hz = (nz + lz) / 2
  const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz)
  const spec = Math.pow(Math.max(0, (nz * hz) / hLen), 16)

  // Rim light（边缘反光）
  const rim = Math.pow(1 - nz, 3) * 0.3

  return clamp(shade * 0.7 + spec * 0.4 + rim, 0, 1)
}
```

**像素化后处理**：

- 亮度值不直接映射到颜色，而是**量化到有限的色阶**（如 4~5 级），形成像素画的色带感
- 色阶从 skin palette 选取：
  - 高光 → `eyeHi`（白色/高光色）
  - 亮部 → `fill`（品牌主色高亮版）
  - 中间调 → `fill`（品牌主色）
  - 暗部 → `shade`（品牌暗色）
  - 边缘/轮廓 → `outline`

#### 尺寸阶梯

保留 DEFINITION 的 64 倍数规则，但 PixelOrb 的**合法尺寸更灵活**：

| 场景            | 尺寸  | 栅格倍数 | 眼睛可读性             |
| --------------- | ----- | -------- | ---------------------- |
| 登录桌面主视觉  | 256px | 2×       | 完整双眼+高光+表情     |
| 登录移动主视觉  | 128px | 1×       | 双眼+高光，表情简化    |
| 侧栏/导航 logo  | 64px  | 0.5×     | 双眼可见，无表情细节   |
| 空状态          | 128px | 1×       | 同登录移动             |
| 设置面板预览    | 64px  | 0.5×     | 同侧栏                 |
| 消息/Toast 图标 | 32px  | 0.25×    | 极简圆点（无眼白区分） |

> 注意：32px 以下为「图标态」，不再渲染完整眼睛，而是简化为一两个像素点的「表情符号」。

### 2.3 状态与表情

状态词表精简为：

| 状态       | 视觉表现                                             | 使用场景      |
| ---------- | ---------------------------------------------------- | ------------- |
| `idle`     | 球体轻微上下浮动（呼吸），眼睛平视，偶尔眨眼         | 默认态        |
| `waiting`  | 球体保持静止，眼睛变为「加载」形态（旋转点/闪烁）    | 提交中        |
| `success`  | 球体轻微弹跳一次，眼睛弯成弧线（笑眼），可选配极简嘴 | 操作成功      |
| `error`    | 球体微震，眼睛变为「X」形或震动状态                  | 操作失败      |
| `sleeping` | 眼睛闭合为横线，球体下沉，呼吸变慢                   | 无操作/空状态 |

**弃用状态**：`thinking`（P2 预留，暂不实现）、`loading`（合并入 `waiting`）

### 2.4 视线跟随（Gaze）

保留并优化现有 gaze 逻辑：

- 眼睛（瞳孔+高光）整体偏移，跟随鼠标位置
- 偏移范围：球径 × 0.12（比 PixelBean 更克制，避免「斗鸡眼」）
- 高光点与瞳孔同向偏移，但幅度略小，模拟真实眼球反光
- 到达边界时，眼球不再移动，转为**头部微转**（整个球体轻微倾斜 2~3°）
- 鼠标移出窗口：眼球缓慢回归中心（弹簧阻尼，0.5s 衰减）

### 2.5 像素设计质量检查清单

PixelOrb 实现完成后，必须满足以下检查项：

- [ ] 球体边缘像素排列整齐，无「锯齿毛刺」（SDF 距离梯度排列）
- [ ] 球体表面有 ≥3 个明度色阶，呈现体积感
- [ ] 眼睛为对称几何形，瞳孔居中，高光点位置正确
- [ ] 视线偏移时，瞳孔和高光同向移动，高光幅度略小
- [ ] 眨眼动画 ≤3 帧，上眼睑为像素线扫过，不拖泥带水
- [ ] 各尺寸下眼睛可读：256px 完整 / 128px 清晰 / 64px 可辨 / 32px 可识别
- [ ] 暗色模式下球体暗部不过黑，高光不过曝
- [ ] 静态帧（motion=off）仍有体积感，不塌陷为平面圆

---

## 3. PixelWave：像素网格流体氛围层

（氛围层设计不变，见下文 §5 技术规格）

---

## 4. 场景应用

### 4.1 登录舞台（核心场景）

```
┌─────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← PixelWave 背景层（z-0）
│  ░░░  ┌─────────────────────┐  ░░░░░  │
│  ░░░  │                     │  ░░░░░  │
│  ░░░  │    ◉      ◉         │  ░░░░░  │  ← PixelOrb 焦点层（z-10）
│  ░░░  │        ●            │  ░░░░░  │     256px 球体，视线跟随
│  ░░░  │                     │  ░░░░░  │
│  ░░░  └─────────────────────┘  ░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│        Apocalypse    CONSOLE            │  ← 左上角品牌头（z-20）
│        模块化单体脚手架，像素驱动         │  ← 底部 tagline
└─────────────────────────────────────────┘
```

**层级关系**：

1. `z-0`：PixelWave 背景（半透明，低亮度棋盘格波动）
2. `z-10`：PixelOrb 256px 球体（居中，视线跟随鼠标）
3. `z-20`：品牌文字/表单（上方和右侧）

**交互联动**：

- 鼠标移动 → PixelOrb 视线跟随 + PixelWave 产生涟漪
- 点击登录 → PixelOrb 进入 `waiting` 态 + PixelWave 产生脉冲
- 登录成功 → PixelOrb 进入 `success` 态（弹跳+笑眼）+ 页面过渡

### 4.2 PageLoading

- 移除 PixelTide
- 中央显示 PixelOrb 64px（`waiting` 态，眼睛为旋转加载点）+ 下方文字
- 或：PixelWave 横向涌动条带（32×4 网格，2 周期/秒）

### 4.3 空状态

- PixelOrb 128px（`sleeping` 态，闭眼，呼吸极慢）
- 背景有极慢的 PixelWave 波动（0.2 周期/秒）

### 4.4 不确定进度条

- PixelWave 横向条带（4px 高，单像素行）

### 4.5 侧栏/导航 Logo

- 移除 64px PixelBean
- 替换为 64px PixelOrb（`idle` 态，静态或极慢呼吸）
- 或：纯文字/图标版本（见 §6 品牌识别）

---

## 5. PixelWave 技术规格

### 5.1 视觉规格

#### 基本单元

| 参数       | 值        | 说明                                |
| ---------- | --------- | ----------------------------------- |
| 像素块大小 | 4px × 4px | 与 DEFINITION §1 基础格子对齐       |
| 网格间距   | 4px       | 块与块之间留 4px 空隙，形成棋盘格感 |
| 实际占用   | 8px 周期  | 4px 块 + 4px 间隙                   |

#### 波动行为

- **基态**：棋盘格网格以极低亮度显示（`outline` 色的 15% 透明度）
- **波动模式**：正弦波从中心产生，向外扩散；波峰处像素块亮度提升至 100%
- **多重波叠加**：3~4 层不同频率、方向、速度的正弦波叠加
- **有机抖动**：每个像素块有微小的独立相位偏移（±0.1 rad）

#### 颜色规则

- 像素块颜色走 `--brand` 明度阶梯：
  - 波峰：`--brand` 100%
  - 波中：`--brand` 60%
  - 波谷：`--brand` 20%
  - 基态：`--outline` 15%

### 5.2 交互规格

- **鼠标涟漪**：光标位置产生圆形涟漪，120px/s 扩散，振幅随距离衰减
- **点击脉冲**：点击时高强度脉冲（振幅 × 2），迅速衰减

### 5.3 核心算法

```typescript
// 波动场计算
function computeWave(gridW: number, gridH: number, time: number, ripples: Ripple[]): Float32Array {
  const field = new Float32Array(gridW * gridH)
  const cx = gridW / 2
  const cy = gridH / 2

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      let value = 0

      // 基波：多层正弦叠加
      value += Math.sin(x * 0.3 + time * 1.2) * 0.25
      value += Math.sin(y * 0.4 - time * 0.9) * 0.2
      value += Math.sin((x + y) * 0.15 + time * 0.6) * 0.3
      value += Math.sin(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) * 0.2 - time * 1.5) * 0.35

      // 有机抖动
      const jitter = Math.sin(x * 7.3 + y * 13.7) * 0.08
      value += jitter

      // 鼠标涟漪
      for (const r of ripples) {
        const dist = Math.sqrt((x - r.x) ** 2 + (y - r.y) ** 2)
        const ripplePhase = dist * 0.4 - r.time * 3.0
        const attenuation = Math.max(0, 1 - dist / r.radius)
        value += Math.sin(ripplePhase) * r.amplitude * attenuation ** 2
      }

      field[y * gridW + x] = clamp(value * 0.5 + 0.5, 0, 1) ** 1.5
    }
  }

  return field
}
```

### 5.4 渲染

```typescript
function renderPixelWave(
  ctx: CanvasRenderingContext2D,
  field: Float32Array,
  gridW: number,
  gridH: number,
  blockSize: number,
  gap: number,
  brandColor: string,
) {
  const step = blockSize + gap
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const brightness = field[y * gridW + x]
      if (brightness < 0.08) continue
      ctx.globalAlpha = brightness
      ctx.fillStyle = brandColor
      ctx.fillRect(x * step, y * step, blockSize, blockSize)
    }
  }
  ctx.globalAlpha = 1.0
}
```

---

## 6. 品牌识别体系（去豆化后）

去除 PixelBean 后，品牌识别由以下元素共同构建：

### 6.1 第一识别：PixelOrb 球体

- 所有出现吉祥物的场景统一为 PixelOrb
- 球体为通用形态，皮肤通过颜色+表面纹理变化表达
- 不同尺寸有不同的渲染策略（256px 完整体积 / 64px 简化 / 32px 图标）

### 6.2 第二识别：PixelWave 像素语言

- 所有品牌表面的背景/氛围层统一为 PixelWave
- 棋盘格波动成为 Apocalypse 的「数字水面」品牌记忆

### 6.3 第三识别：品牌文字

- 「Apocalypse」文字标识
- 「CONSOLE」等宽副标
- 底部技术栈 meta 行（`SPRING BOOT 4 · REACT 19 · MODULITH`）

### 6.4 第四识别：颜色系统

- v4 长春花蓝 / v3 mint 通过 `--brand` 统一表达
- PixelOrb 球体 + PixelWave 像素块 + UI 按钮共用同一套品牌色

---

## 7. 组件接口设计

### 7.1 PixelOrb

```typescript
interface PixelOrbProps {
  /** 状态 */
  state?: 'idle' | 'waiting' | 'success' | 'error' | 'sleeping'
  /** 皮肤 */
  skin?: 'v4' | 'v3'
  /** CSS 尺寸（px），必须是 64 的倍数 */
  size?: number
  /** 是否启用视线跟随 */
  gaze?: boolean
  className?: string
}

// 登录桌面主视觉
<PixelOrb state="idle" size={256} gaze />

// 侧栏 logo
<PixelOrb state="idle" size={64} />

// 空状态
<PixelOrb state="sleeping" size={128} />
```

### 7.2 PixelWave

```typescript
interface PixelWaveProps {
  cols?: number
  rows?: number
  blockSize?: number
  gap?: number
  waveSpeed?: number
  interactive?: boolean
  className?: string
}

// 登录舞台背景
<PixelWave cols={52} rows={40} waveSpeed={0.8} interactive />

// Loading 条带
<PixelWave cols={32} rows={4} waveSpeed={2} interactive={false} />
```

### 7.3 文件结构

```
src/effects/
  ├── PixelWave/
  │   ├── PixelWave.tsx
  │   ├── wave.ts
  │   ├── render.ts
  │   └── index.ts
  ├── PixelOrb/
  │   ├── PixelOrb.tsx       # React 组件
  │   ├── draw.ts            # 球体 SDF + 像素化渲染
  │   ├── eyes.ts            # 眼睛渲染（各种状态）
  │   ├── gaze.ts            # 视线跟随逻辑
  │   ├── skins/
  │   │   ├── v4.ts          # 长春花蓝调色板
  │   │   └── v3.ts          # mint 调色板
  │   └── index.ts
  └── PixelBean/             # 保留目录（历史兼容/下游使用）
```

---

## 8. 与现有系统集成

### 8.1 登录页改造

```diff
  // src/views/login/index.tsx
- import { PixelBean, type BeanState } from '@/effects/PixelBean'
- import { RetroGrid } from '@/effects/registry/RetroGrid'
+ import { PixelOrb } from '@/effects/PixelOrb'
+ import { PixelWave } from '@/effects/PixelWave'

  <section className="relative hidden ... lg:flex ...">
-   <RetroGrid />
+   <PixelWave cols={52} rows={40} waveSpeed={0.8} interactive className="absolute inset-0" />

    <div className="relative z-10 flex flex-col items-center gap-8">
-     <PixelBean state={displayState} size={512} gaze />
+     <PixelOrb state={displayState} size={256} gaze />
    </div>
  </section>
```

### 8.2 PageLoading 改造

```diff
  // src/components/PageLoading.tsx
- import { PixelTide } from '@/effects/PixelBean/PixelTide'
+ import { PixelWave } from '@/effects/PixelWave'

  <div className="flex h-64 items-center justify-center bg-background">
-   <PixelTide />
+   <PixelWave cols={32} rows={4} waveSpeed={2} blockSize={4} gap={4} />
  </div>
```

### 8.3 空状态改造

```diff
- <PixelBean state="sleeping" size={128} />
+ <PixelOrb state="sleeping" size={128} />
+ <PixelWave cols={8} rows={8} waveSpeed={0.2} />
```

### 8.4 侧栏/导航 Logo

```diff
- <BrandMascot size={64} />  // 内部是 PixelBean 64px
+ <PixelOrb state="idle" size={64} />
```

---

## 9. PixelOrb 实现关键技术

### 9.1 球体 SDF 像素化

```typescript
// 128×128 栅格内，计算每个像素格到球体表面的距离
// 距离用于：1) 边缘裁剪  2) 法线近似  3) 反锯齿

function spherePixel(
  x: number,
  y: number,
  cx: number,
  cy: number,
  r: number,
): { inside: boolean; dist: number; nx: number; ny: number } {
  const dx = x - cx
  const dy = y - cy
  const d = Math.sqrt(dx * dx + dy * dy)
  const inside = d <= r
  const nx = dx / r
  const ny = dy / r
  return { inside, dist: r - d, nx, ny }
}

// 像素化反锯齿：距离边缘 < 1 格的像素，按距离比例决定是否绘制
// 这能让球体边缘在像素格上更「准」，避免参差不齐
```

### 9.2 体积感色阶量化

```typescript
// 光照强度 → 像素色阶（量化到 5 级）
function quantizeShade(shade: number): PixelKey {
  if (shade > 0.85) return 'highlight' // 高光（极亮）
  if (shade > 0.6) return 'light' // 亮部
  if (shade > 0.35) return 'mid' // 中间调
  if (shade > 0.15) return 'shadow' // 暗部
  return 'outline' // 边缘/轮廓
}

// 每级对应 palette 中的颜色
const SHADE_MAP = {
  highlight: 'coreHi', // 星核高光色复用为球体高光
  light: 'fill',
  mid: 'fill',
  shadow: 'shade',
  outline: 'outline',
}
```

### 9.3 眼睛渲染

```typescript
// 眼睛位置（球体坐标系内）
const eyeY = cy - r * 0.25 // 横轴上方 1/4 处
const eyeSpacing = r * 0.35 // 眼距
const leftEyeX = cx - eyeSpacing / 2
const rightEyeX = cx + eyeSpacing / 2
const eyeRadius = r * 0.12 // 眼球半径

// 渲染眼球（深色圆）
fillCircle(body, leftEyeX, eyeY, eyeRadius, 'outline')
fillCircle(body, rightEyeX, eyeY, eyeRadius, 'outline')

// 瞳孔（随 gaze 偏移）
const pupilOffsetX = gazeX * 0.3
const pupilOffsetY = gazeY * 0.3
fillCircle(body, leftEyeX + pupilOffsetX, eyeY + pupilOffsetY, eyeRadius * 0.4, 'eye')
fillCircle(body, rightEyeX + pupilOffsetX, eyeY + pupilOffsetY, eyeRadius * 0.4, 'eye')

// 高光点（比瞳孔偏移更小，模拟反光）
const hiOffsetX = gazeX * 0.15 - 1
const hiOffsetY = gazeY * 0.15 - 1
setPixel(body, leftEyeX + pupilOffsetX + hiOffsetX, eyeY + pupilOffsetY + hiOffsetY, 'eyeHi')
```

### 9.4 状态表情

```typescript
// waiting：眼睛变为「加载」形态
function drawWaitingEyes(body: PixelGrid, leftX: number, rightX: number, y: number, time: number) {
  // 两个眼睛内的点做圆周运动
  const angle = time * 3
  const r = 2
  const lx = leftX + Math.cos(angle) * r
  const ly = y + Math.sin(angle) * r
  const rx = rightX + Math.cos(angle + Math.PI) * r
  const ry = y + Math.sin(angle + Math.PI) * r
  setPixel(body, Math.round(lx), Math.round(ly), 'eyeHi')
  setPixel(body, Math.round(rx), Math.round(ry), 'eyeHi')
}

// success：笑眼（弯弧线）
function drawHappyEyes(body: PixelGrid, leftX: number, rightX: number, y: number) {
  // 上眼睑呈弧线形
  stamp(body, leftX - 3, y - 2, ['.###.', '#...#'], { '#': 'outline' })
  stamp(body, rightX - 3, y - 2, ['.###.', '#...#'], { '#': 'outline' })
}

// error：X 眼
function drawErrorEyes(body: PixelGrid, leftX: number, rightX: number, y: number) {
  stamp(body, leftX - 2, y - 2, ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': 'eye' })
  stamp(body, rightX - 2, y - 2, ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], { '#': 'eye' })
}

// sleeping：闭眼（横线）
function drawSleepingEyes(body: PixelGrid, leftX: number, rightX: number, y: number) {
  for (let i = -3; i <= 3; i++) {
    setPixel(body, leftX + i, y, 'outline')
    setPixel(body, rightX + i, y, 'outline')
  }
}
```

---

## 10. 性能预算

| 组件      | 指标     | 目标                     |
| --------- | -------- | ------------------------ |
| PixelWave | CPU      | < 5%（52×40 格子）       |
| PixelWave | 帧率     | 60fps                    |
| PixelOrb  | CPU      | < 3%（128×128 SDF 每帧） |
| PixelOrb  | 帧率     | 60fps                    |
| 合计      | 首次渲染 | < 16ms                   |

---

## 11. 验收标准

### PixelWave

- [ ] 登录舞台背景有 52×40 棋盘格像素波缓慢起伏
- [ ] 鼠标移入产生涟漪，与基波干涉
- [ ] 鼠标静止 2s 涟漪消散
- [ ] 点击产生脉冲
- [ ] 暗色/亮色模式自适应
- [ ] `prefers-reduced-motion` 和 `data-motion=off` 降级为静态棋盘格

### PixelOrb

- [ ] 球体为正圆形，边缘像素排列整齐
- [ ] 表面有 ≥3 个明度色阶，呈现体积感
- [ ] 眼睛为对称几何形，瞳孔+高光位置正确
- [ ] 视线跟随鼠标，瞳孔与高光同向偏移（高光幅度更小）
- [ ] 眨眼动画 ≤3 帧
- [ ] 各尺寸可读：256px 完整 / 128px 清晰 / 64px 可辨 / 32px 可识别
- [ ] 状态切换流畅：idle → waiting → success/error
- [ ] 静态帧（motion=off）仍有体积感
- [ ] 切皮肤 v4 → 球体为长春花蓝；切 v3 → 球体为 mint

### 集成

- [ ] 登录页不再显示 PixelBean 或 RetroGrid
- [ ] PageLoading 不再显示 PixelTide
- [ ] 侧栏 logo 已替换为 PixelOrb
- [ ] 空状态已替换为 PixelOrb（sleeping）

---

## 12. 实现批次

| 批次 | 内容                                                           | 优先级 | 依赖   |
| ---- | -------------------------------------------------------------- | ------ | ------ |
| P1   | PixelOrb `draw.ts`：球体 SDF + 体积感色阶 + 眼睛渲染           | P0     | 无     |
| P2   | PixelOrb `PixelOrb.tsx`：React 封装 + gaze + 状态机 + 动画循环 | P0     | P1     |
| P3   | PixelOrb skins（v4/v3 调色板）                                 | P0     | P1     |
| P4   | PixelWave 核心组件（wave.ts + render.ts + PixelWave.tsx）      | P0     | 无     |
| P5   | 登录舞台改造（PixelWave 背景 + PixelOrb 焦点层）               | P0     | P2, P4 |
| P6   | PageLoading 改造                                               | P1     | P4     |
| P7   | 空状态改造                                                     | P1     | P2     |
| P8   | 侧栏/导航 logo 替换                                            | P1     | P2     |
| P9   | 不确定进度条                                                   | P2     | P4     |
| P10  | 性能监控 + 自动降级                                            | P2     | P2, P4 |
| P11  | PixelBean 目录标记为 deprecated / 移除引用清理                 | P2     | P5~P8  |

---

## 附录：与 DEFINITION / AGENTS.md 的兼容性

| 条款                     | PixelOrb                              | PixelWave                |
| ------------------------ | ------------------------------------- | ------------------------ |
| 基础格子 4px             | ✅ 内部栅格 128×128，CSS size 64 倍数 | ✅ blockSize=4           |
| 品牌色走 `--brand`       | ✅ 球体颜色从 skin palette            | ✅ 像素块从 skin palette |
| 皮肤 ↔ accent 联动       | ✅ 切皮肤自动换球体颜色               | ✅ 同上                  |
| 暗色一等公民             | ✅ 明暗双写 palette                   | ✅ 明度阶梯自适应        |
| 禁 Lottie/Rive/GSAP      | ✅ 纯 Canvas 2D                       | ✅ 纯 Canvas 2D          |
| `prefers-reduced-motion` | ✅ 静态帧有体积感                     | ✅ 静态棋盘格            |
| `data-motion=off`        | ✅ 同上                               | ✅ 同上                  |
| 吉祥物全局唯一           | ✅ PixelOrb 替换 PixelBean            | N/A                      |
| 合法 size 64 倍数        | ✅ 保持                               | N/A                      |

---

## 13. v2.1 审核修订（2026-08-27，追加于 v2.0 之后，不改动上文原文）

上线目检后用户提出四项反馈，本节记录修订方案与关键参数；实现见对应源码文件头注释。

### 13.1 PageLoading 改为吉祥物 + 波带水平组合

- 原形态：仅一条 PixelWave 32×4 涌动条带，缺少吉祥物在场感。
- 新形态：`PixelOrb state="waiting" size={64}`（loading 语义已并入 waiting，词汇表 §2.3）居左 + `PixelWave cols={32} rows={4} waveSpeed={2}` 居右，`gap-6`（24px，4px 网格整数倍）纵向对齐、整体居中；`h-64` / `className` 契约不变。
- 实现：`src/components/PageLoading.tsx`。

### 13.2 侧栏 logo 响应式尺寸

- 问题：折叠（w-24 = 96px rail）时 64px 球体视觉溢出被裁；展开态球体贴近视口左上角。
- 研究结论：展开 rail 224px / 折叠 rail 96px，logo 容器 h-20。64px 球体在折叠 rail 中净余量仅 ~8px，呼吸位移（±2px）与微倾（≤3°）叠加后边缘贴死，视觉上呈「裁切」；32px 图标态在折叠 rail 中余量 32px，任何位移都不裁切。
- 新策略（两态球体完整、居中、不裁切）：
  - 展开态：`size={64}`，容器 `px-4`（16px）+ `gap-3`，球体不贴视口边角；
  - 折叠态：`size={32}`（合法阶梯内图标态），容器 `justify-center px-0` 居中。
- 实现：`src/components/layout/AppLayout.tsx`（`BrandMascot size={collapsed ? 32 : 64}`）。

### 13.3 PixelWave 氛围层重构（全页铺满 + 波动可见性 + 流光溢彩）

**a) 填充模式（铺满整个登录页）**

- 根因：登录页旧用法 `cols={52} rows={40}` 固定网格在画布内居中，只呈现为球体背后一小块矩形。
- 新行为：`cols`/`rows` 缺省时按容器尺寸 ÷ (blockSize+gap) 用 **ceil** 推导网格（`deriveGridCount`，wave.ts），超出部分整格对称裁切，视觉铺满；ResizeObserver 变化时重推导。显式传 `cols`/`rows` 维持旧行为（网格画布内居中），PageLoading 条带不受影响。
- 登录页挂载：PixelWave 从左侧 section 移到页面根容器（`absolute inset-0 z-0`，填充模式自动推导），覆盖左右两栏；舞台与表单内容 `relative z-10`。
- 交互不挡表单：组件 `interactive` 时 wrap/canvas `pointer-events-none`，pointer 监听改挂 **window**（坐标仍经 `getBoundingClientRect` 换算到网格相对系），鼠标涟漪 / 点击脉冲保留。

**b) 亮度重映射（波动可见性）**

- 问题：旧映射 `clamp01(v*0.5+0.5) ** 1.5` 把大部分格子压到 0.13~0.65，波峰到不了 1，目检看不到起伏。
- 新映射（`waveBrightness`，wave.ts，纯函数可单测）：
  `field = min(1, clamp01((clamp01(v*0.5+0.5) - 0.08) * 1.2) ** 1.15 + 0.06)`
  - 波峰（v≥0.92）→ alpha **1.0**；波中（v=0.5）→ ~0.51；波谷（v=0.2）→ ~0.17 可读微光；极谷（v≤0.08）→ 0.06（低于渲染 cutoff 0.08，隐藏）。
- 静态降级形态保持克制：静态帧（双开关 / P10 低帧降级）无光带且整体 `alphaScale = 0.55` 折扣。

**c) 流光溢彩（token 纪律内，无颜色字面量）**

- 新增派生 token `--brand-peak: color-mix(in oklab, var(--brand) 62%, white)`（tokens.css `:root`）：由 `--brand` 派生，随 accent / 明暗切换自动跟随，不设字面量、不在预设组重写；DEFINITION §2 已登记。
- 波峰提亮：亮度 ≥ `WAVE_PEAK_THRESHOLD = 0.8` 的格子用 `--brand-peak` 绘制，形成高光流光。
- 对角光带：沿 (x+y) 对角线缓慢扫过的窄带，仅动画帧开启——半宽 `SHEEN_WIDTH_CELLS = 10` 格、扫速 `SHEEN_SPEED_CELLS_PER_SEC = 6` 格/s（全页对角线约 65s 一轮）、带内 alpha 提升峰值 `SHEEN_ALPHA = 0.4`（按距离线性衰减），boost > 0.12 的格子同步用提亮色。
- 审美目标达成路径：明显可见的明暗波浪（b）+ 一道缓慢流光（c），克制不刺眼；暗色模式由 color-mix 派生与 alpha 阶梯自动成立。

**d) 性能说明**

- 全页填充（如 1920×1080 → 240×135 ≈ 32k 格）超出 §10 原预算（52×40）；波动场为纯 JS 逐格计算，实测可 60fps，持续低帧时 P10 采样器仍会自动定格静态棋盘格兜底。

### 13.4 眼部高光点放大（2×2 格簇）

- 问题：gaze 跟随的白色高光点为单格（full 档 1~2 格），128/64 档显示为 1px/0.5px，不可辨。
- 新形态：高光统一渲染为 **2×2 格簇**（eyes.ts drawIdleEyes；每眼 4 格，双眼共 8 格），256/128/64 三档均可辨；32 图标态维持极简圆点眼（无高光）不变。
- 规则保持：高光与瞳孔同向偏移、幅度更小（gaze.ts `GAZE_HI_SHIFT = 0.15` 不变）；高光落在深色眼球内部、面积小，暗色模式不过曝；双皮肤 `eyeHi` 保持 `#ffffff`（skins/*.ts 注释更新）。
- 眨眼过半（lid ≥ 0.5）瞳孔/高光仍被眼睑遮住，不变。

### 13.5 测试与文档同步

- 新增/更新单测：`waveBrightness` 值域与特性（峰→1 / 中→~0.5 / 谷→微光 / 单调）、`deriveGridCount` 填充推导（显式原样 / 缺省 ceil / 最小 1 格）、render 波峰提亮与光带 boost 与 `alphaScale`、PixelOrb 高光簇计数（三档 8 格 / icon 无 / gaze 不越界）、组件 `pointer-events-none` 断言。`pnpm exec vitest run` 126 全绿。
- 同步文档：`src/design/DEFINITION.md`（§1 阶梯、§2 `--brand-peak`、§4 高光簇与氛围层条目、§6 表面清单）、`src/effects/README.md`（PixelWave 描述与挂载点）。

---

## 14. v2.2 修订（2026-08-27，追加于 v2.1 之后，不改动上文原文）

二轮目检后用户推翻氛围层语言并给出新定义（原话：「我要的是全屏白色或黑色（干净背景）。然后有像素波纹动效，比如白色背景，从左下角开始，像素波动，波动纹路是五彩的，波动的位置是像素块，波动路过后恢复，就和像素音阶一样」），并要求 PageLoading 去吉祥物、侧栏折叠态再修。本节记录修订方案与关键参数；实现见对应源码文件头注释。

### 14.1 氛围层推翻重来：常驻棋盘格 → 脉冲波（基态零渲染）

**废弃**：常驻棋盘格基态、多层正弦基波 + 有机抖动、v2.1 亮度重映射（`waveBrightness`）、波峰提亮与对角流光带（`--brand-peak` token 同步从 tokens.css 与 DEFINITION §2 移除）。v2.1 的填充模式（ceil 铺满 / 显式居中）、pointer-events-none + window 监听、P10 FPS 自动降级路径保留。

**新语言**：

- **基态 = 零渲染**：亮色纯白 / 暗色纯黑（页面 `bg-background`），canvas 不画任何常驻内容；无在途脉冲时清空画布一次后持续跳过场计算（基态快速路径）。
- **脉冲波**：环形波包从原点（`origin` prop，默认 `bottom-left`，四角 / 中心 / 归一化 `[x,y]` 可配）周期性发射，`emitInterval` 默认 2.4s（场时间轴，首个脉冲立即发射；锚定当前场时间，后台标签恢复不补发积压）；相位错开 2~3 个在途（脉冲寿命 ≈ 对角线 ÷ 线速 + 波尾散尽 > 发射间隔）。
- **显色与恢复**：波前扫过的格子点亮为像素块（4px 块 + 4px 间隙 8px 周期网格语言不变）。`pulseBrightness(dr)` 纯函数：`dr = 格距 − 波前半径`；`dr > 0`（波前未到）`exp(−dr/1.2 格)` 锐利前沿、`dr ≤ 0`（波前已过）`exp(dr/tail)` 指数波尾（`tail = 对角线 × 5%` 夹 `[4,18]` 格）——路过即恢复、像素音阶式起落；贡献 < ε(0.02) 精确短路为 0。格子亮度 = 各在途脉冲贡献之和，封顶 1 → globalAlpha。波前线速 = 对角线 ÷ `TRAVERSE_SECONDS`(3s)：全页与小条带同一视觉节奏。
- **五彩纹路**：程序化 oklch（宪法 §5 已豁免，禁 hex 字面量、禁色板文件）：
  `hue = baseHue + dist × (300°/对角线) + 脉冲序号 × 137.5° + time × 10°/s`
  基准 hue 从 `--brand` 自定义属性的 oklch 写法解析（回退 280 ≈ 长春花蓝相位），随 accent 联动；量化 24 道（15°/道，色带像素感）分桶渲染，fillStyle 每道每帧至多设一次；明度/彩度明暗两档（亮 0.72/0.19、暗 0.6/0.16——暗色降低 L 防刺眼）；canvas fillStyle 直接吃 `oklch(...)` 字符串，`CSS.supports('color', 'oklch(0.7 0.1 250)')` 失败时整组回退 `--brand`（五彩退化为明暗波次，语言不塌）。
- **降级**：双开关（`prefers-reduced-motion` / `html[data-motion=off]`）→ 零渲染纯背景（天然满足：清空画布，不起 rAF、不挂监听、不设观察者）；P10 持续低帧（<30fps 达 2s）→ 清空画布定格纯背景 + console.info 一次。
- **交互涟漪**：`pointermove` 节流 0.12s（场时间）发小脉冲（振幅 0.55）、`pointerdown` 发大脉冲（振幅 1.3），与氛围脉冲同 `Pulse` 结构同管线；监听挂 window、组件 pointer-events-none 不变。同屏脉冲上限 12（超出丢最旧）；死亡判定 = 波前越过最远格且波尾散尽（`pulseAlive`）。
- **性能**：氛围原点距离场 `createPulseCache` 预计算（含 maxDist / diag）；每格每脉冲先 dr 短路（不进 exp）；场 / 道缓冲复用逐帧零分配；渲染按 24 道分桶（fillStyle 切换 ≤24 次/帧）。全页 1920×1080 → 240×135 ≈ 32k 格，脉冲是稀疏事件，目标 60fps，P10 采样器兜底不变。
- **接口**：`PixelWaveProps` 新增 `origin`（默认 `'bottom-left'`）、`emitInterval`（默认 2.4，下限 0.2）；`cols/rows/blockSize/gap/waveSpeed/interactive/className` 语义不变（向后兼容；`waveSpeed` 折入场时间轴，发射间隔与波前线速同步缩放）。

### 14.2 PageLoading 去吉祥物

- 用户：「去掉吉祥物，改成波动像素。」移除 `PixelOrb waiting 64` 与 32×4 条带的水平组合，改为**纯波动像素**：`PixelWave cols={28} rows={6} waveSpeed={1.5}` 紧凑矮条（224×48px），从左下角持续发射五彩脉冲（与氛围层同语言），居中于 `h-64` 容器；`className` 契约保留。
- 实现：`src/components/PageLoading.tsx`。

### 14.3 侧栏折叠态 logo 修复

- **排查结论**（代码推理，SSR/curl 无法验证布局）：
  1. 结构：logo 容器在 rail（`<aside>` 列）内，不在全宽 header 内；折叠展开按钮（ChevronsLeft，折叠时旋转 180° 呈 »）在 `Header`（主列）中——header 与 rail 是兄弟列，互不包含。rail 宽度链：`collapsed ? w-24 : w-56`（密度 comfortable 下 84px / 224px，compact 下 ≈71px / ≈187px，随 `--spacing` 与根字号缩放）。
  2. 根因：v2.1 只换 `size={collapsed ? 32 : 64}`，折叠容器仍沿用展开态几何（`h-20` 80px 高 + flex 行 + `gap-3`）：32px 球体落在过高盒内，上下 24px 与横向余量不成比例，视觉上「球小而盒大」；居中仅靠 flex `justify-center` 隐式表达，宽度链不明（容器无 `w-full`）。
  3. PixelOrb 32 图标态内部透明边距：128 栅格半径 62 → 每侧 2 格 = 0.5 CSS px，球体视觉直径 31px——**排除**为偏移/显小成因（肉眼不可辨）。
- **修复**：折叠容器 `grid h-16 w-full place-items-center`（w-full 撑满 rail 内容宽、grid 双轴居中、上下各 16px 留白；球体视觉直径 31px + idle 呼吸位移 ±2px，四边余量 ≥14px，不贴不裁）；展开态维持 `h-20 + px-4 + 64` 不变。
- 实现：`src/components/layout/AppLayout.tsx`。

### 14.4 测试与文档同步

- 单测重写（`pnpm exec vitest run` 134 全绿）：脉冲场（远离波前精确为零、波前位置随时间推进、波尾单调衰减、固定格起落后恢复归零、多脉冲叠加封顶、值域 [0,1]、主导脉冲 hue 道、交互脉冲）、`pulseHue` 确定性与包裹、`hueLaneIndex` 边界、`oklchLaneColors` 道数/格式/明暗分档、`resolveOrigin`、`pulseTailCells` 夹取、缓冲复用一致性；`renderPulseField`（cutoff 零渲染、分桶设色每道一次、空道不设色、alpha=亮度、周期落位、复位）；组件 SSR 烟测（v2.2 契约用法、新 props、pointer-events-none）。旧基波 / 亮度重映射 / 流光 / 涟漪衰减测试删除。
- 文档：`src/design/DEFINITION.md`（§2 移除 `--brand-peak`、§4 氛围层条目重写为脉冲五彩波 + 基态零渲染、§6 表面清单 PageLoading / 登录舞台行）、`src/effects/README.md`（PixelWave 章节重写、治理约束、目录结构、挂载点）、`AGENTS.md` §5 双轨描述同步。

---

## 15. v2.3 修订（2026-08-27，追加于 v2.2 之后，不改动上文原文）

三轮目检后用户推翻脉冲波语言（原话：「效果不好，是脉冲效果，我想要的是类似活字印刷的那种像素块，且不需要鼠标涟漪/点击脉冲保留。」）。诊断：v2.2 把波画成平滑渐变的圆弧波带（大量不同 alpha 的小点连成渐变弧），视觉是「脉冲/渐变」而非「像素块」。本节记录修订方案与关键参数；实现见对应源码文件头注释。

### 15.1 氛围层推翻重来：脉冲波 → 活字印刷像素块

**废弃**：环形脉冲发射 / 波前锐利波尾指数衰减（`pulseBrightness`）、脉冲叠加封顶亮度场、alpha 渐变波带、`origin` / `emitInterval` props 与 `Pulse` 结构。v2.1 的填充模式（ceil 铺满 / 显式居中）、P10 FPS 自动降级、五彩程序化 oklch 分桶渲染管线保留。

**新语言**：

- **基态 = 干净白/黑背景 + 稀疏实心块起落**：页面 `bg-background` 纯白/纯黑，canvas 只画被点亮的格子；无常驻点阵、无波带。
- **实心整块**：被点亮的格子一律渲染为**统一大小、满不透明度（alpha=1）的实心方块**（4px 块 + 4px 间隙 8px 周期网格语言不变）。禁止用连续 alpha 渐变造波——视觉上每块像素都是一枚独立的「铅字块」。场值为 0/1（`Uint8Array`），渲染无中间亮度。
- **离散起落**：每格有确定的伪随机作息（`cellHash(x, y, salt)` 种子，32 位整数混合、跨引擎确定性）：独立周期 T ∈ [2, 6]s（`PERIOD_MIN/MAX`）、点亮窗口占比 duty ∈ [20%, 35%]（`DUTY_MIN/MAX`）、相位 φ 与活跃门槛 gate ∈ [0,1)。块在 ON/OFF 间**硬切换**（铅字被按下/抬起，无淡入淡出）。`cellOn(schedule, time, activity)` 纯函数：`gate < activity` 且 `fract(time/T + φ) < duty` → ON。
- **密度有界**：同一时刻全屏点亮密度 8%~15%（稀疏、干净）。基础活跃度 = `density ÷ DUTY_MEAN(0.275)`（`baseActivity`，`density` prop 默认 0.1）；实测登录全页（240×135）任意时刻密度 9.9%~14.2%。
- **左下角慢扫（保留用户偏好）**：点亮概率受一条从左下角缓慢对角推进的「印刷头」偏置——`headPosition(time)` 以对角归一坐标 u（0 = 左下角）按 `SWEEP_PERIOD_SECONDS = 36`s 周期推进，带内（半宽 `HEAD_WIDTH = 0.08`）活跃度按抛物线 `headBoost = 1 − (d/w)²` 提升至 1，扫过区域进入高密度期、过后回落基础密度。偏置只影响「哪些块亮」，每块仍是实心均匀块——绝不再出现平滑渐变弧带。
- **时间步进感**：场状态按 **~10fps 离散步进**更新（`STEP_FPS = 10`，`stepTime` 向下取整；同一步进帧内不重算不重绘），强化「印刷机械」的像素原生感，也省 CPU；rAF 仅作步进检测与 P10 采样。
- **五彩（保留）**：每块纯色但 hue 各异——`typeHue(hueSeed, time, baseHue)`：hue = `--brand` 解析基准 hue（回退 280）+ hueSeed × `HUE_SEED_SPAN`(120°) 色带 + 时间慢漂（±`HUE_OSC_DEG`(10°) 正弦，非单调流）；量化 24 道分桶渲染（fillStyle 每道每帧至多设一次）；L/C 明暗两档（亮 0.72/0.19、暗 0.6/0.16，暗色降 L 防刺眼）；canvas fillStyle 直接吃 oklch 字符串，`CSS.supports` 失败时整组回退 `--brand`（五彩退化为单色块，语言不塌）；禁 hex 字面量、禁色板文件。
- **移除交互**：删除鼠标涟漪、点击脉冲、`interactive` prop 及全部 pointer/window 监听；组件恒 `pointer-events-none`。三个挂载点（登录页根容器 / PageLoading 条带 / DynaTable 空状态）同步去掉该 prop。
- **降级**：双开关（`prefers-reduced-motion` / `html[data-motion=off]`）→ 零渲染纯背景（清空画布，不起 rAF、不设观察者）；P10 持续低帧 → 清空画布定格纯背景 + console.info 一次（路径不变）。
- **性能**：每格作息 5 通道 + 对角坐标由 `createTypeCache` 预计算（typed array）；场 / 道缓冲复用，逐帧零分配；场计算仅在步进帧边界执行（~10 次/秒）；渲染按 24 道分桶（fillStyle 切换 ≤24 次/帧）。
- **接口**：`PixelWaveProps` = `cols / rows / blockSize / gap / waveSpeed / className`（语义不变）+ 新增 `density`（目标基础点亮密度，默认 0.1）；删除 `interactive / origin / emitInterval`。PageLoading 维持 28×6 矮条、DynaTable 维持 8×8 慢速（waveSpeed 折入场时间轴，作息周期 / 印刷头扫速 / hue 慢漂同步缩放）。

### 15.2 测试与文档同步

- 单测重写（`pnpm exec vitest run` 130 全绿）：`cellHash` 确定性与值域与通道去相关、`cellSchedule` 确定性与值域（周期 2~6s / duty 20%~35%）、`cellOn` ON/OFF 窗口与长程 duty 占比、活跃门槛、`baseActivity` 换算与夹取、印刷头位置/偏置（带心 1 / 带外精确 0 / 抛物线）、任意时刻点亮密度有界（120×90 采样 ∈ (5%, 17%)）、带内密度高于带外（过后回落）、density=0 带外零渲染、`typeHue` 确定性与包裹与慢漂有界、`stepTime` 步进取整、`hueLaneIndex` 边界、`oklchLaneColors` 道数/格式/明暗分档、场计算确定性与缓冲复用一致性；`renderTypeField`（只画 ON 格、alpha 恒 1、分桶设色每道一次、空道不设色、周期落位、复位）；组件 SSR 烟测（v2.3 契约用法、恒 pointer-events-none）。旧脉冲场 / 交互脉冲 / 原点解析测试删除。
- 文档：`src/design/DEFINITION.md`（头部拍板行、§4 氛围层条目重写为活字印刷像素块、§6 表面清单登录舞台 / PageLoading 行）、`src/effects/README.md`（PixelWave 章节重写、治理约束、目录结构、挂载点）。`AGENTS.md` §5 双轨描述仍停留在 v2.2 脉冲波措辞，属宪法 §10「修改本文件」请示项，留待人类批准后同步。

---

## 16. v2.4 修订：像素传导（用户拍板）

v2.3 的「均匀作息场 + 印刷头密度偏置」被否决——传导本身必须可读。用户原话：「我要的是从左下角开始，对角线扩散，活字印刷一样的像素块铅字起落，像素传导的动画效果」。

- **引擎改为点火时刻模型**：每格点火时刻 = 波序号 × `WAVE_INTERVAL_SECONDS`(4.5s) + 对角坐标 u（0=左下，1=右上，`diagCoord`）× `WAVE_TRAVEL_SECONDS`(3s) + 伪随机抖动（`cellHash` 种子，≤ `FIRE_JITTER_SECONDS` 0.18s）。波前逐格推进，所到点亮实心铅字块（统一大小、alpha=1 整块），停留 `WAVE_DWELL_SECONDS`(0.5s) 即熄灭（按下/抬起，路过恢复）；波间允许全暗呼吸期（基态干净）。
- **删除**：`cellSchedule` / `cellOn` / `baseActivity` / 印刷头（`headPosition` / `headBoost` / `SWEEP_PERIOD_SECONDS` / `HEAD_WIDTH`）/ `density` prop（密度由 dwell÷interval 决定，均值 ≈ 11%）及 PERIOD/DUTY 常量。
- **保留**：实心整块 / 4px+4px 网格语言 / 五彩程序化 oklch / ~10fps 步进 / 无交互（v2.3）/ 双开关与 P10 降级（纯背景）/ v2.1 填充模式（ceil 铺满 / 显式居中）。
- **接口**：`PixelWaveProps` = `cols / rows / blockSize / gap / waveSpeed / className`（`density` 移除；三处挂载点均不传 density，零改动）。
- **测试重写**（vitest 127 全绿）：点火时序（未到达 OFF / dwell 窗内 ON / 过窗恢复 / 周期再点火）、从左下角开始（传导中途 u 大区域零点亮）、对角线扩散（点亮重心向右上移动）、密度有界 + 波间全暗恢复、hue 道量化与缓冲复用一致性、SSR 烟测（v2.4 契约、恒 pointer-events-none）。

---

## 17. v2.5 修订：方形涟漪 + 等分切割大铅字块（用户拍板）

两点修订（用户原话：「应该是和水波涟漪一样的，并且铅字像素块应该放大，等分切割方形像素块」「不是圆弧涟漪，是方形的涟漪传导」）：

- **波前形状：对角直线带 → 方形环**。`diagCoord`（x+oy 线性）与圆弧方案（欧氏）均否决，定为 `squareCoord`：**切比雪夫距离** `max(x, oy) ÷ max(gridW-1, gridH-1)`。同 u 的格子构成 L 形方形环，逐环放大即方形涟漪传导（左下角方形原点，向右、向上扩散）。
- **像素块放大：固定 4px → 等分切割**。fill 模式（cols/rows 缺省）走 `equalDivision`：容器宽 ÷ `FILL_COLS`(48) 得方形块边长（**4 的倍数对齐**，1920 宽 = 40px 大铅字块），`gap = block/8`（夹 [2,12]），行数按周期铺满、超出对称裁切。显式 cols/rows 模式维持 `blockSize`/`gap` props（PageLoading 调大为 12/4，DynaTable 空态 10/2）。
- 其余不变：实心整块 alpha=1 / 点火时刻模型（环序号 × 4.5s 间隔 + u × 3s 传导 + ≤0.18s 抖动）/ 停留 0.5s 熄灭路过恢复、环间全暗呼吸 / 五彩程序化 oklch / ~10fps 步进 / 无交互 / 双开关与 P10 降级。
- 测试（vitest 132 全绿）：`squareCoord`（原点 0 / 最远角 1 / 同环共享 u / 放大方向单调）、`equalDivision`（48 等分 / 4 倍数 / gap 夹取 / 兜底）、点火时序、左下角开始、方形环扩散重心推进、密度有界 + 环间全暗。

---

## 18. v2.6 修订：背景色方块 + 波边彩色边框 + 对角走廊（用户拍板）

用户原话：「白色背景，应该是白色方块，整个涟漪波动边有彩色边框，黑色背景应该是黑色方块，依旧保持彩色边框」「涟漪应该保持对角线，现在依旧影响了登录框，这是 bug」。

- **方块本体 = 页面背景色**：白底白块 / 黑底黑块（tile 不再实心填彩色，本体透明即底色）；涟漪的可见表达改为**波前格子的彩色边框**——`renderTypeField` 每 ON 格画 4 条 `fillRect` 边线（厚度 `block/10` 夹下限 2，像素锐利、无 strokeRect 半像素问题），五彩程序化 oklch 与分桶管线不变。
- **对角走廊（修 bug）**：新增 `inDiagonalCorridor`（归一化 |x/(W−1) − oy/(H−1)| ≤ `CORRIDOR_HALF = 0.1`）与 cache `corridor` 掩码通道——涟漪约束在页面对角线走廊内传导，走廊外永不点亮（登录表单在走廊外，不再被漫入）。方形环（切比雪夫 u）计时模型不变。
- 测试（vitest 136 全绿）：走廊边界（对角入廊 / 两角出廊 / 恰好越界）、走廊外任意时刻零点亮、渲染改为 4 边边框几何断言（含 40px 大块厚度 4）、其余沿用。

---

## 19. v2.7 修订：彩色淡流光 + 非全量参与（用户拍板）

用户原话：「不对，我要的是彩色淡流光的那种，且不是每个方块」。

- **淡流光渲染**：硬实边框改为柔和淡彩——每 ON 格 = 半透软填充（`WAVE_FILL_ALPHA = 0.42` 统一低透明度淡彩；禁止的是连续渐变造波，统一半透明不是渐变）+ 淡彩边框（`WAVE_BORDER_ALPHA = 0.78`，4 条 fillRect 边线，厚度 block/10）。方块本体仍是页面背景色（白底白块 / 黑底黑块）。
- **非全量参与**：新增 `PARTICIPATION = 0.35` 与 cache `takePart` 掩码通道（`cellHash(x,y,6)` 种子固定）——波带内经行时只有约 1/3 方块泛起淡流光，稀疏闪烁而非整片齐亮。
- 测试（vitest 138 全绿）：参与率大网格统计 ≈ 0.35±0.06、不参与格任意时刻零点亮、渲染 5 条/格（软填充 + 4 边框）与双透明度断言（填充 < 边框）、密度下界随参与率下调。

---

## 20. v2.8 修订：每波独立噪声 + 信号视窗品牌精修（用户拍板）

### 20.1 每次发波换一张噪声图

v2.7 的 `createTypeCache` 只按格坐标生成一次固定参与掩码、点火抖动和色相种子，因此每个 4.5s 周期都在重播同一张扩散纹理。本次改为两级 seed：

1. `PixelWave` 每次挂载通过 `crypto.getRandomValues` 创建随机 `sessionSeed`，重复进入登录页会得到新的观看序列。
2. `waveSeed(sessionSeed, waveIndex)` 为每个波序号派生独立 seed；同一波内部确定性稳定，相邻波不会共享纹理。
3. 当波 seed 同时驱动四个通道：
   - 两个八度的平滑值噪声扭曲 `squareCoord`，幅度 `WAVE_ROUGHNESS_U = 0.075`，改变方形环轮廓；
   - `PARTICIPATION = 0.35` 的参与掩码；
   - `FIRE_JITTER_SECONDS = 0.18` 内的点火抖动；
   - hue seed 色相纹理。
4. `PixelWave` 只在波序号变化时重建 typed-array cache，10fps 热路径仍复用 field/lanes 缓冲。

研究演示 `letterpress-ripples/index.html` 使用相同原则，但为每个并发波直接持有 `noise` 对象：`wob / jit / terrain / jitH` 四通道随 `fireWave` 新建；HUD 显示当波 6 位噪声编号，便于目检相邻波确实换图。

### 20.2 品牌形象：圆眼 → 横向信号视窗

诊断：旧 PixelOrb 的“双圆眼 + 圆瞳孔 + 白色圆高光”虽然灵动，但与常见 AI 助手和萌系机器人同质，且在登录页顶部与舞台重复出现两个球体，造成视觉层级粗糙。

- 球体 SDF、五级光照、皮肤、gaze 和状态机全部保留。
- 五官层替换为一体式倒角横向观测窗；窗内只使用矩形信号段，不再绘制圆眼、圆瞳孔或圆高光。
- `idle`：双矩形信号随 gaze 整格平移；32px icon 收束为单横条。
- `waiting`：五段扫描序列；`success`：上扬确认折线；`error`：中央断裂 X 信号；`sleeping`：关闭横线。
- 登录页删除顶部重复的 64px Orb，改用 `A/` 字符标 + APOCALYPSE 字标 + MANAGEMENT CONTROL PLANE 副标；桌面仅保留一个 256px 主视觉。版式升级为编辑式信息层级与独立安全访问区。

验收：同一传播相位的相邻波场不得逐格相同；不同 session seed 不得重播同一序列；四档 PixelOrb 均须保持信号视窗可读，idle gaze 位移后高亮面积不变且不越出球体。

---

## 21. v2.9 修订：登录页同底色铅字浮雕（用户拍板）

用户修正颜色语义：「需要采用彩色流光或灰阶渐变，亮色模式为白底白色铅字块，暗色模式是黑底黑色铅字块」。因此登录页不再把半透明彩色填充覆盖在铅字块面上。

### 21.1 材质与渲染分层

1. `PixelWaveProps` 新增 `appearance: 'flowlight' | 'letterpress'`，默认 `flowlight` 保持 PageLoading / 空状态兼容；登录舞台显式使用 `letterpress`。
2. 顶面 `face` 严格取 `--background`：亮色模式白底白块，暗色模式黑底黑块。程序化 hue 不能进入顶面中央。
3. 挤出侧壁分两级绘制：靠顶面取 `--border`，靠底座取 `--muted-foreground`，形成有明确对比的像素化灰阶深度；不新增颜色字面量或色板。
4. 彩色流光只画浮雕完整剪影的极淡外沿与 1~2px 线芯；hue 继续由当波 `hueSeed` 纹理和主题 `--brand` 相位驱动，因此换波时边缘色纹也换新。
5. 画序为灰阶侧壁 → 同底色顶面 → 彩色剪影边缘；所有 canvas 坐标与尺寸取整。

### 21.2 抬升与每波高度纹理

- 点火窗仍为 0.5s；新增 `letterpressLift` 包络：前 0.1s 快速抬升至峰值，余下 0.4s 线性回落，保持 10fps 离散机械感。
- `TypeCache.terrain` 使用当波 seed 生成低频高度倍率 `[0.75, 1.35]`；因此同一波相邻块高低连续，相邻波和重复进入页面的浮雕高度图均不同。
- `computeTypeField` 接受可选复用 `Float32Array liftOut`，默认 flowlight 路径不分配高度缓冲；登录 letterpress 路径在 resize 时分配一次并逐帧复用。

### 21.3 登录布局隔离

- 桌面 PixelWave 从登录根容器收回到左侧品牌舞台；右侧安全访问表单改回实色 `bg-background`，不使用透明覆盖或 backdrop blur。
- 移动端只在紧凑品牌头内挂载 letterpress PixelWave，表单主体保持纯数据表面。
- 双开关与 P10 降级不变：关闭动画或持续低帧时清空 canvas，页面只剩主题背景与静态内容。

验收：任一激活格的顶面 fillStyle 必须等于 `--background`；彩色矩形只能出现在剪影四边；OFF / 零高度格零渲染；桌面与移动端表单区域不得被 PixelWave 覆盖。

---

## 22. v2.10 修订：按图 3 重建连续铅字浪潮

图 1/2 的登录实现只有少量空心发光框，和研究演示图 3 的大面积连续柱体波面不是同一模型。根因是 v2.9 仍复用了 flowlight 的 `PARTICIPATION = 0.35`、方形环、对角走廊和 0.5s 短点火窗。本节仅重写登录 `letterpress` 场；默认 `flowlight` 保持兼容。

### 22.1 波场

- 登录 fill 网格固定为 32px 节距：28px 顶面 + 4px 缝隙；不再按容器宽 48 等分。
- 每波从四个角点之一发射，下一波不得重复上一角点；距离场改为格心到角点的欧氏距离。
- 传播参数对齐研究演示：首波延时 0.8s、发射间隔 7s、2.4s 扫过全场、0.09s attack、0.38s exponential tail、0.03 cutoff。
- `letterpressLift(u) = (1 - exp(-u / 0.09)) × exp(-u / 0.38)`；阈值以上格子全部参与，形成连续波峰和大面积高度长尾。
- 当波 seed 同时驱动两个八度距离扭曲、±0.045s 点火抖动和 `[0.75,1.35]` 高度地形；相邻波及重新挂载均换新。

### 22.2 材质与流光

- 最大挤出高度由 `0.85 × block` 提高到 `1.45 × block`，形成接近图 3 的高柱体轮廓。
- 顶面继续严格取 `--background`；近端侧壁取 `--border`，远端以低透明 `--foreground` 叠加，避免暗色出现白条、亮色又看不见深度。
- hue 不再逐格完全随机：以当前角点的 90° 波前角度展开 180° 色带，按 120°/s 流动，再叠加当波逐格 ±38° 小抖动；因此颜色沿波面连续，同时每波纹理仍不同。

### 22.3 登录合成

- 浪潮完整铺满左侧品牌舞台，整体可见度提高至 90%；右侧表单仍由实色背景隔离。
- 标题与说明信息块保留同底色遮挡层，避免高密度网格穿过正文；球体和浪潮共同构成左侧焦点层。

验收：波包中段即时参与密度必须位于 20%~80%，不得退化为少量孤立方框；同相位相邻波的 field 不得逐格相同；1025×851 截图应能直接读出连续弧形波峰、完整网格和不同高度柱体。

---

## 23. v2.11 修订：letterpress 连续帧与热路径优化

运行时对照发现 v2.10 登录浪潮仍复用 `STEP_FPS = 10` 的时间量化，每 100ms
才更新一次高度；研究演示则逐 `requestAnimationFrame` 推进。前者即使 CPU 开销低，
也会产生可见的台阶式跳动。本节只改变登录 `appearance="letterpress"`，默认
`flowlight` 继续保持 10fps 离散机制。

- **连续时间轴**：letterpress 每个 rAF 使用未经 `stepTime` 量化的场时间计算
  attack / tail 高度包络和色相流动；60Hz 下相邻约 16.7ms 的帧具有不同高度。
- **到达时刻预计算**：`createLetterpressCache` 新增 `arrival = distance × travel + jitter`，
  连续帧不再重复执行距离乘加。
- **色相相位预计算**：角点 `atan2` 与逐格色相抖动预计算到 `huePhase`；热路径只做
  `baseHue + huePhase + time × flowSpeed` 的道量化。
- **指数短路**：到达前和 `-tail × ln(cutoff)` 活跃窗之后直接跳过，不进入 `Math.exp`。
- **Canvas 提交**：letterpress 使用不透明、低延迟 2D context，按主题背景整面覆盖；
  DPR 与研究演示一致封顶为 2，避免 3×/4× 屏放大清屏和合成成本。
- **缓冲与降级**：field / lanes / lifts 继续复用、逐帧零分配；双动效开关与 P10
  持续低帧自动清空路径保持不变。

验收：letterpress 不得调用 `stepTime`；相隔 1/60s 的同一波高度场必须产生差异；
2400 格场连续计算的本地基准应远低于 16.67ms 帧预算，浏览器不得出现 warning/error。

---

## 24. v2.12 品牌主形象：高密度像素蝾螈（历史，已由 §26 取代）

用户否决球体与横向信号视窗，确认高分辨率薄荷色像素蝾螈方向。运行时仍保留
`PixelOrb` 组件名与既有状态契约，视觉与渲染源替换如下：

- `public/brand/packet-axolotl-master.png`：居中视线静态母版；
- `public/brand/packet-axolotl-base.png`：空眼母版，运行时在其上单独绘制双瞳；
- `public/brand/packet-axolotl-blink.png`：完整闭眼母版；
- 原图 1254×1254，各显示阶梯用 2× 内部 Canvas（512/256/128/64）；图片只在
  载入或尺寸变化时按 nearest-neighbor 缩放到离屏帧，rAF 热路径只复制离屏帧并
  绘制瞳孔，避免每帧缩放大图；
- gaze 继续使用 `computeGaze` 与 0.5s 回中弹簧。两枚瞳孔共享同一偏移向量，始终
  保持在奶油色眼白内；idle 低频随机眨眼，waiting 扫描，success 上看，error 下沉，
  sleeping 使用闭眼母版；
- `prefers-reduced-motion` / `data-motion=off` 与 P10 低帧降级均直接绘制静态母版，
  不挂 pointer 监听、不启 rAF；
- 登录页移除 `A/` 字符块与主视觉外侧方框，页首、侧栏与 favicon 改用独立静态
  `BrandSignature` 图形标；PixelOrb 只承担登录、空态与结果反馈的“值守向导”，不再兼任正式 logo。

验收：鼠标移动时身体轮廓不得变化；双瞳方向一致且不越出眼白；眨眼只切换眼部状态；
32/64/128/256 四档不裁切，明暗主题均无棋盘底或透明边缘光晕。

---

## 25. v2.13 CRUD 浮层：固定复杂 PCB 电路传导（历史，已由 §26 取代）

用户否决规则像素格与过于规律的折线，确认 CRUD Dialog / AlertDialog / Sheet 应先显示
纯亮色或暗色空白表面，再由真实感更强的线状电路脉冲点亮并浮现内容。本节新增
`appearance="circuit"`，不改变登录 `letterpress` 与兼容 `flowlight`。

- **固定复杂拓扑**：唯一一条斜向主路连接五条长短、方向与折点均不对称的分支；坐标以
  448×596 为设计基准归一化，随浮层尺寸缩放。路径、分流点和时序不使用随机 seed，
  每次打开完全一致。
- **真实分流时序**：主脉冲进入后，分支只能在主路脉冲到达各自焊点时启动；分支延迟由
  主路累计距离计算，不允许所有线路同时描边或按规则网格齐亮。
- **精简材质**：纯 `--background` 表面上只绘制 `--brand` 低亮已通电尾迹、高亮移动
  线脉冲与小型方形端点。禁止像素格铺底、灰阶侧壁、立体起伏、连续渐变、四角外壳与
  稳定态装饰边框。
- **一次性揭幕**：`PixelSurfaceReveal` 以 `waveSpeed=6` 加速播放，内容延迟到传导中后段
  后按标题、正文、操作区分拍浮现；840ms 后卸载 Canvas 与 rAF，稳定数据表面不常驻动效。
- **降级与性能**：`prefers-reduced-motion`、`data-motion=off` 或 P10 持续低帧时保持纯背景、
  不运行电路；Canvas 恒 `pointer-events-none`，不注册鼠标或点击交互。

验收：同尺寸多次打开所得轨迹逐点一致；分支 delay 与其主路焊点距离单调对应；首波前
画布完全空白；任一帧只存在品牌色线路/端点而没有格子、灰阶或渐变；Reveal 生命周期后
DOM 中不存在电路 Canvas。

---

## 26. v2.14.1 Mint Bonk 与 CRUD 边缘像素接力（历史，已由 §27 / §28 取代）

用户确认现有高分辨率蝾螈与 PCB 电路不符合清新、年轻的品牌主题。本节同时取代
§24 的图生蝾螈和 §25 的 CRUD 电路，但不改变 `PixelOrb` 对外组件名与既有状态词表。

### 26.1 Mint Bonk 数据精灵

- 母版改为 `draw.ts` 中的 32×32 纯数据栅格，不再加载 `public/brand/packet-axolotl-*`。
- 原创轮廓固定为软方身体、左长右短的不对称触角、左右不等高的短手与两只短脚；
  不指向具体动物，也不使用圆形背板、桌沿、复杂大眼或生成式渐变。
- 256/128/64/32 四档分别以 8×/4×/2×/1× nearest-neighbor 整数倍显示；Canvas
  原生尺寸始终为 32×32，运行时不缩放高分辨率位图。
- 皮肤调色板作用于整套精灵；状态表情由 `eyes.ts` 以少量整格像素叠加。gaze 最多移动
  一格，呼吸、等待、成功、错误和睡眠位移均在写入 DOM 前取整。
- `prefers-reduced-motion` / `data-motion=off` 与 P10 低帧降级直接显示当前状态的静态帧，
  不挂 pointer 监听、不启 rAF。

### 26.2 PixelSurfaceReveal（历史，已由 §28 取代）

- CRUD Dialog / AlertDialog / Sheet 不再挂载 PixelWave，也不再使用实色表面遮罩。
- 五段不等长的 4px `--brand` 信号与一枚 8px 脉冲头组成唯一一套固定非对称接力；Sheet 从真实停靠边进入，
  Dialog / AlertDialog 从中心展开。轨迹使用 CSS 定位与 transform / opacity 动画，不创建 Canvas。
- 单段信号 260ms，间隔 42ms；脉冲头整体在 460ms 内完成并在 500ms 后卸载 DOM。
- 内容从 180ms 开始进入，标题、正文和操作区间隔 70ms；效果与信息同步推进，不再让用户
  面对空白表面等待品牌动画结束。
- 禁止 PCB 折线、焊点、全屏底色、外发光、灰阶浮雕、渐变、四角装饰和稳定态像素边线。

验收：32×32 母版四角透明且轮廓左右不镜像；全部合法尺寸均为母版整数倍；五个状态帧
确定且互不相同；CRUD 打开后立即可见正常表面，接力脉冲从真实进入边缘传播；500ms 后 DOM
中不存在 `pixel-surface-reveal`，管理正文无 Canvas 或常驻装饰动画。

---

## 27. v2.15 批准设计稿成为 Mint Bonk 唯一运行时源

用户指出 §26 的代码精灵与已经批准的三张角色设计稿不一致。本节取代 §26.1；
§26.2 的 CRUD 边缘像素接力随后由 §28 取代。

### 27.1 角色素材

- 唯一运行时源为 `public/brand/mint-bonk-design-sprites-v1.png`，由批准的 3×2 角色稿
  仅做透明背景提取而来；不得重新设计、重绘、换色或改变比例。
- 母版为 1536×1024，每格 512×512：上排依次映射 `idle / waiting / success`，下排
  前两格映射 `error / sleeping`；右下背面稿只用于设定参考，不是产品状态。
- 固定识别特征是长软左触角、短圆右触角、梨豆形薄荷身体、深青像素描边、白色腹斑、
  腮红与短手脚。运行时不得用 Canvas、SVG、CSS 或代码栅格绘制“近似版本”。
- `PixelOrb` 保留 256/128/64/32 四档 API，以 overflow 裁切同一母版对应单格；图片使用
  `image-rendering: pixelated`，不创建 Canvas 或常驻 rAF。登录 idle 可注册一个 passive
  `pointermove`，只更新原稿眼部高光裁片的 CSS 变量。

### 27.2 状态与动效

- 状态切换只更新母版裁切坐标，轮廓、五官、颜色全部来自设计稿本身。
- 轻动效只作用于裁切帧容器：idle / sleeping 为 1–2px 呼吸，waiting 为三阶踮脚，
  success 为 4px 短跳，error 为两次 2px 横向微震；不得对素材使用旋转、形变或滤镜。
- `skin`、历史 v3/v4 调色板与 `mascotSkin` store 字段仅保留旧调用兼容，不得改变
  PixelOrb；设置面板不再暴露吉祥物换肤。idle `gaze` 使用同一批准稿内的两枚黑色
  眼内裁片覆盖静态高光，再将原稿白色高光裁片按指针方向移动 1–4px，不代码重画眼睛。
- `prefers-reduced-motion` 或 `html[data-motion=off]` 时立即停用帧容器位移，保持当前批准
  状态静态稿。

验收：五个状态均能追溯到母版固定坐标；静态 HTML 只包含批准素材图片而不含 Canvas；
登录页与空态不得出现代码重绘角色；亮色、暗色与 32/64/128/256 四档均无错误裁切、
底色方格或透明边缘光晕。

---

## 28. v2.16 浮层统一真实内容像素波前

用户确认 §26.2 的边缘信号只是独立装饰，未真正驱动内容显现。本节完整取代
`PixelSurfaceReveal` 与旧 `MotionSequence`，并把 Dialog、AlertDialog、Sheet 收口到
唯一实现 `PixelDialogMotion`。

- **基础组件强制接入**：`DialogContent`、`AlertDialogContent`、`SheetContent` 在组件层
  直接挂载 `PixelDialogMotion`，业务调用方不存在动效开关或旧实现回退路径。
- **真实内容参与**：标题、正文、操作区通过 `clip-path` 穿过同一组固定 polygon 关键帧；
  不叠加轨道、端点、脉冲头、Canvas 或其它视觉 DOM。
- **固定八段波前**：垂直方向划分八个水平区段，每段的横向推进距离刻意不同；五帧保持
  相同顶点数以连续插值，最后一帧全部到达 100%。
- **节拍**：标题 100ms、正文 150ms、操作区 220ms 启动；单段 500ms linear，最晚约
  720ms 完成。恒速用于保留可见中间帧，外壳仍以 300ms 快速建立。
- **自动分区**：各类 Header / Footer 由基础组件登记；未显式标记的直属内容自动归入
  body。特殊复杂表单可显式写 `data-pixel-dialog-stage`，但不得嵌套第二套时间轴。
- **抽屉**：Sheet 保留真实停靠边的 300ms 位移，仅内容使用同一波前，不改变布局方向。
- **降级**：`prefers-reduced-motion` 或 `html[data-motion=off]` 时 clip-path、transform 与
  opacity 立即复位，信息顺序、焦点和操作能力不变。

验收：源码中不存在 `PixelSurfaceReveal`、`MotionSequence`、relay 样式或可选旧 preset；
任意基础浮层触发后实际内容在中间帧被不规则波前裁切；结束态无残留装饰节点；Escape
关闭后焦点返回触发器，亮色、暗色和动画关闭三种模式均正常。
