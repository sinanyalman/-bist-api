const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- YARDIMCI: LOGO OLUŞTURUCU ---
const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try {
        return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`;
    } catch (e) { return null; }
};

// =====================================================
// 1. KAYNAK: İŞ YATIRIM (TEFAS FONLARI İÇİN) - KESİN ÇÖZÜM
// =====================================================
async function getTefasFunds() {
    try {
        // İş Yatırım'ın tüm fonları veren servisi
        const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/YatirimFonlari';
        
        const { data } = await axios.get(url);
        
        // Veri tablosu 'data' içinde geliyor. Formatı biraz farklı, dönüştürelim.
        // IsYatirim alanları: FonKodu, FonAdi, Fiyat, GunlukGetiri (%)
        
        return data.data.map(item => ({
            id: item[0],            // Fon Kodu (Örn: TLY)
            symbol: item[0],        // Sembol
            name: item[1],          // Fon Adı
            price: item[2],         // Fiyat
            change24h: item[3],     // Günlük Getiri (%)
            high24: item[2],        // Fonlarda gün içi high/low genelde aynıdır (kapanış fiyatı)
            low24: item[2],
            mcap: 0,
            type: 'fund',           // Bizim uygulama için tip
            region: 'TR',
            color: '#8E44AD',       // Mor renk
            icon: 'chart-pie',
            image: null             // Fonların logosu yok, harf görünecek
        }));

    } catch (error) {
        console.error("TEFAS (IsYatirim) Hatası:", error.message);
        return [];
    }
}

// =====================================================
// 2. KAYNAK: TRADINGVIEW (HİSSELER VE ABD İÇİN)
// =====================================================

// --- BIST HİSSELERİ ---
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
            "columns": ["name", "close", "change", "high", "low", "description", "logoid", "market_cap_basic"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 600]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];

        return data.data.map(item => ({
            id: item.d[0], symbol: item.d[0], name: item.d[5],
            price: item.d[1] || 0, change24h: item.d[2] || 0, 
            high24: item.d[3] || item.d[1], low24: item.d[4] || item.d[1], 
            mcap: item.d[7] || 0, image: getLogoUrl(item.d[6]),
            type: 'stock', icon: 'finance', color: '#34495E', region: 'TR'
        }));
    } catch (error) { return []; }
}

// --- ABD HİSSELERİ ---
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [
                { "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] },
                { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }
            ],
            "options": { "lang": "en" },
            "columns": ["name", "close", "change", "high", "low", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, 
            "range": [0, 200]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        if(!data || !data.data) return [];

        return data.data.map(item => {
            const isEtf = item.d[7] === 'fund' || item.d[7] === 'structured';
            return {
                id: item.d[0], symbol: item.d[0].split(':')[1], name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: item.d[1] || 0, change24h: item.d[2] || 0, 
                high24: item.d[3] || item.d[1], low24: item.d[4] || item.d[1], 
                mcap: item.d[6] || 0, image: getLogoUrl(item.d[8]),
                icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) { return []; }
}

// --- DÖVİZ VE ALTIN ---
async function getForexAndGold() {
    try {
        const url = 'https://scanner.tradingview.com/global/scan';
        const body = {
            "symbols": { "tickers": ["FX_IDC:USDTRY", "FX_IDC:EURTRY", "TVC:GOLD"], "query": { "types": [] } },
            "columns": ["close", "change", "high", "low"]
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
    } catch (error) { return []; }
}

// --- ANA ENDPOINT ---
app.get('/api/all', async (req, res) => {
    try {
        console.log("Veriler çekiliyor...");
        
        // Tüm kaynaklardan paralel çekim yapıyoruz
        const [tefasFunds, bistStocks, usAssets, global] = await Promise.all([
            getTefasFunds(), // İş Yatırım'dan Fonlar
            getBistStocks(), // TradingView'den BIST
            getUSAssets(),   // TradingView'den ABD
            getForexAndGold()// TradingView'den Döviz
        ]);

        console.log(`Fon: ${tefasFunds.length}, Hisse: ${bistStocks.length}, ABD: ${usAssets.length}`);
        
        // Hepsini tek listede birleştir
        res.json([...global, ...tefasFunds, ...bistStocks, ...usAssets]);

    } catch (error) {
        console.error("Sunucu Hatası:", error);
        res.status(500).json({ error: "Veri alinamadi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
