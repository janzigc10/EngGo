# Wordbook Learn/Review Experience Polish V1

## 背景

Wordbook Learn/Review V1 已经具备可用的 client-only 闭环：CET-6 source-backed 词书、本地进度、确定性四选一干扰项、Learn / Review session 状态机，以及 dashboard 入口。

但当前版本仍是体验粗糙的迭代分支，不建议 merge 主线。下一轮目标不是 UI 精修，而是把背词手感收紧：Learn 负责把新词推过三颗绿灯，Review 负责快速验收已学词，失败词短间隔回炉但不原地惩罚。

## 已验证现状

截至 2026-05-30，当前分支为 `codex/wordbook-learn-review-v1`：

| 区域 | 当前行为 | 缺口 |
|------|----------|------|
| Learn 目标词数 | `src/features/wordbook/session-engine.ts:98` 的 `selectLearnProgress(...).slice(0, 10)` | 每组学习词数写死为 10。 |
| Review 目标词数 | `src/features/wordbook/session-engine.ts:110` 的 `selectReviewProgress(...).slice(0, 10)` | 每组复习词数也写死为 10。 |
| Session 创建 | `src/features/wordbook/study-session.tsx:30` 的 `StudySession` 创建 session 时没有目标词数参数 | 无法在 session 开始时冻结用户选择的 10/20/30。 |
| 进度显示 | `src/features/wordbook/study-session.tsx:92` 使用 `completedTargetLemmas.length / totalTargets` | 这个口径是对的，应继续表示“已通过目标词 / 本轮目标词”，不是曝光次数。 |
| Learn 失败 | `src/features/wordbook/session-engine.ts:307` 的 `failCurrentTarget` 在失败 3 次后会结束目标词 | 失败不应因为次数累积而自动完成或 block。 |
| Review 失败 | `src/features/wordbook/session-engine.ts:621` 的 `markForgotten` 会进入 `forgotDetail -> recognitionChoice -> finalRecall` | Review 失败应留在 Review 内短间隔重测，不复用 Learn 链路。 |
| Review 到 Learn 泄漏 | `src/features/wordbook/session-engine.ts:101` 的 Learn 队列包含 `lapsed` | Review 失败词不能因为到期就进入 `/learn`。 |
| 卡片阶段 | `src/features/wordbook/wordbook-types.ts:50` 共享 Learn / Review stages | 需要新增错因对比阶段，并让详情深度更明确。 |

## 产品决策

### 1. Learn 仍是三颗绿灯

Learn 只负责新词或仍在学习中的词。一个目标词必须完成三次成功判断才算本轮学会：

1. 第一灯：四选一释义识别。
2. 第二灯：带轻提示的回忆。
3. 第三灯：最终无提示确认。

失败规则统一为：

- 失败不降级。
- 失败不清空已有绿灯。
- 失败只是不涨灯。
- 当前灯位短间隔回炉。

具体参数：

| 当前灯位 | 失败后间隔 | 回炉后阶段 |
|----------|------------|------------|
| 第一灯 | 间隔 2 张其他卡 | 仍为第一灯 |
| 第二灯 | 间隔 3 张其他卡 | 仍为第二灯 |
| 第三灯 | 间隔 3 张其他卡 | 仍为第三灯 |

第三灯失败不能退回第二灯。失败多次也不能自动完成或 block 目标词。

### 2. Learn 三灯详情分层

三颗绿灯后的详情页不应完全相同。详情深度应随灯位递进。

| 成功阶段 | 详情内容 |
|----------|----------|
| 第一灯成功 | 核心释义 + 1 个例句，如果例句可用。 |
| 第二灯成功 | 核心释义 + 1 个例句 + 搭配 / 常见表达，如果可用。 |
| 第三灯成功 | 当前词条完整信息：全部释义、例句、搭配，并给出本轮已通过确认感。 |

本轮不新增词库字段，只使用现有 `WordbookEntry` 字段：`meaningsZh`、`examples`、`collocations`。

### 3. Review 初始是一灯快速验收，失败后进入 Review 内补救

Review 不是第二套 Learn。它的正常入口只判断已学词还记不记得；但如果用户在 Review 中点“不确定 / 不认识 / 忘记”，这个词不能只回到同一个自测判断，而要在 Review 板块内降回一个轻量补救链路。

规则：

