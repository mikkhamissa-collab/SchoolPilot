"""Sync endpoints — accept scraped LMS data + attachments from the Chrome extension.

Two endpoints live here:

* ``POST /api/sync/ingest`` — bulk upload: courses, assignments, grades, optional
  attachments inline (base64). This is what the extension hits on every sync.
* ``POST /api/sync/attachment`` — single-file endpoint used when the extension
  uploads a large attachment it doesn't want to bundle into ``/ingest``.

Both endpoints require a valid Supabase JWT via ``Depends(get_current_user)``.

NOTE: courses currently have no dedicated table in the schema. They are counted
in the response summary but NOT persisted. TODO: add a ``lms_courses`` table in a
later session and wire up upsert logic here.
"""
from __future__ import annotations

import base64
import binascii
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.agent.sync_utils import normalize_course_name, utcnow
from app.auth import get_current_user
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────── Constants ───────────────────────────────

MAX_INGEST_BODY_BYTES = 25 * 1024 * 1024           # 25 MB — whole request
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024            # 10 MB per attachment
MAX_ASSIGNMENTS_PER_INGEST = 500
MAX_ATTACHMENTS_PER_INGEST = 50
STORAGE_BUCKET = "lms-attachments"


# ─────────────────────────────── Pydantic models ─────────────────────────

class IngestCourse(BaseModel):
    lms_id: str
    name: str
    code: Optional[str] = None
    term: Optional[str] = None
    instructor: Optional[str] = None
    url: Optional[str] = None


class IngestAssignment(BaseModel):
    lms_id: str
    course_name: str
    title: str
    description: Optional[str] = None
    assignment_type: Optional[str] = None
    due_date: Optional[datetime] = None
    points_possible: Optional[float] = None
    points_earned: Optional[float] = None
    grade_weight: Optional[str] = None
    is_graded: bool = False
    is_submitted: bool = False
    is_late: bool = False
    lms_url: Optional[str] = None


class IngestGrade(BaseModel):
    course_name: str
    overall_grade: Optional[str] = None
    overall_percentage: Optional[float] = None
    category_breakdown: dict = Field(default_factory=dict)


class IngestAttachment(BaseModel):
    assignment_lms_id: Optional[str] = None
    filename: str
    mime_type: str
    size_bytes: int
    content_base64: str
    source_url: Optional[str] = None


class IngestPayload(BaseModel):
    courses: list[IngestCourse] = Field(default_factory=list)
    assignments: list[IngestAssignment] = Field(default_factory=list)
    grades: list[IngestGrade] = Field(default_factory=list)
    announcements: list[dict] = Field(default_factory=list)
    calendar: list[dict] = Field(default_factory=list)
    attachments: list[IngestAttachment] = Field(default_factory=list)
    source: str = "extension"
    captured_at: Optional[datetime] = None


class IngestResponse(BaseModel):
    ok: bool
    counts: dict
    job_id: Optional[str] = None


class AttachmentResponse(BaseModel):
    ok: bool
    storage_path: str
    document_id: str


# ─────────────────────────────── Helpers ─────────────────────────────────

def _sanitize_filename(name: str) -> str:
    """Strip path separators and control chars; keep the filename human-readable."""
    safe = "".join(c for c in name if c.isalnum() or c in ("-", "_", ".", " "))
    safe = safe.strip().replace(" ", "_")
    return safe or "file"


def _decode_attachment(att: IngestAttachment) -> bytes:
    """Decode the base64 payload, enforcing the per-attachment size cap.

    Raises 413 if the decoded blob exceeds :data:`MAX_ATTACHMENT_BYTES`, 400 if
    the base64 is malformed.
    """
    if att.size_bytes > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Attachment '{att.filename}' exceeds 10 MB limit",
        )
    try:
        blob = base64.b64decode(att.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 for '{att.filename}': {exc}")
    if len(blob) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Attachment '{att.filename}' decoded to > 10 MB",
        )
    return blob


