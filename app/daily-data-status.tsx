"use client";
import { useEffect, useState } from 'react';
import type {DailyClientStatus} from '../lib/daily-client-state';
type Status=DailyClientStatus&{startedAt?:string;completedAt?:string;expectedSessions?:{TW:string;US:string};coverage?:{TW:{total:number;ready:number};US:{total:number;ready:number}};latestAttempt?:{state:string;error?:string}};
export function DailyDataStatus({onStatus}:{onStatus?:(status:DailyClientStatus)=>void}={}) {
  const [status,setStatus]=useState<Status|null>(null);
  useEffect(()=>{
    let disposed=false,sequence=0;
    let pending:AbortController|undefined;
    const load=async()=>{
      const requestId=++sequence;
      pending?.abort();const controller=new AbortController();pending=controller;
      const timeout=setTimeout(()=>controller.abort(),15000);
      let next:Status;
      try {const response=await fetch('/api/daily-status',{cache:'no-store',signal:controller.signal});const body=await response.json();
        next=response.ok&&typeof body.state==='string'?body:{state:'unavailable'};
      }catch {next={state:'unavailable'};}
      finally {clearTimeout(timeout);}
      if(!disposed&&requestId===sequence){setStatus(next);onStatus?.(next);}
    };
    void load();const timer=setInterval(()=>void load(),60000);return()=>{disposed=true;pending?.abort();clearInterval(timer);};
  },[onStatus]);
  const okay=status&&['complete','partial'].includes(status.state);
  return <section className="data-layer-banner" aria-live="polite" style={{borderColor:okay?'#487b66':'#bb8535',margin:'16px 0'}}>
    <div><strong>{!status?'正在核對每日更新狀態':okay?(status.state==='partial'?'每日資料已更新 · 部分股票資料不足':'每日資料已更新'):'資料未就緒／過期／更新失敗：暫停使用排名'}</strong>
    <p>每日台灣時間 06:30 更新，07:30 重試；08:00 選股任務讀取同一份資料。採最新已完成交易日收盤價，非盤中即時報價。</p>
    {status?.completedAt&&<p>最近完成：{new Date(status.completedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台灣） · 台股 {status.expectedSessions?.TW} · 美股 {status.expectedSessions?.US}</p>}
    {status?.coverage&&<p>可用／檢查：台股 {status.coverage.TW.ready}／{status.coverage.TW.total}、美股 {status.coverage.US.ready}／{status.coverage.US.total}。缺漏或過期股票已排除，排名僅代表可用資料範圍。</p>}
    <p>Yahoo Finance 公開日線及季度／TTM 財務資料；財報每日檢查，並非每天有新財報。歷史固定基準不作為今日估值。</p>
    {okay&&!status.taiwanValuationCurrent&&<p>台股新模型批次尚未就緒：暫停台股估值排名，K 線與獨立技術研究仍可使用。</p>}
    {okay&&status.taiwanValuationCurrent&&<p>台股採同交易日同行模型。模型不足或待覆核者不列入估值排名，亦不把空值視為零元。</p>}
    {status?.latestAttempt?.state==='failed'&&<p>最近更新失敗：{status.latestAttempt.error}</p>}</div>
  </section>;
}
