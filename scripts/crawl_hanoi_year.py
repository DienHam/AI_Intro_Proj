"""Crawl one year of Hanoi stations and review model fields.

Station ids come from the OpenAQ API when OPENAQ_API_KEY is set. Otherwise
they come from the public Explorer location tiles, and license fields stay
empty. Measurements come from the public OpenAQ S3 archive. Weather and
CAMS come from Open-Meteo and do not need a key.
"""

from __future__ import annotations

import gzip
import json
import math
import os
import re
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mercantile
import numpy as np
import pandas as pd
import requests
from mapbox_vector_tile import decode as decode_tile

ROOT = Path(__file__).resolve().parents[1]
RAW_OA = ROOT / "data" / "raw" / "openaq"
RAW_METEO = ROOT / "data" / "raw" / "openmeteo"
INTERIM = ROOT / "data" / "interim"
REPORTS = ROOT / "reports" / "field-review"
S3 = "https://openaq-data-archive.s3.amazonaws.com"
S3_NS = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
TZ = "Asia/Ho_Chi_Minh"
BBOX = (105.28, 20.56, 106.05, 21.40)  # west, south, east, north
START = date(2025, 10, 25)
END = date(2026, 10, 24)
CENTER = (21.028, 105.854)
PARAMS = ("pm25", "pm10", "no2", "o3", "so2", "co")
# µg/m³ per ppm at 25 °C and 1 atm: MW / 24.45
PPM_TO_UG = {"co": 28.01 / 24.45, "no2": 46.0055 / 24.45, "so2": 64.066 / 24.45, "o3": 47.998 / 24.45}
WEATHER_FIELDS = (
    "temperature_2m",
    "relative_humidity_2m",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "precipitation",
    "boundary_layer_height",
)
CAMS_FIELDS = {
    "pm2_5": "cams_pm25",
    "pm10": "cams_pm10",
    "nitrogen_dioxide": "cams_no2",
    "ozone": "cams_o3",
    "dust": "cams_dust",
    "aerosol_optical_depth": "cams_aod",
}
V1_FIELDS = ("pm25_lag1", "pm25_lag24", "wind_speed_10m")
BOOST_CANDIDATES = (
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "is_dry_season",
    "temperature_2m",
    "relative_humidity_2m",
    "surface_pressure",
    "wind_u",
    "wind_v",
    "precipitation",
    "boundary_layer_height",
    "pm10",
    "no2",
    "o3",
    "so2",
    "co",
    "cams_pm25",
    "cams_pm10",
    "cams_no2",
    "cams_o3",
    "cams_dust",
    "cams_aod",
    "month",
)
TILE_HEADERS = {
    "Referer": "https://explore.openaq.org/",
    "Origin": "https://explore.openaq.org",
    "User-Agent": "Mozilla/5.0",
}


