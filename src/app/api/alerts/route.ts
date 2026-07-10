import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AlertService } from "@/services/AlertService";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

/**
 * GET: Retrieve all active and historical alerts for the user.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);

  try {
    const alerts = await AlertService.getUserAlerts(userId);
    return NextResponse.json({ success: true, alerts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to retrieve alerts" }, { status: 500 });
  }
}

/**
 * POST: Create a new price alert.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);

  try {
    const body = await req.json();
    const { symbol, asset_type, trigger_condition, target_value, name } = body;

    if (!symbol || !asset_type || !trigger_condition || target_value === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (target_value <= 0) {
      return NextResponse.json({ error: "Target value must be greater than zero" }, { status: 400 });
    }

    const newAlert = await AlertService.createAlert(
      userId,
      symbol,
      asset_type,
      trigger_condition,
      Number(target_value),
      name
    );

    return NextResponse.json({ success: true, alert: newAlert });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create alert" }, { status: 500 });
  }
}

/**
 * DELETE: Delete a price alert.
 */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);
  const alertId = req.nextUrl.searchParams.get("id");

  if (!alertId) {
    return NextResponse.json({ error: "Missing alert ID parameter" }, { status: 400 });
  }

  try {
    await AlertService.deleteAlert(userId, alertId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete alert" }, { status: 500 });
  }
}
