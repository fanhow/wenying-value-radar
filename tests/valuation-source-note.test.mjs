import assert from 'node:assert/strict';
import test from 'node:test';
import { valuationSourceNote } from '../lib/valuation-source-note.ts';

test('legacy Taiwan note loses the unsupported period-end assurance without mutating source data', () => {
  const stock = {market:'TW', source:'每日雲端更新', sourceNote:'擷取 2026-09-20；每股流量採期末普通股，EPS 保留供應商稀釋口徑；現金尚未核證', financialMetrics:{shareBasis:'period-end-ordinary'}};
  const before = structuredClone(stock);
  const note = valuationSourceNote(stock, 'zh');
  assert.doesNotMatch(note, /每股流量採期末普通股/);
  assert.match(note, /期末基礎未核證/);
  assert.match(note, /2026-09-20/);
  assert.match(note, /現金尚未核證/);
  assert.match(note, /不能只憑/);
  assert.deepEqual(stock, before);
});

test('current provider shares and missing legacy labels both receive bilingual caution', () => {
  for (const shareBasis of ['provider-as-of-ordinary', 'period-end-ordinary', undefined]) {
    const stock = {market:'TW', source:'每日雲端更新', financialMetrics:{shareBasis}};
    assert.match(valuationSourceNote(stock, 'zh'), /股數口徑提醒/);
    assert.match(valuationSourceNote(stock, 'en'), /does not verify period-end shares/);
    assert.match(valuationSourceNote(stock, 'en'), /not, by itself, proof/);
  }
});

test('US and ordinary manual notes retain their existing presentation', () => {
  assert.equal(valuationSourceNote({market:'US',sourceNote:'Original provider note',financialMetrics:{}},'zh'), 'Original provider note');
  const manual = {market:'TW',source:'手動輸入'};
  assert.match(valuationSourceNote(manual,'zh'), /^這是你手動建立的估值/);
  assert.match(valuationSourceNote(manual,'en'), /^This is a manually created valuation/);
  assert.doesNotMatch(valuationSourceNote(manual,'zh'), /股數口徑提醒/);
  assert.equal(valuationSourceNote({...manual,financialMetrics:{}},'zh'), valuationSourceNote(manual,'zh'));
});
