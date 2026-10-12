// 轻量 DAG 编排器：链路 = 静态步骤图 + 人工闸门节点。
// 三位一体：检查点（run 可随时续跑）/ 重跑（已完成步骤跳过）/ 留痕（timeline 全程审计）。
// 不用框架——链路是静态 DAG，自研 200 行内解决，检查点语义完全自控。
export function createPipeline(steps, hooks = {}) {
  validateDag(steps);
  return { steps, hooks };
}

function validateDag(steps) {
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) throw new Error('步骤 id 重复');
  for (const s of steps) {
    for (const d of s.deps ?? []) {
      if (!ids.has(d)) throw new Error(`步骤 ${s.id} 依赖不存在的 ${d}`);
    }
  }
  // 环检测：Kahn 拓扑计数
  const indeg = new Map(steps.map((s) => [s.id, (s.deps ?? []).length]));
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let seen = 0;
  while (queue.length) {
    const id = queue.pop();
    seen += 1;
    for (const s of steps) {
      if ((s.deps ?? []).includes(id)) {
        indeg.set(s.id, indeg.get(s.id) - 1);
        if (indeg.get(s.id) === 0) queue.push(s.id);
      }
    }
  }
  if (seen !== steps.length) throw new Error('DAG 存在环');
}

// 执行管线。state 可传入上次中断的 run（续跑：已完成步骤直接跳过）。
// gate 步骤：执行得到 draft 后暂停为 waiting_approval，等 approveGate 再继续。
export async function runPipeline(pipeline, input, state = null) {
  const run = state ?? {
    id: `run-${Date.now()}`,
    status: 'running',
    results: {},
    completed: [],
    timeline: [],
    waitingGate: null,
    startedAt: new Date().toISOString(),
  };
  run.__input = input;
  run.status = 'running';
  const completed = new Set(run.completed);

  for (const step of topological(pipeline.steps)) {
    if (completed.has(step.id)) continue; // 检查点：已完成的跳过
    if ((step.deps ?? []).some((d) => !completed.has(d))) continue;

    const out = await step.run({ input, results: run.results });
    run.results[step.id] = out;
    completed.add(step.id);
    run.completed = [...completed];
    run.timeline.push({ stepId: step.id, at: new Date().toISOString(), summary: out });

    if (step.gate && !out.approved) {
      run.waitingGate = { stepId: step.id, draft: out };
      run.status = 'waiting_approval';
      pipeline.hooks.onGate?.(run, step, out);
      return run;
    }
  }
  run.waitingGate = null;
  run.status = 'done';
  return run;
}

// 闸门批准：把 draft 标记为 approved，从断点继续跑完
export async function approveGate(pipeline, run) {
  if (run.status !== 'waiting_approval') throw new Error('当前不在等待审批状态');
  const { stepId } = run.waitingGate;
  run.results[stepId].approved = true;
  run.waitingGate = null;
  return runPipeline(pipeline, run.__input, run);
}

function topological(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const out = [];
  const seen = new Set();
  const visit = (s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    for (const d of s.deps ?? []) visit(byId.get(d));
    out.push(s);
  };
  steps.forEach(visit);
  return out;
}
