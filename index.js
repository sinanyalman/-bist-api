const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- 1. VIP FON LİSTESİ (KAYIP FONLARI ENGELLEMEK İÇİN) ---
// TradingView taramasında çıkmayanları buraya ekleyerek zorla getiriyoruz.
const VIP_FUNDS = [
    "BIST:TLY", "BIST:HVI", "BIST:ADY", "BIST:IPV", "BIST:TCD", "BIST:MAC", 
    "BIST:AFT", "BIST:YAY", "BIST:AFA", "BIST:IPJ", "BIST:NNF", "BIST:GMR",
    "BIST:TI2", "BIST:TI3", "BIST:KZL", "BIST:AES", "BIST:RPD", "BIST:YAS",
    "BIST:ZJ1", "BIST:KUB", "BIST:TKF", "BIST:IDH", "BIST:UPH", "BIST:GSP",
    "BIST:HKH", "BIST:BIO", "BIST:TDG", "BIST:MPS", "BIST:MPK", "BIST:IVY"
];

// --- 2. LOGO EŞLEŞTİRME TABLOSU ---
const BANK_LOGOS = {
    'A': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/akbank.png', // Ak
    'Y': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/yapikredi.png', // Yapı Kredi
    'G': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/garanti.png', // Garanti
    'T': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png', // İş / Tacirler
    'I': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png', // İş
    'Z': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/ziraat.png', // Ziraat
    'D': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/denizbank.png', // Deniz
    'H': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/hedef.png', // Hedef
    'O': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/oyak.png', // Oyak
    'Q': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/qnb.png', // QNB
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png', // Marmara
    'K': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/kuveyt.png' // Kuveyt
};

// Akıllı Fon Logo Seçici
const getFundLogo = (symbol) => {
    if (!symbol) return null;
    const cleanSym = symbol.replace('BIST:', '');
    
    // Özel Logolar
    if (cleanSym === 'MAC') return BANK_LOGOS.M;
    if (cleanSym === 'TCD') return 'https://www.tacirler.com.tr/images/logo.png';
    
    // İlk harfe göre banka logosu (YAY -> Y -> Yapı Kredi)
    return BANK_LOGOS[cleanSym.charAt(0)] || null;
};

