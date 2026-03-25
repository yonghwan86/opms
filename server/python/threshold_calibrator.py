#!/usr/bin/env python3
"""
임계값 자동 산출: 전일 대비 변동폭의 정상 범위(평균 + 3σ)를 초과하는 최솟값
결과를 ai_forecast_settings.threshold_won에 저장
"""
import os
import sys
import json
import numpy as np
import psycopg2

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)

def fetch_price_history(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, gasoline_avg, diesel_avg
        FROM domestic_avg_price_history
        WHERE gasoline_avg IS NOT NULL
        ORDER BY date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows

def save_threshold(conn, threshold_won):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO ai_forecast_settings (key, threshold_won, updated_at)
        VALUES ('price_change_threshold', %s, NOW())
        ON CONFLICT (key) DO UPDATE SET
            threshold_won = EXCLUDED.threshold_won,
            updated_at = NOW()
    """, (threshold_won,))
    conn.commit()
    cur.close()

def fetch_current_threshold(conn):
    cur = conn.cursor()
    cur.execute("SELECT threshold_won FROM ai_forecast_settings WHERE key = 'price_change_threshold'")
    row = cur.fetchone()
    cur.close()
    if row and row[0]:
        return float(row[0])
    return None

def main():
    try:
        conn = get_db_conn()
        rows = fetch_price_history(conn)

        if len(rows) < 10:
            old_threshold = fetch_current_threshold(conn)
            conn.close()
            print(json.dumps({
                "warning": "데이터 부족 (최소 10일 필요)",
                "oldThreshold": old_threshold,
                "newThreshold": old_threshold,
            }, ensure_ascii=False))
            return

        prices = [float(r[1]) for r in rows]
        changes = [abs(prices[i] - prices[i-1]) for i in range(1, len(prices))]
        changes_arr = np.array(changes)

        mean_change = float(np.mean(changes_arr))
        std_change = float(np.std(changes_arr))
        threshold = mean_change + 3 * std_change

        old_threshold = fetch_current_threshold(conn)
        save_threshold(conn, round(threshold, 2))
        conn.close()

        result = {
            "newThreshold": round(threshold, 2),
            "oldThreshold": old_threshold,
            "meanChange": round(mean_change, 2),
            "stdChange": round(std_change, 2),
            "dataPoints": len(changes),
        }
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
