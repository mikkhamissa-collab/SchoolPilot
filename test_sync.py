#!/usr/bin/env python3
"""Standalone test: load LMS cookies from Supabase, hit Teamie API, print grades."""

import json
import os
import sys

import httpx
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from supabase import create_client

# Load env from backend/.env
load_dotenv("backend/.env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ENCRYPTION_KEY = os.environ["CREDENTIAL_ENCRYPTION_KEY"]
TEAMIE_UID = "570"
BASE_URL = "https://lms.asl.org"


def decrypt(encrypted: str) -> str:
    f = Fernet(ENCRYPTION_KEY.encode("utf-8"))
    return f.decrypt(encrypted.encode("utf-8")).decode("utf-8")


def main():
    # 1. Connect to Supabase and load credentials
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    resp = db.table("lms_credentials").select("*").eq("teamie_uid", TEAMIE_UID).execute()

    if not resp.data:
        print("No LMS credentials found for uid=570")
        sys.exit(1)

    cred = resp.data[0]
    print(f"Found credentials for user_id={cred['user_id']}")
    print(f"  LMS URL: {cred.get('lms_url', 'N/A')}")
    print(f"  Last sync: {cred.get('last_sync_at', 'never')}")
    print()

    # 2. Decrypt cookies (prefer new extension column, fall back to legacy)
    cookie_cipher = cred.get("encrypted_session_cookies") or cred.get("encrypted_cookies")
    if not cookie_cipher:
        print("No cookies stored — need to re-authenticate")
        sys.exit(1)

    cookies_json = decrypt(cookie_cipher)
    cookie_list = json.loads(cookies_json)
    print(f"Decrypted {len(cookie_list)} cookies")

    # 3. Build httpx client with cookies
    jar = httpx.Cookies()
    for c in cookie_list:
        jar.set(c.get("name", ""), c.get("value", ""), domain=c.get("domain", ""), path=c.get("path", "/"))

    client = httpx.Client(cookies=jar, timeout=30.0, follow_redirects=False, headers={"Accept": "application/json"})

    # 4. Check cookie validity with fresh-posts
    print("Checking cookie validity via /api/fresh-posts.json...")
    try:
        r = client.get(f"{BASE_URL}/api/fresh-posts.json")
        if r.status_code in (301, 302, 303, 307, 308):
            print(f"COOKIES EXPIRED — need to re-authenticate (redirect {r.status_code})")
            sys.exit(1)
        if r.status_code != 200:
            print(f"COOKIES EXPIRED — need to re-authenticate (status {r.status_code})")
            sys.exit(1)
        content_type = r.headers.get("content-type", "")
        if "html" in content_type:
            print("COOKIES EXPIRED — need to re-authenticate (got HTML login page)")
            sys.exit(1)
        fresh = r.json()
        print(f"Cookies VALID! Fresh posts across {len(fresh)} classrooms\n")
    except Exception as e:
        print(f"COOKIES EXPIRED — need to re-authenticate ({e})")
        sys.exit(1)

    # 5. Fetch classrooms
    print("Fetching classrooms via /api/classroom.json...")
    r = client.get(f"{BASE_URL}/api/classroom.json")
    r.raise_for_status()
    classrooms = r.json()
    if isinstance(classrooms, dict) and "classrooms" in classrooms:
        classrooms = classrooms["classrooms"]
    print(f"Found {len(classrooms)} classrooms\n")

    # 6. For each classroom, fetch gradebook
    print("=" * 70)
    for cr in classrooms:
        nid = cr.get("nid")
        name = cr.get("name", "Unknown")

        try:
            r = client.get(f"{BASE_URL}/api/classroom/{nid}/gradebook_summary.json", params={"uid": TEAMIE_UID})
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"{name}")
            print(f"  ERROR fetching gradebook: {e}\n")
            continue

        scores = data.get("scores") or []
        published = [s for s in scores if s.get("is_published")]

        total_score = 0.0
        total_max = 0.0
        for s in published:
            sc = s.get("score")
            mx = s.get("max_score")
            if sc is not None and mx and mx > 0:
                total_score += float(sc)
                total_max += float(mx)

        pct = round(total_score / total_max * 100, 2) if total_max > 0 else None
        letter = ""
        if pct is not None:
            if pct >= 93: letter = "A"
            elif pct >= 90: letter = "A-"
            elif pct >= 87: letter = "B+"
            elif pct >= 83: letter = "B"
            elif pct >= 80: letter = "B-"
            elif pct >= 77: letter = "C+"
            elif pct >= 73: letter = "C"
            elif pct >= 70: letter = "C-"
            elif pct >= 67: letter = "D+"
            elif pct >= 60: letter = "D"
            else: letter = "F"

        print(f"{name}")
        print(f"  Grades: {len(published)} published (of {len(scores)} total)")
        if total_max > 0:
            print(f"  Score:  {total_score:.1f} / {total_max:.1f}  ({pct}% = {letter})")
        else:
            print(f"  Score:  No scored items")
        print()

    print("=" * 70)
    print("Done!")
    client.close()


if __name__ == "__main__":
    main()
