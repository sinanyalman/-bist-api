const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try {
        const originalUrl = `s3-symbol-logo.tradingview.com/${logoid}.svg`;
        return `https://images.weserv.nl/?url=${originalUrl}&w=64&h=64&output=png&q=80`;
    } catch (e) {
        return null;
    }
};

// --- 1. TÜM TÜRKİYE PİYASASI (KESİN ÇÖZÜM) ---
async function getTurkeyAssets() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [{ "left": "exchange", "operation": "equal", "right": "BIST" }],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            // DİKKAT: Sütunlara "|1d" ekledik. Bu "1 Günlük Veri" demektir.
            "columns": [
                "name",             // d[0]
                "close",            // d[1]
                "change|1d",        // d[2] (Yüzde Değişim)
                "high|1d",          // d[3] (Günün En Yükseği)
                "low|1d",           // d[4] (Günün En Düşüğü)
                "description",      // d[5]
                "type",             // d[6]
                "subtype",          // d[7]
                "logoid",           // d[8]
                "market_cap_basic"  // d[9] (Piyasa Değeri)
            ],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 2000]
        };

        const { data } = await axios.post(url, body, { timeout: 15000 });
        
        let stocks = [];
        let funds = [];

        if (data && data.data) {
            data.data.forEach(item => {
                const d = item.d;
                
                // Verileri güvenli çekelim
                const asset = {
                    id: d[0],
                    symbol: d[0],
                    name: d[5],
                    price: d[1] || 0,
                    change24h: d[2] || 0, 
                    high24: d[3] || d[1], // Eğer boş gelirse anlık fiyatı yaz
                    low24: d[4] || d[1],  // Eğer boş gelirse anlık fiyatı yaz
                    mcap: d[9] || 0,      // Piyasa değeri
                    image: getLogoUrl(d[8]),
                    region: 'TR'
                };

                const type = d[6];
                const subtype = d[7];

                if (type === 'stock' && subtype === 'common') {
                    asset.type = 'stock';
                    asset.icon = 'finance';
                    asset.color = '#34495E';
                    stocks.push(asset);
                } else if (type === 'fund' || type === 'structured' || subtype === 'etf' || subtype === 'mutual') {
                    asset.type = 'fund';
                    asset.icon = 'chart-pie';
                    asset.color = '#8E44AD';
                    funds.push(asset);
                } 
            });
        }
        return { stocks, funds };

    } catch (error) {
        console.error("Türkiye Piyasası Hatası:", error.message);
        return { stocks: [], funds: [] };
    }
}

// --- 2. ABD HİSSELERİ ---
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [
                { "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] },
                { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }
            ],
            "options": { "lang": "en" },
            // ABD için de |1d ekliyoruz
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, 
            "range": [0, 150]
        };

        const { data } = await axios.post(url, body, { timeout: 15000 });
        if(!data || !data.data) return [];

        return data.data.map(item => {
            const d = item.d;
            const rawType = d[7];
            const isEtf = rawType === 'fund' || rawType === 'structured';
            
            return {
                id: d[0],
                symbol: d[0].split(':')[1], 
                name: d[5],
                type: isEtf ? 'etf-us' : 'stock-us',
                region: 'US',
                price: d[1] || 0,
                change24h: d[2] || 0,
                high24: d[3] || d[1],
                low24: d[4] || d[1],
                mcap: d[6] || 0,
                image: getLogoUrl(d[8]),
                icon: isEtf ? 'layers' : 'google-circles-extended',
                color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) {
        console.error("ABD Hatası:", error.message);
        return [];
    }
}

// --- 3. DÖVİZ VE ALTIN ---
async function getForexAndGold() {
    try {
        const url = 'https://scanner.tradingview.com/global/scan';
        const body = {
            "symbols": {
                "tickers": ["FX_IDC:USDTRY", "FX_IDC:EURTRY", "TVC:GOLD"],
                "query": { "types": [] }
            },
            "columns": ["close", "change|1d", "high|1d", "low|1d"]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        if(!data || !data.data) return [];

        const findVal = (ticker) => {
            const item = data.data.find(i => i.s === ticker);
            const d = item ? item.d : [0,0,0,0];
            return { price: d[0], change: d[1], high: d[2], low: d[3] };
        };

        const usd = findVal("FX_IDC:USDTRY");
        const eur = findVal("FX_IDC:EURTRY");
        const ons = findVal("TVC:GOLD");
        const gramPrice = (ons.price * usd.price) / 31.1035;
        
        return [
            { id: 'USD', symbol: 'USD', name: 'Dolar/TL', type: 'forex', price: usd.price, change24h: usd.change, high24: usd.high, low24: usd.low, icon: 'currency-usd', color: '#2ECC71' },
            { id: 'EUR', symbol: 'EUR', name: 'Euro/TL', type: 'forex', price: eur.price, change24h: eur.change, high24: eur.high, low24: eur.low, icon: 'currency-eur', color: '#3498DB' },
            { id: 'GA', symbol: 'GRAM', name: 'Gram Altın', type: 'gold', price: gramPrice, change24h: ons.change, high24: gramPrice * 1.01, low24: gramPrice * 0.99, icon: 'gold', color: '#F1C40F' },
            { id: 'XAU', symbol: 'ONS', name: 'Ons Altın', type: 'gold', price: ons.price, change24h: ons.change, high24: ons.high, low24: ons.low, icon: 'gold', color: '#D4AC0D' }
        ];
    } catch (error) {
        return [];
    }
}

app.get('/api/all', async (req, res) => {
    try {
        const [turkeyAssets, us, global] = await Promise.all([
            getTurkeyAssets(),
            getUSAssets(),
            getForexAndGold()
        ]);
        res.json([...global, ...turkeyAssets.stocks, ...turkeyAssets.funds, ...us]);
    } catch (error) {
        res.status(500).json({ error: "Veri hatasi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
