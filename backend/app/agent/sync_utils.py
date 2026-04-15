# sync_utils.py — Shared utilities for LMS sync (HTTP and Playwright paths).
# ONE source of truth for course name normalization, crypto, stable IDs, and timestamps.

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


# ── Timestamp helper ─────────────────────────────────────────────────

def utcnow() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ── Course name normalization ────────────────────────────────────────
# SINGLE function used everywhere. Rules:
#   1. Strip year brackets like [25-26] or [2025-2026]
#   2. Strip semester tags like S1, S2 (with optional leading dash)
#   3. Preserve everything else (AP prefixes, period codes, teacher initials)
#   4. Case-SENSITIVE (do not lowercase — we want display-ready names)

def normalize_course_name(name: str) -> str:
    """Normalize a course name for deduplication and matching.

    Strips year brackets and semester tags but preserves AP/IB prefixes,
    period codes, and teacher initials so the name remains display-ready.

    Examples:
        "AP Statistics P8 DK [25-26]"  → "AP Statistics P8 DK"
        "Global Issues S2 P1 TG [25-26]" → "Global Issues P1 TG"
        "Math - S2" → "Math"
        "Literature and Film S2 P2 HN [25-26]" → "Literature and Film P2 HN"
    """
    if not name:
        return name
    # Strip trailing [25-26], [2025-2026], etc.
    result = re.sub(r'\s*\[\d{2,4}-\d{2,4}\]\s*', '', name)
    # Strip " S1" or " S2" or " - S1" or " - S2" (semester tags, not at word boundary inside names)
    result = re.sub(r'\s*-?\s*\bS[12]\b', '', result)
    return result.strip()


# ── Stable ID for deduplication ──────────────────────────────────────

def stable_id(*parts: Optional[str]) -> str:
    """Create a deterministic 40-char hex ID from component strings.

    Used as ``lms_id`` so that re-syncing the same item doesn't create duplicates.
    """
    combined = "__".join(str(p or "") for p in parts)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()[:40]


# ── Fernet encryption helpers ────────────────────────────────────────

def get_fernet() -> Fernet:
    """Build a Fernet instance from the configured encryption key."""
    key = get_settings().credential_encryption_key
    if not key:
        raise RuntimeError("credential_encryption_key is not configured")
    return Fernet(key.encode("utf-8") if isinstance(key, str) else key)


def decrypt_credential(encrypted: str) -> str:
    """Decrypt a Fernet-encrypted credential string."""
    try:
        return get_fernet().decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Failed to decrypt credential — key may have changed")


def encrypt_credential(plain: str) -> str:
    """Encrypt a plaintext credential string with Fernet."""
    return get_fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


# ── Letter grade conversion ──────────────────────────────────────────

def pct_to_letter(pct: float) -> str:
    """Convert a percentage to a letter grade."""
    if pct >= 97: return "A+"
    if pct >= 93: return "A"
    if pct >= 90: return "A-"
    if pct >= 87: return "B+"
    if pct >= 83: return "B"
    if pct >= 80: return "B-"
    if pct >= 77: return "C+"
    if pct >= 73: return "C"
    if pct >= 70: return "C-"
    if pct >= 67: return "D+"
    if pct >= 60: return "D"
    return "F"
