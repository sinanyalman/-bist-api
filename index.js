const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Sunucu bize bir port verirse onu kullan, yoksa 3000'i kullan
const PORT = process.env.PORT || 3000;

// TradingView'den veri çeken fonksiyon
async function getAllStocks() {
    try {
        const url = 'https://scanner.tradingview.com/turkey/scan';
        
        // TradingView'e "Bana BIST'teki tüm hisseleri ver" diyoruz
        const body = {
            "filter": [
                { "left": "exchange", "operation": "equal", "right": "BIST" },
                { "left": "typespecs", "operation": "has", "right": "common" }
            ],
            "options": { "lang": "tr" },
            "symbols": { "query": { "types": [] }, "tickers": [] },
            "columns": ["name", "close", "change|1d", "high|1d", "low|1d", "description", "volume"],
            "sort": { "sortBy": "name", "sortOrder": "asc" },
            "range": [0, 600] // İlk 600 hisseyi getir (BIST'in tamamı sığar)
        };

        const { data } = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Gelen karışık veriyi bizim uygulamanın anlayacağı hale çeviriyoruz
        const formattedData = data.data.map(item => {
            const d = item.d; // TradingView verileri "d" dizisi içinde gönderir
            return {
                id: d[0],             // Sembol (THYAO)
                symbol: d[0],
                name: d[5],           // Şirket Adı (Türk Hava Yolları...)
                type: 'stock',
                price: d[1],          // Anlık Fiyat
                change24h: d[2],      // Yüzde Değişim
                high24: d[3],         // Günün en yükseği
                low24: d[4],          // Günün en düşüğü
                icon: 'finance',
                color: '#34495E'
            };
        });

        return formattedData;

    } catch (error) {
        console.error("Veri çekme hatası:", error.message);
        return [];
    }
}

app.get('/api/bist', async (req, res) => {
    console.log("Tüm BIST hisseleri çekiliyor...");
    const data = await getAllStocks();
    console.log(`Toplam ${data.length} adet hisse bulundu.`);
    res.json(data);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu çalışıyor!`);
    console.log(`Bilgisayarından: http://localhost:${PORT}/api/bist`);
    // IP adresini hatırlatmak için:
    console.log(`Telefondan erişmek için IP adresini kullanmayı unutma!`);
});