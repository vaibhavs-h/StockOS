import { NextResponse } from 'next/server';

export async function GET() {
  const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
  }

  try {
    console.log(`[PROXY] Fetching from: ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      next: { revalidate: 60 } // Cache for 60 seconds to prevent crashing n8n
    });

    console.log(`[PROXY] Status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`[PROXY] Webhook Error: ${text}`);
      throw new Error(`Webhook responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[PROXY] Success: Received ${JSON.stringify(data).length} bytes`);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[API_MARKET_INTELLIGENCE] Proxy Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
