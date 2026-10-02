# 合成本機完整更新負載驗證協定（2026-10-02）

這份協定比較固定提交 `f969a89` 與目前本機重構的完整每日更新流程。它使用隔離 Node／記憶體 SQLite 和相同合成輸入，不讀取正式資料、環境憑證，不連網，也不發送正式更新。測試成功只表示這組本機資料與預算內的功能正確性；不表示估值準確度、真實歷史績效或正式 D1／Worker 容量通過。

## 固定輸入與升級規則

報價日固定為 2026-10-01，財報截止日為 2026-06-30，seed 為 20261002。每檔有 80 根因果 K 線，TW 使用 LTM、100m ordinary shares、同口徑歸母 ROE／淨利／營業利益。每個台股同業群最多 185 家，完整群每檔 PE／PB／PS 各有 184 筆可用觀測；缺 EV bridge，因此不捏造 EV 證據。資料、issuer、sourceNote 明示 synthetic；最後代碼有最高原生差距，以驗證排序涵蓋完整集合。

| 層級 | TW ready | US ready | 目的 |
|---|---:|---:|---|
| dense185 | 185 | 8 | 合法高密度單群，先捕捉每檔 184 同業的常駐記憶體問題 |
| groups740 | 740 | 8 | 四個互不混用的 185 家群組 |
| usefulReady6165 | 1,850 | 4,315 | 十群台股加小型美股輸入；接近已確認 universe 比例的有用壓力形狀 |

最後層級以已確認 universe 1,952 TW／4,315 US 為背景，並非宣稱 6,165 家真實公司全部 ready；近期正式 ready 為 1,769 TW／2,727 US。它是合成壓力形狀，沒有建立不現實的單一 4,000／6,000 家台股 peer pool，更不建立 10,000 家完整 peer map。

每臂必須依序通過上一層功能正確性；RSS、取樣 heap、wall time 都低於本機預算 80% 才能升級。最後層另用上一層實測 stock／history bytes 做保守 local RSS 預檢：上一層 kernel maxRSS 加新增 stock bytes 的兩份表示及新增 history bytes 的一份表示。這是截停規則，不是平台容量預測。超預算或缺測量時記 `NOT_RUN`，不強迫配置大池。

## 兩臂與完整流程

`f969a89` 的 tracked `lib/` 與 `scripts/daily-refresh.mjs` 由唯讀 Git 匯出至全新 ignored outputs 子目錄。候選臂使用目前本機檔案。每臂是獨立子行程與獨立記憶體 SQLite；相同層級採相同 run ID、manifest、原始 records 及 SHA-256 指紋。每臂另外記錄 runtime source tree hash，測量期間改動 source 會失敗。

流程確實呼叫各版本的 `prepareTaiwanRefreshGeneration`、`refreshUploadBatches`、`handleRefreshWrite(begin/batch/finalize)` 和 `handleDailyRead(scope=research)`，沒有用替代 helper 冒充更新。記錄每個 upload 的實際 JSON bytes；finalize 必須 publish complete、保存兩市場 seals。研究區逐頁遍歷完整原生差距排序，再驗反向差距、品質及現價排序的第一頁；每頁與完整 SQL 母集合一致、無漏碼／重複碼，並重新確認 selected stock 原生估值與研究資格。所有輸入與原生結果都必須保持版本一致。

## 真實測量及預算

- 子行程 Node old-space 上限 256 MiB；本機 RSS 截停 640 MiB、單臂 wall timeout 180 秒。它們與 Worker 的 128 MiB 概念限制分開，不能把本機 PASS 叫成 Worker 128 MiB PASS。
- 每 stage 記 wall、Node user/system CPU、stage 結尾 heap／RSS、取樣 stage peak、kernel process maxRSS。完整程序也記累計峰值。
- heap／RSS 每 20ms、SQL 回傳及 stage 邊界取樣；telemetry 至少每 250ms，父行程每 3 秒顯示進度。同步 JS 阻塞可能遮蔽短暫 heap 峰值，所以 sampled heap 是下界，並非保證絕對最大值。kernel maxRSS 為作業系統程序記錄，仍包含 Node／SQLite／TS loader。
- 本機 sandbox 不允許父行程以 `ps` 查 child RSS，因此使用真實 worker telemetry 及 kernel maxRSS；首次 `ps` 版本的中斷輸出保留、不納入兩臂結論。RSS 預算由已觀測 SQL／stage 邊界及 telemetry 截停；Node heap flag 與父行程 timeout 另獨立限制。它不能硬限制尚未被取樣的 native allocation。
- SQLite wrapper 每次真正執行 `run/all/first` 計一個 SQL；batch 每個 statement 各計一次，harness 的 BEGIN／COMMIT 不列 D1 查詢。每個 write／read invocation 記 query delta，分別記 begin、batch、finalize、research-read 最大值與全體 `maxQueriesPerInvocation`。研究 paging stage 合計不拿來對照每請求 50／1,000 等正式 quota；真正適用的是單次 finalize 或 read invocation 值。正式限制仍需按實際方案與官方來源核對。
- 每次回傳 stock JSON 的 SQL page 記實際 UTF-8 stock bytes／rows。含 `json_remove` 的原生 source projection 與 full stored stock 分開統計。這些是資料本身 bytes，沒有冒稱全部 HTTP／D1 envelope bytes。各完整 research HTTP response bytes 另記。
- 所有 artifact 以新目錄與 `wx` 寫入；既有輸出不覆寫。Node env 僅繼承 PATH／LANG／TMPDIR，global fetch 強制失敗；synthetic refresh key 只在隔離 handle API 呼叫使用。

## 重現

