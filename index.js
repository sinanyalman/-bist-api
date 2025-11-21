const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- 1. BIST HİSSELERİ (TÜRKİYE) ---
async function getBistStocks() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "typespecs", "operation": "has", "right": "common" } // Sadece hisseler
            ],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 600]
        };

        const { data } = await axios.post(url, body);
        return data.data.map(item => ({
            id: item.d[0],
            symbol: item.d[0],
            name: item.d[5],
            type: 'stock', // Tip: Hisse
            region: 'TR',
            price: item.d[1],
            change24h: item.d[2],
            high24: item.d[3],
            low24: item.d[4],
            icon: 'finance',
            color: '#34495E'
        }));
    } catch (error) {
        console.error("BIST Hatası:", error.message);
        return [];
    }
}

// --- 2. TEFAS FONLARI (TÜRKİYE) --- (YENİ)
async function getTefasFunds() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "type", "operation": "equal", "right": "fund" } // Sadece Fonlar
            ],
            "options": { "lang": "tr" },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description"],
            "sort": { "sortBy": "total_assets", "sortOrder": "desc" }, // Büyüklüğe göre sırala
            "range": [0, 200] // En büyük 200 fon
        };

        const { data } = await axios.post(url, body);
        return data.data.map(item => ({
            id: item.d[0],
            symbol: item.d[0], // Örn: MAC, TCD
            name: item.d[5], // Örn: MARMARA CAPITAL...
            type: 'fund', // Tip: Fon
            region: 'TR',
            price: item.d[1],
            change24h: item.d[2],
            high24: item.d[3],
            low24: item.d[4],
            icon: 'chart-pie', // Pasta grafik ikonu
            color: '#8E44AD' // Mor renk
        }));
    } catch (error) {
        console.error("TEFAS Hatası:", error.message);
        return [];
    }
}

// --- 3. ABD HİSSELERİ VE ETF'ler (AMERİKA) --- (GÜNCELLENDİ)
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [
                // Hisse (common) VEYA ETF (fund) olanları getir
                { "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] },
                { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }
            ],
            "options": { "lang": "en" },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "market_cap_basic", "type"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, 
            "range": [0, 250] // Sayıyı artırdık (Hisse + ETF karışık)
        };

        const { data } = await axios.post(url, body);
        return data.data.map(item => {
            // Gelen verinin tipine bakıp ETF mi Hisse mi olduğunu anlayalım
            const rawType = item.d[7]; // TradingView'den gelen tip
            const isEtf = rawType === 'fund' || rawType === 'structured';
            
            return {
                id: item.d[0],
                symbol: item.d[0].split(':')[1], // NASDAQ:AAPL -> AAPL
                name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us', // Ayrım yapıyoruz
                region: 'US',
                price: item.d[1],
                change24h: item.d[2],
                high24: item.d[3],
                low24: item.d[4],
                icon: isEtf ? 'layers' : 'google-circles-extended',
                color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) {
        console.error("ABD Hatası:", error.message);
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

        const { data } = await axios.post(url, body);
        
        const findVal = (ticker) => {
            const item = data.data.find(i => i.s === ticker);
            return item ? { price: item.d[0], change: item.d[1], high: item.d[2], low: item.d[3] } : { price:0, change:0 };
        };

        const usd = findVal("FX_IDC:USDTRY");
        const eur = findVal("FX_IDC:EURTRY");
        const ons = findVal("TVC:GOLD");
        const gramPrice = (ons.price * usd.price) / 31.1035;
        
        return [
            {
                id: 'USD', symbol: 'USD', name: 'Dolar/TL', type: 'forex',
                price: usd.price, change24h: usd.change, high24: usd.high, low24: usd.low,
                icon: 'currency-usd', color: '#2ECC71'
            },
            {
                id: 'EUR', symbol: 'EUR', name: 'Euro/TL', type: 'forex',
                price: eur.price, change24h: eur.change, high24: eur.high, low24: eur.low,
                icon: 'currency-eur', color: '#3498DB'
            },
            {
                id: 'GA', symbol: 'GRAM', name: 'Gram Altın', type: 'gold',
                price: gramPrice, change24h: ons.change, high24: gramPrice * 1.01, low24: gramPrice * 0.99,
                icon: 'gold', color: '#F1C40F'
            },
            {
                id: 'XAU', symbol: 'ONS', name: 'Ons Altın', type: 'gold',
                price: ons.price, change24h: ons.change, high24: ons.high, low24: ons.low,
                icon: 'gold', color: '#D4AC0D'
            }
        ];
    } catch (error) {
        console.error("Forex Hatası:", error.message);
        return [];
    }
}

// --- ENDPOINT: HEPSİ BİR ARADA ---
app.get('/api/all', async (req, res) => {
    console.log("Tüm varlıklar isteniyor...");
    
    // Performans için hepsini paralel çekiyoruz
    const [bist, tefas, us, global] = await Promise.all([
        getBistStocks(),
        getTefasFunds(),
        getUSAssets(),
        getForexAndGold()
    ]);
    
    // Birleştir ve gönder
    res.json([...global, ...bist, ...tefas, ...us]);
});

app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor! Port: ${PORT}`);
});
