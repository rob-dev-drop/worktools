// ==UserScript==
// @name         PPC Report Tool
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  PPC report tool with improved user experience
// @author       Roberto Rivas
// @supportURL   mailto:roberto@pirawna.com
// @match        https://www.google.com
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    https://github.com/rob-dev-drop/worktools/raw/refs/heads/main/
// @downloadURL  https://github.com/rob-dev-drop/worktools/raw/refs/heads/main/
// ==/UserScript==


(function () {
  'use strict';

  // ────────────── CONSTANTS / PREFERENCES ────────────── //
  const COLUMNS = [
    "Search Term", "Impressions", "Clicks", "Spend", "Sales", "Orders",
    "AD TYPE", "CPC", "Conv%", "% Spend", "% Sales", "ROAS"
  ];
  const DEFAULT_PREFS = {
    visible: Object.fromEntries(COLUMNS.map(c => [c, true])),
    sortBy: "sales",
    adFilter: "ALL"
  };
  const STORE_KEY = "ads-dashboard-prefs";

  function getPrefs() {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    return saved ? { ...DEFAULT_PREFS, ...saved } : structuredClone(DEFAULT_PREFS);
  }
  let prefs = getPrefs();
  function savePrefs() { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); }

  // ────────────── MAIN HTML SHELL ────────────── //
  document.body.innerHTML = `
    <div id="ppcToolShell">
      <div id="alertBox" class="alert-box"></div>
      <div class="info-box">
      <h1>Welcome to the PPC Report Tool! (Beta)</h1>
        <strong>How to use:</strong><br>
        Upload your Amazon Sponsored Products (SP) and/or Sponsored Brands (SB) Excel reports below. Drag & drop is supported. See your metrics instantly in the table. Use filters, search, and export to Sheets! <br><br>
        Important note: to separate SB from SBV, the campaign name should have "SBV" or "Video" (not case sensitive) <br><br>
        <span style="font-size:13px;color:#777;">You can upload just one file (SP or SB) or both for combined results. Preferences are saved automatically.<br>For any bugs, suggestions or general feedback Slack Roberto</span>
      </div>
      <div id="uploadAreas">
        <div class="upload-zone" id="zoneSP">
          <label for="fileSP" class="upload-label">Add SP Report (.xlsx)</label>
          <input type="file" id="fileSP" accept=".xlsx" hidden>
          <div class="upload-feedback" id="fbSP"></div>
        </div>
        <div class="upload-zone" id="zoneSB">
          <label for="fileSB" class="upload-label">Add SB Report (.xlsx)</label>
          <input type="file" id="fileSB" accept=".xlsx" hidden>
          <div class="upload-feedback" id="fbSB"></div>
        </div>
      </div>
      <button id="resetBtn">Clear All</button>
      <div id="controls">
        <label>Filter AD TYPE:</label>
        <select id="adTypeFilter">
          <option value="ALL">ALL</option>
          <option value="SPONSORED PRODUCTS">SPONSORED PRODUCTS</option>
          <option value="SPONSORED BRANDS">SPONSORED BRANDS</option>
          <option value="SPONSORED BRANDS VIDEO">SPONSORED BRANDS VIDEO</option>
        </select>
        <label>Sort by:</label>
        <select id="sortBy">
          <option value="sales">Sales</option>
          <option value="spend">Spend</option>
        </select>
        <input type="text" id="searchBox" placeholder="🔍 Search…">
        <button id="copyBtn">📋 Copy Table</button>
        <div id="columnPanel"></div>
      </div>
      <div id="progress"></div>
      <div id="resultTable"></div>
    </div>
  `;

// ────────────── STYLES ────────────── //
const style = document.createElement('style');
style.textContent = `
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f6f7fb; color:#222; margin:0; }
  #ppcToolShell { max-width: 1200px; margin: 24px auto 32px auto; background: #fff; border-radius: 20px; box-shadow: 0 3px 20px #0001; padding: 32px 24px; }
  .info-box { background: #e8f4ff; color:#1a334d; border-radius: 8px; padding: 16px 18px; margin-bottom: 18px; font-size:16px; box-shadow:0 1px 3px #0001; }
  .alert-box { margin-bottom:14px; min-height:20px; font-size:15px; color:#fff; background:#e84e4e; border-radius:6px; border:1px solid #a70000; padding:7px 13px; display:none; font-weight:500;}
  #uploadAreas { display: flex; flex-wrap:wrap; gap:24px; margin-bottom: 22px; }
  .upload-zone { flex:1; min-width:210px; background:#f7f9fc; border:2px dashed #b4c0d1; border-radius:13px; padding:22px 12px 12px 12px; position:relative; transition: border-color .25s; display:flex; flex-direction:column; align-items:center; }
  .upload-zone.dragover { border-color: #0090ff; background: #e7f4ff; }
  .upload-label { cursor:pointer; font-size:16px; font-weight:500; color:#1a334d; background: #eef6fa; border-radius:6px; padding:7px 18px; border:1px solid #b4c0d1; transition:.2s; margin-bottom:9px; }
  .upload-label:hover { background:#d6e9fb; border-color:#0090ff; }
  .upload-feedback { min-height:24px; font-size:14px; margin-top:3px; font-weight:500;}
  .upload-feedback.success { color:#216b20; }
  .upload-feedback.error { color:#e84e4e; }
  #resetBtn { margin-bottom:20px; background: #eaeeff; color:#2b2b67; font-size:14px; padding:7px 20px; border-radius:7px; border:1px solid #b4c0d1; cursor:pointer; transition:.2s; margin-right:18px; }
  #resetBtn:hover { background:#d6e9fb; border-color:#0090ff; }
  #controls { margin-bottom:14px; display: flex; flex-wrap:wrap; align-items:center; gap: 11px 23px; font-size:15px; }
  #searchBox {padding:7px 9px;width:210px;border-radius:6px;border:1px solid #bbb;}
  #copyBtn{padding:7px 13px;background:#007bff;color:#fff;border:none;cursor:pointer;border-radius:6px;font-size:15px;}
  #copyBtn:hover{background:#0056b3;}
  #columnPanel{margin-left:14px;padding:6px;background:#f6f7fb;border:1px solid #dde7f7;display:inline-block;font-size:13px;border-radius:8px;}
  table{border-collapse:collapse;width:100%;background:#fff;font-size:14px;}
  th,td{padding:6px 10px;border:1px solid #ccd3e2;text-align:right;}
  th{background:#f2f8fd;position:sticky;top:0;z-index:2;}
  tr:nth-child(even){background:#fafdff;}
  td.left{ text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  td.sticky{ position:sticky; left:0; background:white; z-index:1;max-width: 220px;white-space: nowrap;text-overflow: ellipsis; overflow: hidden; }
  td.green{background:#d4edda;} td.yellow{background:#fff3cd;} td.red{background:#f8d7da;}
  #progress {min-height:22px; color:#155faa; font-size:15px; font-weight:500; margin-bottom:8px;}
  @media (max-width: 800px) {
    #ppcToolShell {padding:14px 5px;}
    #uploadAreas { flex-direction:column; gap:18px; }
    #controls { flex-direction:column; gap: 9px 0; align-items:flex-start; }
    #columnPanel {margin-left:0; margin-top:7px;}
    table, th, td {font-size:12px;}
    td.sticky {max-width: 90vw;}
    #searchBox {width:95vw;max-width:350px;}
  }
`;
document.head.appendChild(style);

// ────────────── UTILS ────────────── //
const $ = id => document.getElementById(id);

const adColors = {
  "SPONSORED PRODUCTS": "#b7e1cd",
  "SPONSORED BRANDS":   "#ffeb9c",
  "SPONSORED BRANDS VIDEO": "#ffc000"
};

const blend = (h1, h2, p) => {
  const toRGB = h => h.slice(1).match(/.{2}/g).map(x=>parseInt(x,16));
  const [r1,g1,b1]=toRGB(h1),[r2,g2,b2]=toRGB(h2);
  return `rgb(${[r1+(r2-r1)*p,g1+(g2-g1)*p,b1+(b2-b1)*p].map(v=>Math.round(v)).join(",")})`;
};

const normalizeKeys = obj =>
  Object.fromEntries(Object.entries(obj).map(([k,v])=>[k.trim(),v]));

// ────────────── FILE VALIDATION ────────────── //
function isValidExcel(file) {
  return (
    file &&
    file.name.toLowerCase().endsWith('.xlsx') &&
    file.size > 100 // bytes
  );
}

// ────────────── XLSX PARSE & AGGREGATE ────────────── //
async function parseFile(file, guess) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result,{type:"array"});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet,{defval:0})
          .map(normalizeKeys)
          .map(r=>{
            const searchTerm = r["Customer Search Term"]||r["Search Term"];
            if(!searchTerm) return null;
            const spend = +r["Spend"]||0;
            const sales = +r["14 Day Total Sales"]||+r["7 Day Total Sales"]||0;
            const orders= +r["14 Day Total Orders (#)"]||+r["7 Day Total Orders (#)"]||0;
            const clicks= +r["Clicks"]||0;
            const impressions=+r["Impressions"]||0;
            const campaign=(r["Campaign Name"]||"").toString().toLowerCase();
            const isSBV=/video|sbv/.test(campaign);
            const adType= guess==="SB"
              ?(isSBV?"SPONSORED BRANDS VIDEO":"SPONSORED BRANDS")
              :"SPONSORED PRODUCTS";
            return {searchTerm,impressions,clicks,spend,sales,orders,adType};
          })
          .filter(Boolean);
        resolve(data);
      } catch (err) { reject("Failed to parse file: "+file.name); }
    };
    reader.onerror = () => reject("Could not read file: "+file.name);
    reader.readAsArrayBuffer(file);
  });
}