// TradingView Logo Dönüştürücü
const getTvLogo = (logoid) => {
    if (!logoid) return null;
    try { return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`; } catch (e) { return null; }
};

// --- FONKSİYON 1: VIP FONLARI ÇEK (MANUEL LİSTE) ---
async function getVipFunds() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "symbols": { "tickers": VIP_FUNDS, "query": { "types": [] } },
            "columns": ["name", "close", "change", "high", "low", "description", "type", "subtype"]
        };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];

        return data.data.map(item => {
            const d = item.d;
            const symbol = d[0].replace('BIST:', '');
            return {
                id: symbol, symbol: symbol, name: d[5],
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || d[1], low24: d[4] || d[1],
                mcap: 0, type: 'fund', region: 'TR', color: '#8E44AD',
                image: getFundLogo(symbol) // Logoyu ekledik
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 2: TÜM FONLARI TARA (GENEL TARAMA) ---
async function getAllFunds() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                // Fon tiplerini genişlettik
                { "left": "type", "operation": "in_range", "right": ["fund", "mutual", "structured", "etf", "unit"] }
            ],
            "options": { "lang": "tr" },
            "columns": ["name", "close", "change", "high", "low", "description", "type", "subtype"],
            "sort": { "sortBy": "name", "sortOrder": "asc" }, // İsme göre sırala ki kaybolmasın
            "range": [0, 600]
        };

        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];

        return data.data.map(item => {
            const d = item.d;
            return {
                id: d[0], symbol: d[0], name: d[5],
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || d[1], low24: d[4] || d[1],
                mcap: 0, type: 'fund', region: 'TR', color: '#8E44AD',
                image: getFundLogo(d[0])
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 3: BIST HİSSELERİ ---
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
            "sort": { "sortBy": "volume", "sortOrder": "desc" },
            "range": [0, 500]
        };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];
        return data.data.map(item => {
            const d = item.d;
            return {
                id: d[0], symbol: d[0], name: d[5],
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || d[1], low24: d[4] || d[1], mcap: d[7] || 0,
                image: getTvLogo(d[6]), type: 'stock', color: '#34495E', region: 'TR'
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 4: ABD VE DÖVİZ ---
async function getGlobalAssets() {
    try {
        // ABD ve Döviz kodlarını buraya sıkıştırıyorum (kısalık için)
        const urlUS = 'https://scanner.tradingview.com/america/scan';
        const bodyUS = {
            "filter": [{ "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] }, { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }],
            "options": { "lang": "en" }, "columns": ["name", "close", "change", "high", "low", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, "range": [0, 150]
        };
        
        const urlFX = 'https://scanner.tradingview.com/global/scan';
        const bodyFX = { "symbols": { "tickers": ["FX_IDC:USDTRY", "FX_IDC:EURTRY", "TVC:GOLD"], "query": { "types": [] } }, "columns": ["close", "change", "high", "low"] };

        const [resUS, resFX] = await Promise.all([
            axios.post(urlUS, bodyUS, { timeout: 10000 }),
            axios.post(urlFX, bodyFX, { timeout: 10000 })
        ]);

        const usData = (resUS.data.data || []).map(item => {
            const isEtf = item.d[7] === 'fund' || item.d[7] === 'structured';
            return {
                id: item.d[0], symbol: item.d[0].split(':')[1], name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: item.d[1] || 0, change24h: item.d[2] || 0, high24: item.d[3] || 0, low24: item.d[4] || 0, mcap: item.d[6] || 0,
                image: getTvLogo(item.d[8]), icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });

        const fxItems = resFX.data.data || [];
        const findVal = (ticker) => { const i = fxItems.find(x => x.s === ticker); return i ? {p: i.d[0], c: i.d[1], h: i.d[2], l: i.d[3]} : {p:0,c:0}; };
        const usd = findVal("FX_IDC:USDTRY"); const eur = findVal("FX_IDC:EURTRY"); const ons = findVal("TVC:GOLD");
        const gram = (ons.p * usd.p) / 31.1035;

        const fxData = [
            { id: 'USD', symbol: 'USD', name: 'Dolar/TL', type: 'forex', price: usd.p, change24h: usd.c, high24: usd.h, low24: usd.l, color: '#2ECC71' },
            { id: 'EUR', symbol: 'EUR', name: 'Euro/TL', type: 'forex', price: eur.p, change24h: eur.c, high24: eur.h, low24: eur.l, color: '#3498DB' },
            { id: 'GA', symbol: 'GRAM', name: 'Gram Altın', type: 'gold', price: gram, change24h: ons.c, high24: gram*1.01, low24: gram*0.99, color: '#F1C40F' },
            { id: 'XAU', symbol: 'ONS', name: 'Ons Altın', type: 'gold', price: ons.p, change24h: ons.c, high24: ons.h, low24: ons.l, color: '#D4AC0D' }
        ];

        return [...fxData, ...usData];

    } catch (e) { return []; }
}

// --- ANA ENDPOINT ---
app.get('/api/all', async (req, res) => {
    try {
        const [vipFunds, allFunds, stocks, global] = await Promise.all([
            getVipFunds(),
            getAllFunds(),
            getBistStocks(),
            getGlobalAssets()
        ]);

        // Fonları birleştir (VIP liste + Genel tarama) ve tekrarları temizle
        const uniqueFunds = Array.from(new Map([...allFunds, ...vipFunds].map(item => [item.id, item])).values());

        res.json([...global, ...stocks, ...uniqueFunds]);
    } catch (error) {
        res.status(500).json({ error: "Sunucu hatasi" });
    }
});

app.listen(PORT, () => console.log(`Sunucu calisiyor: ${PORT}`));
