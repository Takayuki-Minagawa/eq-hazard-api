// ================================================================
//  fragility.js — フラジリティカーブ・被害レベル定義
// ================================================================

/**
 * 標準正規分布の累積分布関数（Abramowitz & Stegun 近似）
 * @param {number} x
 * @returns {number} P(Z <= x)
 */
function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422804014327; // 1/sqrt(2π)
    const p = d * Math.exp(-x * x / 2) *
              (t * (0.3193815 + t * (-0.3565638 + t * (1.781478 +
               t * (-1.821256 + t * 1.330274)))));
    return x > 0 ? 1 - p : p;
}

/**
 * フラジリティカーブ: P(IDR >= threshold | IDR)
 * 対数正規分布モデル
 * @param {number} idr - 最大層間変形角 [rad]
 * @param {number} medianIDR - 被害レベル到達のIDR中央値 [rad]
 * @param {number} beta - 対数標準偏差
 * @returns {number} 超過確率 [0, 1]
 */
function fragilityCurve(idr, medianIDR, beta) {
    if (idr <= 0 || medianIDR <= 0 || beta <= 0) return 0;
    return normalCDF(Math.log(idr / medianIDR) / beta);
}

/**
 * フラジリティパラメータ（各被害レベル）
 * medianIDR: IDR中央値 [rad]
 * beta: 対数標準偏差（需要+容量の結合）
 *
 * 報告書の知見に基づく設定:
 * - beta_demand ≈ 0.3-0.5 (地震動による応答のばらつき)
 * - beta_capacity ≈ 0.39 (構造特性のばらつき、報告書2.4.8)
 * - beta_total = sqrt(beta_demand² + beta_capacity²) ≈ 0.5-0.6
 */
const FRAGILITY_PARAMS = {
    D1: { medianIDR: 0.005,  beta: 0.55 }, // 軽微: 1/200
    D2: { medianIDR: 0.0083, beta: 0.55 }, // 小破: 1/120
    D3: { medianIDR: 0.017,  beta: 0.55 }, // 中破: 1/60
    D4: { medianIDR: 0.033,  beta: 0.60 }, // 大破: 1/30
    D5: { medianIDR: 0.067,  beta: 0.60 }  // 倒壊: 1/15
};

/**
 * 全被害レベルのフラジリティ確率を一括計算
 * @param {number} idr - 最大層間変形角 [rad]
 * @returns {object} {D1: prob, D2: prob, D3: prob, D4: prob, D5: prob}
 */
function computeFragilityAll(idr) {
    const result = {};
    for (const [key, params] of Object.entries(FRAGILITY_PARAMS)) {
        result[key] = fragilityCurve(idr, params.medianIDR, params.beta);
    }
    return result;
}

/**
 * フラジリティカーブ描画用データ生成
 * IDR範囲 [0, maxIDR] でフラジリティ確率を計算
 * @param {number} maxIDR - 最大IDR [rad]
 * @param {number} nPoints - データ点数
 * @returns {object} {idrValues: [], curves: {D1: [], D2: [], ...}}
 */
function generateFragilityCurveData(maxIDR, nPoints) {
    const idrValues = [];
    const curves = {};
    for (const key of Object.keys(FRAGILITY_PARAMS)) {
        curves[key] = [];
    }

    for (let i = 0; i <= nPoints; i++) {
        const idr = (maxIDR * i) / nPoints;
        idrValues.push(idr);
        for (const [key, params] of Object.entries(FRAGILITY_PARAMS)) {
            curves[key].push(fragilityCurve(idr, params.medianIDR, params.beta));
        }
    }
    return { idrValues, curves };
}
