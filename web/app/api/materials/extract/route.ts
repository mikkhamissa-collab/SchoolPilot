// Extract content from Google Drive files, PDFs, and YouTube transcripts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

interface ExtractionRequest {
  material_id: string;
  resources: Array<{
    type: string;
    url?: string;
    fileId?: string;
    videoId?: string;
    name?: string;
  }>;
}

// Google Drive export URLs for different file types
const DRIVE_EXPORT_FORMATS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/pdf": "text/plain",
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as ExtractionRequest;
  const { material_id, resources } = body;

  if (!material_id || !resources?.length) {
    return NextResponse.json(
      { error: "Missing material_id or resources" },
      { status: 400 }
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Verify material belongs to user
  const { data: material, error: materialError } = await admin
    .from("course_materials")
    .select("*")
    .eq("id", material_id)
    .eq("user_id", user.id)
    .single();

  if (materialError || !material) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  const results: Array<{
    source_id: string;
    status: string;
    text_length?: number;
    error?: string;
  }> = [];

  for (const resource of resources) {
    try {
      let extractedText = "";
      let sourceId = "";
      let sourceType = resource.type;

      if (resource.type === "google_drive" && resource.fileId) {
        sourceId = resource.fileId;
        // Try to extract via Google Drive export
        extractedText = await extractGoogleDriveContent(resource.fileId);
      } else if (resource.type === "youtube" && resource.videoId) {
        sourceId = resource.videoId;
        // Extract YouTube transcript
        extractedText = await extractYouTubeTranscript(resource.videoId);
      } else if (resource.type === "pdf" && resource.url) {
        sourceId = resource.url;
        // For direct PDF URLs, we'd need a PDF parsing service
        extractedText = `[PDF content from ${resource.name || resource.url}]`;
      }

      if (extractedText && extractedText.length > 50) {
        // Save extracted content
        const { error: insertError } = await admin
          .from("extracted_documents")
          .upsert(
            {
              material_id,
              source_type: sourceType,
              source_url: resource.url || "",
              source_id: sourceId,
              title: resource.name || "",
              extracted_text: extractedText,
              metadata: { original_resource: resource },
              extracted_at: new Date().toISOString(),
            },
            {
              onConflict: "material_id,source_id",
            }
          );

        if (insertError) {
          results.push({ source_id: sourceId, status: "error", error: insertError.message });
        } else {
          results.push({ source_id: sourceId, status: "extracted", text_length: extractedText.length });
        }
      } else {
        results.push({ source_id: sourceId || "unknown", status: "skipped", error: "No content extracted" });
      }
    } catch (err) {
      results.push({
        source_id: resource.fileId || resource.videoId || "unknown",
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Update extracted_content array in course_materials
  const { data: extracted } = await admin
    .from("extracted_documents")
    .select("source_id, title, extracted_text")
    .eq("material_id", material_id);

  if (extracted?.length) {
    await admin
      .from("course_materials")
      .update({
        extracted_content: extracted.map((e) => ({
          source_id: e.source_id,
          title: e.title,
          preview: e.extracted_text?.substring(0, 500),
        })),
      })
      .eq("id", material_id);
  }

  return NextResponse.json({
    status: "completed",
    results,
    total_extracted: results.filter((r) => r.status === "extracted").length,
  });
}

// Extract content from Google Drive files using export URL
async function extractGoogleDriveContent(fileId: string): Promise<string> {
  // Google Drive API requires OAuth - for now we use the export URL approach
  // which works for publicly shared files

  // Try to get file as text via export
  const exportUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  try {
    const response = await fetch(exportUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SchoolPilot/1.0)",
      },
    });

    if (!response.ok) {
      // Try alternate export URL for Google Docs
      const docsExportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
      const docsResponse = await fetch(docsExportUrl);
      if (docsResponse.ok) {
        return await docsResponse.text();
      }
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/") || contentType.includes("application/json")) {
      return await response.text();
    }

    // For PDFs, we'd need to use a PDF extraction service
    // For now, return a placeholder indicating we found the file
    return `[Google Drive file: ${fileId} - type: ${contentType}]`;
  } catch (err) {
    console.error("Error extracting Google Drive content:", err);
    return "";
  }
}

// Extract YouTube transcript using available APIs
async function extractYouTubeTranscript(videoId: string): Promise<string> {
  // YouTube doesn't have a public transcript API, but there are workarounds
  // For now, we'll use the video info endpoint to get basic metadata
  // and rely on third-party services or manual input for transcripts

  try {
    // Try to get video info
    const infoUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(infoUrl);

    if (response.ok) {
      const data = await response.json();
      return `[YouTube Video: "${data.title}" by ${data.author_name}]\n\nVideo ID: ${videoId}\nWatch at: https://www.youtube.com/watch?v=${videoId}`;
    }

    return `[YouTube Video: ${videoId}]`;
  } catch (err) {
    console.error("Error extracting YouTube info:", err);
    return "";
  }
}

// GET endpoint to retrieve extracted content for a material
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { searchParams } = new URL(request.url);
  const materialId = searchParams.get("material_id");

  if (!materialId) {
    return NextResponse.json({ error: "Missing material_id" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Verify material belongs to user
  const { data: material } = await admin
    .from("course_materials")
    .select("id")
    .eq("id", materialId)
    .eq("user_id", user.id)
    .single();

  if (!material) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  const { data: documents, error } = await admin
    .from("extracted_documents")
    .select("*")
    .eq("material_id", materialId)
    .order("extracted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents });
}
