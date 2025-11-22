const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try { return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`; } catch (e) { return null; }
};

// --- FON LOGOLARI (Manuel) ---
const FUND_LOGOS = {
    'A': 'https://www.akportfoy.com.tr/assets/img/header/logo.png',
    'Y': 'https://www.ykyatirim.com.tr/assets/images/logo.png',
    'G': 'https://www.garantibbva.com.tr/assets/images/logo.png',
    'T': 'https://www.isportfoy.com.tr/assets/images/logo.png',
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png',
    'H': 'https://www.hedefportfoy.com.tr/images/logo.png',
    'I': 'https://www.isportfoy.com.tr/assets/images/logo.png',
    'Z': 'https://www.ziraatportfoy.com.tr/assets/images/logo.png',
    'O': 'https://www.oyakportfoy.com.tr/assets/images/logo.png',
    'Q': 'https://www.qnbfinansportfoy.com/assets/images/logo.png',
    'D': 'https://www.denizportfoy.com.tr/assets/images/logo.png'
};

const getFundLogo = (symbol) => {
    if(!symbol) return null;
    if(symbol === 'TCD') return 'https://www.tacirler.com.tr/images/logo.png';
    if(symbol === 'MAC') return 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png';
    return FUND_LOGOS[symbol.charAt(0)] || null;
};

// --- 1. TÜM TÜRKİYE PİYASASI (HİSSE + FON) ---
async function getAllTurkeyAssets() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [{ "left": "exchange", "operation": "equal", "right": "BIST" }],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            "columns": ["name", "close", "change", "high", "low", "description", "type", "subtype", "logoid", "market_cap_basic"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 4000] 
        };

        const { data } = await axios.post(url, body, { timeout: 20000 });
        
        let stocks = [];
        let funds = [];

        if (data && data.data) {
            data.data.forEach(item => {
                const d = item.d;
                const symbol = d[0];
                const type = d[6];
                const subtype = d[7];
                const desc = d[5] || "";

                const asset = {
                    id: symbol, symbol: symbol, name: d[5],
                    price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || d[1], low24: d[4] || d[1], mcap: d[9] || 0,
                    region: 'TR'
                };

                if (type === 'stock' && subtype === 'common') {
                    asset.type = 'stock';
                    asset.icon = 'finance';
                    asset.color = '#34495E';
                    asset.image = getLogoUrl(d[8]);
                    stocks.push(asset);
                } else if ((type === 'fund' || subtype === 'mutual' || subtype === 'etf') || (symbol.length === 3 && desc.includes('FON'))) {
                    asset.type = 'fund';
                    asset.icon = 'chart-pie';
                    asset.color = '#8E44AD';
                    asset.image = getFundLogo(symbol);
                    funds.push(asset);
                }
            });
        }
        return { stocks, funds };
    } catch (error) { return { stocks: [], funds: [] }; }
}

// --- ABD ---
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [{ "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] }, { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }],
            "options": { "lang": "en" },
            "columns": ["name", "close", "change", "high", "low", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, "range": [0, 200]
        };
        const { data } = await axios.post(url, body, { timeout: 15000 });
        if(!data || !data.data) return [];
        return data.data.map(item => {
            const d = item.d;
            const isEtf = d[7] === 'fund' || d[7] === 'structured';
            return {
                id: d[0], symbol: d[0].split(':')[1], name: d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || d[1], low24: d[4] || d[1], mcap: d[6] || 0, 
                image: getLogoUrl(d[8]), icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) { return []; }
}

// --- DÖVİZ ---
async function getForexAndGold() {
    try {
        const url = 'https://scanner.tradingview.com/global/scan';
        const body = { "symbols": { "tickers": ["FX_IDC:USDTRY", "FX_IDC:EURTRY", "TVC:GOLD"], "query": { "types": [] } }, "columns": ["close", "change", "high", "low"] };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if(!data || !data.data) return [];
        const findVal = (ticker) => { const item = data.data.find(i => i.s === ticker); const d = item ? item.d : [0,0,0,0]; return { price: d[0], change: d[1], high: d[2], low: d[3] }; };
        const usd = findVal("FX_IDC:USDTRY"); const eur = findVal("FX_IDC:EURTRY"); const ons = findVal("TVC:GOLD"); const gramPrice = (ons.price * usd.price) / 31.1035;
        return [
            { id: 'USD', symbol: 'USD', name: 'Dolar/TL', type: 'forex', price: usd.price, change24h: usd.change, high24: usd.high, low24: usd.low, icon: 'currency-usd', color: '#2ECC71' },
            { id: 'EUR', symbol: 'EUR', name: 'Euro/TL', type: 'forex', price: eur.price, change24h: eur.change, high24: eur.high, low24: eur.low, icon: 'currency-eur', color: '#3498DB' },
            { id: 'GA', symbol: 'GRAM', name: 'Gram Altın', type: 'gold', price: gramPrice, change24h: ons.change, high24: gramPrice * 1.01, low24: gramPrice * 0.99, icon: 'gold', color: '#F1C40F' },
            { id: 'XAU', symbol: 'ONS', name: 'Ons Altın', type: 'gold', price: ons.price, change24h: ons.change, high24: ons.high, low24: ons.low, icon: 'gold', color: '#D4AC0D' }
        ];
    } catch (error) { return []; }
}

app.get('/api/all', async (req, res) => {
    try {
        const [turkey, us, global] = await Promise.all([getAllTurkeyAssets(), getUSAssets(), getForexAndGold()]);
        res.json([...global, ...turkey.stocks, ...turkey.funds, ...us]);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
