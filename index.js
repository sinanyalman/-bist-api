const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- YARDIMCI: LOGO OLUŞTURUCU ---
// TradingView SVG logosunu PNG'ye çevirir.
const getLogoUrl = (logoid, base) => {
    if (!logoid) return null;
    try {
        // TradingView base URL'i bazen değişebilir, standart olanı kullanıyoruz
        const originalUrl = `https://s3-symbol-logo.tradingview.com/${logoid}.svg`;
        // React Native SVG gösteremez, bu yüzden weserv ile PNG'ye çeviriyoruz
        return `https://images.weserv.nl/?url=${encodeURIComponent(originalUrl)}&w=64&h=64&output=png&q=80&t=square`;
    } catch (e) {
        return null;
    }
};

// --- 1. BIST HİSSELERİ (Sadece Hisseler) ---
async function getBistStocks() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "type", "operation": "equal", "right": "stock" }, 
                { "left": "subtype", "operation": "equal", "right": "common" } 
            ],
            "options": { "lang": "tr" },
            // d[6] -> logoid
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "logoid"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 600] // İlk 600 hisse yeterli
        };

        const { data } = await axios.post(url, body, { timeout: 8000 });
        
        return data.data.map(item => ({
            id: item.d[0],
            symbol: item.d[0],
            name: item.d[5],
            type: 'stock',
            region: 'TR',
            price: item.d[1],
            change24h: item.d[2],
            high24: item.d[3],
            low24: item.d[4],
            image: getLogoUrl(item.d[6]), // LOGO BURADAN GELİYOR
            icon: 'finance',
            color: '#34495E'
        }));
    } catch (error) {
        console.error("BIST Fetch Error:", error.message);
        return [];
    }
}

// --- 2. TEFAS FONLARI (Sadece Fonlar - Ayrı İstek) ---
async function getTefasFunds() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "type", "operation": "in_range", "right": ["fund", "mutual"] } // Fon tipleri
            ],
            "options": { "lang": "tr" },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "logoid"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 500] // 500 tane fon çeker
        };

        const { data } = await axios.post(url, body, { timeout: 8000 });
        
        return data.data.map(item => ({
            id: item.d[0],
            symbol: item.d[0], 
            name: item.d[5],
            type: 'fund',
            region: 'TR',
            price: item.d[1],
            change24h: item.d[2],
            high24: item.d[3],
            low24: item.d[4],
            image: getLogoUrl(item.d[6]),
            icon: 'chart-pie',
            color: '#8E44AD'
        }));
    } catch (error) {
        console.error("Fund Fetch Error:", error.message);
        return [];
    }
}

// --- 3. ABD HİSSELERİ & ETF (En büyük 200) ---
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [
                { "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] },
                { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }
            ],
            "options": { "lang": "en" },
            // Market Cap'e göre sırala ki popülerler (Apple, Tesla) gelsin
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "type", "logoid", "market_cap_basic"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, 
            "range": [0, 200]
        };

        const { data } = await axios.post(url, body, { timeout: 8000 });
        
        return data.data.map(item => {
            const rawType = item.d[6];
            const isEtf = rawType === 'fund' || rawType === 'structured';
            const logoid = item.d[7];

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
                image: getLogoUrl(logoid), // LOGO DÜZELTİLDİ
                icon: isEtf ? 'layers' : 'google-circles-extended',
                color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) {
        console.error("US Fetch Error:", error.message);
        return [];
    }
}

// --- 4. DÖVİZ VE ALTIN ---
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

        const { data } = await axios.post(url, body, { timeout: 5000 });
        
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
        console.error("Forex Fetch Error:", error.message);
        return [];
    }
}

// --- ENDPOINT ---
app.get('/api/all', async (req, res) => {
    console.log("--- API İSTEĞİ GELDİ ---");
    const start = Date.now();

    try {
        // Hepsini paralel çalıştırıyoruz
        const [bist, funds, us, global] = await Promise.all([
            getBistStocks(),
            getTefasFunds(),
            getUSAssets(),
            getForexAndGold()
        ]);

        const total = bist.length + funds.length + us.length + global.length;
        console.log(`Veri hazir. Toplam: ${total} oge. Sure: ${Date.now() - start}ms`);
        
        res.json([...global, ...us, ...bist, ...funds]);

    } catch (error) {
        console.error("Critical Server Error:", error);
        res.status(500).json({ error: "Sunucu hatasi" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Sunucu ayakta! Port: ${PORT}`);
});
