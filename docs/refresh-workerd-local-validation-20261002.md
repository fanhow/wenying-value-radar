# 本機 workerd 有界刷新驗證（2026-10-02）

本機 workerd 的 **185 檔合成台股端點／SQLite／序列化流程通過**；正式 Worker 容量仍為 **NOT_CERTIFIED**。不得把本報告當成 128 MB、CPU、D1 方案配額或正式全市場 refresh 通過證明。740 檔未執行。

## 範圍與隔離

`scripts/validate-refresh-workerd-local.mjs` 用已安裝的 esbuild 0.28.0，編譯最小 ESM fetch 入口及現行 core，不使用 Sites、正式帳戶、正式 DB ID、秘密或外部來源。Miniflare 4.20260515.0 / workerd 1.20260515.1 只綁 `127.0.0.1` 的隨機 port。`cf:false` 避免啟動擷取 Cloudflare metadata；worker 的外部 fetch 被拒絕，`outboundService` 也阻擋外部流量，最後計數為 0。

DB binding 使用隨機 `synthetic-local-*` ID，`d1Persist:false`；它是 Miniflare 隨機暫存目錄中的本機 SQLite，並非純 RAM。完成後 dispose runtime，刪除編譯暫存檔。只有隔離 DB 的 off-page tamper 測試寫入人工異常值；没有正式寫入。

本機 compatibility date 為 runtime 支援的 `2026-05-15`、flag `nodejs_compat`。正式設定為 `2026-08-16`，比本機 runtime 新；本報告不宣稱正式版本／日期完全等價。Node 版本為 v22.22.3。沙盒不允許 localhost listen，執行使用已授權的 localhost 隔離測試例外。

## 固定输入與結果

沿用獨立 deterministic fixture：185 檔 TW、8 檔 US，TW 每檔 184 同業；報價日 2026-10-01、財報截止日 2026-06-30、每檔 80 根平坦合成 K 線。這些是工程負載資料，不是真實 17 檔公開擷取、不代表實際全市場密度或估值準確率。

現行 Node collector core 的 prepare 與 workerd local prepare route，逐檔完整 peer evidence 的摘要相同：`4233646a66c0d187c0d0574f2f4f6f062c7c1dc0fdd4503107ae4a352bce3dc2`。local prepare route 只用於引擎驗證，並非正式 endpoint。

| 驗證 | 最終本機結果 |
| --- | --- |
| prepare 引擎等價 | PASS；193 records，185 TW，每檔最大 184 peers |
| begin／25 batches／finalize | PASS；complete，TW 185 ready、US 8 ready |
| finalize | 48 D1 statements；wall time 約 1,055.94 ms；最大 stock 查詢頁 1,941,059 bytes |
| 原生研究全池排序／10 頁遍歷 | PASS；185 身分無缺漏、無重複，字典序最後股票為最高研究 gap |
| 正式台股資格 | PASS；全部低信心，正式低估／高估榜均 0 檔 |
| API 合法最大 limit=100 | PASS；與全池預期前 100 檔相同；回應 16,176,767 bytes |
| 頁外第一名 cache gap 改成 -0.99 | PASS；獨立 seal 阻擋 suppression，TW `refresh_required`、研究空陣列 |
| 740 檔 | SKIP；無經核驗的 isolate 峰值餘裕，不擴大負載 |

2 MiB 是來源／證據／seal完整性查詢頁的 byte boundary，**不是 API 最終選取頁或 HTTP 回應大小上限**。20 檔選取頁約 3.24 MB，100 檔約 16.18 MB；完整排序與 seal 沒有截斷。

## 真實引擎取樣與限制

透過 raw workerd inspector，選 user isolate 的 CDP `Runtime.getHeapUsage`，在請求完成後取樣：

| Checkpoint | usedSize MiB | totalSize MiB |
| --- | ---: | ---: |
| prepare | 21.73 | 55.23 |
| finalize | 61.06 | 131.48 |
| 第一頁研究查詢 | 139.57 | 219.12 |
| limit=100 | 313.03 | 384.80 |
| 最後 seal tamper 查詢 | 331.77 | 400.61 |

這些是真實本機 user-isolate **checkpoint**，不是峰值、不是 RSS，也不是強制 GC 後必需保留的 live heap；可能含尚未回收的暫存配置。它們超過 128 MiB，足以拒絕「本機成功即正式記憶體安全」的說法，但不能據此斷言正式 runtime 必然同樣 OOM。未執行完整 allocation tracing／正式 memory limiter。另一次獨立強制 GC 診斷中，兩個 `HeapProfiler.collectGarbage` 呼叫均在 3 秒 timeout，before／after checkpoint 未變；結果為 `NOT_MEASURED: command_timeout`，不能聲稱取得 GC 後 live heap，也不能宣稱引擎不支援 GC。診斷輸出 `outputs/refresh-workerd-forcedgc-20261002-v2/result.json`，SHA256 `78b4b4f9992307d4deb363f7eb3cdfbd8b41f74df8fc5692775d09942e44173a`。

固定版本 [workerd 原始碼](https://github.com/cloudflare/workerd/blob/v1.20260515.1/src/workerd/server/server.c%2B%2B#L1620) 使用 `NullIsolateLimitEnforcer`，本機不執行正式 isolate／request limits。正式 Worker 的 128 MB、CPU 與 D1 Free 50／Paid 1,000 statements 仍須依 [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) 與 [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) 分別核驗；本機約 1 秒 wall time 也不是正式 CPU 量測。

來源投影後 finalize 約為 `14 + P_source + 2 × P_full_TW + P_US` statements；185 實測為 `14 + 1 + 2 × 16 + 1 = 48`。原來 `14 + 3 × P_full_TW + P_US` 已不適用。合成 6,000 TW 密集群組仍可超過 Paid 1,000；没有執行該規模 workerd 流程，也不外推正式 4,461 檔資料密度。

## 可審核證據

- 最終 raw 結果：`outputs/refresh-workerd-20261002-final-v3c/result.json`，SHA256 `d095346a68f4414b97274f710c39daca80cc5a3a2da0306b9c2a0fd7f168933b`。
- 固定 core：`lib/daily-refresh-store.ts` SHA256 `5858b89707abbe23f2e42aba1db0852fb4eac5814a8602ed3ebe75fe94ec066c`；`lib/taiwan-comparables.ts` SHA256 `d611cdad354a953207cd1cfcc5be891cdfa6ac0a63bce99573c792b216c7e3f3`；bundle 前後核對核心檔案摘要不變。
- 最後獨立 741 組 f969a89 前後等價：`outputs/local-validation/independent-parity-20261002-final-v3.json`，PASS。含真 memory 7＋PCB 10與合成 9 股票的 duplicate／conflict、日期、股數、invalid reference、missing／null／負值／非有限值／錯型別反例。
- 新 harness 單元測試 3/3 PASS，index tests 5/5 PASS；全套測試由 root 整合執行。

此驗證支持本機 core 引擎相容與 fail-closed 行為，沒有解除正式容量／版本同步／回復的先決條件。發布 root 已獲使用者授權；本次沒有操作部署或新增正式資源。