- Review 从 hidden self recall 开始。
- 用户只做一次判断：认识，或不确定 / 不认识 / 忘记。
- 认识：展示 review detail，然后通过目标词并安排下一次复习。
- 不确定 / 不认识 / 忘记：记录 lapse 信号，展示详情，然后在 Review 队列里短间隔回炉到四选一识别。
- Review 失败后的补救链路仍属于 Review mode，不进入 `/learn` 入口，不被 Learn 队列消费。
- 补救第一段：四选一识别，选对后展示详情，再短间隔进入带提示回忆。
- 补救第二段：带轻提示 / 例句的回忆确认，认识后展示详情，再短间隔进入最终确认。
- 补救第三段：无提示最终确认，认识后展示 review detail，再通过目标词。
- 补救链路任一阶段失败：展示对应详情，然后仍在当前 Review 补救阶段短间隔回炉，不降到 Learn。
- 如果用户在补救链路中途退出，保存的 `reviewLapsed` 下次进入 Review 时继续补救：0 灯未过则回四选一，1 灯已过则回带提示回忆，2 灯已过则回最终确认。
- Review 失败词不能因为失败而出现在 `/learn`。
- Review 回炉后如果补救通过，本轮算完成，但下次复习间隔要短于干净通过。

实现口径：

- 本轮先用 `wrongCount` 增加和 `reviewStrength` 降低记录 lapse，不新增复杂用户模型。
- Review 失败词应保持 Review 所有权。不要继续使用会被 Learn 队列消费的状态。
- 干净通过可以 `reviewStrength + 1`，最高 3。
- 失败后补救通过建议按 strength 1 安排下次复习；如果当前 strength 更低，则保持更短间隔。

### 4. 选错要先展示错因对比

失败分两类：

| 失败类型 | 反馈方式 |
|----------|----------|
| 主动失败：看答案 / 不认识 / 忘记 | 直接进入详情页，不做羞辱式错误提示。 |
| 选择错误：四选一选错释义 | 先展示错因对比页，再进入详情页。 |

错因对比页必须展示：

- 用户选中的释义。
- 正确释义。
- 如果错误选项来自另一个词，展示该干扰词。

用户点继续后进入当前阶段对应的详情页，然后该词按当前灯位短间隔回炉。

### 5. 每组词数放入学习设置

每组学习/复习词数不是用户系统能力，而是学习引擎参数。本轮应放入轻量学习设置，不做完整个人中心。

设置项：

- 每组学习单词量：10 / 20 / 30。
- 每组复习单词量：10 / 20 / 30。
- 默认：10 / 10。
- 本地保存。
- session 开始时读取。
- session 进行中不动态改分母。
- 变更设置只影响下一轮 session。

建议本地 key：

```ts
export const wordbookStudySettingsStorageKey = "enggo.wordbookStudySettings.v1";
```

建议类型：

```ts
export type StudySessionGoal = 10 | 20 | 30;

export type WordbookStudySettings = {
  learnTargetCount: StudySessionGoal;
  reviewTargetCount: StudySessionGoal;
};
```

入口放在 Learn / Review dashboard 的“学习设置”中，不做头像、会员、装备、外观或完整用户设置页。

## 技术设计

### Session Engine

`CreateSessionInput` 增加 `targetCount`：

```ts
type CreateSessionInput = {
  wordbook: Wordbook;
  progressRecords: WordStudyProgress[];
  now: Date;
  sessionId: string;
  targetCount: StudySessionGoal;
};
```

`selectLearnProgress` 和 `selectReviewProgress` 必须使用 `targetCount`，不再写死 `10`。

Learn 失败处理应保留当前 target 和当前 `resumeStage`，根据当前灯位计算延迟：

| 当前 Learn stage | delay | resume stage |
|------------------|-------|--------------|
| `recognitionChoice` | 2 exposures | `recognitionChoice` |
| `guidedRecall` | 3 exposures | `guidedRecall` |
| `finalRecall` | 3 exposures | `finalRecall` |

Review 失败处理只允许留在 Review 队列。失败详情之后应回到 Review-owned `recognitionChoice`；四选一通过后进入 Review-owned `guidedRecall`；带提示回忆通过后进入 Review-owned `finalRecall`；最终确认通过才完成本轮目标。实现上可以复用 `recognitionChoice` / `guidedRecall` / `finalRecall` stage 名称，但 `state.mode` 必须保持 `review`，并且失败词不能被 `/learn` 消费。

### State Types

为错因对比增加可渲染状态，避免 UI 依赖已过期的四选一临时结构。

建议结构：

```ts
export type StudyMistake = {
  selectedMeaning: string;
  correctMeaning: string;
  selectedLemma?: string;
};
```

