# TPEx 自身歷史倍數補充研究：固定規格

接續已鎖定的 TWSE 規格，不修改其輸入、結果或 SHA。於批次擷取前固定本規格；1580 的 2025 年 12 月末列已於來源驗證階段看過，不能再稱盲測。

## 目標與來源

- 固定上櫃普通股 `1580 新麥、8183 精星`，2021–2025 五個已完成年度，全部保留，不看結果更換公司／年度。
- 使用官方個股月表 POST `https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryStock`；form `date=YYYY/12/01&code=TICKER&response=json`。`date` 選整個月份，不是只有第一日。與 TWSE 的 GET、日期格式和欄位順序分開處理。
- 保存完整 rawBody、HTTP status、擷取 UTC、POST body 與 SHA-256。CLI 新建檔採排他方式，不覆寫已保存的樣本或 TWSE 資料。網路失敗、收到 headers 後 body 失敗、官方無資料分開記錄。
- 結構至少檢查 `stat=ok`、根層 `date=YYYY1201`、table0 的公司／月份 subtitle、日期／本益比／殖利率／股利年度／PB／財報年季六欄、筆數及列寬；不拿第一份不明表格湊資料。table1 為股利輔表，可能有較晚年度數字，保留在 raw 但不加入歷史觀測。

## 取樣及解釋

沿用 TWSE 研究的先選日期原則：從該年 12 月所有有效日期選最大一日，其 PE／PB 缺值時仍選該列，不能往前找有效值。日期、重複列、欄位／身分錯誤使整份 capture 不進統計，原始異常保留。

TPEx ROC 日期 `YYY/MM/DD` 與季度 `YYYQn` 只在語法、月份、真實曆日及季度不晚於觀測日均有效時解讀。未知期別不猜；倍數缺值不補零，負數／零／非有限／不明字串保留各別原因，不以極端值勝負改門檻。

每股固定五格，PE／PB 分開計正值有效年數和 median。有效值 median 只作 partial descriptive summary；完整五年 median 必須五年皆有值。沒有 winsorization、trim、年度替換或以外部 selected multiple 擬合折扣。

數字是目前可取得的官方歷史日表，不是已核證 FY EPS、精確流通股數或第三方選定倍數。原發布時間／修訂紀錄／逐列替代價格旗標未取得時維持 unknown，不宣稱完整 PIT；TPEx 本輪未找到不回溯承諾，不得移用 TWSE 的聲明。TPEx 與 TWSE 各自保留 method source，不能因欄名近似便主張完全同口徑。

官方來源：[依代碼頁](https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html)，其介面說明自 2012-09 提供；計算說明保存在 response table0.notes。PE 使用最近四季稅後纯益與發行股數，PB 為收盤價／每股淨值；原文沒有將本輪所有 PB 分母明示為 MOPS reference BVPS，也沒有核證現金減資的完整調整。這些缺口不能靠近似欄名補成已核證。

## 邊界與合併

只補來源與描述性摘要，不改正式估值／排行／`lib/valuation.ts`，不產生 FV、upside、不反推 EPS／股數。先前 TWSE 研究結果對 1580／8183 標示 unsupported 是當時狀態，不能覆寫；本輪另存 TPEx 檔，若合併展示須保留兩份來源與各自 SHA／規格。

若之後研究「官方 reference BVPS × 歷史 PB」價格敏感度，必須另立規格，先處理當期財報日期、公司行動及股份基礎，不偷偷把這份描述性 median 變成 production multiple。當前來源發現的全市場日表只作未來效能選項，本批不改成另一取樣設計。
