const STORAGE_KEY = 'asinMapPrefs';
let asinMap = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
let parsedData = [], chart;
const $ = id => document.getElementById(id);
const ctx = $('salesChart').getContext('2d');
const fmt = val => '$' + val.toFixed(2);
const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
const savePrefs = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(asinMap));
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function groupData(range) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + (range === 'last' ? -1 : 0), 1);
  const end = range === 'last' ? new Date(now.getFullYear(), now.getMonth(), 0) : now;
  const sales = {}, bundles = {};
  parsedData.forEach(row => {
    const date = parseDate(row.DATE);
    if (date >= start && date <= end) {
      const asin = row.BUNDLE_ASIN;
      if (!sales[asin]) { sales[asin] = 0; bundles[asin] = 0; }
      sales[asin] += Number(row.TOTAL_SALES) || 0;
      bundles[asin] += Number(row.BUNDLES_SOLD) || 0;
    }
  });
  return { sales, bundles };
}

function sortASINs(sales, bundles) {
  const sortBy = $('sortBy').value;
  const desc = $('sortDir').textContent.includes('↓') ? -1 : 1;
  const data = sortBy === 'sales' ? sales : bundles;
  return Object.keys(data).sort((a, b) => desc * (data[a] - data[b]));
}

function renderTable(asins) {
  const tbody = $('asinTableBody');
  tbody.innerHTML = '';
  const search = $('searchAsin').value.toLowerCase();
  asins.forEach(asin => {
    if (!asinMap[asin]) asinMap[asin] = { label: asin, color: randomColor() };
    if (!asin.includes(search) && !asinMap[asin].label.toLowerCase().includes(search)) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${asin}</td>
      <td><input type="text" class="labelInput" data-asin="${asin}" value="${asinMap[asin].label}"></td>
      <td><input type="color" class="colorInput" data-asin="${asin}" value="${asinMap[asin].color}"></td>`;
    tbody.appendChild(row);
  });
}

function renderChart(title, sales, bundles) {
  if (chart) chart.destroy();
  setTimeout(() => {
    const asins = sortASINs(sales, bundles);
    renderTable(asins);
    const labels = asins.map(a => asinMap[a].label);
    const data = asins.map(a => sales[a]);
    const colors = asins.map(a => asinMap[a].color);
    const totalBundles = asins.reduce((sum, a) => sum + bundles[a], 0);
    const totalSales = asins.reduce((sum, a) => sum + sales[a], 0);
    $('chartTitle').textContent = `${title} – ${totalBundles} bundles – ${fmt(totalSales)}`;
    chart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: {
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: ${fmt(ctx.raw)}`
            }
          },
          datalabels: {
            color: '#fff',
            formatter: val => fmt(val),
            font: { weight: 'bold' }
          }
        },
        cutout: '50%'
      },
      plugins: [ChartDataLabels]
    });
  }, 0);
}

function updateChart() {
  document.querySelectorAll('.labelInput').forEach(input => {
    asinMap[input.dataset.asin].label = input.value;
  });
  document.querySelectorAll('.colorInput').forEach(input => {
    asinMap[input.dataset.asin].color = input.value;
  });
  savePrefs();
  const { sales, bundles } = groupData($('dateRange').value);
  renderChart($('dateRange').selectedOptions[0].textContent, sales, bundles);
}

$('sortBy').onchange = $('dateRange').onchange = $('searchAsin').oninput = updateChart;
$('sortDir').onclick = () => {
  $('sortDir').textContent = $('sortDir').textContent.includes('↓') ? '↑ Ascending' : '↓ Descending';
  updateChart();
};

$('downloadChart').onclick = () => {
  const canvas = $('salesChart');
  const pad = 10;
  const temp = document.createElement('canvas');
  temp.width = canvas.width;
  temp.height = canvas.height + pad;
  const ctx2 = temp.getContext('2d');
  ctx2.fillStyle = '#fff';
  ctx2.fillRect(0, 0, temp.width, temp.height);
  ctx2.fillStyle = '#000';
  ctx2.font = '16px sans-serif';
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'top';
  ctx2.fillText($('chartTitle').textContent, temp.width / 2, 2);
  ctx2.drawImage(canvas, 0, pad);
  const a = document.createElement('a');
  a.download = 'sales_chart.jpg';
  a.href = temp.toDataURL('image/jpeg');
  a.click();
};

$('toggleTheme').onclick = () => document.body.classList.toggle('dark-mode');

$('resetPrefs').onclick = () => {
  if (confirm('Reset all ASIN labels and colors?')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
};

$('csvInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    Papa.parse(evt.target.result, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: result => {
        parsedData = result.data;
        result.data.forEach(row => {
          if (!asinMap[row.BUNDLE_ASIN]) {
            asinMap[row.BUNDLE_ASIN] = {
              label: row.BUNDLE_ASIN,
              color: randomColor()
            };
          }
        });
        savePrefs();
        updateChart();
      }
    });
  };
  reader.readAsText(file);
};
