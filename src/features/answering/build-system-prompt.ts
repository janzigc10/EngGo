import type { AnswerGrounding } from "@/features/answering/build-grounding";

function buildClusterLabelInstruction(grounding: AnswerGrounding) {
  const comparisonView = grounding.comparisonView;

  if (!comparisonView) {
    return "";
  }

  const labels = comparisonView.labels ?? [];
  const anchorPattern = comparisonView.anchorPattern
    ? `anchorPattern=${comparisonView.anchorPattern}`
    : "anchorPattern 未提供";
  const instructions: string[] = [];

  if (labels.includes("root_family")) {
    instructions.push(
      [
        `cluster 标签 root_family：这不是另开一个回答风格，而是在易混解团里补同根/共同片段视角；${anchorPattern}。`,
        "讲清共同片段为什么容易让人混，再落到每个词的现代考试义和词性边界；不要硬套词源，不要把范围外词扩进主答案。",
      ].join(""),
    );
  }

  if (labels.includes("shape_like")) {
    instructions.push(
      `cluster 标签 shape_like：必须点出形近/拼写边界，优先说明哪里看错、哪里拼错、靠什么搭配或词性分开；${anchorPattern}。`,
    );
  }

  if (labels.includes("meaning_near")) {
    instructions.push(
      "cluster 标签 meaning_near：重点讲中文近义里的使用边界，不要只重复同一个中文释义。",
    );
  }

  if (labels.includes("collocation_boundary")) {
    instructions.push(
      "cluster 标签 collocation_boundary：重点讲固定搭配、后接结构和场景题眼。",
    );
  }

  if (comparisonView.quickDistinction) {
    instructions.push(`优先吸收 quickDistinction：${comparisonView.quickDistinction}`);
  }

  if (comparisonView.examHook) {
    instructions.push(`优先吸收 examHook：${comparisonView.examHook}`);
  }

  return instructions.join("\n");
}

