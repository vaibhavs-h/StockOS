import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { CASImportService } from "@/services/CASImportService";
import { getDbUserId } from "@/lib/user";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUserId = (session.user as any).id;
  const userId = getDbUserId(sessionUserId);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const password = formData.get('password') as string || '';
    const portfolioName = (formData.get('portfolioName') as string) || 'Unified CAS Folio';

    if (!file) {
      return NextResponse.json({ error: "No file uploaded. Please attach a valid CAS PDF." }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required for encrypted CAS statements." }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Call CASImportService
    const result = await CASImportService.importCAS(pdfBuffer, password, userId, portfolioName);

    return NextResponse.json({
      success: true,
      message: "Mutual funds portfolio imported successfully!",
      data: result
    });
  } catch (error: any) {
    console.error("[API-IMPORT-CAS] Ingestion crash:", error);
    
    // Check specific decryption failure
    if (error.message && error.message.includes('DECRYPTION_FAILED')) {
      return NextResponse.json({ 
        error: "Decryption failed. The password provided is incorrect for this CAS PDF." 
      }, { status: 400 });
    }

    if (error.message && error.message.includes('NO_HOLDINGS_FOUND')) {
      return NextResponse.json({ 
        error: "No holdings found. The uploaded PDF might not be a valid CAMS/KFintech CAS statement." 
      }, { status: 400 });
    }

    return NextResponse.json({ 
      error: error.message || "An unexpected error occurred during statement ingestion." 
    }, { status: 500 });
  }
}
