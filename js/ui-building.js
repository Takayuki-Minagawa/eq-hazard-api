// ================================================================
//  ui-building.js — 建物UI制御・タブ切替・グラフ描画
// ================================================================

let chartResponse = null;
let chartDuctility = null;
let chartFragility = null;
let lastBuildingModel = null;
let lastDamageResults = null;

// ================================================================
//  プリセット選択 → パラメータ自動入力
// ================================================================
function onPresetChange() {
    const presetKey = document.getElementById('selPreset').value;
    if (!presetKey || presetKey === 'CUSTOM') {
        toggleCustomInputs(true);
        return;
    }
    const nFloors = parseInt(document.getElementById('inputFloors').value) || 3;
    const bm = calcBuildingParams(presetKey, nFloors);
    if (!bm) return;

    document.getElementById('inputW').value = bm.W.toFixed(0);
    document.getElementById('inputT1').value = bm.T1.toFixed(3);
    document.getElementById('inputCy').value = bm.Cy.toFixed(2);
    document.getElementById('inputAlpha').value = bm.alpha.toFixed(2);
    document.getElementById('inputH').value = bm.h.toFixed(2);
    document.getElementById('inputHe').value = bm.He.toFixed(2);
    toggleCustomInputs(false);
}

function onFloorsChange() {
    const presetKey = document.getElementById('selPreset').value;
    if (presetKey && presetKey !== 'CUSTOM') {
        onPresetChange();
    }
}

function toggleCustomInputs(editable) {
    const ids = ['inputW', 'inputT1', 'inputCy', 'inputAlpha', 'inputH', 'inputHe'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (editable) {
            el.removeAttribute('readonly');
            el.style.opacity = '1';
        } else {
            el.setAttribute('readonly', true);
            el.style.opacity = '0.7';
        }
    });
}

// ================================================================
//  被害予測を実行
// ================================================================
function runDamageAssessment() {
    // 入力検証
    if (!lastResults) {
        setBuildingStatus(t('bldgStatusNoHazard'), 'error');
        return;
    }
    const ARV = lastGround ? parseFloat(lastGround.ARV) : NaN;
    if (isNaN(ARV) || ARV <= 0) {
        setBuildingStatus(t('bldgStatusNoARV'), 'error');
        return;
    }

    // 建物パラメータ取得
    const presetKey = document.getElementById('selPreset').value;
    const nFloors = parseInt(document.getElementById('inputFloors').value) || 3;
    let building;

    if (presetKey === 'CUSTOM') {
        const fields = {
            W:     parseFloat(document.getElementById('inputW').value),
            T1:    parseFloat(document.getElementById('inputT1').value),
            Cy:    parseFloat(document.getElementById('inputCy').value),
            alpha: parseFloat(document.getElementById('inputAlpha').value),
            h:     parseFloat(document.getElementById('inputH').value),
            He:    parseFloat(document.getElementById('inputHe').value)
        };
        // カスタム入力の必須項目バリデーション（W, T1, He は正値必須）
        if (!isFinite(fields.W) || fields.W <= 0 ||
            !isFinite(fields.T1) || fields.T1 <= 0 ||
            !isFinite(fields.He) || fields.He <= 0 ||
            !isFinite(fields.Cy) || !isFinite(fields.alpha) || !isFinite(fields.h)) {
            setBuildingStatus(t('bldgStatusInvalid'), 'error');
            return;
        }
        building = calcBuildingParams('RC_LOW', nFloors, fields);
    } else {
        building = calcBuildingParams(presetKey, nFloors);
    }

    if (!building) {
        setBuildingStatus(t('bldgStatusInvalid'), 'error');
        return;
    }
    lastBuildingModel = building;

    // PBV配列を取得（TTLカーブ優先）
    const refKey = lastResults.TTL ? 'TTL' : Object.keys(lastResults)[0];
    const simValues = lastResults[refKey].sim;
    const probValues = lastResults[refKey].prob;

    // PBV数値配列を生成（応答カーブ描画用）
    const pbvNums = simValues.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    const pbvForCurve = [];
    const maxPBV = Math.max(...pbvNums, 100);
    for (let v = 1; v <= maxPBV; v += 2) pbvForCurve.push(v);

    // 応答カーブ計算
    const responseCurve = computeResponseCurve(building, ARV, pbvForCurve);

    // 被害関数計算
    const evalYears = curPer === 'T30' ? 30 : 50;
    const damageResults = computeAllDamageProbs(simValues, probValues, building, ARV, evalYears, evalYears);
    lastDamageResults = damageResults;

    // 結果表示
    renderResponseChart(responseCurve, building);
    renderDuctilityChart(responseCurve, building);
    renderFragilityChart();
    renderDamageSummary(damageResults, evalYears);

    // タブ2に切り替え
    switchResultTab('response');
    setBuildingStatus(t('bldgStatusDone'), 'success');
}