可以放在 `StudySessionState` 或当前 target 上：

```ts
lastMistake?: StudyMistake;
```

新增明确阶段，例如：

```ts
"wrongChoiceContrast"
```

### UI Components

`StudySession` 应接收冻结后的目标词数：

```ts
type StudySessionProps = {
  mode: StudyMode;
  targetCount: StudySessionGoal;
  onExit: () => void;
};
```

dashboard 负责读取本地学习设置并传入：

- `/learn` 使用 `learnTargetCount`。
- `/review` 使用 `reviewTargetCount`。

学习设置可以拆为两个小模块：

- `wordbook-study-settings-store.ts`
- `wordbook-study-settings-panel.tsx`

### Progress Semantics

继续使用：

```ts
completedTargetLemmas.length / totalTargets
```

不要把曝光次数、错误次数、详情页查看次数或回炉次数计入完成进度。

## 验收标准

1. Learn session 可以按本地设置启动 10、20 或 30 个目标词。
2. Review session 可以按本地设置启动 10、20 或 30 个目标词。
3. session 创建后目标词数固定，设置变更只影响下一轮。
4. Learn 第一灯失败后仍停在第一灯，并短间隔回炉。
5. Learn 第二灯失败后仍停在第二灯，并短间隔回炉。
6. Learn 第三灯失败后仍停在第三灯，并短间隔回炉。
7. Learn 多次失败不会自动完成或 block 目标词。
8. Learn 第一、第二、第三灯成功后的详情内容深度不同。
9. Review 干净认识路径只做一次自我判断，展示详情后完成。
10. Review 不确定 / 不认识 / 忘记路径留在 Review，并短间隔回炉到四选一识别，再经过带提示回忆和无提示最终确认后完成。
11. Review 失败词不会因为失败而出现在 `/learn`。
12. 四选一选错后先展示用户所选释义、正确释义和干扰词，再进入详情。
13. 主动失败动作直接进入详情，不展示错因对比页。
14. 进度显示保持为“已通过目标词 / 本轮目标词”，例如 `4 / 20`。
15. 现有收藏页、聊天链路和词书进度摘要不发生无关变化。

## 测试计划

| 层级 | 测试内容 |
|------|----------|
| Unit | session engine 使用 10/20/30 target count，不再写死 10。 |
| Unit | Learn 三个灯位失败后都保持当前灯位并按规则回炉。 |
| Unit | Learn 重复失败不会完成或 block 目标词。 |
| Unit | Review 不确定 / 忘记路径在 Review 内回炉到四选一识别，随后进入带提示回忆和无提示最终确认，三灯补救通过后完成。 |
| Unit | Review 补救通过的下次复习间隔短于干净通过。 |
| Unit | 选错动作能保存错因对比数据。 |
| Component | 学习设置面板能保存学习/复习词数，dashboard 能读取。 |
| Component | StudySession 使用冻结目标词数并显示 `completed / target`。 |
| Component | 选错后先出现错因对比页，再进入详情页。 |
| Component | Learn 三个成功详情页内容深度不同。 |
| Browser QA | 390px 宽度下 Learn 设置为 20 后显示 `0 / 20`，选错出现错因对比，无横向溢出。 |
| Browser QA | Review 失败后仍留在 Review，且失败词隔其他卡后以四选一识别回来；识别通过后再做带提示回忆和无提示最终确认并完成。 |

## 非目标

- UI 视觉精修。
- 动效 polish。
- 完整 SRS 算法。
- 账号、云同步、用户个人中心。
- 每日计划或日历提醒。
- 新官方词书。
- 收藏词自定义词书。
- 不背单词截图里的发音、拼写、助记顺序、学习提醒、学习模式、同步学习数据等完整设置。
- `/api/chat`、FastAPI、Prisma、provider prompts 或 `enggo.collectedWords` schema 改动。
- merge 主线。

## 回滚策略

本轮仍是 client-only。若体验打磨引入明显回归，直接 revert 对应分支 commit。学习设置使用新 localStorage key，现有 word progress records 继续可读，不需要数据迁移。

## 建议执行顺序

1. 新增本地学习设置 store 和测试。
2. 将 `targetCount` 贯穿 dashboard、`StudySession` 和 session engine。
3. 调整 Learn 失败回炉语义。
4. 将 Review 失败改为 Review-owned requeue。
5. 增加选错对比状态和 UI。
6. 按三灯拆分 Learn 详情内容。
7. 跑 focused unit/component tests、lint 和浏览器 QA。
