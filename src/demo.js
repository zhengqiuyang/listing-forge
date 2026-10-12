// 全链路演示：信号 → 选品评分 → 三平台生成 → 校验 → 人工闸门 → 上架(dry-run) → 报告。
// DAG 编排 + 闸门暂停/批准全程可见（留痕时间线即产品形态）。
import { createPipeline, runPipeline, approveGate } from './dag.js';
import { validateListing, registerCheck } from './format.js';
import {
  generateAmazonListing, generateTiktokListing, generateShopifyListing,
} from './listings.js';

const SIGNALS = {
  keyword: 'standing desk converter',
  trendScore: 82,
  reviewInsights: ['complaints: wobble at full height', 'wish: pre-assembled'],
  product: {
    name: 'RisePro standing desk converter',
    keywords: ['standing desk converter', 'desk riser', 'height adjustable', 'office ergonomics', 'work from home'],
    benefits: ['Rock-solid at full extension', 'Ships 90% pre-assembled'],
    spec: 'fits dual monitors up to 27 inch',
    pain: 'wobbly desk setup',
    hook: 'Your desk shouldn\'t wobble like a kayak',
    hashtags: ['#desksetup', '#wfh', '#ergonomics', '#office', '#standingdesk'],
  },
};

const scoreProduct = (signals) => {
  const wobble = signals.reviewInsights.some((r) => r.includes('wobble'));
  return {
    score: signals.trendScore - (wobble ? 0 : 5),
    edge: wobble ? '竞品差评集中在"全高度晃动"，我们的卖点是 Rock-solid' : '拼价格',
    verdict: 'GO',
  };
};

const pipeline = createPipeline([
  {
    id: 'signals',
    run: async () => ({ keyword: SIGNALS.keyword, trendScore: SIGNALS.trendScore }),
  },
  {
    id: 'score',
    deps: ['signals'],
    run: async (ctx) => scoreProduct(SIGNALS),
  },
  {
    id: 'gen_listings',
    deps: ['score'],
    run: async () => ({
      amazon: generateAmazonListing(SIGNALS.product),
      tiktok: generateTiktokListing(SIGNALS.product),
      shopify: generateShopifyListing(SIGNALS.product),
    }),
  },
  {
    id: 'validate',
    deps: ['gen_listings'],
    run: async (ctx) => {
      const results = {};
      for (const [platform, listing] of Object.entries(ctx.results.gen_listings)) {
        results[platform] = {
          format: validateListing(platform, listing),
          register: registerCheck(platform, listing),
        };
      }
      const allPass = Object.values(results).every((r) => r.format.pass && r.register.registerClean);
      if (!allPass) throw new Error('listing 未过校验闸门：' + JSON.stringify(results).slice(0, 200));
      return results;
    },
  },
  {
    id: 'publish',
    deps: ['validate'],
    gate: true,
    run: async () => ({ action: 'create_listing', sku: 'RP-SDC-001', marketplaces: ['amazon.com', 'tiktok us', 'shopify'], dryRun: true }),
  },
  {
    id: 'report',
    deps: ['publish'],
    run: async (ctx) => ({
      sku: ctx.results.publish.sku,
      approved: Boolean(ctx.results.publish.approved),
      timeline: '链路完成，全部步骤已留痕',
    }),
  },
]);

console.log('═══ listing-forge 全链路演示 ═══\n');
const run1 = await runPipeline(pipeline, SIGNALS);
console.log(`[1] 信号: "${run1.results.signals.keyword}" 趋势分 ${run1.results.signals.trendScore}`);
console.log(`[2] 评分: ${run1.results.score.score} → ${run1.results.score.verdict}（${run1.results.score.edge}）`);
console.log('[3] 三平台 listing 已生成并通过校验:');
for (const [platform, r] of Object.entries(run1.results.validate)) {
  console.log(`    ${platform}: 格式✓ 语域${r.register.registerClean ? '✓' : '✗'}`);
}
console.log(`\n[4] ⏸️ 发布闸门触发：${JSON.stringify(run1.waitingGate.draft)} —— 等待人工批准\n`);

const run2 = await approveGate(pipeline, run1);
console.log(`[5] ✅ 已批准并完成：SKU ${run2.results.report.sku}，共 ${run2.timeline.length} 步留痕`);
console.log('\n═══ 留痕时间线 ═══');
for (const t of run2.timeline) {
  console.log(`  ${t.at.slice(11, 19)}  ${t.stepId}`);
}