def _upload_attachment(user_id: str, att: IngestAttachment) -> tuple[str, str]:
    """Upload a single attachment to Supabase Storage + insert a document_uploads row.

    Returns ``(storage_path, document_id)``.
    """
    db = get_db()
    blob = _decode_attachment(att)

    safe_name = _sanitize_filename(att.filename)
    storage_path = f"{user_id}/{uuid.uuid4()}-{safe_name}"

    try:
        db.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=blob,
            file_options={"content-type": att.mime_type, "upsert": "false"},
        )
    except Exception as exc:
        # If the bucket is missing, surface a clear error — do NOT swallow it.
        msg = str(exc)
        if "not found" in msg.lower() or "bucket" in msg.lower():
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Supabase Storage bucket '{STORAGE_BUCKET}' missing or inaccessible. "
                    "Create it in the Supabase Dashboard (Storage → New bucket)."
                ),
            )
        logger.exception("Supabase storage upload failed for user %s", user_id)
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {msg}")

    doc_row = {
        "user_id": user_id,
        "filename": safe_name,
        "mime_type": att.mime_type,
        "file_size": len(blob),
        "storage_path": storage_path,
        "extraction_status": "pending",
    }
    result = db.table("document_uploads").insert(doc_row).execute()
    doc_id = (result.data[0].get("id") if result.data else None) or ""
    if not doc_id:
        # If the insert didn't return an ID, clean up the uploaded blob to avoid orphans.
        try:
            db.storage.from_(STORAGE_BUCKET).remove([storage_path])
        except Exception:
            logger.warning("Failed to clean up orphaned upload at %s", storage_path)
        raise HTTPException(status_code=500, detail="Failed to record document upload")
    return storage_path, str(doc_id)


# ─────────────────────────────── POST /ingest ────────────────────────────

@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    body: IngestPayload,
    request: Request,
    user_id: str = Depends(get_current_user),
) -> IngestResponse:
    """Bulk ingest endpoint — accepts scraped LMS data from the Chrome extension.

    The handler is transactional-ish: on failure it attempts to delete any rows
    it inserted earlier in the same call so the database doesn't end up half-full.
    """
    # ── 1. Size + count guardrails ─────────────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_INGEST_BODY_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Request body exceeds {MAX_INGEST_BODY_BYTES // (1024 * 1024)} MB limit",
                )
        except ValueError:
            pass

    if len(body.assignments) > MAX_ASSIGNMENTS_PER_INGEST:
        raise HTTPException(
            status_code=413,
            detail=f"Too many assignments ({len(body.assignments)} > {MAX_ASSIGNMENTS_PER_INGEST})",
        )
    if len(body.attachments) > MAX_ATTACHMENTS_PER_INGEST:
        raise HTTPException(
            status_code=413,
            detail=f"Too many attachments ({len(body.attachments)} > {MAX_ATTACHMENTS_PER_INGEST})",
        )

    db = get_db()
    now_iso = utcnow()

    # Track what we inserted so we can roll back on failure.
    inserted_assignments: list[str] = []          # lms_ids
    inserted_grade_courses: list[str] = []        # course_name upserts
    uploaded_storage_paths: list[str] = []        # storage object paths
    inserted_document_ids: list[str] = []         # document_uploads IDs

    # ── 2. Create the agent_jobs row up-front so we can attach extraction to it ──
    started_at = now_iso
    job_row = {
        "user_id": user_id,
        "job_type": "full_sync",
        "status": "running",
        "started_at": started_at,
    }
    job_insert = db.table("agent_jobs").insert(job_row).execute()
    job_id: Optional[str] = None
    if job_insert.data:
        job_id = str(job_insert.data[0].get("id") or "") or None

    try:
        # ── 3. Assignments ─────────────────────────────────────────────
        for a in body.assignments:
            course_norm = normalize_course_name(a.course_name or "") or a.course_name
            row = {
                "user_id": user_id,
                "lms_id": a.lms_id,
                "title": a.title or "Untitled",
                "description": a.description,
                "course_name": course_norm,
                "assignment_type": a.assignment_type,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "points_possible": a.points_possible,
                "points_earned": a.points_earned,
                "grade_weight": a.grade_weight,
                "is_graded": a.is_graded,
                "is_submitted": a.is_submitted,
                "is_late": a.is_late,
                "lms_url": a.lms_url,
                "extracted_at": now_iso,
                "job_id": None,
            }
            db.table("lms_assignments").upsert(row, on_conflict="user_id,lms_id").execute()
            inserted_assignments.append(a.lms_id)

        # ── 4. Grades (with previous_grade preservation) ───────────────
        for g in body.grades:
            course_norm = normalize_course_name(g.course_name or "") or g.course_name
            existing = (
                db.table("lms_grades")
                .select("overall_grade")
                .eq("user_id", user_id)
                .eq("course_name", course_norm)
                .limit(1)
                .execute()
            )
            prior_grade: Optional[str] = None
            if existing.data:
                prior_grade = existing.data[0].get("overall_grade")

            row: dict[str, Any] = {
                "user_id": user_id,
                "course_name": course_norm,
                "overall_grade": g.overall_grade,
                "overall_percentage": g.overall_percentage,
                "category_breakdown": g.category_breakdown or {},
                "extracted_at": now_iso,
                "job_id": None,
            }
            if prior_grade is not None and g.overall_grade is not None and prior_grade != g.overall_grade:
                row["previous_grade"] = prior_grade
                row["grade_changed_at"] = now_iso

            db.table("lms_grades").upsert(row, on_conflict="user_id,course_name").execute()
            inserted_grade_courses.append(course_norm)

        # ── 5. Attachments ─────────────────────────────────────────────
        for att in body.attachments:
            storage_path, doc_id = _upload_attachment(user_id, att)
            uploaded_storage_paths.append(storage_path)
            inserted_document_ids.append(doc_id)

        # ── 6. Finalize agent_jobs row with extraction counts + pass-through data ──
        counts = {
            "courses": len(body.courses),           # TODO: dedicated lms_courses table
            "assignments": len(body.assignments),
            "grades": len(body.grades),
            "attachments": len(body.attachments),
        }
        extracted = {
            "source": body.source,
            "counts": counts,
            "announcements": body.announcements,
            "calendar": body.calendar,
            "captured_at": body.captured_at.isoformat() if body.captured_at else None,
        }
        if job_id:
            db.table("agent_jobs").update({
                "status": "completed",
                "data_extracted": extracted,
                "completed_at": utcnow(),
                "pages_visited": 0,
            }).eq("id", job_id).execute()

        # ── 7. Bump last_sync_at on the user's teamie credential row ──
        try:
            db.table("lms_credentials").update({
                "last_sync_at": utcnow(),
            }).eq("user_id", user_id).eq("lms_type", "teamie").execute()
        except Exception:
            logger.warning("Failed to update lms_credentials.last_sync_at for user %s", user_id, exc_info=True)

        return IngestResponse(ok=True, counts=counts, job_id=job_id)

    except HTTPException:
        _rollback(
            db, user_id,
            assignments=inserted_assignments,
            grade_courses=inserted_grade_courses,
            storage_paths=uploaded_storage_paths,
            document_ids=inserted_document_ids,
            job_id=job_id,
        )
        raise
    except Exception as exc:
        logger.exception("Ingest failed for user %s", user_id)
        _rollback(
            db, user_id,
            assignments=inserted_assignments,
            grade_courses=inserted_grade_courses,
            storage_paths=uploaded_storage_paths,
            document_ids=inserted_document_ids,
            job_id=job_id,
        )
        raise HTTPException(status_code=500, detail=f"Ingest failed: {exc}")


