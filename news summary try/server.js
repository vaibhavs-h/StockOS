const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());

const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

app.get('/api/market-data', async (req, res) => {
    try {
        console.log(`Fetching FRESH data from: ${N8N_WEBHOOK_URL}`);
        const response = await fetch(N8N_WEBHOOK_URL);

        if (!response.ok) {
            console.warn(`Webhook returned ${response.status}. Using mock fallback.`);
            return res.json(getMockData());
        }

        const data = await response.json();
        console.log('Success: Data received from n8n');
        res.json(data);
    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.json(getMockData());
    }
});

function getMockData() {
    return {
        output: JSON.stringify({
            sectors: [
                { name: "Technology", sentiment: "BULLISH", confidence: "92", reason: "Strong earnings from major tech firms and AI growth." },
                { name: "Financials", sentiment: "BULLISH", confidence: "85", reason: "Interest rate stability favoring banking margins." },
                { name: "Energy", sentiment: "BEARISH", confidence: "70", reason: "Global demand concerns and supply chain shifts." },
                { name: "Consumer Staples", sentiment: "NEUTRAL", confidence: "60", reason: "Steady demand but rising raw material costs." }
            ],
            overall_sentiment: "BULLISH",
            market_summary: "The market shows strong resilience in tech and financials, while energy remains under pressure."
        })
    };
}

app.listen(3000, () => {
    console.log('✅ Proxy server running on http://localhost:3000 (Direct Fetch Mode)');
});
