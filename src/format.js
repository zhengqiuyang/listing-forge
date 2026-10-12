// 多平台 listing 格式校验：确定性规则层（不用 LLM——格式合规是数学，不是语义）。
// Amazon 标题 200 字符/禁用词、五点结构、search terms 不重复标题词；
// TikTok 短文案长度；Shopify SEO 页面结构。
const AMAZON_BANNED_IN_TITLE = [
  'best', 'cheapest', 'free shipping', '100%', 'guarantee', 'hot sale',
  'top rated', 'no.1', '#1', 'sale', 'discount', 'coupon',
];

export function validateAmazonListing(listing) {
  const errors = [];
  const warnings = [];
  const title = listing.title ?? '';
  if (title.length > 200) errors.push(`标题 ${title.length} 字符，超过 Amazon 200 上限`);
  for (const w of AMAZON_BANNED_IN_TITLE) {
    if (title.toLowerCase().includes(w)) errors.push(`标题含禁用词: "${w}"`);
  }
  if (title === title.toUpperCase() && /[a-z]/i.test(title)) warnings.push('标题全大写（仅型号可以）');
  const bullets = listing.bullets ?? [];
  if (bullets.length === 0) errors.push('缺少五点描述（bullets）');
  bullets.forEach((b, i) => {
    if (b.length > 500) warnings.push(`五点第 ${i + 1} 条 ${b.length} 字符，建议 <500`);
    if (b.length < 50) warnings.push(`五点第 ${i + 1} 条过短（<50），信息量不足`);
  });
  const st = listing.searchTerms ?? '';
  if (st) {
    const titleWords = new Set(title.toLowerCase().split(/\W+/));
    const dup = st.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && titleWords.has(w));
    if (dup.length) warnings.push(`search terms 与标题重复词（浪费字节）: ${[...new Set(dup)].join(', ')}`);
  }
  return { platform: 'amazon', errors, warnings, pass: errors.length === 0 };
}

export function validateTiktokListing(listing) {
  const errors = [];
  const warnings = [];
  const caption = listing.caption ?? '';
  if (caption.length > 2200) errors.push(`文案 ${caption.length} 字符，超过上限`);
  if (caption.length > 150) warnings.push('TikTok 文案前 150 字符决定折叠前的露出，核心卖点应前置');
  if (!listing.hashtags?.length) warnings.push('无 hashtag（建议 3-5 个，含 1 个品类大词）');
  if (!listing.hook) errors.push('缺少 hook（前 3 秒钩子脚本）');
  return { platform: 'tiktok', errors, warnings, pass: errors.length === 0 };
}

export function validateShopifyListing(listing) {
  const errors = [];
  const warnings = [];
  if (!listing.seoTitle) errors.push('缺少 SEO title');
  if (listing.seoTitle && listing.seoTitle.length > 70) warnings.push(`SEO title ${listing.seoTitle.length} 字符，搜索结果会截断（建议 ≤70）`);
  if (!listing.metaDescription) errors.push('缺少 meta description');
  if (listing.metaDescription && listing.metaDescription.length > 160) warnings.push('meta description 超过 160 字符');
  if (!listing.faq?.length) warnings.push('无 FAQ（长尾关键词载体，建议 ≥3 条）');
  return { platform: 'shopify', errors, warnings, pass: errors.length === 0 };
}

const VALIDATORS = { amazon: validateAmazonListing, tiktok: validateTiktokListing, shopify: validateShopifyListing };

export function validateListing(platform, listing) {
  const fn = VALIDATORS[platform];
  if (!fn) throw new Error(`不支持的平台: ${platform}`);
  return fn(listing);
}

// 语域检查（确定性先行版）：Amazon 与 TikTok 的词汇表不应混用——
// " OMG so good!!" 出现在 Amazon 五点里就是语域事故。
const TIKTOK_ONLY = ['omg', 'lol', 'no way', 'slay', 'bestie', 'vibe', 'vibes', 'obsessed'];
const AMAZON_ONLY = ['durable construction', 'satisfaction guaranteed', 'premium quality'];

export function registerCheck(platform, listing) {
  const text = JSON.stringify(listing).toLowerCase();
  const foreign = platform === 'amazon' ? TIKTOK_ONLY : AMAZON_ONLY;
  const hits = foreign.filter((w) => text.includes(w));
  return { platform, registerClean: hits.length === 0, foreignPhrases: hits };
}
