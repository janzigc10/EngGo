# ECDICT Tag Scope Closure V1 设计

## 背景
当前 Learn / Review / Progress 的词书、聊天检索的 ECDICT tag 过滤、source lemma fallback 和旧 TypeScript retrieval 各自维护 scope 判断。直接后果是：

- `活动的英文是什么` 在 CET-6 下不会优先返回 `activity`，因为 `activity` 属于高考 / CET-4 基础词，而当前 CET-6 没有继承低级别基础词。
- 词书页面虽然叫“当前词书”，但词书内容生成仍来自 ECDICT + source lemma manifests，和聊天侧 ECDICT tag 判断不是同一个事实源。
- 后续如果只补一个 `activity` 样例，会继续出现 CET-6 / CET-4 / 高考边界不一致的问题。

## 核心决定
1. ECDICT tag 是词书事实源。
   - `gk` / `zk` -> `gaokao`
   - `cet4` -> `cet4`
   - `cet6` -> `cet6`
   - `ky` -> `postgrad`
2. 词条数据只记录直接来源 scope，不把继承结果写回 `examScopes`。
3. 当前用户词书使用 scope closure 判断 membership：
   - `gaokao` -> `gaokao`
   - `cet4` -> `gaokao` + `cet4`
   - `cet6` -> `gaokao` + `cet4` + `cet6`
   - `postgrad` -> `gaokao` + `cet4` + `cet6` + `postgrad`
4. `cet6-foundation-v1` ID 保留，避免破坏已有本地进度和 active session；但内容改为 ECDICT tag-derived closure。
5. Learn / Review / Progress / Chat 都复用同一套 closure helper，不再在各模块里手写 `scope === activeExamTarget`。

## 词书与聊天统一方式
- 生成器从本地 `output/external-dictionaries/ecdict.csv` 读取所有带考试 tag 且有中文释义的词条，输出 compact `entries.json`。
- 前端 wordbook registry 从同一个 `entries.json` 生成四本词书：
  - 高考 ECDICT 基础词书
  - CET-4 ECDICT 基础词书
  - CET-6 ECDICT 基础词书
  - 考研 ECDICT 基础词书
- 用户当前考试范围和 active wordbook 必须保持一一对应。聊天请求带上 `activeWordbookId` 作为观测字段；后端仍以 active scope closure 作为最终 membership 判断。
- 旧 source lemma manifests 只保留为兼容 fallback，不再作为词书 scope 的权威来源。

## 非目标
- 不在本轮解决 `anti` / `sub` / `re` 前缀语义纯度。那些问题属于 root / prefix semantic quality gate，不应塞进 scope closure。
- 不做完整词根溯源或 morpheme analyzer。
- 不新增云同步、账号词书状态、完整 SRS 或收藏体系改造。
- 不让 provider 决定词书 membership。

## 验收
1. CET-6 下 `活动的英文是什么` 应优先命中 `activity`，即使 `activity` 只有高考 / CET-4 ECDICT tag。
2. Learn / Review / Progress 的当前词书条目来自同一份 ECDICT tag-derived compact dataset。
3. 旧 TS retrieval、FastAPI broad / meaning / exact / dynamic vocabulary 的 scope 判断都使用 closure helper。
4. E2E matrix 增加 scope closure 用例，避免未来退回“只查当前直接 tag”。
