#!/usr/bin/env python3
"""
마진 이상 탐지: 판매가 - 공급가 = 추정 마진
이중 필터: (판매가 - 공급가 > 지역평균 + 1.5σ) AND (|판매가 - 예측가| > 예측편차 1.5σ)
"""
import os
import sys
import json
import numpy as np
import psycopg2

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)

def fetch_latest_oil_data(conn, fuel_type, sido_filter=None):
    cur = conn.cursor()
    sql_col = "gasoline" if fuel_type == "gasoline" else "diesel"
    params = []
    sido_clause = ""
    if sido_filter:
        placeholders = ",".join(["%s"] * len(sido_filter))
        sido_clause = f"AND r.sido IN ({placeholders})"
        params = sido_filter

    cur.execute(f"""
        WITH latest_date AS (
            SELECT MAX(date) as max_date FROM oil_price_raw
        )
        SELECT r.station_id, r.station_name, r.brand, r.region, r.sido,
               r.{sql_col} as sale_price
        FROM oil_price_raw r, latest_date ld
        WHERE r.date = ld.max_date
          AND r.{sql_col} IS NOT NULL
          {sido_clause}
    """, params)
    rows = cur.fetchall()
    cur.close()
    return rows

def fetch_supply_prices(conn, fuel_type):
    cur = conn.cursor()
    sql_col = "gasoline" if fuel_type == "gasoline" else "diesel"
    cur.execute(f"""
        SELECT company, {sql_col} as supply_price
        FROM oil_weekly_supply_prices
        WHERE week = (SELECT MAX(week) FROM oil_weekly_supply_prices)
          AND {sql_col} IS NOT NULL
    """)
    rows = cur.fetchall()
    cur.close()
    return {str(r[0]): float(r[1]) for r in rows}

def fetch_latest_forecasts(conn, fuel_type):
    cur = conn.cursor()
    cur.execute("""
        SELECT target_date, forecast_price
        FROM oil_price_forecasts
        WHERE run_date = (SELECT MAX(run_date) FROM oil_price_forecasts WHERE fuel_type = %s AND scope = 'national')
          AND fuel_type = %s AND scope = 'national'
        ORDER BY target_date ASC
        LIMIT 1
    """, (fuel_type, fuel_type))
    row = cur.fetchone()
    cur.close()
    if row:
        return float(row[1])
    return None

def company_to_brand(brand):
    brand_map = {
        "SK에너지": "SK에너지",
        "GS칼텍스": "GS칼텍스",
        "현대오일뱅크": "HD현대오일뱅크",
        "HD현대오일뱅크": "HD현대오일뱅크",
        "S-OIL": "S-OIL",
        "에쓰오일": "S-OIL",
    }
    if brand is None:
        return None
    for k, v in brand_map.items():
        if k in brand:
            return v
    return None

def main():
    fuel_type = sys.argv[1] if len(sys.argv) > 1 else "gasoline"
    sido_filter_raw = sys.argv[2] if len(sys.argv) > 2 else None
    sido_filter = sido_filter_raw.split(",") if sido_filter_raw else None

    try:
        conn = get_db_conn()
        oil_data = fetch_latest_oil_data(conn, fuel_type, sido_filter)
        supply_map = fetch_supply_prices(conn, fuel_type)
        forecast_price = fetch_latest_forecasts(conn, fuel_type)
        conn.close()

        if not oil_data:
            print(json.dumps({"anomalies": [], "total": 0, "fuelType": fuel_type}))
            return

        stations = []
        margins = []
        forecast_devs = []

        for row in oil_data:
            station_id, station_name, brand, region, sido, sale_price = row
            supply_company = company_to_brand(brand)
            supply_price = supply_map.get(supply_company) if supply_company else None

            if supply_price is None:
                for k, v in supply_map.items():
                    supply_price = v
                    break
            if supply_price is None:
                continue

            margin = float(sale_price) - float(supply_price)
            forecast_dev = abs(float(sale_price) - forecast_price) if forecast_price is not None else 0

            stations.append({
                "stationId": str(station_id),
                "stationName": str(station_name),
                "brand": str(brand) if brand else None,
                "region": str(region),
                "sido": str(sido),
                "salePrice": float(sale_price),
                "supplyPrice": float(supply_price),
                "margin": round(margin, 2),
                "forecastDev": round(forecast_dev, 2),
            })
            margins.append(margin)
            forecast_devs.append(forecast_dev)

        if not margins:
            print(json.dumps({"anomalies": [], "total": 0, "fuelType": fuel_type}))
            return

        sido_margins = {}
        for i, s in enumerate(stations):
            sido = s["sido"]
            if sido not in sido_margins:
                sido_margins[sido] = []
            sido_margins[sido].append(margins[i])

        sido_stats = {}
        for sido, m_list in sido_margins.items():
            arr = np.array(m_list, dtype=float)
            sido_stats[sido] = {"mean": float(np.mean(arr)), "std": float(np.std(arr))}

        if forecast_devs:
            fd_arr = np.array(forecast_devs, dtype=float)
            forecast_dev_mean = float(np.mean(fd_arr))
            forecast_dev_std = float(np.std(fd_arr))
        else:
            forecast_dev_mean = 0
            forecast_dev_std = 0

        SIGMA = 1.5
        anomalies = []
        for i, s in enumerate(stations):
            sido = s["sido"]
            stats = sido_stats.get(sido, {"mean": 0, "std": 0})
            margin_threshold = stats["mean"] + SIGMA * stats["std"]
            forecast_threshold = forecast_dev_mean + SIGMA * forecast_dev_std

            cond1 = margins[i] > margin_threshold
            cond2 = forecast_devs[i] > forecast_threshold

            if cond1 and cond2:
                anomalies.append({
                    **s,
                    "regionMean": round(stats["mean"], 2),
                    "regionStd": round(stats["std"], 2),
                    "marginThreshold": round(margin_threshold, 2),
                    "forecastDevThreshold": round(forecast_threshold, 2),
                })

        anomalies.sort(key=lambda x: x["margin"], reverse=True)

        print(json.dumps({
            "anomalies": anomalies,
            "total": len(anomalies),
            "fuelType": fuel_type,
            "forecastPrice": forecast_price,
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e), "anomalies": [], "total": 0}), file=sys.stderr)
        print(json.dumps({"error": str(e), "anomalies": [], "total": 0}))
        sys.exit(1)

if __name__ == "__main__":
    main()
