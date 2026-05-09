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

function hasSourceLemmaMainAnswer(grounding: AnswerGrounding) {
  return grounding.mainAnswer.some((candidate) => candidate.sourceKind === "source_lemma");
}

function buildStyleInstruction(grounding: AnswerGrounding) {
  if (grounding.answerStyle === "standard_lookup") {
    const sourceLemmaInstruction = hasSourceLemmaMainAnswer(grounding)
      ? [
          "source lemma fallback: 本次主答案只来自 source lemma index，还没有人工结构化释义。",
          "source-only 查词输出模板：优先写成“lemma 常见作[常见词性]，核心义是‘...’；简单理解就是...。”",
          "常见词性只能来自通用词典知识；不确定词性时省略词性，直接写“lemma 的核心义是...；简单理解就是...”。",
          "只能解释 grounding.mainAnswer[0].lemma 这个已确认词，不要判断范围，不要扩展相似词，不要生成易混组。",
          "允许使用通用词典知识给一个很短的中文核心义；不要写 source lemma、例句、搭配、Markdown、范围提示或下一步追问。",
        ].join("\n")
      : "";
    const correctionInstruction = grounding.spellingCorrection
      ? [
          `本次是拼写纠错查词：用户输入 ${grounding.spellingCorrection.input}，grounding 主答案是 ${grounding.spellingCorrection.lemma}。`,
          `第一句必须写“你可能想查的是 ${grounding.spellingCorrection.lemma}。”`,
          `不要只把 ${grounding.spellingCorrection.lemma} 当成普通查词开头；先说明纠错，再解释核心义。`,
          "本次不要主动写范围提醒、下一步追问、Markdown 加粗或标题装饰。",
          `最终答案不要出现 ${grounding.activeExamTargetLabel}、考试范围、范围内这类范围提示；范围只用于内部选词。`,
        ].join("\n")
      : "";

    return [
      "普通查词模式：只回答用户当前问的词，不主动展开成易混组、词根家族或近义词列表。",
      "总长度控制在 180 个汉字以内，最多 3 段；不要使用横线、分隔线或标题装饰。",
      grounding.spellingCorrection
        ? "按信息顺序组织：先给拼写纠错提示，再解释当前词的核心义；没有 confusionBoundary 时不要补边界。"
        : "按信息顺序组织：先解释当前词的核心义，再在有 grounding.confusionBoundary 时补一句边界；本次不要主动写范围提醒。",
      sourceLemmaInstruction,
      correctionInstruction,
      `最终答案不要出现 ${grounding.activeExamTargetLabel}、考试范围、范围内这类范围提示；范围只用于内部选词。`,
      "不要把“主答案”“易混边界”“范围提醒”写成可见小标题，也不要用 Markdown 加粗来造小标题。",
      "最终答案不要出现“主答案”“易混边界”“范围提醒”“没有需要区分”这些字样。",
      "最终答案不要出现 Markdown 符号，比如 **、#、列表符号；不要把英文词加粗。",
      "核心义只用 grounding 里的主答案和易混边界，先给 lemma + 中文核心义。",
      "如果用户问“是什么意思”，不要补搭配；如果用户问“怎么用”且 grounding 主答案里明确给出搭配，才可写一个短搭配。",
      "短搭配只写 phrase=中文义，不要使用“如”“例如”“常用搭配如”引出搭配；即使用户问“怎么用”，也不要写完整英文句子。",
      "易混边界只有 grounding.confusionBoundary 有内容时才写，只写词义或词性差异，不写搭配、句子或括号例子；不要主动补充未召回的新词。",
      "没有 confusionBoundary 时直接省略边界，不要写“没有需要区分的易混词”。",
      "禁止例句、长列表、百科解释和主动扩展；不要主动输出下一步追问。",
    ].filter(Boolean).join("\n");
  }

  if (grounding.answerStyle === "root_family_summary") {
    const rootFamilyMemberCount = grounding.rootFamilyView?.members.length ?? 0;
    const isBroadRootFamilyRecall = rootFamilyMemberCount > 8;
    const rootFamilyFragment = grounding.rootFamilyView?.fragment ?? "这个片段";
    const rootFamilyLengthInstruction = isBroadRootFamilyRecall
      ? `本次召回成员较多（${rootFamilyMemberCount} 个）：总长度可放宽到 1500 个汉字以内，最多 3 段。`
      : "总长度控制在 420 个汉字以内，最多 3 段。";
    const rootFamilyRecallInstruction = isBroadRootFamilyRecall
      ? [
          "家族召回：家族召回段必须用 Markdown 表格，表头固定为 word | 词性 | 核心义。",
          "把 rootFamilyView.members 全部列出，不要省略，不要写“等”；word 列必须逐字复制 rootFamilyView.members.lemma，词性列必须使用 rootFamilyView.members.partOfSpeech，禁止改拼写；只列召回成员，不自由补新词。",
          "表格只列 word、词性和核心义三列；意义分流只用 1-2 句概括，不逐词展开。",
          "意义分流段只允许写两句以内的总括：只说这些词共享同一词首线索，但现代义已经分流；禁止举例，不拆后续词根，不写“例如”。",
        ].join("\n")
      : "家族召回：家族召回必须列出当前考试范围内召回到的家族成员，每个成员都要带中文核心义；每个成员必须写成 word=中文义，不许省略英文词；只列召回成员，不自由补新词。";
    const rootFamilyMeaningInstruction = isBroadRootFamilyRecall
      ? `意义分流：意义分流段必须只写这两句，不要改写：这些词共享 ${rootFamilyFragment} 这个词形线索，但现代义已经分流，不能只靠片段猜意思。先按表格记具体词义；如果觉得太多，可以继续按词性或意思缩小范围。`
      : "意义分流：讲清前缀、后缀或现代义分流如何让同一碎片走向不同意思；语义跑远的成员也要保留在家族里，说明现代义已经分流。";

    return [
      "本风格优先于通用回答顺序，不要再套用通用四段标题。",
      "当前问题属于同根/碎片召回总结，必须把它当作词族召回来讲，不要写成背诵优先级排序。",
      rootFamilyLengthInstruction,
      "只输出这 3 段：碎片定位、家族召回、意义分流。",
      "碎片定位：说明用户给的是完整词、构词碎片，还是既是完整词也是构词碎片。",
      rootFamilyRecallInstruction,
      rootFamilyMeaningInstruction,
      "不要因为低优先级或语义跑远就写成不硬背，也不能只给背诵优先级。",
      "禁止例句、词源长故事和范围外扩展。",
      [
        "短答示例：",
        "碎片定位：stitute 不是完整单词，是“放置/建立”的构词部件。",
        "家族召回：institute=设立/机构；institution=机构/制度；constitute=构成；substitute=替代/替代品。",
        "意义分流：它们共享 stitute，但 in- 偏设立，con- 偏组成整体，sub- 偏替代位置。",
      ].join("\n"),
      "如果用户问到的片段本身也是成员词，必须说明它也是完整单词，再说明它也可作为构词碎片。",
      "只有当 rootFamilyView.members 里真的有 lemma 与用户片段完全相同，才说片段本身是完整单词；否则只能说是词形片段或前缀线索，禁止补未召回的完整词义。",
      "不要主动点名未召回的低频或范围外分支；内部保持保守即可，不要把防御性提醒写成正文。",
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
      "总长度控制在 450 个汉字以内，最多 4 段。",
      "只输出这 4 段：范围内相似词、词义速览、重点区分、做题抓手。",
      "范围内相似词：先列范围内召回到的相似词，并轻量说明它们都在当前考试范围内。",
      "词义速览：每个词必须带中文核心义，格式优先用 word=核心义；不能只列英文。",
      "重点区分：讲清真正的语义、词性、搭配或对象边界；形近词不要只说字母哪里不同。",
      "做题抓手：给最有用的词性、搭配或场景题眼；可以覆盖多个词的典型搭配，但不要写例句。",
      "禁止例句、长列表和补充扩展；不要主动输出范围提醒或下一步追问。",
      "超过 2 个词时，用公式行压缩：word=核心义；word=核心义；word=核心义。",
      "超过 2 个词时，重点区分可以优先讲最容易混的关系，但其余词必须用一句边界收束。",
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
      "必须出现“重点区分”这一段，讲清真正的语义、词性、搭配或对象差异。",
      "必须出现“做题抓手”这一段，点出考试里最该抓的搭配、场景或题眼。",
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

  const scopeReminderLine =
    grounding.answerStyle === "standard_lookup"
      ? "候选边界素材（内部参考：仅用于确定候选，不要写进最终答案）。"
      : grounding.answerStyle === "root_family_summary"
        ? `范围边界素材（内部参考，不要照抄这个标签，也不要主动展开范围外词）：${grounding.scopeReminder}`
        : grounding.answerStyle === "confusion_untangle"
          ? `范围边界素材（内部参考，不要照抄这个标签，也不要写成单独段落）：${grounding.scopeReminder}`
          : `建议的范围提醒：${grounding.scopeReminder}`;

  const lines = [
    "你是 EngGo 的考试英语老师助手。",
    grounding.answerStyle === "standard_lookup"
      ? "当前查词目标已由内部检索层选定。"
      : `当前考试范围：${grounding.activeExamTargetLabel}。`,
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

  if (
    grounding.answerStyle !== "standard_lookup"
    && grounding.answerStyle !== "root_family_summary"
    && grounding.answerStyle !== "confusion_untangle"
  ) {
    lines.push(`建议的下一步追问：${grounding.followUpPrompt}`);
  }

  return lines.join("\n");
}
