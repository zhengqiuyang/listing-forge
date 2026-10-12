# 03 · 技术方案 【提案】

## 架构

```
店铺授权（OAuth: Amazon SP-API / TikTok Shop Open API / Shopify）
        │
   连接器层（平台适配：限流/重试/字段映射）
        │
   agent 编排层（有状态链路：步骤DAG + 检查点 + 重跑）
        │   tools: fetch_signals, score_product, gen_listing(platform),
        │         analyze_reviews, draft_pricing, publish_listing(dry-run)
        │
   闸门服务（写操作人工审批：上架/改价的唯一出口）
        │
   留痕存储（时间线/数据快照/版本）
```

## 关键决策

### 1. 编排层：自研轻量 DAG，不用框架

链路是静态 DAG + 人工闸门节点，不需要 LangGraph 级动态性。
自研 = 检查点/重跑/留痕三位一体（cronagent 的 run-archive 模式直接移植），
且零框架依赖与仓库惯例一致。**简历叙事点：agent 编排不等于框架堆叠。**

### 2. 连接器层（工程量大头，也是壁垒）

- Amazon SP-API：授权流、签名（AWS SigV4）、限流配额管理——审核通过本身就是护城河
  （外部依赖已列：专业卖家账号是前置）；
- TikTok Shop / Shopify Open API：各自授权与字段模型；
- 统一内部数据模型（Product/Listing/Offer 三实体），平台差异吸收在连接器内。

### 3. 闸门服务（安全架构核心）

- 写操作唯一路径：`pending_action` 表 → UI 审批 → 执行器带幂等键执行；
- agent 运行时**没有**直接写凭证：发布工具拿到的是 dry-run 通道，
  真实凭证只在闸门后的执行器里——与 agent-pr-gate"关键路径上不放 LLM"同构，
  infra 思想在商业产品里的直接复用（简历叙事点之二）。

### 4. listing 质量评测（eval-spec）

- 每平台 golden 集 30 条（输入：产品参数+目标关键词；标注：结构合规+语域正确）；
- 指标：平台格式规则合规率（确定性检查，如 Amazon 标题 200 字符/禁用词——
  这层根本不用 LLM）、语域分类器准确率（TikTok vs Amazon 文风判别）、
  关键词覆盖（确定性）；CI 回归。

### 5. 评论洞察评测

- 50 条已人工归因的差评样本集：聚类纯度 + 归因一致率（LLM 归因 vs 人工），
  一致率 ≥0.75 门槛。

## 技术栈

TypeScript + ESM；服务 Node；前端 Vite + 时间线组件（链路回放是 UI 重头）；
Postgres；部署同 saas-starter。LLM：OpenAI 兼容网关。

## 成本模型

单条链路（选品+3 平台 listing+评论分析）：LLM 约 ¥1-3，数据 API 按卖家自有授权为主——
COGS 远低于 $49 定价，风险点只在平台 API 配额（连接器层限流保护）。
