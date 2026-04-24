# EngGo Shape-Neighbor Candidate Pool

> 状态：draft candidate pool。用途是为下一轮 seed 扩样本服务，不直接等同于已确认入库数据。

## 筛选标准

候选词族必须同时满足：

- 面向高考 / CET-4 / CET-6 / 考研用户常见或有教学价值。
- 主要混淆原因是拼写、字母顺序、近音近形或词形结构相近，而不是单纯近义词。
- 每组能写出清楚的 `whyConfusing`、`semanticBoundaryNotes` 和至少 1 个搭配或考试记忆点。
- 不重复当前 seed 已覆盖的组：`recent/resent`、`adapt/adopt`、`quiet/quite`、`affect/effect` 等。
- 第一轮宁缺毋滥：优先 30-50 组人工精选，不直接扩到 300-500 词。

## 推荐下一轮 P0

这些组最适合先进入下一轮 seed。它们形近强、考试常见、区分点清楚。

| Priority | Candidate Group | Scope Guess | Why It Fits | Core Boundary |
|---|---|---|---|---|
| P0 | `access / assess / excess` | CET-4 / CET-6 | 拼写高度接近，已有四六级易混材料也常把它们放在一起。 | access 是进入/使用权；assess 是评估；excess 是过量。 |
| P0 | `advice / advise` | 高考 / CET-4 | 一字母差异，词性不同。 | advice 是名词；advise 是动词。 |
| P0 | `accept / except` | 高考 / CET-4 | 读写都容易混，考试选择题常见。 | accept 是接受；except 是除……之外。 |
| P0 | `aboard / abroad` | 高考 / CET-4 | 字母顺序接近，中文学生很容易看错。 | aboard 在交通工具上；abroad 在国外/到国外。 |
| P0 | `angel / angle / ankle` | 高考 | 字母位置变化导致完全不同含义。 | angel 天使；angle 角度；ankle 脚踝。 |
| P0 | `assure / ensure / insure` | CET-4 / CET-6 | 形近且语义都接近“保证”。 | assure 安抚/保证某人；ensure 确保事情发生；insure 投保。 |
| P0 | `complement / compliment` | CET-6 / 考研 | 只差一个字母，英文写作中高频混淆。 | complement 是补足/相配；compliment 是称赞。 |
| P0 | `principal / principle` | 高考 / CET-4 | 读音接近，拼写接近，意义差异大。 | principal 是校长/主要的；principle 是原则。 |
| P0 | `personal / personnel` | CET-4 / CET-6 | 视觉上接近，词性和场景不同。 | personal 个人的；personnel 人员/人事。 |
| P0 | `economic / economical` | CET-4 / CET-6 | 同根形近，写作中常误换。 | economic 关于经济；economical 节约的。 |
| P0 | `conscious / conscience` | CET-6 / 考研 | 字母结构接近，词性和意义差异大。 | conscious 有意识的；conscience 良心。 |
| P0 | `precede / proceed` | CET-6 / 考研 | 中间字母接近，动作方向不同。 | precede 在前；proceed 继续/进行。 |
| P0 | `perspective / prospective` | CET-6 / 考研 | 长词形近，考试阅读中容易误读。 | perspective 视角；prospective 未来的/预期的。 |
| P0 | `historic / historical` | CET-6 / 考研 | 同根形近，语义边界可教。 | historic 有历史意义；historical 与历史有关。 |
| P0 | `sensible / sensitive` | 高考 / CET-4 | 开头和结构接近，中文都易联想到“感”。 | sensible 明智的；sensitive 敏感的。 |
| P0 | `considerable / considerate` | CET-4 / CET-6 | 同根形近，后缀差异决定意义。 | considerable 相当大的；considerate 体贴的。 |
| P0 | `stationary / stationery` | 高考 / CET-4 | 只差一个字母，经典形近词。 | stationary 静止的；stationery 文具。 |
| P0 | `device / devise` | CET-4 / CET-6 | c/s 一字母差异，名词/动词不同。 | device 装置；devise 设计/想出。 |
| P0 | `loose / lose` | 高考 / CET-4 | 多一个 o，读写都高频错。 | loose 松的；lose 失去。 |
| P0 | `breath / breathe` | 高考 / CET-4 | 末尾 e 决定词性和读音。 | breath 名词“呼吸”；breathe 动词“呼吸”。 |

## 推荐 P1

这些也符合条件，但可放在 P0 后面，用来扩到 30-50 组。

