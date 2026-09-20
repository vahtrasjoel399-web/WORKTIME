import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(documentId)) {
    return new NextResponse("Invalid document id", { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();
  if (!me || me.role !== "admin") return new NextResponse("Forbidden", { status: 403 });

  const { data: document } = await supabase
    .from("employee_documents")
    .select("id, company_id, employee_id, storage_path")
    .eq("id", documentId)
    .eq("employee_id", id)
    .maybeSingle();
  if (!document || document.company_id !== me.company_id) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { error: storageError } = await supabase.storage
    .from("employee-files")
    .remove([document.storage_path]);
  if (storageError) return new NextResponse("Could not delete document file", { status: 500 });

  // The Phase 11 database trigger appends document.deleted with this admin as
  // actor. Metadata is removed only after the private Storage object is gone.
  const { error: metadataError } = await supabase
    .from("employee_documents")
    .delete()
    .eq("id", document.id)
    .eq("employee_id", id);
  if (metadataError) return new NextResponse("Could not delete document metadata", { status: 500 });

  return NextResponse.json({ deleted: document.id });
}