function aggregate(rows){
  const map={};
  rows.forEach(r=>{
    const key=r.searchTerm+"::"+r.adType;
    if(!map[key]) map[key]={...r};
    else{
      map[key].impressions+=r.impressions;
      map[key].clicks+=r.clicks;
      map[key].spend+=r.spend;
      map[key].sales+=r.sales;
      map[key].orders+=r.orders;
    }
  });
  const totSpend=Object.values(map).reduce((a,b)=>a+b.spend,0)||1;
  const totSales=Object.values(map).reduce((a,b)=>a+b.sales,0)||1;
  return Object.values(map).map(r=>{
    const cpc=r.clicks? r.spend/r.clicks :0;
    const conv=r.clicks? r.orders/r.clicks :0;
    const roas=r.spend? r.sales/r.spend :0;
    const pSpend=r.spend/totSpend;
    const pSales=r.sales/totSales;
    return {...r,cpc,conv,roas,pSpend,pSales};
  });
}

// ────────────── ALERTS ────────────── //
function showAlert(msg, err=false) {
  const box = $("alertBox");
  box.style.display = msg ? 'block' : 'none';
  box.textContent = msg || '';
  box.style.background = err ? '#e84e4e' : '#216b20';
  box.style.color = "#fff";
  box.style.borderColor = err ? "#a70000" : "#216b20";
}
function clearAlert() { showAlert(""); }

