# Shadowless Lamp Optical Simulator
## 外科手術無影燈光學設計與陰影稀釋模擬器

純前端 Web 互動模擬，演示 **多 LED 光源 + 準直透鏡** 如何透過幾何重疊
稀釋本影（umbra），形成現代手術用無影燈的核心光學原理。

> ⚠️ **教學 / 研究用途**，非醫療器械軟體。對應標準 IEC 60601-2-41 僅做設計參考。

---

## 兩個視圖

### 1. 2D 幾何剖面分析（`simulation.js`）

Canvas 2D + Chart.js — 觀察「光線追跡」與「水平照度分布曲線」即時變化：

- 燈頭高度 / 障礙物位置與半徑 / LED 數量 / 光束張角 — 都可拉桿即時調整
- 顯示中心照度（lux）數值與曲線

### 2. 3D 空間模擬與熱圖（`simulation3d.js`）

Three.js + IESSpotLight + UnrealBloom + SSAO — 真實感渲染：

- 多顆 IES 真實光錐疊加投射到手術平面
- Realistic Mode：開啟全域光暈 + 環境光遮蔽
- Smart Compensation：偵測遮擋時自動加亮其他 LED
- 障礙物移動可拖曳，即時看到本影/半影變化

---

## 系統需求

- 任意現代瀏覽器（Chrome / Safari / Firefox）
- 任意靜態 HTTP server（不用後端）
- Node.js 18+（**僅自動測試**用到 puppeteer）

## 快速開始

```bash
# 不用 npm install — 主程式所有依賴都 CDN
python3 -m http.server 8080
# 或
npx serve .

# 開瀏覽器：
open http://localhost:8080
```

## 自動截圖測試（puppeteer）

如果想跑 puppeteer 自動產生步驟截圖：

```bash
npm install              # 裝 puppeteer
# 確認 server 已啟動（port 8080）
node operate.js          # 跑 4 個步驟、產生 step1~4.png
```

腳本檔：
- `operate.js` — 完整 4 步驟（realistic → smart compensation → 移動障礙 → 改光束張角）
- `test_realistic.js` / `test_screen*.js` — 個別功能截圖
- `test_console.js` / `test_error.js` — debug 用

---

## 程式檔結構

```
shadowless-lamp-sim/
├── index.html          # 主 UI（含完整研究文獻 collapsible section）
├── index.css
├── simulation.js       # 2D 光線追跡 + Chart.js 照度曲線
├── simulation3d.js     # 3D Three.js 光錐疊加 + 後處理
├── operate.js          # Puppeteer 自動測試流程
├── test_*.js           # 個別自動截圖測試
├── step1_realistic.png # 設計步驟示意（自動產生）
├── step2_smart_comp.png
├── step3_obstacle_move.png
├── step4_beam_spread.png
├── surgery_light.txt   # 完整研究筆記（光學原理 + 標準規範）
└── package.json        # 僅 puppeteer dep
```

---

## 教學素材：surgery_light.txt

含完整的「外科手術無影燈之光學與機械設計原理、國際標準規範及計算機模擬技術報告」，
涵蓋：

- 機械結構與流體力學設計（多軸懸吊、無菌層流相容）
- 光學設計核心原理（矩陣式多點光源 vs 反射式多焦疊加）
- IES 光度檔與 IEC 60601-2-41 / IES LM-79 標準
- ZEMAX / LightTools 光學模擬流程
- Ag-Cu-Al TFMG 反射鍍膜技術

可作為大學部光學 / 醫工選修課的補充教材。

---

## 已知限制

- 2D 視圖採二維幾何近似，未計入透鏡 Fresnel 損耗 / 漫射
- 3D Realistic Mode 用 Bloom + SSAO 模擬視覺感受，**不是物理精確光學模擬**
- 無 GPU 也能跑（pure CPU canvas + WebGL），但移動裝置可能掉幀

---

## 排除（`.gitignore`）

- `node_modules/`
- `*.pdf` — 廠商技術手冊（版權）
- `*.ies` — 廠商提供的 IES 光度資料檔
- `debug_screenshot_*.png` — 自動測試產生，每次跑會重產

> 如果你要自己玩，準備自己的 IES 檔（如 LDP / LTD 系列）放專案根目錄，
> simulation3d.js 內 `IESLoader` 會自動載入。

---

## 設計參考

- IEC 60601-2-41 — 醫療電氣設備：手術燈與診斷燈
- IES LM-79 — Light Source Measurement 標準
- Three.js IESSpotLight 範例：https://threejs.org/examples/?q=ies

---

## License

教學 / 研究用私人專案，目前未授權對外使用。
