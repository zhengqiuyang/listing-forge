// 三平台 listing 生成（确定性模板）：评分卡数据 → 各平台格式。
// 模板刻意通过自家 format 校验（含语域检查）——生成器与校验器同仓演进，CI 互相锁住。
export function generateAmazonListing(product) {
  const kw = product.keywords.slice(0, 3).map(cap).join(', ');
  return {
    platform: 'amazon',
    title: `${cap(product.name)} ${cap(product.keywords[0] ?? '')} - ${product.benefits[0] ?? 'Ergonomic Design'}${product.keywords[1] ? `, ${cap(product.keywords[1])}` : ''}`.slice(0, 200),
    bullets: [
      `${cap(product.keywords[0] ?? 'Built')} for daily use: ${product.benefits[0] ?? 'sturdy'} construction sized for real workspaces (${product.spec ?? 'adjustable'}).`,
      `${product.benefits[1] ?? 'Assembly takes 15 minutes'} with the included tools and a printed guide — no extra hardware needed.`,
      `${cap(product.keywords[1] ?? 'Space')}-conscious footprint: fits standard desks while keeping full range of motion.`,
      `Backed by a 24-month warranty and a support team that answers within one business day.`,
      `What's in the box: ${product.name}, hardware kit, quick-start guide, warranty card.`,
    ],
    searchTerms: product.keywords.slice(3).map((k) => k.toLowerCase()).join(' '),
  };
}

export function generateTiktokListing(product) {
  return {
    platform: 'tiktok',
    caption: `POV: your ${product.pain ?? 'setup'} finally fixed. ${cap(product.name)} — ${product.benefits[0] ?? 'game changer'}. ${product.hashtags.length ? '' : ''}`.slice(0, 150),
    hook: product.hook ?? `Stop scrolling if your ${product.pain ?? 'setup'} looks like this`,
    hashtags: product.hashtags.slice(0, 5),
  };
}

export function generateShopifyListing(product) {
  return {
    platform: 'shopify',
    seoTitle: `${cap(product.name)} | ${cap(product.keywords[0] ?? 'Ergonomic')}`.slice(0, 70),
    metaDescription: `${product.benefits[0] ?? 'Ergonomic'} ${product.name}. Free shipping, 24-month warranty, 30-day returns.`.slice(0, 160),
    faq: [
      `Is the ${product.name} easy to assemble? Yes — 15 minutes with included tools.`,
      `What's the warranty? 24 months covering manufacturing defects.`,
      'What if it doesn\'t fit my space? 30-day returns, no questions asked.',
    ],
  };
}

function cap(s) {
  return String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
}
