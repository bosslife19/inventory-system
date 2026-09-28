"""
Builds backend/database/seeders/data/nigeria_states_lgas.json from the
public temikeezy/nigeria-geojson-data dataset (MIT), applying name fixes.

Usage:
    python scripts/build_nigeria_lgas.py path/to/full.json

Source: https://github.com/temikeezy/nigeria-geojson-data
        data/full.json @ 3cd13e6088bf72b0873d7d6fa7cf4cf0294ad9a6

The source has correct per-state LGA counts (774 total) but many names are
truncated, misspelled or outdated. Every correction below must match a name
in the source exactly, or the script fails — so a changed upstream file
can't silently skip a fix.
"""

import json
import sys
from pathlib import Path

STATE_RENAMES = {
    "Nassarawa": "Nasarawa",
}

ZONES = {
    "north_central": ["Benue", "Kogi", "Kwara", "Nasarawa", "Niger", "Plateau", "Federal Capital Territory"],
    "north_east": ["Adamawa", "Bauchi", "Borno", "Gombe", "Taraba", "Yobe"],
    "north_west": ["Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara"],
    "south_east": ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
    "south_south": ["Akwa Ibom", "Bayelsa", "Cross River", "Delta", "Edo", "Rivers"],
    "south_west": ["Ekiti", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"],
}

# Keyed by the corrected state name.
LGA_FIXES = {
    "Abia": {"Oboma Ngwa": "Obi Ngwa"},
    "Adamawa": {"Girie": "Girei", "Teungo": "Toungo"},
    "Akwa Ibom": {"Urue Offong|Oruko": "Urue-Offong/Oruko"},
    "Bauchi": {"Gamjuwa": "Ganjuwa"},
    "Bayelsa": {"Kolokuma-Opokuma": "Kolokuma/Opokuma"},
    "Benue": {"Katsina- Ala": "Katsina-Ala"},
    "Delta": {
        "AniochaN": "Aniocha North", "AniochaS": "Aniocha South",
        "EthiopeE": "Ethiope East", "IkaNorth": "Ika North East", "IkaSouth": "Ika South",
        "IsokoNor": "Isoko North", "IsokoSou": "Isoko South",
    },
    "Ebonyi": {"Abakalik": "Abakaliki"},
    "Edo": {"Esan Centtral": "Esan Central", "Orhionmw": "Orhionmwon"},
    "Enugu": {
        "EnuguSou": "Enugu South", "Igbo-Eti": "Igbo Etiti",
        "Igbo-eze North": "Igbo-Eze North", "Igbo-eze South": "Igbo-Eze South",
        "Oji-River": "Oji River",
    },
    "Federal Capital Territory": {"Municipal": "Abuja Municipal"},
    "Gombe": {"Shomgom": "Shongom", "Yalmatu / Deba": "Yamaltu/Deba"},
    "Imo": {"Ihitte-Uboma Isinweke": "Ihitte/Uboma", "Unuimo": "Onuimo"},
    "Jigawa": {"Kirika Samma": "Kiri Kasama", "Malam Mado": "Malam Madori"},
    "Kano": {"Garum Mallam": "Garun Mallam", "Tundun Wada": "Tudun Wada"},
    "Katsina": {"Dutsin-M": "Dutsin-Ma", "Katsina (K)": "Katsina"},
    "Kebbi": {"Koko/Bes": "Koko/Besse"},
    "Lagos": {
        "Badagary": "Badagry", "Ibeju/Lekki": "Ibeju-Lekki", "Ifako/Ijaye": "Ifako-Ijaiye",
        "Ajeromi/Ifelodun": "Ajeromi-Ifelodun", "Oshodi/Isolo": "Oshodi-Isolo",
        "Amuwo Odofin": "Amuwo-Odofin",
    },
    "Nasarawa": {"Nassarawa Egon": "Nasarawa Egon"},
    "Niger": {"Kontogur": "Kontagora"},
    "Ogun": {
        "Egbado North": "Yewa North", "Egbado South": "Yewa South",
        "Ado Odo-Ota": "Ado-Odo/Ota", "Shagamu": "Sagamu",
    },
    "Ondo": {"AkokoNorthWest": "Akoko North-West", "IleOluji/Okeigbo": "Ile Oluji/Okeigbo"},
    "Osun": {"IfeCentral": "Ife Central", "Ilesha East": "Ilesa East", "Ilesha West": "Ilesa West"},
    "Oyo": {"Ogbomosho North": "Ogbomoso North", "Ogbomosho South": "Ogbomoso South"},
    "Plateau": {"Qua'anpa": "Qua'an Pan"},
    "Rivers": {"Akukutor": "Akuku-Toru", "Omumma": "Omuma"},
    "Sokoto": {"Gwadabaw": "Gwadabawa", "Tangazar": "Tangaza"},
    "Yobe": {"Borsari": "Bursari"},
}

# Official LGA counts per state (774 total) — sanity check on the output.
EXPECTED_COUNTS = {
    "Abia": 17, "Adamawa": 21, "Akwa Ibom": 31, "Anambra": 21, "Bauchi": 20, "Bayelsa": 8,
    "Benue": 23, "Borno": 27, "Cross River": 18, "Delta": 25, "Ebonyi": 13, "Edo": 18,
    "Ekiti": 16, "Enugu": 17, "Federal Capital Territory": 6, "Gombe": 11, "Imo": 27,
    "Jigawa": 27, "Kaduna": 23, "Kano": 44, "Katsina": 34, "Kebbi": 21, "Kogi": 21,
    "Kwara": 16, "Lagos": 20, "Nasarawa": 13, "Niger": 25, "Ogun": 20, "Ondo": 18,
    "Osun": 30, "Oyo": 33, "Plateau": 17, "Rivers": 23, "Sokoto": 23, "Taraba": 16,
    "Yobe": 17, "Zamfara": 14,
}

OUT = Path(__file__).resolve().parent.parent / "backend/database/seeders/data/nigeria_states_lgas.json"


def main(src: str) -> None:
    raw = json.loads(Path(src).read_text(encoding="utf-8"))
    zone_of = {s: z for z, states in ZONES.items() for s in states}
    out = []

    for entry in raw:
        state = STATE_RENAMES.get(entry["state"], entry["state"])
        names = [l["name"].strip() for l in entry["lgas"]]
        fixes = LGA_FIXES.get(state, {})

        missing = set(fixes) - set(names)
        if missing:
            sys.exit(f"{state}: fixes reference names not in source: {sorted(missing)}")

        names = sorted(fixes.get(n, n) for n in names)
        if len(set(names)) != len(names):
            sys.exit(f"{state}: duplicate LGA names after fixes")
        if len(names) != EXPECTED_COUNTS[state]:
            sys.exit(f"{state}: {len(names)} LGAs, expected {EXPECTED_COUNTS[state]}")

        out.append({"state": state, "geopolitical_zone": zone_of[state], "lgas": names})

    out.sort(key=lambda s: s["state"])
    if len(out) != 37 or sum(len(s["lgas"]) for s in out) != 774:
        sys.exit("expected 37 states and 774 LGAs")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} (37 states, 774 LGAs)")


if __name__ == "__main__":
    main(sys.argv[1])