def _rollback(
    db,
    user_id: str,
    *,
    assignments: list[str],
    grade_courses: list[str],
    storage_paths: list[str],
    document_ids: list[str],
    job_id: Optional[str],
) -> None:
    """Best-effort cleanup of rows/files written during a failed ingest.

    Supabase's Python client has no transactional API, so we compensate by
    deleting the exact rows we inserted earlier in the same handler.
    """
    logger.warning(
        "Rolling back ingest for user %s: %d assignments, %d grades, %d attachments",
        user_id, len(assignments), len(grade_courses), len(storage_paths),
    )
    for lms_id in assignments:
        try:
            db.table("lms_assignments").delete().eq("user_id", user_id).eq("lms_id", lms_id).execute()
        except Exception:
            logger.debug("Rollback: failed to delete assignment %s", lms_id, exc_info=True)
    for course in grade_courses:
        # NOTE: this wipes the grade row entirely, including any prior value.
        # Acceptable since the whole ingest failed — caller will retry.
        try:
            db.table("lms_grades").delete().eq("user_id", user_id).eq("course_name", course).execute()
        except Exception:
            logger.debug("Rollback: failed to delete grade %s", course, exc_info=True)
    for path in storage_paths:
        try:
            db.storage.from_(STORAGE_BUCKET).remove([path])
        except Exception:
            logger.debug("Rollback: failed to remove storage object %s", path, exc_info=True)
    for doc_id in document_ids:
        try:
            db.table("document_uploads").delete().eq("id", doc_id).execute()
        except Exception:
            logger.debug("Rollback: failed to delete document_upload %s", doc_id, exc_info=True)
    if job_id:
        try:
            db.table("agent_jobs").update({
                "status": "failed",
                "error_message": "Ingest rolled back",
                "completed_at": utcnow(),
            }).eq("id", job_id).execute()
        except Exception:
            logger.debug("Rollback: failed to update job %s", job_id, exc_info=True)


# ─────────────────────────────── POST /attachment ────────────────────────

@router.post("/attachment", response_model=AttachmentResponse)
async def upload_single_attachment(
    body: IngestAttachment,
    user_id: str = Depends(get_current_user),
) -> AttachmentResponse:
    """Upload a single attachment — used for files too large to bundle into /ingest."""
    storage_path, doc_id = _upload_attachment(user_id, body)
    return AttachmentResponse(ok=True, storage_path=storage_path, document_id=doc_id)
