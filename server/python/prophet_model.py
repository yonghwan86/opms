#!/usr/bin/env python3
"""
Prophet 기반 휘발유/경유 14일 예측 모델
- 외부 회귀변수: 최적 lag 적용 국제 제품가 (원화/리터 환산)
- 정책 이벤트(policy_events)를 Prophet holidays로 동적 로드
"""
import os
import sys
import json
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import psycopg2
from datetime import datetime, timedelta

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL", "")
    return psycopg2.connect(db_url)

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

def fetch_intl_prices(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, gasoline, diesel, wti, brent, dubai
        FROM intl_fuel_prices
        ORDER BY date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows

def fetch_exchange_rates(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, rate
        FROM exchange_rate_history
        ORDER BY date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows

def fetch_policy_events(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT event_date, event_type, description
        FROM policy_events
        ORDER BY event_date ASC
    """)
    rows = cur.fetchall()
    cur.close()
    return rows

def fetch_optimal_lags(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT date, wti, brent, dubai
        FROM intl_fuel_prices
        WHERE (wti IS NOT NULL OR brent IS NOT NULL OR dubai IS NOT NULL)
        ORDER BY date ASC
    """)
    intl_rows = cur.fetchall()

    cur.execute("""
        SELECT date, gasoline_avg
        FROM domestic_avg_price_history
        ORDER BY date ASC
    """)
    dom_rows = cur.fetchall()
    cur.close()

    intl_map = {}
    for r in intl_rows:
        d = str(r[0])
        intl_map[d] = float(r[1]) if r[1] is not None else None

    dom_map = {}
    for r in dom_rows:
        d = str(r[0])
        dom_map[d] = float(r[1]) if r[1] is not None else None

    common = sorted(set(intl_map.keys()) & set(dom_map.keys()))
    if len(common) < 10:
        return 7

    x = [intl_map[d] for d in common]
    y = [dom_map[d] for d in common]
    x_arr = np.array(x, dtype=float)
    y_arr = np.array(y, dtype=float)

    best_lag = 7
    best_corr = -999
    for lag in range(1, 22):
        if lag >= len(x_arr):
            break
        xi = x_arr[:len(x_arr) - lag]
        yi = y_arr[lag:]
        valid = ~(np.isnan(xi) | np.isnan(yi))
        if valid.sum() < 5:
            continue
        c = float(np.corrcoef(xi[valid], yi[valid])[0, 1])
        if not np.isnan(c) and c > best_corr:
            best_corr = c
            best_lag = lag

    return best_lag

def usd_per_barrel_to_krw_per_liter(price_usd_barrel, exchange_rate):
    if price_usd_barrel is None or exchange_rate is None:
        return None
    BARRELS_TO_LITERS = 158.987
    return (price_usd_barrel / BARRELS_TO_LITERS) * exchange_rate

def build_regressor_series(intl_rows, exr_rows, optimal_lag, fuel_col_idx):
    intl_map = {}
    for r in intl_rows:
        d = str(r[0])
        price = float(r[fuel_col_idx]) if r[fuel_col_idx] is not None else None
        if price is not None:
            intl_map[d] = price

    exr_map = {}
    for r in exr_rows:
        d = str(r[0]).replace("-", "")[:8]
        val = float(r[1]) if r[1] is not None else None
        if val is not None:
            exr_map[d] = val

    intl_sorted = sorted(intl_map.keys())
    exr_sorted = sorted(exr_map.keys())

    def get_floor_value(date_str, data_map, sorted_keys):
        """날짜가 없으면 가장 최근 알려진 값으로 forward-fill."""
        lo, hi = 0, len(sorted_keys) - 1
        result_key = None
        while lo <= hi:
            mid = (lo + hi) // 2
            if sorted_keys[mid] <= date_str:
                result_key = sorted_keys[mid]
                lo = mid + 1
            else:
                hi = mid - 1
        return data_map.get(result_key) if result_key is not None else None

    def get_lagged(ds, lag):
        from datetime import datetime, timedelta
        dt = datetime.strptime(str(ds), "%Y%m%d")
        lagged_dt = dt - timedelta(days=lag)
        lagged_date = lagged_dt.strftime("%Y%m%d")
        raw_price = get_floor_value(lagged_date, intl_map, intl_sorted)
        exr = get_floor_value(lagged_date, exr_map, exr_sorted)
        if raw_price is None or exr is None:
            return None
        return usd_per_barrel_to_krw_per_liter(raw_price, exr)

    return get_lagged

def run_prophet_forecast(fuel_type, domestic_rows, intl_rows, exr_rows, policy_events_rows, optimal_lag, run_date_str):
    try:
        from prophet import Prophet
    except ImportError:
        return None, "prophet 패키지 없음"

    col_idx = 1 if fuel_type == "gasoline" else 2
    intl_fuel_col = 1 if fuel_type == "gasoline" else 2

    df_rows = []
    for r in domestic_rows:
        d = str(r[0])
        val = r[col_idx]
        if val is not None:
            df_rows.append({"ds": pd.Timestamp(f"{d[:4]}-{d[4:6]}-{d[6:8]}"), "y": float(val)})
    if len(df_rows) < 14:
        return None, "학습 데이터 부족"

    df = pd.DataFrame(df_rows).sort_values("ds").reset_index(drop=True)

    get_lagged = build_regressor_series(intl_rows, exr_rows, optimal_lag, intl_fuel_col)

    def date_to_ymd(ts):
        return ts.strftime("%Y%m%d")

    df["regressor"] = df["ds"].apply(lambda ts: get_lagged(date_to_ymd(ts), optimal_lag))
    df["regressor"] = pd.to_numeric(df["regressor"], errors="coerce")
    reg_mean = df["regressor"].mean()
    df["regressor"] = df["regressor"].fillna(reg_mean)

    holidays = None
    if policy_events_rows:
        holiday_list = []
        for ev in policy_events_rows:
            ev_date = str(ev[0]).replace("-", "")
            try:
                ev_ts = pd.Timestamp(f"{ev_date[:4]}-{ev_date[4:6]}-{ev_date[6:8]}")
                holiday_list.append({"holiday": str(ev[1]), "ds": ev_ts, "lower_window": -1, "upper_window": 1})
            except Exception:
                pass
        if holiday_list:
            holidays = pd.DataFrame(holiday_list)

    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        holidays=holidays,
        interval_width=0.95,
        changepoint_prior_scale=0.02,
    )
    m.add_regressor("regressor")

    try:
        m.fit(df)
    except Exception as e:
        return None, f"Prophet 학습 실패: {e}"

    future = m.make_future_dataframe(periods=14)

    all_dates_ymd = [date_to_ymd(ts) for ts in future["ds"]]
    future["regressor"] = [get_lagged(d, optimal_lag) for d in all_dates_ymd]
    future["regressor"] = pd.to_numeric(future["regressor"], errors="coerce").fillna(reg_mean)

    forecast = m.predict(future)

    history_mask = forecast["ds"] <= df["ds"].max()
    forecast_mask = forecast["ds"] > df["ds"].max()

    history_df = forecast[history_mask].copy()
    future_df = forecast[forecast_mask].copy()

    actual_map = dict(zip(df["ds"], df["y"]))
    history_points = []
    for _, row in history_df.iterrows():
        d_str = row["ds"].strftime("%Y%m%d")
        actual = actual_map.get(row["ds"])
        history_points.append({
            "date": d_str,
            "actual": round(float(actual), 2) if actual is not None else None,
            "forecast": round(float(row["yhat"]), 2),
        })

    recent_30 = history_points[-30:] if len(history_points) > 30 else history_points
    mape_vals = [
        abs(p["actual"] - p["forecast"]) / abs(p["actual"])
        for p in recent_30
        if p["actual"] is not None and p["actual"] != 0
    ]
    mape = float(np.mean(mape_vals) * 100) if mape_vals else None

    price_floor = 1400 if fuel_type == "gasoline" else 1200
    price_cap = 2200 if fuel_type == "gasoline" else 2100

    future_points = []
    for i, (_, row) in enumerate(future_df.iterrows()):
        d_str = row["ds"].strftime("%Y%m%d")
        yhat = max(price_floor, min(price_cap, float(row["yhat"])))
        yhat_lower = max(price_floor, min(price_cap, float(row["yhat_lower"])))
        yhat_upper = max(price_floor, min(price_cap, float(row["yhat_upper"])))
        future_points.append({
            "date": d_str,
            "forecast": round(yhat, 2),
            "lower": round(yhat_lower, 2),
            "upper": round(yhat_upper, 2),
            "phase": 1 if i < 7 else 2,
        })

    return {
        "fuelType": fuel_type,
        "mape": round(mape, 2) if mape is not None else None,
        "history": recent_30,
        "forecast": future_points,
        "optimalLag": optimal_lag,
    }, None

def save_forecasts(conn, run_date, fuel_type, future_points):
    cur = conn.cursor()
    for p in future_points:
        cur.execute("""
            INSERT INTO oil_price_forecasts (run_date, target_date, fuel_type, scope, forecast_price, forecast_lower, forecast_upper)
            VALUES (%s, %s, %s, 'national', %s, %s, %s)
            ON CONFLICT ON CONSTRAINT oil_price_forecasts_run_fuel_scope_target_idx DO UPDATE SET
                forecast_price = EXCLUDED.forecast_price,
                forecast_lower = EXCLUDED.forecast_lower,
                forecast_upper = EXCLUDED.forecast_upper
        """, (run_date, p["date"], fuel_type, p["forecast"], p["lower"], p["upper"]))
    conn.commit()
    cur.close()

def main():
    try:
        conn = get_db_conn()
        run_date = datetime.now().strftime("%Y%m%d")

        domestic_rows = fetch_domestic_avg(conn)
        intl_rows = fetch_intl_prices(conn)
        exr_rows = fetch_exchange_rates(conn)
        policy_events_rows = fetch_policy_events(conn)

        optimal_lag = fetch_optimal_lags(conn)

        results = {}
        errors = []

        for fuel in ["gasoline", "diesel"]:
            result, err = run_prophet_forecast(
                fuel, domestic_rows, intl_rows, exr_rows, policy_events_rows, optimal_lag, run_date
            )
            if err:
                errors.append(f"{fuel}: {err}")
            if result:
                save_forecasts(conn, run_date, fuel, result["forecast"])
                results[fuel] = result

        conn.close()

        output = {
            "runDate": run_date,
            "optimalLag": optimal_lag,
            "results": results,
            "errors": errors if errors else None,
        }
        print(json.dumps(output, ensure_ascii=False))

    except Exception as e:
        error_output = {"error": str(e), "results": {}}
        print(json.dumps(error_output, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
