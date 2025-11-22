const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- 1. DEV FON LİSTESİ (MANUEL LİSTE) ---
// TradingView'e "Bunları bana ver" diyeceğiz. Arada kaynama şansı yok.
const TARGET_FUNDS = [
    // Serbest ve Hisse Fonları
    "BIST:MAC", "BIST:TCD", "BIST:NNF", "BIST:GMR", "BIST:TKF", "BIST:IDH", "BIST:ST1", "BIST:GSP",
    "BIST:HKH", "BIST:BIO", "BIST:MPS", "BIST:MPK", "BIST:IVY", "BIST:YDI", "BIST:RBH", "BIST:SUA",
    "BIST:NRC", "BIST:KTM", "BIST:KMI", "BIST:OTJ", "BIST:TIV", "BIST:BUY", "BIST:HDA", "BIST:HVF",
    // Yabancı ve Teknoloji
    "BIST:AFT", "BIST:YAY", "BIST:AFA", "BIST:TGE", "BIST:TTE", "BIST:IPJ", "BIST:DVH", "BIST:DVT",
    "BIST:OJT", "BIST:GBG", "BIST:TFF", "BIST:YTD", "BIST:GUH", "BIST:MJB", "BIST:IKL",
    // Para Piyasası ve Kısa Vadeli (TLY, HVI burada)
    "BIST:TLY", "BIST:HVI", "BIST:PPN", "BIST:PPZ", "BIST:ZJ1", "BIST:KUB", "BIST:TI1", "BIST:TI2",
    "BIST:TI3", "BIST:III", "BIST:FIL", "BIST:FBA", "BIST:KPF", "BIST:RPD", "BIST:NRN", "BIST:OSD",
    // Altın ve Gümüş
    "BIST:KZL", "BIST:MKG", "BIST:TTA", "BIST:YKT", "BIST:FIB", "BIST:GTZ", "BIST:GUT", "BIST:GGK",
    "BIST:MJG", "BIST:KUT", "BIST:OTA", "BIST:ICA",
    // Katılım ve Diğerleri
    "BIST:KPC", "BIST:KPU", "BIST:KTM", "BIST:MPS", "BIST:ZPE", "BIST:ZPK", "BIST:KCV", "BIST:HKK",
    "BIST:AES", "BIST:ZJL", "BIST:YZH", "BIST:TCA", "BIST:ZHB", "BIST:TDG"
];

// --- LOGO EŞLEŞTİRME ---
const BANK_LOGOS = {
    'A': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/akbank.png',
    'Y': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/yapikredi.png',
    'G': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/garanti.png',
    'T': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png',
    'I': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png',
    'Z': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/ziraat.png',
    'D': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/denizbank.png',
    'H': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/hedef.png',
    'O': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/oyak.png',
    'Q': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/qnb.png',
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png',
    'K': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/kuveyt.png',
    'R': 'https://www.rotaportfoy.com.tr/images/logo.png',
    'S': 'https://www.stratejiportfoy.com.tr/images/logo.png'
};

const getFundLogo = (symbol) => {
    if (!symbol) return null;
    const code = symbol.replace('BIST:', '');
    if (code === 'TCD') return 'https://www.tacirler.com.tr/images/logo.png';
    if (code === 'MAC') return 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png';
    return BANK_LOGOS[code.charAt(0)] || null;
};

const getTvLogo = (logoid) => {
    if (!logoid) return null;
    try { return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`; } catch (e) { return null; }
};

// --- FONKSİYON 1: HEDEF FONLARI ÇEK ---
async function getTargetFunds() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        // Burada "Scanner" değil, direkt sembol listesi gönderiyoruz. Kesin çalışır.
        const body = {
            "symbols": { "tickers": TARGET_FUNDS, "query": { "types": [] } },
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
                image: getFundLogo(symbol)
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 2: BIST HİSSELERİ ---
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
            "range": [0, 600]
        };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];
        return data.data.map(item => {
            const d = item.d;
            return {
                id: d[0], symbol: d[0], name: d[5],
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || 0, low24: d[4] || 0, mcap: d[7] || 0,
                image: getTvLogo(d[6]), type: 'stock', icon: 'finance', color: '#34495E', region: 'TR'
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 3: ABD ---
async function getUSAssets() {
    try {
        const url = 'https://scanner.tradingview.com/america/scan';
        const body = {
            "filter": [{ "left": "type", "operation": "in_range", "right": ["stock", "fund", "dr"] }, { "left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"] }],
            "options": { "lang": "en" },
            "columns": ["name", "close", "change", "high", "low", "description", "market_cap_basic", "type", "logoid"],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "desc" }, "range": [0, 150]
        };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if(!data || !data.data) return [];
        return data.data.map(item => {
            const d = item.d;
            const isEtf = d[7] === 'fund' || d[7] === 'structured';
            return {
                id: d[0], symbol: d[0].split(':')[1], name: d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: d[1] || 0, change24h: d[2] || 0, high24: d[3] || 0, low24: d[4] || 0, mcap: d[6] || 0, 
                image: getTvLogo(d[8]), icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) { return []; }
}

// --- FONKSİYON 4: DÖVİZ ---
async function getForexAndGold() {
    try {
        const url = 'https://scanner.tradingview.com/global/scan';
        const body = { "symbols": { "tickers": ["FX_IDC:USDTRY", "FX_IDC:EURTRY", "TVC:GOLD"], "query": { "types": [] } }, "columns": ["close", "change", "high", "low"] };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if(!data || !data.data) return [];
        const findVal = (ticker) => { const item = data.data.find(i => i.s === ticker); return item ? {p:item.d[0], c:item.d[1], h:item.d[2], l:item.d[3]} : {p:0}; };
        const usd = findVal("FX_IDC:USDTRY"); const eur = findVal("FX_IDC:EURTRY"); const ons = findVal("TVC:GOLD");
        const gram = (ons.p * usd.p) / 31.1035;
        return [
            { id: 'USD', symbol: 'USD', name: 'Dolar/TL', type: 'forex', price: usd.p, change24h: usd.c, high24: usd.h, low24: usd.l, color: '#2ECC71' },
            { id: 'EUR', symbol: 'EUR', name: 'Euro/TL', type: 'forex', price: eur.p, change24h: eur.c, high24: eur.h, low24: eur.l, color: '#3498DB' },
            { id: 'GA', symbol: 'GRAM', name: 'Gram Altın', type: 'gold', price: gram, change24h: ons.c, high24: gram*1.01, low24: gram*0.99, color: '#F1C40F' },
            { id: 'XAU', symbol: 'ONS', name: 'Ons Altın', type: 'gold', price: ons.p, change24h: ons.c, high24: ons.h, low24: ons.l, color: '#D4AC0D' }
        ];
    } catch (error) { return []; }
}

app.get('/api/all', async (req, res) => {
    try {
        const [funds, stocks, us, global] = await Promise.all([
            getTargetFunds(), // GARANTİ FONLAR
            getBistStocks(),
            getUSAssets(),
            getForexAndGold()
        ]);
        res.json([...global, ...funds, ...stocks, ...us]);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