// ────────────── PROGRESS INDICATOR ────────────── //
function showProgress(msg) { $("progress").textContent = msg; }
function clearProgress() { $("progress").textContent = ""; }

// ────────────── RENDER COLUMN PANEL ────────────── //
function drawColumnPanel(){
  $('columnPanel').innerHTML =
    COLUMNS.map(c=>`<label style="margin-right:7px;"><input type="checkbox" data-col="${c}"
      ${prefs.visible[c]?'checked':''}> ${c}</label>`).join('');
  $('columnPanel').querySelectorAll('input').forEach(cb=>{
    cb.onchange=()=>{
      prefs.visible[cb.dataset.col]=cb.checked;
      savePrefs();
      render();
    };
  });
}

// ────────────── TABLE RENDERING ────────────── //
function render(){
  if(!window.rows || !window.rows.length) {
    $("resultTable").innerHTML = "<div style='color:#777;font-size:16px;padding:25px;text-align:center;'>No data loaded. Please upload your SP and/or SB reports above.</div>";
    return;
  }
  clearAlert();
  const sFilter = prefs.adFilter;
  const sortKey = prefs.sortBy;
  const search  = $('searchBox').value.toLowerCase();

  let data = window.rows;
  if(sFilter!=="ALL") data=data.filter(r=>r.adType===sFilter);
  if(search) data=data.filter(r=>JSON.stringify(r).toLowerCase().includes(search));
  data = [...data].sort((a,b)=>b[sortKey]-a[sortKey]);

  const maxSpend=Math.max(...data.map(r=>r.pSpend),0.0001);
  const maxSales=Math.max(...data.map(r=>r.pSales),0.0001);

  const cells = (col,r)=>{
    switch(col){
      case "Search Term":  return `<td class="left sticky" style="max-width:200px;" title="${r.searchTerm}">${r.searchTerm}</td>`;
      case "Impressions": return `<td>${r.impressions}</td>`;
      case "Clicks":      return `<td>${r.clicks}</td>`;
      case "Spend":       return `<td>$${r.spend.toFixed(2)}</td>`;
      case "Sales":       return `<td>$${r.sales.toFixed(2)}</td>`;
      case "Orders":      return `<td>${r.orders}</td>`;
      case "AD TYPE":     return `<td class="left" style="background:${adColors[r.adType]};">${r.adType}</td>`;
      case "CPC":         return `<td>$${r.cpc.toFixed(2)}</td>`;
      case "Conv%":       return `<td>${(r.conv*100).toFixed(1)}%</td>`;
      case "% Spend": {
        const bg=blend("#ffffff","#e67c73",r.pSpend/maxSpend);
        return `<td style="background:${bg};">${(r.pSpend*100).toFixed(1)}%</td>`;
      }
      case "% Sales": {
        const bg=blend("#ffffff","#57bb8a",r.pSales/maxSales);
        return `<td style="background:${bg};">${(r.pSales*100).toFixed(1)}%</td>`;
      }
      case "ROAS":{
        let cls=""; if(r.roas>=2)cls="green"; else if(r.roas>=1)cls="yellow"; else cls="red";
        return `<td class="${cls}">${r.roas.toFixed(2)}</td>`;
      }
    }
    return "<td></td>";
  };

  const header = `<tr>${COLUMNS.filter(c=>prefs.visible[c])
                   .map((c,i)=>`<th ${i===0?'class="sticky" style="left:0;"':''}>${c}</th>`).join("")}</tr>`;

  const body = data.map(r=>
    `<tr>${COLUMNS.filter(c=>prefs.visible[c]).map(c=>cells(c,r)).join("")}</tr>`).join("");

  $('resultTable').innerHTML = `<table>${header}${body}</table>`;
}

