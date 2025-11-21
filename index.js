const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- LOGO KAYNAKLARI (EN SAĞLAM LİNKLER) ---
const LOGO_BASE = {
    AK: 'https://www.akportfoy.com.tr/assets/img/header/logo.png', // Ak Portföy
    YKB: 'https://www.ykyatirim.com.tr/assets/images/logo.png', // Yapı Kredi
    GAR: 'https://www.garantibbva.com.tr/assets/images/logo.png', // Garanti
    IS: 'https://www.isportfoy.com.tr/assets/images/logo.png', // İş Portföy
    ZIR: 'https://www.ziraatportfoy.com.tr/assets/images/logo.png', // Ziraat
    DEN: 'https://www.denizportfoy.com.tr/assets/images/logo.png', // Deniz
    TEB: 'https://www.tebportfoy.com.tr/assets/images/logo.png', // TEB
    HSB: 'https://www.hsbc.com.tr/assets/images/logo.png', // HSBC
    QNB: 'https://www.qnbfinansportfoy.com/assets/images/logo.png', // QNB
    TAC: 'https://www.tacirler.com.tr/images/logo.png', // Tacirler
    MRM: 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png', // Marmara
    HED: 'https://www.hedefportfoy.com.tr/images/logo.png', // Hedef
    KUV: 'https://www.kuveytturk.com.tr/assets/img/logo.png' // Kuveyt Türk
};

// Fon Koduna Göre Logo Eşleştirici
const getFundLogo = (code) => {
    if (!code) return null;
    // Fon kodları genelde 3 harflidir. İlk harf veya bilinen kodlardan yakalayacağız.
    if (code.startsWith('A')) return LOGO_BASE.AK;
    if (code.startsWith('Y')) return LOGO_BASE.YKB;
    if (code.startsWith('G')) return LOGO_BASE.GAR;
    if (code.startsWith('T') && code !== 'TCD') return LOGO_BASE.IS; // TCD hariç T'ler genelde İş veya TEB karışık
    if (code === 'TCD') return LOGO_BASE.TAC;
    if (code === 'MAC') return LOGO_BASE.MRM;
    if (code.startsWith('Z')) return LOGO_BASE.ZIR;
    if (code.startsWith('D')) return LOGO_BASE.DEN;
    if (code.startsWith('H')) return LOGO_BASE.HED;
    if (code.startsWith('K')) return LOGO_BASE.KUV;
    return null;
};

// TradingView Logo Dönüştürücü
const getTvLogo = (logoid) => {
    if (!logoid) return null;
    return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`;
};

// =====================================================
// 1. TEFAS FONLARI (KORUMALI İSTEK)
// =====================================================
async function getTefasFunds() {
    try {
        // İş Yatırım bazen robotları engeller. Tarayıcı gibi davranıyoruz.
        const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/YatirimFonlari';
        
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/fon/Sayfalar/default.aspx'
            }
        });
        
        // Veri geldi mi kontrol et
        if (!data || !data.data) {
            console.log("TEFAS verisi boş geldi.");
            return [];
        }

        return data.data.map(item => ({
            id: item[0],            
            symbol: item[0],        
            name: item[1],          
            price: item[2],         
            change24h: item[3],     
            high24: item[2],        
            low24: item[2],
            mcap: 0,
            type: 'fund',           
            region: 'TR',
            color: '#8E44AD',       
            icon: 'chart-pie',
            image: getFundLogo(item[0]) // Manuel eşleştirdiğimiz logolar
        }));

    } catch (error) {
        console.error("TEFAS Çekme Hatası:", error.message);
        return [];
    }
}

// =====================================================
// 2. TRADINGVIEW VERİLERİ
// =====================================================

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
            "sort": { "sortBy": "volume", "sortOrder": "desc" }, // Hacme göre en popülerleri al
            "range": [0, 600]
        };

        const { data } = await axios.post(url, body, { timeout: 15000 });
        if (!data || !data.data) return [];

        return data.data.map(item => {
            // Logo varsa al, yoksa null dön (Telefondaki harf kutusu devreye girsin)
            const logoUrl = item.d[6] ? getTvLogo(item.d[6]) : null;

            return {
                id: item.d[0], symbol: item.d[0], name: item.d[5],
                price: item.d[1] || 0, change24h: item.d[2] || 0, 
                high24: item.d[3] || item.d[1], low24: item.d[4] || item.d[1], 
                mcap: item.d[7] || 0, 
                image: logoUrl,
                type: 'stock', icon: 'finance', color: '#34495E', region: 'TR'
            };
        });
    } catch (error) { return []; }
}

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

        const { data } = await axios.post(url, body, { timeout: 15000 });
        if(!data || !data.data) return [];

        return data.data.map(item => {
            const isEtf = item.d[7] === 'fund' || item.d[7] === 'structured';
            const logoUrl = item.d[8] ? getTvLogo(item.d[8]) : null;

            return {
                id: item.d[0], symbol: item.d[0].split(':')[1], name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: item.d[1] || 0, change24h: item.d[2] || 0, 
                high24: item.d[3] || item.d[1], low24: item.d[4] || item.d[1], 
                mcap: item.d[6] || 0, 
                image: logoUrl,
                icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) { return []; }
}

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

// --- ENDPOINT ---
app.get('/api/all', async (req, res) => {
    try {
        console.log("Veriler isteniyor...");
        
        // Promise.allSettled kullanarak biri hata verse bile diğerlerini getir
        const results = await Promise.allSettled([
            getTefasFunds(),
            getBistStocks(),
            getUSAssets(),
            getForexAndGold()
        ]);

        // Başarılı olanları al
        const tefas = results[0].status === 'fulfilled' ? results[0].value : [];
        const stocks = results[1].status === 'fulfilled' ? results[1].value : [];
        const us = results[2].status === 'fulfilled' ? results[2].value : [];
        const global = results[3].status === 'fulfilled' ? results[3].value : [];

        console.log(`Fon: ${tefas.length}, Hisse: ${stocks.length}, ABD: ${us.length}`);

        res.json([...global, ...tefas, ...stocks, ...us]);

    } catch (error) {
        console.error("Sunucu Hatası:", error);
        res.status(500).json({ error: "Sunucu hatasi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
