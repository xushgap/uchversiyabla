const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer}=require('ws');
const BOT=process.env.BOT_TOKEN||'',DEV=process.env.DEV==='1',PORT=process.env.PORT||3000,BOTU=process.env.BOT_USERNAME||'';
// ---- Baza: DATABASE_URL bo'lsa Supabase (Postgres), bo'lmasa mahalliy SQLite ----
const DDL='create table if not exists users(id text primary key,name text,username text,photo text,wins int default 0,losses int default 0,games int default 0)';
let pool=null,sq=null;
if(process.env.DATABASE_URL){const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:5})}
else{const {DatabaseSync}=require('node:sqlite');sq=new DatabaseSync(process.env.DB||path.join(__dirname,'data.db'))}
const UP='insert into users(id,name,username,photo) values(?,?,?,?) on conflict(id) do update set name=excluded.name,username=excluded.username,photo=excluded.photo';
const pg=q=>{let i=0;return q.replace(/\?/g,()=>'$'+(++i))};
const Q={
  init:async()=>{pool?await pool.query(DDL):sq.exec(DDL)},
  get:async id=>pool?(await pool.query('select * from users where id=$1',[id])).rows[0]:sq.prepare('select * from users where id=?').get(id),
  up:async(...a)=>{pool?await pool.query(pg(UP),a):sq.prepare(UP).run(...a)},
  inc:async(id,col)=>{const q=`update users set games=games+1,${col}=${col}+1 where id=?`;pool?await pool.query(pg(q),[id]):sq.prepare(q).run(id)}};
const cache=new Map(),getU=id=>cache.get(id);
function verify(d){ // Telegram initData HMAC tekshiruvi
  if(DEV&&d.startsWith('dev:'))return{id:'dev_'+d.slice(4),first_name:d.slice(4)};
  if(!BOT)return null;
  const p=new URLSearchParams(d),h=p.get('hash');p.delete('hash');
  const s=[...p.entries()].map(([k,v])=>k+'='+v).sort().join('\n');
  const key=crypto.createHmac('sha256','WebAppData').update(BOT).digest();
  const c=crypto.createHmac('sha256',key).update(s).digest('hex');
  if(!h||c.length!==h.length||!crypto.timingSafeEqual(Buffer.from(c),Buffer.from(h)))return null;
  if(Date.now()/1e3-Number(p.get('auth_date'))>86400)return null;
  try{return JSON.parse(p.get('user'))}catch{return null}
}
// ---- O'yin mantig'i (Durak, 36 karta) ----
const rooms=new Map(),byUser=new Map();
function newDeck(){const d=[];for(let s=0;s<4;s++)for(let r=6;r<=14;r++)d.push({r,s});
  for(let i=d.length-1;i>0;i--){const j=crypto.randomInt(i+1);[d[i],d[j]]=[d[j],d[i]]}return d}
const nextA=(r,i)=>{const n=r.players.length;for(let k=1;k<=n;k++){const j=(i+k)%n;if(r.players[j].hand.length)return j}return -1};
function refill(r){const n=r.players.length,o=[r.att];
  for(let k=1;k<n;k++){const j=(r.att+k)%n;if(j!==r.def)o.push(j)}o.push(r.def);
  for(const i of o){const h=r.players[i].hand;while(h.length<6&&r.deck.length)h.push(r.deck.shift())}}
function startGame(r){r.deck=newDeck();r.trump=r.deck[r.deck.length-1];r.table=[];r.status='play';r.loser=null;
  r.players.forEach(p=>p.hand=r.deck.splice(0,6));
  let best=99,att=0;r.players.forEach((p,i)=>p.hand.forEach(c=>{if(c.s===r.trump.s&&c.r<best){best=c.r;att=i}}));
  r.att=att;r.def=nextA(r,att)}
function finish(r,loser){r.status='done';r.loser=loser===undefined?null:loser;
  r.players.forEach((p,i)=>{const col=i===loser?'losses':'wins',u=getU(p.id);if(u){u.games++;u[col]++}Q.inc(p.id,col).catch(console.error)})}
function endRound(r,took){const p=r.players;
  if(took)p[r.def].hand.push(...r.table.flatMap(x=>x.d?[x.a,x.d]:[x.a]));
  r.table=[];refill(r);
  const alive=p.map((x,i)=>x.hand.length?i:-1).filter(i=>i>=0);
  if(alive.length<=1&&!r.deck.length)return finish(r,alive[0]);
  r.att=(!took&&p[r.def].hand.length)?r.def:nextA(r,r.def);r.def=nextA(r,r.att)}
