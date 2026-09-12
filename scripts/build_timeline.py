#!/usr/bin/env python3
"""Scan data/media for photos and videos and build data/timeline.json.

For each file, GPS position and timestamp are read from its own metadata
(EXIF for photos, container metadata for videos via ffprobe). Videos rarely
carry GPS tags, so a position missing from a file's own metadata is filled
in by linear interpolation between the nearest timestamped neighbours that
do have one. A manual override always wins; see data/location-overrides.json.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from fractions import Fraction

from PIL import Image, ExifTags

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(ROOT, "data", "media")
OUTPUT_PATH = os.path.join(ROOT, "data", "timeline.json")
OVERRIDES_PATH = os.path.join(ROOT, "data", "location-overrides.json")

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}

EXIF_TAGS = {v: k for k, v in ExifTags.TAGS.items()}
GPS_TAGS = {v: k for k, v in ExifTags.GPSTAGS.items()}


def load_overrides():
    if not os.path.exists(OVERRIDES_PATH):
        return {}
    with open(OVERRIDES_PATH) as f:
        return json.load(f)


def dms_to_decimal(dms, ref):
    degrees, minutes, seconds = [float(Fraction(v)) for v in dms]
    value = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        value = -value
    return value


def read_photo_metadata(path):
    """Returns (lat, lon, iso_timestamp) with any of the three possibly None."""
    lat = lon = timestamp = None
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            if not exif:
                return lat, lon, timestamp

            date_str = exif.get(EXIF_TAGS.get("DateTimeOriginal"))
            if not date_str:
                date_str = exif.get(EXIF_TAGS.get("DateTime"))
            if date_str:
                try:
                    dt = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
                    timestamp = dt.isoformat()
                except ValueError:
                    pass

            gps_info = exif.get_ifd(EXIF_TAGS.get("GPSInfo"))
            if gps_info:
                gps = {GPS_TAGS.get(k, k): v for k, v in gps_info.items()}
                if "GPSLatitude" in gps and "GPSLongitude" in gps:
                    lat = dms_to_decimal(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"))
                    lon = dms_to_decimal(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"))
    except Exception as exc:
        print(f"  waarschuwing: kon foto-metadata niet lezen ({exc})", file=sys.stderr)
    return lat, lon, timestamp


def parse_iso6709(value):
    """Parses a QuickTime ISO 6709 location string like '+52.1326-004.2913/'."""
    import re

    match = re.match(r"^([+-]\d+\.?\d*)([+-]\d+\.?\d*)", value)
    if not match:
        return None, None
    return float(match.group(1)), float(match.group(2))


def read_video_metadata(path):
    lat = lon = timestamp = None
    duration_ms = None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        info = json.loads(result.stdout)
        fmt = info.get("format", {})
        duration = fmt.get("duration")
        if duration:
            duration_ms = int(float(duration) * 1000)

        tags = fmt.get("tags", {})
        creation_time = tags.get("creation_time")
        if creation_time:
            try:
                dt = datetime.fromisoformat(creation_time.replace("Z", "+00:00"))
                timestamp = dt.isoformat()
            except ValueError:
                pass

        location = tags.get("location") or tags.get("com.apple.quicktime.location.ISO6709")
        if location:
            lat, lon = parse_iso6709(location)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"  waarschuwing: ffprobe kon video niet lezen ({exc})", file=sys.stderr)
    return lat, lon, timestamp, duration_ms


def collect_files():
    files = []
    for dirpath, _, filenames in os.walk(MEDIA_DIR):
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in PHOTO_EXTS or ext in VIDEO_EXTS:
                files.append(os.path.join(dirpath, name))
    return files


def interpolate_missing_positions(items):
    known = [i for i, item in enumerate(items) if item["lat"] is not None]
    if not known:
        return
    for i, item in enumerate(items):
        if item["lat"] is not None:
            continue
        before = max((k for k in known if k < i), default=None)
        after = min((k for k in known if k > i), default=None)
        if before is not None and after is not None:
            t0 = datetime.fromisoformat(items[before]["timestamp"])
            t1 = datetime.fromisoformat(items[after]["timestamp"])
            t = datetime.fromisoformat(item["timestamp"])
            span = (t1 - t0).total_seconds()
            frac = 0.0 if span == 0 else (t - t0).total_seconds() / span
            item["lat"] = items[before]["lat"] + frac * (items[after]["lat"] - items[before]["lat"])
            item["lon"] = items[before]["lon"] + frac * (items[after]["lon"] - items[before]["lon"])
            item["position_source"] = "interpolated"
        elif before is not None:
            item["lat"] = items[before]["lat"]
            item["lon"] = items[before]["lon"]
            item["position_source"] = "interpolated"
        elif after is not None:
            item["lat"] = items[after]["lat"]
            item["lon"] = items[after]["lon"]
            item["position_source"] = "interpolated"


def build():
    overrides = load_overrides()
    items = []
    skipped = []

    for path in collect_files():
        rel_path = os.path.relpath(path, os.path.join(ROOT, "data")).replace(os.sep, "/")
        name = os.path.basename(path)
        ext = os.path.splitext(name)[1].lower()
        is_video = ext in VIDEO_EXTS
        duration_ms = None
        position_source = None

        if is_video:
            lat, lon, timestamp, duration_ms = read_video_metadata(path)
        else:
            lat, lon, timestamp = read_photo_metadata(path)

        if lat is not None:
            position_source = "metadata"

        override = overrides.get(name) or overrides.get(rel_path)
        if override:
            lat = override.get("lat", lat)
            lon = override.get("lon", lon)
            timestamp = override.get("timestamp", timestamp)
            position_source = "manual"

        if not timestamp:
            mtime = os.path.getmtime(path)
            timestamp = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
            print(f"  waarschuwing: geen tijdstip in {rel_path}, gebruik bestandsdatum")

        items.append(
            {
                "file": rel_path,
                "type": "video" if is_video else "photo",
                "lat": lat,
                "lon": lon,
                "timestamp": timestamp,
                "duration_ms": duration_ms,
                "position_source": position_source,
            }
        )

    items.sort(key=lambda x: x["timestamp"])
    interpolate_missing_positions(items)

    final_items = []
    for item in items:
        if item["lat"] is None or item["lon"] is None:
            skipped.append(item["file"])
            continue
        final_items.append(item)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(final_items, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Tijdlijn geschreven: {len(final_items)} item(s) naar {OUTPUT_PATH}")
    if skipped:
        print(f"Overgeslagen (geen locatie te bepalen): {', '.join(skipped)}")


if __name__ == "__main__":
    build()
