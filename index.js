const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- 1. LOGO SİHİRBAZI (BANKALAR VE KURUMLAR) ---
// Fon kodunun ilk harfinden veya özel kodlardan logo bulur
const COMPANY_LOGOS = {
    // Bankalar & Portföy Yönetim Şirketleri
    'A': 'https://raw.githubusercontent.com/paramla-app/assets/main/logos/akbank.png', // Ak (Geçici link, aşağıda orjinaller var)
    'Y': 'https://www.ykyatirim.com.tr/assets/images/logo.png', // Yapı Kredi
    'G': 'https://www.garantibbva.com.tr/assets/images/logo.png', // Garanti
    'T': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İş Portföy
    'I': 'https://www.isportfoy.com.tr/assets/images/logo.png', // İş
    'Z': 'https://www.ziraatportfoy.com.tr/assets/images/logo.png', // Ziraat
    'D': 'https://www.denizportfoy.com.tr/assets/images/logo.png', // Deniz
    'H': 'https://www.hedefportfoy.com.tr/images/logo.png', // Hedef
    'O': 'https://www.oyakportfoy.com.tr/assets/images/logo.png', // Oyak
    'Q': 'https://www.qnbfinansportfoy.com/assets/images/logo.png', // QNB
    'F': 'https://www.qnbfinansportfoy.com/assets/images/logo.png', // Finans
    'M': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png', // Marmara (MAC)
    'K': 'https://www.kuveytturk.com.tr/assets/img/logo.png', // Kuveyt
    'V': 'https://www.vakifportfoy.com.tr/assets/img/logo.png', // Vakıf
    'E': 'https://www.teb.com.tr/frontend/teb_v2/img/teb_logo_tr.png', // TEB (Bazen E ile başlar)
};

// Özel Fon Logoları (Kod bazlı)
const SPECIAL_LOGOS = {
    'MAC': 'https://marmaracapital.com.tr/wp-content/uploads/2020/03/marmara-capital-logo.png',
    'TCD': 'https://www.tacirler.com.tr/images/logo.png',
    'GMR': 'https://www.garantibbva.com.tr/assets/images/logo.png',
    'AFT': 'https://www.akportfoy.com.tr/assets/img/header/logo.png',
    'YAY': 'https://www.ykyatirim.com.tr/assets/images/logo.png',
    'IPJ': 'https://www.isportfoy.com.tr/assets/images/logo.png',
    'NNF': 'https://www.hedefportfoy.com.tr/images/logo.png'
};

const getSmartLogo = (symbol, type, tvLogoId) => {
    // 1. Öncelik: Özel Fon Kodları (MAC, TCD...)
    if (SPECIAL_LOGOS[symbol]) return SPECIAL_LOGOS[symbol];

    // 2. Öncelik: Fon ise İlk Harften Banka Logosu Bul
    if (type === 'fund') {
        const firstChar = symbol.charAt(0);
        // Ak Portföy (A ile başlar)
        if (firstChar === 'A') return 'https://www.akportfoy.com.tr/assets/img/header/logo.png';
        if (COMPANY_LOGOS[firstChar]) return COMPANY_LOGOS[firstChar];
    }

    // 3. Öncelik: TradingView Logosu (Varsa)
    if (tvLogoId) {
        try {
            return `https://images.weserv.nl/?url=s3-symbol-logo.tradingview.com/${tvLogoId}.svg&w=64&h=64&output=png&q=80`;
        } catch (e) {}
    }

    // 4. Öncelik: Hisse Senedi ise Clearbit Domain Tahmini
    if (type === 'stock') {
        // THYAO -> thyao.com (Bazen tutar bazen tutmaz ama denemeye değer)
        // Logosu olmayanlar için boş dönelim, telefonda harf gösterilsin.
        return null;
    }

    return null;
};

// =====================================================
// 1. TÜM TÜRKİYE PİYASASI (HİSSE + FONLAR)
// =====================================================
async function getTurkeyAssets() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        // FİLTRE YOK! Sadece Türkiye olsun yeter.
        const body = {
            "filter": [], 
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            "columns": [
                "name", "close", "change", "high", "low", "description", 
                "type", "subtype", "logoid", "market_cap_basic", "exchange"
            ],
            // Hacme göre değil isme göre sıralayalım ki fonlar arada kaybolmasın
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 4000] // LİMİTİ MAX YAPTIK (BIST + FONLAR SIĞSIN)
        };

        const { data } = await axios.post(url, body, { timeout: 20000 });
        
        let stocks = [];
        let funds = [];

        if (data && data.data) {
            data.data.forEach(item => {
                const d = item.d;
                const symbol = d[0];
                const type = d[6];
                const subtype = d[7];
                const logoid = d[8];
                const desc = d[5] || "";

                // Temel veri objesi
                const asset = {
                    id: symbol,
                    symbol: symbol,
                    name: desc, // Uzun isim
                    price: d[1] || 0,
                    change24h: d[2] || 0,
                    high24: d[3] || d[1],
                    low24: d[4] || d[1],
                    mcap: d[9] || 0,
                    region: 'TR'
                };

                // --- AYRIŞTIRMA ---
                
                // A) HİSSE SENETLERİ
                if (type === 'stock' && subtype === 'common') {
                    asset.type = 'stock';
                    asset.icon = 'finance';
                    asset.color = '#34495E';
                    asset.image = getSmartLogo(symbol, 'stock', logoid);
                    stocks.push(asset);
                }
                // B) FONLAR (TEFAS)
                // Fonları yakalamak için tüm olasılıkları deniyoruz
                else if (
                    type === 'fund' || 
                    subtype === 'mutual' || 
                    subtype === 'etf' ||
                    // Eğer tipi belirsizse ama ismi 3 harfliyse ve açıklamasında "FON" geçiyorsa
                    (symbol.length === 3 && desc.includes('FON'))
                ) {
                    asset.type = 'fund';
                    asset.icon = 'chart-pie';
                    asset.color = '#8E44AD';
                    asset.image = getSmartLogo(symbol, 'fund', logoid);
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
            "range": [0, 150]
        };

        const { data } = await axios.post(url, body, { timeout: 15000 });
        if(!data || !data.data) return [];

        return data.data.map(item => {
            const d = item.d;
            const isEtf = d[7] === 'fund' || d[7] === 'structured';
            return {
                id: d[0], symbol: d[0].split(':')[1], name: d[5],
                type: isEtf ? 'etf-us' : 'stock-us', region: 'US',
                price: d[1] || 0, change24h: d[2] || 0, 
                high24: d[3] || d[1], low24: d[4] || d[1], mcap: d[6] || 0, 
                image: getSmartLogo(d[0].split(':')[1], 'stock-us', d[8]),
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
        console.log("Tüm veriler çekiliyor...");
        const [turkeyAssets, us, global] = await Promise.all([
            getTurkeyAssets(),
            getUSAssets(),
            getForexAndGold()
        ]);
        
        // Birleştirme
        const { stocks, funds } = turkeyAssets;
        console.log(`Hisse: ${stocks.length}, Fon: ${funds.length}`);

        res.json([...global, ...stocks, ...funds, ...us]);
    } catch (error) {
        console.error("API Hatası:", error);
        res.status(500).json({ error: "Veri hatasi" });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu calisiyor: ${PORT}`);
});
