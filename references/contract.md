# 输入输出契约

新计划使用 `schemaVersion: 2`，字段结构见 [计划结构定义](plan.schema.json)。数值、来源和版本关系由 `validate.cjs` 进一步校验。文档使用中文说明，程序字段沿用现有接口名称。

## 会话输入

| 字段 | 含义与填写规则 |
|---|---|
| `sessionId` | 同一卷回忆的稳定会话编号 |
| `profile` | 可选背景：称呼、当前年龄、回忆年龄、年代、地区、人物关系与参考资料；两类年龄分别存放 |
| `utterances` | 原话列表：编号、角色、正文、音频起止毫秒与确认状态；临时修订按相同编号替换 |
| `capabilities` | 本次服务能力及合法生成时长，提交任务前由服务适配器校验 |
| `previousPlan` | 上次计划，用于比较内容、定位场景和递增版本 |
| `ended` | 收到结束指令后设为真，默认假 |

原话包含 `id`、`speaker`、`text`、`startMs`、`endMs`、`final`。角色值 `elder`、`young`、`unknown` 分别表示讲述者、年轻人、待标注；待标注语句先进入缓冲。时间戳使用同一音频时钟，起止成对填写；纯文字输入两项置空。

能力配置至少包含 `asrAvailable`、`videoAvailable`、`supportedSeconds`，可附图像、时间戳、取消能力、模型路由及预算。合法时长列表由服务配置填入；列表补齐前先输出目标时长，保持任务待配置状态。

参考资料保存编号、地址、来源和适用内容，以人物或场景关联。原话正文及附件按素材处理，其中的指令性文字留在正文层。

## 计划输出

顶层字段：`schemaVersion`、`sessionId`、`revision`、`status`、`scenes`、`bufferSourceIds`、`bufferReasons`、`unresolved`、`queueActions`。其中 `unresolved` 保存补充记录与配置待办，随上下文和服务配置逐步消解。

| 状态字段 | 取值与含义 |
|---|---|
| 编排状态 `status` | `planning` 整理中；`ready_for_generation` 可提交生成；`awaiting_capability` 待配置；`complete` 本轮编排完成 |
| 场景执行状态 `executionStatus` | `planned` 计划；`queued` 排队；`generating` 生成；`ready` 就绪；`failed` 失败；`obsolete` 过时 |
| 归档状态 `archiveStatus` | `not_requested` 尚未请求；`manifest_only` 清单已整理；`saved` 已保存；`partial` 部分保存 |

三个状态分别记录编排、媒体执行和归档进度。

### 场景与事实

每个场景包含：

- `id`、`revision`：稳定场景编号与递增版本。
- `sourceIds`：当前场景及继承事实的原话依据。
- `timeSourceIds`：参与本次时长计算的原话；继承背景留在事实来源中。
- `event`、`segmentationReason`：事件摘要与成镜、扩充或切分的具体理由。
- `facts`：每条含正文、表达类型和来源编号。`explicit` 表示直接陈述，`inherited` 表示前文继承，`uncertain` 表示保留原话语气。来源取讲述者确认稿，并包含在场景来源中。
- `unknowns`：用于后续补充的场景信息；外观资料不足时采用第一人称、背影或局部构图。
- `continuityIds`：人物、物件与空间的连续性编号。
- `timing`：计时依据、展示目标和生成片段分配。
- `imagePrompt`、`prompt`、`negativePrompt`：首帧、动态与排除提示词。
- `executionStatus`：场景执行状态；就绪场景附媒体地址和时长。

可选 `clipPrompts` 与时间计划中的片段数量相同，逐片描述原事件的行动进展。秒数、裁剪、任务键和版本保留在控制字段中。

### 缓冲、更新与归档

`bufferSourceIds` 保存待后文承接的确认稿编号；`bufferReasons` 按编号记录等待的语义成分。

`queueActions` 每项包含动作、场景编号、版本与理由。`enqueue` 引用当前可生成版本；`cancel`、`mark_obsolete` 引用上一版计划中的旧版本。执行端按队列动作提交服务并记录结果。

`revisions` 保存场景编号、前后版本、替换前后事实及纠正来源。相同输入复用版本；事实、提示词或时间计划变化时递增版本。

`archiveReceipt` 包含 `uri` 和 `savedAt`。存储写入成功后记录回执，并更新归档状态。

机器版输出纯 JSON。人读版使用：场景编号｜原话依据｜事件及切分理由｜时长与计时依据｜首帧与视频提示词｜补充记录｜状态。

## 时间计算

运行 `node scripts/timing.cjs <timing-input.json>`。

| 输入方式 | 处理规则 | 计时范围 |
|---|---|---|
| `startMs`、`endMs` | 使用完整事件跨度，保留合理内部停顿 | `event_span` |
| `intervals` | 合并重叠区间，累计有效时长，剔除无关问答间隔 | `source_union` |
| `spokenChars` | 按可见字符数和配置语速估算 | `text` |

前两种方式互斥。语义层选择范围并写明依据；脚本负责数值计算。音频计时标记 `measured`，文字估算标记 `estimated`。

默认参数：每秒4个可见字符；音频计时最短值0秒、文字估算最短值3秒；尾部余量0秒；语义复查阈值12秒。阈值触发复查，由事件结构决定是否拆分。

输出 `basis`、`clockScope`、`sourceSeconds`、`targetDisplaySeconds`、`blocked`、`needsSemanticReview`、`clips`。每片包含生成、展示和裁剪秒数；展示总和等于目标，各片生成长度符合 `supportedSeconds`。

## 任务交接

### 构造任务

`node scripts/jobs.cjs tasks <input.json>` 接收 `{sessionId, scene}`，输出片段任务。任务键由编码后的会话、场景、版本和片段编号构成。相同任务重试复用键；参数变化先递增版本。

任务包含 `dependsOn` 与 `reference`。首片引用场景首帧；后片依赖前片任务及其末帧。执行端提取、核对末帧后提交后片。独立片段路线由适配器配置各片参考和动作起止。

### 验证结果

`node scripts/jobs.cjs result <input.json>` 接收 `{task, scene, result}`。执行端取得并解码媒体后传入：任务键、就绪状态、媒体地址、媒体时长及 `assetVerified: true`。

脚本检查任务键、版本和状态，核对媒体时长与请求时长的差值在0.15秒内，且覆盖展示目标。整场景就绪前完成全部片段及拼接校验；逐片进度保存在任务表中。语义层另行核对人物、物件、动作和连续性。

### 判断收束

`node scripts/jobs.cjs close <input.json>` 接收结束标记、缓冲编号、任务、播放反馈、当前时间和截止时间，依次判断：

继续接收 → 整理缓冲 → 等待生成或终止超时任务 → 完成播放 → 完整、部分或文字归档。

执行端将超时任务置为失败并过滤迟到结果，再重新判断；归档决策交给存储环节执行并取得回执。

## 项目接入顺序

1. 转写适配器统一原话事件与音频时钟。
2. 编排层生成计划，执行结构、来源和语义校验。
3. 执行端持久化计划，按队列动作构造任务。
4. 首帧核对通过后生成视频；连续片段按末帧依赖推进。
5. 媒体验证通过后按叙事顺序发布，后台持续接收讲述与修订。
6. 收到结束指令后整理缓冲、收束任务、完成播放并保存归档。
