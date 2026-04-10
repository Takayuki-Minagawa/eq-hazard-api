// ================================================================
//  building-model.js — 建物プリセット・パラメータ管理
// ================================================================

// tCoeff: T1 = tCoeff × H [s]（H = 階数 × 階高 [m]）
// 提案書2.3 + 想定入力例（3F RC: T1≈0.39s → tCoeff≈0.037）に基づく設定
const BUILDING_PRESETS = {
    RC_LOW:  { label_ja:'RC低層(1-3F)',    label_en:'RC Low-rise(1-3F)',  tCoeff:0.037, Cy:0.40, alpha:0.01, h:0.05, limitIDR:1/30, floorH:3.5, wPerFloor:6365 },
    RC_MID:  { label_ja:'RC中層(4-7F)',    label_en:'RC Mid-rise(4-7F)',  tCoeff:0.040, Cy:0.30, alpha:0.02, h:0.05, limitIDR:1/30, floorH:3.5, wPerFloor:6365 },
    RC_HIGH: { label_ja:'RC高層(8F-)',     label_en:'RC High-rise(8F-)',  tCoeff:0.050, Cy:0.25, alpha:0.03, h:0.03, limitIDR:1/50, floorH:3.5, wPerFloor:6365 },
    S_LOW:   { label_ja:'S造低層(1-3F)',   label_en:'S Low-rise(1-3F)',   tCoeff:0.035, Cy:0.40, alpha:0.05, h:0.02, limitIDR:1/30, floorH:4.0, wPerFloor:4000 },
    S_MID:   { label_ja:'S造中高層(4F-)',  label_en:'S Mid/High-rise(4F-)', tCoeff:0.045, Cy:0.30, alpha:0.05, h:0.02, limitIDR:1/50, floorH:4.0, wPerFloor:4000 },
    WOOD:    { label_ja:'木造(1-3F)',      label_en:'Wood(1-3F)',         tCoeff:0.060, Cy:0.40, alpha:0.10, h:0.05, limitIDR:1/15, floorH:3.0, wPerFloor:800  }
};

// 被害レベル定義 (IDR閾値 in rad)
const DAMAGE_LEVELS = [
    { key:'D0', idr:0.005,  label_ja:'無被害', label_en:'No Damage',  color:'#38a169' },
    { key:'D1', idr:0.005,  label_ja:'軽微',   label_en:'Slight',     color:'#d69e2e' },
    { key:'D2', idr:0.0083, label_ja:'小破',   label_en:'Light',      color:'#dd6b20' },
    { key:'D3', idr:0.017,  label_ja:'中破',   label_en:'Moderate',   color:'#e53e3e' },
    { key:'D4', idr:0.033,  label_ja:'大破',   label_en:'Heavy',      color:'#805ad5' },
    { key:'D5', idr:0.067,  label_ja:'倒壊',   label_en:'Collapse',   color:'#1a202c' }
];

/**
 * プリセットと階数から建物パラメータを算定
 * @param {string} presetKey - BUILDING_PRESETSのキー
 * @param {number} nFloors - 階数
 * @param {object} [overrides] - カスタム上書き値 {W, T1, Cy, alpha, h, He}
 * @returns {object} 建物パラメータ
 */
function calcBuildingParams(presetKey, nFloors, overrides) {
    const preset = BUILDING_PRESETS[presetKey];
    if (!preset) return null;

    const g = 980; // cm/s²

    // 基本パラメータ（プリセットから算定、overridesで上書き可能）
    const W  = (overrides && overrides.W)  || preset.wPerFloor * nFloors;  // kN
    const He = (overrides && overrides.He) || nFloors * preset.floorH * 0.7; // m
    const H  = nFloors * preset.floorH; // 建物高さ [m]
    const T1 = (overrides && overrides.T1) || preset.tCoeff * H;          // s
    const Cy = (overrides && overrides.Cy) || preset.Cy;
    const alpha = (overrides && overrides.alpha) || preset.alpha;
    const h  = (overrides && overrides.h)  || preset.h;

    // 導出パラメータ
    const W_cgscm = W * 1000 * 100; // kN → dyne (1kN = 1000N = 100000dyne... no)
    // 単位系: SI（kN, m, s）で計算し、応答計算時にcm系に変換
    const M = W / 9.80665; // kN/(m/s²) = t (トン)
    const omega = 2 * Math.PI / T1;
    const K1 = omega * omega * M; // kN/m
    const Qy = Cy * W; // kN
    const dy = Qy / K1; // m → cmに変換して応答計算へ
    const dy_cm = dy * 100; // cm

    return {
        presetKey, nFloors, W, He, T1, Cy, alpha, h,
        K1, Qy, dy: dy_cm, // dy in cm
        limitIDR: preset.limitIDR,
        label_ja: preset.label_ja,
        label_en: preset.label_en
    };
}
