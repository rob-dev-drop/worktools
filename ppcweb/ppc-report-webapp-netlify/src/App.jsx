import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

// Standalone React app that mirrors the behavior of the provided Tampermonkey userscript
// Features: SP/SB .xlsx upload, drag & drop, parsing first sheet, automatic SBV detection, aggregation,
// filters (Ad Type), sorting (Sales/Spend), search, column visibility toggles, copy table, localStorage prefs
// Styling: Tailwind (no external CSS needed)

export default function PPCReportApp() {
  /* ===================== CONSTANTS ===================== */
  const COLUMNS = [
    "Search Term",
    "Impressions",
    "Clicks",
    "Spend",
    "Sales",
    "Orders",
    "AD TYPE",
    "CPC",
    "Conversion Rate",
    "% Spend",
    "% Sales",
    "ROAS",
  ];
  const DEFAULT_PREFS = {
    visible: Object.fromEntries(COLUMNS.map((c) => [c, true])),
    sortBy: "sales",
    adFilter: "ALL",
  };
  const STORE_KEY = "ads-dashboard-prefs-web";

  const adColors = {
    "SPONSORED PRODUCTS": "#b7e1cd",
    "SPONSORED BRANDS": "#ffeb9c",
    "SPONSORED BRANDS VIDEO": "#ffc000",
  };

  /* ===================== STATE ===================== */
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [rows, setRows] = useState([]); // aggregated rows
  const [fileSP, setFileSP] = useState(null);
  const [fileSB, setFileSB] = useState(null);
  const [progress, setProgress] = useState("");
  const [alert, setAlert] = useState("");
  const [search, setSearch] = useState("");

  const fileInputSP = useRef(null);
  const fileInputSB = useRef(null);

  /* ===================== EFFECTS ===================== */
  // Load saved prefs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved) setPrefs((p) => ({ ...p, ...saved }));
    } catch {}
  }, []);

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  /* ===================== HELPERS ===================== */
  const isValidExcel = (f) => !!f && f.name.toLowerCase().endsWith(".xlsx") && f.size > 100;

  const normalizeKeys = (obj) =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [String(k).trim(), v])
    );

  function blend(h1, h2, p) {
    const toRGB = (h) => h.slice(1).match(/.{2}/g).map((x) => parseInt(x, 16));
    const [r1, g1, b1] = toRGB(h1),
      [r2, g2, b2] = toRGB(h2);
    const r = Math.round(r1 + (r2 - r1) * p);
    const g = Math.round(g1 + (g2 - g1) * p);
    const b = Math.round(b1 + (b2 - b1) * p);
    return `rgb(${r},${g},${b})`;
  }

  function normalizeRows(rawRows, guess) {
    return rawRows
      .map((r) => {
        const searchTerm = r["Customer Search Term"] || r["Search Term"]; // SP vs SB
        if (!searchTerm) return null;
        const spend = +r["Spend"] || 0;
        const sales = +r["14 Day Total Sales"] || +r["7 Day Total Sales"] || 0;
        const orders = +r["14 Day Total Orders (#)"] || +r["7 Day Total Orders (#)"] || 0;
        const clicks = +r["Clicks"] || 0;
        const impressions = +r["Impressions"] || 0;
        const campaign = String(r["Campaign Name"] || "").toLowerCase();
        const isSBV = /video|sbv/.test(campaign);
        const adType = guess === "SB" ? (isSBV ? "SPONSORED BRANDS VIDEO" : "SPONSORED BRANDS") : "SPONSORED PRODUCTS";
        return { searchTerm, impressions, clicks, spend, sales, orders, adType };
      })
      .filter(Boolean);
  }

  function aggregate(all) {
    const map = {};
    for (const r of all) {
      const key = `${r.searchTerm}::${r.adType}`;
      if (!map[key]) map[key] = { ...r };
      else {
        map[key].impressions += r.impressions;
        map[key].clicks += r.clicks;
        map[key].spend += r.spend;
        map[key].sales += r.sales;
        map[key].orders += r.orders;
      }
    }
    const list = Object.values(map);
    const totSpend = list.reduce((a, b) => a + b.spend, 0) || 1;
    const totSales = list.reduce((a, b) => a + b.sales, 0) || 1;
    return list.map((r) => {
      const cpc = r.clicks ? r.spend / r.clicks : 0;
      const conv = r.clicks ? r.orders / r.clicks : 0;
      const roas = r.spend ? r.sales / r.spend : 0;
      const pSpend = r.spend / totSpend;
      const pSales = r.sales / totSales;
      return { ...r, cpc, conv, roas, pSpend, pSales };
    });
  }

  async function parseFile(file, guess) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: 0 }).map(normalizeKeys);
    return normalizeRows(data, guess);
  }

  async function loadFiles(sp, sb) {
    setAlert("");
    setProgress("Loading report(s)...");
    try {
      const parts = [];
      if (sp && isValidExcel(sp)) parts.push(...(await parseFile(sp, "SP")));
      if (sb && isValidExcel(sb)) parts.push(...(await parseFile(sb, "SB")));
      setRows(aggregate(parts));
    } catch (e) {
      setAlert(String(e?.message || e) || "Failed to parse file(s)");
    } finally {
      setProgress("");
    }
  }

  /* ===================== MEMO: FILTER + SORT + SEARCH ===================== */
  const filtered = React.useMemo(() => {
    let data = rows;
    if (prefs.adFilter !== "ALL") data = data.filter((r) => r.adType === prefs.adFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    const key = prefs.sortBy === "spend" ? "spend" : "sales";
    return [...data].sort((a, b) => b[key] - a[key]);
  }, [rows, prefs, search]);

  const maxSpend = React.useMemo(() => Math.max(...filtered.map((r) => r.pSpend), 0.0001), [filtered]);
  const maxSales = React.useMemo(() => Math.max(...filtered.map((r) => r.pSales), 0.0001), [filtered]);

  /* ===================== UI HANDLERS ===================== */
  function onDrop(e, which) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!isValidExcel(f)) {
      setAlert("Please drop a valid, non-empty .xlsx file.");
      return;
    }
    if (which === "SP") setFileSP(f);
    else setFileSB(f);
    loadFiles(which === "SP" ? f : fileSP, which === "SB" ? f : fileSB);
  }

  function copyTable() {
    try {
      const header = COLUMNS.filter((c) => prefs.visible[c]).join("\\t");
      const lines = filtered.map((r) =>
        COLUMNS.filter((c) => prefs.visible[c])
          .map((c) => cellText(c, r))
          .join("\\t")
      );
      const blob = new Blob([header + "\\n" + lines.join("\\n")], { type: "text/plain" });
      navigator.clipboard.writeText(header + "\\n" + lines.join("\\n"));
      // Also make a downloadable backup (optional)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ppc-table.tsv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  function resetAll() {
    setFileSP(null);
    setFileSB(null);
    setRows([]);
    setSearch("");
    setAlert("");
    setProgress("");
  }

  function toggleCol(col) {
    setPrefs((p) => ({ ...p, visible: { ...p.visible, [col]: !p.visible[col] } }));
  }

  function cellText(col, r) {
    switch (col) {
      case "Search Term":
        return r.searchTerm;
      case "Impressions":
        return String(r.impressions);
      case "Clicks":
        return String(r.clicks);
      case "Spend":
        return `$${r.spend.toFixed(2)}`;
      case "Sales":
        return `$${r.sales.toFixed(2)}`;
      case "Orders":
        return String(r.orders);
      case "AD TYPE":
        return r.adType;
      case "CPC":
        return `$${r.cpc.toFixed(2)}`;
      case "Conversion Rate":
        return `${(r.conv * 100).toFixed(1)}%`;
      case "% Spend":
        return `${(r.pSpend * 100).toFixed(1)}%`;
      case "% Sales":
        return `${(r.pSales * 100).toFixed(1)}%`;
      case "ROAS":
        return r.roas.toFixed(2);
      default:
        return "";
    }
  }

  /* ===================== RENDER ===================== */
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold text-indigo-900 flex items-center gap-2">📈 PPC Report Tool — Web</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={copyTable}
              className="rounded-lg px-3 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 shadow"
            >
              Copy Table
            </button>
            <button
              onClick={resetAll}
              className="rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-800 border hover:bg-slate-200"
            >
              Clear All
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Info */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-slate-800 shadow-sm">
          <p className="font-semibold">How to use</p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>Upload your Amazon SP and/or SB Excel reports (.xlsx). Drag & drop supported.</li>
            <li>Use the filters, search, and column toggles to analyze performance.</li>
            <li>
              To separate SB from SBV automatically, include <code>SBV</code> or <code>Video</code> in the campaign name.
            </li>
          </ul>
        </div>

        {/* Upload zones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {(["SP", "SB"]).map((which) => (
            <div
              key={which}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, which)}
              className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400 transition p-4 flex flex-col items-center justify-center text-center"
            >
              <p className="text-sm font-semibold text-slate-800">
                {which === "SP" ? "Add SP Report (.xlsx)" : "Add SB Report (.xlsx)"}
              </p>
              <p className="mt-1 text-xs text-slate-500">Drag & drop or choose a file</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => (which === "SP" ? fileInputSP.current?.click() : fileInputSB.current?.click())}
                  className="rounded-lg px-3 py-2 text-sm bg-white border shadow-sm hover:bg-slate-50"
                >
                  Browse…
                </button>
                <span className="text-xs text-slate-600 truncate max-w-[16rem]">
                  {(which === "SP" ? fileSP?.name : fileSB?.name) || "No file selected"}
                </span>
              </div>
              <input
                ref={which === "SP" ? fileInputSP : fileInputSB}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (which === "SP") setFileSP(f);
                  else setFileSB(f);
                  loadFiles(which === "SP" ? f : fileSP, which === "SB" ? f : fileSB);
                }}
              />
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="font-medium">Filter AD TYPE:</label>
          <select
            value={prefs.adFilter}
            onChange={(e) => setPrefs((p) => ({ ...p, adFilter: e.target.value }))}
            className="rounded-md border px-2 py-1"
          >
            <option value="ALL">ALL</option>
            <option value="SPONSORED PRODUCTS">SPONSORED PRODUCTS</option>
            <option value="SPONSORED BRANDS">SPONSORED BRANDS</option>
            <option value="SPONSORED BRANDS VIDEO">SPONSORED BRANDS VIDEO</option>
          </select>

          <label className="font-medium">Sort by:</label>
          <select
            value={prefs.sortBy}
            onChange={(e) => setPrefs((p) => ({ ...p, sortBy: e.target.value }))}
            className="rounded-md border px-2 py-1"
          >
            <option value="sales">Sales</option>
            <option value="spend">Spend</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search…"
            className="ml-auto rounded-md border px-3 py-1.5 w-full sm:w-72"
          />
        </div>

        {/* Column toggles */}
        <div className="mt-3 text-xs bg-slate-50 border rounded-lg p-2 flex flex-wrap gap-3">
          {COLUMNS.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!prefs.visible[c]}
                onChange={() => toggleCol(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>

        {/* Alerts & progress */}
        {alert && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {alert}
          </div>
        )}
        {progress && (
          <div className="mt-3 text-sm font-semibold text-indigo-700">{progress}</div>
        )}

        {/* Table */}
        <div className="mt-4 overflow-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 border-b sticky top-0 z-10">
              <tr>
                {COLUMNS.filter((c) => prefs.visible[c]).map((c, i) => (
                  <th
                    key={c}
                    className={`px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap ${
                      i === 0 ? "sticky left-0 bg-slate-100 text-left" : ""
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={COLUMNS.length}>
                    No data loaded. Please upload your SP and/or SB reports above.
                  </td>
                </tr>
              ) : (
                filtered.map((r, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 ? "bg-white" : "bg-slate-50/50"}>
                    {COLUMNS.filter((c) => prefs.visible[c]).map((c, i) => {
                      let content = null;
                      let className = "px-3 py-2 text-right whitespace-nowrap";
                      if (c === "Search Term") {
                        className += " sticky left-0 bg-white text-left max-w-[300px] truncate";
                        content = (
                          <span title={r.searchTerm} className="inline-block max-w-[300px] truncate">
                            {r.searchTerm}
                          </span>
                        );
                      } else if (c === "AD TYPE") {
                        content = (
                          <span
                            className="px-2 py-0.5 rounded"
                            style={{ background: adColors[r.adType] || "#eee" }}
                          >
                            {r.adType}
                          </span>
                        );
                        className += " text-left";
                      } else if (c === "% Spend") {
                        const bg = blend("#ffffff", "#e67c73", r.pSpend / maxSpend);
                        content = <span style={{ background: bg }} className="px-1 rounded">{(r.pSpend * 100).toFixed(1)}%</span>;
                      } else if (c === "% Sales") {
                        const bg = blend("#ffffff", "#57bb8a", r.pSales / maxSales);
                        content = <span style={{ background: bg }} className="px-1 rounded">{(r.pSales * 100).toFixed(1)}%</span>;
                      } else if (c === "Spend" || c === "Sales" || c === "CPC") {
                        const val = c === "CPC" ? r.cpc : c === "Spend" ? r.spend : r.sales;
                        content = `$${val.toFixed(2)}`;
                      } else if (c === "Conversion Rate") {
                        content = `${(r.conv * 100).toFixed(1)}%`;
                      } else if (c === "ROAS") {
                        const cls = r.roas >= 2 ? "bg-green-100" : r.roas >= 1 ? "bg-yellow-100" : "bg-red-100";
                        className += ` ${cls}`;
                        content = r.roas.toFixed(2);
                      } else {
                        content = String(r[c.toLowerCase()] ?? r[c] ?? "");
                      }
                      return (
                        <td key={c} className={className}>
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-12 pt-6 text-xs text-slate-500">
        Built for quick PPC analysis. Files never leave your browser.
      </footer>
    </div>
  );
}
