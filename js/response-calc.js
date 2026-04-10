// ================================================================
//  response-calc.js — 等価線形化法・応答スペクトル
// ================================================================

/**
 * PBVからPGVへの変換
 * @param {number} PBV - 工学的基盤最大速度 [cm/s]
 * @param {number} ARV - 地盤増幅率
 * @returns {number} PGV [cm/s]
 */
function pbvToPgv(PBV, ARV) {
    return PBV * ARV;
}

/**
 * 告示スペクトル形状ベースの速度応答スペクトル
 * @param {number} T - 周期 [s]
 * @param {number} h - 減衰定数
 * @param {number} PGV - 地表面最大速度 [cm/s]
 * @returns {number} Sv [cm/s]
 */
function getSv(T, h, PGV) {
    const Sv0_base = 100; // cm/s (PGV=50cm/s時のSv平坦部)
    const PGV_base = 50;  // cm/s
    const scale = PGV / PGV_base;

    // 周期による形状（告示スペクトル簡易形状）
    let Sv;
    if (T < 0.16) {
        Sv = Sv0_base * scale * (T / 0.16);
    } else if (T <= 0.864) {
        Sv = Sv0_base * scale;
    } else {
        Sv = Sv0_base * scale * (0.864 / T);
    }

    // 減衰補正（Newmark-Hall型）
    const Fh = 1.5 / (1 + 10 * h);
    const Fh_base = 1.5 / (1 + 10 * 0.05);
    return Sv * (Fh / Fh_base);
}

/**
 * 等価線形化法による最大応答推定
 * @param {number} T1 - 1次固有周期 [s]
 * @param {number} Cy - 降伏せん断力係数
 * @param {number} alpha - 2次剛性比
 * @param {number} h - 減衰定数
 * @param {number} W - 総重量 [kN]
 * @param {number} PGV - 地表面最大速度 [cm/s]
 * @returns {object} {mu, dmax, Teq, heq, idr_ready: true}
 */
function solveResponse(T1, Cy, alpha, h, W, PGV) {
    const g = 980; // cm/s²
    const M = W * 1000 / g; // kN → g (gram-force... no)
    // 単位系を整理: W [kN], 応答計算はcm系で行う
    // K1 = (2π/T1)² × M_cgs
    // M_cgs = W[kN] * 1000[N/kN] / 9.80665[m/s²] * 100[cm/m] ... ×
    // シンプルに: dy = Cy * g * T1² / (4π²) [cm]
    const dy = Cy * g * T1 * T1 / (4 * Math.PI * Math.PI); // cm

    if (PGV <= 0 || dy <= 0) {
        return { mu: 0, dmax: 0, Teq: T1, heq: h };
    }

    let mu = 1.0; // 初期仮定：弾性
    let Teq = T1, heq = h;

    for (let iter = 0; iter < 50; iter++) {
        Teq = T1 * Math.sqrt(mu / (1 + alpha * (mu - 1)));
        const denom = mu * (1 + alpha * (mu - 1));
        heq = h + (2 / Math.PI) * (1 - alpha) * (mu - 1) / (denom > 0 ? denom : 1);

        const Sv = getSv(Teq, heq, PGV);
        const Sd = Sv * Teq / (2 * Math.PI); // 変位応答 [cm]

        const mu_new = Math.max(1.0, Sd / dy);

        if (Math.abs(mu_new - mu) / (mu > 0 ? mu : 1) < 0.001) {
            return { mu: mu_new, dmax: mu_new * dy, Teq, heq };
        }
        mu = 0.5 * mu + 0.5 * mu_new; // 緩和係数で安定化
    }
    return { mu, dmax: mu * dy, Teq, heq };
}

/**
 * 建物モデルに対して各PBVレベルでの応答を計算
 * @param {object} building - calcBuildingParams()の戻り値
 * @param {number} ARV - 地盤増幅率
 * @param {number[]} pbvValues - PBV配列 [cm/s]
 * @returns {object[]} [{pbv, pgv, mu, dmax, idr}, ...]
 */
function computeResponseCurve(building, ARV, pbvValues) {
    const He_cm = building.He * 100; // m → cm
    return pbvValues.map(pbv => {
        const pgv = pbvToPgv(pbv, ARV);
        const resp = solveResponse(building.T1, building.Cy, building.alpha, building.h, building.W, pgv);
        const idr = He_cm > 0 ? resp.dmax / He_cm : 0; // rad
        return { pbv, pgv, mu: resp.mu, dmax: resp.dmax, idr, Teq: resp.Teq, heq: resp.heq };
    });
}
