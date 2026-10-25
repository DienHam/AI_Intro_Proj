"""Compare OpenWeather Air Pollution at Hanoi station coordinates with the hourly table.

The key is read from OPENWEATHER_API_KEY in .env. Responses are point values, not station feeds.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "openweather"
REPORTS = ROOT / "reports" / "field-review"
BASE = "https://api.openweathermap.org/data/2.5"
START = datetime(2025, 10, 24, 17, 0, tzinfo=timezone.utc)  # 2025-10-25 00:00 +07
END = datetime(2026, 10, 24, 16, 0, tzinfo=timezone.utc)  # 2026-10-24 23:00 +07
COMPONENTS = ("co", "no", "no2", "o3", "so2", "pm2_5", "pm10", "nh3")
PAIRS = (
    ("owm_pm25", "pm25", "cams_pm25"),
    ("owm_pm10", "pm10", "cams_pm10"),
    ("owm_no2", "no2", "cams_no2"),
    ("owm_o3", "o3", "cams_o3"),
    ("owm_so2", "so2", None),
    ("owm_co", "co", None),
)


def load_key() -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("OPENWEATHER_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("OPENWEATHER_API_KEY", "")


def get_json(path: str, params: dict) -> dict:
    response = requests.get(f"{BASE}/{path}", params=params, timeout=180)
    if response.status_code != 200:
        detail = response.text[:180].replace(params.get("appid", ""), "[redacted]")
        raise SystemExit(f"{path} HTTP {response.status_code}: {detail}")
    return response.json()


def rows_from_payload(location_id: int, payload: dict, kind: str) -> list[dict]:
    rows = []
    for item in payload.get("list", []):
        components = item.get("components") or {}
        row = {
            "location_id": location_id,
            "kind": kind,
            "time_utc": pd.to_datetime(item["dt"], unit="s", utc=True),
            "owm_aqi": (item.get("main") or {}).get("aqi"),
        }
        for name in COMPONENTS:
            row[f"owm_{name}" if name != "pm2_5" else "owm_pm25"] = components.get(name)
        rows.append(row)
    return rows


def summarize(frame: pd.DataFrame, left: str, right: str) -> dict:
    pair = frame[[left, right]].dropna()
    if pair.empty:
        return {"n": 0, "corr": None, "mae": None, "bias": None}
    return {
        "n": int(len(pair)),
        "corr": round(float(pair[left].corr(pair[right])), 3),
        "mae": round(float((pair[left] - pair[right]).abs().mean()), 2),
        "bias": round(float((pair[left] - pair[right]).mean()), 2),
    }


def main() -> None:
    key = load_key()
    if not key:
        raise SystemExit("OPENWEATHER_API_KEY is empty")
    RAW.mkdir(parents=True, exist_ok=True)
    stations = pd.read_csv(ROOT / "data" / "interim" / "stations.csv")
    params = {"appid": key}
    history_rows: list[dict] = []
    current_rows: list[dict] = []
    for station in stations.itertuples(index=False):
        point = {"lat": station.lat, "lon": station.lon, **params}
        current = get_json("air_pollution", point)
        (RAW / f"current_{station.location_id}.json").write_text(
            json.dumps(current), encoding="utf-8"
        )
        current_rows.extend(rows_from_payload(station.location_id, current, "current"))
        history = get_json(
            "air_pollution/history",
            {**point, "start": int(START.timestamp()), "end": int(END.timestamp())},
        )
        (RAW / f"history_{station.location_id}.json").write_text(
            json.dumps({"n": len(history.get("list", []))}), encoding="utf-8"
        )
        history_rows.extend(rows_from_payload(station.location_id, history, "history"))
        print(f"{station.location_id} history {len(history.get('list', []))}", flush=True)

    forecast = get_json(
        "air_pollution/forecast",
        {"lat": 21.028, "lon": 105.854, **params},
    )
    weather = requests.get(
        f"{BASE}/weather",
        params={"lat": 21.028, "lon": 105.854, "units": "metric", **params},
        timeout=60,
    )
    weather_keys = sorted(weather.json().keys()) if weather.status_code == 200 else []
    weather_main = sorted((weather.json().get("main") or {}).keys()) if weather.ok else []
    weather_wind = sorted((weather.json().get("wind") or {}).keys()) if weather.ok else []

    owm = pd.DataFrame(history_rows)
    owm["hour"] = owm["time_utc"].dt.tz_convert("Asia/Ho_Chi_Minh")
    owm = owm.drop_duplicates(["location_id", "hour"])
    owm.to_parquet(RAW / "history.parquet", index=False)
    hours = pd.read_parquet(ROOT / "data" / "interim" / "hourly_hanoi.parquet")
    hours["hour"] = pd.to_datetime(hours["hour"], utc=True).dt.tz_convert("Asia/Ho_Chi_Minh")
    merged = hours.merge(owm, on=["location_id", "hour"], how="left")

    same_hour = owm.pivot_table(index="hour", columns="location_id", values="owm_pm25")
    identical = bool(same_hour.nunique(axis=1).fillna(1).eq(1).all()) if not same_hour.empty else None

    comparisons = []
    for location_id, group in merged.groupby("location_id"):
        for owm_name, station_name, cams_name in PAIRS:
            if station_name not in group.columns:
                continue
            station_stat = summarize(group, owm_name, station_name)
            cams_stat = summarize(group, owm_name, cams_name) if cams_name and cams_name in group.columns else {}
            comparisons.append(
                {
                    "location_id": int(location_id),
                    "field": station_name,
                    "station_n": station_stat["n"],
                    "station_corr": station_stat["corr"],
                    "station_mae": station_stat["mae"],
                    "station_bias": station_stat["bias"],
                    "cams_n": cams_stat.get("n"),
                    "cams_corr": cams_stat.get("corr"),
                    "cams_mae": cams_stat.get("mae"),
                }
            )
    comparison = pd.DataFrame(comparisons)
    comparison.to_csv(REPORTS / "openweather_compare.csv", index=False)

    train_ids = set(stations.loc[stations["in_train"], "location_id"])
    train = merged[merged["location_id"].isin(train_ids)]
    pooled = []
    for owm_name, station_name, cams_name in PAIRS:
        station_stat = summarize(train, owm_name, station_name)
        cams_stat = summarize(train, owm_name, cams_name) if cams_name else {}
        pooled.append(
            {
                "field": station_name,
                **{f"station_{k}": v for k, v in station_stat.items()},
                "cams_corr": cams_stat.get("corr"),
                "cams_mae": cams_stat.get("mae"),
            }
        )

    summary = {
        "history_rows": int(len(owm)),
        "hours_per_point": int(owm.groupby("location_id").size().median()) if not owm.empty else 0,
        "history_start": str(owm["hour"].min()) if not owm.empty else None,
        "history_end": str(owm["hour"].max()) if not owm.empty else None,
        "pm25_identical_across_stations": identical,
        "forecast_hours": len(forecast.get("list", [])),
        "weather_http": weather.status_code,
        "weather_top_keys": weather_keys,
        "weather_main_keys": weather_main,
        "weather_wind_keys": weather_wind,
        "current": pd.DataFrame(current_rows).drop(columns=["kind"]).to_dict(orient="records"),
        "pooled_train": pooled,
    }
    (REPORTS / "openweather_summary.json").write_text(
        json.dumps(summary, default=str, indent=2), encoding="utf-8"
    )
    print(json.dumps({"history_rows": summary["history_rows"], "identical": identical, "pooled_train": pooled}, default=str))


if __name__ == "__main__":
    main()
