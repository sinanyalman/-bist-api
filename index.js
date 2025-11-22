const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio'); // YENİ KÜTÜPHANE

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- FON LOGOLARI (Manuel) ---
const FUND_LOGOS = {
    'A': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/akbank.png',
    'Y': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/yapikredi.png',
    'G': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/garanti.png',
    'T': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png',
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png',
    'H': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/hedef.png',
    'I': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/isbank.png',
    'Z': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/ziraat.png',
    'D': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/denizbank.png',
    'O': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/oyak.png',
    'Q': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/qnb.png',
    'F': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/qnb.png',
    'R': 'https://www.rotaportfoy.com.tr/images/logo.png',
    'S': 'https://www.stratejiportfoy.com.tr/images/logo.png',
    'K': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/kuveyt.png'
};

const getFundLogo = (symbol) => {
    if(!symbol) return null;
    if(symbol === 'TCD') return 'https://www.tacirler.com.tr/images/logo.png';
    if(symbol === 'MAC') return 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png';
    return FUND_LOGOS[symbol.charAt(0)] || null;
};

const getTvLogo = (logoid) => {
    if (!logoid) return null;
    try { return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${logoid}.svg&w=64&h=64&output=png&q=80`; } catch (e) { return null; }
};

// =====================================================
// 1. TEFAS FONLARI (BLOOMBERG HT SCRAPING) - KESİN ÇÖZÜM
// =====================================================
async function getTefasFunds() {
    try {
        // Bloomberg HT Fon Listesi
        const url = 'https://www.bloomberght.com/fon/liste';
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' } // Tarayıcı taklidi
        });
        
        const $ = cheerio.load(data);
        let funds = [];

        // Tabloyu satır satır oku
        $('tbody tr').each((i, el) => {
            try {
                // BloombergHT tablo yapısına göre verileri çek
                const code = $(el).find('td').eq(0).text().trim(); // Fon Kodu
                const name = $(el).find('td').eq(1).text().trim(); // Fon Adı
                const priceStr = $(el).find('td').eq(2).text().trim(); // Fiyat
                const changeStr = $(el).find('td').eq(3).text().trim(); // Günlük Getiri

                if (code && priceStr) {
                    // Fiyatı sayıya çevir (TR format: 1.234,56 -> 1234.56)
                    const price = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
                    const change = parseFloat(changeStr.replace(/\./g, '').replace(',', '.').replace('%', ''));

                    funds.push({
                        id: code,
                        symbol: code,
                        name: name,
                        price: price || 0,
                        change24h: change || 0,
                        high24: price, // Fonlarda gün içi hareket azdır
                        low24: price,
                        mcap: 0,
                        type: 'fund',
                        region: 'TR',
                        color: '#8E44AD',
                        icon: 'chart-pie',
                        image: getFundLogo(code)
                    });
                }
            } catch (e) { }
        });

        return funds;

    } catch (error) {
        console.error("Bloomberg Scraping Hatası:", error.message);
        return [];
    }
}

// =====================================================
// 2. HİSSELER VE DİĞERLERİ (TRADINGVIEW)
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
            "sort": { "sortBy": "volume", "sortOrder": "desc" },
            "range": [0, 600]
        };
        const { data } = await axios.post(url, body, { timeout: 10000 });
        if (!data || !data.data) return [];
        return data.data.map(item => ({
            id: item.d[0], symbol: item.d[0], name: item.d[5],
            price: item.d[1] || 0, change24h: item.d[2] || 0, high24: item.d[3] || 0, low24: item.d[4] || 0, mcap: item.d[7] || 0,
            image: getTvLogo(item.d[6]), type: 'stock', icon: 'finance', color: '#34495E', region: 'TR'
        }));
    } catch (error) { return []; }
}

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
            const isEtf = item.d[7] === 'fund' || item.d[7] === 'structured';
            return {
                id: item.d[0], symbol: item.d[0].split(':')[1], name: item.d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: item.d[1] || 0, change24h: item.d[2] || 0, high24: item.d[3] || 0, low24: item.d[4] || 0, mcap: item.d[6] || 0,
                image: getTvLogo(item.d[8]), icon: isEtf ? 'layers' : 'google-circles-extended', color: isEtf ? '#E67E22' : '#2980B9'
            };
        });
    } catch (error) { return []; }
}

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
        const [tefas, stocks, us, global] = await Promise.all([
            getTefasFunds(),
            getBistStocks(),
            getUSAssets(),
            getForexAndGold()
        ]);
        res.json([...global, ...tefas, ...stocks, ...us]);
    } catch (error) { res.status(500).json({ error: "Hata" }); }
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