def load_env_key() -> str:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return ""
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("OPENAQ_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("OPENAQ_API_KEY", "")


def request_json(url: str, params: dict | None = None, headers: dict | None = None) -> dict | list:
    last = None
    for attempt in range(4):
        response = requests.get(url, params=params, headers=headers, timeout=60)
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(2 ** attempt)
            last = response
            continue
        response.raise_for_status()
        return response.json()
    last.raise_for_status()
    raise RuntimeError(url)


def list_s3_keys(prefix: str) -> list[str]:
    keys = []
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        response = None
        for attempt in range(5):
            try:
                response = requests.get(S3, params=params, timeout=60)
                response.raise_for_status()
                break
            except requests.RequestException:
                time.sleep(2 ** attempt)
                response = None
        if response is None:
            raise RuntimeError(f"S3 list failed for {prefix}")
        root = ET.fromstring(response.text)
        keys.extend(node.text for node in root.findall("s:Contents/s:Key", S3_NS) if node.text)
        if root.findtext("s:IsTruncated", default="false", namespaces=S3_NS) != "true":
            break
        token = root.findtext("s:NextContinuationToken", default=None, namespaces=S3_NS)
        if not token:
            break
    return keys


def discover_from_api(api_key: str) -> list[dict]:
    headers = {"X-API-Key": api_key}
    page = 1
    found = []
    while True:
        payload = request_json(
            "https://api.openaq.org/v3/locations",
            params={"bbox": ",".join(str(v) for v in BBOX), "limit": 1000, "page": page},
            headers=headers,
        )
        results = payload.get("results", [])
        found.extend(results)
        if len(results) < 1000:
            break
        page += 1
    rows = []
    for loc in found:
        if loc.get("isMobile"):
            continue
        sensors = loc.get("sensors") or []
        names = {((s.get("parameter") or {}).get("name") or "").lower() for s in sensors}
        if "pm25" not in names:
            continue
        licenses = loc.get("licenses") or []
        license_row = licenses[0] if licenses else {}
        coords = loc.get("coordinates") or {}
        rows.append(
            {
                "location_id": int(loc["id"]),
                "name": loc.get("name"),
                "lat": coords.get("latitude"),
                "lon": coords.get("longitude"),
                "provider_id": (loc.get("provider") or {}).get("id"),
                "provider": (loc.get("provider") or {}).get("name"),
                "is_monitor": loc.get("isMonitor"),
                "is_mobile": loc.get("isMobile"),
                "license_id": license_row.get("id"),
                "license_name": license_row.get("name"),
                "active": None,
                "discovery": "openaq-api",
            }
        )
    return rows


def tile_template() -> str:
    text = requests.get(
        "https://explore.openaq.org/_build/assets/index-B2uwqqVz.js", timeout=60
    ).text
    match = re.search(
        r"https://tiles\.openaq\.org/locations/tiles/\{z\}/\{x\}/\{y\}\.pbf\?apiKey=[0-9a-f]+",
        text,
    )
    if not match:
        raise RuntimeError("Explorer location tiles are unavailable")
    return match.group(0)


def discover_from_tiles() -> list[dict]:
    template = tile_template()
    tiles = list(mercantile.tiles(*BBOX, zooms=[12]))

    def fetch(tile):
        url = template.format(z=tile.z, x=tile.x, y=tile.y)
        raw = requests.get(url, headers=TILE_HEADERS, timeout=40).content
        if not raw:
            return []
        decoded = decode_tile(raw)
        return [
            feat.get("properties") or {}
            for feat in decoded.get("locations", {}).get("features", [])
        ]

    features = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        for fut in as_completed(pool.submit(fetch, tile) for tile in tiles):
            features.extend(fut.result())
    by_id = {}
    for feat in features:
        if not feat.get("pm25"):
            continue
        by_id[int(feat["locations_id"])] = feat
    rows = []
    for loc_id, feat in sorted(by_id.items()):
        rows.append(
            {
                "location_id": loc_id,
                "name": None,
                "lat": None,
                "lon": None,
                "provider_id": feat.get("providers_id"),
                "provider": None,
                "is_monitor": feat.get("ismonitor"),
                "is_mobile": None,
                "license_id": None,
                "license_name": None,
                "active": feat.get("active"),
                "discovery": "explorer-tiles",
            }
        )
    return rows


def day_from_key(key: str) -> date | None:
    match = re.search(r"-(\d{8})\.csv\.gz$", key)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y%m%d").date()


def keys_in_window(location_id: int) -> list[str]:
    keys = []
    cursor = date(START.year, START.month, 1)
    last = date(END.year, END.month, 1)
    while cursor <= last:
        prefix = (
            f"records/csv.gz/locationid={location_id}/year={cursor.year}/"
            f"month={cursor.month:02d}/"
        )
        for key in list_s3_keys(prefix):
            day = day_from_key(key)
            if day is not None and START <= day <= END:
                keys.append(key)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return keys


def download_key(key: str) -> Path:
    dest = RAW_OA / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    response = None
    for attempt in range(5):
        try:
            response = requests.get(f"{S3}/{key}", timeout=60)
            if response.status_code == 404:
                return dest
            response.raise_for_status()
            break
        except requests.RequestException:
            time.sleep(2 ** attempt)
            response = None
    if response is None:
        raise RuntimeError(f"download failed for {key}")
    dest.write_bytes(response.content)
    return dest


def to_ugm3(parameter: str, units: str, value: float) -> tuple[float, float]:
    unit = units.replace("µ", "u").replace("μ", "u").lower().replace(" ", "")
    if unit in {"ug/m3", "ug/m^3"}:
        return value, 1.0
    if unit == "ppm" and parameter in PPM_TO_UG:
        factor = PPM_TO_UG[parameter]
        return value * factor, factor
    if unit == "ppb" and parameter in PPM_TO_UG:
        factor = PPM_TO_UG[parameter] / 1000
        return value * factor, factor
    return value, math.nan


def hourly_from_file(path: Path) -> pd.DataFrame:
    if not path.exists() or path.stat().st_size == 0:
        return pd.DataFrame()
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        frame = pd.read_csv(handle)
    if frame.empty:
        return frame
    frame["parameter"] = frame["parameter"].astype(str).str.lower()
    frame = frame[frame["parameter"].isin(PARAMS)].copy()
    if frame.empty:
        return frame
    frame["value"] = pd.to_numeric(frame["value"], errors="coerce")
    frame.loc[frame["value"] <= -900, "value"] = np.nan
    converted = [
        to_ugm3(param, unit, value)
        for param, unit, value in zip(frame["parameter"], frame["units"], frame["value"])
    ]
    frame["value_ug"] = [row[0] for row in converted]
    frame["unit_factor"] = [row[1] for row in converted]
    stamps = pd.to_datetime(frame["datetime"], utc=True).dt.tz_convert(TZ)
    frame["hour"] = stamps.dt.floor("h")
    grouped = (
        frame.groupby(["location_id", "sensors_id", "location", "lat", "lon", "parameter", "hour"], as_index=False)
        .agg(value=("value_ug", "mean"), n=("value_ug", "count"), unit_factor=("unit_factor", "median"))
    )
    return grouped


def choose_sensors(hourly: pd.DataFrame) -> pd.DataFrame:
    counts = (
        hourly.dropna(subset=["value"])
        .groupby(["location_id", "parameter", "sensors_id"])["hour"]
        .nunique()
        .reset_index(name="hours")
    )
    counts = counts.sort_values(["location_id", "parameter", "hours"], ascending=[True, True, False])
    chosen = counts.drop_duplicates(["location_id", "parameter"])
    chosen.to_csv(INTERIM / "sensor_choice.csv", index=False)
    merged = hourly.merge(
        chosen[["location_id", "parameter", "sensors_id"]],
        on=["location_id", "parameter", "sensors_id"],
        how="inner",
    )
    return merged


def build_station_hours(chosen: pd.DataFrame, meta: pd.DataFrame) -> pd.DataFrame:
    wide = chosen.pivot_table(
        index=["location_id", "hour"],
        columns="parameter",
        values="value",
        aggfunc="mean",
    ).reset_index()
    wide.columns.name = None
    for column in PARAMS:
        if column not in wide.columns:
            wide[column] = np.nan
    names = (
        chosen.sort_values("hour")
        .groupby("location_id")
        .agg(name=("location", "last"), lat=("lat", "median"), lon=("lon", "median"))
        .reset_index()
    )
    meta = meta.drop(columns=[c for c in ("name", "lat", "lon") if c in meta.columns]).merge(names, on="location_id")
    inside = meta["lat"].between(BBOX[1], BBOX[3]) & meta["lon"].between(BBOX[0], BBOX[2])
    meta = meta.loc[inside].copy()
    wide = wide[wide["location_id"].isin(meta["location_id"])]
    start = pd.Timestamp(START, tz=TZ)
    end = pd.Timestamp(datetime.combine(END, datetime.max.time()).replace(microsecond=0, minute=0, second=0), tz=TZ)
    end = pd.Timestamp(f"{END.isoformat()} 23:00", tz=TZ)
    index = pd.date_range(start, end, freq="h")
    pieces = []
    for loc_id, part in wide.groupby("location_id"):
        part = part.set_index("hour").reindex(index)
        part.index.name = "hour"
        part["location_id"] = loc_id
        pieces.append(part.reset_index())
    hours = pd.concat(pieces, ignore_index=True) if pieces else wide
    return hours, meta


def add_calendar_and_lags(hours: pd.DataFrame) -> pd.DataFrame:
    hours = hours.sort_values(["location_id", "hour"]).copy()
    local = hours["hour"].dt.tz_convert(TZ)
    hours["hour_of_day"] = local.dt.hour
    hours["day_of_week"] = local.dt.dayofweek
    hours["month"] = local.dt.month
    hours["is_dry_season"] = hours["month"].isin([11, 12, 1, 2, 3, 4]).astype(int)
    hours["hour_sin"] = np.sin(2 * np.pi * hours["hour_of_day"] / 24)
    hours["hour_cos"] = np.cos(2 * np.pi * hours["hour_of_day"] / 24)
    hours["dow_sin"] = np.sin(2 * np.pi * hours["day_of_week"] / 7)
    hours["dow_cos"] = np.cos(2 * np.pi * hours["day_of_week"] / 7)
    grouped = hours.groupby("location_id", group_keys=False)
    hours["pm25_next"] = grouped["pm25"].shift(-1)
    hours["pm25_lag1"] = grouped["pm25"].shift(1)
    hours["pm25_lag24"] = grouped["pm25"].shift(24)
    hours["pm25_lag168"] = grouped["pm25"].shift(168)
    for window, name in ((3, "pm25_roll_3h"), (24, "pm25_roll_24h"), (168, "pm25_roll_168h")):
        rolled = grouped["pm25"].rolling(window, min_periods=window).mean().reset_index(level=0, drop=True)
        counted = grouped["pm25"].rolling(window, min_periods=window).count().reset_index(level=0, drop=True)
        hours[name] = rolled.where(counted == window)
    std = grouped["pm25"].rolling(24, min_periods=24).std().reset_index(level=0, drop=True)
    counted = grouped["pm25"].rolling(24, min_periods=24).count().reset_index(level=0, drop=True)
    hours["pm25_roll_24h_std"] = std.where(counted == 24)
    return hours


def fetch_weather(stations: pd.DataFrame) -> pd.DataFrame:
    params = {
        "latitude": ",".join(f"{v:.5f}" for v in stations["lat"]),
        "longitude": ",".join(f"{v:.5f}" for v in stations["lon"]),
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "hourly": ",".join(WEATHER_FIELDS),
        "timezone": TZ,
    }
    RAW_METEO.mkdir(parents=True, exist_ok=True)
    payload = request_json("https://archive-api.open-meteo.com/v1/archive", params=params)
    (RAW_METEO / "weather.json").write_text(json.dumps(payload), encoding="utf-8")
    blocks = payload if isinstance(payload, list) else [payload]
    frames = []
    for station, block in zip(stations.itertuples(index=False), blocks):
        hourly = block["hourly"]
        frame = pd.DataFrame(hourly)
        frame["hour"] = pd.to_datetime(frame["time"]).dt.tz_localize(TZ)
        frame["location_id"] = int(station.location_id)
        frame = frame.drop(columns=["time"])
        frames.append(frame)
    weather = pd.concat(frames, ignore_index=True)
    rad = np.deg2rad(weather["wind_direction_10m"])
    weather["wind_u"] = -weather["wind_speed_10m"] * np.sin(rad)
    weather["wind_v"] = -weather["wind_speed_10m"] * np.cos(rad)
    return weather.drop(columns=["wind_direction_10m"])


def fetch_cams() -> pd.DataFrame:
    params = {
        "latitude": CENTER[0],
        "longitude": CENTER[1],
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "hourly": ",".join(CAMS_FIELDS),
        "domains": "cams_global",
        "timezone": TZ,
    }
    payload = request_json("https://air-quality-api.open-meteo.com/v1/air-quality", params=params)
    (RAW_METEO / "cams.json").write_text(json.dumps(payload), encoding="utf-8")
    hourly = payload["hourly"]
    frame = pd.DataFrame(hourly).rename(columns=CAMS_FIELDS)
    frame["hour"] = pd.to_datetime(frame["time"]).dt.tz_localize(TZ)
    return frame.drop(columns=["time"])


def gap_table(hours: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for loc_id, part in hours.groupby("location_id"):
        missing = part.sort_values("hour")["pm25"].isna().to_numpy()
        runs = []
        length = 0
        for flag in missing:
            if flag:
                length += 1
            elif length:
                runs.append(length)
                length = 0
        if length:
            runs.append(length)
        present = int((~part["pm25"].isna()).sum())
        rows.append(
            {
                "location_id": loc_id,
                "pm25_hours": present,
                "expected_hours": int(len(part)),
                "pm25_coverage": present / len(part) if len(part) else 0,
                "n_gaps": len(runs),
                "max_gap_hours": max(runs) if runs else 0,
            }
        )
    return pd.DataFrame(rows)


def field_source(name: str) -> str:
    if name.startswith("cams_"):
        return "cams_global"
    if name in WEATHER_FIELDS or name in {"wind_u", "wind_v"}:
        return "era5"
    if name in PARAMS or name.startswith("pm25"):
        return "openaq"
    return "calendar"


def decide_fields(hours: pd.DataFrame, train_ids: set[int]) -> pd.DataFrame:
    subset = hours[hours["location_id"].isin(train_ids)]
    if subset.empty:
        subset = hours
    rows = []
    accepted = list(V1_FIELDS)
    accepted_frame = subset[list(V1_FIELDS)].apply(pd.to_numeric, errors="coerce")
    candidates = []
    for name in list(V1_FIELDS) + list(BOOST_CANDIDATES):
        if name not in subset.columns:
            series = pd.Series(np.nan, index=subset.index)
        else:
            series = pd.to_numeric(subset[name], errors="coerce")
        coverage = float(series.notna().mean()) if len(series) else 0.0
        n_stations = int(subset.loc[series.notna(), "location_id"].nunique()) if series.notna().any() else 0
        candidates.append((name, coverage, n_stations, series))
    decided = {}
    for name, coverage, n_stations, series in candidates:
        if name in V1_FIELDS:
            decision = "mo hinh v1"
        elif coverage < 0.70:
            decision = "bo: do phu duoi 70%"
        else:
            corr = accepted_frame.corrwith(series).abs()
            too_close = corr[corr >= 0.95]
            if not too_close.empty:
                partner = too_close.index[0]
                decision = f"bo: tuong quan {too_close.iloc[0]:.2f} voi {partner}"
            else:
                decision = "them vao boosting"
                accepted.append(name)
                accepted_frame[name] = series
        decided[name] = decision
        rows.append(
            {
                "field": name,
                "source": field_source(name),
                "n_stations_with_values": n_stations,
                "hour_coverage": round(coverage, 4),
                "decision": decided[name],
            }
        )
    return pd.DataFrame(rows)


def save_plots(hours: pd.DataFrame, stations: pd.DataFrame, gaps: pd.DataFrame, coverage: pd.DataFrame) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    plt.rcParams["font.family"] = "DejaVu Sans"
    merged = stations if "max_gap_hours" in stations.columns else stations.merge(gaps, on="location_id")
    fig, ax = plt.subplots(figsize=(8, 7))
    points = ax.scatter(
        merged["lon"],
        merged["lat"],
        c=merged["pm25_coverage"],
        cmap="viridis",
        s=40 + 80 * merged["pm25_coverage"],
        edgecolor="black",
        linewidth=0.4,
    )
    for row in merged.itertuples(index=False):
        ax.annotate(str(row.location_id), (row.lon, row.lat), fontsize=6, xytext=(3, 3), textcoords="offset points")
    fig.colorbar(points, ax=ax, label="PM2.5 hour coverage")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.set_title("Hanoi stations, 2025-10-25 to 2026-10-24")
    fig.tight_layout()
    fig.savefig(REPORTS / "station_map.png", dpi=120)
    plt.close(fig)

    month = hours.copy()
    month["year_month"] = month["hour"].dt.tz_convert(TZ).dt.strftime("%Y-%m")
    table = (
        month.groupby(["location_id", "year_month"])["pm25"]
        .apply(lambda s: float(s.notna().mean()))
        .unstack("year_month")
    )
    fig, ax = plt.subplots(figsize=(12, max(4, 0.35 * len(table))))
    image = ax.imshow(table.to_numpy(), aspect="auto", vmin=0, vmax=1, cmap="viridis")
    ax.set_xticks(range(len(table.columns)), table.columns, rotation=90, fontsize=7)
    ax.set_yticks(range(len(table.index)), [str(v) for v in table.index], fontsize=7)
    ax.set_title("PM2.5 coverage by station and month")
    fig.colorbar(image, ax=ax, fraction=0.03)
    fig.tight_layout()
    fig.savefig(REPORTS / "coverage_month.png", dpi=120)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, max(4, 0.35 * len(gaps))))
    order = gaps.sort_values("max_gap_hours")
    ax.barh(order["location_id"].astype(str), order["max_gap_hours"], color="#c45c26")
    ax.set_xlabel("Longest PM2.5 gap (hours)")
    ax.set_title("Longest missing run after asfreq('h')")
    fig.tight_layout()
    fig.savefig(REPORTS / "gap_lengths.png", dpi=120)
    plt.close(fig)

    numeric = [name for name in list(V1_FIELDS) + list(BOOST_CANDIDATES) if name in hours.columns]
    fig, axes = plt.subplots(6, 5, figsize=(14, 12))
    for ax, name in zip(axes.ravel(), numeric):
        series = pd.to_numeric(hours[name], errors="coerce").dropna()
        ax.hist(series, bins=30, color="#2f6f8f")
        ax.set_title(name, fontsize=8)
        ax.tick_params(labelsize=6)
    for ax in axes.ravel()[len(numeric) :]:
        ax.axis("off")
    fig.suptitle("Field distributions")
    fig.tight_layout()
    fig.savefig(REPORTS / "histograms.png", dpi=120)
    plt.close(fig)

    fig, axes = plt.subplots(4, 4, figsize=(12, 10))
    box_fields = [name for name in ["pm25", "pm10", "no2", "o3", "temperature_2m", "relative_humidity_2m", "wind_speed_10m", "precipitation", "boundary_layer_height", "cams_pm25", "cams_no2", "cams_dust"] if name in hours.columns]
    for ax, name in zip(axes.ravel(), box_fields):
        part = hours[["hour_of_day", name]].dropna()
        groups = [part.loc[part["hour_of_day"] == hour, name].to_numpy() for hour in range(24)]
        ax.boxplot(groups, showfliers=False, widths=0.6)
        ax.set_title(name, fontsize=8)
        ax.set_xticks([1, 7, 13, 19])
        ax.tick_params(labelsize=6)
    for ax in axes.ravel()[len(box_fields) :]:
        ax.axis("off")
    fig.suptitle("Value by hour of day")
    fig.tight_layout()
    fig.savefig(REPORTS / "hour_boxplots.png", dpi=120)
    plt.close(fig)

    miss = []
    for name in numeric:
        rate = 1 - hours.groupby("location_id")[name].apply(lambda s: float(pd.to_numeric(s, errors="coerce").notna().mean()))
        miss.append(rate.rename(name))
    missingness = pd.concat(miss, axis=1) if miss else pd.DataFrame()
    if not missingness.empty:
        fig, ax = plt.subplots(figsize=(12, max(4, 0.35 * len(missingness))))
        image = ax.imshow(missingness.to_numpy(), aspect="auto", vmin=0, vmax=1, cmap="magma")
        ax.set_xticks(range(len(missingness.columns)), missingness.columns, rotation=90, fontsize=7)
        ax.set_yticks(range(len(missingness.index)), [str(v) for v in missingness.index], fontsize=7)
        ax.set_title("Missing fraction by station")
        fig.colorbar(image, ax=ax, fraction=0.03)
        fig.tight_layout()
        fig.savefig(REPORTS / "missingness.png", dpi=120)
        plt.close(fig)

    train = hours[hours["in_train"] & hours["pm25"].notna()]
    corr_cols = [name for name in ["pm25", *V1_FIELDS, *BOOST_CANDIDATES] if name in train.columns]
    corr = train[corr_cols].apply(pd.to_numeric, errors="coerce").corr()
    fig, ax = plt.subplots(figsize=(11, 9))
    image = ax.imshow(corr.to_numpy(), vmin=-1, vmax=1, cmap="coolwarm")
    ax.set_xticks(range(len(corr.columns)), corr.columns, rotation=90, fontsize=7)
    ax.set_yticks(range(len(corr.index)), corr.index, fontsize=7)
    ax.set_title("Correlation on hours with station PM2.5, training stations")
    fig.colorbar(image, ax=ax, fraction=0.03)
    fig.tight_layout()
    fig.savefig(REPORTS / "correlation.png", dpi=120)
    plt.close(fig)

    both = hours.dropna(subset=["pm25", "cams_pm25"])
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.scatter(both["cams_pm25"], both["pm25"], s=4, alpha=0.25, color="#1f4e79")
    limit = float(np.nanpercentile(pd.concat([both["pm25"], both["cams_pm25"]]), 99))
    ax.plot([0, limit], [0, limit], color="black", linewidth=1)
    ax.set_xlim(0, limit)
    ax.set_ylim(0, limit)
    ax.set_xlabel("CAMS PM2.5 at the same hour (ug/m3)")
    ax.set_ylabel("Station PM2.5 (ug/m3)")
    ax.set_title("Station measurement versus CAMS")
    fig.tight_layout()
    fig.savefig(REPORTS / "pm25_vs_cams.png", dpi=120)
    plt.close(fig)
    coverage.to_csv(REPORTS / "coverage.csv", index=False)


