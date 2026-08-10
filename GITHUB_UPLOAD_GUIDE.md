# 發布到 GitHub

目標儲存庫：`fanhow/wenying-value-radar`

1. 解壓縮 `wenying-value-radar-github.zip`
2. 開啟 GitHub 儲存庫的 **Code** 頁面
3. 選擇 **Add file → Upload files**
4. 將「解壓後資料夾裡的所有檔案與資料夾」拖入上傳區
5. Commit message 可填：`Publish WenYing Value Radar`
6. 選擇 **Commit directly to the main branch**，再按 **Commit changes**

請上傳解壓後的內容，不要只上傳 ZIP；GitHub 不會自動把 ZIP 展開成網站原始碼。

## 重要說明

- GitHub Pages 只能提供靜態網站，本專案包含 `/api/import` 與 `/api/valuation` 伺服器功能，因此完整功能不能只靠 GitHub Pages 執行
- GitHub 儲存庫適合保存、版本管理與公開檢視原始碼
- `node_modules`、建置輸出與本機暫存檔已從 ZIP 排除
