# Exam-Focused English Learning Chat Platform Design

Date: 2026-04-21

## Summary

This product is a chat-first English learning platform for Chinese students preparing for standardized exams. The first release focuses on four built-in exam scopes:

- Gaokao
- CET-4
- CET-6
- Postgraduate Entrance Exam

The core product value is not generic word lookup. It is helping users recover and distinguish words when memory is incomplete, confused, or inaccurate. The system should feel like a large-model app in its primary interaction model, while still retaining the learning backbone of a serious exam vocabulary app.

The homepage is a clean conversation workspace similar in spirit to the center panel of NotebookLM. Users ask in natural language, with Chinese meanings, incomplete English spellings, confused word sets, or study questions. The system answers primarily from the active exam scope and uses that scope as the main boundary for recall and explanation.

## Product Positioning

### Core Product Thesis

Students do not only fail because they do not know a word. They often fail because:

- they remember only part of a word
- they confuse similar-looking or similar-meaning words
- they search by Chinese meaning and receive too many noisy results
- they get answers outside their exam scope

The product should therefore behave less like a dictionary and more like a guided exam vocabulary reasoning assistant.

### Product Shape

The first version is a hybrid of:

- a chat-first learning workspace as the primary entry
- a traditional exam vocabulary learning backbone in secondary pages

This means:

- the homepage is the model conversation workspace
- wordbooks, learning, review, progress, and personal collections remain available as secondary product layers
- the AI chat is the main stage, not a side feature

### Non-Goals For V1

The first version does not include:

- user-uploaded PDF, DOCX, or custom knowledge bases
- broad open-domain English learning outside the built-in exam scopes
- a homepage centered on wordbook browsing instead of conversation
- a search-results-first product where the chat is only a wrapper around a list

## Primary User Experience

### Default Entry

When a user opens the app, they land on a clean chat workspace. The default empty state should feel calm and spacious, with limited guidance rather than a busy dashboard.

The page should include:

- a conversation title or workspace label tied to the active exam target
- a subtle indicator of the active exam scope
- a large chat input
- a small number of example prompts

The page should not foreground dense cards, dashboards, or feature grids.

### Supported Input Types

The conversation workspace must support at least these input patterns:

1. Chinese meaning lookup
   - Example: "遵从怎么说"
2. Incomplete or fuzzy English recall
   - Example: "有个像 institute 的词"
3. Direct confused-word comparison
   - Example: "restrain 和 constrain 的区别"
4. Open study confusion
   - Example: "为什么我总把 comply 和 conform 搞混"

### Secondary Product Areas

Outside the homepage chat workspace, the app should retain secondary study functions:

- current wordbook
- learning flow
- review flow
- vocabulary collections such as a new-word book
- notes or lightweight personal accumulation
- study data and progress

These areas support long-term retention, but they are not the primary entry point.

## Response Design

### Core Principle

The system should not behave like a search engine returning a long list. It should behave like a teacher who narrows the correct word group before explaining it.

### Standard Response Rhythm

For most user questions, the response should follow this sequence:

1. Give the main answer first
2. Explain the confusion boundary with nearby words
3. Clarify the exam-scope boundary
4. Offer a natural next step for follow-up

Supporting structures such as brief comparison chips, inline cards, or short follow-up actions may appear inside the conversation when useful, but they must remain subordinate to the chat response. The homepage must not regress into a search-results-first layout.

### Example Interaction Behavior

If the user asks "遵从怎么说" in CET-6 mode, the answer should begin with the main exam-relevant answer, such as `comply with`, then contrast it against nearby terms such as `conform to` and `defer to`, then optionally note whether a more precise expression exists outside the current scope.

The system should not begin by dumping a long unordered candidate list.

### Input-Type-Specific Behavior

#### Chinese meaning query

The system should:

- identify the best answer inside the current exam scope
- surface 2 to 4 nearby confusing terms if needed
- explain semantic boundaries between them

#### Fuzzy or incomplete English input

The system should:

