# Conversational Learning Context Design

## 背景

EngGo 的产品形态是聊天主舞台加二级学习骨架。前几轮已经把普通查词、形近/易混召回、direct compare、word family、meaning lookup、ECDICT-first fallback 和收藏生词本打到可维护状态。现在最大的产品风险不再是单轮检索是否能命中，而是用户追问时系统像重新开了一轮：`第二个呢`、`这个怎么用`、`这组怎么背`、`换成考研范围` 这类自然学习动作无法稳定承接。

这会削弱 EngGo 的核心心智。用户不是只想得到一次查词结果，而是希望围绕一个记不清、容易混、需要背的英语问题持续推进。多轮能力因此应该成为聊天主舞台的一层基础能力，而不是收藏页或复习页之后的附属优化。

## 目标

1. 让 EngGo 能在同一学习话题内记住上一轮回答的主词、候选组、当前词书、任务类型和可继续动作。
2. 把常见追问解析成明确的学习请求，而不是把 `这个`、`第二个`、`这组` 全交给模型自由猜。
3. 保持现有检索和回答边界：普通查词仍走 deterministic lookup，形近/词族/中译英仍走对应 grounding，provider 只负责需要自然表达的部分。
4. 让用户在 UI 上感到系统正在跟着当前词或当前词组，而不是每轮都像从零开始。
5. 为后续收藏、复习、个人长期记忆铺路，但第一阶段只做短期会话上下文。

## 非目标

1. 不在第一版做跨会话长期记忆。
2. 不做完整个人学习画像、自动学习计划或复杂复习算法。
3. 不做开放式 Agent，不让系统自动拆解多步任务并长期执行。
4. 不支持多个学习主题并行追踪；第一阶段只跟踪最近一个可追问的学习话题。
5. 不用 prompt 去掩盖 retrieval 边界；上下文解析后仍应回到现有 lookup / compare / broad grounding。
6. 不把 ECDICT 改名成 structured，不改变 ECDICT-first + optional structured overlay 的方向。

## 产品原则

### 1. 不追求“全能记忆”，先追求不断片

第一阶段的价值是让追问能动起来。用户问 `第二个是什么意思` 时，系统至少知道上一轮候选组里的第二个词是什么；解析不了时反问，而不是发呆或胡猜。

### 2. 上下文是产品状态，不是模型自由文本

会话上下文应从上一轮 structured response 中提取，而不是只依赖历史聊天文本。系统要保存可追踪对象：主词、候选词、compare 对象、source identity、当前范围和可继续动作。

### 3. 追问先解析，再路由

`第二个怎么用` 不是一个普通用户 query。它应先解析到具体 lemma，再转成 `assess 怎么用` 这类完整请求，随后走 ordinary lookup 或 provider-backed usage answer。

### 4. 用户可感知系统跟着谁

如果系统内部知道当前聚焦词是 `assess`，UI 也应该轻量提示这一点。否则多轮能力即使存在，用户也不容易信任。

### 5. 失败要比乱答更好

上下文缺失、指代不清、上一轮没有候选列表或当前范围无结果时，应给出短反问或短说明。不能为了显得智能而猜一个弱相关答案。

## 能力全景

Conversational Learning Context 包含四层：

1. **Context Capture**：每轮回答后，从 response grounding 和 rendered answer 中提取可追问状态。
2. **Follow-up Resolver**：下一轮输入到来时，判断是否依赖上一轮，并解析指代、范围切换和动作。
3. **Resolved Query Routing**：把追问改写成完整学习请求，再进入现有 normalize / lookup / grounding / provider 流程。
4. **Context-Aware UX**：在聊天界面中提示当前追问对象，并把收藏、继续解释、复习入口绑定到明确对象。

```text
用户输入
  -> Follow-up Resolver
       -> 不依赖上下文：走现有 query normalization
       -> 依赖上下文且可解析：生成 resolved query
       -> 依赖上下文但不清楚：返回 clarification
  -> Existing Retrieval / Answering
  -> Response Context Capture
  -> UI 显示当前上下文与可继续动作
```

## 上下文模型

建议新增一个短期会话状态对象。第一阶段可存在客户端 session state 或 chat session state 中，不需要入库。

```ts
type ConversationalLearningContext = {
  version: 1;
  activeExamTarget: ExamTargetCode;
  sourceMessageId: string;
  topicKind:
    | "standard_lookup"
    | "direct_compare"
    | "shape_neighbors"
    | "word_family"
    | "meaning_lookup"
    | "form_filter"
    | "broad_vocab"
    | "plain";
  focus: LearningFocus | null;
  candidates: LearningCandidateRef[];
  groups: LearningGroupRef[];
  availableActions: LearningFollowUpAction[];
  expiresAfterTurns: number;
};
```

### LearningFocus

```ts
type LearningFocus = {
  kind: "lemma" | "phrase" | "candidate_group" | "meaning_candidate";
  label: string;
  lemma?: string;
  index?: number;
  sourceKind?: string;
  partOfSpeech?: string;
  meaningZh?: string;
};
```

