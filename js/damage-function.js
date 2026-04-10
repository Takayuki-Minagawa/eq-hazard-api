// ================================================================
//  damage-function.js — 被害関数・ハザード積分
// ================================================================

/**
 * ハザードカーブデータからannualRateを算定
 * J-SHISのprob配列は超過確率（指定期間）なので年超過確率に変換
 * @param {number} excProb - 期間超過確率
 * @param {number} years - 評価期間 [年]
 * @returns {number} 年超過確率
 */
function excProbToAnnualRate(excProb, years) {
    if (excProb >= 0.9999) return 10; // 上限キャップ（年率10は事実上確実）
    if (excProb <= 0) return 0;
    return -Math.log(1 - excProb) / years;
}

/**
 * 年超過確率から期間超過確率（ポアソン過程仮定）
 * @param {number} annualProb - 年超過確率
 * @param {number} years - 評価期間 [年]
 * @returns {number} 期間超過確率
 */
function periodExceedance(annualProb, years) {
    return 1 - Math.exp(-annualProb * years);
}

/**
 * ハザードカーブとフラジリティを畳み込んで被害の年超過確率を算定
 *
 * @param {object[]} hazardCurve - [{pbv, excProb}, ...] PBV昇順
 * @param {object} building - calcBuildingParams()の戻り値
 * @param {number} ARV - 地盤増幅率
 * @param {string} damageKey - 被害レベルキー ('D1'-'D5')
 * @param {number} evalYears - ハザードカーブの評価期間 [年]
 * @returns {number} 年超過確率
 */
function computeAnnualDamageProb(hazardCurve, building, ARV, damageKey, evalYears) {
    const fParams = FRAGILITY_PARAMS[damageKey];
    if (!fParams || hazardCurve.length < 2) return 0;

    const He_cm = building.He * 100;
    let annualProb = 0;

    for (let i = 0; i < hazardCurve.length - 1; i++) {
        // 区間の中央PBV
        const pbv_mid = (hazardCurve[i].pbv + hazardCurve[i + 1].pbv) / 2;
        const pgv = pbvToPgv(pbv_mid, ARV);

        // 建物応答推定
        const resp = solveResponse(building.T1, building.Cy, building.alpha, building.h, building.W, pgv);
        const idr = He_cm > 0 ? resp.dmax / He_cm : 0;

        // フラジリティ確率
        const pDamage = fragilityCurve(idr, fParams.medianIDR, fParams.beta);

        // ハザードカーブの微分（年発生率の差分）
        const rate_i = excProbToAnnualRate(hazardCurve[i].excProb, evalYears);
        const rate_i1 = excProbToAnnualRate(hazardCurve[i + 1].excProb, evalYears);
        const dLambda = Math.abs(rate_i - rate_i1);

        annualProb += pDamage * dLambda;
    }

    return annualProb;
}

/**
 * 全被害レベルの超過確率を一括計算
 *
 * @param {number[]} simValues - PBV値配列（J-SHIS sim）
 * @param {number[]} probValues - 超過確率配列（J-SHIS prob）
 * @param {object} building - calcBuildingParams()の戻り値
 * @param {number} ARV - 地盤増幅率
 * @param {number} evalYears - ハザードカーブの評価期間 [年]（50 or 30）
 * @param {number} displayYears - 表示用評価期間 [年]（50 or 30）
 * @returns {object} {D1: {annual, period}, D2: {...}, ...}
 */
function computeAllDamageProbs(simValues, probValues, building, ARV, evalYears, displayYears) {
    // ハザードカーブデータを構造化
    const hazardCurve = [];
    for (let i = 0; i < simValues.length && i < probValues.length; i++) {
        const pbv = parseFloat(simValues[i]);
        const excProb = parseFloat(probValues[i]);
        if (!isNaN(pbv) && !isNaN(excProb) && pbv >= 0) {
            hazardCurve.push({ pbv, excProb });
        }
    }
    // PBV昇順ソート、PBV=0は除外（超過確率1.0の点は積分に寄与しない）
    hazardCurve.sort((a, b) => a.pbv - b.pbv);
    while (hazardCurve.length > 0 && hazardCurve[0].pbv <= 0) hazardCurve.shift();

    const results = {};
    for (const key of Object.keys(FRAGILITY_PARAMS)) {
        const annual = computeAnnualDamageProb(hazardCurve, building, ARV, key, evalYears);
        results[key] = {
            annual,
            period: periodExceedance(annual, displayYears)
        };
    }
    return results;
}
