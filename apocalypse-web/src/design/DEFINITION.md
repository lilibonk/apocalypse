# Apocalypse Web 设计定义

本文件记录**当前**管理台视觉与交互规则；[前端 AGENTS.md](../../AGENTS.md) 执行代码边界，[tokens.css](tokens.css) 提供主题值，[MOTION.md](MOTION.md) 定义动效时序。旧版 Mint Bonk 和登录 PixelWave 的决策保留在 Git 历史及产品知识库，不适用于现行实现。

## 工作台与表面层级

- 页面只有一个一级标题和一句面向业务用户的说明；上下文与操作形成独立工具栏，主工作区随后展开。短编辑/确认使用 Dialog，长详情与关联信息使用 Sheet，关闭后焦点返回触发器。编辑、复核、历史属于不同任务，用有名称的 Tabs 或主辅栏分开；历史来源与校验信息默认折叠。
- 上下文工具栏、分区标题、字段组和操作栏构成层级；同一操作区只强调一个主操作，危险操作独立确认，字段标签不能用 placeholder 代替。标准枚举、日期与月份使用共享选择组件。月格只展示短信息，完整值与来源进入详情。
- 数据表面（表格、表单、权限树、审计、对话框）保持可读且稳定，采用 shadcn/new-york 语义 token。品牌表面限登录舞台、加载、空态、进度和一次性结果反馈；不得将吉祥物或装饰动效常驻数据正文。
- 首次进入工作台时侧栏目录收起；深链只展开当前目录。选中、hover 与键盘焦点要可辨。验收覆盖真实浏览器的空态/有数据、明暗主题、窄屏、键盘与浮层焦点恢复。

## 品牌签名、网格与颜色

- 正式签名是静态图形标加 APOCALYPSE 字标，用于 favicon、侧栏、登录页首和署名；吉祥物只承担登录与状态反馈，不充当 logo。
- 品牌容器、位置与间距按 4px 整数格组织；史莱姆的实时表面形变不做像素量化。数据表面使用 `--background`、`--foreground`、`--border` 等语义 token；品牌主色固定 mint，经 `--brand` 映射到 `--primary` / `--ring`。成功、警告、危险保持独立语义色。
- 明暗主题所有新增颜色成对定义。开发态 accent 仅用于数据表面实验，不改变正式品牌色、史莱姆材质或静态海报。史莱姆 sRGB 材质色与星环色集中于 [tokens.css](tokens.css) 的 `--slime-*`，几何、物理和灯光参数留在 [WebGPU 实现](../effects/webgpu/slime/) 内。

## 当前吉祥物：WebGPU 史莱姆

- [PixelOrb](../effects/PixelOrb/) 是兼容入口，委托 `effects/webgpu/slime/`；现行第二版依据 `yuanyang749/softie-webgpu@977a608` 的角色网格与动效适配，原始 MIT 归属见[随附许可](../../public/licenses/softie-webgpu.txt)。当前轮廓圆润尖顶，两只黑豆眼、小嘴与 116 枚内部气泡共享形变场；保留青绿亮色与冰翡翠暗色。五种宿主状态为 `idle / waiting / success / error / sleeping`，状态表情优先于玩耍反馈。
- 局部揉捏、入场双跳、眨眼/gaze、抓取与释放、落地挤压、摇晃后眩晕的五枚立体星环属于现行交互。脸与身体不可分离；气泡细小、非金属、缓慢上浮，随软体形变并在边缘淡出。键盘焦点可见，鼠标按压不产生键盘焦点框。
- 合法尺寸为 **384 / 256 / 128 / 64 / 32**。384/256 的可见交互舞台按需加载 Three.js WebGPU；128/64/32、动效关闭、缺少 WebGPU、初始化失败或设备丢失时展示同源静态海报。无 WebGL fallback；隐藏/离屏暂停，卸载释放监听、观察器、rAF 与 GPU 资源。密码框聚焦时以闭眼状态回避，不改变认证流程。
- 登录只展示透明 WebGPU 史莱姆、静态品牌签名与数据表单，不挂载 PixelWave。PixelWave 铅字浪潮仅在开发态动效实验室以默认关闭开关预览，关闭或收起即卸载。旧 Mint Bonk 素材和 skin 导出只为历史兼容保留，不进入当前产品渲染。

## 动效与验收

- 普通反馈优先 CSS，通用 UI 编排使用 motion；品牌史莱姆限 WebGPU 域。Dialog / AlertDialog / Sheet 由 `PixelDialogMotion` 分拍揭示真实标题、正文与操作区，不叠加装饰轨道、全表面遮罩或空白等待。PageLoading/按钮进度继续使用 PixelScale；数据表面的 loading 使用中性 Skeleton。
- `prefers-reduced-motion` 和全局动画开关同时生效：关闭时静态呈现，不创建史莱姆 GPU 或 PixelWave rAF。视觉修改须复核亮/暗、窄屏、键盘、降级与状态切换；WebGPU 修改另保留实际设备和时长明确的性能记录。`pnpm check` 通过不代替浏览器视觉验收。
