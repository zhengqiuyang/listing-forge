import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAmazonListing, generateTiktokListing, generateShopifyListing,
} from '../src/listings.js';
import { validateListing, registerCheck } from '../src/format.js';

const PRODUCT = {
  name: 'RisePro standing desk converter',
  keywords: ['standing desk converter', 'desk riser', 'height adjustable', 'office ergonomics', 'work from home'],
  benefits: ['Rock-solid at full extension', 'Ships 90% pre-assembled'],
  spec: 'fits dual monitors up to 27 inch',
  pain: 'wobbly desk setup',
  hook: 'Your desk shouldn\'t wobble',
  hashtags: ['#desksetup', '#wfh', '#ergonomics'],
};

test('生成器与校验器互锁：Amazon listing 通过全部校验', () => {
  const listing = generateAmazonListing(PRODUCT);
  const format = validateListing('amazon', listing);
  const register = registerCheck('amazon', listing);
  assert.equal(format.pass, true, JSON.stringify(format.errors));
  assert.equal(register.registerClean, true, JSON.stringify(register));
});

test('生成器与校验器互锁：TikTok / Shopify 通过', () => {
  const tt = validateListing('tiktok', generateTiktokListing(PRODUCT));
  assert.equal(tt.pass, true, JSON.stringify(tt.errors));
  const sf = validateListing('shopify', generateShopifyListing(PRODUCT));
  assert.equal(sf.pass, true, JSON.stringify(sf.errors));
});

test('生成器抗注入：产品名带禁用词会被校验器拦下（生成器不掩盖问题）', () => {
  const dirty = generateAmazonListing({ ...PRODUCT, benefits: ['BEST thing ever'] });
  const format = validateListing('amazon', dirty);
  assert.equal(format.pass, false); // 校验器尽责报错
  assert.ok(format.errors.some((e) => e.includes('禁用词')));
});

test('Amazon 标题超 200 字符时生成器主动截断', () => {
  const long = generateAmazonListing({ ...PRODUCT, name: 'X'.repeat(300), keywords: ['standing desk converter'] });
  assert.ok(long.title.length <= 200);
});
