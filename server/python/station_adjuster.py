#!/usr/bin/env python3
"""
주유소별 예측값 생성: 전국 평균 예측값 + 주유소별 최근 30일 편차(δ)
순수 수학 연산만 수행 (Python 스크립트)
"""
import os
import sys
import json
import numpy as np
import psycopg2
from datetime import datetime

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)

def fetch_station_deviations(conn, fuel_type):
    cur = conn.cursor()
    sql_col = "gasoline" if fuel_type == "gasoline" else "diesel"
    cur.execute(f"""
        WITH recent AS (
            SELECT station_id, {sql_col} as price
            FROM oil_price_raw
            WHERE date >= to_char(NOW() - INTERVAL '30 days', 'YYYYMMDD')
              AND {sql_col} IS NOT NULL
        ),
        station_avg AS (
            SELECT station_id, AVG(price) as avg_price
            FROM recent GROUP BY station_id
        ),
        national AS (
            SELECT AVG(price) as national_avg FROM recent
        )
        SELECT sa.station_id, sa.avg_price - n.national_avg as delta
        FROM station_avg sa, national n
        WHERE n.national_avg IS NOT NULL
    """)
    rows = cur.fetchall()
    cur.close()
    return {str(r[0]): float(r[1]) for r in rows}

def fetch_national_forecasts(conn, fuel_type, run_date=None):
    cur = conn.cursor()
    if run_date is None:
        cur.execute("""
            SELECT run_date FROM oil_price_forecasts
            WHERE fuel_type = %s AND scope = 'national'
            ORDER BY run_date DESC LIMIT 1
        """, (fuel_type,))
        row = cur.fetchone()
        if not row:
            cur.close()
            return None, []
        run_date = row[0]

    cur.execute("""
        SELECT target_date, forecast_price, forecast_lower, forecast_upper
        FROM oil_price_forecasts
        WHERE run_date = %s AND fuel_type = %s AND scope = 'national'
        ORDER BY target_date ASC
    """, (run_date, fuel_type))
    rows = cur.fetchall()
    cur.close()
    return str(run_date), [
        {"date": str(r[0]), "forecast": float(r[1]),
         "lower": float(r[2]) if r[2] else None, "upper": float(r[3]) if r[3] else None}
        for r in rows
    ]

def save_station_forecasts(conn, run_date, fuel_type, station_id, forecasts):
    cur = conn.cursor()
    for f in forecasts:
        cur.execute("""
            INSERT INTO oil_price_forecasts (run_date, target_date, fuel_type, scope, scope_id, forecast_price, forecast_lower, forecast_upper)
            VALUES (%s, %s, %s, 'station', %s, %s, %s, %s)
            ON CONFLICT ON CONSTRAINT oil_price_forecasts_run_fuel_scope_target_idx DO UPDATE SET
                forecast_price = EXCLUDED.forecast_price,
                forecast_lower = EXCLUDED.forecast_lower,
                forecast_upper = EXCLUDED.forecast_upper
        """, (run_date, f["date"], fuel_type, station_id, f["forecast"], f.get("lower"), f.get("upper")))
    conn.commit()
    cur.close()

def main():
    # argv[1] = fuel_type (optional, default "gasoline")
    # argv[2] = station_id (optional; if provided, only process that station)
    fuel_type = sys.argv[1] if len(sys.argv) > 1 else "gasoline"
    station_id = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        conn = get_db_conn()
        deviations = fetch_station_deviations(conn, fuel_type)
        run_date, national_forecasts = fetch_national_forecasts(conn, fuel_type)

        if not national_forecasts:
            print(json.dumps({"error": "국가 예측 데이터 없음", "count": 0, "stations": {}}))
            return

        if station_id:
            stations = [station_id]
        else:
            stations = list(deviations.keys())

        station_results = {}
        saved_count = 0
        for sid in stations:
            delta = deviations.get(sid, 0.0)
            station_preds = []
            for f in national_forecasts:
                adj_price = f["forecast"] + delta
                adj_lower = (f["lower"] + delta) if f.get("lower") is not None else None
                adj_upper = (f["upper"] + delta) if f.get("upper") is not None else None
                station_preds.append({
                    "date": f["date"],
                    "forecast": round(adj_price, 2),
                    "lower": round(adj_lower, 2) if adj_lower is not None else None,
                    "upper": round(adj_upper, 2) if adj_upper is not None else None,
                })
            station_results[sid] = {"delta": round(delta, 2)}
            # Always save to DB for all stations
            save_station_forecasts(conn, run_date, fuel_type, sid, station_preds)
            saved_count += 1

        conn.close()

        print(json.dumps({
            "runDate": run_date,
            "fuelType": fuel_type,
            "count": saved_count,
        }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e), "count": 0}), file=sys.stderr)
        print(json.dumps({"error": str(e), "count": 0}))
        sys.exit(1)

if __name__ == "__main__":
    main()