// ────────────── COPY TO CLIPBOARD ────────────── //
$('copyBtn').onclick = () => {
  if(!window.rows || !window.rows.length) return;
  const sel = document.createElement('textarea');
  sel.style.position='fixed'; sel.style.opacity='0';
  sel.value = [...$('resultTable').querySelectorAll('tr')]
    .map(row=>[...row.children].map(td=>td.innerText).join('\t')).join('\n');
  document.body.appendChild(sel);
  sel.select(); document.execCommand('copy'); document.body.removeChild(sel);
  $('copyBtn').textContent='✅ Copied!';
  setTimeout(()=>$('copyBtn').textContent='📋 Copy Table',1500);
};

// ────────────── EVENT HANDLERS ────────────── //
$('adTypeFilter').value=prefs.adFilter;
$('sortBy').value=prefs.sortBy;
$('adTypeFilter').onchange = e => { prefs.adFilter=e.target.value; savePrefs(); render(); };
$('sortBy').onchange      = e => { prefs.sortBy=e.target.value;   savePrefs(); render(); };
$('searchBox').oninput    = render;

// ────────────── FILE LOAD AND DRAG/DROP ────────────── //
let fileSP = null, fileSB = null, dataSP = [], dataSB = [];
function updateFeedback(zone, file, ok, msg) {
  const box = $(zone);
  if (!file) {
    box.innerHTML = '';
    box.className = "upload-feedback";
    return;
  }
  if(ok) {
    box.innerHTML = `✅ ${file.name} loaded`;
    box.className = "upload-feedback success";
  } else {
    box.innerHTML = `<span>⚠️ ${file.name}: ${msg}</span>`;
    box.className = "upload-feedback error";
  }
}