```sh
node --experimental-strip-types scripts/validate-refresh-load-local.mjs --levels=dense185,groups740
```

若某臂 740 有安全餘裕，可明確包含最後預檢層級；即使指定仍會按各臂結果自行記 NOT_RUN：

```sh
node --experimental-strip-types scripts/validate-refresh-load-local.mjs --levels=dense185,groups740,usefulReady6165
```

單獨基準可以使用 `--arms=baseline`，候選可以使用 `--arms=candidate`。只有同一 fixture SHA 的測量可做跨臂比較。输出有 stdout JSONL、stderr、各 arm JSON、summary 和 pinned baseline exports；未完成／OOM／timeout 保存已完成 stages、最後進度及日志，不補造 missing metrics。

目前初始 185 基準已捕捉完整 prepare/upload/finalize/research paging。本文件保留固定測試協定；最終測量資料與限制由 summary artifacts 與主報告引用，不能將任一 Node 成功直接外推到正式網站。


## 2026-10-02 完整本機測量與未執行項目

完整兩臂資料：[summary](../outputs/refresh-load-20261002-5a76aaa6-139a-406c-8569-b3c9e011f001/summary.json)。兩臂各層原始 fixture SHA 完全相同；固定基準與候選 runtime source tree SHA 分別為 `516efe0154b05c64ceb2c159c050dd9d1e37c3859fb694457c1c9b15cd1aeb86`／`9ac4b535a4c6c9c2f68d75894bdd553f44cdf8b5e7a5f785923cabad35f68602`，每個完成臂測量前後相同。

| 層級／臂 | 完整結果 | finalize wall | finalize sampled peak heap | 程序 kernel peak RSS | 單次 finalize SQL | 單次 research read 最大 SQL |
|---|---|---:|---:|---:|---:|---:|
| 185／f969a89 | PASS | 915 ms | 183.43 MiB | 362.69 MiB | 32 | 24 |
| 185／候選 | PASS | 978 ms | 90.28 MiB | 271.13 MiB | 48 | 24 |
| 740／f969a89 | finalize heap limit SIGABRT | NOT_COMPLETED | NOT_COMPLETED | 最後 telemetry 取樣約 521 MiB（下界） | NOT_COMPLETED | NOT_RUN |
| 740／候選 | PASS | 3,847 ms | 177.63 MiB | 531.05 MiB | 141 | 70 |
| 1,850 TW＋4,315 US／兩臂 | NOT_RUN：上一層失敗／餘裕不足 | — | — | — | — | — |

候選 740 完整 prepare 約 345 ms、upload 約 3,786 ms、全研究排序／分頁約 76,188 ms；740 台股及 8 美股全部研究 identity 逐頁讀回，無漏碼／重複。研究 paging stage 的 3,082 SQL 是多次 request 累計，不能拿它對單次 request quota 作判斷。單次最大值為 finalize 141、research read 70。seals、upload bytes、每次 request/query delta、CPU 及所有 stage 資料在 JSON 保留。

185 密集基準最大的返還 full stock JSON query 約 29.92 MB；候選 native source projection 只回 225,395 bytes（一頁）。740 候選兩頁 projection 合計 902,339 bytes，最大頁 609,687 bytes；完整 target／seal page 最大 1,942,233 bytes。研究返回 20 檔的選取 query 最大約 3.24 MB，這是別於 2 MiB integrity page 的另一種 request。

需要區分常駐記憶體與 CPU／query 取捨：185 finalize 取樣 heap 大幅降低，但 wall 並未變快、SQL 增加；完整研究分頁本來就反覆核對全市場 seal，因此 740 全遍歷耗時約 76 秒。以上不代表正式方案或正式 Worker 通過，740 的 Node 取樣 heap 也超過 128 MiB；SQLite 常駐、前面 prepare/upload 的垃圾回收及 Node runtime 都影響峰值，不能從這些数值精確推算 remote D1 的 Worker heap。

原完整測量的 native digest 包含 native center/gap/confidence/model ids/weights，但測量 helper 當時誤用不存在的 `model.fairValue` 欄位，未包含每個 model value。已修正為真實 `value/rangeLow/rangeHigh` 並新增能識別「平均中心相同但模型值不同」的回歸測試；下列獨立有界產出比較補齊完整模型值，沒有改寫原性能測量，也沒有宣稱這個 proof-only 臂測了 upload/finalize/read。

[完整原生产出 proof-only summary](../outputs/refresh-load-20261002-b130f029-639e-4d99-9096-a0225dcd416e/summary.json) 使用相同 fixture SHA 與相同 runtime source tree SHA。185／740 所有 prepare 產生的原生 FV、gap、資格／信心及每模型 id/value/rangeLow/rangeHigh/weight 都保存為逐檔 JSON。driver 對兩臂完整陣列執行 `assert.deepEqual`，summary 的 `nativeDeepEqual=true`；SHA 兩臂分別完全一致：

- 185：`df7e9a41dacdd86f629f1b1b97fd3c314a1f15bf32c69327805c2e03d0b136ac`
- 740：`480807cd39f6b5bb04e891f969bee1f6191ed47da1dd68c0ccd5960c59684e8e`

重現此獨立語義 proof：

```sh
node --experimental-strip-types scripts/validate-refresh-load-local.mjs --levels=dense185,groups740 --native-proof-only=true
```

它回報 `goal=native-output-proof-only`、`verificationOnly=true`，只有 prepare 與 native 比較 stages，沒有完成更新／seal／讀取容量的意思。baseline 740 真正完整測量仍然是 finalize 失敗；較大市場形狀與正式 D1／Worker 實測仍未完成。
