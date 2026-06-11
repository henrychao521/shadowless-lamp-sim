# Shadowless Lamp Optical Simulator
## 外科手術無影燈光學模擬器（互動教學平台）

純前端互動教具：拖曳燈具與遮擋物，即時看見多顆 LED 如何「**稀釋**」陰影、達成無影。
為國中／高中生活科技與光學單元設計，包含完整教學鷹架（學習目標 → 引導探究 → 即時白話回饋 → 自我檢核 → 108 課綱對應）。

**🔗 線上使用**：https://henrychao521.github.io/shadowless-lamp-sim/

> ⚠️ **教學／研究用途**，非醫療器械軟體。IEC 60601-2-41 僅作設計參考對照。

---

## 功能總覽

### 主模擬器（`index.html`）
- **2D 幾何剖面分析**（`simulation.js`）：Canvas 即時光線追跡 + Chart.js 相對照度分佈曲線（%），含 IEC 50% 基準線與 PASS/FAIL 徽章
- **3D 空間模擬與熱圖**（`simulation3d.js`，懶載入）：Three.js 多光錐疊加、Realistic Mode（Bloom/SSAO）、Smart Compensation 補光演示
- **雙設計哲學對照**：LED 陣列式（Trumpf iLED 型）↔ 多面反射式（DomeLux 型），含工程取捨導讀
- **7 條參數滑桿**：燈高、遮擋物 X/Y/Z/半徑、LED 數量、發散角——支援 ± 微調按鈕（長按連續）與點擊數值直接輸入

### 教學鷹架（Phase 61–63）
- 📚 **學習目標**：3 條可評量目標（解釋稀釋原理、判讀影響因素、連結工程取捨）
- 🔬 **試試看**：5 個「先猜再看」引導探究任務，一鍵套用對應預設場景
- ✅ **自我檢核**：4 題點開看解答
- 📖 **名詞小幫手**：本影／半影／相對照度／發散角等國中語言詞彙卡
- 💬 **白話即時解讀**：中心照度數字即時翻譯成意義（三色分級對應 IEC 門檻）

### 延伸頁面
- 🔭 **光路逆行互動演示**（`optics-reciprocity.html`）：同一塊拋物面凹鏡，反過來用就從望遠鏡變成探照燈／無影燈；含障礙物孔徑遮擋演示（擋住部分光路，交會處仍不留影）
- 📄 **操作手冊**（`操作介紹.pdf`）：A4 繁中 4 頁，含全參數表與快捷鍵
- 🛠 **開發紀錄**（`dev-log.html`）：60+ 階段開發歷程與對話逐字稿

### 工程特性
- **PWA 可安裝、真離線可用**：Service Worker 預快取核心資產（含版本碼比對）+ jsdelivr CDN（Chart.js/Three.js）runtime 快取
- 手機優化：44px 觸控目標、浮動指標條、手勢換頁、Safe Area、面板遮罩
- 無障礙：WAI-ARIA tablist、鍵盤快捷鍵、aria-live 播報、skip link、減動效支援
- URL hash 場景分享：教師可把調好的場景一鍵複製連結給學生

---

## 快速開始

```bash
# 無建置流程、無後端——所有依賴皆 CDN
python3 -m http.server 8080
open http://localhost:8080
```

> 注意：Service Worker 的快取路徑以 GitHub Pages 的 `/shadowless-lamp-sim/` 為根，
> 本機預覽時 SW 不會生效（不影響模擬功能）。

## 部署

push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）自動部署到 `gh-pages`。

> ⚠️ `deploy.yml` 採**硬編碼檔案清單**：新增要上線的檔案時，必須同時加進
> 三處（cp 至暫存、cp 至 gh-pages、git add），否則 workflow 綠燈但線上 404。

## 程式檔結構

```
shadowless-lamp-sim/
├── index.html               # 主 UI + 教學鷹架 + 理論報告（collapsible）
├── index.css
├── simulation-v6.js         # 2D 光線追跡 + Chart.js 照度曲線（版本以檔名承載）
├── simulation3d.js          # 3D Three.js 光錐疊加 + 後處理（懶載入）
├── optics-reciprocity.html  # 光路逆行互動演示（獨立頁）
├── sw.js                    # Service Worker（PWA 離線）
├── manifest.json / icon.svg # PWA
├── 操作介紹.html / .pdf      # 操作手冊（Chrome headless 產 PDF）
├── dev-log.html             # 開發紀錄 × 對話逐字稿
├── 對話完整紀錄.md           # 完整逐字稿備份（不部署）
└── surgery_light.txt        # 研究筆記（光學原理 + 標準規範）
```

## 教學素材

`index.html` 內建完整理論報告（點擊展開）：機械結構與流體力學設計、光學設計核心原理
（矩陣式多點光源 vs 反射式多焦疊加）、IES 光度檔與 IEC 60601-2-41 標準、顯色生理學與
熱控、智慧自適應補償技術，並附引用文獻連結。適合國高中生活科技課堂，亦可作為大學部
光學／醫工選修的補充教材。
