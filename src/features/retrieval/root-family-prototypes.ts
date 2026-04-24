import type { RootFamilyView } from "@/features/retrieval/types";

const stitutePrototype: RootFamilyView = {
  id: "root-stitute",
  fragment: "stitute",
  coreImage: "放置 / 建立",
  note: "stitute 不是独立单词，更像表示“放置、建立”的构词部件。",
  caution: "不是每个前缀都值得机械套用；遇到低频分支时，不要硬凑。",
  members: [
    {
      lemma: "institute",
      prefix: "in-",
      prefixDirection: "放进去",
      actionStory: "把制度或机构放进去，变成正式设立",
      modernMeaningZh: "设立；机构",
      priority: "must_memorize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "institution",
      prefix: null,
      prefixDirection: "设立后的结果",
      actionStory: "设立动作沉淀成一个机构或制度",
      modernMeaningZh: "机构；制度",
      priority: "must_memorize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "constitute",
      prefix: "con-",
      prefixDirection: "放到一起",
      actionStory: "把部分放到一起，形成整体",
      modernMeaningZh: "构成",
      priority: "recognize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "substitute",
      prefix: "sub-",
      prefixDirection: "放在下面备用",
      actionStory: "把候补放在下面，随时顶上去",
      modernMeaningZh: "替代；替代品",
      priority: "recognize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "restitute",
      prefix: "re-",
      prefixDirection: "放回去",
      actionStory: "把东西放回原处",
      modernMeaningZh: "归还；恢复",
      priority: "low_priority",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "prostitute",
      prefix: "pro-",
      prefixDirection: "放到前面",
      actionStory: "历史演变义较远，只要知道不是考试优先分支",
      modernMeaningZh: "卖淫；妓女",
      priority: "low_priority",
      entryId: null,
      inScope: false,
    },
  ],
};

const temptPrototype: RootFamilyView = {
  id: "root-tempt",
  fragment: "tempt",
  coreImage: "试探 / 诱动",
  note: "tempt 更适合当作一族构词碎片来看，不要把它当成能随意拼前缀的积木。",
  caution: "这一族里有能讲的故事，但不要硬套出不存在或不常考的分支；尤其不要硬套 re-。",
  members: [
    {
      lemma: "attempt",
      prefix: "at-",
      prefixDirection: "朝着目标去碰",
      actionStory: "朝着目标去试一下",
      modernMeaningZh: "尝试",
      priority: "must_memorize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "tempt",
      prefix: null,
      prefixDirection: "直接诱动",
      actionStory: "把人往某个方向勾过去",
      modernMeaningZh: "引诱；诱惑",
      priority: "must_memorize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "temptation",
      prefix: null,
      prefixDirection: "诱惑形成的结果",
      actionStory: "诱人的东西变成了具体诱惑",
      modernMeaningZh: "诱惑",
      priority: "must_memorize",
      entryId: null,
      inScope: false,
    },
    {
      lemma: "contempt",
      prefix: "con-",
      prefixDirection: "语义历史演变后转向否定态度",
      actionStory: "从被触动转成轻蔑态度，意义已经跑远",
      modernMeaningZh: "轻视；轻蔑",
      priority: "recognize",
      entryId: null,
      inScope: false,
    },
  ],
};

function cloneRootFamilyView(view: RootFamilyView): RootFamilyView {
  return {
    ...view,
    members: view.members.map((member) => ({ ...member })),
  };
}

export function findRootFamilyPrototype(query: string): RootFamilyView | null {
  const normalizedText = query.trim().toLowerCase();

  if (
    /^stitute\s*(?:是(什么|啥)|什么意思)$/i.test(normalizedText)
    || (/\bstitute\b/.test(normalizedText) && /(词根|家族|派生|构词)/i.test(normalizedText))
  ) {
    return cloneRootFamilyView(stitutePrototype);
  }

  if (/\btempt\b/.test(normalizedText) && /(这一族|词根|家族|派生|构词|怎么记)/i.test(normalizedText)) {
    return cloneRootFamilyView(temptPrototype);
  }

  return null;
}
