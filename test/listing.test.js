import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline, runPipeline, approveGate } from '../src/dag.js';
import { validateListing, registerCheck } from '../src/format.js';

// ---- DAG 编排器 ----
const steps = () => [
  { id: 'signals', run: async (ctx) => ({ trend: 'office-standing-desk↑' }) },
  { id: 'score', deps: ['signals'], run: async (ctx) => ({ score: 82, basedOn: ctx.results.signals.trend }) },
  { id: 'gen_amazon', deps: ['score'], run: async (ctx) => ({ title: `Standing Desk Converter ${ctx.results.score.score}`, bullets: ['a'.repeat(80), 'b'.repeat(80)] }) },
  { id: 'publish', deps: ['gen_amazon'], gate: true, run: async (ctx) => ({ action: 'create_listing', sku: 'SD-001', dryRun: true }) },
  { id: 'report', deps: ['publish'], run: async (ctx) => ({ published: ctx.results.publish.approved }) },
];

test('DAG：环检测与依赖校验', () => {
  assert.throws(() => createPipeline([{ id: 'a', deps: ['b'], run: async () => ({}) }, { id: 'b', deps: ['a'], run: async () => ({}) }]), /环/);
  assert.throws(() => createPipeline([{ id: 'a', deps: ['ghost'], run: async () => ({}) }]), /ghost/);
  assert.doesNotThrow(() => createPipeline(steps()));
});

test('DAG：闸门暂停 → 批准 → 续跑完成，且全程留痕', async () => {
  const gateCalls = [];
  const pipeline = createPipeline(steps(), { onGate: (run, step, draft) => gateCalls.push({ step: step.id, draft }) });
  const run1 = await runPipeline(pipeline, { keyword: 'standing desk' });
  assert.equal(run1.status, 'waiting_approval');
  assert.equal(run1.waitingGate.stepId, 'publish');
  assert.equal(gateCalls.length, 1);
  assert.deepEqual(gateCalls[0].draft.action, 'create_listing');

  const run2 = await approveGate(pipeline, run1);
  assert.equal(run2.status, 'done');
  assert.equal(run2.results.publish.approved, true);
  assert.equal(run2.results.report.published, true);
  assert.ok(run2.timeline.length >= 5); // 每步都有时间线记录
  // 非等待状态批准报错
  await assert.rejects(() => approveGate(pipeline, run2), /不在等待审批/);
});

test('DAG：续跑时已完成步骤不重复执行', async () => {
  let executions = 0;
  const p = createPipeline([
    { id: 'a', run: async () => { executions += 1; return { v: 1 }; } },
    { id: 'b', deps: ['a'], gate: true, run: async () => ({ draft: true }) },
    { id: 'c', deps: ['b'], run: async () => ({ done: true }) },
  ]);
  const r1 = await runPipeline(p, {});
  const r2 = await approveGate(p, r1);
  assert.equal(r2.status, 'done');
  assert.equal(executions, 1); // a 只跑了一次
});

// ---- 平台格式校验 ----
test('Amazon：超长标题/禁用词/缺五点报错', () => {
  const r = validateListing('amazon', {
    title: `BEST Standing Desk ${'x'.repeat(200)}`,
    bullets: [],
  });
  assert.equal(r.pass, false);
  assert.ok(r.errors.some((e) => e.includes('200')));
  assert.ok(r.errors.some((e) => e.includes('禁用词')));
  assert.ok(r.errors.some((e) => e.includes('五点')));
});

test('Amazon：search terms 与标题重复词告警', () => {
  const r = validateListing('amazon', {
    title: 'Ergonomic Standing Desk Converter',
    bullets: [`${'solid steel frame for stability. '.repeat(3)}`],
    searchTerms: 'standing desk converter adjustable height',
  });
  assert.equal(r.pass, true);
  assert.ok(r.warnings.some((w) => w.includes('重复词')));
});

test('TikTok：缺 hook 报错、长文案告警', () => {
  const bad = validateListing('tiktok', { caption: `${'word '.repeat(60)}` });
  assert.equal(bad.pass, false);
  assert.ok(bad.errors.some((e) => e.includes('hook')));
  const ok = validateListing('tiktok', { caption: 'This desk changed my back 🪑', hook: 'POV: your back hurts', hashtags: ['#desksetup'] });
  assert.equal(ok.pass, true);
});

test('Shopify：SEO 结构校验', () => {
  const bad = validateListing('shopify', {});
  assert.equal(bad.pass, false);
  const good = validateListing('shopify', {
    seoTitle: 'Standing Desk Converter | Ergonomic',
    metaDescription: 'Convert any desk to standing.',
    faq: ['Is it stable?', 'Weight limit?'],
  });
  assert.equal(good.pass, true);
});

test('未知平台报错', () => {
  assert.throws(() => validateListing('ebay', {}), /不支持的平台/);
});

test('语域检查：TikTok 词汇混入 Amazon 文案被识破', () => {
  const dirty = registerCheck('amazon', { title: 'Desk', bullets: ['OMG this is so good!! slay bestie vibes'] });
  assert.equal(dirty.registerClean, false);
  assert.ok(dirty.foreignPhrases.length >= 2);
  const clean = registerCheck('amazon', { title: 'Desk', bullets: ['Durable construction, adjustable height.'] });
  assert.equal(clean.registerClean, true);
});