function setBuildingStatus(msg, type) {
    const el = document.getElementById('bldgStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-' + type;
    el.style.display = 'block';
}

// ================================================================
//  タブ切替
// ================================================================
function switchResultTab(tabId) {
    document.querySelectorAll('.result-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.result-tab-content').forEach(panel => {
        panel.style.display = panel.id === 'tab-' + tabId ? 'block' : 'none';
    });
}

// ================================================================
//  応答予測チャート（PGV vs IDR）
// ================================================================
function renderResponseChart(responseCurve, building) {
    const canvas = document.getElementById('chartResponse');
    if (!canvas) return;
    canvas.style.display = 'block';
    document.getElementById('placeholderResponse').style.display = 'none';

    if (chartResponse) { chartResponse.destroy(); chartResponse = null; }

    const gc = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const tc = isDark ? '#94a3b8' : '#666';
    const ttc = isDark ? '#cbd5e0' : '#333';

    // メインデータ: PGV vs IDR
    const mainData = responseCurve.map(r => ({ x: r.pgv, y: r.idr }));

    const datasets = [{
        label: t('bldgResponseLine'),
        data: mainData,
        borderColor: isDark ? '#60a5fa' : '#3182ce',
        borderWidth: 2.5,
        showLine: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3
    }];

    // 被害レベル境界線（水平線）
    const maxPGV = Math.max(...responseCurve.map(r => r.pgv), 100);
    const damageLevelsToShow = DAMAGE_LEVELS.filter(dl => dl.key !== 'D0');
    damageLevelsToShow.forEach(dl => {
        datasets.push({
            label: `${currentLang === 'ja' ? dl.label_ja : dl.label_en} (IDR=${dl.idr.toFixed(4)})`,
            data: [{ x: 0, y: dl.idr }, { x: maxPGV, y: dl.idr }],
            borderColor: dl.color,
            borderWidth: 1.5,
            borderDash: [6, 3],
            showLine: true,
            pointRadius: 0,
            tension: 0
        });
    });

    chartResponse = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'line', padding: 10, font: { size: 11 }, color: tc } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: PGV=${c.parsed.x.toFixed(1)} cm/s, IDR=${c.parsed.y.toFixed(5)}` } }
            },
            scales: {
                x: { type: 'linear', min: 0, max: Math.ceil(maxPGV / 10) * 10,
                     title: { display: true, text: 'PGV [cm/s]', font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc } },
                y: { type: 'linear', min: 0, max: 0.08,
                     title: { display: true, text: t('bldgIDRLabel'), font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc, callback: v => v.toFixed(3) } }
            }
        }
    });
}

// ================================================================
//  塑性率チャート（PGV vs μ）
// ================================================================
function renderDuctilityChart(responseCurve, building) {
    const canvas = document.getElementById('chartDuctility');
    if (!canvas) return;
    canvas.style.display = 'block';
    document.getElementById('placeholderDuctility').style.display = 'none';

    if (chartDuctility) { chartDuctility.destroy(); chartDuctility = null; }

    const gc = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const tc = isDark ? '#94a3b8' : '#666';
    const ttc = isDark ? '#cbd5e0' : '#333';

    const mainData = responseCurve.map(r => ({ x: r.pgv, y: r.mu }));
    const maxPGV = Math.max(...responseCurve.map(r => r.pgv), 100);
    const maxMu = Math.max(...responseCurve.map(r => r.mu), 2);

    const datasets = [{
        label: t('bldgDuctilityLine'),
        data: mainData,
        borderColor: isDark ? '#f6ad55' : '#dd6b20',
        borderWidth: 2.5,
        showLine: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3
    }, {
        label: t('bldgMuElastic'),
        data: [{ x: 0, y: 1 }, { x: maxPGV, y: 1 }],
        borderColor: '#38a169',
        borderWidth: 1.5,
        borderDash: [6, 3],
        showLine: true,
        pointRadius: 0,
        tension: 0
    }];

    chartDuctility = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'line', padding: 10, font: { size: 11 }, color: tc } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: PGV=${c.parsed.x.toFixed(1)} cm/s, μ=${c.parsed.y.toFixed(2)}` } }
            },
            scales: {
                x: { type: 'linear', min: 0, max: Math.ceil(maxPGV / 10) * 10,
                     title: { display: true, text: 'PGV [cm/s]', font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc } },
                y: { type: 'linear', min: 0, max: Math.ceil(maxMu) + 1,
                     title: { display: true, text: t('bldgMuLabel'), font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc } }
            }
        }
    });
}

