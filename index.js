const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- 1. BIST HİSSELERİNİ ÇEKEN FONKSİYON ---
async function getAllStocks() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "typespecs", "operation": "has", "right": "common" }
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
            type: 'stock',
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

// --- 2. DÖVİZ VE ALTIN ÇEKEN FONKSİYON ---
async function getForexAndGold() {
    try {
        // Global piyasaları tarıyoruz
        const url = 'https://scanner.tradingview.com/global/scan';
        const body = {
            "symbols": {
                "tickers": [
                    "FX_IDC:USDTRY",  // Dolar
                    "FX_IDC:EURTRY",  // Euro
                    "TVC:GOLD"        // Ons Altın
                ],
                "query": { "types": [] }
            },
            "columns": ["close", "change|1d", "high|1d", "low|1d"]
        };

        const { data } = await axios.post(url, body);
        
        // TradingView'den gelen verileri işleyelim
        // data.data[0] -> USDTRY
        // data.data[1] -> EURTRY
        // data.data[2] -> ONS ALTIN (Sıra değişebilir, o yüzden find ile arayacağız)

        const findVal = (ticker) => {
            const item = data.data.find(i => i.s === ticker);
            return item ? { price: item.d[0], change: item.d[1], high: item.d[2], low: item.d[3] } : { price:0, change:0 };
        };

        const usd = findVal("FX_IDC:USDTRY");
        const eur = findVal("FX_IDC:EURTRY");
        const ons = findVal("TVC:GOLD");

        // Gram Altın Hesabı: (Ons Dolar Fiyatı * Dolar Kuru) / 31.1035
        const gramPrice = (ons.price * usd.price) / 31.1035;
        // Gram değişimi Ons değişimi ile yaklaşık aynıdır (Basitlik için)
        
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
                price: gramPrice, change24h: ons.change, high24: gramPrice * 1.01, low24: gramPrice * 0.99, // Gram için high/low tahmini
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

// Endpoint: BIST Hisseleri
app.get('/api/bist', async (req, res) => {
    const data = await getAllStocks();
    res.json(data);
});

// Endpoint: Döviz ve Altın
app.get('/api/global', async (req, res) => {
    const data = await getForexAndGold();
    res.json(data);
});

// Endpoint: HEPSİ BİR ARADA (Uygulama için en kolayı bu)
app.get('/api/all', async (req, res) => {
    console.log("Tüm piyasa verileri isteniyor...");
    const [bist, global] = await Promise.all([getAllStocks(), getForexAndGold()]);
    // Önce Döviz/Altın, Sonra Hisseler gelsin
    res.json([...global, ...bist]);
});

app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor! Port: ${PORT}`);
});