async function loadFiles() {
  clearAlert();
  clearProgress();
  if (!fileSP && !fileSB) {
    window.rows = [];
    render();
    return;
  }
  showProgress("Loading report(s)...");
  let errors = [];
  let [sp, sb] = [[], []];
  if (fileSP) {
    if (!isValidExcel(fileSP)) {
      errors.push(`${fileSP.name} is not a valid, non-empty .xlsx file.`);
      updateFeedback('fbSP', fileSP, false, "Invalid file");
      fileSP = null;
    } else {
      try {
        sp = await parseFile(fileSP, "SP");
        dataSP = sp;
        updateFeedback('fbSP', fileSP, true, "");
      } catch (err) {
        errors.push(err);
        updateFeedback('fbSP', fileSP, false, err);
        fileSP = null;
      }
    }
  } else dataSP = [];
  if (fileSB) {
    if (!isValidExcel(fileSB)) {
      errors.push(`${fileSB.name} is not a valid, non-empty .xlsx file.`);
      updateFeedback('fbSB', fileSB, false, "Invalid file");
      fileSB = null;
    } else {
      try {
        sb = await parseFile(fileSB, "SB");
        dataSB = sb;
        updateFeedback('fbSB', fileSB, true, "");
      } catch (err) {
        errors.push(err);
        updateFeedback('fbSB', fileSB, false, err);
        fileSB = null;
      }
    }
  } else dataSB = [];
  clearProgress();
  if (errors.length) showAlert(errors.join('; '), true);
  window.rows = aggregate([...dataSP, ...dataSB]);
  render();
}

// Handle actual file input change
$('fileSP').onchange = e => {
  if (!e.target.files[0]) return;
  fileSP = e.target.files[0];
  updateFeedback('fbSP', fileSP, false, "Loading...");
  loadFiles();
};
$('fileSB').onchange = e => {
  if (!e.target.files[0]) return;
  fileSB = e.target.files[0];
  updateFeedback('fbSB', fileSB, false, "Loading...");
  loadFiles();
};

// Drag-and-drop logic for each zone
['zoneSP', 'zoneSB'].forEach(zoneId => {
  const zone = $(zoneId);
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    if (files.length && isValidExcel(files[0])) {
      if (zoneId === 'zoneSP') {
        fileSP = files[0];
        updateFeedback('fbSP', fileSP, false, "Loading...");
      } else {
        fileSB = files[0];
        updateFeedback('fbSB', fileSB, false, "Loading...");
      }
      loadFiles();
    } else {
      showAlert("Please drop a valid, non-empty .xlsx file.", true);
    }
  });
});

// ────────────── RESET BUTTON ────────────── //
$('resetBtn').onclick = () => {
  fileSP = null; fileSB = null; dataSP = []; dataSB = [];
  $('fileSP').value = ""; $('fileSB').value = "";
  updateFeedback('fbSP', null, false, "");
  updateFeedback('fbSB', null, false, "");
  window.rows = [];
  clearAlert();
  clearProgress();
  render();
};

// ────────────── INITIALISE PANELS & RENDER ────────────── //
drawColumnPanel();
render();

// ────────────── END OF SCRIPT ────────────── //
})();