| Priority | Candidate Group | Scope Guess | Why It Fits | Core Boundary |
|---|---|---|---|---|
| P1 | `desert / dessert` | 高考 / CET-4 | 双 s 差异，常见拼写混淆。 | desert 沙漠/抛弃；dessert 甜点。 |
| P1 | `weather / whether` | 高考 | 近音形近，句法功能不同。 | weather 天气；whether 是否。 |
| P1 | `later / latter` | 高考 / CET-4 | 一字母差异，写作阅读易错。 | later 后来；latter 后者。 |
| P1 | `beside / besides` | 高考 / CET-4 | 多 s 改变词义。 | beside 在旁边；besides 此外/除……之外。 |
| P1 | `causal / casual` | CET-6 / 考研 | 字母顺序变化，学术阅读中容易误读。 | causal 因果的；casual 随意的。 |
| P1 | `confident / confidential` | CET-4 / CET-6 | 同根形近但意义不同。 | confident 自信的；confidential 机密的。 |
| P1 | `imaginary / imaginative / imaginable` | CET-4 / CET-6 | 同根派生，后缀控制意义。 | imaginary 想象中的；imaginative 有想象力的；imaginable 可想象的。 |
| P1 | `immigrant / emigrant / migrant` | CET-6 / 考研 | 前缀差异控制方向。 | immigrant 移入者；emigrant 移出者；migrant 迁移者。 |
| P1 | `eligible / illegible` | CET-6 / 考研 | 多 `ill-` 导致完全不同意思。 | eligible 有资格的；illegible 难以辨认的。 |
| P1 | `allude / elude` | CET-6 / 考研 | 拼写和读音接近，动词意义不同。 | allude 暗指；elude 躲避/使难以理解。 |
| P1 | `illusion / delusion` | CET-6 / 考研 | 词形接近，抽象名词易混。 | illusion 错觉；delusion 妄想/误信。 |
| P1 | `adverse / averse` | CET-6 / 考研 | d 一字母差异，搭配不同。 | adverse 不利的；averse 反感的，常接 to。 |
| P1 | `altitude / attitude` | 高考 / CET-4 | 字母接近，意义完全不同。 | altitude 海拔/高度；attitude 态度。 |
| P1 | `moral / morale` | CET-6 / 考研 | 末尾 e 差异，名词意义不同。 | moral 道德/寓意；morale 士气。 |
| P1 | `dairy / diary` | 高考 / CET-4 | 字母顺序变化，视觉混淆强。 | dairy 乳制品；diary 日记。 |
| P1 | `expand / expend / expense` | CET-4 / CET-6 | 词形接近，意思从扩张到花费。 | expand 扩大；expend 花费；expense 费用。 |
| P1 | `classic / classical` | CET-4 / CET-6 | 同根形近，修饰范围不同。 | classic 经典的；classical 古典的/传统经典体系的。 |
| P1 | `decent / descent / descend` | CET-6 / 考研 | 字母组合接近，词性不同。 | decent 体面的；descent 下降/血统；descend 下降。 |
| P1 | `statue / status / stature` | CET-4 / CET-6 | 开头结构接近，抽象/具体意义不同。 | statue 雕像；status 地位；stature 身高/声望。 |
| P1 | `industrial / industrious` | CET-6 / 考研 | 同根形近，但一个行业一个性格。 | industrial 工业的；industrious 勤勉的。 |
| P1 | `collision / collusion` | CET-6 / 考研 | i/u 差异，阅读中容易误读。 | collision 碰撞；collusion 勾结。 |
| P1 | `persecute / prosecute` | CET-6 / 考研 | 长词形近，法律/社会语境不同。 | persecute 迫害；prosecute 起诉。 |
| P1 | `rational / rationale` | CET-6 / 考研 | 末尾 e 差异，形容词/名词不同。 | rational 理性的；rationale 理由/理论依据。 |
| P1 | `through / thorough / though` | 高考 / CET-4 | 视觉高度接近，读音和功能不同。 | through 穿过/通过；thorough 彻底的；though 虽然。 |

## 暂不建议本轮入库

这些可以以后再看，但不适合下一轮精选 seed：

- `rise / raise / arise`：考试价值高，但更偏语法/及物不及物，不是强形近词簇。
- `imply / infer / inform`：四六级常见，但更偏语义/逻辑关系，形近强度弱。
- `all ready / already`、`altogether / all together`：更像短语拼写和用法辨析，暂不放进词条型 shape-neighbor。
- `there / their / they’re`、`to / too / two`：基础写作高频，但与当前“考试词汇知识库”定位不完全一致。
- 当前已覆盖或已有近似覆盖：`recent / resent`、`adapt / adopt`、`quiet / quite`、`affect / effect`。

## 建议下一步

第一批扩样本建议从 P0 里挑 15-20 组入 seed，然后跑：

- `corepack pnpm db:seed`
- `corepack pnpm eval:shape`
- `corepack pnpm test src/features/retrieval/retrieve-candidates.test.ts`

如果 P0 稳定，再补 P1 中更偏 CET-6 / 考研的长词形近组，把候选池扩到 30-50 组。

## Reference Notes

这些来源只用于校验候选方向，不直接复制其列表：

- [中国研究生招生信息网转载的新东方在线考研易混词汇材料](https://yz.chsi.com.cn/kyzx/en/201008/20100825/116671279.html)，说明考研场景中 `advice/advise`、`affect/effect`、`adverse/averse`、`allude/elude` 等易混对具备考试教学价值。
- [新东方四六级形近/近义辨析材料](https://cet4-6.xdf.cn/202603/15137149.html)列出 `adapt/adopt/adept`、`access/assess/excess`、`assure/ensure/insure`、`economic/economical` 等组，适合作为 CET 扩样本参照。
- [新东方高考近音近形词材料](https://zh.xdf.cn/gaokao/201812/8483269.html)覆盖 `aboard/abroad`、`angel/angle/ankle`、`altitude/attitude`、`quiet/quite` 等高考方向候选。
- [Blinn College Writing Centers 的 commonly confused words 页面](https://www.blinn.edu/writing-centers/wide/commonly-confused-words.html)可用于补充校验 `accept/except`、`complement/compliment`、`principal/principle`、`weather/whether`、`than/then` 等英文写作常见混淆。
