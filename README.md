# UzbeCards — Telegram Mini App (Durak)
Stack: Node.js + ws (real-time) + SQLite (node:sqlite). O'yin mantig'i to'liq serverda; mijoz faqat o'z qo'lini ko'radi.

## Ishga tushirish
1. `npm install`
2. Mahalliy sinov (Telegramsiz): `DEV=1 node server.js`, so'ng ikki brauzer oynasida `http://localhost:3000/?u=Ali` va `/?u=Vali` oching.
3. Production: HTTPS domenda `BOT_TOKEN=... BOT_USERNAME=... node server.js` (wss uchun HTTPS shart).
4. @BotFather → /newapp (yoki Menu Button) orqali Mini App URL'ini ulang. Taklif havolasi: `t.me/<bot>?startapp=<KOD>`.
**DEV=1 ni production'da ishlatmang** — u initData tekshiruvini o'chiradi.

## Qoidalar
2–4 o'yinchi, 36 karta, kozir, eng kichik kozirli o'yinchi boshlaydi; hujum/yopish/olish/bito; 6 ta kartagacha tashlash; so'nggi qolgan — durak. G'alaba/mag'lubiyat/o'yinlar bazaga yoziladi.

## Supabase (ixtiyoriy, production uchun tavsiya)
Hosting (Render/Railway/Fly) diski vaqtincha bo'lishi mumkin, shunda SQLite statistikasi yo'qoladi. Supabase ulash uchun:
1. `supabase.sql` ni SQL Editor'da ishga tushiring.
2. Project Settings → Database → Connection string (Session pooler) ni `DATABASE_URL` ga qo'ying (`.env.example` ga qarang).
`DATABASE_URL` bo'lmasa server avtomatik SQLite'dan foydalanadi. Real-time o'yin Supabase'siz, serverning o'z WebSocket'i orqali ishlaydi.
