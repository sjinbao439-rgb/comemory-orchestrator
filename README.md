# 叙旧 

将长辈与年轻人的口述回忆整理为有原话依据的动态视频制作计划。这个 Codex skill 处理背景建档、转写结果整理、事件与分镜提取、讲述节奏对齐、首帧和视频提示词、任务状态及补充纠正。

**当前范围：**仓库提供编排规范、输入输出契约、示例和 Node.js 校验脚本。语音转写、图像与视频生成、媒体处理及归档需要由接入项目实现；仅使用本仓库不会直接生成视频。

## 使用

将仓库克隆到 Codex 的 skills 目录：

```bash
git clone https://github.com/sjinbao439-rgb/comemory-orchestrator.git ~/.codex/skills/comemory-orchestrator
```

在 Codex 中提出口述回忆编排任务，或指定使用 `comemory-orchestrator`。从 [SKILL.md](SKILL.md) 阅读九个处理环节；接入项目时再参考 [输入输出契约](references/contract.md)和[服务接入方案](references/providers.md)。

## 校验与示例

脚本使用 Node.js 标准库，无须安装 npm 依赖。在仓库根目录运行：

```bash
node --test scripts/*.test.cjs
node scripts/timing.cjs examples/timing.input.json
node scripts/jobs.cjs tasks examples/jobs.input.json
node scripts/validate.cjs examples/jiangnan.input.json examples/jiangnan.plan.json
```

`examples/` 存放输入与计划示例；`evals/` 存放技能评估样例及结果；`references/` 存放流程、契约、服务接入和验证规范；`scripts/` 存放计时、任务状态和计划校验脚本。
