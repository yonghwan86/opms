#!/usr/bin/env python3
"""
교차상관(Cross-Correlation) 기반 WTI·브렌트·두바이 → 국내 판매가 최적 시차 분석
"""
import os
import sys
import json
import numpy as np
import psycopg2

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)

def fetch_intl_prices(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, wti, brent, dubai
        FROM intl_fuel_prices
        WHERE (wti IS NOT NULL OR brent IS NOT NULL OR dubai IS NOT NULL)
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

def cross_correlation(x, y, max_lag=21):
    x = np.array(x, dtype=float)
    y = np.array(y, dtype=float)
    x = (x - np.nanmean(x)) / (np.nanstd(x) + 1e-9)
    y = (y - np.nanmean(y)) / (np.nanstd(y) + 1e-9)
    n = len(x)
    results = []
    for lag in range(0, max_lag + 1):
        if lag >= n:
            results.append(0.0)
            continue
        xi = x[:n - lag]
        yi = y[lag:]
        valid = ~(np.isnan(xi) | np.isnan(yi))
        if valid.sum() < 5:
            results.append(0.0)
        else:
            c = np.corrcoef(xi[valid], yi[valid])[0, 1]
            results.append(float(c) if not np.isnan(c) else 0.0)
    return results

def analyze_lag(intl_rows, domestic_rows):
    intl_map = {}
    for row in intl_rows:
        date = str(row[0])
        intl_map[date] = {
            "wti": float(row[1]) if row[1] is not None else None,
            "brent": float(row[2]) if row[2] is not None else None,
            "dubai": float(row[3]) if row[3] is not None else None,
        }

    domestic_map = {}
    for row in domestic_rows:
        date = str(row[0])
        domestic_map[date] = {
            "gasoline": float(row[1]) if row[1] is not None else None,
            "diesel": float(row[2]) if row[2] is not None else None,
        }

    common_dates = sorted(set(intl_map.keys()) & set(domestic_map.keys()))
    if len(common_dates) < 10:
        return None

    results = {}
    for crude in ["wti", "brent", "dubai"]:
        for fuel in ["gasoline", "diesel"]:
            intl_series = [intl_map[d][crude] for d in common_dates]
            dom_series = [domestic_map[d][fuel] for d in common_dates]
            valid_mask = [
                intl_series[i] is not None and dom_series[i] is not None
                for i in range(len(common_dates))
            ]
            intl_clean = [intl_series[i] for i in range(len(common_dates)) if valid_mask[i]]
            dom_clean = [dom_series[i] for i in range(len(common_dates)) if valid_mask[i]]
            if len(intl_clean) < 10:
                results[f"{crude}_{fuel}"] = {"optimalLag": 0, "correlations": [0.0] * 22}
                continue
            ccf = cross_correlation(intl_clean, dom_clean, max_lag=21)
            best_lag = int(np.argmax(ccf))
            results[f"{crude}_{fuel}"] = {
                "optimalLag": best_lag,
                "correlations": [round(c, 4) for c in ccf],
            }

    return results

def main():
    try:
        conn = get_db_conn()
        intl_rows = fetch_intl_prices(conn)
        domestic_rows = fetch_domestic_avg(conn)
        conn.close()

        if not intl_rows or not domestic_rows:
            result = {
                "error": "데이터 부족 (국제가 또는 국내 평균가 이력 없음)",
                "wti": {"optimalLag": 7, "correlations": []},
                "brent": {"optimalLag": 7, "correlations": []},
                "dubai": {"optimalLag": 7, "correlations": []},
            }
            print(json.dumps(result, ensure_ascii=False))
            return

        analysis = analyze_lag(intl_rows, domestic_rows)
        if analysis is None:
            result = {
                "error": "공통 날짜 데이터 부족",
                "wti": {"optimalLag": 7, "correlations": []},
                "brent": {"optimalLag": 7, "correlations": []},
                "dubai": {"optimalLag": 7, "correlations": []},
            }
            print(json.dumps(result, ensure_ascii=False))
            return

        output = {}
        for crude in ["wti", "brent", "dubai"]:
            gas_key = f"{crude}_gasoline"
            die_key = f"{crude}_diesel"
            gas_info = analysis.get(gas_key, {"optimalLag": 7, "correlations": []})
            die_info = analysis.get(die_key, {"optimalLag": 7, "correlations": []})
            best_lag = gas_info["optimalLag"]
            ccf = gas_info["correlations"]
            output[crude] = {
                "optimalLag": best_lag,
                "correlations": ccf,
                "dieselOptimalLag": die_info["optimalLag"],
                "dieselCorrelations": die_info["correlations"],
            }

        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        error_result = {
            "error": str(e),
            "wti": {"optimalLag": 7, "correlations": []},
            "brent": {"optimalLag": 7, "correlations": []},
            "dubai": {"optimalLag": 7, "correlations": []},
        }
        print(json.dumps(error_result, ensure_ascii=False), file=sys.stderr)
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