// ================================================================
//  フラジリティカーブチャート
// ================================================================
function renderFragilityChart() {
    const canvas = document.getElementById('chartFragility');
    if (!canvas) return;
    canvas.style.display = 'block';
    document.getElementById('placeholderFragility').style.display = 'none';

    if (chartFragility) { chartFragility.destroy(); chartFragility = null; }

    const gc = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const tc = isDark ? '#94a3b8' : '#666';
    const ttc = isDark ? '#cbd5e0' : '#333';

    const fragData = generateFragilityCurveData(0.10, 200);
    const datasets = [];

    const damageLevelsToShow = DAMAGE_LEVELS.filter(dl => dl.key !== 'D0');
    damageLevelsToShow.forEach(dl => {
        const curveData = fragData.curves[dl.key];
        if (!curveData) return;
        datasets.push({
            label: currentLang === 'ja' ? dl.label_ja : dl.label_en,
            data: fragData.idrValues.map((idr, i) => ({ x: idr, y: curveData[i] })),
            borderColor: dl.color,
            borderWidth: 2,
            showLine: true,
            pointRadius: 0,
            tension: 0.3
        });
    });

    chartFragility = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'line', padding: 10, font: { size: 11 }, color: tc } },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: IDR=${c.parsed.x.toFixed(4)}, P=${c.parsed.y.toFixed(3)}` } }
            },
            scales: {
                x: { type: 'linear', min: 0, max: 0.10,
                     title: { display: true, text: t('bldgIDRLabel'), font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc, callback: v => v.toFixed(3) } },
                y: { type: 'linear', min: 0, max: 1.0,
                     title: { display: true, text: t('bldgFragProb'), font: { size: 13, weight: 'bold' }, color: ttc },
                     grid: { color: gc }, ticks: { color: tc } }
            }
        }
    });
}

// ================================================================
//  被害確率サマリーテーブル
// ================================================================
function renderDamageSummary(damageResults, evalYears) {
    const tbody = document.getElementById('damageSummaryBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('damageSummaryTable').style.display = '';
    document.getElementById('placeholderDamage').style.display = 'none';

    const yearLabel = `${evalYears}${currentLang === 'ja' ? '年' : 'yr'}`;
    document.getElementById('damageSummaryTitle').textContent =
        t('bldgDmgTitle').replace('{years}', yearLabel);

    const damageLevelsToShow = DAMAGE_LEVELS.filter(dl => dl.key !== 'D0');
    damageLevelsToShow.forEach(dl => {
        const r = damageResults[dl.key];
        if (!r) return;
        const tr = document.createElement('tr');
        const periodPct = (r.period * 100).toFixed(2);
        const annualStr = r.annual < 0.0001 ? r.annual.toExponential(2) : r.annual.toFixed(6);
        const barWidth = Math.min(r.period * 100, 100);
        tr.innerHTML = `
            <td><span class="dmg-badge" style="background:${dl.color};color:#fff">${currentLang === 'ja' ? dl.label_ja : dl.label_en}</span></td>
            <td style="font-weight:600">${periodPct}%</td>
            <td>${annualStr}</td>
            <td><div class="dmg-bar-bg"><div class="dmg-bar" style="width:${barWidth}%;background:${dl.color}"></div></div></td>
        `;
        tbody.appendChild(tr);
    });
}

// ================================================================
//  被害予測結果の無効化（地点・条件変更時に呼び出す）
// ================================================================
function invalidateDamageResults() {
    lastBuildingModel = null;
    lastDamageResults = null;

    // チャートを破棄してプレースホルダに戻す
    if (chartResponse) { chartResponse.destroy(); chartResponse = null; }
    if (chartDuctility) { chartDuctility.destroy(); chartDuctility = null; }
    if (chartFragility) { chartFragility.destroy(); chartFragility = null; }

    var el;
    el = document.getElementById('chartResponse');   if (el) el.style.display = 'none';
    el = document.getElementById('chartDuctility');  if (el) el.style.display = 'none';
    el = document.getElementById('chartFragility');  if (el) el.style.display = 'none';
    el = document.getElementById('placeholderResponse');  if (el) el.style.display = '';
    el = document.getElementById('placeholderDuctility'); if (el) el.style.display = '';
    el = document.getElementById('placeholderFragility'); if (el) el.style.display = '';
    el = document.getElementById('placeholderDamage');    if (el) el.style.display = '';
    el = document.getElementById('damageSummaryTable');   if (el) el.style.display = 'none';
    el = document.getElementById('bldgStatus');           if (el) el.style.display = 'none';

    // ハザードカーブタブに戻す
    switchResultTab('hazard');
}

// ================================================================
//  テーマ・言語変更時の再描画
// ================================================================
function rerenderBuildingCharts() {
    if (!lastBuildingModel || !lastResults || !lastGround) return;
    const ARV = parseFloat(lastGround.ARV);
    if (isNaN(ARV)) return;

    const refKey = lastResults.TTL ? 'TTL' : Object.keys(lastResults)[0];
    const simValues = lastResults[refKey].sim;
    const pbvNums = simValues.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    const maxPBV = Math.max(...pbvNums, 100);
    const pbvForCurve = [];
    for (let v = 1; v <= maxPBV; v += 2) pbvForCurve.push(v);

    const responseCurve = computeResponseCurve(lastBuildingModel, ARV, pbvForCurve);
    renderResponseChart(responseCurve, lastBuildingModel);
    renderDuctilityChart(responseCurve, lastBuildingModel);
    renderFragilityChart();
    if (lastDamageResults) {
        const evalYears = curPer === 'T30' ? 30 : 50;
        renderDamageSummary(lastDamageResults, evalYears);
    }
}

// ================================================================
//  評価手法の説明（バイリニア図の下に表示）
// ================================================================
function renderEvalExplanation() {
    const el = document.getElementById('evalExplanation');
    if (!el) return;
    const ja = (typeof currentLang !== 'undefined') ? currentLang === 'ja' : true;
    const title = ja ? '評価手法の概要' : 'Assessment Method Overview';
    const steps = ja ? [
        { t:'① 応答推定 — 等価線形化法', d:'等価1質点系モデルの等価周期 Teq・等価減衰 heq を反復計算し、告示スペクトル形状から最大応答変位を推定します。PBV に地盤増幅率 ARV を乗じて地表面 PGV を算出します。' },
        { t:'② 被害判定 — 層間変形角 (IDR) 基準', d:'D1(軽微)≥1/200, D2(小破)≥1/120, D3(中破)≥1/60, D4(大破)≥1/30, D5(倒壊)≥1/15' },
        { t:'③ フラジリティ — 対数正規分布モデル', d:'需要・容量の不確実性を対数標準偏差 β=0.55〜0.60 の対数正規分布でモデル化し、各被害レベルの超過確率を算出します。' },
        { t:'④ 被害関数 — ハザード積分', d:'ハザードカーブとフラジリティの畳み込み積分で年超過確率を算出し、ポアソン過程仮定で期間超過確率に変換します。' }
    ] : [
        { t:'① Response — Equivalent Linearization', d:'Iteratively computes equivalent period Teq and damping heq for SDOF model. Uses notification spectrum shape to estimate max displacement. PGV = PBV × ARV.' },
        { t:'② Damage — IDR Thresholds', d:'D1(Slight)≥1/200, D2(Light)≥1/120, D3(Moderate)≥1/60, D4(Heavy)≥1/30, D5(Collapse)≥1/15' },
        { t:'③ Fragility — Lognormal Model', d:'Demand/capacity uncertainties modeled with lognormal distribution (β=0.55–0.60) to compute exceedance probability for each damage level.' },
        { t:'④ Damage Function — Hazard Integration', d:'Convolution of hazard curve and fragility yields annual exceedance rate, converted to period probability via Poisson process.' }
    ];
    el.innerHTML = '<h4 style="font-size:.82rem;color:var(--text-secondary);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border-color)">' + title + '</h4>' +
        '<div style="font-size:.75rem;color:var(--text-muted);line-height:1.7;padding:8px 10px;background:var(--bg-table-th);border-radius:6px">' +
        steps.map(function(s){ return '<div style="margin-bottom:6px"><strong style="color:var(--text-secondary)">' + s.t + '</strong><br>' + s.d + '</div>'; }).join('') +
        '</div>';
}

// ================================================================
//  プリセットセレクトのオプション生成
// ================================================================
function populatePresetOptions() {
    const sel = document.getElementById('selPreset');
    if (!sel) return;
    const prevValue = sel.value; // 切替前の選択値を保持
    sel.innerHTML = '';
    for (const [key, preset] of Object.entries(BUILDING_PRESETS)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = currentLang === 'ja' ? preset.label_ja : preset.label_en;
        sel.appendChild(opt);
    }
    const customOpt = document.createElement('option');
    customOpt.value = 'CUSTOM';
    customOpt.textContent = currentLang === 'ja' ? 'カスタム' : 'Custom';
    sel.appendChild(customOpt);

    // 切替前の選択値を復元（存在すれば）
    if (prevValue && Array.from(sel.options).some(o => o.value === prevValue)) {
        sel.value = prevValue;
    }
}
