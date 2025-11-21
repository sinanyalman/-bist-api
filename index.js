const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- YARDIMCI: LOGO MOTORU ---
const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try {
        // TradingView SVG logosunu PNG'ye çevir
        return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`;
    } catch (e) { return null; }
};

// --- YENİ: FON YÖNETİM ŞİRKETİ LOGOLARI (Manuel Eşleştirme) ---
const FUND_LOGOS = {
    'A': 'https://www.akportfoy.com.tr/assets/img/header/logo.png', // Ak Portföy (AFT, AFA...)
    'Y': 'https://www.ykyatirim.com.tr/assets/images/logo.png', // Yapı Kredi (YAY, YDI...)
    'G': 'https://www.garantibbva.com.tr/assets/images/logo.png', // Garanti (GMR...)
    'T': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İş Portföy (TI2, TI3...) / Tacirler (TCD) - Karışık ama genelde T
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png', // Marmara (MAC)
    'H': 'https://www.hedefportfoy.com.tr/images/logo.png', // Hedef (HVI, HDA...)
    'I': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İstanbul/İş
    'Z': 'https://www.ziraatportfoy.com.tr/assets/images/logo.png', // Ziraat
    'O': 'https://www.oyakportfoy.com.tr/assets/images/logo.png', // Oyak
    'Q': 'https://www.qnbfinansportfoy.com/assets/images/logo.png', // QNB
    'D': 'https://www.denizportfoy.com.tr/assets/images/logo.png' // Deniz
};

// Fon kodunun ilk harfine bakarak logo bulur
const getFundLogo = (symbol) => {
    if(!symbol) return null;
    const firstChar = symbol.charAt(0).toUpperCase();
    const logo = FUND_LOGOS[firstChar];
    
    // Özel Durumlar (Manuel Düzeltmeler)
    if(symbol.startsWith('TCD')) return 'https://www.tacirlerportfoy.com.tr/assets/img/logo.png'; // Tacirler
    if(symbol.startsWith('MAC')) return 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png';
    
    return logo || null; 
};

// =====================================================
// 1. KAYNAK: İŞ YATIRIM (TEFAS FONLARI)
// =====================================================
async function getTefasFunds() {
    try {
        const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/YatirimFonlari';
        const { data } = await axios.get(url);
        
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
            // BURADA AKILLI FON LOGOSU ÇAĞIRIYORUZ
            image: getFundLogo(item[0]) 
        }));
    } catch (error) {
        console.error("TEFAS Hatası:", error.message);
        return [];
    }
}

// =====================================================
// 2. KAYNAK: TRADINGVIEW (HİSSELER)
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
            // logoid sütununu çekiyoruz
            "columns": ["name", "close", "change", "high", "low", "description", "logoid", "market_cap_basic"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 600]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];

        return data.data.map(item => {
            const d = item.d;
            // TradingView logosu varsa al, yoksa Clearbit'ten domain tahmini yap
            let imageUrl = getLogoUrl(d[6]);
            
            // Yedek Logo Denemesi (BIST şirketleri için .com.tr denemesi)
            if (!imageUrl) {
                // Örn: THYAO -> thyao.com.tr
                // Not: Bu her zaman tutmaz ama "hiç yoktan iyidir" stratejisi
                // imageUrl = `https://logo.clearbit.com/${d[0].toLowerCase()}.com.tr`;
                // Clearbit çok agresif kullanınca bloklayabilir, şimdilik sadece TV logosu ile gidelim.
                // Eğer TV logosu yoksa null dönsün, telefondaki "Harf Kutusu" devreye girsin.
            }

            return {
                id: d[0], symbol: d[0], name: d[5],
                price: d[1] || 0, change24h: d[2] || 0, 
                high24: d[3] || d[1], low24: d[4] || d[1], 
                mcap: d[7] || 0, 
                image: imageUrl,
                type: 'stock', icon: 'finance', color: '#34495E', region: 'TR'
            };
        });
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
            const d = item.d;
            const isEtf = d[7] === 'fund' || d[7] === 'structured';
            
            // ABD için logo stratejisi: TV Logo -> Yoksa Clearbit (Symbol.com)
            let imageUrl = getLogoUrl(d[8]);
            if (!imageUrl) {
                imageUrl = `https://logo.clearbit.com/${d[0].split(':')[0].toLowerCase()}.com`;
            }

            return {
                id: d[0], symbol: d[0].split(':')[1], name: d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: d[1] || 0, change24h: d[2] || 0, 
                high24: d[3] || d[1], low24: d[4] || d[1], 
                mcap: d[6] || 0, 
                image: imageUrl,
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

app.get('/api/all', async (req, res) => {
    try {
        console.log("API isteği alındı...");
        const [tefas, stocks, us, global] = await Promise.all([
            getTefasFunds(),
            getBistStocks(),
            getUSAssets(),
            getForexAndGold()
        ]);
        // Veri birleştirme
        res.json([...global, ...tefas, ...stocks, ...us]);
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Veri alinamadi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