def main() -> None:
    for path in (RAW_OA, RAW_METEO, INTERIM, REPORTS):
        path.mkdir(parents=True, exist_ok=True)
    api_key = load_env_key()
    if api_key:
        print("discover via OpenAQ API", flush=True)
        stations = pd.DataFrame(discover_from_api(api_key))
    else:
        print("OPENAQ_API_KEY empty; discover via Explorer tiles", flush=True)
        stations = pd.DataFrame(discover_from_tiles())
    (RAW_OA / "locations.json").write_text(
        stations.to_json(orient="records", force_ascii=False), encoding="utf-8"
    )
    print(f"candidate locations {len(stations)}", flush=True)

    cache_path = RAW_OA / "window_keys.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    cache_lock = threading.Lock()

    def screen(row):
        loc_id = str(row.location_id)
        with cache_lock:
            cached = cache.get(loc_id)
        if cached is not None:
            keys = cached
        else:
            keys = keys_in_window(int(row.location_id))
            with cache_lock:
                cache[loc_id] = keys
                cache_path.write_text(json.dumps(cache), encoding="utf-8")
        if not keys:
            print(f"skip {row.location_id} no files", flush=True)
            return None
        first = download_key(keys[0])
        sample = hourly_from_file(first)
        if sample.empty:
            print(f"skip {row.location_id} empty", flush=True)
            return None
        lat = float(sample["lat"].median())
        lon = float(sample["lon"].median())
        if not (BBOX[1] <= lat <= BBOX[3] and BBOX[0] <= lon <= BBOX[2]):
            print(f"skip {row.location_id} outside bbox", flush=True)
            return None
        meta = row._asdict()
        meta["name"] = str(sample["location"].iloc[-1])
        meta["lat"] = lat
        meta["lon"] = lon
        meta["n_files"] = len(keys)
        print(f"keep {row.location_id} {meta['name']} files={len(keys)}", flush=True)
        return meta, keys[1:]

    kept_meta = []
    file_jobs = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(screen, row) for row in stations.itertuples(index=False)]
        for fut in as_completed(futures):
            result = fut.result()
            if result is None:
                continue
            meta, rest = result
            kept_meta.append(meta)
            file_jobs.extend(rest)
    print(f"download remaining files {len(file_jobs)}", flush=True)
    paths = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(download_key, key) for key in file_jobs]
        for i, fut in enumerate(as_completed(futures), start=1):
            paths.append(fut.result())
            if i % 250 == 0:
                print(f"downloaded {i}/{len(file_jobs)}", flush=True)
    # Include the first file of each kept station, already on disk.
    all_paths = list(RAW_OA.rglob("*.csv.gz"))
    kept_ids = {int(row["location_id"]) for row in kept_meta}
    frames = []
    for path in all_paths:
        match = re.search(r"locationid=(\d+)", path.as_posix())
        if not match or int(match.group(1)) not in kept_ids:
            continue
        day = day_from_key(path.name)
        if day is None or not (START <= day <= END):
            continue
        part = hourly_from_file(path)
        if not part.empty:
            frames.append(part)
    print(f"parsed files {len(frames)}", flush=True)
    hourly = pd.concat(frames, ignore_index=True)
    chosen = choose_sensors(hourly)
    hours, meta = build_station_hours(chosen, pd.DataFrame(kept_meta))
    print(f"stations inside bbox with data {meta['location_id'].nunique()}", flush=True)
    weather = fetch_weather(meta.sort_values("location_id"))
    cams = fetch_cams()
    hours = hours.merge(weather, on=["location_id", "hour"], how="left")
    hours = hours.merge(cams, on="hour", how="left")
    hours = add_calendar_and_lags(hours)
    gaps = gap_table(hours)
    meta = meta.merge(gaps, on="location_id")
    meta["in_train"] = meta["pm25_coverage"] >= 0.60
    hours = hours.merge(meta[["location_id", "in_train"]], on="location_id", how="left")
    hours["source_pm"] = "openaq"
    hours["source_weather"] = "era5"
    hours["source_cams"] = "cams_global"
    hours["model_v1_ok"] = hours[["pm25_next", *V1_FIELDS]].notna().all(axis=1) & hours["in_train"]
    meta.to_csv(INTERIM / "stations.csv", index=False)
    hours.to_parquet(INTERIM / "hourly_hanoi.parquet", index=False)
    coverage = decide_fields(hours, set(meta.loc[meta["in_train"], "location_id"]))
    save_plots(hours, meta, gaps, coverage)
    summary = {
        "stations": int(len(meta)),
        "train_stations": int(meta["in_train"].sum()),
        "rows": int(len(hours)),
        "model_v1_rows": int(hours["model_v1_ok"].sum()),
        "discovery": meta["discovery"].iloc[0] if len(meta) else None,
    }
    (REPORTS / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("DONE", json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