### LearningCandidateRef

```ts
type LearningCandidateRef = {
  index: number;
  lemma: string;
  label: string;
  sourceKind?: string;
  partOfSpeech?: string;
  meaningZh?: string;
  sourceMessageId: string;
};
```

### LearningFollowUpAction

```ts
type LearningFollowUpAction =
  | "explain_meaning"
  | "show_usage"
  | "compare"
  | "show_more"
  | "switch_scope"
  | "collect_one"
  | "collect_group"
  | "review_later";
```

## Context Capture

每次 assistant 返回后，系统尝试生成新的上下文：

- 普通查词：focus 是主 lemma，candidates 通常只有一个。
- direct compare：focus 是 candidate group，candidates 是用户点名词。
- shape neighbors：focus 是 seed 或候选组，candidates 是返回的形近/易混候选。
- word family：focus 是 seed，candidates 是派生/同根候选。
- meaning lookup：focus 是中文 meaning hint 或主候选英文词，candidates 是中译英候选。
- broad form filter：focus 是 form constraint，candidates 是主候选列表。
- no-match/plain：默认不产生可追问 context，除非 response 明确包含 spelling candidates。

Context Capture 不应该从自然语言答案里猜全部实体。优先使用现有 response grounding、mainAnswer、broadAnswerPlan、learningIntentPlan、candidate metadata 和 answer actions。

## Follow-up Resolver

Resolver 的任务是把短追问变成完整请求，或者给出 clarification。

### 可支持的指代

第一阶段优先支持：

- `这个`、`它`、`刚才那个`
- `第一个`、`第二个`、`第三个`、`最后一个`
- `这组`、`这几个`、`上面那几个`
- `刚才那个词`、`刚才那组词`

### 可支持的动作

第一阶段优先支持：

- `是什么意思`
- `怎么用`
- `怎么区分`
- `怎么背`
- `还有吗`
- `换成高考/四级/六级/考研`
- `只看高考/四级/六级/考研`
- `收藏这个`
- `收藏第二个`
- `把这组都收藏`

### 解析示例

```text
上一轮：access assess excess 怎么区分
追问：第二个是什么意思
resolved query：assess 是什么意思
```

```text
上一轮：给我几个跟 evaluate 易混的单词
候选：evaluate, evacuate, escalate, graduate
追问：第二个怎么用
resolved query：evacuate 怎么用
```

```text
上一轮：response 的派生词
候选：respond, response, responsive, responsible, responsibility
追问：把这组都收藏
resolved action：collect_group(respond, response, responsive, responsible, responsibility)
```

```text
上一轮：遵循的英文是什么
候选：obey, follow, observe
追问：还有更适合作文的吗
resolved query：在上一轮候选基础上解释哪个更适合作文语境
```

## Resolved Query Routing

Resolver 不直接回答。它只输出一个明确的请求对象：

```ts
type ResolvedFollowUp =
  | {
      kind: "resolved_query";
      query: string;
      activeExamTarget: ExamTargetCode;
      targetRefs: LearningCandidateRef[];
      reason: string;
    }
  | {
      kind: "resolved_action";
      action: LearningFollowUpAction;
      targetRefs: LearningCandidateRef[];
      activeExamTarget: ExamTargetCode;
    }
  | {
      kind: "clarification";
      message: string;
      options: LearningCandidateRef[];
    }
  | {
      kind: "not_follow_up";
    };
```

然后进入现有流程：

- `assess 是什么意思` -> ordinary lookup
- `evacuate 怎么用` -> ordinary/use-case answer path
- `access assess excess 怎么区分` -> direct compare
- `这组怎么背` -> compare / study guidance presentation
- `换成考研范围` -> reuse previous intent + new activeExamTarget
- `收藏第二个` -> collection store action, not provider

## 模型边界

### Resolver 不应交给 provider 的部分

- 第几个候选对应哪个 lemma。
- 当前词书是什么。
- 上一轮候选列表是什么。
- 收藏哪个 lemma。
- 是否有上下文可用。

### 可以交给 provider 的部分

- 已经解析到明确词或明确词组后的自然语言解释。
- `怎么背` 这类学习建议，但必须限制在 targetRefs 内。
- `更适合作文吗` 这类语境建议，但必须基于上一轮候选和当前范围。

### 必须保持 deterministic 的部分

- 普通 exact lookup 基础释义。
- ECDICT/source fallback 的基础词义。
- direct compare 的主候选选择。
- shape neighbor / word family / meaning lookup 的候选边界。
- 收藏动作。

## UI 表达

第一阶段不需要大改 UI，但应让用户感知上下文：

- 在输入框附近或回答底部轻量显示 `正在追问：assess` 或 `当前词组：access / assess / excess`。
- 当 resolver 生成 clarification 时，显示可点击选项，而不是长段解释。
- 对支持动作保持简短按钮：继续解释、怎么用、收藏、收藏这组。
- 不要把上下文提示做成显眼卡片；它只是聊天主舞台的辅助状态。

