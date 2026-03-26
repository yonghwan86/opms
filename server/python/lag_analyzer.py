#!/usr/bin/env python3
"""
교차상관(Cross-Correlation) 기반 국제가격 → 국내 판매가 최적 시차 분석
- 1차차분(First-Difference) CCF: 비정상 시계열 보정
- 국제 원유가(WTI/브렌트/두바이) + 국제 제품가(휘발유/경유) 동시 분석
- 구간 단절(공휴일 7일+ gap) 자동 처리
- 실증 fallback: 휘발유 6일, 경유 6일 (2025년 252일 데이터 기반)
"""
import os
import sys
import json
import datetime
import numpy as np
import psycopg2

EMPIRICAL_FALLBACK = {
    "gasoline": 6,
    "diesel": 6,
}
MIN_COMMON_DAYS = 30
MAX_GAP_DAYS = 6


def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)


def fetch_intl_prices(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, wti, brent, dubai, gasoline, diesel
        FROM intl_fuel_prices
        WHERE (wti IS NOT NULL OR brent IS NOT NULL OR dubai IS NOT NULL
               OR gasoline IS NOT NULL OR diesel IS NOT NULL)
        ORDER BY date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def fetch_domestic_avg(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, gasoline_avg, diesel_avg
        FROM domestic_avg_price_history
        ORDER BY date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def split_segments(dates, max_gap=MAX_GAP_DAYS):
    """날짜 리스트를 연속 구간으로 분할 (gap > max_gap 이면 단절)"""
    if not dates:
        return []
    segments = []
    seg = [dates[0]]
    for i in range(1, len(dates)):
        d_prev = datetime.date(int(dates[i-1][:4]), int(dates[i-1][4:6]), int(dates[i-1][6:8]))
        d_curr = datetime.date(int(dates[i][:4]), int(dates[i][4:6]), int(dates[i][6:8]))
        if (d_curr - d_prev).days <= max_gap:
            seg.append(dates[i])
        else:
            segments.append(seg)
            seg = [dates[i]]
    segments.append(seg)
    return segments


def ccf_1diff(x, y, max_lag=21):
    """1차차분 교차상관계수 계산 (정상성 확보)"""
    x = np.array(x, dtype=float)
    y = np.array(y, dtype=float)
    xd = np.diff(x)
    yd = np.diff(y)
    ml = min(max_lag, max(0, len(xd) // 4))
    mu_x, sd_x = np.nanmean(xd), np.nanstd(xd)
    mu_y, sd_y = np.nanmean(yd), np.nanstd(yd)
    xd = (xd - mu_x) / (sd_x + 1e-9)
    yd = (yd - mu_y) / (sd_y + 1e-9)
    results = []
    for lag in range(ml + 1):
        a = xd[:len(xd) - lag] if lag > 0 else xd
        b = yd[lag:]
        if len(a) == 0 or len(b) == 0:
            results.append(0.0)
            continue
        valid = ~(np.isnan(a) | np.isnan(b))
        if valid.sum() < 5:
            results.append(0.0)
        else:
            c = np.corrcoef(a[valid], b[valid])[0, 1]
            results.append(float(c) if not np.isnan(c) else 0.0)
    return results


def analyze_pair(intl_series, dom_series, dates):
    """구간 분할 후 각 구간별 CCF 계산, 가장 긴 구간 결과 반환"""
    segments = split_segments(dates)
    best_result = None
    best_n = 0

    for seg in segments:
        if len(seg) < 15:
            continue
        xi = [intl_series[d] for d in seg if intl_series.get(d) is not None and dom_series.get(d) is not None]
        yi = [dom_series[d] for d in seg if intl_series.get(d) is not None and dom_series.get(d) is not None]
        seg_valid = [d for d in seg if intl_series.get(d) is not None and dom_series.get(d) is not None]

        if len(xi) < 15:
            continue

        ccf = ccf_1diff(xi, yi)
        if not ccf:
            continue

        best_lag = int(np.argmax(ccf))
        best_r = ccf[best_lag]

        if len(seg_valid) > best_n:
            best_n = len(seg_valid)
            best_result = {
                "optimalLag": best_lag,
                "maxCorrelation": round(best_r, 4),
                "correlations": [round(c, 4) for c in ccf],
                "sampleSize": len(seg_valid),
                "period": f"{seg_valid[0]}~{seg_valid[-1]}",
            }

    return best_result


def analyze_lag(intl_rows, domestic_rows):
    intl_map = {}
    for row in intl_rows:
        date = str(row[0])
        intl_map[date] = {
            "wti":     float(row[1]) if row[1] is not None else None,
            "brent":   float(row[2]) if row[2] is not None else None,
            "dubai":   float(row[3]) if row[3] is not None else None,
            "gasoline": float(row[4]) if row[4] is not None else None,
            "diesel":   float(row[5]) if row[5] is not None else None,
        }

    domestic_map = {}
    for row in domestic_rows:
        date = str(row[0])
        domestic_map[date] = {
            "gasoline": float(row[1]) if row[1] is not None else None,
            "diesel":   float(row[2]) if row[2] is not None else None,
        }

    common_dates = sorted(set(intl_map.keys()) & set(domestic_map.keys()))
    if len(common_dates) < MIN_COMMON_DAYS:
        return None, f"공통 날짜 {len(common_dates)}일 (최소 {MIN_COMMON_DAYS}일 필요)"

    results = {}

    intl_fields = {
        "wti":     ("wti",     "gasoline"),
        "brent":   ("brent",   "gasoline"),
        "dubai":   ("dubai",   "gasoline"),
        "product_gasoline": ("gasoline", "gasoline"),
        "product_diesel":   ("diesel",   "diesel"),
    }

    for key, (intl_field, dom_field) in intl_fields.items():
        intl_s = {d: intl_map[d].get(intl_field) for d in common_dates}
        dom_s  = {d: domestic_map[d].get(dom_field) for d in common_dates}
        res = analyze_pair(intl_s, dom_s, common_dates)
        if res:
            results[key] = res

    return results, None


def main():
    try:
        conn = get_db_conn()
        intl_rows = fetch_intl_prices(conn)
        domestic_rows = fetch_domestic_avg(conn)
        conn.close()

        if not intl_rows or not domestic_rows:
            _emit_fallback("데이터 부족 (국제가 또는 국내 평균가 이력 없음)")
            return

        analysis, err = analyze_lag(intl_rows, domestic_rows)
        if err:
            _emit_fallback(err)
            return

        prod_gas = analysis.get("product_gasoline", {})
        prod_dsl = analysis.get("product_diesel", {})

        output = {}
        for crude in ["wti", "brent", "dubai"]:
            crude_info = analysis.get(crude, {})
            gas_lag = crude_info.get("optimalLag", EMPIRICAL_FALLBACK["gasoline"])
            dsl_lag = prod_dsl.get("optimalLag", EMPIRICAL_FALLBACK["diesel"])
            output[crude] = {
                "optimalLag": gas_lag,
                "correlations": crude_info.get("correlations", []),
                "maxCorrelation": crude_info.get("maxCorrelation", 0),
                "sampleSize": crude_info.get("sampleSize", 0),
                "dieselOptimalLag": dsl_lag,
                "dieselCorrelations": prod_dsl.get("correlations", []),
            }

        output["product"] = {
            "gasolineLag": prod_gas.get("optimalLag", EMPIRICAL_FALLBACK["gasoline"]),
            "dieselLag":   prod_dsl.get("optimalLag", EMPIRICAL_FALLBACK["diesel"]),
            "gasolineCorrelations": prod_gas.get("correlations", []),
            "dieselCorrelations":   prod_dsl.get("correlations", []),
            "sampleSize": prod_gas.get("sampleSize", 0),
            "period":     prod_gas.get("period", ""),
        }
        output["dataInsufficient"] = False

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        _emit_fallback(str(e))
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


def _emit_fallback(reason):
    fallback_ccf = [0.0] * 22
    result = {
        "wti":   {"optimalLag": EMPIRICAL_FALLBACK["gasoline"], "correlations": fallback_ccf,
                  "maxCorrelation": 0, "sampleSize": 0, "dieselOptimalLag": EMPIRICAL_FALLBACK["diesel"], "dieselCorrelations": fallback_ccf},
        "brent": {"optimalLag": EMPIRICAL_FALLBACK["gasoline"], "correlations": fallback_ccf,
                  "maxCorrelation": 0, "sampleSize": 0, "dieselOptimalLag": EMPIRICAL_FALLBACK["diesel"], "dieselCorrelations": fallback_ccf},
        "dubai": {"optimalLag": EMPIRICAL_FALLBACK["gasoline"], "correlations": fallback_ccf,
                  "maxCorrelation": 0, "sampleSize": 0, "dieselOptimalLag": EMPIRICAL_FALLBACK["diesel"], "dieselCorrelations": fallback_ccf},
        "product": {
            "gasolineLag": EMPIRICAL_FALLBACK["gasoline"],
            "dieselLag":   EMPIRICAL_FALLBACK["diesel"],
            "gasolineCorrelations": fallback_ccf,
            "dieselCorrelations":   fallback_ccf,
            "sampleSize": 0,
            "period": "",
        },
        "dataInsufficient": True,
        "error": reason,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
