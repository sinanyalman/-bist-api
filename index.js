const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- FON LOGOLARI (Manuel Eşleştirme) ---
const FUND_LOGOS = {
    'A': 'https://www.akportfoy.com.tr/assets/img/header/logo.png', // Ak
    'Y': 'https://www.ykyatirim.com.tr/assets/images/logo.png', // Yapı Kredi
    'G': 'https://www.garantibbva.com.tr/assets/images/logo.png', // Garanti
    'T': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İş / Tacirler
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png', // Marmara
    'H': 'https://www.hedefportfoy.com.tr/images/logo.png', // Hedef
    'I': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İstanbul
    'Z': 'https://www.ziraatportfoy.com.tr/assets/images/logo.png', // Ziraat
    'O': 'https://www.oyakportfoy.com.tr/assets/images/logo.png', // Oyak
    'Q': 'https://www.qnbfinansportfoy.com/assets/images/logo.png', // QNB
    'D': 'https://www.denizportfoy.com.tr/assets/images/logo.png' // Deniz
};

const getLogoUrl = (logoid) => {
    if (!logoid) return null;
    try { return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`; } catch (e) { return null; }
};

const getFundLogo = (symbol) => {
    if(!symbol) return null;
    // Özel Fonlar
    if(symbol === 'TCD') return 'https://www.tacirler.com.tr/images/logo.png';
    if(symbol === 'MAC') return 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png';
    // Genel Banka Logoları
    return FUND_LOGOS[symbol.charAt(0)] || null;
};

// =====================================================
// 1. TÜM TÜRKİYE PİYASASI (TEK İSTEK - 3000 VARLIK)
// =====================================================
async function getAllTurkeyAssets() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [{ "left": "exchange", "operation": "equal", "right": "BIST" }],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            // subtype, type ve description alanlarını kullanarak ayrıştıracağız
            "columns": ["name", "close", "change", "high", "low", "description", "type", "subtype", "logoid", "market_cap_basic"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 3000] // LİMİTİ SONUNA KADAR AÇTIK
        };

        const { data } = await axios.post(url, body, { timeout: 20000 }); // Timeout'u artırdık
        
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
                    id: symbol,
                    symbol: symbol,
                    name: d[5],
                    price: d[1] || 0,
                    change24h: d[2] || 0,
                    high24: d[3] || d[1],
                    low24: d[4] || d[1],
                    mcap: d[9] || 0,
                    region: 'TR'
                };

                // --- AYRIŞTIRMA MANTIĞI ---
                
                // 1. HİSSE SENETLERİ
                if (type === 'stock' && subtype === 'common') {
                    asset.type = 'stock';
                    asset.icon = 'finance';
                    asset.color = '#34495E';
                    asset.image = getLogoUrl(d[8]);
                    stocks.push(asset);
                } 
                // 2. FONLAR (TEFAS)
                // Fonlar genelde 3 harflidir (örn: MAC, TCD) VE type='fund' veya subtype='mutual' olur.
                // Ayrıca açıklamada "FON" kelimesi geçer.
                else if (
                    (type === 'fund' || subtype === 'mutual' || subtype === 'etf') || 
                    (symbol.length === 3 && desc.includes('FON')) 
                ) {
                    asset.type = 'fund';
                    asset.icon = 'chart-pie';
                    asset.color = '#8E44AD';
                    asset.image = getFundLogo(symbol); // Fon logosu ata
                    funds.push(asset);
                }
            });
        }
        return { stocks, funds };

    } catch (error) {
        console.error("Türkiye Verisi Hatası:", error.message);
        return { stocks: [], funds: [] };
    }
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

        const { data } = await axios.post(url, body, { timeout: 15000 });
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

// --- ENDPOINT ---
app.get('/api/all', async (req, res) => {
    try {
        console.log("Veriler isteniyor...");
        const [turkeyAssets, us, global] = await Promise.all([
            getAllTurkeyAssets(),
            getUSAssets(),
            getForexAndGold()
        ]);
        
        // Türkiye verisini Hisse ve Fon olarak ayırıp birleştiriyoruz
        const { stocks, funds } = turkeyAssets;
        console.log(`Hisse: ${stocks.length}, Fon: ${funds.length}`);

        res.json([...global, ...stocks, ...funds, ...us]);
    } catch (error) {
        console.error("API Hatası:", error);
        res.status(500).json({ error: "Sunucu hatasi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