function buildStyleInstruction(grounding: AnswerGrounding) {
  if (grounding.answerStyle === "standard_lookup") {
    return [
      "普通查词模式：只回答用户当前问的词，不主动展开成易混组、词根家族或近义词列表。",
      "总长度控制在 180 个汉字以内，最多 3 段；不要使用横线、分隔线或标题装饰。",
      "按信息顺序组织：先解释当前词的核心义，再在有 grounding.confusionBoundary 时补一句边界，最后用建议的范围提醒轻量收束。",
      "不要把“主答案”“易混边界”“范围提醒”写成可见小标题，也不要用 Markdown 加粗来造小标题。",
      "核心义只用 grounding 里的主答案和易混边界，先给 lemma + 中文核心义。",
      "如果用户问“是什么意思”，不要补搭配；如果用户问“怎么用”且 grounding 主答案里明确给出搭配，才可写一个短搭配。",
      "短搭配只写 phrase=中文义，不要使用“如”“例如”“常用搭配如”引出搭配；即使用户问“怎么用”，也不要写完整英文句子。",
      "易混边界只有 grounding.confusionBoundary 有内容时才写，只写词义或词性差异，不写搭配、句子或括号例子；不要主动补充未召回的新词。",
      "没有 confusionBoundary 时直接省略边界，不要写“没有需要区分的易混词”。",
      "禁止例句、长列表、百科解释和主动扩展；不要主动输出下一步追问。",
    ].join("\n");
  }

  if (grounding.answerStyle === "root_family_summary") {
    return [
      "本风格优先于通用回答顺序，不要再套用通用四段标题。",
      "当前问题属于词根家族地图，必须明确写出“词根家族地图”。",
      "总长度控制在 280 个汉字以内，最多 4 段，不要写成长讲义。",
      "只输出这 4 段：碎片判断、家族地图、优先背、谨慎提醒。",
      "禁止例句、词源长故事和完整列表；每个成员只写“词 -> 现代义”一小句。",
      "优先背最多 2 个；其他成员只用“眼熟即可/不硬背”一句带过。",
      [
        "短答示例：",
        "碎片判断：stitute 不是完整单词，是“放置/建立”的构词部件。",
        "家族地图：in- 放进去 -> institute 设立/机构；con- 放一起 -> constitute 构成。",
        "优先背：institute / institution；constitute 眼熟即可。",
        "谨慎提醒：不是所有前缀组合都成立，不要硬凑。",
      ].join("\n"),
      "先解释这个碎片是不是完整单词，还是构词部件。",
      "必须按“前缀方向 -> 动作故事 -> 现代义”展开。",
      "必须写出“优先背”一段，只列最多 2 个最高优先级成员。",
      "只用一句话明确指出不成立、低频或不建议背的分支，不要硬凑。",
    ].join("\n");
  }

  if (grounding.answerStyle === "expression_recall") {
    return [
      "本风格优先于通用回答顺序，不要再套用通用四段标题。",
      "当前问题属于中文表达召回：用户先想到中文意思，需要找一组可用英文表达。",
      buildClusterLabelInstruction(grounding),
      "总长度控制在 240 个汉字以内，最多 4 段。",
      "只输出这 4 段：首选表达、可替换表达、使用边界、写作抓手。",
      "首选表达：先给当前考试范围内最稳的表达，优先带固定搭配。",
      "可替换表达：只列 grounding 里召回到的词，不要自由补新词。",
      "使用边界：讲语气、搭配或对象差异；不要把它写成易混词纠错课。",
      "写作抓手：给一句短策略，帮助用户在作文或翻译里选词。",
      "禁止例句、长列表、范围外扩展和主动追问。",
    ].join("\n");
  }

  if (grounding.answerStyle === "confusion_untangle") {
    return [
      "本风格优先于通用回答顺序，不要再套用通用四段标题。",
      grounding.queryMode === "shape_neighbor_search"
        ? "当前问题已经命中形近词簇检索，要把相近词当成一个易混解团来回答。"
        : "当前问题已经命中易混词对比视图，要把相近词当成一个易混解团来回答。",
      buildClusterLabelInstruction(grounding),
      "总长度控制在 260 个汉字以内，最多 4 段。",
      "只输出这 4 段：范围内相似词、词义速览、重点区分、做题抓手。",
      "范围内相似词：先列范围内召回到的相似词，并轻量说明它们都在当前考试范围内。",
      "词义速览：每个词必须带中文核心义，格式优先用 word=核心义；不能只列英文。",
      "重点区分：如果超过 2 个词，优先区分最容易混的 2 个，其余先给中文方向。",
      "做题抓手：只给最有用的词性、搭配或场景题眼。",
      "禁止例句、长列表和补充扩展；不要主动输出范围提醒或下一步追问。",
      "超过 2 个词时，用公式行压缩：word=核心义；word=核心义；word=核心义。",
      "不要使用 e= envelope 这类牵强字母口诀；优先用语义、词性、搭配和场景做边界。",
      [
        "短答示例：",
        "范围内相似词：stationary / stationery 都在当前范围，可一起看。",
        "词义速览：stationary=静止的；stationery=文具。",
        "重点区分：一个看状态，一个看物品；别用字母口诀硬记。",
        "做题抓手：文具=stationery；remain/keep + 不动=stationary。",
      ].join("\n"),
      "不要把回答写成泛泛词典百科。",
      "必须出现“范围内相似词”这一段，先告诉用户当前范围内召回到了哪些词。",
      "必须出现“词义速览”这一段，逐个给英文词和中文核心义。",
      "必须出现“重点区分”这一段，优先讲最容易混的 2 个。",
      "必须出现“做题抓手”这一段，点出考试里最该抓的搭配、场景或题眼。",
      "每个词只给一行边界，最后用一句短收束总结各词最核心的边界。",
    ].join("\n");
  }

  return grounding.comparisonView
    ? grounding.queryMode === "shape_neighbor_search"
      ? "当前问题已经命中形近词簇检索，优先先列出这组相近词，再说明为什么容易看错以及怎么区分。"
      : "当前问题已经命中易混词对比视图，优先用并列对比方式组织回答。"
    : "当前问题优先先给主答案，再补充易混边界。";
}

export function buildSystemPrompt(grounding: AnswerGrounding) {
  const usesSpecialAnswerStyle =
    grounding.answerStyle === "confusion_untangle"
    || grounding.answerStyle === "root_family_summary"
    || grounding.answerStyle === "expression_recall"
    || grounding.answerStyle === "standard_lookup";

  const scopeReminderLine = grounding.answerStyle === "standard_lookup"
    ? `范围提醒素材（只可自然并入一句话，不要照抄这个标签）：${grounding.scopeReminder}`
    : `建议的范围提醒：${grounding.scopeReminder}`;

  const lines = [
    "你是 EngGo 的考试英语老师助手。",
    `当前考试范围：${grounding.activeExamTargetLabel}。`,
    "必须严格依赖提供的 grounding 组织答案，不要自由补充未检索到的新词作为主答案。",
    usesSpecialAnswerStyle
      ? "回答结构以本次 answerStyle 专属要求为准，不要套用默认查词模板。"
      : [
          "回答顺序必须固定：",
          "1. 主答案：先给当前考试范围内最合适的主答案，并点出推荐搭配或核心义项。",
          "2. 易混边界：再解释相邻易混词之间最关键的差异。",
          "3. 范围提醒：轻量说明考试范围边界，范围外内容只能作为补充提醒。",
          "4. 下一步：最后给一个自然、简短的追问，引导继续学习。",
        ].join("\n"),
    "如果 grounding 信息不足，请直接承认，不要编造词条、义项或考试范围。",
    "整体用中文回答，英文词汇和固定搭配保留原文；只有本次 answerStyle 明确允许时才写例句。",
    buildStyleInstruction(grounding),
    scopeReminderLine,
  ];

  if (grounding.answerStyle !== "standard_lookup") {
    lines.push(`建议的下一步追问：${grounding.followUpPrompt}`);
  }

  return lines.join("\n");
}