- infer the most likely intended word group
- explain why those candidates were surfaced
- avoid pretending there is only one possible match if ambiguity is high

#### Direct multi-word query

The system should:

- skip generic lookup behavior
- enter direct comparison mode immediately

### Scope Handling

The active exam scope is the main boundary. If a better or more precise answer exists outside the current scope, the system may add a light reminder, but must not let out-of-scope content overpower the main answer.

Default rule:

- main answer: current scope only
- supplementary note: out-of-scope only when materially useful

## Knowledge Base Design

### Content Sources

The first version uses a combined content strategy:

- exam syllabi or official exam boundaries define inclusion scope
- dictionaries and wordbooks supply meanings, examples, and usage support

This is the selected V1 default.

### Knowledge Layers

The built-in knowledge base must include at least four layers.

#### 1. Entry Layer

Each vocabulary item should contain:

- lemma
- word form variants where needed
- part of speech
- Chinese meanings
- examples
- common collocations
- exam membership metadata

#### 2. Exam Boundary Layer

Each entry must know whether it belongs to:

- Gaokao
- CET-4
- CET-6
- Postgraduate Entrance Exam

It should also support overlap relationships across scopes.

#### 3. Confusion Relationship Layer

This is the product core. The system should explicitly model confusing relationships instead of asking the model to infer everything ad hoc.

Each confusion group should support:

- why these words are commonly confused
- core semantic distinctions
- common misuse points
- exam relevance or frequency priority
- which member should usually be taught first

Typical examples include:

- comply with / conform to / abide by / defer to
- restrain / constrain
- stationary / stationery
- affect / effect

Derivative word families are related, but they are not the primary example of
`confusion_untangle`. A group such as `respect / respective / respectful /
respectable` should usually be treated as a word-family or derivation-memory
asset for the secondary learning backbone. It may be surfaced in chat when the
user explicitly asks about the family, but it should not be used as the main
representative case for confused-word explanation unless the user asks for a
specific boundary such as `respectful / respectable`.

#### 4. Fuzzy Recall Layer

The retrieval layer must support:

- Chinese meaning lookup
- incomplete English spelling
- misspellings
- root or fragment input
- natural-language descriptions of half-remembered words

### System Characterization

The underlying system is not just "a dictionary plus an LLM." It is:

- an exam-scoped vocabulary knowledge base
- a confusion-relationship graph
- a fuzzy retrieval system
- an LLM layer that turns retrieved structure into natural teaching responses

## MVP Scope

### In Scope For V1

- built-in exam scopes for Gaokao, CET-4, CET-6, and Postgraduate Entrance Exam
- user-selected active exam target
- chat-first homepage
- scope-bounded vocabulary responses
- fuzzy retrieval across Chinese meaning, incomplete English, and confused word groups
- structured confused-word explanation
- secondary access to learning and review infrastructure

### Deferred But Expected Later

- daily plans
- full new-word-book workflows beyond lightweight collection access
- review reminders
- user-uploaded materials and personal knowledge bases
- deeper notebook-style document ingestion

These may be added later, but they are not required for V1 success.

## UX Defaults Chosen

- Homepage is the model conversation workspace
- Product shape is chat-first with learning backbone, not pure NotebookLM and not a traditional wordbook-first app
- Active exam target is user-selected and persistent
- Responses prioritize in-scope answers
- Out-of-scope words may appear only as lightweight supplemental hints
- Built-in content only for V1
- Content source strategy is exam boundary plus dictionary/wordbook support

## Success Criteria For V1

The first release is successful if a student can:

- ask with incomplete memory and still get the right in-scope word group
- understand why similar words differ
- avoid being flooded by irrelevant out-of-scope vocabulary
- treat the product as both a chat tool and a serious exam vocabulary study system

## Assumptions

- The initial audience is Chinese students preparing for major English exams rather than general English learners
- The product should optimize for exam usefulness over open-ended linguistic completeness
- The central differentiator is confusion resolution and fuzzy recall, not broad AI conversation alone
- Secondary learning functions should remain present so the app can support retention beyond one-off querying
