# Affix Semantic Gate V1 设计

## 目标
把“字母开头 / 结尾”和“前缀 / 后缀真的表达某个意思”分开处理，避免把长得像的词硬说成词缀语义命中。

本轮只做小而可验证的规则，不做完整词源系统。

## 用户意图区分
同一个片段在不同问法里不是同一个任务。

1. 查词
   - `antique 是什么意思`
   - 正常查 `antique`，不进入前缀整理。

2. 词形
   - `anti 开头的词有哪些`
   - 只要求拼写以 `anti` 开头。
   - `antique` 可以出现，但只能标成“拼写以 anti 开头”，不能说它表示“反对”。

3. 词缀语义
   - `anti 开头表示反对的词`
   - 候选词必须同时满足：拼写对得上，释义也对得上。
   - `antique` 不进主答案，因为它的意思是“古董的；古物”，不是 `anti- = 反对 / 相反 / 抗`。

4. 词缀解释
   - `anti 这个前缀什么意思`
   - 解释常见含义，给少量可靠例子，并说明不是所有 `anti...` 都能这样拆。

## 候选进入主答案的规则
词缀语义题不能只看 `startsWith` / `endsWith`。

主答案候选必须至少有一种释义证据：

- 中文释义直接包含用户问的意思或同义表达。
- ECDICT 英文 definition 命中少量手写映射，例如 `again` 对应“再次 / 重新”。
- 少量明确收录的稳定词缀例子。

如果只有拼写匹配，没有释义证据：

- 不能进主答案。
- 可以作为“容易误判 / 只按拼写命中”的说明。
- 如果没有任何可靠主答案，返回保守 no-match 或 clarification。

## 第一批覆盖样例
本轮先覆盖容易误判的高频片段。

- `anti 开头表示反对的词`
  - 主答案可以有 `antiwar`、`antisocial`、`antibody`、`antibiotic` 等有“反 / 抗”证据的词。
  - `antique`、`anticipate` 不进主答案。

- `re 开头表示再次的词`
  - `rewrite`、`renew`、`reconsider` 这类有“重新 / 再次”证据的词可以进主答案。
  - `reconcile` 在 `re开头cile结尾的单词` 里可以返回，但在“re 表示再次”里不能只靠拼写进主答案。

- `sub 开头表示下面 / 次级的词`
  - `subway`、`submarine`、`substandard`、`subordinate` 等有“下 / 次级 / 低于”证据的词可以进主答案。
  - `subject`、`subtle` 不进主答案。

- `trans 开头表示跨越 / 转移的词`
  - `transfer`、`transport`、`transmit`、`translate` 这类有“转移 / 传递 / 跨越 / 转化”证据的词可以进主答案。

- `-less 结尾表示没有的词`
  - `hopeless`、`careless`、`useless`、`homeless` 可以进主答案。

- `-er 结尾表示人的词`
  - `teacher`、`worker`、`driver`、`reader` 可以进主答案。
  - `water`、`other`、`under` 不进主答案。

## `xyz` 这类伪前缀边界
`xyz开头的单词` 不能因为 ECDICT 里正好有 `xyz` 这个条目就直接 resolved。

词形 prefix 查询至少要求：

- 候选词长度大于 prefix 长度。
- 或者有多个真正以该 prefix 开头的词。

如果只有 exact `xyz`，应返回 no-match 或 clarification，不把 exact 条目当成 prefix inventory。

## 不做什么
- 不做完整 morpheme analyzer。
- 不让 provider 判断哪些词可以进主答案。
- 不扩写大型词根词缀数据库。
- 不改变 Learn / Review / Progress 状态机。
- 不回退 scope closure；词书范围仍按当前 ECDICT tag closure 判断。

## 验证要求
完成时需要证明：

- `anti 开头表示反对的词` 不把 `antique` / `anticipate` 放进主答案。
- `anti 开头的词有哪些` 可以返回拼写命中，但答案不能声称这些词都表示“反对”。
- `re开头cile结尾的单词` 仍能返回 `reconcile`。
- `re 开头表示再次的词` 不把 `reconcile` 只凭拼写放进主答案。
- `sub / trans / -less / -er` 至少有 focused tests 覆盖正例和误判例。
- `xyz开头的单词` 不因 exact `xyz` 条目误判为 prefix 列表。
- providerless before/after E2E matrix 通过。