## 失败策略

### 无上下文

用户直接问 `第二个是什么意思`，但当前没有可追问上下文：

```text
我还不知道你说的“第二个”是哪一个词。你可以把那组词再发我一下。
```

### 指代不清

上一轮有多个 group 或多个候选，用户说 `这个呢`：

```text
你指的是 access、assess 还是 excess？
```

### 上下文过期

如果中间已经隔了多轮无关聊天，不再强行沿用旧 context：

```text
刚才那组词我已经不确定了。你可以重新发一下要追问的词。
```

### 当前范围无结果

```text
当前词书里暂时没有稳定候选，我先不硬补。
```

## 阶段拆分

### V1：短期追问不断片

目标：让同一学习话题内的追问能动起来。

包含：

1. 保存最近一轮可追问 context。
2. 支持 `这个/它/第二个/这组` 的基础解析。
3. 支持 `是什么意思/怎么用/怎么区分/怎么背/收藏` 的基础动作。
4. 解析失败时反问。
5. 增加多轮 smoke matrix。

不包含：

1. 长期个人记忆。
2. 跨会话恢复。
3. 复杂复习状态。
4. 多主题并行。
5. 自动学习计划。

V1 的成功标准是：用户追问时不再像重新开了一轮，至少能接住上一轮的词、候选组和当前词书。

### V2：范围切换与学习动作增强

包含：

1. `换成考研范围`、`只看四级` 这类 scope switch。
2. `还有吗` 基于上一轮 task 继续扩展候选。
3. `这组怎么背` 生成受控学习建议。
4. 收藏动作和收藏页继续追问形成闭环。

### V3：个人长期记忆

包含：

1. 记住用户长期薄弱词。
2. 记住常见混淆模式。
3. 根据收藏和复习状态调整追问建议。
4. 跨会话恢复最近学习主题。

V3 必须在短期上下文稳定后再做，否则长期记忆会放大错误上下文。

## V1 验收样例

### 指代查词

```text
U1: access assess excess 怎么区分
A1: 返回三词辨析，context.candidates = [access, assess, excess]
U2: 第二个是什么意思
Expected: 解析到 assess，走 ordinary lookup，不重新解释 access 或 excess。
```

### 指代用法

```text
U1: 给我几个跟 evaluate 易混的单词
A1: 返回 evaluate/evacuate/escalate/graduate 等候选
U2: 第二个怎么用
Expected: 解析到 evacuate，回答 evacuate 用法。
```

### 词组追问

```text
U1: access assess excess 怎么区分
U2: 这组怎么背
Expected: 只围绕 access/assess/excess 给记忆建议，不补其它候选。
```

### 收藏指代

```text
U1: response 的派生词
U2: 把这组都收藏
Expected: 收藏上一轮派生词候选组，保留 partOfSpeech / meaningZh / sourceKind。
```

### 中译英追问

```text
U1: 遵循的英文是什么
U2: 还有更适合作文的吗
Expected: 基于上一轮中译英候选说明语体选择，不改走自由发散同义词清单。
```

### 无上下文

```text
U1: 第二个是什么意思
Expected: clarification，要求用户提供词组或选择对象。
```

## 测试策略

### Unit Tests

- Context capture 能从 ordinary lookup、direct compare、shape neighbors、word family、meaning lookup 响应中提取候选。
- Resolver 能解析序数、近指代、组指代和收藏动作。
- Resolver 对无上下文和歧义上下文返回 clarification。
- Resolved query 保留 activeExamTarget。

### Contract Tests

- `/api/chat` 或 chat session 层能在第二轮请求中携带/恢复 conversation context。
- resolved query 进入现有 query pipeline 后，不污染 ordinary exact lookup。
- collect action 不调用 provider。

### Smoke Matrix

最少覆盖：

1. `access assess excess 怎么区分` -> `第二个是什么意思`
2. `access assess excess 怎么区分` -> `这组怎么背`
3. `给我几个跟 evaluate 易混的单词` -> `第二个怎么用`
4. `response 的派生词` -> `把这组都收藏`
5. `遵循的英文是什么` -> `还有更适合作文的吗`
6. 无上下文下 `第二个是什么意思` -> clarification

## 文档与计划关系

本文档定义完整能力。后续 implementation plan 不应一次性实现所有内容，而应先切 V1：短期 context capture、follow-up resolver、基础 resolved query 和 smoke matrix。V2/V3 只能在 V1 通过真实聊天验证后继续推进。

## 新 Session 建议入口

继续该方向时先读：

1. `AGENTS.md`
2. `progress.md` 顶部当前阶段
3. 本文档
4. `docs/superpowers/specs/2026-04-21-exam-english-chat-design.md`
5. `docs/superpowers/specs/2026-05-16-collection-organizer-design.md`
6. `docs/superpowers/specs/2026-05-12-dynamic-light-grounding-design.md`

然后先写 implementation plan。第一刀只做 V1，不直接做长期个人记忆。
