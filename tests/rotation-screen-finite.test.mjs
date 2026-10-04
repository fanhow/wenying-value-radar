import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {screenFeature,rankResearch} from '../lib/rotation-screen.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/rotation-screen-finite-golden.json',import.meta.url),'utf8'));
const input=golden.inputs[0];
const nonfinite=[NaN,Infinity,-Infinity];
const numericFields=['price','earningsYield','fcfYield','roe','debtRatio','growth','momentum21','momentum63'];

test('finite guards preserve the complete pre-change cohort features and ranks exactly',()=>{
  const features=golden.inputs.map(screenFeature);
  assert.deepEqual(features,golden.features);
  assert.deepEqual(rankResearch(features,'US'),golden.ranked);
  assert.deepEqual(rankResearch(features.toReversed(),'US'),golden.ranked);
  assert.equal(features.length,12);
  assert.deepEqual(rankResearch(features,'TW'),[]);
});

test('nonfinite history lengths, reference closes and raw numeric factors never qualify',()=>{
  for(const field of ['bars','close21','close63']) {
    for(const value of nonfinite)assert.equal(screenFeature({...input,[field]:value}),null,`${field}=${value}`);
  }
  for(const field of ['price','eps','fcfPerShare','roe','debtRatio','revenueGrowth']) {
    for(const value of nonfinite)assert.equal(screenFeature({...input,stock:{...input.stock,[field]:value}}),null,`${field}=${value}`);
  }
  for(const field of ['close21','close63']) {
    for(const value of [null,0,-1])assert.equal(screenFeature({...input,[field]:value}),null,`${field}=${value}`);
  }
});

test('finite-input division overflow cannot become a yield or momentum factor',()=>{
  const stock=input.stock;
  const cases=[
    {...input,stock:{...stock,price:0.5,eps:Number.MAX_VALUE},close21:0.5,close63:0.5},
    {...input,stock:{...stock,price:0.5,fcfPerShare:Number.MAX_VALUE},close21:0.5,close63:0.5},
    {...input,stock:{...stock,price:Number.MAX_VALUE,eps:Number.MAX_VALUE,fcfPerShare:Number.MAX_VALUE},close21:0.5,close63:Number.MAX_VALUE},
    {...input,stock:{...stock,price:Number.MAX_VALUE,eps:Number.MAX_VALUE,fcfPerShare:Number.MAX_VALUE},close21:Number.MAX_VALUE,close63:0.5},
  ];
  for(const row of cases)assert.equal(screenFeature(row),null);
  assert.deepEqual(rankResearch([...golden.features,...cases.map(screenFeature).filter(Boolean)],'US'),golden.ranked);
});

test('finite validation retains existing boundaries, signed factors and underflow semantics',()=>{
  const boundary=screenFeature({...input,bars:64,close21:input.stock.price*2,stock:{...input.stock,revenueGrowth:-5}});
  assert.ok(boundary);
  assert.equal(boundary.growth,-5);
  assert.equal(boundary.momentum21,-0.5);
  // This fix adds finite checks only, without an integer or source-period policy.
  assert.ok(screenFeature({...input,bars:64.5}));
  assert.deepEqual(screenFeature({...input,stock:{...input.stock,dataBasis:'estimated'}}),golden.features[0]);
  const underflow=screenFeature({...input,stock:{...input.stock,price:Number.MAX_VALUE,eps:Number.MIN_VALUE,fcfPerShare:Number.MIN_VALUE},close21:Number.MAX_VALUE,close63:Number.MAX_VALUE});
  assert.ok(underflow);
  assert.equal(underflow.earningsYield,0);
  assert.equal(underflow.fcfYield,0);
  assert.equal(underflow.momentum21,0);
  assert.ok(screenFeature({...input,stock:{...input.stock,price:1,eps:Number.MAX_VALUE},close21:1,close63:1}));
});

test('direct ranking excludes nonfinite rows before counting or calculating percentiles',()=>{
  for(const field of numericFields)for(const value of nonfinite) {
    const invalid={...golden.features[0],ticker:'INVALID',[field]:value};
    assert.deepEqual(rankResearch([...golden.features,invalid],'US'),golden.ranked,`${field}=${value}`);
    assert.deepEqual(rankResearch([invalid,...golden.features.toReversed()],'US'),golden.ranked);
    assert.deepEqual(rankResearch([...golden.features.slice(0,9),invalid],'US'),[]);
  }
  for(const row of rankResearch(golden.features,'US')) {
    assert.ok(numericFields.every(field=>Number.isFinite(row[field])));
    assert.ok(Number.isFinite(row.score));
  }
});