const beats=(r,c,a)=>(c.s===a.s&&c.r>a.r)||(c.s===r.trump.s&&a.s!==r.trump.s);
function act(r,pi,m){const p=r.players[pi];
  if(r.status!=='play')throw'O\'yin faol emas';
  if(m.t==='att'){const c=p.hand[m.c];if(!c)throw'Karta topilmadi';
    if(pi===r.def)throw'Siz himoyalanyapsiz';
    if(!r.table.length&&pi!==r.att)throw'Birinchi hujum navbati sizniki emas';
    if(r.table.length>=6||r.table.filter(x=>!x.d).length>=r.players[r.def].hand.length)throw'Ko\'proq tashlab bo\'lmaydi';
    if(r.table.length&&!r.table.some(x=>x.a.r===c.r||(x.d&&x.d.r===c.r)))throw'Qiymat stolda yo\'q';
    r.table.push({a:p.hand.splice(m.c,1)[0],d:null})}
  else if(m.t==='def'){if(pi!==r.def)throw'Siz himoyachi emassiz';
    const c=p.hand[m.c],x=r.table[m.k];if(!c||!x||x.d)throw'Noto\'g\'ri harakat';
    if(!beats(r,c,x.a))throw'Bu karta yopa olmaydi';x.d=p.hand.splice(m.c,1)[0];
    if(!p.hand.length&&r.table.every(x=>x.d))endRound(r,false)}
  else if(m.t==='take'){if(pi!==r.def||!r.table.some(x=>!x.d))throw'Olib bo\'lmaydi';endRound(r,true)}
  else if(m.t==='pass'){if(pi!==r.att||!r.table.length||r.table.some(x=>!x.d))throw'Hozir "Bito" mumkin emas';endRound(r,false)}
}
// ---- Tarmoq ----
const send=(ws,o)=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
const pub=p=>({id:p.id,name:p.name,photo:p.photo,n:p.hand.length,on:!!p.ws&&p.ws.readyState===1});
function push(r){r.players.forEach((p,i)=>send(p.ws,{t:'room',s:{code:r.code,status:r.status,host:r.host,you:i,
  players:r.players.map(pub),hand:p.hand,deck:r.deck.length,trump:r.trump,table:r.table,att:r.att,def:r.def,loser:r.loser}}))}
function sendMe(ws){send(ws,{t:'me',u:getU(ws.uid),bot:BOTU})}
function leave(ws,forfeit){const r=rooms.get(byUser.get(ws.uid));if(!r)return;
  const i=r.players.findIndex(p=>p.id===ws.uid);if(i<0)return;
  if(r.status==='play'&&forfeit){finish(r,i)}
  else if(r.status==='play'){r.players[i].ws=null;return push(r)}
  if(r.status!=='play'&&r.status!=='done'||forfeit){}
  byUser.delete(ws.uid);send(ws,{t:'left'});
  if(r.status==='lobby'||r.status==='done'){r.players.splice(i,1);
    if(!r.players.length)return rooms.delete(r.code);if(r.host===ws.uid)r.host=r.players[0].id}
  else r.players[i].ws=null;
  if(r.players.every(p=>!p.ws))return rooms.delete(r.code),r.players.forEach(p=>byUser.delete(p.id));
  push(r);sendMe(ws)}
function join(ws,code){const r=rooms.get(String(code).toUpperCase());if(!r)throw'Xona topilmadi';
  if(byUser.has(ws.uid)){const cur=rooms.get(byUser.get(ws.uid));if(cur===r)return push(r);leave(ws,false)}
  if(r.status!=='lobby')throw'O\'yin allaqachon boshlangan';if(r.players.length>=4)throw'Xona to\'lgan';
  const u=getU(ws.uid);r.players.push({id:u.id,name:u.name,photo:u.photo,hand:[],ws});byUser.set(u.id,r.code);push(r)}
const server=http.createServer((q,res)=>{
  let f=q.url.split('?')[0];f=f==='/'?'/index.html':f;const fp=path.join(__dirname,'public',path.normalize(f));
  if(!fp.startsWith(path.join(__dirname,'public'))||!fs.existsSync(fp))return res.writeHead(404).end();
  res.writeHead(200,{'Content-Type':{'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(fp)]||'application/octet-stream'});
  fs.createReadStream(fp).pipe(res)});
const wss=new WebSocketServer({server,maxPayload:4096});
wss.on('connection',ws=>{
  ws.on('message',async raw=>{try{const m=JSON.parse(raw);
    if(m.t==='auth'){const u=verify(String(m.initData||''));if(!u)throw'Telegram orqali oching (autentifikatsiya xatosi)';
      const id=String(u.id),name=[u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||'O\'yinchi';
      await Q.up(id,name,u.username||'',u.photo_url||'');cache.set(id,await Q.get(id));
      ws.uid=id;sendMe(ws);const r=rooms.get(byUser.get(id));
      if(r){const p=r.players.find(p=>p.id===id);if(p){if(p.ws&&p.ws!==ws)p.ws.close();p.ws=ws;push(r)}}return}
    if(!ws.uid)throw'Avval kiring';
    if(m.t==='create'){if(byUser.has(ws.uid))leave(ws,false);
      let code;do code=crypto.randomBytes(3).toString('hex').toUpperCase();while(rooms.has(code));
      rooms.set(code,{code,host:ws.uid,players:[],status:'lobby',deck:[],table:[]});join(ws,code)}
    else if(m.t==='join')join(ws,m.code);
    else if(m.t==='leave')leave(ws,true);
    else{const r=rooms.get(byUser.get(ws.uid));if(!r)throw'Xonada emassiz';const pi=r.players.findIndex(p=>p.id===ws.uid);
      if(m.t==='start'){if(r.host!==ws.uid)throw'Faqat xona egasi boshlay oladi';if(r.players.length<2)throw'Kamida 2 o\'yinchi kerak';
        if(r.status==='play')throw'Allaqachon boshlangan';startGame(r)}
      else if(m.t==='again'){if(r.host!==ws.uid||r.status!=='done')throw'Mumkin emas';r.status='lobby';r.players.forEach(p=>p.hand=[]);r.table=[];r.deck=[]}
      else act(r,pi,m);
      push(r);if(r.status==='done')r.players.forEach(p=>p.ws&&sendMe(p.ws))}
  }catch(e){send(ws,{t:'err',m:typeof e==='string'?e:'Xatolik'})}});
  ws.on('close',()=>{if(ws.uid)leave(ws,false)})});
Q.init().then(()=>server.listen(PORT,()=>console.log('UzbeCards http://localhost:'+PORT+(DEV?' (DEV)':'')+(pool?' [Supabase]':' [SQLite]'))));
