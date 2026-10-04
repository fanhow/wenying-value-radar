import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getTaiwanShareBasisReview} from '../lib/taiwan-share-basis-review.ts';

const review=getTaiwanShareBasisReview({market:'TW',ticker:'6949'});
const capitalReductionReview=getTaiwanShareBasisReview({market:'TW',ticker:'6176'});
let directory,Notice;
test.before(async()=>{
  directory=await mkdtemp(new URL('../.wrangler/share-basis-ui-test-',import.meta.url));
  const output=path.join(directory,'page.cjs');
  await build({entryPoints:[new URL('../app/page.tsx',import.meta.url).pathname],outfile:output,
    bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',logLevel:'silent'});
  Notice=createRequire(import.meta.url)(output).ShareBasisReviewNotice;
});
test.after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

test('renders the actual source-reviewed reason and official URLs without a new fair value',()=>{
  const html=renderToStaticMarkup(React.createElement(Notice,{review,language:'zh'}));
  assert.match(html,/role="status"/);
  assert.match(html,/股數口徑待覆核／自動估值暫停/);
  assert.match(html,/1 股換發 20 股/);
  assert.match(html,/仍可查看 K 線與加入觀察清單/);
  assert.equal((html.match(/target="_blank"/g)??[]).length,review.sourceUrls.length);
  for(const url of review.sourceUrls)assert.ok(html.includes(url.replaceAll('&','&amp;')));
  assert.doesNotMatch(html,/NT\$|公允價值[:：]\s*\d/);
});

test('retains manual input context without claiming automatic source clearance',()=>{
  const html=renderToStaticMarkup(React.createElement(Notice,{review,language:'zh',userManaged:true}));
  assert.match(html,/目前保留你提供的手動或方舟資料/);
  assert.match(html,/不代表自動資料覆核已完成/);
  assert.doesNotMatch(html,/不產生自動公允價值/);
});

test('provides a readable English status and excludes unsafe source links',()=>{
  const unsafe={...review,sourceUrls:[...review.sourceUrls,'javascript:alert(1)','http://example.test','invalid-url']};
  const html=renderToStaticMarkup(React.createElement(Notice,{review:unsafe,language:'en'}));
  assert.match(html,/automatic valuation paused/);
  assert.match(html,/Automatic fair value remains unavailable pending review/);
  assert.match(html,/Price charts and the watchlist remain available/);
  assert.equal((html.match(/target="_blank"/g)??[]).length,review.sourceUrls.length);
  assert.doesNotMatch(html,/javascript:|http:\/\/example\.test|invalid-url/);
});

test('renders the 6176 cash reduction and equity bridge reason with all four official sources',()=>{
  const html=renderToStaticMarkup(React.createElement(Notice,{review:capitalReductionReview,language:'zh'}));
  assert.match(html,/role="status"/);
  assert.match(html,/data-share-basis-review="6176"/);
  assert.match(html,/6176 已核證現金減資及季後庫藏股買回/);
  assert.match(html,/6\/30 歸母權益/);
  assert.match(html,/退款、權益、普通股與每股流量完整橋接/);
  assert.match(html,/不以減資比例修正目標價/);
  assert.match(html,/不重扣已認列股利/);
  assert.match(html,/不產生自動公允價值/);
  assert.match(html,/仍可查看 K 線與加入觀察清單/);
  assert.equal((html.match(/target="_blank"/g)??[]).length,4);
  for(const url of capitalReductionReview.sourceUrls)assert.ok(html.includes(url.replaceAll('&','&amp;')));
  assert.doesNotMatch(html,/1 股換發 20 股|NT\$|公允價值[:：]\s*\d/);
});

test('retains manual or ARKER context for 6176 without clearing the cash reduction review',()=>{
  const html=renderToStaticMarkup(React.createElement(Notice,{review:capitalReductionReview,language:'zh',userManaged:true}));
  assert.match(html,/6176 已核證現金減資/);
  assert.match(html,/目前保留你提供的手動或方舟資料/);
  assert.match(html,/不代表自動資料覆核已完成/);
  assert.equal((html.match(/target="_blank"/g)??[]).length,4);
  assert.doesNotMatch(html,/不產生自動公允價值|NT\$|公允價值[:：]\s*\d/);
});

test('explains the 6176 share count or capital change in English without inventing a fair value',()=>{
  const html=renderToStaticMarkup(React.createElement(Notice,{review:capitalReductionReview,language:'en'}));
  assert.match(html,/data-share-basis-review="6176"/);
  assert.match(html,/change in share count or capital/);
  assert.match(html,/Automatic fair value remains unavailable pending review/);
  assert.match(html,/Price charts and the watchlist remain available/);
  assert.equal((html.match(/Official source \d/g)??[]).length,4);
  assert.doesNotMatch(html,/NT\$|fair value[:：]\s*\d|1.for.20/i);
});
