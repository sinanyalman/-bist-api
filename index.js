const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Resim Dönüştürücü (Hata korumalı)
const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try {
        const originalUrl = `s3-symbol-logo.tradingview.com/${logoid}.svg`;
        return `https://images.weserv.nl/?url=${originalUrl}&w=64&h=64&output=png&q=80`;
    } catch (e) {
        return null;
    }
};

// --- 1. TÜM TÜRKİYE PİYASASI ---
async function getTurkeyAssets() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [{ "left": "exchange", "operation": "equal", "right": "BIST" }],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "type", "subtype", "logoid"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 1500] // Sayıyı biraz azalttık, timeout yememek için
        };

        // Timeout ekledik: 10 saniye içinde yanıt gelmezse iptal et
        const { data } = await axios.post(url, body, { timeout: 10000 });
        
        let stocks = [];
        let funds = [];

        if (data && data.data) {
            data.data.forEach(item => {
                const type = item.d[6];
                const subtype = item.d[7];
                const logoid = item.d[8];

                const asset = {
                    id: item.d[0],
                    symbol: item.d[0],
                    name: item.d[5],
                    price: item.d[1],
                    change24h: item.d[2],
                    high24: item.d[3],
                    low24: item.d[4],
                    image: getLogoUrl(logoid),
                    region: 'TR'
                };

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
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, 
            "range": [0, 150]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        
        if(!data || !data.data) return [];

        return data.data.map(item => {
            const rawType = item.d[7];
            const logoid = item.d[8];
            const isEtf = rawType === 'fund' || rawType === 'structured';
            
            return {
                id: item.d[0],
                symbol: item.d[0].split(':')[1], 
                name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us',
                region: 'US',
                price: item.d[1],
                change24h: item.d[2],
                high24: item.d[3],
                low24: item.d[4],
                image: getLogoUrl(logoid),
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
            return item ? { price: item.d[0], change: item.d[1], high: item.d[2], low: item.d[3] } : { price:0, change:0 };
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
        console.error("Forex Hatası:", error.message);
        return []; // Hata olsa bile boş dizi dön, sunucuyu çökertme
    }
}

// --- ENDPOINT ---
app.get('/api/all', async (req, res) => {
    try {
        console.log("Veriler isteniyor...");
        const [turkeyAssets, us, global] = await Promise.all([
            getTurkeyAssets(),
            getUSAssets(),
            getForexAndGold()
        ]);
        res.json([...global, ...turkeyAssets.stocks, ...turkeyAssets.funds, ...us]);
    } catch (error) {
        console.error("Genel Sunucu Hatası:", error);
        res.status(500).json({ error: "Veri cekilemedi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor! Port: ${PORT}`);
});
