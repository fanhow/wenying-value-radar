import fs from "node:fs/promises";

async function generateMarkdownReport() {
  const jsonReport = JSON.parse(await fs.readFile("./outputs/ranking-80-candidates-report.json", "utf8"));
  
  const formatTable = (items, title) => {
    let md = `### ${title}\n\n`;
    md += `| 排名 | 股票代號 | 股票名稱 | 市場 | 當前股價 | 文盈公允價值 | 估值走向 | 空間 (%) | 主要模型 | 信心評級 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const item of items) {
      const dirSymbol = item.direction === "↗" ? "🔴 ↗" : item.direction === "↘" ? "🟢 ↘" : "⚪ =";
      const sign = item.upsidePct > 0 ? "+" : "";
      md += `| ${item.rank} | **${item.ticker}** | ${item.name} | ${item.market} | $${item.price.toFixed(2)} | **$${item.calibratedFV.toFixed(2)}** | ${dirSymbol} | **${sign}${item.upsidePct.toFixed(1)}%** | ${item.primaryModel} | ${item.confidence} |\n`;
    }
    md += "\n";
    return md;
  };

  let report = `# 80 檔公允價值排行榜全市場審計與校準報告\n\n`;
  report += `> **生成時間**: ${new Date().toLocaleString("zh-TW")}\n`;
  report += `> **標準化原則**: 全站採用統一的「非經常性收益濾網 + 資產錨定標準化 + 經濟可行性邊界 + 對數高斯共識校準」。\n\n`;
  report += formatTable(jsonReport.twUndervalued, "一、台股低估候選 Top 20 (TW Undervalued Candidates)");
  report += formatTable(jsonReport.twOvervalued, "二、台股高估候選 Top 20 (TW Overvalued Candidates)");
  report += formatTable(jsonReport.usUndervalued, "三、美股低估候選 Top 20 (US Undervalued Candidates)");
  report += formatTable(jsonReport.usOvervalued, "四、美股高估候選 Top 20 (US Overvalued Candidates)");

  await fs.writeFile("./outputs/ranking-80-candidates-report.md", report, "utf8");
  console.log("Markdown report written to ./outputs/ranking-80-candidates-report.md");
}

generateMarkdownReport();
