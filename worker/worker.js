// ShortsFire Clean Infinite — single Cloudflare Worker + Turso
// Clean rewrite: strict Shorts, Hindi-focused, category-balanced, mood + keyword algorithm, low calls.
// Required secrets/vars: YOUTUBE_API_KEY, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
// Optional: CRON_SECRET


const CATEGORIES = {
  trending: 'trending viral #Shorts Hindi',
  comedy: 'funny comedy #Shorts Hindi',
  hindi_film_comedy: 'Hindi film comedy scenes #Shorts Bollywood comedy',
  comedy_quotes: 'comedy quotes #Shorts Hindi funny status',
  public_comedy: 'public comedy clean #Shorts Hindi funny',
  peaceful_piano: 'peaceful piano music #Shorts relaxing calm',
  aura_music: 'aura relaxing music #Shorts peaceful meditation',
  old_songs: 'old Hindi songs #Shorts evergreen Bollywood',
  music: 'Hindi songs #Shorts music status',
  tech: 'tech facts gadgets #Shorts Hindi',
  travel: 'travel places #Shorts Hindi India',
  facts: 'amazing facts #Shorts Hindi mindblowing',
  science: 'science facts #Shorts Hindi',
  sports: 'sports motivation #Shorts Hindi',
  motivation: 'Hindi motivation #Shorts success life motivational speech',
  psychology: 'human psychology facts #Shorts Hindi mind tricks',
  psychology_tricks: 'psychology tricks facts #Shorts Hindi human behavior',
  dark_psychology: 'dark psychology awareness #Shorts Hindi human behavior',
  manipulation_awareness: 'manipulation psychology awareness #Shorts Hindi toxic people',
  dark_life_truths: 'dark life truths #Shorts Hindi reality psychology',
  bhakti: 'bhakti devotional #Shorts Hindi spiritual',
  geeta: 'Bhagavad Gita gyan #Shorts Krishna Hindi',
  bhajans: 'bhajan kirtan devotional #Shorts Hindi',
  pravachan: 'pravachan spiritual gyan #Shorts Hindi satsang',
  katha: 'katha pravachan #Shorts Hindi bhagwat ram katha',
  ramayan: 'Ramayan katha #Shorts Hindi shri ram gyan',
  mahabharat: 'Mahabharat gyan #Shorts Hindi Krishna Arjun',
  krishna: 'Shri Krishna gyan #Shorts Hindi bhakti',
  radhakrishna_serial: 'RadhaKrishna TV serial all episodes #Shorts Hindi Star Bharat Radha Krishna',
  hanuman: 'Hanuman ji bhakti #Shorts Hindi spiritual',
  life_lessons: 'life lessons Hindi #Shorts wisdom success',
  sad_songs: 'sad songs emotional #Shorts Hindi',
  heartbreak: 'heartbreak sad status #Shorts Hindi emotional',
  shayari: 'shayari #Shorts Hindi emotional attitude',
  attitude: 'attitude status #Shorts Hindi swag',
  attitude_songs: 'attitude songs #Shorts Hindi status swag',
  dialogue_status: 'dialogue status #Shorts Hindi attitude',
  devotion: 'devotion devotional status #Shorts Hindi bhakti',
  spiritual_quotes: 'spiritual quotes #Shorts Hindi gyan'
};

const QUERY_VARIANTS = {
  comedy: ['funny comedy #Shorts Hindi', 'Hindi comedy shorts funny clean', 'desi comedy #Shorts Hindi'],
  hindi_film_comedy: ['Hindi film comedy scenes #Shorts Bollywood comedy', 'Bollywood comedy scene #Shorts Hindi', 'old Hindi movie comedy #Shorts'],
  public_comedy: ['public comedy clean #Shorts Hindi funny', 'clean public reaction comedy #Shorts Hindi'],
  motivation: ['Hindi motivation #Shorts success life motivational speech', 'motivational speech Hindi #Shorts', 'success mindset #Shorts Hindi'],
  psychology: ['human psychology facts #Shorts Hindi mind tricks', 'human behaviour psychology #Shorts Hindi', 'psychology facts Hindi Shorts'],
  dark_psychology: ['dark psychology awareness #Shorts Hindi human behavior', 'dark psychology facts Hindi Shorts awareness'],
  dark_life_truths: ['dark life truths #Shorts Hindi reality psychology', 'life reality truth Hindi #Shorts', 'hard life truth #Shorts Hindi'],
  bhakti: ['bhakti devotional #Shorts Hindi spiritual', 'Hindi bhakti shorts devotional', 'sanatan bhakti #Shorts Hindi'],
  geeta: ['Bhagavad Gita gyan #Shorts Krishna Hindi', 'Geeta life lessons #Shorts Hindi', 'Krishna Arjun Geeta updesh #Shorts Hindi'],
  katha: ['katha pravachan #Shorts Hindi bhagwat ram katha', 'bhagwat katha #Shorts Hindi', 'ram katha #Shorts Hindi'],
  radhakrishna_serial: ['RadhaKrishna TV serial all episodes #Shorts Hindi Star Bharat Radha Krishna', 'Radha Krishna serial #Shorts Hindi', 'RadhaKrishna episode shorts Hindi'],
  sad_songs: ['sad songs emotional #Shorts Hindi', 'sad status Hindi #Shorts emotional', 'heart touching sad song #Shorts Hindi'],
  shayari: ['shayari #Shorts Hindi emotional attitude', 'Hindi shayari shorts emotional', 'deep shayari #Shorts Hindi'],
  attitude: ['attitude status #Shorts Hindi swag', 'attitude dialogue #Shorts Hindi', 'swag attitude status Hindi Shorts'],
  peaceful_piano: ['peaceful piano music #Shorts relaxing calm', 'relaxing piano shorts peaceful', 'calm piano music #Shorts'],
  old_songs: ['old Hindi songs #Shorts evergreen Bollywood', 'evergreen Hindi songs #Shorts', 'old Bollywood songs shorts']
};

const EXCLUDED_CATEGORIES = new Set(['gaming','fitness','diy','art','dance','sufi','cooking','fashion','romantic','love_songs','chanakya','news','animals']);
const BLOCKED_TEXT_TERMS = [
  'sex','sexy','hot girl','hot girls','bikini','bold','18+','kiss','gf','bf','girlfriend','boyfriend','crush','adult',
  'muslim','islam','islamic','allah','quran','qur\'an','hadith','namaz','roza','ramzan','ramadan','eid','muhammad','mohammad','madina','mecca','makkah','masjid','dargah','hijab','naat','sufi','qawwali','kawwali','kabbali','qabbali',
  'urdu','اردو','pakistan status','pakistani status','indonesia','indonesian','bahasa','bahasa indonesia','viral indo','status indo','malaysia','malayalam','tamil','telugu','kannada','bengali','bangla','filipino','tagalog','thai','korean','japanese','russian','spanish','portuguese','turkish','arabic'
];

const YT_DAILY_QUOTA_UNITS = 10000;
const YT_SEARCH_COST = 100;
const YT_VIDEOS_COST = 1;
const YT_QUOTA_SAFETY_UNITS = 500;
const MAX_SEARCH_CALLS_PER_COLLECT = 1;
const RSS_CHANNELS_PER_COLLECT = 2;
const FEED_PAGE_SIZE_MAX = 90;
const SF_READ_MEMO = new Map();
let tgAutoInFlight = false;   // traffic-driven pipeline (cron ke bina bhi chalega)
let tgAutoCheckAt = 0;

const MAX_VIDEOS_IN_DB = 100000;
const MAX_CHANNELS_IN_DB = 25000;
const MAX_WATCHED_PER_USER = 50000;
const MAX_LIKES_PER_USER = 15000;
const MAX_EVENTS_PER_USER = 20000;
const MAX_BAD_VIDEOS = 20000;
const MAX_QUALITY_ROWS = 100000;
const PRUNE_BATCH_SIZE = 250;
const AUTO_PRUNE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WATCHED_RETENTION_DAYS = 180;
const LIKES_RETENTION_DAYS = 365;
const EVENTS_RETENTION_DAYS = 45;
const CHANNEL_STALE_DAYS = 120;
let collectInFlight = false;

const COOKIE_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShortsFire — YouTube Cookie</title><style>
body{margin:0;background:#0b0b10;color:#e9e9f2;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;max-width:660px;margin:0 auto;font-size:15px}
h1{font-size:19px;margin:8px 0 6px}
p{color:#9a9aae;font-size:13px;line-height:1.65;margin:8px 0}
.card{background:#14141c;border:1px solid #262635;border-radius:14px;padding:14px;margin:12px 0}
input,textarea,button{width:100%;box-sizing:border-box;font:inherit;max-width:100%}
input[type=password],input[type=text],textarea{background:#0e0e15;border:1px solid #2c2c3d;border-radius:10px;color:#fff;padding:11px;margin-top:8px}
textarea{height:110px;font-size:12px}
button{border:0;border-radius:11px;padding:13px;margin-top:10px;background:linear-gradient(135deg,#ff2d4b,#ff6b2b);color:#fff;font-weight:800;font-size:15px;cursor:pointer}
button.ghost{background:#1d1d29;color:#bbb;font-weight:700;font-size:13px}
pre{background:#0e0e15;border:1px solid #2c2c3d;border-radius:10px;padding:11px;font-size:12px;white-space:pre-wrap;word-break:break-word;color:#c9f0c9;min-height:22px;margin:10px 0}
label{font-size:13px;font-weight:700;color:#cfcfe2;display:block;margin-top:12px}
.b{color:#ff8a5c;font-weight:800}
</style></head><body>
<h1>🍪 YouTube Cookie Set Karo</h1>
<p>Ye page cookie ko <span class="b">seedha worker ke andar</span> save karta hai — Cloudflare ke env box ki size limit se koi matlab nahi. <b>Kuch katna ya edit nahi karna.</b> JSON / cookies.txt / header string — jo bhi export mile, waisa hi daal do.</p>
<div class="card">
<label>1) CRON_SECRET</label>
<input type="password" id="sec" placeholder="apna CRON_SECRET" autocomplete="off">
<label>2) Cookie file choose karo ya neeche paste karo</label>
<input type="file" id="f" accept=".json,.txt,text/plain">
<textarea id="ta" placeholder="cookies.json ka poora content yahan paste karo"></textarea>
<button id="save">📤 Save karo</button>
<button class="ghost" id="chk">🔍 Status dekho</button>
</div>
<pre id="out">Ready.</pre>
<div class="card">
<label>3) Test (optional) — video id daalo</label>
<input type="text" id="vid" placeholder="jaise OgolSmXvm4E">
<button class="ghost" id="tst">▶ Grab-test chalao</button>
</div>
<p>Cookie kaise nikalna hai: browser me youtube.com pe <b>login</b> karo → Cookie-Editor extension kholo → <b>Export → JSON</b> → jo file download hui wo yahan choose kar do. Bas.</p>
<script>
var secEl=document.getElementById('sec'),fEl=document.getElementById('f'),taEl=document.getElementById('ta'),out=document.getElementById('out'),vidEl=document.getElementById('vid');
try{secEl.value=localStorage.getItem('sf_secret')||''}catch(e){}
secEl.addEventListener('change',function(){try{localStorage.setItem('sf_secret',secEl.value.trim())}catch(e){}});
fEl.addEventListener('change',function(){var f=fEl.files&&fEl.files[0];if(!f)return;var r=new FileReader();r.onload=function(){taEl.value=String(r.result||'');out.className='';out.textContent='File load ho gayi: '+f.name+' ('+Math.round(f.size/102.4)/10+' KB) — ab Save dabao.'};r.readAsText(f)});
function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function show(j){if(typeof j==='string'){out.innerHTML=esc(j);out.className='';return}
if(j.ok===false){out.className='';out.innerHTML='❌ '+esc(j.error)+'<br>'+esc(j.hint||'')+'<br>'+esc(j.sample||'')}
else if(j.verdict){out.className='';out.innerHTML=esc(j.verdict)+'<br>cookie: '+esc(j.cookie||'')+(j.cookieMode?(' — engine: '+esc(j.cookieMode)):'')+'<br>'+esc((j.clientsTried||[]).map(function(c){return c.client+' -> '+c.status+(c.reason?(' — '+c.reason):'')}).join('<br>'))+(j.diagnosis?('<br><br>🧭 '+esc(j.diagnosis)):'')+(j.controlVideo&&j.controlVideo.length?('<br><br>control (dQw4w9WgXcQ): '+esc(j.controlVideo.map(function(c){return c.status}).join(', '))):'')}
else if(j.cookies!==undefined){out.className='';out.innerHTML='✅ '+esc(j.cookies)+' cookies mili'+(j.mode?(' — engine use kar raha hai: '+esc(j.mode)):'')+(j.loginInfo===false?('<br>⚠️ LOGIN_INFO missing — ye logged-in session ka export NAHI lagta!'):'')+'<br>'+esc((j.names||[]).join(', '))+'<br>'+esc(j.note||'')+(j.expired&&j.expired.length?('<br>⌛ expired: '+esc(j.expired.join(', '))):'')+(j.warn?('<br>⚠️ '+esc(j.warn)):'')}
else{out.className='';out.innerHTML=esc(JSON.stringify(j,null,1))}}
function go(url,body){out.className='';out.textContent='Ruk jao...';var o={method:body===null?'GET':'POST'};if(body!==null)o.body=body;fetch(url,o).then(function(r){return r.json()}).then(show).catch(function(e){show('❌ '+e.message)})}
function needSecret(){var v=secEl.value.trim();if(!v)show({ok:false,error:'pehle CRON_SECRET daalo'});return v}
document.getElementById('save').addEventListener('click',function(){var t=needSecret();if(!t)return;if(!taEl.value.trim()){show({ok:false,error:'pehle cookie file choose karo ya paste karo'});return}go('/api/tg/set-cookie?secret='+encodeURIComponent(t),taEl.value)});
document.getElementById('chk').addEventListener('click',function(){var t=needSecret();if(!t)return;go('/api/tg/cookie?secret='+encodeURIComponent(t),null)});
document.getElementById('tst').addEventListener('click',function(){var t=needSecret();if(!t)return;var v=vidEl.value.trim();if(!v){show({ok:false,error:'pehle video id daalo'});return}go('/api/tg/grab-test?id='+encodeURIComponent(v)+'&secret='+encodeURIComponent(t),null)});
</script></body></html>`;
async function sfHandleRequest(request, env, ctx) {
  const url = new URL(request.url);
      const tgGetGuardHelper = (req, e, u) => {
        const isGet = req.method === 'GET';
        const wantsGo = u.searchParams.get('go') === '1';
        if (!isGet && !wantsGo) return null;
        if (e.CRON_SECRET && u.searchParams.get('secret') !== e.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?secret=<CRON_SECRET> daalo' }, 401);
        return null;
      };
      const tgGetGo = () => request.method === 'GET' && url.searchParams.get('go') === '1';
      const tgGetGuard = () => {
        if (!tgGetGo()) return null;
        if (!env.CRON_SECRET) return json({ ok: false, error: 'browser trigger ke liye CRON_SECRET set karo', hint: 'ya POST /api/tg/ingest?secret=... use karo' }, 403);
        if (url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?go=1&secret=<CRON_SECRET> daalo' }, 401);
        return null;
      };
      if (url.pathname === '/' || url.pathname === '/index.html') return html(APP_HTML);
      if (url.pathname === '/cookie' || url.pathname === '/yt-cookie') return html(COOKIE_HTML);

      if (url.pathname === '/api/feed') {
        const userId=cleanUser(url.searchParams.get('userId')||'default'),mood=cleanMood(url.searchParams.get('mood')||'focus');
        const limit=clamp(parseInt(url.searchParams.get('limit')||'80',10),1,FEED_PAGE_SIZE_MAX),cursor=parseInt(url.searchParams.get('cursor')||String(Date.now()+999999999),10)||Date.now();
        const cats=(url.searchParams.get('cats')||'').split(',').map(cleanCat).filter(Boolean).slice(0,12),lastCats=(url.searchParams.get('lastCats')||'').split(',').map(cleanCat).filter(Boolean).slice(0,3);
        const lc2=(url.searchParams.get('lc2')||'').split(',').map(x=>{const p=x.split(':');const c=cleanCat(p[0]||''),k=Math.max(1,Math.min(9,parseInt(p[1]||'1',10)||1));return c?{cat:c,n:k}:null;}).filter(Boolean).slice(0,3),fatigue=url.searchParams.get('f')==='1';
        const cacheKey=feedMemoKey(env,userId,mood,limit,cursor,cats,lastCats,fatigue,lc2),ttl=envInt(env,'SF_FEED_CACHE_SEC',30,5,300)*1000;
        const hit=await memoGetFresh(cacheKey,url.origin);if(hit){await scheduleFeedAuto(env,ctx,url.origin).catch(()=>{});return json(hit);}
        try {
          await ensureSchema(env);await ensureStatsColumns(env).catch(()=>{});
          const out={ok:true,...(await getFeed(env,userId,mood,limit,cursor,cats,lastCats,fatigue,lc2))};
          await memoPut(cacheKey,out,ttl,Math.max(ttl,envInt(env,'SF_STALE_CACHE_SEC',600,60,3600)*1000),url.origin);
          await scheduleFeedAuto(env,ctx,url.origin).catch(()=>{});
          return json(out);
        } catch(e) { const stale=await memoGetStale(cacheKey,url.origin);if(stale)return json({...stale,cacheStale:true});throw e; }
      }

      if (url.pathname === '/api/watched' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        const videoId = cleanVideoId(b.videoId || '');
        if (!videoId) return json({ ok: false, error: 'videoId missing' }, 400);
        await tursoBatch(env, [
          { sql: 'INSERT OR IGNORE INTO watched_videos(user_id,video_id,watched_at) VALUES(?,?,?)', args: [userId, videoId, Date.now()] }
        ]);
        return json({ ok: true });
      }

      if (url.pathname === '/api/like' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        const videoId = cleanVideoId(b.videoId || '');
        const on = b.on !== false;
        if (!videoId) return json({ ok: false, error: 'videoId missing' }, 400);
        if (on) {
          await turso(env, 'INSERT OR IGNORE INTO liked_videos(user_id,video_id,liked_at) VALUES(?,?,?)', [userId, videoId, Date.now()]);
          await recordSignal(env, userId, videoId, 'like', 1, cleanMood(b.mood || 'focus'));
        } else {
          await turso(env, 'DELETE FROM liked_videos WHERE user_id=? AND video_id=?', [userId, videoId]);
          await recordSignal(env, userId, videoId, 'unlike', -1, cleanMood(b.mood || 'focus'));
        }
        return json({ ok: true, liked: on });
      }

      if (url.pathname === '/api/follow' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        const channelId = cleanChannelId(b.channelId || '');
        const channelName = String(b.channelName || '').slice(0, 160);
        const on = b.on !== false;
        if (!channelId) return json({ ok: false, error: 'channelId missing' }, 400);
        if (on) {
          await tursoBatch(env, [
            { sql: 'INSERT OR REPLACE INTO follows(user_id,channel_id,channel_name,followed_at) VALUES(?,?,?,?)', args: [userId, channelId, channelName, Date.now()] },
            { sql: 'INSERT OR IGNORE INTO channels(channel_id,channel_name,added_at,last_rss_at) VALUES(?,?,?,0)', args: [channelId, channelName, Date.now()] }
          ]);
        } else await turso(env, 'DELETE FROM follows WHERE user_id=? AND channel_id=?', [userId, channelId]);
        return json({ ok: true, followed: on });
      }

      if (url.pathname === '/api/signal' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        const videoId = cleanVideoId(b.videoId || '');
        const event = String(b.event || '').replace(/[^a-z_]/g, '').slice(0, 30);
        const rawV = parseInt(b.value || '0', 10) || 0;
        const value = event === 'watch_ms' ? Math.max(0, Math.min(900000, rawV)) : Math.max(-1000, Math.min(1000, rawV));
        const mood = cleanMood(b.mood || 'focus');
        if (!videoId || !event) return json({ ok: false, error: 'videoId/event missing' }, 400);
        const _lc2s=String(b.lc2||'').split(',').map(x=>cleanCat(x.split(':')[0]||'')).filter(Boolean).slice(0,3);const _lcall=Array.from(new Set([...(Array.isArray(b.lastCats)?b.lastCats.map(cleanCat).filter(Boolean).slice(0,3):[]),..._lc2s])).slice(0,3);const _icat = cleanCat(b.cat || '');
        const _info = _icat ? { cat: _icat, chId: cleanVideoId(b.ch || ''), title: String(b.t || '').slice(0, 140) } : null;
        await recordSignal(env, userId, videoId, event, value, mood, _lcall.length?_lcall:null, _info);
        return json({ ok: true });
      }

      if (url.pathname === '/api/bad-video' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const videoId = cleanVideoId(b.videoId || '');
        if (!videoId) return json({ ok: false, error: 'videoId missing' }, 400);
        await tursoBatch(env, [
          { sql: `INSERT INTO bad_videos(video_id,reason,fail_count,updated_at) VALUES(?,?,1,?) ON CONFLICT(video_id) DO UPDATE SET fail_count=fail_count+1,reason=excluded.reason,updated_at=excluded.updated_at`, args: [videoId, String(b.reason || 'bad_embed').slice(0, 80), Date.now()] },
          { sql: `INSERT INTO video_quality(video_id,score,updated_at) VALUES(?,?,?) ON CONFLICT(video_id) DO UPDATE SET score=MAX(-1000,MIN(1000,CAST(score*0.99 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`, args: [videoId, -500, Date.now()] }
        ]);
        return json({ ok: true });
      }

      if (url.pathname === '/api/checkout' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        const startMood = cleanMood(b.startMood || 'focus');
        const endRaw = String(b.endMood || '');
        const endMood = ['better', 'same', 'worse'].includes(endRaw) ? endRaw : 'same';
        const delta = endMood === 'better' ? 1 : endMood === 'worse' ? -1 : 0;
        const cats = (Array.isArray(b.cats) ? b.cats : []).map(cleanCat).filter(Boolean).slice(0, 8);
        const reels = clamp(parseInt(b.reels || '0', 10) || 0, 0, 5000);
        const stmts = [{ sql: 'INSERT INTO mood_checkouts(user_id,start_mood,end_mood,delta,cats,reels,created_at) VALUES(?,?,?,?,?,?,?)', args: [userId, startMood, endMood, delta, cats.join(','), reels, Date.now()] }];
        for (const c of cats) stmts.push({ sql: 'INSERT INTO mood_cat_effects(user_id,cat,sum,n,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,cat) DO UPDATE SET sum=sum+excluded.sum, n=n+excluded.n, updated_at=excluded.updated_at', args: [userId, c, delta, 1, Date.now()] });
        await tursoBatch(env, stmts);
        return json({ ok: true });
      }

      if (url.pathname === '/api/pharmacy') {
        await ensureSchema(env);
        const userId = cleanUser(url.searchParams.get('userId') || 'default');
        const since = Date.now() - 14 * 86400000;
        const [totRes, fxRes2] = await tursoMany(env, [
          { sql: 'SELECT COUNT(*) AS n, COALESCE(SUM(delta),0) AS s, SUM(CASE WHEN delta>0 THEN 1 ELSE 0 END) AS better FROM mood_checkouts WHERE user_id=? AND created_at>?', args: [userId, since] },
          { sql: 'SELECT cat, SUM(sum)*1.0/SUM(n) AS avg, SUM(n) AS n FROM mood_cat_effects WHERE user_id=? AND updated_at>? GROUP BY cat HAVING SUM(n)>=3 ORDER BY avg DESC LIMIT 10', args: [userId, since] }
        ]);
        const t = rowsToObjects(totRes)[0] || {};
        const effects = rowsToObjects(fxRes2).map(r => ({ cat: String(r.cat), avg10: Math.round(Number(r.avg || 0) * 10), n: Number(r.n || 0) }));
        return json({ ok: true, totals: { checkouts: Number(t.n || 0), avgPct: Number(t.n || 0) ? Math.round(Number(t.better || 0) / Number(t.n) * 100) : 0 }, effects });
      }

      if (url.pathname === '/api/collect' && request.method === 'POST') {
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        await ensureSchema(env);
        const lastCollectAt = Number(await getSetting(env, 'last_collect_at', '0') || 0);
        if (Date.now() - lastCollectAt < 10 * 60 * 1000) return json({ ok: true, skipped: true, cooldown: true, minsLeft: Math.ceil((10 * 60 * 1000 - (Date.now() - lastCollectAt)) / 60000) });
        const maxSearchCalls = clamp(parseInt(url.searchParams.get('maxSearchCalls') || String(envInt(env, 'YT_SEARCH_PER_COLLECT', MAX_SEARCH_CALLS_PER_COLLECT, 0, 3)), 10), 0, 3);
        const rssLimit = clamp(parseInt(url.searchParams.get('rssLimit') || String(envInt(env, 'YT_RSS_PER_COLLECT', RSS_CHANNELS_PER_COLLECT, 0, 20)), 10), 0, 20);
        if (collectInFlight) return json({ ok: false, error: 'collector already running' }, 409);
        collectInFlight = true;
        try {
          const result = await collect(env, { maxSearchCalls, rssLimit });
          return json({ ok: true, result });
        } finally { collectInFlight = false; }
      }

      if (url.pathname === '/api/cleanup') {
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        await ensureSchema(env);
        return json({ ok: true, result: await pruneDb(env) });
      }

      if (url.pathname === '/api/reset-taste' && request.method === 'POST') {
        await ensureSchema(env);
        const b = await request.json().catch(() => ({}));
        const userId = cleanUser(b.userId || 'default');
        await tursoBatch(env, [
          { sql: 'DELETE FROM user_prefs WHERE user_id=?', args: [userId] },
          { sql: 'DELETE FROM user_context_prefs WHERE user_id=?', args: [userId] },
          { sql: 'DELETE FROM user_mood_prefs WHERE user_id=?', args: [userId] },
          { sql: 'DELETE FROM user_keyword_prefs WHERE user_id=?', args: [userId] },
          { sql: 'DELETE FROM user_channel_prefs WHERE user_id=?', args: [userId] },
          { sql: 'DELETE FROM video_events WHERE user_id=?', args: [userId] }
        ]);
        return json({ ok: true });
      }

      if (url.pathname.startsWith('/v/')) return await handleTgVideo(request, env, url);

      if (url.pathname === '/api/tg/test') {
        const wantSend = url.searchParams.get('send') === '1';
        if (wantSend && env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'send=1 ke liye ?secret=<CRON_SECRET> chahiye' }, 401);
        try { return json(await tgSelfTest(env, { send: wantSend })); }
        catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
      }
      if (url.pathname === '/api/tg/retry-failed' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        try { await ensureSchema(env); } catch (e) {}
        const n = await turso(env, "UPDATE tg_store SET status='queued', attempts=0, error='', updated_at=? WHERE status IN ('failed','blocked')", [Date.now()]);
        await setSetting(env, 'tg_blocked_runs', '0');
        await setSetting(env, 'tg_fail_streak', '0');
        await setSetting(env, 'tg_burn_on', '1');
        await setSetting(env, 'tg_pause_reason', 'retry-failed ke baad resume');
        await setSetting(env, 'tg_pause_manual', '0');
        await setSetting(env, 'tg_pause_at', '0');
        await setSetting(env, 'tg_pause_count', '0');
        await flushSettings(env).catch(() => {});
        await memoInvalidateTg(env, url.origin).catch(() => {});
        return json({ ok: true, reset: true, note: 'saari failed videos dobara queue me — burn on kar diya', progress: await tgProgress(env) });
      }
      if (url.pathname === '/api/tg/grab-test') {
        const g = tgGetGuardHelper(request, env, url);
        if (g) return g;
        const tid = String(url.searchParams.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);
        if (tid.length < 5) return json({ ok: false, error: 'sahi video id do: ?id=VIDEO_ID' }, 400);
        const ckInfo = await ytCookieInfo(env); const ckParsed = parseCookieString(ckInfo.raw);
        const modeR = await resolveCookieMode(env, true).catch(() => null);
        const cookie = (modeR && typeof modeR.cookie === 'string') ? modeR.cookie : (ckParsed ? ckParsed.header : null);
        const clients = (await grabClientsList(env)).slice(0, 5).concat(GRAB_WEB_CLIENTS.slice(0, 1));
        const tryOne = async (vid, cl, opts) => {
          const meta = {};
          try {
            const j = await grabPlayerJson(env, vid, cl, meta, opts);
            const st = j?.playabilityStatus?.status || (j && j.__raw ? 'non-JSON' : '?');
            const muxed = (j?.streamingData?.formats || []).filter((x) => x.url && (x.itag === 18 || x.itag === 22)).length;
            return { client: cl.clientName + '/' + cl.clientVersion, http: meta.http, status: st, muxed, reason: String(j?.playabilityStatus?.reason || j?.__raw || '').slice(0, 90) };
          } catch (e) { return { client: cl.clientName + '/' + cl.clientVersion, http: meta.http, status: 'ERR', error: String(e.message || e).slice(0, 70) }; }
        };
        const detail = [];
        for (const c of clients) { if (sfLeft() < 6) break; const r = await tryOne(tid, c); detail.push(r); if (r.status === 'OK') break; }
        const control = [];
        if (sfLeft() >= 8) for (const c of clients.slice(0, 2)) { const r = await tryOne('dQw4w9WgXcQ', c); control.push(r); if (r.status === 'OK') break; }
        const sts = detail.map((d) => d.status);
        const allErr = sts.every((x) => x === 'ERROR' || x === 'non-JSON' || x === 'ERR');
        const allLogin = sts.every((x) => x === 'LOGIN_REQUIRED');
        const controlOk = control.some((c) => c.status === 'OK');
        let probe = null;
        if (allErr || allLogin) probe = await tryOne(tid, clients[0] || GRAB_BUILTIN[0], { noCookie: true });
        let diagnosis;
        const expiredTxt = (ckParsed && ckParsed.expired && ckParsed.expired.length) ? ('⌛ expired: ' + ckParsed.expired.join(', ') + ' — fresh export lo. ') : '';
        if (allLogin && !cookie) diagnosis = '🍪 Cookie set hi nahi hai (ya DB khaali) — /cookie page se lagao; bot-check wali videos iske bina fail hoti rahengi.';
        else if (allErr && controlOk) diagnosis = expiredTxt + '🎯 Video hi unavailable hai (private / removed / region-lock) — COOKIE THEEK HAI (control video chali gayi ✅). Aisi videos ab khud skip hoti hain, isliye backlog me waste nahi hoga.';
        else if (allErr && !controlOk && probe && probe.status === 'LOGIN_REQUIRED') diagnosis = expiredTxt + '🔑 Cookie ki SESSION invalid/expired hai — bina cookie LOGIN_REQUIRED aata hai, cookie ke saath ERROR. youtube.com pe dobara login karo → Cookie-Editor → fresh JSON export → /cookie page pe Save.';
        else if (allErr && !controlOk) diagnosis = '🌐 YouTube is waqt ERROR hi de raha hai (control bhi fail) — client wave / network issue. 10-15 min baad dobara try karo.';
        else if (allLogin) diagnosis = '🔐 Cookie YouTube tak effective nahi pahunch rahi (saari clients LOGIN_REQUIRED) — account login fresh karo aur poora export dobara lo.';
        else if (controlOk) diagnosis = '✅ Environment theek hai (control video chali). Target video ka reason upar per-client dekho.';
        else diagnosis = '📋 Per-client reason upar dekho (mixed results).';
        let grab = null;
        if (allErr) grab = { skip: 'try nahi kiya — saari clients ERROR (video unavailable)' };
        else {
          try {
            const got = await grabMp4(env, tid, { maxBytes: tgCfg(env).maxBytes, maxDuration: tgCfg(env).maxDuration });
            grab = got.skip ? { skip: got.skip } : { ok: true, mb: +(got.size / 1048576).toFixed(2), itag: got.itag, via: got.via };
          } catch (e) { grab = { error: String(e.message || e).slice(0, 200) }; }
        }
        return json({
          ok: true, videoId: tid,
          cookie: cookie ? 'set (' + cookie.split(';').length + ' cookies, engine mode: ' + ((modeR && modeR.mode) || '?') + ')' : 'NOT SET — bot-check wale videos fail honge (fix: /cookie page)',
          cookieMode: modeR ? modeR.mode : null,
          cookieProbe: modeR ? modeR.tested : null,
          cookieDetail: ckParsed ? { critical: ckParsed.critical, expired: ckParsed.expired, expMin: ckParsed.expMin ? new Date(ckParsed.expMin * 1000).toISOString() : null } : null,
          visitorData: grabVisitorData(env) ? 'set' : 'not set',
          clientsTried: detail,
          controlVideo: control,
          withoutCookie: probe,
          diagnosis,
          grabResult: grab,
          verdict: grab && grab.ok ? '🎉 Ye video grab ho rahi hai' : (grab && grab.skip ? '⏭️ skip: ' + grab.skip : '❌ grab fail — ' + diagnosis),
        });
      }
      if (url.pathname === '/api/tg/set-cookie' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?secret=<CRON_SECRET> daalo' }, 401);
        try { await ensureSchema(env); } catch (e) {}
        let body = '';
        try { body = String(await request.text() || '').trim(); } catch (e) {}
        if (!body) return json({ ok: false, error: 'body khaali hai', hint: '/cookie page kholo — wahan file choose karke Save dabao' }, 400);
        if (body.length > 262144) return json({ ok: false, error: 'file bahut badi (' + Math.round(body.length / 1024) + ' KB > 256 KB)', hint: 'sirf youtube.com/login wali cookies export karo — baaki sites ki nahi' }, 413);
        const parsed = parseCookieString(body);
        if (!parsed) return json({ ok: false, error: 'cookies samajh nahi aayi', hint: 'JSON (Cookie-Editor) / cookies.txt / "SID=...; SAPISID=..." header — koi ek format bhejo', sample: body.slice(0, 120) }, 400);
        await setSetting(env, 'yt_cookie', body);
        await setSetting(env, 'yt_cookie_at', String(Date.now()));
        await setSetting(env, 'yt_cookie_names', JSON.stringify(parsed.names));
        await setSetting(env, 'grab_cookie_mode', '');
        let requeued = 0;
        try { const rq = rowsToObjects(await turso(env, "SELECT COUNT(*) AS n FROM tg_store WHERE status='blocked'", [])); requeued = Number(rq[0] && rq[0].n || 0); if (requeued) { await turso(env, "UPDATE tg_store SET status='queued', attempts=0, error='', updated_at=? WHERE status='blocked'", [Date.now()]); await setSetting(env, 'tg_blocked_runs', '0'); } } catch (e) {}
        await flushSettings(env).catch(() => {});
        await memoInvalidateTg(env, url.origin).catch(() => {});
        const warn = (!parsed.names.includes('SID') || !parsed.names.includes('SAPISID')) ? 'zaroori cookies (SID / SAPISID) missing lag rahi hain — youtube.com wala poora export dobara lo' : ((parsed.expired && parsed.expired.length) ? 'ye cookie(s) EXPIRE ho chuki hain: ' + parsed.expired.join(', ') + ' — browser me dobara login karke fresh export lo' : ((!parsed.critical || parsed.critical.LOGIN_INFO !== true) ? 'LOGIN_INFO cookie nahi mili — lagta hai export tab liya jab browser me YouTube LOGGED-IN nahi tha. youtube.com pe login karo → Cookie-Editor → fresh Export → phir Save (warna videos bot-check me atki rahengi)' : undefined));
        return json({ ok: true, saved: true, cookies: parsed.count, names: parsed.names, loginInfo: !!(parsed.critical && parsed.critical.LOGIN_INFO), requeued, source: 'db', warn, note: 'cookie DB me save ho gayi' + (requeued ? ' + ' + requeued + ' blocked videos turant queue me daal di gayi' : '') + ' — ab bot-check wale videos bhi nikalenge', next: '/api/tg/grab-test?id=<videoId>&secret=… se test karo' });
      }
      if (url.pathname === '/api/tg/cookie') {
        try { await ensureSchema(env); } catch (e) {}
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?secret=<CRON_SECRET> daalo' }, 401);
        if (url.searchParams.get('clear') === '1') {
          if (!(request.method === 'POST' || tgGetGo())) return json({ ok: false, error: 'clear ke liye POST karo (?go=1&secret=… bhi chalta hai)' }, 405);
          await setSetting(env, 'yt_cookie', '');
          await setSetting(env, 'yt_cookie_at', '');
          await setSetting(env, 'yt_cookie_names', '[]');
          await setSetting(env, 'grab_cookie_mode', '');
          await flushSettings(env).catch(() => {});
          await memoInvalidateTg(env, url.origin).catch(() => {});
        }
        const info = await ytCookieInfo(env);
        const parsed = parseCookieString(info.raw);
        const modeR2 = await resolveCookieMode(env, url.searchParams.get('probe') === '1').catch(() => null);
        return json({
          ok: true, source: info.source,
          mode: modeR2 ? modeR2.mode : null, modeTested: modeR2 ? modeR2.tested : null, modeAt: modeR2 ? modeR2.at : 0,
          cookies: parsed ? parsed.count : 0,
          names: parsed ? parsed.names : [],
          critical: parsed ? parsed.critical : null,
          loginInfo: !!(parsed && parsed.critical && parsed.critical.LOGIN_INFO),
          expired: parsed ? parsed.expired : [],
          expMin: parsed && parsed.expMin ? new Date(parsed.expMin * 1000).toISOString() : null,
          envSet: !!envCookieRaw(env),
          dbAt: await getSetting(env, 'yt_cookie_at', ''),
          note: info.source === 'db' ? 'DB wali cookie chal rahi hai (env se priority)' : (info.source === 'env' ? 'env (YT_COOKIE) wali cookie chal rahi hai' : 'koi cookie set nahi — /cookie page kholo'),
        });
      }
      if (url.pathname === '/api/tg/progress') {
        const key=memoDbKey(env,'tg-progress:v3'),ttl=envInt(env,'SF_PROGRESS_CACHE_SEC',30,5,300)*1000;
        const hit=await memoGetFresh(key,url.origin);if(hit)return json(hit);
        try{try{await ensureSchema(env);}catch(e){}const data={ok:true,...(await tgProgress(env))};await memoPut(key,data,ttl,Math.max(ttl,600000),url.origin);return json(data);}
        catch(e){const stale=await memoGetStale(key,url.origin);if(stale)return json({...stale,cacheStale:true});throw e;}
      }
      if (url.pathname === '/api/tg/burn' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        const on = url.searchParams.get('on') === '0' ? '0' : '1';
        await setSetting(env, 'tg_burn_on', on);
        await setSetting(env, 'tg_pause_reason', on === '1' ? 'manual resume' : 'manual pause');
        await setSetting(env, 'tg_pause_manual', on === '1' ? '0' : '1');
        if (on === '1') { await setSetting(env, 'tg_fail_streak', '0'); await setSetting(env, 'tg_pause_at', '0'); await setSetting(env, 'tg_pause_count', '0'); }
        await flushSettings(env).catch(() => {});
        await memoInvalidateTg(env, url.origin).catch(() => {});
        return json({ ok: true, burn_on: on === '1', progress: await tgProgress(env) });
      }
      if (url.pathname === '/api/tg/request') {
        const rid = String(url.searchParams.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);
        if (rid.length < 5) return json({ ok: false, error: 'bad id' }, 400);
        try { await ensureSchema(env); } catch (e) {}
        return json(await tgQueueVideo(env, rid));
      }
      if (url.pathname === '/api/tg/stats') {
        const key=memoDbKey(env,'tg-stats:v2'),ttl=envInt(env,'SF_PROGRESS_CACHE_SEC',30,5,300)*1000;
        const hit=await memoGetFresh(key,url.origin);if(hit)return json(hit);
        try{await ensureSchema(env);const tg=await tgStats(env),data={ok:true,tg,enabled:tgEnabled(env)};if(tg.error){const stale=await memoGetStale(key,url.origin);if(stale)return json({...stale,cacheStale:true});return json(data);}await memoPut(key,data,ttl,Math.max(ttl,600000),url.origin);return json(data);}
        catch(e){const stale=await memoGetStale(key,url.origin);if(stale)return json({...stale,cacheStale:true});throw e;}
      }
      if (url.pathname === '/api/tg/ingest' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        await ensureSchema(env);
        const limit = clamp(parseInt(url.searchParams.get('limit') || '2', 10), 1, 8);
        const qOrder = url.searchParams.get('order');
        const order = ['old', 'new', 'mix'].includes(qOrder) ? qOrder : (['old', 'new', 'mix'].includes(String(env.TG_BURN_ORDER)) ? String(env.TG_BURN_ORDER) : 'mix');
        const out = await tgPipeline(env, { budget: limit, order, parallel: envInt(env, 'TG_PARALLEL', 1, 1, 4) });
        await memoInvalidateTg(env, url.origin).catch(() => {});
        return json({ ok: true, ...out });
      }
      if (url.pathname === '/api/tg/refresh-clients' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
        return json({ ok: true, clients: await refreshGrabClients(env, true) });
      }

      if (url.pathname === '/api/tg/whereami') {
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?secret=<CRON_SECRET> daalo' }, 401);
        try { await ensureSchema(env); } catch (e) {}
        try { return json(await tgWhereAmI(env)); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
      }
      if (url.pathname === '/api/tg/resend' && (request.method === 'POST' || tgGetGo())) {
        const g = tgGetGuard(); if (g) return g;
        if (env.CRON_SECRET && url.searchParams.get('secret') !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized', hint: 'URL me ?go=1&secret=<CRON_SECRET> daalo' }, 401);
        try { await ensureSchema(env); } catch (e) {}
        const to = String(url.searchParams.get('to') || '').trim();
        const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
        const ids = String(url.searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
        try { return json(await tgResend(env, { to, limit, ids })); } catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
      }

      if (url.pathname === '/api/stats') {
        const userId=cleanUser(url.searchParams.get('userId')||'default'),key=memoDbKey(env,'stats:v2:'+userId),ttl=envInt(env,'SF_STATS_CACHE_SEC',60,5,600)*1000;
        const hit=await memoGetFresh(key,url.origin);if(hit)return json(hit);
        try{await ensureSchema(env);const data={ok:true,stats:await getStats(env,userId)};await memoPut(key,data,ttl,Math.max(ttl,600000),url.origin);return json(data);}
        catch(e){const stale=await memoGetStale(key,url.origin);if(stale)return json({...stale,cacheStale:true});throw e;}
      }

  return new Response('Not found', { status: 404 });
}

function sfErrorResponse(e) {
  const budget = !!(e && e.code === 'SF_SUBREQUEST_LIMIT');
  if (budget) console.warn('subrequest budget hit:', e && e.message);
  else console.error(e);
  return json({
    ok: false,
    error: String(e && e.message || e),
    ...(budget ? {
      hint: 'Ye request Cloudflare ke subrequest limit tak pahunch gayi thi. Thodi der baad try karo, ya SF_MAX_SUBREQUESTS badhao (paid plan: 900).',
      subrequests: { used: SF_REQ.count, limit: SF_REQ.limit },
    } : {}),
  }, budget ? 503 : 500);
}

// CORS: index.html GitHub Pages par host ho to browser cross-origin call karta hai.
// Sirf headers add hote hain; koi logic nahi badla.
const SF_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, range',
  'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges',
  'access-control-max-age': '86400'
};
function sfWithCors(res) {
  const h = new Headers(res.headers);
  for (const k of Object.keys(SF_CORS)) h.set(k, SF_CORS[k]);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: SF_CORS });
    sfBudgetStart(env);
    let res;
    try {
      res = await sfHandleRequest(request, env, ctx);
    } catch (e) {
      res = sfErrorResponse(e);
    }
    // settings are buffered during the request (one INSERT batch instead of N
    // round-trips) — persist them before the response leaves.
    await flushSettings(env).catch(() => {});
    return sfWithCors(res);
  },

  async scheduled(event, env, ctx) {
    // ⚠️ Free plan: 10ms CPU per tick. Isliye cron me sirf HALKA kaam.
    sfBudgetStart(env);
    const cronStr = String((event && event.cron) || '');
    const everyMinute = cronStr === '* * * * *';

    // 1) TG pipeline (halka — mostly network wait, CPU kam) — har tick
    ctx.waitUntil((async () => {
      try {
        await ensureSchema(env);
        await tgPipeline(env, {
          budget: envInt(env, 'TG_CRON_BUDGET', 1, 0, 8),
          order: ['old', 'new', 'mix'].includes(String(env.TG_BURN_ORDER || 'mix')) ? String(env.TG_BURN_ORDER || 'mix') : 'mix',
          parallel: envInt(env, 'TG_PARALLEL_CRON', everyMinute ? 1 : 2, 1, 4),
        });
      } catch (e) { console.warn('tg cron', e && e.message); }
      finally { await flushSettings(env).catch(() => {}); }
    })());

    // 2) client discovery — CPU bhaari (yt-dlp file download + parse). Cron me DEFAULT OFF.
    if (String(env.TG_DISCOVERY_CRON || '0') === '1') {
      // flushSettings: this task runs *after* the handler returned, so without it
      // the new client list stays in the write-back buffer and is lost.
      ctx.waitUntil(refreshGrabClients(env, false).then(() => flushSettings(env)).catch(() => {}));
    } else if (!everyMinute) {
      ctx.waitUntil(refreshGrabClients(env, false).then(() => flushSettings(env)).catch(() => {}));
    }

    // 3) collect — CPU bhaari hai, isliye 'har minute' cron pe OFF (default).
    //    Tumhara purana cron (jaise 17 */6 * * *) pe collect waise hi chalta rahega.
    const collectOnMinuteCron = String(env.YT_COLLECT_MINUTE_CRON || '0') === '1';
    if (!everyMinute || collectOnMinuteCron) ctx.waitUntil((async () => {
      try {
        // the TG pipeline above already spent part of this invocation's budget
        if (SF_REQ.count >= SF_REQ.limit * 0.6) { console.warn('collect skipped: subrequest budget'); return; }
        const gapMs = envInt(env, 'YT_COLLECT_EVERY_MIN', 30, 5, 1440) * 60000;
        const last = parseInt(await getSetting(env, 'last_collect_at', '0'), 10) || 0;
        if (Date.now() - last < gapMs) return;
        if (collectInFlight) return;
        collectInFlight = true;
        try {
          await collect(env, {
            maxSearchCalls: envInt(env, 'YT_SEARCH_PER_COLLECT', MAX_SEARCH_CALLS_PER_COLLECT, 0, 3),
            rssLimit: envInt(env, 'YT_RSS_PER_COLLECT', RSS_CHANNELS_PER_COLLECT, 0, 20),
          });
        } finally { collectInFlight = false; }
      } catch (e) { console.warn('collect cron', e && e.message); }
      finally { await flushSettings(env).catch(() => {}); }
    })());
  }

};

// ───────────────────── Subrequest budget (Cloudflare 50/invocation) ─────────────────────
// Cloudflare Workers allow a limited number of outgoing subrequests per invocation
// (50 on Free, 1000 on Paid). Every Turso call AND every YouTube/Telegram/RSS call
// counts. This guard keeps the worker *inside* the limit and degrades gracefully
// instead of dying with "Too many subrequests by single Worker invocation".
const SF_REQ = { count: 0, limit: 48, startedAt: 0, exhausted: false };
const SF_NATIVE_FETCH = (typeof globalThis.fetch === 'function') ? globalThis.fetch.bind(globalThis) : null;

function sfBudgetStart(env) {
  SF_REQ.count = 0;
  SF_REQ.limit = envInt(env, 'SF_MAX_SUBREQUESTS', 48, 8, 990);
  SF_REQ.startedAt = Date.now();
  SF_REQ.exhausted = false;
  sfSettingsNewRequest(env);
}
function sfLeft() { return SF_REQ.limit - SF_REQ.count; }
function sfBudgetError(need) {
  const e = new Error('subrequest budget low (' + SF_REQ.count + '/' + SF_REQ.limit + (need ? ', need ' + need : '') + ')');
  e.code = 'SF_SUBREQUEST_LIMIT';
  return e;
}
async function sfFetch(input, init) {
  if (SF_REQ.count >= SF_REQ.limit) { SF_REQ.exhausted = true; throw sfBudgetError(); }
  SF_REQ.count++;
  return SF_NATIVE_FETCH(input, init);
}
// Patch the global so *every* call site (including ones added later) is counted.
try {
  if (SF_NATIVE_FETCH && !globalThis.__sfFetchPatched) {
    globalThis.fetch = sfFetch;
    globalThis.__sfFetchPatched = true;
  }
} catch (e) { /* non-fatal: hotspots below still guard themselves via sfLeft() */ }

// ───────────────────── Settings: cached reads + coalesced writes ─────────────────────
// Before: every getSetting()/setSetting() was its own Turso HTTP round-trip. A single
// /api/tg/ingest call did 30-40 of them and blew the subrequest limit. Now a request
// reads the whole (small) settings table once and writes are flushed as ONE batch.
const SF_SET = { map: new Map(), missing: new Set(), pending: new Map(), primedAt: 0, loading: null, tries: 0 };
const SF_SET_BIG_KEYS = new Set(['yt_cookie']); // can be ~256KB, never bulk-loaded
let SF_SET_TTL_MS = 3000; // per-invocation settings cache window (env: SF_SETTINGS_TTL_MS)

function sfSettingsNewRequest(env) {
  SF_SET.loading = null;
  SF_SET.tries = 0;
  if (env) SF_SET_TTL_MS = envInt(env, 'SF_SETTINGS_TTL_MS', 3000, 0, 60000);
  if (Date.now() - SF_SET.primedAt > SF_SET_TTL_MS) { SF_SET.map.clear(); SF_SET.missing.clear(); }
  // pending writes from a previous request were already flushed; never leak them
  SF_SET.pending.clear();
}
async function sfSettingsPrime(env) {
  if (Date.now() - SF_SET.primedAt <= SF_SET_TTL_MS) return;
  if (SF_SET.loading) return SF_SET.loading;
  SF_SET.loading = (async () => {
    try {
      const rows = rowsToObjects(await tursoMany(env, [{
        sql: "SELECT key,value FROM settings WHERE key NOT IN ('yt_cookie') AND length(value)<16000",
        args: [],
      }]));
      for (const r of rows) SF_SET.map.set(String(r.key), String(r.value == null ? '' : r.value));
      SF_SET.primedAt = Date.now();
    } catch (e) {
      // table may not exist yet (first ever request): try again, but never more
      // than twice per request so a broken DB cannot eat the subrequest budget.
      SF_SET.tries++;
      SF_SET.primedAt = (SF_SET.tries >= 2) ? Date.now() : 0;
    }
  })();
  try { await SF_SET.loading; } finally { SF_SET.loading = null; }
}
async function getSetting(env, key, fallback = '') {
  if (SF_SET.pending.has(key)) return SF_SET.pending.get(key);
  if (!SF_SET_BIG_KEYS.has(key)) {
    await sfSettingsPrime(env);
    if (SF_SET.map.has(key)) return SF_SET.map.get(key);
    if (SF_SET.missing.has(key)) return fallback;
  }
  try {
    const r = rowsToObjects(await turso(env, 'SELECT value FROM settings WHERE key=?', [key]));
    const v = r[0] && r[0].value;
    if (v == null) { SF_SET.missing.add(key); return fallback; }
    SF_SET.map.set(key, String(v));
    return String(v);
  } catch (e) { return fallback; }
}
async function getSettingFresh(env, key, fallback = '') {
  SF_SET.pending.delete(key);
  try {
    const r = rowsToObjects(await turso(env, 'SELECT value FROM settings WHERE key=?', [key]));
    const v = r[0] && r[0].value;
    if (v == null) { SF_SET.map.delete(key); SF_SET.missing.add(key); return fallback; }
    SF_SET.map.set(key, String(v));
    SF_SET.missing.delete(key);
    return String(v);
  } catch (e) { return fallback; }
}
async function setSetting(env, key, value, opts) {
  const v = String(value == null ? '' : value);
  SF_SET.map.set(key, v);
  SF_SET.missing.delete(key);
  SF_SET.pending.set(key, v);
  if ((opts && opts.immediate) || SF_SET.pending.size >= 40) await flushSettings(env);
}
async function flushSettings(env) {
  if (!SF_SET.pending.size) return;
  const entries = [...SF_SET.pending.entries()];
  SF_SET.pending.clear();
  try {
    await tursoBatch(env, entries.map(([k, v]) => ({ sql: 'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', args: [k, v] })));
    SF_SET.primedAt = Date.now();
  } catch (e) {
    for (const [k, v] of entries) if (!SF_SET.pending.has(k)) SF_SET.pending.set(k, v);
    console.warn('settings flush failed:', e && e.message);
  }
}

// ───────────────────────── Turso client ─────────────────────────
function tursoEndpoint(env) {
  let u = String(env.TURSO_DATABASE_URL || '').trim();
  if (!u) throw new Error('TURSO_DATABASE_URL missing');
  if (u.startsWith('libsql://')) u = 'https://' + u.slice(9);
  u = u.replace(/\/+$/, '');
  return u.endsWith('/v2/pipeline') ? u : u + '/v2/pipeline';
}
function sqlArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isFinite(v) ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  return { type: 'text', value: String(v) };
}
async function tursoMany(env, statements) {
  if (!env.TURSO_AUTH_TOKEN) throw new Error('TURSO_AUTH_TOKEN missing');
  const requests = statements.map(st => ({ type: 'execute', stmt: { sql: st.sql, args: (st.args || []).map(sqlArg) } }));
  requests.push({ type: 'close' });
  let res = null, _att = 0;
  for (;;) { _att++;
    if (SF_REQ.count >= SF_REQ.limit) throw sfBudgetError();
    res = await sfFetch(tursoEndpoint(env), { method: 'POST', headers: { Authorization: 'Bearer ' + env.TURSO_AUTH_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
    if (res.status === 429 && _att < 3) { const ra = parseInt(res.headers.get('retry-after') || '0', 10) || 0; await new Promise(r => setTimeout(r, Math.min(3000, ra * 1000 || (_att === 1 ? 400 : 1200)))); continue; }
    break;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Turso ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const results = data.results || [];
  const bad = results.find(r => r.type === 'error');
  if (bad) throw new Error(bad.error?.message || 'Turso query error');
  return results.map(r => r.response?.result || r.response?.execute?.result || r.response || {});
}
async function turso(env, sql, args = []) { return (await tursoMany(env, [{ sql, args }]))[0]; }
async function tursoBatch(env, statements) { if (!statements.length) return []; return await tursoMany(env, statements); }
function cellValue(c) { if (c == null) return null; if (typeof c === 'string' || typeof c === 'number') return c; return 'value' in c ? c.value : null; }
function rowsToObjects(result) { const cols = (result?.cols || []).map(c => c.name); return (result?.rows || []).map(row => Object.fromEntries(row.map((c, i) => [cols[i] || String(i), cellValue(c)]))); }

let statsColsDone = false;
async function ensureStatsColumns(env) {
  if (statsColsDone) return;
  const stmts = ['views', 'likes', 'duration', 'enriched_at'].map((c) => ({ sql: 'ALTER TABLE videos ADD COLUMN ' + c + ' INTEGER DEFAULT 0', args: [] }));
  stmts.push({ sql: 'CREATE INDEX IF NOT EXISTS idx_videos_enriched ON videos(enriched_at)', args: [] });
  try {
    await tursoBatch(env, stmts);
    statsColsDone = true;
  } catch (e) {
    const msg = String((e && e.message) || e);
    // "duplicate column name" is the normal path once the columns exist;
    // something else (e.g. table not created yet) -> retry on the next call.
    if (/duplicate column|already exists/i.test(msg)) statsColsDone = true;
    else console.warn('ensureStatsColumns:', msg.slice(0, 120));
  }
}
function parseIsoDuration(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600 + parseInt(m[2] || '0', 10) * 60 + parseInt(m[3] || '0', 10));
}
async function enrichRecent(env, maxVideos = 100) {
  if (!env.YOUTUBE_API_KEY) return { skipped: true };
  await ensureStatsColumns(env);
  const ids = rowsToObjects(await turso(env, 'SELECT video_id FROM videos WHERE COALESCE(enriched_at,0)=0 ORDER BY added_at DESC LIMIT ?', [maxVideos])).map(r => r.video_id);
  if (!ids.length) return { nothingTodo: true };
  let done = 0, calls = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (!chunk.length) break;
    if (sfLeft() < 6) break;                       // keep headroom for the caller
    if (!(await canSpendQuota(env, 3))) { break; }
    let r;
    try {
      r = await sfFetch('https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=' + chunk.join(',') + '&maxResults=50&key=' + env.YOUTUBE_API_KEY);
    } catch (e) { break; }
    if (!r.ok) break;
    await spendQuota(env, 1); calls++;
    const j = await r.json().catch(() => null);
    if (!j || !j.items) break;
    const stmts = [];
    for (const it of (j.items || [])) {
      const vid = String(it.id || '');
      if (!vid) continue;
      const st = it.statistics || {};
      const views = parseInt(st.viewCount || '0', 10) || 0;
      const likes = parseInt(st.likeCount || '0', 10) || 0;
      const dur = parseIsoDuration(it.contentDetails && it.contentDetails.duration);
      stmts.push({ sql: 'UPDATE videos SET views=?,likes=?,duration=?,enriched_at=? WHERE video_id=?', args: [views, likes, dur, Date.now(), vid] });
    }
    if (stmts.length) await tursoBatch(env, stmts);
    done += stmts.length;
  }
  return { enriched: done, calls };
}
function engagementBoost(rows) {
  const byCat = {};
  for (const v of rows) { if ((v.views || 0) >= 50) { const k = v.cat || 'x'; (byCat[k] = byCat[k] || []).push(v); } }
  for (const c in byCat) {
    const arr = byCat[c];
    arr.sort((a, b) => (b.likes + 1) / (b.views + 20) - (a.likes + 1) / (a.views + 20));
    const n = arr.length;
    if (n < 5) continue;
    arr.forEach((v, i) => { v.engBoost = Math.round(38 * (1 - i / Math.max(1, n - 1))); });
  }
  const nowMs = Date.now();
  for (const v of rows) {
    if ((v.views || 0) > 0) {
      const ageDays = Math.max(0, (nowMs - (v.added_at || nowMs)) / 86400000);
      const vel = Math.log10(v.views + 1) / (ageDays + 2);
      v.velBoost = Math.round(22 * Math.min(1, vel / 2.5));
    }
  }
  return rows;
}
const SF_PHRASES = ['psychology facts', 'bhagwat geeta', 'bhagvad gita', 'shri krishna', 'radha krishna', 'radhe krishna', 'hanuman chalisa', 'old song', 'sad song', 'love story', 'dark psychology', 'life lessons', 'hanuman ji', 'mahadev', 'comedy scene'];
function titleQualityPenalty(title) {
  const t = String(title || '');
  if (!t) return 20;
  let pen = 0;
  const words = t.split(/\s+/);
  const alpha = words.filter(w => /[a-zA-Z\u0900-\u097F]/.test(w));
  const caps = alpha.filter(w => w.length > 2 && /[A-Z]/.test(w) && w === w.toUpperCase());
  if (alpha.length >= 4 && caps.length / alpha.length > 0.6) pen += 12;
  const tags = (t.match(/#\w+/g) || []).length;
  if (tags > 8) pen += 12; else if (tags > 5) pen += 7;
  const emo = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emo > 8) pen += 8;
  if (t.length < 15) pen += 6;
  if (/(free|giveaway|win |\u20b9\d|\$\d)/i.test(t)) pen += 6;
  return Math.min(40, pen);
}
function extractTitleKeywordsV2(text, max = 10) {
  const base = extractTitleKeywords(text, max);
  const low = String(text || '').toLowerCase();
  for (const p of SF_PHRASES) { if (low.includes(p) && !base.includes(p)) base.push(p); }
  return base;
}
async function ensureSchema(env) {
  if (ensureSchema.done) return;
  await tursoBatch(env, [
    { sql: `CREATE TABLE IF NOT EXISTS videos(video_id TEXT PRIMARY KEY,title TEXT,channel_id TEXT,channel_name TEXT,thumb TEXT,source TEXT,category TEXT,added_at INTEGER)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_videos_added ON videos(added_at DESC)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_videos_cat_added ON videos(category,added_at DESC)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id)` },
    { sql: `CREATE TABLE IF NOT EXISTS channels(channel_id TEXT PRIMARY KEY,channel_name TEXT,last_rss_at INTEGER DEFAULT 0,added_at INTEGER)` },
    { sql: `CREATE TABLE IF NOT EXISTS watched_videos(user_id TEXT,video_id TEXT,watched_at INTEGER,PRIMARY KEY(user_id,video_id))` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_watched_user ON watched_videos(user_id,watched_at DESC)` },
    { sql: `CREATE TABLE IF NOT EXISTS mood_checkouts(user_id TEXT,start_mood TEXT,end_mood TEXT,delta INTEGER,cats TEXT,reels INTEGER,created_at INTEGER)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_co_user ON mood_checkouts(user_id,created_at)` },
    { sql: `CREATE TABLE IF NOT EXISTS mood_cat_effects(user_id TEXT,cat TEXT,sum INTEGER,n INTEGER,updated_at INTEGER,PRIMARY KEY(user_id,cat))` },
    { sql: `CREATE TABLE IF NOT EXISTS cat_bandit(user_id TEXT,mood TEXT,cat TEXT,n INTEGER DEFAULT 0,w REAL DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,mood,cat))` },
    { sql: `CREATE TABLE IF NOT EXISTS cat_affinity(user_id TEXT,cat_a TEXT,cat_b TEXT,w REAL DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,cat_a,cat_b))` },
    { sql: `CREATE TABLE IF NOT EXISTS liked_videos(user_id TEXT,video_id TEXT,liked_at INTEGER,PRIMARY KEY(user_id,video_id))` },
    { sql: `CREATE TABLE IF NOT EXISTS follows(user_id TEXT,channel_id TEXT,channel_name TEXT,followed_at INTEGER,PRIMARY KEY(user_id,channel_id))` },
    { sql: `CREATE TABLE IF NOT EXISTS bad_videos(video_id TEXT PRIMARY KEY,reason TEXT,fail_count INTEGER DEFAULT 1,updated_at INTEGER)` },
    { sql: `CREATE TABLE IF NOT EXISTS video_quality(video_id TEXT PRIMARY KEY,score INTEGER DEFAULT 0,updated_at INTEGER)` },
    { sql: `CREATE TABLE IF NOT EXISTS video_events(user_id TEXT,video_id TEXT,event TEXT,value INTEGER DEFAULT 0,created_at INTEGER)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_events_user ON video_events(user_id,created_at DESC)` },
    { sql: `CREATE TABLE IF NOT EXISTS user_prefs(user_id TEXT,category TEXT,score INTEGER DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,category))` },
    { sql: `CREATE TABLE IF NOT EXISTS user_context_prefs(user_id TEXT,slot TEXT,category TEXT,score INTEGER DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,slot,category))` },
    { sql: `CREATE TABLE IF NOT EXISTS user_mood_prefs(user_id TEXT,mood TEXT,category TEXT,score INTEGER DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,mood,category))` },
    { sql: `CREATE TABLE IF NOT EXISTS user_keyword_prefs(user_id TEXT,keyword TEXT,score INTEGER DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,keyword))` },
    { sql: `CREATE TABLE IF NOT EXISTS user_channel_prefs(user_id TEXT,channel_id TEXT,score INTEGER DEFAULT 0,updated_at INTEGER,PRIMARY KEY(user_id,channel_id))` },
    { sql: `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)` },
    { sql: `CREATE TABLE IF NOT EXISTS tg_store(video_id TEXT PRIMARY KEY,file_id TEXT,file_unique_id TEXT,size INTEGER DEFAULT 0,duration INTEGER DEFAULT 0,status TEXT DEFAULT 'pending',error TEXT DEFAULT '',attempts INTEGER DEFAULT 0,created_at INTEGER,updated_at INTEGER)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tg_status_updated ON tg_store(status,updated_at)` },
    { sql: `CREATE TABLE IF NOT EXISTS tg_aggregate(id INTEGER PRIMARY KEY CHECK(id=1),initialized INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,blocked INTEGER NOT NULL DEFAULT 0,skipped INTEGER NOT NULL DEFAULT 0,queued INTEGER NOT NULL DEFAULT 0,pending INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,failed_bytes INTEGER NOT NULL DEFAULT 0,blocked_bytes INTEGER NOT NULL DEFAULT 0,skipped_bytes INTEGER NOT NULL DEFAULT 0,queued_bytes INTEGER NOT NULL DEFAULT 0,pending_bytes INTEGER NOT NULL DEFAULT 0)` },
    { sql: `INSERT OR IGNORE INTO tg_aggregate(id) VALUES(1)` },
    { sql: `CREATE TRIGGER IF NOT EXISTS tg_aggregate_insert AFTER INSERT ON tg_store BEGIN UPDATE tg_aggregate SET total=total+1,done=done+CASE WHEN NEW.status='done' THEN 1 ELSE 0 END,failed=failed+CASE WHEN NEW.status='failed' THEN 1 ELSE 0 END,blocked=blocked+CASE WHEN NEW.status='blocked' THEN 1 ELSE 0 END,skipped=skipped+CASE WHEN NEW.status='skipped' THEN 1 ELSE 0 END,queued=queued+CASE WHEN NEW.status='queued' THEN 1 ELSE 0 END,pending=pending+CASE WHEN NEW.status='pending' THEN 1 ELSE 0 END,bytes=bytes+CASE WHEN NEW.status='done' THEN COALESCE(NEW.size,0) ELSE 0 END,failed_bytes=failed_bytes+CASE WHEN NEW.status='failed' THEN COALESCE(NEW.size,0) ELSE 0 END,blocked_bytes=blocked_bytes+CASE WHEN NEW.status='blocked' THEN COALESCE(NEW.size,0) ELSE 0 END,skipped_bytes=skipped_bytes+CASE WHEN NEW.status='skipped' THEN COALESCE(NEW.size,0) ELSE 0 END,queued_bytes=queued_bytes+CASE WHEN NEW.status='queued' THEN COALESCE(NEW.size,0) ELSE 0 END,pending_bytes=pending_bytes+CASE WHEN NEW.status='pending' THEN COALESCE(NEW.size,0) ELSE 0 END WHERE id=1; END` },
    { sql: `CREATE TRIGGER IF NOT EXISTS tg_aggregate_update AFTER UPDATE ON tg_store BEGIN UPDATE tg_aggregate SET done=done-CASE WHEN OLD.status='done' THEN 1 ELSE 0 END+CASE WHEN NEW.status='done' THEN 1 ELSE 0 END,failed=failed-CASE WHEN OLD.status='failed' THEN 1 ELSE 0 END+CASE WHEN NEW.status='failed' THEN 1 ELSE 0 END,blocked=blocked-CASE WHEN OLD.status='blocked' THEN 1 ELSE 0 END+CASE WHEN NEW.status='blocked' THEN 1 ELSE 0 END,skipped=skipped-CASE WHEN OLD.status='skipped' THEN 1 ELSE 0 END+CASE WHEN NEW.status='skipped' THEN 1 ELSE 0 END,queued=queued-CASE WHEN OLD.status='queued' THEN 1 ELSE 0 END+CASE WHEN NEW.status='queued' THEN 1 ELSE 0 END,pending=pending-CASE WHEN OLD.status='pending' THEN 1 ELSE 0 END+CASE WHEN NEW.status='pending' THEN 1 ELSE 0 END,bytes=MAX(0,bytes-CASE WHEN OLD.status='done' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='done' THEN COALESCE(NEW.size,0) ELSE 0 END),failed_bytes=MAX(0,failed_bytes-CASE WHEN OLD.status='failed' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='failed' THEN COALESCE(NEW.size,0) ELSE 0 END),blocked_bytes=MAX(0,blocked_bytes-CASE WHEN OLD.status='blocked' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='blocked' THEN COALESCE(NEW.size,0) ELSE 0 END),skipped_bytes=MAX(0,skipped_bytes-CASE WHEN OLD.status='skipped' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='skipped' THEN COALESCE(NEW.size,0) ELSE 0 END),queued_bytes=MAX(0,queued_bytes-CASE WHEN OLD.status='queued' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='queued' THEN COALESCE(NEW.size,0) ELSE 0 END),pending_bytes=MAX(0,pending_bytes-CASE WHEN OLD.status='pending' THEN COALESCE(OLD.size,0) ELSE 0 END+CASE WHEN NEW.status='pending' THEN COALESCE(NEW.size,0) ELSE 0 END) WHERE id=1; END` },
    { sql: `CREATE TRIGGER IF NOT EXISTS tg_aggregate_delete AFTER DELETE ON tg_store BEGIN UPDATE tg_aggregate SET total=MAX(0,total-1),done=MAX(0,done-CASE WHEN OLD.status='done' THEN 1 ELSE 0 END),failed=MAX(0,failed-CASE WHEN OLD.status='failed' THEN 1 ELSE 0 END),blocked=MAX(0,blocked-CASE WHEN OLD.status='blocked' THEN 1 ELSE 0 END),skipped=MAX(0,skipped-CASE WHEN OLD.status='skipped' THEN 1 ELSE 0 END),queued=MAX(0,queued-CASE WHEN OLD.status='queued' THEN 1 ELSE 0 END),pending=MAX(0,pending-CASE WHEN OLD.status='pending' THEN 1 ELSE 0 END),bytes=MAX(0,bytes-CASE WHEN OLD.status='done' THEN COALESCE(OLD.size,0) ELSE 0 END),failed_bytes=MAX(0,failed_bytes-CASE WHEN OLD.status='failed' THEN COALESCE(OLD.size,0) ELSE 0 END),blocked_bytes=MAX(0,blocked_bytes-CASE WHEN OLD.status='blocked' THEN COALESCE(OLD.size,0) ELSE 0 END),skipped_bytes=MAX(0,skipped_bytes-CASE WHEN OLD.status='skipped' THEN COALESCE(OLD.size,0) ELSE 0 END),queued_bytes=MAX(0,queued_bytes-CASE WHEN OLD.status='queued' THEN COALESCE(OLD.size,0) ELSE 0 END),pending_bytes=MAX(0,pending_bytes-CASE WHEN OLD.status='pending' THEN COALESCE(OLD.size,0) ELSE 0 END) WHERE id=1; END` },
    { sql: `UPDATE tg_aggregate SET (total,done,failed,blocked,skipped,queued,pending,bytes,failed_bytes,blocked_bytes,skipped_bytes,queued_bytes,pending_bytes,initialized)=(SELECT COUNT(*),COALESCE(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='done' THEN COALESCE(size,0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='failed' THEN COALESCE(size,0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='blocked' THEN COALESCE(size,0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='skipped' THEN COALESCE(size,0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='queued' THEN COALESCE(size,0) ELSE 0 END),0),COALESCE(SUM(CASE WHEN status='pending' THEN COALESCE(size,0) ELSE 0 END),0),1 FROM tg_store) WHERE id=1 AND initialized=0` }
  ]);
  ensureSchema.done = true;
}
async function incSetting(env, key, delta) { await setSetting(env, key, String((parseInt(await getSetting(env, key, '0'), 10) || 0) + (delta || 0))); }
async function getVideoCount(env){const raw=await getSetting(env,'approx_videos_seen','__missing__');if(raw!=='__missing__'&&raw!==''&&Number.isFinite(Number(raw)))return Math.max(0,parseInt(raw,10)||0);const r=rowsToObjects(await turso(env,'SELECT COUNT(*) AS n FROM videos',[]));const n=Math.max(0,Number(r[0]?.n||0));await setSetting(env,'approx_videos_seen',String(n)).catch(()=>{});return n;}
async function adjustVideoCount(env,delta){if(!delta)return;try{const n=await getVideoCount(env);await setSetting(env,'approx_videos_seen',String(Math.max(0,n+delta)));}catch(e){}}

// ───────────────────────── Collector ─────────────────────────
function quotaDayKey() { try { const p = new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).reduce((a,p)=>(a[p.type]=p.value,a),{}); return `${p.year}-${p.month}-${p.day}`; } catch { return new Date().toISOString().slice(0,10); } }
async function getQuotaUsed(env) { const d = quotaDayKey(); if (await getSetting(env,'yt_quota_day','') !== d) { await setSetting(env,'yt_quota_day',d); await setSetting(env,'yt_quota_used','0'); return 0; } return parseInt(await getSetting(env,'yt_quota_used','0'),10) || 0; }
async function canSpendQuota(env, units) { return (await getQuotaUsed(env)) + units <= envInt(env, 'YT_DAILY_QUOTA', YT_DAILY_QUOTA_UNITS, 1000, 1000000) - envInt(env, 'YT_QUOTA_SAFETY', YT_QUOTA_SAFETY_UNITS, 0, 5000); }
async function spendQuota(env, units) { await setSetting(env, 'yt_quota_used', String((await getQuotaUsed(env)) + units)); }

async function collect(env, opts = {}) {
  if (!env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY missing');
  try { await setSetting(env, 'last_collect_at', String(Date.now())); } catch (e) {}
  const out = { youtubeSearchCalls: 0, youtubeInserted: 0, rssChecked: 0, rssInserted: 0, notes: [] };
  const maxSearchCalls = opts.maxSearchCalls ?? envInt(env, 'YT_SEARCH_PER_COLLECT', MAX_SEARCH_CALLS_PER_COLLECT, 0, 3);
  const searchThrottleMs = envInt(env, 'YT_SEARCH_THROTTLE_MIN', 30, 1, 240) * 60 * 1000;
  const cats = await rotateCategories(env, maxSearchCalls);
  const _backUntil = Number(await getSetting(env, 'yt_backoff_until', '0') || 0);
  let _lastSearch = Number(await getSetting(env, 'yt_last_search_at', '0') || 0);
  if (Date.now() < _backUntil) out.notes.push('yt backoff ' + Math.ceil((_backUntil - Date.now()) / 60000) + 'm more');
  else if (Date.now() - _lastSearch < searchThrottleMs) out.notes.push('search throttle (' + Math.round(searchThrottleMs / 60000) + 'm)');
  for (const cat of cats) {
    if (out.youtubeSearchCalls >= maxSearchCalls) break;
    if (sfLeft() < 14) { out.notes.push('subrequest budget: search stop'); break; }
    if (Date.now() < _backUntil) { out.notes.push('quota backoff stop'); break; }
    if (Date.now() - _lastSearch < searchThrottleMs) { out.notes.push('search throttle stop'); break; }
    if (!(await canSpendQuota(env, YT_SEARCH_COST + YT_VIDEOS_COST))) { out.notes.push('quota guard stop'); break; }
    try {
      const r = await collectCategory(env, cat);
      out.youtubeSearchCalls += r.calls || 0;
      out.youtubeInserted += r.inserted || 0;
      if (r.calls) _lastSearch = Date.now();      // throttle must apply within this run too
      if (r.error) out.notes.push(r.error);
    } catch (e) { out.notes.push('collectCategory: ' + String(e.message || e).slice(0,160)); }
  }
  if (out.youtubeSearchCalls > 0) { try { await setSetting(env, 'yt_last_search_at', String(_lastSearch)); } catch (e) {} }
  if (sfLeft() < 14) {
    out.notes.push('subrequest budget: RSS/enrich skipped');
  } else {
    const wantRss = opts.rssLimit ?? envInt(env, 'YT_RSS_PER_COLLECT', RSS_CHANNELS_PER_COLLECT, 0, 20);
    const rss = await collectRss(env, Math.min(wantRss, Math.max(0, sfLeft() - 12)));
    out.rssChecked = rss.checked; out.rssInserted = rss.inserted;
    if (rss.skippedForBudget) out.notes.push('rss: budget stop');
    if (sfLeft() >= 8) out.enrich = await enrichRecent(env).catch(e => ({ error: String(e) }));
    else out.notes.push('enrich skipped (budget)');
  }
  out.quotaUsed = await getQuotaUsed(env);
  out.subrequestsUsed = SF_REQ.count;
  out.subrequestsLimit = SF_REQ.limit;
  out.prune = sfLeft() >= 4 ? await maybePruneDb(env) : { skipped: true, note: 'budget' };
  await setSetting(env, 'last_collect_result', JSON.stringify(out).slice(0, 2000));
  return out;
}

async function rotateCategories(env, takeCount) {
  const day = quotaDayKey();
  const keys = Object.keys(CATEGORIES).filter(k => !EXCLUDED_CATEGORIES.has(k));
  let savedDay = await getSetting(env,'cat_order_day','');
  let order = [];
  try { order = JSON.parse(await getSetting(env,'cat_order','[]')) || []; } catch {}
  if (savedDay !== day || !order.length) {
    order = seededShuffle(keys, day);
    await setSetting(env,'cat_order_day',day);
    await setSetting(env,'cat_order',JSON.stringify(order));
    await setSetting(env,'cat_cursor','0');
  }
  const idx = parseInt(await getSetting(env,'cat_cursor','0'),10) || 0;
  const picked = [];
  for (let i=0;i<Math.min(takeCount,order.length);i++) picked.push(order[(idx+i)%order.length]);
  await setSetting(env,'cat_cursor',String((idx+Math.max(1,takeCount))%Math.max(1,order.length)));
  return picked;
}
function seededShuffle(arr, seedText) { const a=[...arr]; let seed=2166136261; for(const ch of seedText){seed^=ch.charCodeAt(0);seed=Math.imul(seed,16777619);} function rnd(){seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;} for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function hindiQuery(q) { q = String(q || ''); return /\bhindi\b|हिंदी|हिन्दी/i.test(q) ? q : `${q} Hindi`; }
function categorySearchQuery(cat) { const arr = QUERY_VARIANTS[cat] || [CATEGORIES[cat] || CATEGORIES.trending]; const idx = Math.floor(Date.now() / (6 * 60 * 60 * 1000)) % arr.length; return hindiQuery(arr[idx]); }
function parseIsoDurationSeconds(iso) { const m=String(iso||'').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (parseInt(m[1]||0)*3600 + parseInt(m[2]||0)*60 + parseInt(m[3]||0)) : 0; }
async function verifyShortIds(env, ids) {
  // Returns a Set of verified short ids, or null when verification could not run
  // (no quota / no budget / HTTP error). null means "do not filter", so a hiccup
  // never silently empties the collector.
  try {
    ids = [...new Set(ids.map(cleanVideoId).filter(Boolean))].slice(0,50);
    if (!ids.length) return new Set();
    if (sfLeft() < 4 || !(await canSpendQuota(env, YT_VIDEOS_COST))) return null;
    const params = new URLSearchParams({ part:'contentDetails,status,snippet', id:ids.join(','), key:env.YOUTUBE_API_KEY });
    const res = await sfFetch('https://www.googleapis.com/youtube/v3/videos?' + params.toString());
    if (!res.ok) return null;
    await spendQuota(env, YT_VIDEOS_COST);
    const data = await res.json().catch(()=>({}));
    const ok = new Set();
    for (const it of data.items || []) {
      const dur = parseIsoDurationSeconds(it.contentDetails?.duration);
      const lang = String(it.snippet?.defaultAudioLanguage || it.snippet?.defaultLanguage || '').toLowerCase();
      const langOk = !lang || lang.startsWith('hi') || lang.startsWith('en');
      if (it.status?.embeddable !== false && langOk && dur > 0 && dur <= 60) ok.add(String(it.id));
    }
    return ok;
  } catch (e) { console.warn('verifyShortIds failed', e); return null; }
}
async function collectCategory(env, cat) {
  const tokenKey = `yt_page_${cat}`;
  const pageToken = await getSetting(env, tokenKey, '');
  const params = new URLSearchParams({ part:'snippet', type:'video', videoDuration:'short', videoEmbeddable:'true', maxResults:'50', q:categorySearchQuery(cat), key:env.YOUTUBE_API_KEY, order:'relevance', relevanceLanguage:'hi', regionCode:'IN' });
  if (pageToken) params.set('pageToken', pageToken);
  let res;
  try { res = await sfFetch('https://www.googleapis.com/youtube/v3/search?' + params.toString()); } catch(e) { return { calls:0, inserted:0, error:'YouTube fetch failed: '+String(e.message||e).slice(0,120) }; }
  await spendQuota(env, YT_SEARCH_COST);
  if (!res.ok) { if (res.status === 403 || res.status === 429) { try { await setSetting(env, 'yt_backoff_until', String(Date.now() + 90 * 60 * 1000)); } catch (e) {} } return { calls:1, inserted:0, error:`YouTube ${res.status}` }; }
  const data = await res.json();
  await setSetting(env, tokenKey, data.nextPageToken || '');
  const raw = (data.items || []).filter(it => it?.id?.videoId);
  const shortIds = await verifyShortIds(env, raw.map(it => it.id.videoId));
  const videos = raw.filter(it => !shortIds || shortIds.has(it.id.videoId)).map(it => ({
    video_id: cleanVideoId(it.id.videoId), title: decodeHtml(it.snippet?.title || ''), channel_id: it.snippet?.channelId || '', channel_name: decodeHtml(it.snippet?.channelTitle || ''), thumb: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${it.id.videoId}/hqdefault.jpg`, source:'youtube_api', category:cat, added_at:Date.now()
  })).filter(v => v.video_id && !isBlockedContent(v) && isLikelyHindiFocused(v));
  const inserted = await insertVideosAndChannels(env, videos);
  return { calls:1, inserted };
}
async function collectRss(env, limit) {
  // Trusted RSS source = channels that at least one user follows.
  // This avoids random discovered channels polluting the feed.
  const channels = rowsToObjects(await turso(env, `SELECT f.channel_id,
      COALESCE(c.channel_name, f.channel_name, '') AS channel_name,
      COALESCE(c.last_rss_at, 0) AS last_rss_at
    FROM (SELECT channel_id, MAX(channel_name) AS channel_name FROM follows GROUP BY channel_id) f
    LEFT JOIN channels c ON c.channel_id = f.channel_id
    ORDER BY COALESCE(c.last_rss_at, 0) ASC
    LIMIT ?`, [limit]));
  let checked=0; const allVideos=[]; const updates=[]; let skippedForBudget=false;
  for (const ch of channels) {
    if (sfLeft() < 12) { skippedForBudget = true; break; }   // leave room for inserts/cleanup
    const channelId = String(ch.channel_id || ''); if (!channelId) continue; checked++;
    try {
      const res = await sfFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { headers:{'User-Agent':'ShortsFireClean/1.0'} });
      updates.push({ sql:'INSERT INTO channels(channel_id,channel_name,added_at,last_rss_at) VALUES(?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET channel_name=COALESCE(excluded.channel_name, channel_name), last_rss_at=excluded.last_rss_at', args:[channelId, String(ch.channel_name||''), Date.now(), Date.now()] });
      if (!res.ok) continue;
      const xml = await res.text();
      allVideos.push(...parseRssVideos(xml, channelId, String(ch.channel_name || '')).filter(v => !isBlockedContent(v) && isLikelyHindiFocused(v)).slice(0,6));
    } catch(e) { console.warn('RSS failed', e); }
  }
  if (updates.length) await tursoBatch(env, updates);
  const inserted = allVideos.length ? await insertVideosAndChannels(env, allVideos) : 0;
  return { checked, inserted, skippedForBudget };
}
function parseRssVideos(xml, fallbackChannelId, fallbackChannelName) {
  const out=[];
  for (const raw of xml.split('<entry>').slice(1)) {
    const entry = raw.split('</entry>')[0] || raw;
    const videoId = cleanVideoId(matchXml(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/)); if (!videoId) continue;
    const title = decodeHtml(matchXml(entry, /<title>([\s\S]*?)<\/title>/) || '');
    if (!/#shorts|shorts|\bshort\b/i.test(title)) continue;
    const channelId = matchXml(entry, /<yt:channelId>([^<]+)<\/yt:channelId>/) || fallbackChannelId;
    const author = decodeHtml(matchXml(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/) || fallbackChannelName || '');
    const published = Date.parse(matchXml(entry, /<published>([^<]+)<\/published>/) || '') || Date.now();
    const thumb = matchXml(entry, /<media:thumbnail[^>]+url="([^"]+)"/) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    out.push({ video_id:videoId, title, channel_id:channelId, channel_name:author, thumb, source:'rss', category:'followed_channels', added_at:published });
  }
  return out;
}
function matchXml(s,re){const m=s.match(re);return m?m[1]:'';}
async function insertVideosAndChannels(env, videos) {
  const videoStmts=[],channelStmts=[]; const chSeen=new Set();
  for (const v of videos) {
    videoStmts.push({ sql:'INSERT OR IGNORE INTO videos(video_id,title,channel_id,channel_name,thumb,source,category,added_at) VALUES(?,?,?,?,?,?,?,?)', args:[v.video_id,v.title,v.channel_id,v.channel_name,v.thumb,v.source,v.category,v.added_at] });
    if (v.channel_id && !chSeen.has(v.channel_id)) { chSeen.add(v.channel_id); channelStmts.push({ sql:'INSERT OR IGNORE INTO channels(channel_id,channel_name,added_at,last_rss_at) VALUES(?,?,?,0)', args:[v.channel_id,v.channel_name||'',Date.now()] }); }
  }
  let inserted=0;
  for (let i=0;i<videoStmts.length;i+=90) { if (sfLeft()<2) break; const rs=await tursoBatch(env,videoStmts.slice(i,i+90)); for(const r of rs) inserted+=Number(r.affected_row_count||0); }
  for (let i=0;i<channelStmts.length;i+=90) { if (sfLeft()<1) break; await tursoBatch(env,channelStmts.slice(i,i+90)); }
  if(inserted)await adjustVideoCount(env,inserted);
  return inserted;
}

// ───────────────────────── Cleanup ─────────────────────────
async function maybePruneDb(env) { const last = Number(await getSetting(env,'last_prune_at','0')||0); return Date.now()-last < AUTO_PRUNE_COOLDOWN_MS ? { skipped:true } : await pruneDb(env); }
async function pruneDb(env) {
  const now=Date.now();
  const stmts=[
    { sql:'DELETE FROM video_events WHERE rowid IN (SELECT rowid FROM video_events WHERE created_at<? LIMIT ?)', args:[now-EVENTS_RETENTION_DAYS*86400000,PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM watched_videos WHERE rowid IN (SELECT rowid FROM watched_videos WHERE watched_at<? LIMIT ?)', args:[now-WATCHED_RETENTION_DAYS*86400000,PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM liked_videos WHERE rowid IN (SELECT rowid FROM liked_videos WHERE liked_at<? LIMIT ?)', args:[now-LIKES_RETENTION_DAYS*86400000,PRUNE_BATCH_SIZE] },
    { sql:`DELETE FROM videos WHERE rowid IN (SELECT rowid FROM videos WHERE category IN ('gaming','fitness','diy','art','dance','sufi','cooking','fashion','romantic','love_songs','chanakya','news','animals') LIMIT ?)`, args:[PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM video_events WHERE rowid IN (SELECT e.rowid FROM video_events e LEFT JOIN videos v ON v.video_id=e.video_id WHERE v.video_id IS NULL LIMIT ?)', args:[PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM video_quality WHERE rowid IN (SELECT q.rowid FROM video_quality q LEFT JOIN videos v ON v.video_id=q.video_id WHERE v.video_id IS NULL LIMIT ?)', args:[PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM bad_videos WHERE rowid IN (SELECT b.rowid FROM bad_videos b LEFT JOIN videos v ON v.video_id=b.video_id WHERE v.video_id IS NULL LIMIT ?)', args:[PRUNE_BATCH_SIZE] },
    { sql:'DELETE FROM videos WHERE rowid IN (SELECT rowid FROM videos ORDER BY added_at DESC LIMIT ? OFFSET ?)', args:[PRUNE_BATCH_SIZE,MAX_VIDEOS_IN_DB] },
    { sql:'DELETE FROM channels WHERE rowid IN (SELECT rowid FROM channels ORDER BY COALESCE(last_rss_at,0) DESC LIMIT ? OFFSET ?)', args:[PRUNE_BATCH_SIZE,MAX_CHANNELS_IN_DB] },
    { sql:'DELETE FROM bad_videos WHERE rowid IN (SELECT rowid FROM bad_videos ORDER BY updated_at DESC LIMIT ? OFFSET ?)', args:[PRUNE_BATCH_SIZE,MAX_BAD_VIDEOS] },
    { sql:'DELETE FROM video_quality WHERE rowid IN (SELECT rowid FROM video_quality ORDER BY updated_at DESC LIMIT ? OFFSET ?)', args:[PRUNE_BATCH_SIZE,MAX_QUALITY_ROWS] },
    { sql:'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', args:['last_prune_at',String(now)] },
    { sql:'INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', args:['last_prune_result',JSON.stringify({light:true,at:now})] }
  ];
  const rs=await tursoBatch(env, stmts);
  const removed=Number(rs[3]?.affected_row_count||0)+Number(rs[7]?.affected_row_count||0);
  if(removed)await adjustVideoCount(env,-removed);
  return { light:true, message:'cleanup batch completed', removed };
}

// ───────────────────────── Feed algorithm ─────────────────────────
function categoryGroup(cat) {
  cat=String(cat||'');
  if(['bhakti','geeta','bhajans','pravachan','katha','ramayan','mahabharat','krishna','radhakrishna_serial','hanuman','devotion','spiritual_quotes'].includes(cat))return 'spiritual';
  if(['sad_songs','heartbreak','shayari'].includes(cat))return 'emotion';
  if(['motivation','life_lessons','facts','psychology','psychology_tricks','dark_psychology','manipulation_awareness','dark_life_truths'].includes(cat))return 'growth';
  if(['comedy','hindi_film_comedy','comedy_quotes','public_comedy','peaceful_piano','aura_music','old_songs','attitude','attitude_songs','dialogue_status','music'].includes(cat))return 'entertainment';
  if(['science','tech'].includes(cat))return 'knowledge';
  if(['travel','sports'].includes(cat))return 'lifestyle';
  return 'general';
}
const STOP_KEYWORDS = new Set(['shorts','short','viral','status','video','videos','hindi','हिंदी','हिन्दी','official','new','latest','trending','best','full','part','the','and','for','with','subscribe','reels','ytshorts','youtube','don','your','you','are','this','that','what','how','why','kya','hai','hain','ka','ki','ke','ko','se','me','mein','par','aur','ya','to','ho','है','का','की','के','में','से','और','को','पर']);
function extractTitleKeywords(text,max=10){const tokens=String(text||'').toLowerCase().match(/[a-zA-Z][a-zA-Z0-9_]{2,}|[\u0900-\u097F]{2,}/g)||[];const out=[],seen=new Set();for(const t of tokens){if(!STOP_KEYWORDS.has(t)&&!seen.has(t)){seen.add(t);out.push(t);if(out.length>=max)break;}}return out;}
function currentTimeSlot(){let h=new Date().getUTCHours();try{h=parseInt(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false}).formatToParts(new Date()).find(p=>p.type==='hour')?.value||h,10);}catch{} if(h>=5&&h<11)return 'morning'; if(h>=11&&h<17)return 'day'; if(h>=17&&h<22)return 'evening'; return 'night';}
function moodCategoryBoost(cat, mood) {
  mood = cleanMood(mood);
  const map = {
    happy: ['comedy','hindi_film_comedy','comedy_quotes','public_comedy','old_songs','attitude','music'],
    sad: ['sad_songs','shayari','heartbreak','peaceful_piano','aura_music','bhakti','life_lessons'],
    very_sad: ['bhakti','geeta','pravachan','katha','peaceful_piano','aura_music','spiritual_quotes','sad_songs'],
    focus: ['psychology','psychology_tricks','dark_psychology','dark_life_truths','motivation','facts','science','tech','life_lessons'],
    bhakti: ['bhakti','geeta','bhajans','pravachan','katha','ramayan','mahabharat','krishna','radhakrishna_serial','hanuman','devotion','spiritual_quotes']
  };
  return (map[mood] || []).includes(cat) ? 55 : 0;
}

async function getFeed(env,userId,mood,limit,cursor,cats,lastCats,fatigue,lc2){
  const rankedLimit=Math.max(limit*3,160), sourceLimit=Math.max(rankedLimit,Math.min(360,limit*4)), perCatLimit=Math.max(4,Math.ceil(limit/6)), slot=currentTimeSlot();
  const useCats=(Array.isArray(cats)&&cats.length)?cats.slice(0,12):null;
  const catsSql=useCats?(' AND v.category IN ('+useCats.map(()=>'?').join(',')+')'):'';
  const catsArgs=useCats||[];
  const [kwRes, feedRes, fxRes, banditRes, affRes] = await tursoMany(env, [
    { sql:'SELECT keyword,score FROM user_keyword_prefs WHERE user_id=? AND score>0 ORDER BY score DESC LIMIT 50', args:[userId] },
    { sql:`WITH source AS (
      SELECT v.video_id,v.title,v.channel_id,v.channel_name,v.thumb,v.source,v.category,v.added_at,COALESCE(v.views,0) AS views,COALESCE(v.likes,0) AS likes,COALESCE(v.duration,0) AS duration,
      CASE WHEN l.video_id IS NULL THEN 0 ELSE 1 END AS liked,
      CASE WHEN f.channel_id IS NULL THEN 0 ELSE 1 END AS followed,
      COALESCE(p.score,0) pref_score, COALESCE(t.score,0) slot_score, COALESCE(mp.score,0) mood_score, COALESCE(cp.score,0) channel_score, COALESCE(q.score,0) quality_score
      FROM videos v
      LEFT JOIN liked_videos l ON l.user_id=? AND l.video_id=v.video_id
      LEFT JOIN follows f ON f.user_id=? AND f.channel_id=v.channel_id
      LEFT JOIN user_prefs p ON p.user_id=? AND p.category=v.category
      LEFT JOIN user_context_prefs t ON t.user_id=? AND t.slot=? AND t.category=v.category
      LEFT JOIN user_mood_prefs mp ON mp.user_id=? AND mp.mood=? AND mp.category=v.category
      LEFT JOIN user_channel_prefs cp ON cp.user_id=? AND cp.channel_id=v.channel_id
      LEFT JOIN video_quality q ON q.video_id=v.video_id
      WHERE v.added_at<? AND v.category NOT IN ('gaming','fitness','diy','art','dance','sufi','cooking','fashion','romantic','love_songs','chanakya','news','animals')
      AND ${blockedSqlCondition('v')}${catsSql}
      AND NOT EXISTS (SELECT 1 FROM watched_videos w WHERE w.user_id=? AND w.video_id=v.video_id)
      AND NOT EXISTS (SELECT 1 FROM bad_videos b WHERE b.video_id=v.video_id)
      ORDER BY v.added_at DESC LIMIT ?
    ), balanced AS (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY category ORDER BY added_at DESC) cat_rn, ROW_NUMBER() OVER(PARTITION BY channel_id ORDER BY added_at DESC) ch_rn, MIN(added_at) OVER() window_cursor FROM source
    ), recent AS (SELECT * FROM balanced WHERE cat_rn<=? AND ch_rn<=3), ranked AS (
      SELECT *, (CASE WHEN followed=1 THEN 160 ELSE 0 END + MIN(80,MAX(-50,channel_score))*0.8 + MIN(70,MAX(-40,pref_score))*0.7 + MIN(70,MAX(-40,slot_score))*0.9 + MIN(90,MAX(-50,mood_score))*1.25 + MIN(120,MAX(-200,quality_score))*0.9 + CASE WHEN added_at>? THEN 90 ELSE 0 END + (ABS(RANDOM())%90)) rank_score FROM recent
    ) SELECT * FROM ranked ORDER BY rank_score DESC, added_at DESC LIMIT ?`,
      args:[userId,userId,userId,userId,slot,userId,mood,userId,cursor,userId,...catsArgs,sourceLimit,perCatLimit,Date.now()-3*86400000,rankedLimit] },
    { sql:'SELECT cat, SUM(sum) AS s, SUM(n) AS n FROM mood_cat_effects WHERE user_id=? AND updated_at>? GROUP BY cat', args:[userId, Date.now()-14*86400000] },
    { sql:'SELECT cat,n,w FROM cat_bandit WHERE user_id=? AND mood=? AND n>0 LIMIT 40', args:[userId, mood] },
    { sql:'SELECT cat_a,cat_b,w FROM cat_affinity WHERE user_id=? AND updated_at>? ORDER BY w DESC LIMIT 150', args:[userId, Date.now()-30*86400000] }
  ]);
  const kwPrefs=new Map(rowsToObjects(kwRes).map(r=>[String(r.keyword),Number(r.score||0)]));
  const fxMap=new Map(rowsToObjects(fxRes).filter(r=>Number(r.n)>=3).map(r=>[String(r.cat),Math.max(-35,Math.min(35,Math.round(Number(r.s)/Number(r.n)*25)))]));
  const seqSet=new Set(lastCats||[]);const seqCnt=new Map((lc2||[]).map(e=>[e.cat,e.n]));const haveLc2=!!(lc2&&lc2.length);
  const banditRows=rowsToObjects(banditRes);const bnTot=banditRows.reduce((acc,r)=>acc+Number(r.n||0),0);
  function _gN(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  function _gS(k){if(k<1){return _gS(k+1)*Math.pow(Math.random(),1/k);}const d=k-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=_gN();v=1+c*x;}while(v<=0);v=v*v*v;const u=Math.random();if(u<1-0.0331*x*x*x*x)return d*v;if(Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;}}
  const banditMap=new Map(banditRows.map(r=>{const n=Math.max(1,Number(r.n||1));const ageD=Math.max(0,(Date.now()-Number(r.updated_at||Date.now()))/86400000);const dec=Math.pow(0.5,ageD/30);const nD=n*dec;const succ=Math.max(0.01,(Number(r.w||0)*dec)/100);const fail=Math.max(0.01,nD-succ);let smp=0.5;try{const gx=_gS(succ),gy=_gS(fail);smp=gx/(gx+gy);}catch(e){}if(!isFinite(smp))smp=0.5;return[String(r.cat),Math.max(-14,Math.min(14,(smp-0.5)*10))];}));
  const afMap=new Map();for(const r of rowsToObjects(affRes)){const aa=String(r.cat_a),bb=String(r.cat_b),w=Number(r.w||0);if(!w)continue;if(seqSet.has(aa))afMap.set(bb,(afMap.get(bb)||0)+w);if(seqSet.has(bb))afMap.set(aa,(afMap.get(aa)||0)+w);}
  const fxW=(['sad','stressed','lonely','angry','anxious'].indexOf(mood)>=0)?1.6:1;
  const _tri=s=>{const t=new Set();const w=' '+String(s).toLowerCase()+' ';for(let i=0;i<w.length-2;i++)t.add(w.slice(i,i+3));return t;};
  const userTris=[];kwPrefs.forEach((sc,kw)=>{if(sc>0&&userTris.length<30)userTris.push({t:_tri(kw),s:sc});});
  function semScoreOf(title){if(!userTris.length)return 0;let sum=0;const kws=extractTitleKeywords(title,6);for(const kw of kws){const kt=_tri(kw);let best=0,bs=0;for(const u of userTris){let inter=0;kt.forEach(g=>{if(u.t.has(g))inter++;});const j=inter/(kt.size+u.t.size-inter);if(j>best){best=j;bs=u.s;}}if(best>=0.45)sum+=Math.min(16,bs/12*Math.min(1,best));}return Math.min(50,sum);}
  const rows=rowsToObjects(feedRes);
  const mapped=rows.map(r=>({id:String(r.video_id),title:String(r.title||''),chId:String(r.channel_id||''),ch:String(r.channel_name||''),thumb:String(r.thumb||`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`),source:String(r.source||''),cat:String(r.category||''),group:categoryGroup(r.category),added_at:Number(r.added_at||0),liked:Number(r.liked||0)===1,followed:Number(r.followed||0)===1,prefScore:Number(r.pref_score||0),slotScore:Number(r.slot_score||0),moodScore:Number(r.mood_score||0),channelScore:Number(r.channel_score||0),qualityScore:Number(r.quality_score||0),qEff:(function(){const q0=Number(r.quality_score||0);return q0*Math.abs(q0)/(Math.abs(q0)+25);})(),views:Number(r.views||0),likes:Number(r.likes||0),duration:Number(r.duration||0),titlePen:titleQualityPenalty(r.title),keywordScore:scoreTitleKeywords(r.title,kwPrefs),semScore:semScoreOf(r.title),moodBoost:moodCategoryBoost(String(r.category||''),mood),fxBoost:fxMap.get(String(r.category||''))||0,agePen:Math.min(60,Math.floor(Math.max(0,Date.now()-Number(r.added_at||0))/86400000*3)),seqPen:(function(){const c2=String(r.category||'');if(haveLc2){const k=seqCnt.get(c2)||0;return k>=3?0:k===2?5:k===1?12:0;}return seqSet.has(c2)?15:0;})(),momBoost:(function(){const c2=String(r.category||'');if(!haveLc2)return 0;const k=seqCnt.get(c2)||0;return k>=3?7:k===2?4:0;})(),banditBoost:banditMap.get(String(r.category||''))||0,afBoost:Math.min(12,(afMap.get(String(r.category||''))||0)*1.5),unexplored:(Number(r.quality_score||0)===0&&Number(r.views||0)===0)}));
  engagementBoost(mapped);
  for(let i=mapped.length-1;i>=0;i--){if(!mapped[i].followed&&mapped[i].channelScore<=-120)mapped.splice(i,1);}
  const tau=26+(fatigue?30:0)+(bnTot<50?20:0);const _gum=()=>{let u=Math.random();while(!u)u=Math.random();return tau*(-Math.log(-Math.log(u)));};mapped.forEach(v=>{v._g=_gum();});
  if(!useCats)mapped.sort((a,b)=>((b.keywordScore||0)+(b.moodScore||0)*0.35+(b.prefScore||0)*0.2+(b.moodBoost||0)+(b.engBoost||0)+(b.fxBoost||0)*fxW+(b.banditBoost||0)+(b.afBoost||0)+(b.semScore||0)+(b.momBoost||0)+(b.velBoost||0)-(b.titlePen||0)-(b.agePen||0)-(b.seqPen||0)+(b._g||0))-((a.keywordScore||0)+(a.moodScore||0)*0.35+(a.prefScore||0)*0.2+(a.moodBoost||0)+(a.engBoost||0)+(a.fxBoost||0)*fxW+(a.banditBoost||0)+(a.afBoost||0)+(a.semScore||0)+(a.momBoost||0)+(a.velBoost||0)-(a.titlePen||0)-(a.agePen||0)-(a.seqPen||0)+(a._g||0)));
  const videos=mixFeed(mapped,limit,fatigue);
  await attachTgSources(env,videos).catch(()=>{});
  const nextCursor=rows.length?Math.min(...rows.map(r=>Number(r.window_cursor||r.added_at||cursor))):cursor-1;
  return { videos, nextCursor: nextCursor<cursor?nextCursor:cursor-1 };
}
function scoreTitleKeywords(title,kwPrefs){let s=0;for(const k of extractTitleKeywordsV2(title,12)){s+=k.includes(' ')?10:Math.min(30,kwPrefs.get(k)||0);}return Math.min(140,s);}
function inferTopGroups(list){const m=new Map();for(const v of list){const g=v.group||categoryGroup(v.cat);const val=Math.max(0,v.prefScore||0)+Math.max(0,v.slotScore||0)+Math.max(0,v.moodScore||0)+Math.max(0,v.channelScore||0);m.set(g,(m.get(g)||0)+val);}return new Set([...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]));}
function mixFeed(list,limit,fatigue){
  const directMax=Math.max(1,Math.floor(limit*0.40)), freshMax=limit-directMax, topGroups=inferTopGroups(list);
  const direct=[], fresh=[]; const seen=new Set();
  for(const v of list){if(!v||seen.has(v.id))continue;seen.add(v.id);(v.followed||v.liked?direct:fresh).push(v);}
  const buckets={taste:[],quality:[],related:[],explore:[],wild:[]};
  for(const v of fresh){const score=(v.prefScore||0)+(v.slotScore||0)+(v.moodScore||0)+(v.channelScore||0)+(v.keywordScore||0)+(v.moodBoost||0)+(v.engBoost||0)+(v.fxBoost||0)+(v.banditBoost||0)+(v.afBoost||0)+(v.semScore||0)+(v.momBoost||0)+(v.velBoost||0)+(v.unexplored?12:0)-(v.titlePen||0)-(v.agePen||0)-(v.seqPen||0); if(score>=35)buckets.taste.push(v); else if((v.qEff||0)>=20)buckets.quality.push(v); else if(topGroups.has(v.group))buckets.related.push(v); else buckets.explore.push(v);}
  buckets.wild=seededShuffle([...buckets.explore].reverse(),'wild').slice(0,Math.ceil(freshMax*.08)*3);
  const directMixed=diversify(direct,directMax), freshMixed=[];
  const caps=fatigue?{taste:Math.floor(freshMax*.25),quality:Math.floor(freshMax*.40),related:Math.floor(freshMax*.17),wild:1}:{taste:Math.floor(freshMax*.45),quality:Math.floor(freshMax*.18),related:Math.floor(freshMax*.17),wild:Math.max(1,Math.floor(freshMax*.08))}; caps.explore=Math.max(0,freshMax-caps.taste-caps.quality-caps.related-caps.wild);
  const idx={taste:0,quality:0,related:0,explore:0,wild:0}; if(buckets.explore.length)buckets.explore.sort((x,y)=>(y.afBoost||0)-(x.afBoost||0));
  Object.keys(caps).forEach(k=>buckets[k]=diversify(buckets[k],caps[k]));
  const pat=['taste','explore','quality','taste','related','explore','wild']; while(freshMixed.length<freshMax){let add=false;for(const b of pat){if(freshMixed.length>=freshMax)break;if(idx[b]<buckets[b].length){freshMixed.push(buckets[b][idx[b]++]);add=true;}}if(!add)break;}
  const usedFresh=new Set(freshMixed.map(v=>v.id)); for(const v of fresh){if(freshMixed.length>=freshMax)break;if(!usedFresh.has(v.id))freshMixed.push(v);}
  const out=[];let fi=0,di=0;while(out.length<limit&&(fi<freshMixed.length||di<directMixed.length)){for(let i=0;i<3&&out.length<limit&&fi<freshMixed.length;i++)out.push(freshMixed[fi++]);for(let i=0;i<2&&out.length<limit&&di<directMixed.length;i++)out.push(directMixed[di++]);}
  const used=new Set(out.map(v=>v.id));for(const v of list){if(out.length>=limit)break;if(!used.has(v.id)){out.push(v);used.add(v.id);}}
  const dout=diversify(out,limit).slice(0,limit);
  for(let i2=2;i2<dout.length;i2++){if(dout[i2].cat===dout[i2-1].cat&&dout[i2].cat===dout[i2-2].cat){for(let j2=i2+1;j2<dout.length;j2++){if(dout[j2].cat!==dout[i2].cat){const tmp=dout[i2];dout[i2]=dout[j2];dout[j2]=tmp;break;}}}}
  return dout;
}
function diversify(list,limit){const pool=[...list],out=[],cats=[],groups=[],chs=[],catCnt=new Map(),grpCnt=new Map(),maxCat=Math.max(2,Math.ceil(limit*.16)),maxGrp=Math.max(4,Math.ceil(limit*.34));while(out.length<limit&&pool.length){let pick=-1;for(let i=0;i<pool.length;i++){const v=pool[i],g=v.group||categoryGroup(v.cat);if((catCnt.get(v.cat)||0)<maxCat&&(grpCnt.get(g)||0)<maxGrp&&!cats.includes(v.cat)&&!groups.includes(g)&&!chs.includes(v.chId)){pick=i;break;}}if(pick<0)pick=0;const[v]=pool.splice(pick,1),g=v.group||categoryGroup(v.cat);out.push(v);catCnt.set(v.cat,(catCnt.get(v.cat)||0)+1);grpCnt.set(g,(grpCnt.get(g)||0)+1);cats.push(v.cat);if(cats.length>4)cats.shift();groups.push(g);if(groups.length>3)groups.shift();chs.push(v.chId);if(chs.length>3)chs.shift();}return out;}

// ───────────────────────── Signals/stats/filters ─────────────────────────
async function recordSignal(env,userId,videoId,event,value,mood='focus',lastCats=null,info=null){
  let catDelta=0,chDelta=0;
  if(event==='watch_ms'){const sec=Math.max(0,value)/1000;if(sec<2.5){catDelta=-5;chDelta=-8;}else if(sec<7){catDelta=1;chDelta=1;}else if(sec<18){catDelta=4;chDelta=5;}else{catDelta=7;chDelta=9;}}
  else if(event==='like'||event==='double_like'){catDelta=12;chDelta=18;} else if(event==='more_like_this'){catDelta=28;chDelta=32;} else if(event==='not_interested'){catDelta=-28;chDelta=-36;} else if(event==='unlike'){catDelta=-6;chDelta=-8;} else if(event==='share'){catDelta=16;chDelta=24;} else if(event==='skip'){catDelta=-7;chDelta=-11;} else if(event==='pause_resume'){catDelta=7;chDelta=9;}
  const qDelta=event==='not_interested'?-45:event==='more_like_this'?35:event==='skip'?-8:event==='share'?25:(event==='like'||event==='double_like')?18:event==='watch_ms'?Math.max(-8,Math.min(12,Math.round((value||0)/2500))):0;
  let v={category:info&&info.cat?String(info.cat):'',channel_id:info&&info.chId?String(info.chId):'',title:info&&info.title?String(info.title):'',duration:0};if(!info||!info.cat){const rows=rowsToObjects(await turso(env,'SELECT category,channel_id,title,duration FROM videos WHERE video_id=? LIMIT 1',[videoId]));v=rows[0]||{};} const cat=String(v.category||'trending'), ch=String(v.channel_id||''), keys=extractTitleKeywords(v.title,8);
  let finalQ=qDelta;
  if(event==='watch_ms'){const dur=Number(v.duration||0);const sec=Math.max(0,value)/1000;
    if(dur>0){const comp=sec/dur;
      if(comp<0.25){catDelta=-5;chDelta=-8;}else if(comp<0.6){catDelta=3;chDelta=4;}else if(comp<0.9){catDelta=6;chDelta=8;}else{catDelta=8;chDelta=11;}
      finalQ=comp<0.25?-7:comp<0.6?4:comp<0.9?8:11;
    }
  }
  const now=Date.now();const stmts=[{sql:'INSERT INTO video_events(user_id,video_id,event,value,created_at) VALUES(?,?,?,?,?)',args:[userId,videoId,event,value||0,now]}];
  if(catDelta){stmts.push({sql:`INSERT INTO user_prefs(user_id,category,score,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET score=MAX(-200,MIN(800,CAST(score*0.98 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[userId,cat,catDelta,now]});stmts.push({sql:`INSERT INTO user_context_prefs(user_id,slot,category,score,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,slot,category) DO UPDATE SET score=MAX(-200,MIN(800,CAST(score*0.98 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[userId,currentTimeSlot(),cat,Math.round(catDelta*1.2),now]});stmts.push({sql:`INSERT INTO user_mood_prefs(user_id,mood,category,score,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,mood,category) DO UPDATE SET score=MAX(-200,MIN(800,CAST(score*0.98 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[userId,cleanMood(mood),cat,Math.round(catDelta*1.35),now]});for(const k of keys)stmts.push({sql:`INSERT INTO user_keyword_prefs(user_id,keyword,score,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,keyword) DO UPDATE SET score=MAX(-100,MIN(500,CAST(score*0.96 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[userId,k,Math.round(catDelta*1.1),now]});}
  if(ch&&chDelta)stmts.push({sql:`INSERT INTO user_channel_prefs(user_id,channel_id,score,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,channel_id) DO UPDATE SET score=MAX(-200,MIN(800,CAST(score*0.98 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[userId,ch,chDelta,now]});
  if(finalQ)stmts.push({sql:`INSERT INTO video_quality(video_id,score,updated_at) VALUES(?,?,?) ON CONFLICT(video_id) DO UPDATE SET score=MAX(-1000,MIN(1000,CAST(score*0.99 AS INTEGER)+excluded.score)),updated_at=excluded.updated_at`,args:[videoId,finalQ,now]});
  let o=0.5;if(event==='like'||event==='double_like'||event==='more_like_this'||event==='share')o=1;else if(event==='not_interested')o=0;else if(event==='unlike')o=0.1;else if(event==='skip')o=0.15;else if(event==='watch_ms'){const dur2=Number(v.duration||0),sec2=Math.max(0,value)/1000;const comp=dur2>0?Math.min(1,sec2/dur2):Math.min(1,sec2/30);o=0.15+0.85*comp;}
  stmts.push({sql:`INSERT INTO cat_bandit(user_id,mood,cat,n,w,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(user_id,mood,cat) DO UPDATE SET n=n+1,w=w+excluded.w,updated_at=excluded.updated_at`,args:[userId,cleanMood(mood),cat,Math.round(o*100),now]});
  if(event==='watch_ms'&&finalQ>0&&Array.isArray(lastCats)){for(const ax of lastCats.slice(0,3)){if(ax&&ax!==cat)stmts.push({sql:`INSERT INTO cat_affinity(user_id,cat_a,cat_b,w,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,cat_a,cat_b) DO UPDATE SET w=CAST(w*0.97 AS REAL)+excluded.w,updated_at=excluded.updated_at`,args:[userId,cat,ax,1,now]});}}
  if(stmts.length)await tursoBatch(env,stmts);
}
async function getStats(env,userId){const [p,sp,kp,mp]=await tursoMany(env,[{sql:'SELECT category,score FROM user_prefs WHERE user_id=? ORDER BY score DESC LIMIT 6',args:[userId]},{sql:'SELECT category,score FROM user_context_prefs WHERE user_id=? AND slot=? ORDER BY score DESC LIMIT 5',args:[userId,currentTimeSlot()]},{sql:'SELECT keyword,score FROM user_keyword_prefs WHERE user_id=? AND score>0 ORDER BY score DESC LIMIT 8',args:[userId]},{sql:'SELECT mood,category,score FROM user_mood_prefs WHERE user_id=? AND score>0 ORDER BY score DESC LIMIT 8',args:[userId]}]);return{videos:Number(await getSetting(env,'approx_videos_seen','0')||0),watched:'saved',liked:'saved',follows:'saved',channels:'auto',topPrefs:rowsToObjects(p).map(x=>`${x.category}:${x.score}`).join(', '),currentSlot:currentTimeSlot(),slotPrefs:rowsToObjects(sp).map(x=>`${x.category}:${x.score}`).join(', '),topKeywords:rowsToObjects(kp).map(x=>`${x.keyword}:${x.score}`).join(', '),moodPrefs:rowsToObjects(mp).map(x=>`${x.mood}/${x.category}:${x.score}`).join(', '),quotaUsed:Number(await getSetting(env,'yt_quota_used','0')||0),lastCollectAt:Number(await getSetting(env,'last_collect_at','0')||0),lastPruneAt:Number(await getSetting(env,'last_prune_at','0')||0),maxVideosInDb:MAX_VIDEOS_IN_DB,maxChannelsInDb:MAX_CHANNELS_IN_DB,maxWatchedPerUser:MAX_WATCHED_PER_USER};}
function hasBlockedScript(raw){return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0400-\u04FF]/.test(String(raw||''));}
function isBlockedContent(v){const raw=`${v?.title||''} ${v?.channel_name||''} ${v?.category||''}`,text=raw.toLowerCase();return hasBlockedScript(raw)||BLOCKED_TEXT_TERMS.some(t=>text.includes(t));}
function isLikelyHindiFocused(v){const raw=`${v?.title||''} ${v?.channel_name||''} ${v?.category||''}`,text=raw.toLowerCase();return /[\u0900-\u097F]/.test(raw)||/hindi|bhakti|geeta|gita|krishna|radha|radhakrishna|hanuman|ramayan|mahabharat|pravachan|katha|bhajan|gyan|motivation|psychology|shayari|sad|attitude|status|facts|life|truth|serial|episode|episodes|bharat|desi|bollywood|comedy|funny|piano|aura|peaceful|relaxing|old song|old songs|evergreen/.test(text);}
function blockedSqlCondition(alias='v'){const raw=`COALESCE(${alias}.title,'') || ' ' || COALESCE(${alias}.channel_name,'') || ' ' || COALESCE(${alias}.category,'')`;const expr=`LOWER(${raw})`;const terms=BLOCKED_TEXT_TERMS.map(t=>`${expr} NOT LIKE '%${t.replace(/'/g,"''")}%'`);terms.push(`${raw} NOT GLOB '*[؀-ۿ]*'`,`${raw} NOT GLOB '*[ݐ-ݿ]*'`,`${raw} NOT GLOB '*[Ѐ-ӿ]*'`,`${raw} NOT GLOB '*[一-鿿]*'`,`${raw} NOT GLOB '*[぀-ヿ]*'`,`${raw} NOT GLOB '*[가-힯]*'`,`${raw} NOT GLOB '*[฀-๿]*'`);return terms.join(' AND ');}

// ───────────────────────── Utils ─────────────────────────
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function html(s){return new Response(s,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
function clamp(n,min,max){return Math.max(min,Math.min(max,Number.isFinite(n)?n:min));}
function envInt(env,key,dflt,min,max){const v=parseInt(env&&env[key],10);return Number.isFinite(v)?clamp(v,min,max):dflt;}
function memoCopy(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function memoDbKey(env,key){return String(env.TURSO_DATABASE_URL||'')+'|'+key;}
async function scheduleFeedAuto(env,ctx,origin){if(!tgEnabled(env)||String(env.TG_AUTO||'1')==='0'||tgAutoInFlight)return;const gap=envInt(env,'TG_AUTO_GAP_SEC',90,30,3600)*1000,hasCache=typeof caches!=='undefined'&&!!caches.default;let marker=null;if(hasCache){const now=Date.now();if(now<tgAutoCheckAt)return;tgAutoCheckAt=now+gap;marker=await memoRequest(origin,memoDbKey(env,'feed-auto:v1'),'auto');if(marker){try{if(await caches.default.match(marker))return;}catch(e){}}}const last=parseInt(await getSetting(env,'tg_last_run_at','0'),10)||0;if(marker)try{await caches.default.put(marker,new Response('1',{headers:{'cache-control':'public, max-age='+Math.ceil(gap/1000)}}));}catch(e){}if(Date.now()-last<=gap)return;tgAutoInFlight=true;try{ctx.waitUntil(Promise.resolve(tgPipeline(env,{budget:envInt(env,'TG_AUTO_BUDGET',1,1,6),order:'mix',parallel:envInt(env,'TG_PARALLEL',1,1,4)})).catch(()=>{}).finally(()=>{tgAutoInFlight=false;}));}catch(e){tgAutoInFlight=false;}}
async function memoRequest(origin,key,kind){try{if(typeof caches==='undefined'||!caches.default||!globalThis.crypto?.subtle)return null;const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));const h=Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,'0')).join('');return new Request(String(origin||'https://tg-cache.invalid').replace(/\/$/,'')+'/__sfread/'+kind+'/'+h);}catch(e){return null;}}
async function memoGetFresh(key,origin){const now=Date.now(),m=SF_READ_MEMO.get(key);if(m&&now<m.freshUntil)return memoCopy(m.value);if(m&&now>=m.staleUntil)SF_READ_MEMO.delete(key);const r=await memoRequest(origin,key,'fresh');if(r){try{const h=await caches.default.match(r);if(h){const v=await h.json();memoStore(key,v,Number(h.headers.get('x-sf-fresh-ms'))||15000,Number(h.headers.get('x-sf-stale-ms'))||0);return memoCopy(v);}}catch(e){}}return null;}
async function memoGetStale(key,origin){const now=Date.now(),m=SF_READ_MEMO.get(key);if(m&&now<m.staleUntil)return memoCopy(m.value);const r=await memoRequest(origin,key,'stale');if(r){try{const h=await caches.default.match(r);if(h)return await h.json();}catch(e){}}return null;}
function memoStore(key,value,ttlMs,staleMs){if(SF_READ_MEMO.size>100)SF_READ_MEMO.delete(SF_READ_MEMO.keys().next().value);const now=Date.now();SF_READ_MEMO.set(key,{value:memoCopy(value),freshUntil:now+ttlMs,staleUntil:now+Math.max(ttlMs,staleMs||ttlMs)});}
async function memoPut(key,value,ttlMs,staleMs,origin){memoStore(key,value,ttlMs,staleMs);const a=await memoRequest(origin,key,'fresh'),b=staleMs>ttlMs?await memoRequest(origin,key,'stale'):null;if(!a)return;try{const body=JSON.stringify(value);await caches.default.put(a,new Response(body,{headers:{'content-type':'application/json','cache-control':'public, max-age='+Math.ceil(ttlMs/1000),'x-sf-fresh-ms':String(ttlMs),'x-sf-stale-ms':String(staleMs||0)}}));if(b)await caches.default.put(b,new Response(body,{headers:{'content-type':'application/json','cache-control':'public, max-age='+Math.ceil(staleMs/1000)}}));}catch(e){}}
async function memoInvalidate(key,origin){
  SF_READ_MEMO.delete(key);
  try{if(typeof caches==='undefined'||!caches.default)return;const a=await memoRequest(origin,key,'fresh');if(a)await caches.default.delete(a);const b=await memoRequest(origin,key,'stale');if(b)await caches.default.delete(b);}catch(e){}
}
async function memoInvalidateTg(env,origin){
  await memoInvalidate(memoDbKey(env,'tg-progress:v3'),origin);
  await memoInvalidate(memoDbKey(env,'tg-stats:v2'),origin);
}
function feedMemoKey(env,userId,mood,limit,cursor,cats,lastCats,fatigue,lc2){const c=Number(cursor)>Date.now()+86400000?'latest':String(cursor);return memoDbKey(env,'feed:v3|'+JSON.stringify([userId,mood,limit,c,currentTimeSlot(),cats||[],lastCats||[],fatigue,lc2||[]]));}
function cleanUser(s){return String(s||'default').replace(/[^a-zA-Z0-9_.:-]/g,'').slice(0,80)||'default';}
function cleanVideoId(s){return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,20);}
function cleanChannelId(s){return String(s||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40);}
function cleanMood(s){s=String(s||'focus').replace(/[^a-z_]/g,'').slice(0,20);return ['happy','sad','very_sad','focus','bhakti'].includes(s)?s:'focus';}
function cleanCat(s){return String(s||'').replace(/[^a-z_]/g,'').slice(0,24);}
function decodeHtml(s){return String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}

const APP_HTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="preconnect" href="https://www.youtube.com" crossorigin>
<link rel="preconnect" href="https://i.ytimg.com" crossorigin>
<link rel="preconnect" href="https://www.google.com" crossorigin><title>ShortsFire</title><style>:root{--card-w:min(430px,100vw);--topbar-h:54px;--mute-gap:12px;--sf-top:env(safe-area-inset-top,0px);--sf-bottom:env(safe-area-inset-bottom,0px);}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;overflow:hidden;background:#050507;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}#feed{height:100vh;overflow-y:scroll;scroll-snap-type:y mandatory;scrollbar-width:none;background:#000;max-width:520px;margin:0 auto;outline:none}#feed::-webkit-scrollbar{display:none}.short{height:100vh;position:relative;scroll-snap-align:start;background:#000;overflow:hidden}.short iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:.2s}.short.ready iframe{opacity:1}.short.ready .tgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#000}iframe{opacity:1}.loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:1}.spin{width:46px;height:46px;border:3px solid rgba(255,255,255,.14);border-top-color:#ff2d4b;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.grad{position:absolute;inset:0;z-index:2;pointer-events:none;background:linear-gradient(to top,rgba(0,0,0,.95),rgba(0,0,0,.05) 50%,rgba(0,0,0,.35))}.tap{position:absolute;inset:0;z-index:5}.top{position:fixed;top:0;left:50%;transform:translateX(-50%);width:min(520px,100%);z-index:50;display:flex;justify-content:space-between;padding:14px;pointer-events:none}.miniLogo{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);box-shadow:0 8px 28px rgba(253,29,29,.25);position:relative}.miniLogo:after{content:'';position:absolute;left:10px;top:10px;width:12px;height:12px;border:2px solid #fff;border-radius:50%}.top button{pointer-events:all;border:0;border-radius:99px;background:rgba(255,255,255,.14);color:#fff;padding:8px 11px;cursor:pointer}.mute{position:absolute;top:auto;bottom:calc(var(--sf-bottom) + 8px);right:12px;z-index:60;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:7px 12px;font-size:12px;font-weight:900;cursor:pointer}.info{position:absolute;left:14px;right:88px;bottom:78px;z-index:10;text-shadow:0 1px 3px #000}.ch{display:flex;gap:8px;align-items:center;font-size:14px;font-weight:900;margin-bottom:7px}.chName{max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.followPill{border:1px solid rgba(255,255,255,.42);background:rgba(255,255,255,.09);color:#fff;border-radius:999px;padding:4px 11px;font-size:11px;font-weight:1000;cursor:pointer}.followPill.on{color:rgba(255,255,255,.65)}.title{font-size:14px;line-height:1.45;color:rgba(255,255,255,.88);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{font-size:11px;color:rgba(255,255,255,.52);margin-top:7px}.actions{position:absolute;right:14px;bottom:112px;z-index:10;display:flex;flex-direction:column;gap:17px}.act{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;font-weight:800;color:rgba(255,255,255,.75);cursor:pointer}.ico,.avatarIco{width:50px;height:50px;border-radius:50%;background:rgba(26,26,34,.55);border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:21px;cursor:pointer}.ico.on{background:rgba(255,45,75,.28);border-color:#ff2d4b}.avatarIco{position:relative;border:2px solid rgba(255,255,255,.86);font-weight:1000}.followBadge{position:absolute;right:-3px;bottom:-5px;width:22px;height:22px;border-radius:50%;background:#ff2d4b;border:3px solid #050507;font-size:14px;display:flex;align-items:center;justify-content:center}.followBadge.on{background:#00d084;font-size:12px}.heartPop{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.3);z-index:20;font-size:96px;opacity:0;pointer-events:none}.heartPop.show{animation:heart .75s}@keyframes heart{20%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-58%) scale(.75)}}.pausePop{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:18;width:76px;height:76px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:34px;opacity:0;pointer-events:none}.pausePop.show{animation:fade .65s}@keyframes fade{35%{opacity:1}}.panel,.moodPanel{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.75);display:none;align-items:flex-end;justify-content:center}.moodPanel{z-index:500;align-items:center;padding:22px}.sheet,.moodBox{width:100%;max-width:430px;max-height:82vh;overflow:auto;background:#111116;border-radius:22px 22px 0 0;padding:22px}.moodBox{border-radius:22px;text-align:center}.row{background:#1a1a22;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px;margin:9px 0;color:#b8b8c8;font-size:13px;line-height:1.6}.btn,.moodBtns button{width:100%;border:0;border-radius:12px;padding:13px;margin-top:9px;background:linear-gradient(135deg,#ff2d4b,#ff6b2b);color:#fff;font-weight:1000;cursor:pointer}.ghost{background:#1a1a22;color:#aaa;border:1px solid rgba(255,255,255,.08)}.moodBtns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.moodBtns button{background:#1a1a22;margin:0}.moodBtns button:last-child{grid-column:1/3;background:linear-gradient(135deg,#ff2d4b,#ff6b2b)}#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999;background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;display:none}.failBox{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:22;background:rgba(10,10,14,.78);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px;display:none;flex-direction:column;align-items:center;gap:10px}.failBox.show{display:flex}.miniBtn{border:0;border-radius:999px;padding:8px 12px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:1000;cursor:pointer}.miniBtn.hot{background:linear-gradient(135deg,#ff2d4b,#ff6b2b)}.empty{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#777;gap:12px;text-align:center;padding:30px}
/* Mobile Instagram/Reels feel */
@media (max-width: 759px){
  html,body{width:100%;height:100%;background:#000;touch-action:pan-y;-webkit-tap-highlight-color:transparent;}
  #feed{width:100vw;max-width:none;height:100dvh;box-shadow:none;background:#000;scroll-snap-type:y mandatory;}
  .short{height:100dvh;width:100vw;border-radius:0;}
  .top{left:0;right:0;transform:none;width:100%;padding:calc(var(--sf-top) + 10px) 12px 8px;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);}
  .miniLogo{width:30px;height:30px;border-radius:10px;opacity:.92;}
  .top button{width:34px;height:34px;padding:0;background:rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);}
  .mute{top:auto;bottom:calc(var(--sf-bottom) + 8px);right:12px;font-size:11px;padding:6px 10px;background:rgba(0,0,0,.42);backdrop-filter:blur(12px);}
  .actions{right:10px;bottom:calc(var(--sf-bottom) + 92px);gap:16px;}
  .ico,.avatarIco{width:46px;height:46px;font-size:20px;background:rgba(0,0,0,.32);border-color:rgba(255,255,255,.16);backdrop-filter:blur(12px);box-shadow:0 6px 22px rgba(0,0,0,.25);}
  .followBadge{width:20px;height:20px;right:-4px;bottom:-5px;border-width:3px;font-size:13px;}
  .act span{font-size:10px;text-shadow:0 1px 3px #000;}
  .info{left:12px;right:76px;bottom:calc(var(--sf-bottom) + 54px);}
  .ch{font-size:14px;margin-bottom:6px;gap:7px;}
  .chName{max-width:58vw;}
  .followPill{font-size:10px;padding:4px 10px;background:rgba(0,0,0,.28);backdrop-filter:blur(10px);}
  .title{font-size:13.5px;line-height:1.42;-webkit-line-clamp:2;}
  .meta{font-size:10.5px;margin-top:6px;}
  .grad{background:linear-gradient(to top,rgba(0,0,0,.96) 0%,rgba(0,0,0,.72) 18%,rgba(0,0,0,.06) 55%,rgba(0,0,0,.32) 100%);}
  .loader{background:#000;}
  .spin{width:38px;height:38px;border-width:2.5px;}
  .heartPop{font-size:86px;}
  .pausePop{width:68px;height:68px;font-size:30px;background:rgba(255,255,255,.13);backdrop-filter:blur(10px);}
  .sheet{border-radius:22px 22px 0 0;padding:20px 18px calc(var(--sf-bottom) + 20px);max-height:84dvh;}
  .moodBox{margin:0 10px;border-radius:22px;padding:22px 18px;}
  .moodBtns button{padding:14px 8px;font-size:13px;}
  #toast{bottom:calc(var(--sf-bottom) + 20px);max-width:90vw;overflow:hidden;text-overflow:ellipsis;}
}
@media (min-width:760px){#feed{width:var(--card-w)}}

/* Reels-like visual polish, without using Instagram branding */
.coSub{font-size:12px;color:rgba(255,255,255,.62);margin:10px 0 4px;line-height:1.55}
.moodBtns button,#checkoutPanel .moodBox b,.coSub,.coSkip,.phLine,.phTitle{font-family:system-ui,-apple-system,'Segoe UI Emoji','Noto Color Emoji','Apple Color Emoji',Roboto,Arial,sans-serif}
.coSkip{background:none;border:0;color:rgba(255,255,255,.45);font-size:12px;margin-top:14px;cursor:pointer;font-weight:700;font-family:inherit}
#pharmacy{display:none;margin-top:12px;border-top:1px solid rgba(255,255,255,.1);padding-top:12px}
.phTitle{font-size:13px;font-weight:900;margin-bottom:6px}
.phLine{font-size:12px;line-height:1.75;color:rgba(255,255,255,.85);text-align:left}
.phGood{color:#7ee2a8}.phBad{color:#ff8a9a}
.chips{position:fixed;top:var(--topbar-h);left:50%;transform:translateX(-50%);width:min(520px,100%);z-index:49;display:flex;gap:7px;overflow-x:auto;padding:6px 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;border:1px solid rgba(255,255,255,.22);background:rgba(20,20,26,.62);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;border-radius:999px;padding:6px 13px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap;font-family:inherit}
.chip.on{background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);border-color:transparent;box-shadow:0 6px 20px rgba(253,29,29,.35)}
.reelsTitle{pointer-events:auto;color:#fff;font-weight:900;font-size:22px;letter-spacing:-.4px;text-shadow:0 2px 10px rgba(0,0,0,.45);display:flex;align-items:center;gap:5px}.reelsTitle span{font-size:16px;opacity:.9}.topIcon{font-size:17px}.act span{font-weight:800;color:rgba(255,255,255,.88)}
@media (max-width:759px){
  .top{align-items:center}.reelsTitle{font-size:24px}.topIcon{font-size:18px;background:transparent!important;border:0!important;backdrop-filter:none!important}
  .actions{gap:18px;right:8px}.ico{background:transparent!important;border:0!important;box-shadow:none!important;font-size:27px;width:44px;height:38px}.act span{font-size:10px;margin-top:-3px;color:#fff;text-shadow:0 1px 4px #000}.avatarIco{background:rgba(0,0,0,.18)!important}
  .info{bottom:calc(var(--sf-bottom) + 42px)}.chName{font-weight:900}.title{font-weight:500}.meta{font-weight:700;color:rgba(255,255,255,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72vw}.followPill{background:transparent;border-color:rgba(255,255,255,.65)}
}


/* ShortsFire Aurora UI refresh: Instagram/Reels-like, touch-first, lightweight */
:root{--accent:#ff375f;--accent2:#8b5cf6;--glass:rgba(15,15,24,.58);--line:rgba(255,255,255,.14)}
body{background:#030305;letter-spacing:.01em}
#feed{background:radial-gradient(ellipse at 50% 0%,#171226 0%,#030305 46%,#000 100%);scroll-behavior:smooth}
.short{background:linear-gradient(145deg,#09090f,#020204);isolation:isolate}
.short:after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(circle at 82% 18%,rgba(139,92,246,.14),transparent 28%),radial-gradient(circle at 14% 80%,rgba(255,55,95,.10),transparent 30%)}
.short iframe{z-index:0;transform:scale(1.002);filter:saturate(1.06) contrast(1.03)}
.grad{z-index:3;background:linear-gradient(to top,rgba(0,0,0,.94),rgba(0,0,0,.12) 48%,rgba(0,0,0,.5));}
.top{z-index:80;padding-top:calc(var(--sf-top) + 12px)}
.miniLogo{background:linear-gradient(135deg,#ff375f,#ff8a3d 46%,#8b5cf6);box-shadow:0 8px 30px rgba(255,55,95,.35)}
.top button,.mute{backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);background:rgba(10,10,18,.5);border:1px solid var(--line);box-shadow:0 8px 24px rgba(0,0,0,.22)}
.info{z-index:20;bottom:calc(78px + var(--sf-bottom));}
.chName,.title{text-shadow:0 2px 12px rgba(0,0,0,.85)}
.followPill{background:linear-gradient(135deg,rgba(255,55,95,.7),rgba(139,92,246,.65));border:0;box-shadow:0 5px 18px rgba(255,55,95,.22)}
.actions{z-index:25;bottom:calc(112px + var(--sf-bottom));gap:15px}
.ico,.avatarIco{background:var(--glass);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--line);box-shadow:0 10px 24px rgba(0,0,0,.22);transition:transform .18s ease,background .18s ease}
.ico:active,.avatarIco:active,.followPill:active,.top button:active{transform:scale(.9)}
.ico.on{background:linear-gradient(135deg,rgba(255,55,95,.72),rgba(139,92,246,.65));border-color:rgba(255,255,255,.35)}
.panel,.moodPanel{background:rgba(0,0,0,.68);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.sheet,.moodBox{background:linear-gradient(160deg,#171522,#0b0b11 72%);border:1px solid var(--line);box-shadow:0 -18px 80px rgba(0,0,0,.55)}
.btn,.moodBtns button:last-child{background:linear-gradient(135deg,#ff375f,#8b5cf6);box-shadow:0 10px 26px rgba(255,55,95,.22)}
.row{background:rgba(255,255,255,.055);border-color:var(--line)}
#toast{bottom:calc(24px + var(--sf-bottom));backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);background:rgba(16,16,25,.78);border-color:var(--line)}
@media(max-width:759px){.short{height:100dvh}.title{font-size:15px;line-height:1.42}.meta{font-size:11px}.actions{right:12px}.info{left:13px;right:82px}.mute{top:auto;bottom:calc(var(--sf-bottom) + 8px)}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}

/* Responsive polish: premium mobile + desktop layouts */
@media(min-width:760px){
  html,body{background:#07070b;background-image:radial-gradient(circle at 50% 10%,#21182e 0,transparent 34%),linear-gradient(120deg,#050509,#10101a 50%,#050509)}
  #feed{height:calc(100vh - 28px);margin:14px auto;border-radius:28px;overflow-y:scroll;box-shadow:0 24px 100px rgba(0,0,0,.72),0 0 0 1px rgba(255,255,255,.10);max-width:none}
  .short{height:calc(100vh - 28px);border-radius:28px;overflow:hidden}
  .top{width:var(--card-w);top:14px;padding:8px 14px 6px;border-radius:28px 28px 0 0;background:transparent}.reelsTitle{font-size:19px}
  .mute{top:auto;bottom:10px;right:14px}
  .actions{right:16px}.info{left:18px;right:92px}
  .chips{top:calc(var(--topbar-h) + 14px);width:var(--card-w);padding:6px 2px}
  .panel .sheet{border-radius:24px;margin-bottom:22px}
}
@media(max-width:759px){
  html,body{background:#000}
  #feed{height:100dvh;overscroll-behavior-y:contain;scroll-snap-stop:normal}
  .short{height:100dvh;min-height:100dvh}
  .top{padding-left:14px;padding-right:14px}
  .actions{right:10px;bottom:calc(112px + var(--sf-bottom));gap:13px}
  .act{font-size:10px;text-shadow:0 1px 5px #000}
  .ico,.avatarIco{width:48px;height:48px}
  .info{bottom:calc(72px + var(--sf-bottom));left:14px;right:78px}
  .ch{font-size:13px}.title{font-size:14px}.meta{margin-top:6px}
  .mute{right:10px;padding:7px 10px}
  .sheet{padding:20px 16px max(20px,env(safe-area-inset-bottom))}
  .moodPanel{padding:14px}.moodBox{padding:22px 16px}
}
@media(max-width:380px){.actions{gap:10px}.ico,.avatarIco{width:44px;height:44px;font-size:19px}.info{right:70px}.title{font-size:13px}}
</style><style id="sfv9">
.short iframe{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%)}
.short.wide iframe{width:auto;height:100%;aspect-ratio:16/9;max-width:none}
.loader{background-size:cover;background-position:center;box-shadow:inset 0 0 0 9999px rgba(5,5,10,.44)}
.loader .spin{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-width:3px}
.title{-webkit-line-clamp:1}
.title.open{-webkit-line-clamp:99}
.grad{background:linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.08) 42%,rgba(0,0,0,.3))}
</style>
</head><body><div class="top"><div class="reelsTitle">Reels <span>⌄</span></div><button class="topIcon" onclick="openSettings()">⚙️</button></div><div class="chips" id="chips"></div><div id="feed" tabindex="0"></div><div class="panel" id="panel" onclick="if(event.target===this)closeSettings()"><div class="sheet"><h2>⚙️ Settings</h2><div class="row" id="stats">Loading...</div><div id="pharmacy"></div><button class="btn" onclick="manualCollect()">⚡ Run Collector</button><button class="btn ghost" onclick="changeMood()">🧠 Change Mood</button><button class="btn ghost" onclick="resetTaste()">🎛️ Reset Taste</button><button class="btn ghost" onclick="manualCleanup()">🧹 Cleanup DB</button><button class="btn ghost" onclick="refreshFeed(true)">🔄 Reload Feed</button><button class="btn ghost" onclick="closeSettings()">Close</button></div></div><div class="moodPanel" id="moodPanel"><div class="moodBox"><b>Abhi mood kya hai?</b><div class="moodBtns"><button onclick="setMood('happy')">😊 Happy</button><button onclick="setMood('sad')">😔 Sad</button><button onclick="setMood('very_sad')">💔 Very Sad</button><button onclick="setMood('focus')">🎯 Focus</button><button onclick="setMood('bhakti')">🙏 Bhakti</button></div></div></div><div class="moodPanel" id="checkoutPanel" style="z-index:210"><div class="moodBox"><b id="coQ">Kaisa feel ho rahe ho?</b><div class="coSub" id="coSub">2 second do — tumhara data tumhari dawai banega 🧪</div><div class="moodBtns"><button onclick="answerCheckout('better')">😊 Better</button><button onclick="answerCheckout('same')">😐 Same</button><button onclick="answerCheckout('worse')">😞 Worse</button></div><button class="coSkip" onclick="skipCheckout()">Abhi nahi</button></div></div><div id="toast"></div><script>
'use strict';let userId=localStorage.getItem('sf_user_id')||'default',videos=[],cursor=Date.now()+999999999,loading=false,muted=true,observer,watchedLocal=new Set(JSON.parse(localStorage.getItem('sf_watched_local')||'[]')),enterAt={},lastTapAt=0,lastTapId='',tapTimer=null,pausedIds=new Set(),sessionPrefs=JSON.parse(sessionStorage.getItem('sf_session_prefs')||'{}'),recentClientCats=[],currentMood='',currentCats=null,sfSession=null,sfPendingMood=null,coOpen=false;
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function toast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2400)}async function api(p,o){const r=await fetch(p,o);const j=await r.json().catch(()=>({ok:false,error:'bad json'}));if(!r.ok||!j.ok)throw Error(j.error||('HTTP '+r.status));return j}
function showMoodIfNeeded(){if(!currentMood)document.getElementById('moodPanel').style.display='flex'}function changeMood(){document.getElementById('moodPanel').style.display='flex'}function setMood(m){var prev=currentMood;currentMood=m;currentCats=null;renderChips();sessionStorage.setItem('sf_mood',m);document.getElementById('moodPanel').style.display='none';if(prev&&prev!==m&&sfSession&&sfSession.reels>0){sfPendingMood=m;showCheckout(false);}else{startSession(m);}refreshFeed(true)}
function startSession(m){sfSession=m?{mood:m,cats:{},reels:0,t:Date.now()}:null;}
function trackSessionReel(id){if(!sfSession)return;sfSession.reels++;var v=findVid(id);if(v&&v.cat)sfSession.cats[v.cat]=(sfSession.cats[v.cat]||0)+1;}
function showCheckout(){if(coOpen||!sfSession||!sfSession.reels)return;coOpen=true;var emo={happy:'😊',sad:'😔',very_sad:'��',focus:'🎯',bhakti:'🙏'}[sfSession.mood]||'🎯';document.getElementById('coQ').textContent=sfSession.reels+' reels ('+emo+' '+sfSession.mood+') ke baad — ab kaisa feel ho?';document.getElementById('coSub').textContent='2 second do — isi se tumhari content-dawai banegi 🧪';document.getElementById('checkoutPanel').style.display='flex';}
function answerCheckout(kind){if(!sfSession){skipCheckout();return;}coOpen=false;document.getElementById('checkoutPanel').style.display='none';try{if(window.ShortsFire)window.ShortsFire.haptic('medium');}catch(e){}var cats=Object.keys(sfSession.cats).sort(function(a,b){return sfSession.cats[b]-sfSession.cats[a];}).slice(0,8);api('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:userId,startMood:sfSession.mood,endMood:kind,cats:cats,reels:sfSession.reels})}).then(function(){toast(kind==='better'?'Noted 🙏 accha laga sunke':kind==='worse'?'Noted 🙏 agla feed better dunga':'Noted 🙏');}).catch(function(){});var pm=sfPendingMood;sfPendingMood=null;if(pm){startSession(pm);}else{startSession(sfSession.mood);}}
function skipCheckout(){coOpen=false;document.getElementById('checkoutPanel').style.display='none';var pm=sfPendingMood;sfPendingMood=null;if(pm){startSession(pm);}else if(sfSession){startSession(sfSession.mood);}}
async function loadPharmacy(){var el=document.getElementById('pharmacy');if(!el)return;el.style.display='block';el.innerHTML="<div class='phTitle'>🧪 Tumhari Content-Pharmacy</div><div class='phLine'>Check-out karo — 2 hafte me tumhara personal label yahan banega</div>";try{var j=await api('/api/pharmacy?userId='+encodeURIComponent(userId));var t=j.totals||{checkouts:0};if(!t.checkouts)return;var h="<div class='phTitle'>🧪 Content-Pharmacy ("+t.checkouts+" checkouts, 14 din)</div>";if(t.checkouts>=3)h+="<div class='phLine'>"+(t.avgPct>=50?"📈":"📉")+" "+t.avgPct+"% sessions me mood better hua</div>";var eff=j.effects||[];var pos=eff.filter(function(e){return e.avg10>0;}).slice(0,3);var neg=eff.filter(function(e){return e.avg10<0;}).slice(-2).reverse();pos.forEach(function(e){h+="<div class='phLine phGood'>✅ "+esc(e.cat)+" +"+(e.avg10/10)+" mood ("+e.n+"x)</div>";});neg.forEach(function(e){h+="<div class='phLine phBad'>⚠️ "+esc(e.cat)+" "+(e.avg10/10)+" ("+e.n+"x) — kam dikhau?</div>";});el.innerHTML=h;}catch(e){}}
function clientGroup(c){if(['bhakti','geeta','bhajans','pravachan','katha','ramayan','mahabharat','krishna','radhakrishna_serial','hanuman','devotion','spiritual_quotes'].includes(c))return'spiritual';if(['sad_songs','heartbreak','shayari'].includes(c))return'emotion';if(['motivation','life_lessons','facts','psychology','psychology_tricks','dark_psychology','manipulation_awareness','dark_life_truths'].includes(c))return'growth';if(['comedy','hindi_film_comedy','comedy_quotes','public_comedy','peaceful_piano','aura_music','old_songs','attitude','attitude_songs','dialogue_status','music'].includes(c))return'entertainment';if(['science','tech'].includes(c))return'knowledge';return'general'}function sessionBump(c,d){if(!c)return;sessionPrefs[c]=(sessionPrefs[c]||0)+d;sessionPrefs[clientGroup(c)]=(sessionPrefs[clientGroup(c)]||0)+Math.round(d/2);sessionStorage.setItem('sf_session_prefs',JSON.stringify(sessionPrefs))}function tuneOrder(list){return[...list].sort((a,b)=>((sessionPrefs[b.cat]||0)+(sessionPrefs[clientGroup(b.cat)]||0)-recentClientCats.filter(c=>c===b.cat).length*8)-((sessionPrefs[a.cat]||0)+(sessionPrefs[clientGroup(a.cat)]||0)-recentClientCats.filter(c=>c===a.cat).length*8))}
const CHIPS=[{e:'✨',label:'All',cats:[]},{e:'😂',label:'Comedy',cats:['comedy','hindi_film_comedy','comedy_quotes','public_comedy']},{e:'🦚',label:'Krishna',cats:['krishna','radhakrishna_serial']},{e:'🙏',label:'Bhakti',cats:['bhakti','bhajans','geeta','pravachan','katha','ramayan','mahabharat','hanuman','devotion','spiritual_quotes']},{e:'🧠',label:'Psychology',cats:['psychology','psychology_tricks','dark_psychology','manipulation_awareness']},{e:'💔',label:'Shayari',cats:['sad_songs','heartbreak','shayari']},{e:'🎵',label:'Songs',cats:['old_songs','music','peaceful_piano','aura_music']},{e:'🔥',label:'Attitude',cats:['attitude','attitude_songs','dialogue_status']},{e:'💪',label:'Motivation',cats:['motivation','life_lessons']},{e:'🔬',label:'Sci-Tech',cats:['science','tech']}];
function renderChips(){const w=document.getElementById('chips');if(!w)return;w.innerHTML=CHIPS.map((c,i)=>\`<button class="chip\${(c.cats.length?JSON.stringify(c.cats):'[]')===JSON.stringify(currentCats||[])?' on':''}" data-i="\${i}" onclick="onChip(\${i})">\${c.e} \${esc(c.label)}</button>\`).join('');}
function onChip(i){const c=CHIPS[i];if(!c)return;if(window.ShortsFire)try{window.ShortsFire.haptic('light')}catch(e){}if(!c.cats.length)currentCats=null;else currentCats=(JSON.stringify(currentCats||[])===JSON.stringify(c.cats))?null:c.cats;renderChips();refreshFeed(true);}
async function loadMore(silent=false){if(loading)return;loading=true;try{let added=0;const _fq=(sfSession.taps&&sfSession.taps.length>=8)?'&f=1':'';for(let a=0;a<2&&added<20;a++){const before=cursor,j=await api('/api/feed?userId='+encodeURIComponent(userId)+'&mood='+encodeURIComponent(currentMood||'focus')+'&limit=80&cursor='+encodeURIComponent(cursor)+(currentCats&&currentCats.length?'&cats='+encodeURIComponent(currentCats.join(',')):'')+(sfSession&&Object.keys(sfSession.cats).length?'&lastCats='+encodeURIComponent(Object.keys(sfSession.cats).sort((x,y)=>sfSession.cats[y]-sfSession.cats[x]).slice(0,3).join(',')):'')+(sfSession&&sfSession.cats&&Object.keys(sfSession.cats).length?'&lc2='+encodeURIComponent(Object.keys(sfSession.cats).sort((x,y)=>sfSession.cats[y]-sfSession.cats[x]).slice(0,3).map(c=>c+':'+sfSession.cats[c]).join(',')):'')+_fq);cursor=(j.nextCursor&&j.nextCursor<before)?j.nextCursor:before-1;const fresh=(j.videos||[]).filter(v=>!watchedLocal.has(v.id)&&!videos.some(x=>x.id===v.id));if(fresh.length){const tuned=tuneOrder(fresh);videos.push(...tuned);appendVideos(tuned);added+=tuned.length}}if(!videos.length)renderEmpty()}catch(e){toast('Feed error: '+e.message);if(!videos.length)renderEmpty(e.message)}finally{loading=false}}
function appendVideos(list){const f=document.getElementById('feed'),start=f.querySelectorAll('.short').length;list.forEach((v,i)=>f.appendChild(card(v,start+i)));attachObserver()}function renderEmpty(msg){document.getElementById('feed').innerHTML='<div class="empty"><div style="font-size:54px">🔥</div><b>No videos yet</b><div>'+(msg||'Collector run karo ya cron wait karo')+'</div></div>'}
function card(v,idx){const el=document.createElement('div');el.className='short';el.dataset.id=v.id;el.dataset.idx=idx;el.dataset.src=v.src||'';el.innerHTML=\`<div class="loader" id="ldr-\${v.id}" style="background-image:url('https://i.ytimg.com/vi/\${v.id}/hqdefault.jpg')"><div class="spin"></div></div><div class="failBox" id="fail-\${v.id}"><div>Video stuck?</div><div><button class="miniBtn" onclick="event.stopPropagation();retryVideo('\${v.id}')">Retry</button> <button class="miniBtn hot" onclick="event.stopPropagation();nextFromVideo('\${v.id}')">Next</button></div></div><div class="grad"></div><div class="heartPop" id="heart-\${v.id}">❤️</div><div class="pausePop" id="pause-\${v.id}">▶</div><div class="tap" onclick="handleTap('\${v.id}',event)"></div><button class="mute" onclick="event.stopPropagation();toggleMute('\${v.id}')">🔇 Unmute</button><div class="actions"><div class="act followAct" onclick="event.stopPropagation();toggleFollow('\${v.id}')"><div class="avatarIco"><span>\${esc((v.ch||'Y').charAt(0).toUpperCase())}</span><b class="followBadge \${v.followed?'on':''}" id="fb-\${v.id}">\${v.followed?'✓':'+'}</b></div><span id="fltxt-\${v.id}">\${v.followed?'Following':'Follow'}</span></div><div class="act" onclick="event.stopPropagation();toggleLike('\${v.id}')"><div class="ico \${v.liked?'on':''}" id="like-\${v.id}">\${v.liked?'❤️':'🤍'}</div><span>Like</span></div><div class="act" onclick="event.stopPropagation();moreLikeThis('\${v.id}')"><div class="ico">✨</div><span>More</span></div><div class="act" onclick="event.stopPropagation();notInterested('\${v.id}')"><div class="ico">🚫</div><span>Less</span></div><div class="act" onclick="event.stopPropagation();shareVid('\${v.id}')"><div class="ico">↗️</div><span>Share</span></div></div><div class="info"><div class="ch"><span class="chName">@\${esc(v.ch||'YouTube')}</span><button class="followPill \${v.followed?'on':''}" id="fp-\${v.id}" onclick="event.stopPropagation();toggleFollow('\${v.id}')">\${v.followed?'Following':'Follow'}</button></div><div class="title" onclick="this.classList.toggle('open')">\${esc(v.title)}</div><div class="meta">♫ Original audio • \${esc(v.cat||'shorts')}</div></div>\`;return el}
function attachObserver(){if(observer)observer.disconnect();observer=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?enter(e.target):leave(e.target)),{threshold:.75});document.querySelectorAll('.short').forEach(e=>observer.observe(e))}
function stopOtherVideos(currentId){
  document.querySelectorAll('.short').forEach(card=>{
    const id=card.dataset.id;
    if(id===currentId) return;
    const ifr=card.querySelector('iframe,video');
    if(ifr){
      try{if(ifr.tagName==='VIDEO'){ifr.pause();ifr.removeAttribute('src');if(ifr.load)ifr.load()}else if(ifr.contentWindow){ifr.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:''}),'*')}}catch(e){}
      ifr.remove();
    }
    card.classList.remove('ready');
    delete card.dataset.loaded;
    const l=document.getElementById('ldr-'+id); if(l) l.style.display='flex';
  });
}
function sfThumb2(el,id,ld,name){try{if(ld)ld.style.backgroundImage='url(https://i.ytimg.com/vi/'+id+'/'+name+'.jpg)';}catch(e){}}
function sfProbe(el,id){if(el.dataset.ar)return;el.dataset.ar='1';const ld=document.getElementById('ldr-'+id);const im=new Image();im.onload=function(){if(im.naturalWidth&&im.naturalWidth<im.naturalHeight){sfThumb2(el,id,ld,'oardefault');}else{el.classList.add('wide');sfThumb2(el,id,ld,'maxresdefault');}};im.onerror=function(){el.classList.add('wide');sfThumb2(el,id,ld,'hqdefault');};try{im.src='https://i.ytimg.com/vi/'+id+'/oardefault.jpg';}catch(e){}}
function enterTgVideo(el,id,src){
  const l=document.getElementById('ldr-'+id);
  if(el.querySelector('video')) return;
  const vd=document.createElement('video');
  vd.src=src; vd.playsInline=true; vd.setAttribute('playsinline',''); vd.setAttribute('webkit-playsinline','');
  vd.loop=true; vd.muted=muted; vd.autoplay=true; vd.preload='auto'; vd.className='tgvid';
  vd.oncanplay=function(){el.dataset.loaded='1';el.classList.add('ready');if(l)l.style.display='none'};
  vd.onerror=function(){showFail(id)};
  el.insertBefore(vd,el.firstChild);
  vd.play().catch(function(){});
  setTimeout(function(){if(el.querySelector('video')&&el.dataset.loaded!=='1'){el.classList.add('ready');if(l)l.style.display='none'}},2600);
}
const sfTgAsked=new Set();let sfTgAskAt=0;function sfTgAsk(id){try{if(!id||sfTgAsked.has(id))return;if(Date.now()-sfTgAskAt<4000)return;sfTgAsked.add(id);sfTgAskAt=Date.now();fetch('/api/tg/request?id='+encodeURIComponent(id),{method:'GET'}).catch(function(){})}catch(e){}}
function enter(el){const id=String(el.dataset.id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,11);el.dataset.id=id;window.sfCurEmbedId=id;stopOtherVideos(id);sfProbe(el,id);if(el.dataset.src){enterTgVideo(el,id,el.dataset.src)}else if(!el.querySelector('iframe')){sfTgAsk(id);const ifr=document.createElement('iframe');ifr.src='https://www.youtube.com/embed/'+id+'?autoplay=1&mute='+(muted?1:0)+'&controls=0&playsinline=1&enablejsapi=1&rel=0&origin='+encodeURIComponent(location.origin)+'&widget_referrer='+encodeURIComponent(location.origin);ifr.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';ifr.allowFullscreen=true;ifr.onload=()=>{el.dataset.loaded='1';el.classList.add('ready');const l=document.getElementById('ldr-'+id);if(l)l.style.display='none'};ifr.onerror=()=>showFail(id);el.insertBefore(ifr,el.firstChild);setTimeout(()=>{el.classList.add('ready');const l=document.getElementById('ldr-'+id);if(l)l.style.display='none'},2600);setTimeout(()=>{if(el.querySelector('iframe')&&el.dataset.loaded!=='1')showFail(id)},9000)}enterAt[id]=Date.now();const vv=findVid(id);if(vv&&vv.cat){recentClientCats.push(vv.cat);if(recentClientCats.length>12)recentClientCats.shift()}markWatched(id);const idx=parseInt(el.dataset.idx||'0',10);if(videos.length-idx<14)loadMore(true)}function leave(el){el.classList.remove('ready');delete el.dataset.loaded;const id=el.dataset.id;hideFail(id);const ms=enterAt[id]?Date.now()-enterAt[id]:0;delete enterAt[id];if(ms>0){const v=findVid(id);if(v&&v.cat)sessionBump(v.cat,ms<2500?-5:ms>12000?6:ms>5000?3:1);if(ms<2500)sendSignal(id,'skip',ms);else sendSignal(id,'watch_ms',ms)}const ifr=el.querySelector('iframe,video');if(ifr){try{if(ifr.tagName==='VIDEO'){ifr.pause();ifr.removeAttribute('src');if(ifr.load)ifr.load()}else if(ifr.contentWindow){ifr.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:''}),'*')}}catch(e){}ifr.remove();const l=document.getElementById('ldr-'+id);if(l)l.style.display='flex'}pausedIds.delete(id)}
function showFail(id){const f=document.getElementById('fail-'+id);if(f){f.classList.add('show');sfFailBtns(id)}}function hideFail(id){const f=document.getElementById('fail-'+id);if(f)f.classList.remove('show')}function openYt(id){try{window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener')}catch(e){}}
function queueTg(id){fetch('/api/tg/request?id='+encodeURIComponent(id)).then(function(r){return r.json()}).then(function(j){toast(j&&j.queued?'TG queue me daal diya ✅':(j&&j.already?'pehle se '+j.already:'queue: '+((j&&(j.why||j.error))||'ok')))}).catch(function(){toast('queue fail — thodi der baad')})}
function sfFailBtns(id){var f=document.getElementById('fail-'+id);if(!f||f.getAttribute('data-x'))return;f.setAttribute('data-x','1');var d=document.createElement('div');d.style.marginTop='8px';d.innerHTML='<button class="miniBtn" onclick="event.stopPropagation();openYt(&quot;'+id+'&quot;)">▶️ YouTube</button> <button class="miniBtn" onclick="event.stopPropagation();queueTg(&quot;'+id+'&quot;)">📥 TG</button>';f.appendChild(d)}
window.addEventListener('message',function(e){try{var o=String(e.origin||'');if(o.indexOf('youtube.com')<0&&o.indexOf('youtube-nocookie.com')<0)return;var d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d&&d.event==='onError'&&window.sfCurEmbedId){var c=Number(d.info||0);showFail(window.sfCurEmbedId);toast(c===101||c===150?'Is video pe embed band hai — YouTube dabao':(c===100?'Video YouTube pe nahi mil rahi — Next dabao':'Video load nahi hui — Retry ya YouTube dabao'))}}catch(err){}});
function retryVideo(id){hideFail(id);const c=document.querySelector('[data-id="'+id+'"]');if(!c)return;const ifr=c.querySelector('iframe,video');if(ifr){if(ifr.tagName==='VIDEO'){try{ifr.pause()}catch(e){}}ifr.remove()}enter(c)}function nextFromVideo(id){fetch('/api/bad-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:id,reason:'stuck'})}).catch(()=>{});const c=document.querySelector('[data-id="'+id+'"]'),cards=[...document.querySelectorAll('.short')],idx=c?parseInt(c.dataset.idx||'0',10):0;if(c){const ifr=c.querySelector('iframe,video');if(ifr){try{if(ifr.tagName==='VIDEO'){ifr.pause()}else if(ifr.contentWindow){ifr.contentWindow.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:''}),'*')}}catch(e){}ifr.remove();}}if(cards[idx+1])cards[idx+1].scrollIntoView({behavior:'smooth',block:'start'})}
function post(id,func){const _el=document.querySelector('[data-id="'+id+'"]');const _v=_el&&_el.querySelector('video');if(_v){try{if(func==='playVideo'){_v.play().catch(function(){})}else if(func==='pauseVideo'){_v.pause()}else if(func==='mute'){_v.muted=true}else if(func==='unMute'){_v.muted=false;_v.play().catch(function(){})}}catch(e){}return}const ifr=_el&&_el.querySelector('iframe');try{ifr&&ifr.contentWindow.postMessage(JSON.stringify({event:'command',func,args:''}),'*')}catch{}}function handleTap(id){const now=Date.now();if(lastTapId===id&&now-lastTapAt<320){clearTimeout(tapTimer);lastTapId='';doubleTapLike(id);return}lastTapAt=now;lastTapId=id;clearTimeout(tapTimer);tapTimer=setTimeout(()=>{if(lastTapId===id){lastTapId='';togglePlay(id)}},330)}function togglePlay(id){if(pausedIds.has(id)){pausedIds.delete(id);post(id,'playVideo');sendSignal(id,'pause_resume',1)}else{pausedIds.add(id);post(id,'pauseVideo')}const p=document.getElementById('pause-'+id);if(p){p.classList.remove('show');void p.offsetWidth;p.classList.add('show')}}function doubleTapLike(id){const h=document.getElementById('heart-'+id);if(h){h.classList.remove('show');void h.offsetWidth;h.classList.add('show')}const v=findVid(id);if(!v.liked)toggleLike(id,'double_like');else sendSignal(id,'double_like',1)}function toggleMute(id){muted=!muted;document.querySelectorAll('.mute').forEach(b=>b.textContent=muted?'🔇 Unmute':'🔊 Mute');post(id,muted?'mute':'unMute');if(!muted)post(id,'playVideo')}
let sfSignals=0,sfSigQ=[];function sendSignal(id,event,value){if(++sfSignals>250)return;sfSigQ.push({id:id,event:event,value:value||0});if(sfSigQ.length>4)sfSigQ.shift();}
setInterval(function(){if(!sfSigQ.length)return;const s=sfSigQ.shift();const vv=findVid(s.id)||{};fetch('/api/signal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,videoId:s.id,event:s.event,value:s.value,mood:currentMood||'focus',cat:vv.cat||'',ch:vv.chId||'',lastCats:(sfSession&&sfSession.cats&&Object.keys(sfSession.cats).length)?Object.keys(sfSession.cats).sort((x,y)=>sfSession.cats[y]-sfSession.cats[x]).slice(0,3):[],lc2:(sfSession&&sfSession.cats&&Object.keys(sfSession.cats).length)?Object.keys(sfSession.cats).sort((x,y)=>sfSession.cats[y]-sfSession.cats[x]).slice(0,3).map(c=>c+':'+sfSession.cats[c]).join(','):''})}).catch(()=>{})},600);function markWatched(id){trackSessionReel(id);var _nw=Date.now();sfSession.taps=(sfSession.taps||[]).filter(function(t){return _nw-t<60000});sfSession.taps.push(_nw);if(watchedLocal.has(id))return;watchedLocal.add(id);localStorage.setItem('sf_watched_local',JSON.stringify([...watchedLocal].slice(-20000)));fetch('/api/watched',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,videoId:id})}).catch(()=>{})}function findVid(id){return videos.find(v=>v.id===id)||{id}}function toggleLike(id,signal='like'){const v=findVid(id);v.liked=!v.liked;const el=document.getElementById('like-'+id);if(el){el.textContent=v.liked?'❤️':'🤍';el.classList.toggle('on',v.liked)}fetch('/api/like',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,videoId:id,on:v.liked,mood:currentMood||'focus'})}).catch(()=>{});if(v.liked){sessionBump(v.cat,10);sendSignal(id,signal,1)}}function toggleFollow(id){const v=findVid(id);if(!v.chId)return toast('Channel missing');v.followed=!v.followed;document.querySelectorAll('.short').forEach(c=>{const vv=findVid(c.dataset.id);if(vv.chId===v.chId){vv.followed=v.followed;const b=document.getElementById('fb-'+vv.id),p=document.getElementById('fp-'+vv.id),t=document.getElementById('fltxt-'+vv.id);if(b){b.textContent=v.followed?'✓':'+';b.classList.toggle('on',v.followed)}if(p){p.textContent=v.followed?'Following':'Follow';p.classList.toggle('on',v.followed)}if(t)t.textContent=v.followed?'Following':'Follow'}});fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,channelId:v.chId,channelName:v.ch,on:v.followed})}).catch(()=>{})}function moreLikeThis(id){const v=findVid(id);if(v&&v.cat)sessionBump(v.cat,24);sendSignal(id,'more_like_this',1);toast('More like this')}function notInterested(id){const v=findVid(id);if(v&&v.cat)sessionBump(v.cat,-24);sendSignal(id,'not_interested',-1);nextFromVideo(id);toast('Less like this')}function shareVid(id){const v=findVid(id);if(v&&v.cat)sessionBump(v.cat,14);sendSignal(id,'share',1);const u='https://www.youtube.com/shorts/'+id;if(navigator.share)navigator.share({url:u}).catch(()=>{});else navigator.clipboard.writeText(u).then(()=>toast('Copied'))}
function currentCardIndex(){const cards=[...document.querySelectorAll('.short')],mid=feed.scrollTop+feed.clientHeight/2;let best=0,d=1e9;cards.forEach((c,i)=>{const x=Math.abs(c.offsetTop+c.offsetHeight/2-mid);if(x<d){d=x;best=i}});return best}function goCard(n){const cards=[...document.querySelectorAll('.short')],i=Math.max(0,Math.min(cards.length-1,currentCardIndex()+n));if(cards[i])cards[i].scrollIntoView({behavior:'smooth',block:'start'});if(cards.length-i<14)loadMore(true)}window.addEventListener('keydown',e=>{if(document.getElementById('panel').style.display==='flex')return;if(['ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();goCard(1)}else if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();goCard(-1)}});
function openSettings(){document.getElementById('panel').style.display='flex';loadStats();loadPharmacy()}function closeSettings(){document.getElementById('panel').style.display='none'}async function manualCollect(){try{toast('Collecting...');await api('/api/collect?maxSearchCalls=1&rssLimit=2',{method:'POST'});toast('Done');refreshFeed(true);loadStats()}catch(e){toast('Collect error: '+e.message)}}async function manualCleanup(){try{await api('/api/cleanup',{method:'POST'});toast('Cleanup done');loadStats()}catch(e){toast('Cleanup error: '+e.message)}}async function resetTaste(){try{await api('/api/reset-taste',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId})});sessionStorage.removeItem('sf_session_prefs');sessionPrefs={};toast('Taste reset');refreshFeed(true);loadStats()}catch(e){toast('Reset error')}}async function loadStats(){try{const s=(await api('/api/stats?userId='+encodeURIComponent(userId))).stats;document.getElementById('stats').innerHTML='Approx bank: <b>'+s.videos+'</b><br>Top taste: <b>'+(s.topPrefs||'learning')+'</b><br>Slot: <b>'+(s.currentSlot||'-')+'</b> • <b>'+(s.slotPrefs||'learning')+'</b><br>Keywords: <b>'+(s.topKeywords||'learning')+'</b><br>Mood: <b>'+(s.moodPrefs||'learning')+'</b><br>Quota: <b>'+s.quotaUsed+'/10000</b><br>Caps: <b>'+s.maxVideosInDb+' videos / '+s.maxChannelsInDb+' channels</b><br>Last collect: <b>'+(s.lastCollectAt?new Date(s.lastCollectAt).toLocaleString():'never')+'</b><br>Last cleanup: <b>'+(s.lastPruneAt?new Date(s.lastPruneAt).toLocaleString():'never')+'</b>'}catch(e){document.getElementById('stats').textContent='Stats error: '+e.message}}function refreshFeed(reset=false){if(reset){videos=[];cursor=Date.now()+999999999;document.getElementById('feed').innerHTML=''}loadMore(false)}const feed=document.getElementById('feed');feed.addEventListener('scroll',()=>{if(!loading&&feed.scrollTop+feed.clientHeight>=feed.scrollHeight-feed.clientHeight*3)loadMore(true)},{passive:true});setInterval(()=>{if(document.hidden)return;if(!coOpen&&sfSession&&sfSession.reels>=20){showCheckout();return;}if(!loading&&videos.length&&document.querySelectorAll('.short').length-currentCardIndex()<8)loadMore(true)},2500);function syncTopbar(){try{var t=document.querySelector('.top');if(t){var h=Math.round(t.getBoundingClientRect().height);if(h>0)document.documentElement.style.setProperty('--topbar-h',h+'px');}}catch(e){}}
window.addEventListener('resize',syncTopbar);window.addEventListener('orientationchange',syncTopbar);
syncTopbar();setTimeout(syncTopbar,60);setTimeout(syncTopbar,400);setTimeout(syncTopbar,1500);
try{var oe=window.enter;window.enter=function(el){var r=oe.apply(this,arguments);var f=el&&el.querySelector&&el.querySelector('iframe');if(f&&f.src&&f.src.indexOf('youtube')>=0){var sv=f.src;f.removeAttribute('src');f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');f.src=sv;}return r;};}catch(e){}
try{new MutationObserver(function(ms){ms.forEach(function(m){if(m.addedNodes)m.addedNodes.forEach(function(n){if(n&&n.tagName==='IFRAME'&&n.src&&n.src.indexOf('youtube')>=0&&!n.getAttribute('referrerpolicy'))n.setAttribute('referrerpolicy','strict-origin-when-cross-origin');});});}).observe(document.body,{childList:true,subtree:true});}catch(e){}
renderChips();
startSession(currentMood||null);
if(currentMood)refreshFeed(true);else showMoodIfNeeded();
</script></body></html>`;


const TG_DEFAULTS = { apiBase: 'https://api.telegram.org', maxMB: 20, maxDuration: 90, dailyLimit: 40 };

function tgEnabled(env) { return !!(env.TG_BOT_TOKEN && env.TG_CHAT_ID); }
// Telegram Bot API can only *download* files up to 20MB (getFile). Uploading a
// bigger video works, but /v/:id then answers 413 and the feed can't play it.
// Keep maxBytes inside the download cap unless a local Bot API server is used.
function tgFileLimitBytes(env) {
  if (String(env.TG_LOCAL_API === undefined ? '0' : env.TG_LOCAL_API) === '1') return 2000 * 1048576;
  return envInt(env, 'TG_FILE_LIMIT_MB', 20, 1, 2000) * 1048576;
}
function tgCfg(env) {
  return {
    api: String(env.TG_API_BASE || TG_DEFAULTS.apiBase).replace(/\/+$/, ''),
    token: String(env.TG_BOT_TOKEN || ''),
    chat: String(env.TG_CHAT_ID || ''),
    maxBytes: Math.min((parseInt(env.TG_MAX_MB || String(TG_DEFAULTS.maxMB), 10) || TG_DEFAULTS.maxMB) * 1024 * 1024, tgFileLimitBytes(env)),
    maxDuration: parseInt(env.TG_MAX_DURATION || String(TG_DEFAULTS.maxDuration), 10) || TG_DEFAULTS.maxDuration,
    dailyLimit: parseInt(env.TG_DAILY_LIMIT || String(TG_DEFAULTS.dailyLimit), 10) || TG_DEFAULTS.dailyLimit,
  };
}

async function tgApiCall(env, method, payload, timeoutMs = 25000) {
  const cfg = tgCfg(env);
  if (!cfg.token) throw new Error('TG_BOT_TOKEN set nahi hai');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('tg timeout')), timeoutMs);
  try {
    const res = await sfFetch(cfg.api + '/bot' + cfg.token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ctrl.signal,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) throw new Error('TG ' + method + ' fail: ' + (j.description || res.status));
    return j.result;
  } finally { clearTimeout(timer); }
}

async function tgSendVideo(env, { bytes, filename, caption, duration, width, height, thumbJpeg }) {
  const cfg = tgCfg(env);
  if (!cfg.token) throw new Error('TG_BOT_TOKEN set nahi hai');
  if (!cfg.chat) throw new Error('TG_CHAT_ID set nahi hai');
  const fd = new FormData();
  fd.append('chat_id', cfg.chat);
  fd.append('video', new Blob([bytes], { type: 'video/mp4' }), filename || 'video.mp4');
  fd.append('supports_streaming', 'true');
  fd.append('disable_notification', 'true');
  if (caption) fd.append('caption', String(caption).slice(0, 1000));
  if (duration) fd.append('duration', String(Math.max(1, Math.round(duration))));
  if (width) fd.append('width', String(width));
  if (height) fd.append('height', String(height));
  if (thumbJpeg) fd.append('thumbnail', new Blob([thumbJpeg], { type: 'image/jpeg' }), 'thumb.jpg');
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('tg upload timeout')), envInt(env, 'TG_UPLOAD_TIMEOUT_MS', 30000, 5000, 120000));
    try {
      const res = await sfFetch(cfg.api + '/bot' + cfg.token + '/sendVideo', { method: 'POST', body: fd, signal: ctrl.signal });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) {
        const v = j.result?.video || j.result?.document || {};
        return { file_id: v.file_id, file_unique_id: v.file_unique_id, size: Number(v.file_size || bytes.length || 0), message_id: j.result?.message_id };
      }
      // 429 (rate limit) / 5xx (Telegram hiccup) are worth one retry — otherwise a
      // fully downloaded video is thrown away and must be downloaded again later.
      const retryable = res.status === 429 || res.status >= 500 || j.error_code === 429 || j.error_code >= 500;
      lastErr = new Error('TG sendVideo fail: ' + (j.description || res.status));
      if (!retryable || attempt === 1 || sfLeft() < 4) throw lastErr;
      const waitMs = Math.min(10000, Math.max(600, Number(j?.parameters?.retry_after || 0) * 1000 || 1200));
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (e) {
      lastErr = e;
      const msg = String((e && e.message) || e);
      const retryable = /timeout|abort|network|fetch|ECONN|sendVideo fail: (429|5\d\d)/i.test(msg);
      if (!retryable || attempt === 1 || sfLeft() < 4) throw e;
      await new Promise((r) => setTimeout(r, 1200));
    } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('TG sendVideo fail');
}

async function tgGetFile(env, fileId) {
  return await tgApiCall(env, 'getFile', { file_id: fileId }, 20000);
}

const GRAB_BUILTIN = [
  { clientName: 'ANDROID_VR', clientVersion: '1.62.27', androidSdkVersion: 32, deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12', userAgent: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12; en_US; Quest 3) gzip' },
  { clientName: 'ANDROID', clientVersion: '21.26.364', androidSdkVersion: 30, osName: 'Android', osVersion: '11', userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip' },
  { clientName: 'ANDROID', clientVersion: '19.35.36', androidSdkVersion: 30, osName: 'Android', osVersion: '11', userAgent: 'com.google.android.youtube/19.35.36 (Linux; U; Android 11) gzip' },
  { clientName: 'ANDROID_VR', clientVersion: '1.61.48', androidSdkVersion: 32, deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12', userAgent: 'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3) gzip' },
  { clientName: 'ANDROID_VR', clientVersion: '1.56.21', androidSdkVersion: 32, deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12', userAgent: 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12; en_US; Quest 3) gzip' },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.1.22D72', userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X)' },
];
const GRAB_WEB_CLIENTS = [
  { clientName: 'WEB', clientVersion: '2.20260708.00.00', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', auth: true, source: 'web' },
  { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '2.20260708.00.00', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)', auth: true, embed: true, source: 'web' },
];

function parseYtdlpClientsLite(text) {
  const out = [];
  try {
    const start = String(text).indexOf('INNERTUBE_CLIENTS');
    if (start < 0) return out;
    const body = String(text).slice(start);
    const WANT = new Set(['ANDROID_VR', 'ANDROID_VISIONOS', 'IOS', 'ANDROID']);
    const entryRe = /\n {4}'([a-z0-9_]+)':\s*\{/g;
    const marks = [];
    let m;
    while ((m = entryRe.exec(body))) marks.push(m.index);
    for (let i = 0; i < marks.length; i++) {
      const block = body.slice(marks[i], marks[i + 1] ?? body.length);
      const ci = block.indexOf("'client':");
      if (ci < 0) continue;
      const cblk = block.slice(ci, ci + 1200);
      const g = (f) => { const r = new RegExp("'" + f + "':\\s*'([^']*)'").exec(cblk); return r ? r[1] : null; };
      const gn = (f) => { const r = new RegExp("'" + f + "':\\s*(\\d+)").exec(cblk); return r ? Number(r[1]) : null; };
      const clientName = g('clientName'), clientVersion = g('clientVersion');
      if (!clientName || !clientVersion || !WANT.has(clientName)) continue;
      const potRe = /StreamingProtocol\.HTTPS:\s*GvsPoTokenPolicy\(\s*[\s\S]{0,120}?required=(True|False)/.exec(block);
      out.push({
        clientName, clientVersion, needsPot: potRe ? potRe[1] === 'True' : undefined, source: 'yt-dlp',
        userAgent: g('userAgent') || undefined, deviceMake: g('deviceMake') || undefined, deviceModel: g('deviceModel') || undefined,
        osName: g('osName') || undefined, osVersion: g('osVersion') || undefined, androidSdkVersion: gn('androidSdkVersion') || undefined,
      });
    }
  } catch (e) {}
  return out;
}

async function refreshGrabClients(env, force = false) {
  const raw = await getSetting(env, 'grab_clients', '');
  let cache = null;
  try { cache = raw ? JSON.parse(raw) : null; } catch (e) {}
  const ttlH = envInt(env, 'TG_CLIENTS_TTL_H', 24, 1, 720);
  const fresh = cache && cache.at && Date.now() - cache.at < ttlH * 3600e3;
  if (fresh && !force) return cache.clients || [];
  const clients = [];
  const got = { ytdlp: 0, itunes: 0 };
  try {
    const r = await sfFetch(env.GRAB_YTDLP_URL || 'https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/yt_dlp/extractor/youtube/_base.py', { headers: { 'User-Agent': 'shortsfire-grab/1', Range: 'bytes=0-220000' } });
    if (r.ok || r.status === 206) { const parsed = parseYtdlpClientsLite((await r.text()).slice(0, 260000)); clients.push(...parsed); got.ytdlp = parsed.length; }
  } catch (e) {}
  try {
    const r = await sfFetch(env.GRAB_ITUNES_URL || 'https://itunes.apple.com/lookup?bundleId=com.google.ios.youtube');
    if (r.ok) {
      const j = await r.json();
      const v = j?.results?.[0]?.version;
      if (v && /^\d+(\.\d+){2,3}$/.test(v)) {
        clients.push({ clientName: 'IOS', clientVersion: v, deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', userAgent: 'com.google.ios.youtube/' + v + ' (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)', source: 'itunes' });
        got.itunes = 1;
      }
    }
  } catch (e) {}
  const seen = new Set();
  const merged = [];
  const push = (c) => { const k = c.clientName + '/' + c.clientVersion; if (seen.has(k)) return; seen.add(k); merged.push(c); };
  for (const c of clients) if (c.needsPot !== true) push(c);
  for (const c of GRAB_BUILTIN) push({ ...c, needsPot: false });
  for (const c of clients) if (c.needsPot === true) push(c);
  const out = { at: Date.now(), got, clients: merged.slice(0, 8) };
  await setSetting(env, 'grab_clients', JSON.stringify(out)).catch(() => {});
  return out.clients;
}
async function grabClientsList(env) {
  try {
    const raw = await getSetting(env, 'grab_clients', '');
    if (raw) { const c = JSON.parse(raw); if (c && Array.isArray(c.clients) && c.clients.length) return c.clients; }
  } catch (e) {}
  return GRAB_BUILTIN;
}

function grabRelay(env, target) {
  const base = env.GRAB_PROXY_BASE;
  if (!base) return null;
  return String(base) + (String(base).includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(target);
}
async function grabFetch(env, target, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('grab timeout')), timeoutMs || envInt(env, 'TG_GRAB_TIMEOUT_MS', 9000, 2000, 60000));
  try {
    const relay = grabRelay(env, target);
    if (relay) {
      const h = new Headers(init?.headers || {});
      h.set('x-target-url', target);
      return await sfFetch(relay, { ...(init || {}), headers: h, signal: ctrl.signal });
    }
    return await sfFetch(target, { ...(init || {}), signal: ctrl.signal });
  } finally { clearTimeout(timer); }
}

function grabYtBase(env) { return String(env.YT_PLAYER_BASE || 'https://www.youtube.com').replace(/\/+$/, ''); }
function parseCookieString(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return null;
  const okRe = /SAPISID|SID=|__Secure/;
  const expMap = {};
  let pairs = null;
  // 0) JSON format (Cookie-Editor / EditThisCookie extension, ya {"cookies":[...]})
  if (txt[0] === '[' || txt[0] === '{') {
    try {
      const j = JSON.parse(txt);
      const arr = Array.isArray(j) ? j : (Array.isArray(j.cookies) ? j.cookies : (Array.isArray(j.data) ? j.data : []));
      const out = [];
      for (const c of arr) {
        const n = c && (c.name || c.key);
        const v = c && c.value;
        if (typeof n === 'string' && n && v !== undefined && v !== null) { out.push(n + '=' + v); const ex = Number(c.expirationDate) || 0; if (ex) expMap[n] = ex; }
      }
      pairs = out.length ? out : null;
    } catch (e) { return null; }
  }
  // 1) cookies.txt (Netscape) format — tab-separated
  else if (/\t/.test(txt) || /#\s*(Netscape|HTTP)/i.test(txt)) {
    const out = [];
    //    NOTE: '#HttpOnly_.youtube.com ...' lines me SABSE ZAROORI cookies hoti hain (SID/SAPISID) — unhe skip nahi karna!
    for (let line of txt.split(/[\r\n]+/)) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
      else if (line.startsWith('#')) continue;
      const p = line.split('\t');
      if (p.length >= 7 && /youtube|google/i.test(p[0])) { out.push(p[5] + '=' + p[6]); const ex = parseInt(p[4], 10) || 0; if (ex) expMap[p[5]] = ex; }
    }
    pairs = out.length ? out : null;
  }
  // 2) raw Cookie header: "SID=...; HSID=...; SAPISID=..."
  else {
    pairs = [txt.replace(/[\r\n]+/g, ' ')];
  }
  if (!pairs) return null;
  const header = pairs.join('; ');
  if (!okRe.test(header)) return null;
  const names = [];
  for (const kv of header.split(';')) { const n = kv.trim().split('=')[0].trim(); if (n && !names.includes(n)) names.push(n); }
  const critList = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID', 'LOGIN_INFO'];
  const critical = {};
  const expired = [];
  let expMin = 0;
  const nowS = Math.floor(Date.now() / 1000);
  for (const n of critList) { const has = names.includes(n); critical[n] = has; const ex = expMap[n]; if (has && ex) { if (ex < nowS) expired.push(n); if (!expMin || ex < expMin) expMin = ex; } }
  return { header, names, count: names.length, critical, expired, expMin };
}
function envCookieRaw(env) { return String([env.YT_COOKIE, env.YT_COOKIE_2, env.YT_COOKIE_3].filter(Boolean).join('') || '').trim(); }
async function ytCookieInfo(env) {
  try {
    const r = rowsToObjects(await turso(env, "SELECT value FROM settings WHERE key='yt_cookie'", []));
    const v = String(r[0] && r[0].value || '').trim();
    if (v) return { raw: v, source: 'db' };
  } catch (e) {}
  const e2 = envCookieRaw(env);
  if (e2) return { raw: e2, source: 'env' };
  return { raw: '', source: 'none' };
}
async function resolveCookieMode(env, force) {
  if (!force) {
    try {
      const raw = await getSetting(env, 'grab_cookie_mode', '');
      if (raw) { const c = JSON.parse(raw); if (c && c.at && Date.now() - c.at < 10 * 60e3) return c; }
    } catch (e) {}
  }
  let dbRaw = '', envRaw = '';
  try { const r = rowsToObjects(await turso(env, "SELECT value FROM settings WHERE key='yt_cookie'", [])); dbRaw = String((r[0] && r[0].value) || '').trim(); } catch (e) {}
  envRaw = envCookieRaw(env);
  const override = String(env.TG_COOKIE_MODE || 'auto').toLowerCase();
  const cand = (override === 'auto') ? [dbRaw ? 'db' : null, envRaw ? 'env' : null, 'none'].filter(Boolean) : [override];
  const probeId = String(env.TG_PROBE_VIDEO === undefined ? 'dQw4w9WgXcQ' : env.TG_PROBE_VIDEO);
  const out = { mode: 'none', at: Date.now(), probe: probeId, tested: [], cookie: null };
  const headerFor = (m) => m === 'none' ? null : ((parseCookieString(m === 'db' ? dbRaw : envRaw) || {}).header || null);
  if (!probeId || override !== 'auto') {
    if (override !== 'auto') out.mode = override; else out.mode = dbRaw ? 'db' : envRaw ? 'env' : 'none';
    out.cookie = headerFor(out.mode);
    if (!probeId) out.tested.push({ mode: 'skip', ok: true, why: 'TG_PROBE_VIDEO off' });
  } else if (sfLeft() >= 4) {
    let cl = null;
    try { cl = (await grabClientsList(env))[0] || GRAB_BUILTIN[0]; } catch (e) { cl = GRAB_BUILTIN[0]; }
    for (const m of cand) {
      const hdr = headerFor(m);
      if (m !== 'none' && !hdr) { out.tested.push({ mode: m, ok: false, why: 'parse fail' }); continue; }
      let ok = false, why = '';
      try {
        const j = await grabPlayerJson(env, probeId, cl, null, { cookieOverride: hdr });
        why = String(j?.playabilityStatus?.status || '?');
        ok = why === 'OK';
      } catch (e) { why = String(e.message || e).slice(0, 40); }
      out.tested.push({ mode: m, ok, why });
      if (ok) { out.mode = m; out.cookie = hdr; break; }
    }
  } else {
    out.mode = dbRaw ? 'db' : envRaw ? 'env' : 'none';
    out.cookie = headerFor(out.mode);
    out.tested.push({ mode: out.mode, ok: true, why: 'budget: probe skipped' });
  }
  await setSetting(env, 'grab_cookie_mode', JSON.stringify(out)).catch(() => {});
  return out;
}
async function grabCookie(env) {
  try { const r = await resolveCookieMode(env); return r.cookie || null; } catch (e) { return null; }
}
function grabVisitorData(env) { return String(env.YT_VISITOR_DATA || '').trim() || null; }

async function grabSha1Hex(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function grabVisitorAuto(env) {
  try {
    const raw = await getSetting(env, 'grab_visitor', '');
    if (raw) { const c = JSON.parse(raw); const ttl = Number(c && c.ttl) || (c && c.v ? 43200000 : 600000); if (c && c.at && Date.now() - c.at < ttl) return c.v || null; }
  } catch (e) {}
  let v = null;
  try {
    const r = await sfFetch(env.GRAB_VISITOR_URL || 'https://www.youtube.com/sw.js_data', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (r.ok) {
      const t = await r.text();
      const m = /"visitorData"\s*:\s*"([^"]+)"/.exec(t) || /\["visitorData",\s*"([^"]+)"\]/.exec(t);
      if (m) v = m[1];
    }
  } catch (e) {}
  await setSetting(env, 'grab_visitor', JSON.stringify({ at: Date.now(), v, ttl: v ? 43200000 : 600000 })).catch(() => {});
  return v;
}
async function grabPlayerJson(env, videoId, client, meta, opts) {
  const ctx = { clientName: client.clientName, clientVersion: client.clientVersion, hl: 'en', gl: 'IN' };
  for (const k of ['deviceMake', 'deviceModel', 'osName', 'osVersion', 'userAgent']) if (client[k]) ctx[k] = client[k];
  if (client.androidSdkVersion) ctx.androidSdkVersion = client.androidSdkVersion;
  const ua = client.userAgent || 'Mozilla/5.0';
  const cookie = (opts && opts.noCookie) ? null : ((opts && 'cookieOverride' in opts) ? (opts.cookieOverride || null) : await grabCookie(env));
  const consent = String(env.TG_CONSENT_COOKIE === undefined ? 'SOCS=CAI; CONSENT=YES+1' : env.TG_CONSENT_COOKIE);
  const sendCookie = cookie || consent || null;
  const visitorData = grabVisitorData(env) || await grabVisitorAuto(env);
  const headers = { 'Content-Type': 'application/json', 'User-Agent': ua, 'X-Goog-Api-Format-Version': '1', Origin: 'https://www.youtube.com', 'Accept-Language': 'en-US,en;q=0.9' };
  if (!(opts && opts.noCookie) && sendCookie) headers.Cookie = sendCookie;
  if (visitorData) ctx.visitorData = visitorData;
  if (client.auth && cookie) {
    const sm = /(?:^|;\s*)SAPISID=([^;]+)/.exec(cookie);
    if (sm) {
      const ts = Math.floor(Date.now() / 1000);
      headers.Authorization = 'SAPISIDHASH ' + ts + '_' + await grabSha1Hex(ts + ' ' + sm[1] + ' https://www.youtube.com');
      headers['X-Origin'] = 'https://www.youtube.com';
      headers['X-Goog-AuthUser'] = '0';
    }
  }
  const res = await grabFetch(env, grabYtBase(env) + '/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify({ context: client.embed ? { client: ctx, thirdParty: { embedUrl: 'https://www.youtube.com/' } } : { client: ctx }, videoId, contentCheckOk: true, racyCheckOk: true }),
  }, envInt(env, 'TG_PLAYER_TIMEOUT_MS', 9000, 2000, 60000));
  if (meta) meta.http = res.status;
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return { __raw: String(txt).slice(0, 140) }; }
}

async function grabProbeOk(env) {
  const probeId = String(env.TG_PROBE_VIDEO === undefined ? 'dQw4w9WgXcQ' : env.TG_PROBE_VIDEO);
  if (!probeId) return false;
  try {
    const raw = await getSetting(env, 'grab_probe', '');
    if (raw) { const c = JSON.parse(raw); if (c && c.at && Date.now() - c.at < 10 * 60e3 && c.id === probeId) return c.ok === true; }
  } catch (e) {}
  let ok = false;
  try {
    const cl = (await grabClientsList(env))[0] || GRAB_BUILTIN[0];
    const j = await grabPlayerJson(env, probeId, cl);
    ok = j?.playabilityStatus?.status === 'OK';
  } catch (e) {}
  await setSetting(env, 'grab_probe', JSON.stringify({ at: Date.now(), ok, id: probeId })).catch(() => {});
  return ok;
}
async function altGrabMp4(env, videoId, opts = {}) {
  const maxBytes = opts.maxBytes || 20 * 1024 * 1024;
  const maxDuration = opts.maxDuration || 90;
  const list = String(env.TG_ALT_SOURCES_LIST || 'https://inv.nadeko.net,https://yewtu.be,https://invidious.nerdvpn.de').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
  const tries = [];
  for (const base of list.slice(0, envInt(env, 'TG_ALT_SOURCES_MAX', 3, 1, 8))) {
    let info = null;
    try {
      const isPiped = /piped/i.test(base);
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(new Error('timeout')), envInt(env, 'TG_ALT_TIMEOUT_SEC', 7, 3, 20) * 1000);
      const r = await sfFetch(isPiped ? base + '/streams/' + videoId : base + '/api/v1/videos/' + videoId + '?fields=title,author,lengthSeconds,formatStreams', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) { tries.push(base + ':' + r.status); continue; }
      const j = await r.json();
      const dur = Number(j.lengthSeconds || 0);
      if (dur && dur > maxDuration) return { skip: 'too_long (' + dur + 's)' };
      let cand = [];
      if (isPiped) cand = (j.videoStreams || []).filter((x) => x.url && !x.videoOnly && /mp4/i.test(String(x.mimeType || ''))).map((x) => ({ url: x.url, itag: 18, q: String(x.quality || '') }));
      else cand = (j.formatStreams || []).filter((x) => x.url && /mp4/i.test(String(x.container || 'mp4'))).map((x) => ({ url: x.url, itag: Number(x.itag) || 18, q: String(x.qualityLabel || '') }));
      // "1080p" < "360p" lexicographically -> the old sort grabbed the BIGGEST
      // stream (slow, and the first to hit the Range/size cap). Prefer itag 18,
      // then the smallest resolution.
      const qNum = (x) => { const m = /(\d{3,4})/.exec(String(x.q || x.itag || '')); return m ? Number(m[1]) : 9999; };
      cand.sort((a, b) => (a.itag === 18 ? -1 : b.itag === 18 ? 1 : qNum(a) - qNum(b)));
      info = { base, j, cand, dur };
    } catch (e) { tries.push(base + ':' + String(e.message || e).slice(0, 20)); continue; }
    for (const c of info.cand.slice(0, 2)) {
      try {
        const res = await grabFetch(env, c.url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*', Range: 'bytes=0-' + (maxBytes - 1) } }, envInt(env, 'TG_DL_TIMEOUT_MS', 18000, 5000, 60000));
        if (res.status !== 200 && res.status !== 206) { tries.push(info.base + ':stream' + res.status); continue; }
        const realTotal = mediaTotalBytes(res);
        if (realTotal && realTotal > maxBytes) return { skip: 'too_big (' + Math.round(realTotal / 1048576) + 'MB > ' + Math.round(maxBytes / 1048576) + 'MB)' };
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (realTotal && bytes.length < realTotal) { tries.push(info.base + ':truncated'); continue; }
        if (bytes.length > maxBytes) return { skip: 'too_big (actual ' + Math.round(bytes.length / 1048576) + 'MB)' };
        if (bytes.length < 20000) { tries.push(info.base + ':tiny'); continue; }
        const isMp4 = bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
        if (!isMp4) { tries.push(info.base + ':not-mp4'); continue; }
        return { bytes, size: bytes.length, itag: c.itag, duration: info.dur, width: 640, height: 360, title: String(info.j.title || ''), channel: String(info.j.author || ''), via: 'alt:' + new URL(info.base).host, thumbUrl: '' };
      } catch (e) { tries.push(info.base + ':fetch'); }
    }
  }
  return { altTries: tries };
}
// A Range request (bytes=0-(maxBytes-1)) on a file bigger than maxBytes returns
// 206 with a truncated body. Before this helper the truncation looked like a
// successful download, so a half MP4 was uploaded to Telegram (= corrupt video).
function mediaTotalBytes(res) {
  try {
    const cr = String(res.headers.get('content-range') || '');
    const m = /\/\s*(\d+)\s*$/.exec(cr);
    if (m) return Number(m[1]) || 0;                 // real file size from "bytes 0-9/12345"
    const cl = Number(res.headers.get('content-length') || 0);
    return Number.isFinite(cl) && cl > 0 ? cl : 0;
  } catch (e) { return 0; }
}

async function grabMp4(env, videoId, opts = {}) {
  const maxBytes = opts.maxBytes || 20 * 1024 * 1024;
  const maxDuration = opts.maxDuration || 90;
  const capN = envInt(env, 'TG_GRAB_CLIENTS', 5, 1, 8);
  const pool = (await grabClientsList(env)).slice(0, Math.min(8, capN + 1));
  const rot = pool.length > 1 ? (Math.floor(Date.now() / (envInt(env, 'TG_CLIENT_ROTATE_MIN', 20, 1, 720) * 60000)) % pool.length) : 0;
  let clients = pool.slice(rot).concat(pool.slice(0, rot)).slice(0, capN);
  const wc0 = await grabCookie(env);
  if (wc0 && /(?:^|;\s*)SAPISID=/.test(wc0) && String(env.TG_WEB_COOKIE_CLIENT || '1') !== '0') clients = clients.concat(GRAB_WEB_CLIENTS);
  const consent = String(env.TG_CONSENT_COOKIE === undefined ? 'SOCS=CAI; CONSENT=YES+1' : env.TG_CONSENT_COOKIE);
  const attempts = [];
  let stopEarly = false, loginSeen = 0, webJumped = false;
  for (let ci = 0; ci < clients.length; ci++) {
    if (stopEarly) break;
    if (sfLeft() < 4) { attempts.push('stop:subrequest-budget'); break; }
    const client = clients[ci];
    for (let retry = 0; retry < 2; retry++) {
      const jit = envInt(env, 'TG_JITTER_MS', 150, 0, 5000);
      if (jit > 0) await new Promise((r) => setTimeout(r, Math.floor(Math.random() * jit)));
      let json;
      try { json = await grabPlayerJson(env, videoId, client); }
      catch (e) { attempts.push(client.clientName + ':api(' + String(e.message).slice(0, 30) + ')'); break; }
      const st = json?.playabilityStatus?.status;
      if (st !== 'OK') {
        const why = String(json?.playabilityStatus?.reason || '');
        if (st === 'ERROR' && /unavailable|private|removed|deleted|no longer|terminated/i.test(why) && await grabProbeOk(env)) return { skip: 'video unavailable (' + why.slice(0, 50) + ')' };
        attempts.push(client.clientName + ':' + st);
        if (st === 'LOGIN_REQUIRED') {
          loginSeen++;
          if (loginSeen >= 2 && clients.length > 2) {
            const lastC = clients[clients.length - 1] || {};
            if (lastC.auth && !webJumped && client !== lastC) { webJumped = true; ci = clients.length - 2; attempts.push('jump→WEB'); }
            else if (!lastC.auth) { stopEarly = true; attempts.push('early-exit: bot-check'); }
          }
        }
        break;
      }
      const vd = json.videoDetails || {};
      const durSec = Number(vd.lengthSeconds || 0);
      if (durSec && durSec > maxDuration) return { skip: 'too_long (' + durSec + 's > ' + maxDuration + 's)' };
      const sd = json.streamingData || {};
      const muxed = (sd.formats || []).filter((f) => f.url);
      const f = muxed.find((x) => x.itag === 18) || muxed.find((x) => x.itag === 22) || muxed[0];
      if (!f) { attempts.push(client.clientName + ':no-muxed'); break; }
      const lenHint = Number(f.contentLength || 0);
      if (lenHint && lenHint > maxBytes) return { skip: 'too_big (' + Math.round(lenHint / 1048576) + 'MB > ' + Math.round(maxBytes / 1048576) + 'MB)' };
      const ua = client.userAgent || 'Mozilla/5.0';
      let res;
      const mediaHeaders = { 'User-Agent': ua, Accept: '*/*', Range: 'bytes=0-' + (maxBytes - 1) };
      const mCookie = await grabCookie(env); if (mCookie) mediaHeaders.Cookie = mCookie; else if (consent) mediaHeaders.Cookie = consent;
      try { res = await grabFetch(env, f.url, { headers: mediaHeaders }, envInt(env, 'TG_DL_TIMEOUT_MS', 18000, 5000, 60000)); }
      catch (e) { attempts.push(client.clientName + ':fetch(' + String(e.message).slice(0, 30) + ')'); continue; }
      if (res.status !== 200 && res.status !== 206) { attempts.push(client.clientName + ':stream' + res.status); await new Promise((r) => setTimeout(r, 250 * (retry + 1))); continue; }
      const realTotal = mediaTotalBytes(res);
      if (realTotal && realTotal > maxBytes) return { skip: 'too_big (' + Math.round(realTotal / 1048576) + 'MB > ' + Math.round(maxBytes / 1048576) + 'MB)' };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (realTotal && bytes.length < realTotal) { attempts.push(client.clientName + ':truncated'); continue; }
      if (bytes.length > maxBytes) return { skip: 'too_big (actual ' + Math.round(bytes.length / 1048576) + 'MB)' };
      if (bytes.length < 20000) { attempts.push(client.clientName + ':tiny'); continue; }
      const isMp4 = bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      if (!isMp4) { attempts.push(client.clientName + ':not-mp4'); continue; }
      return {
        bytes, size: bytes.length, itag: f.itag,
        duration: durSec, width: Number(f.width || 0) || 640, height: Number(f.height || 0) || 360,
        title: String(vd.title || ''), channel: String(vd.author || ''), via: client.clientName + '/' + client.clientVersion,
        thumbUrl: (vd.thumbnail && vd.thumbnail.thumbnails && vd.thumbnail.thumbnails.length) ? vd.thumbnail.thumbnails[vd.thumbnail.thumbnails.length - 1].url : '',
      };
    }
  }
  if (String(env.TG_ALT_SOURCES || '0') === '1' && sfLeft() >= 6) {
    const alt = await altGrabMp4(env, videoId, { maxBytes, maxDuration }).catch(() => null);
    if (alt && alt.bytes) return alt;
    if (alt && alt.skip) return { skip: alt.skip };
    if (alt && alt.altTries) attempts.push('alt(' + alt.altTries.join(',') + ')');
  }
  const loginN = attempts.filter((a) => /:LOGIN_REQUIRED$/.test(a)).length;
  const deadN = attempts.filter((a) => /:ERROR$/.test(a)).length;
  const netN = attempts.filter((a) => /:(api|fetch)\(|:stream\d|:tiny|:no-muxed|:not-mp4/.test(a)).length;
  const gErr = new Error('grab fail — attempts: ' + attempts.join(' | ').slice(0, 240));
  gErr.grabKind = (loginN > 0 && netN === 0 && deadN === 0) ? 'blocked' : 'net';
  throw gErr;
}

async function tgSelfTest(env, { send = false } = {}) {
  const cfg = tgCfg(env);
  const out = { ok: false, enabled: tgEnabled(env), api: cfg.api, checks: [] };
  const add = (name, ok, detail, hint) => { out.checks.push({ test: name, ok: !!ok, detail, hint: ok ? undefined : hint }); return !!ok; };
  const raw = async (method, payload) => {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(new Error('timeout')), 15000);
    try {
      const res = await sfFetch(cfg.api + '/bot' + cfg.token + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}), signal: ctrl.signal });
      const j = await res.json().catch(() => ({}));
      return { httpOk: res.ok, code: res.status, ok: j.ok === true, result: j.result, desc: j.description || '', error_code: j.error_code };
    } catch (e) { return { httpOk: false, code: 0, ok: false, desc: String(e.message || e) }; }
    finally { clearTimeout(tm); }
  };

  if (!cfg.token) { add('TG_BOT_TOKEN', false, 'set nahi hai', 'Cloudflare → Settings → Variables and Secrets me TG_BOT_TOKEN add karo (BotFather ka token)'); out.verdict = '❌ TG_BOT_TOKEN set nahi hai'; return out; }
  if (!cfg.chat) { add('TG_CHAT_ID', false, 'set nahi hai', 'TG_CHAT_ID add karo: public channel ka @username ya private ka -100... id'); out.verdict = '❌ TG_CHAT_ID set nahi hai'; return out; }
  add('env (token + chat)', true, 'dono set hain');
  const ckInfo = await ytCookieInfo(env); const ckParsed = parseCookieString(ckInfo.raw);
  add('YT_COOKIE (optional)', !!ckParsed, ckParsed ? 'set hai (' + ckParsed.count + ' cookies, source: ' + ckInfo.source + ')' : 'set nahi — bot-check wale videos fail honge (recommended: lagao)', '/cookie page kholo → file choose karo → Save (ya YT_COOKIE env me paste karo)');

  // 1) token valid?
  const me = await raw('getMe');
  if (!add('1. Bot token valid?', me.ok, me.ok ? ('bot: @' + me.result.username + ' (' + me.result.first_name + ')') : (me.error_code === 401 ? 'token galat hai' : me.desc),
    me.error_code === 401 ? 'BotFather se token dobara copy karo (ya /token se naya lo) — poora token, bina space' : 'api.telegram.org tak nahi pahuncha — thodi der baad try karo')) return out;

  // 2) chat milta hai?
  const chat = await raw('getChat', { chat_id: cfg.chat });
  const chOk = add('2. Channel mila?', chat.ok, chat.ok ? (chat.result.title + ' [' + chat.result.type + ']' + (chat.result.username ? ' @' + chat.result.username : '')) : (chat.error_code === 400 ? 'chat not found' : chat.desc),
    'TG_CHAT_ID sahi likho: public channel = @username (jaise @mera_shorts), private = -100... wala number. Bot ko channel me ADD bhi karna hai (admin ke bina bhi getChat chal jata hai, par member hona zaroori hai)');
  if (!chOk) { out.verdict = '❌ Channel nahi mila — TG_CHAT_ID check karo aur bot ko channel me add karo'; return out; }

  // 3) bot member/admin hai?
  const mem = await raw('getChatMember', { chat_id: cfg.chat, user_id: me.result.id });
  const status = mem.ok ? String(mem.result.status || '') : '';
  const isAdmin = status === 'administrator' || status === 'creator';
  const canPost = mem.ok ? (mem.result.can_post_messages !== false) : false;
  add('3. Bot channel me member hai?', mem.ok && status !== 'left' && status !== 'kicked', mem.ok ? ('status: ' + status) : mem.desc,
    'Bot ko channel me add karo (Administrators → Add Admin → apna bot).');
  add('4. Post karne ki permission?', isAdmin && canPost, isAdmin ? ('admin ✅' + (canPost ? ' | post messages ✅' : ' | par post permission OFF')) : ('status: ' + status),
    'Channel → Administrators → bot → "Post Messages" ON karo');

  // 5) actual send test (optional)
  if (send) {
    const sent = await raw('sendMessage', { chat_id: cfg.chat, text: '✅ ShortsFire Telegram test — bot sahi chal raha hai\n(ye message ignore kar sakte ho)', disable_notification: true });
    const ok = add('5. Test message bheja?', sent.ok, sent.ok ? 'message_id: ' + sent.result.message_id : sent.desc,
      sent.error_code === 403 ? 'Bot ko Post Messages permission do (Administrator banate waqt)' : (sent.error_code === 429 ? 'Telegram rate limit — 1 min baad try karo' : 'channel/chat id check karo'));
    if (ok && sent.result?.message_id) { await raw('deleteMessage', { chat_id: cfg.chat, message_id: sent.result.message_id }); out.checks[out.checks.length - 1].detail += ' → delete bhi kar diya'; }
  } else {
    out.checks.push({ test: '5. Test message', ok: true, detail: 'skip (bhejna ho to ?send=1 lagao)', hint: undefined });
  }

  out.ok = out.checks.filter((c) => c.test !== '5. Test message' || send).every((c) => c.ok);
  out.verdict = out.ok ? '🎉 Sab sahi hai — bot configured hai, videos TG me ja sakti hain' : '❌ Kuch theek karna hai — neeche ke hints dekho';
  if (out.ok) out.next = 'POST /api/tg/ingest?limit=2 (ya ?go=1&secret=…) chalao → /api/tg/stats me store.done badhta dikhega';
  return out;
}

async function tgStats(env) {
  try {
    const [aggRes,grpRes,ssRes]=await tursoMany(env,[
      { sql:'SELECT done,failed,blocked,skipped,queued,pending,bytes,failed_bytes,blocked_bytes,skipped_bytes,queued_bytes,pending_bytes FROM tg_aggregate WHERE id=1 AND initialized=1', args:[] },
      { sql:"SELECT status,COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM tg_store GROUP BY status", args:[] },
      { sql:"SELECT key,value FROM settings WHERE key IN ('tg_day','tg_used','grab_clients')", args:[] },
    ]);
    let agg=rowsToObjects(aggRes)[0],m={};
    if(agg){for(const s of ['done','failed','blocked','skipped','queued','pending']){const n=Number(agg[s]||0),b=Number(s==='done'?agg.bytes:agg[s+'_bytes']||0);if(n)m[s]={n,mb:+(b/1048576).toFixed(1)};}}
    else{const rows=rowsToObjects(grpRes);for(const r of rows)m[String(r.status)]={n:Number(r.n||0),mb:+(Number(r.bytes||0)/1048576).toFixed(1)};}
    const sm=Object.fromEntries(rowsToObjects(ssRes).map(x=>[String(x.key),String(x.value||'')])),day=new Date().toISOString().slice(0,10),usedToday=sm.tg_day===day?(parseInt(sm.tg_used||'0',10)||0):0;
    let cAt=0,cList=[],clients=GRAB_BUILTIN;try{const cj=sm.grab_clients?JSON.parse(sm.grab_clients):null;cAt=Number((cj&&cj.at)||0);if(Array.isArray(cj&&cj.clients)&&cj.clients.length){clients=cj.clients;cList=cj.clients.map(c=>c.clientName+'/'+c.clientVersion).slice(0,8);}}catch(e){}
    const cfgT=tgCfg(env);
    return{store:m,usedToday,dailyLimit:cfgT.dailyLimit,enabled:tgEnabled(env),maxMB:+(cfgT.maxBytes/1048576).toFixed(1),fileLimitMB:+(tgFileLimitBytes(env)/1048576).toFixed(1),localApi:String(env.TG_LOCAL_API||'0')==='1',maxDuration:cfgT.maxDuration,clientsCached:clients.length,clientsAt:cAt?new Date(cAt).toISOString():null,clients:cList};
  }catch(e){return{error:String(e.message||e)}}
}

async function tgWhereAmI(env) {
  const cfg = tgCfg(env);
  if (!tgEnabled(env)) return { ok: false, error: 'TG_BOT_TOKEN / TG_CHAT_ID set nahi hai' };
  const out = { ok: false, bot: null, chat: { id: cfg.chat }, steps: [],
    limits: { maxMB: +(cfg.maxBytes / 1048576).toFixed(1), fileLimitMB: +(tgFileLimitBytes(env) / 1048576).toFixed(1), localApi: String(env.TG_LOCAL_API || '0') === '1', maxDuration: cfg.maxDuration, dailyLimit: cfg.dailyLimit } };
  const raw = async (method, payload) => {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(new Error('timeout')), 15000);
    try {
      const res = await sfFetch(cfg.api + '/bot' + cfg.token + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}), signal: ctrl.signal });
      const j = await res.json().catch(() => ({}));
      return { ok: j.ok === true, result: j.result, desc: j.description || ('http ' + res.status) };
    } catch (e) { return { ok: false, desc: String(e.message || e) }; }
    finally { clearTimeout(tm); }
  };
  const me = await raw('getMe');
  if (me.ok) out.bot = '@' + me.result.username;
  const chat = await raw('getChat', { chat_id: cfg.chat });
  if (!chat.ok) { out.error = 'getChat fail — ' + chat.desc; out.hint = 'TG_CHAT_ID check karo'; return out; }
  out.chat = { id: chat.result.id, title: chat.result.title, type: chat.result.type, username: chat.result.username || '', forum: !!chat.result.is_forum, protected: !!chat.result.has_protected_content };
  const cnt = await raw('getChatMemberCount', { chat_id: cfg.chat });
  if (cnt.ok) out.members = Number(cnt.result || 0);
  const link = await raw('createChatInviteLink', { chat_id: cfg.chat, name: 'ShortsFire access' });
  if (link.ok) out.inviteLink = link.result.invite_link;
  else {
    const ex = await raw('exportChatInviteLink', { chat_id: cfg.chat });
    if (ex.ok) out.inviteLink = ex.result;
    else out.inviteNote = 'invite link nahi bana — ' + (link.desc || ex.desc) + ' (bot ko admin + invite permission do)';
  }
  try {
    const rows = rowsToObjects(await turso(env, "SELECT video_id,size,updated_at FROM tg_store WHERE status='done' AND file_id<>'' ORDER BY updated_at DESC LIMIT 5", []));
    out.lastUploads = rows.map((r) => ({ id: String(r.video_id), mb: +(Number(r.size || 0) / 1048576).toFixed(2), at: r.updated_at ? new Date(Number(r.updated_at)).toISOString() : null, watch: '/v/' + r.video_id }));
    const tot = rowsToObjects(await turso(env, "SELECT COUNT(*) AS n FROM tg_store WHERE status='done'", []));
    out.totalDone = Number((tot[0] || {}).n || 0);
  } catch (e) { out.dbNote = String(e.message || e); }
  out.openInTelegram = out.chat.username ? 'https://t.me/' + out.chat.username : (out.inviteLink || null);
  out.steps = [
    'Telegram app kholo → upar search me "' + out.chat.title + '" type karo → wahi chat kholo (ye ' + out.chat.type + ' hai' + (out.chat.username ? ', @' + out.chat.username : ', private — @username nahi hai isliye sirf member ko dikhti hai') + ')',
    out.chat.forum ? 'Is chat me TOPICS ON hain — videos "General" topic me hain (kisi doosre topic me mat dekho)' : 'Chat khulte hi sabse neeche ke messages dekho — videos wahi hain (upar scroll karo, purani bhi milengi)',
    out.members === undefined ? 'Chat list me na mile to Telegram → Settings → Archived Chats check karo' : (out.inviteLink ? 'Chat mil hi nahi rahi? Ye link kholo: ' + out.inviteLink : 'Chat list me na mile to Archived Chats check karo'),
    'Uploads SILENT hote hain (disable_notification) — koi notification nahi aayega, isliye "kuch aaya hi nahi" lagta hai; magar ' + (out.totalDone || 0) + ' videos wahan padi hain',
  ];
  out.ok = true;
  return out;
}

async function tgResend(env, { to = '', limit = 10, ids = [] } = {}) {
  const cfg = tgCfg(env);
  if (!tgEnabled(env)) return { ok: false, error: 'TG_BOT_TOKEN / TG_CHAT_ID set nahi hai' };
  const target = String(to || cfg.chat);
  const cols = "t.video_id, t.file_id, t.size, t.duration, v.title, v.channel_name, v.category FROM tg_store t LEFT JOIN videos v ON v.video_id=t.video_id WHERE t.status='done' AND t.file_id<>''";
  let rows = [];
  if (ids.length) {
    rows = rowsToObjects(await turso(env, 'SELECT ' + cols + ' AND t.video_id IN (' + ids.map(() => '?').join(',') + ')', ids));
  } else {
    rows = rowsToObjects(await turso(env, 'SELECT ' + cols + ' ORDER BY t.updated_at DESC LIMIT ?', [Math.max(1, Math.min(50, limit))]));
  }
  const out = { ok: true, to: target, found: rows.length, sent: 0, failed: 0, items: [] };
  for (const r of rows) {
    const id = String(r.video_id || '');
    const cap = [r.title || id, (r.channel_name ? '@' + r.channel_name : '') + (r.category ? ' · ' + r.category : ''), 'https://youtu.be/' + id, '#shorts #' + String(r.category || 'shorts')].filter(Boolean).join('\n').slice(0, 1000);
    const fd = new FormData();
    fd.append('chat_id', target);
    fd.append('video', String(r.file_id));
    fd.append('caption', cap);
    fd.append('supports_streaming', 'true');
    fd.append('disable_notification', 'false');
    if (Number(r.duration || 0) > 0) fd.append('duration', String(Math.round(r.duration)));
    try {
      const res = await sfFetch(cfg.api + '/bot' + cfg.token + '/sendVideo', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.description || ('http ' + res.status));
      out.sent++;
      out.items.push({ id, message_id: j.result && j.result.message_id, watch: '/v/' + id });
    } catch (e) { out.failed++; out.items.push({ id, error: String(e.message || e).slice(0, 140) }); }
  }
  out.note = out.failed
    ? out.failed + ' video fail hui — ' + (out.sent ? out.sent + ' chali gayi, ' : '') + 'fail wali par engine dobara upload kar dega (ya purane file_id expire ho gaye)'
    : out.sent + ' videos "' + target + '" me bhej di gayi — bina YouTube, sirf Telegram file_id se (instant, 0 quota)';
  out.tip = 'to=' + target + ' — kisi bhi chat me bhej sakte ho (apna personal chat id ya @username do)';
  return out;
}

async function tgCandidates(env, limit, order) {
  // Was 5 sequential Turso round-trips; now ONE pipeline call (1 subrequest).
  const cfg=tgCfg(env),maxAtt=envInt(env,'TG_MAX_ATTEMPTS',3,1,20),backoffMs=envInt(env,'TG_RETRY_BACKOFF_MIN',60,5,1440)*60000,nowTs=Date.now();
  const out=[],seen=new Set(),add=rows=>{for(const r of rows){const id=String(r.video_id||'');if(id&&!seen.has(id)){seen.add(id);out.push(r);}}};
  const fields='v.video_id,v.title,v.channel_name,v.category,COALESCE(v.duration,0) AS duration';
  const stStatus=where=>`SELECT ${fields} FROM tg_store t JOIN videos v ON v.video_id=t.video_id LEFT JOIN bad_videos b ON b.video_id=t.video_id WHERE ${where} AND (COALESCE(v.duration,0)=0 OR COALESCE(v.duration,0)<=?) AND b.video_id IS NULL ORDER BY t.updated_at ASC LIMIT ?`;
  const stFresh=direction=>`SELECT ${fields} FROM videos v WHERE (COALESCE(v.duration,0)=0 OR COALESCE(v.duration,0)<=?) AND NOT EXISTS (SELECT 1 FROM tg_store t WHERE t.video_id=v.video_id) AND NOT EXISTS (SELECT 1 FROM bad_videos b WHERE b.video_id=v.video_id) ORDER BY v.added_at ${direction} LIMIT ?`;
  const nNew=Math.max(1,Math.floor(limit/2)),nOld=Math.max(1,limit-nNew);
  let res=[];
  try {
    res=await tursoMany(env,[
      { sql:stStatus("t.status='queued'"), args:[cfg.maxDuration,limit] },
      { sql:stStatus("t.status IN ('failed','blocked') AND COALESCE(t.attempts,0)<? AND (t.status='failed' OR (t.status='blocked' AND COALESCE(t.updated_at,0)+COALESCE(t.attempts,1)*?<=?))"), args:[maxAtt,backoffMs,nowTs,cfg.maxDuration,limit] },
      { sql:stFresh('DESC'), args:[cfg.maxDuration,order==='old'?limit:nNew] },
      { sql:stFresh('ASC'), args:[cfg.maxDuration,order==='new'?limit:nOld] },
      { sql:stFresh(order==='old'?'ASC':'DESC'), args:[cfg.maxDuration,Math.max(limit,limit*2)] },
    ]);
  } catch(e) { console.warn('tgCandidates:',e && e.message); return []; }
  for (const r of res) add(rowsToObjects(r));
  return out.slice(0,limit);
}
async function tgSaveDone(env, id, sent, dur) {
  await tursoBatch(env, [{
    sql: "INSERT INTO tg_store(video_id,file_id,file_unique_id,size,duration,status,error,attempts,created_at,updated_at) VALUES(?,?,?,?,?,'done','',0,?,?) " +
         "ON CONFLICT(video_id) DO UPDATE SET file_id=excluded.file_id,file_unique_id=excluded.file_unique_id,size=excluded.size,duration=excluded.duration,status='done',error='',updated_at=excluded.updated_at",
    args: [id, sent.file_id || '', sent.file_unique_id || '', sent.size || 0, Math.round(dur || 0), Date.now(), Date.now()],
  }]);
  if(typeof caches!=='undefined'&&caches.default)try{await Promise.all([caches.default.delete(tgCacheKey(id)),caches.default.delete(tgMetaCacheKey(id))]);}catch(e){}
}
async function tgQueueVideo(env, id) {
  const clean = String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);
  if (clean.length < 5) return { ok: false, error: 'bad id' };
  const rows = rowsToObjects(await turso(env, 'SELECT v.video_id,t.status FROM videos v LEFT JOIN tg_store t ON t.video_id=v.video_id WHERE v.video_id=? LIMIT 1', [clean]));
  if (!rows.length) return { ok: false, why: 'not_in_db' };
  const st = rows[0]?.status;
  if (st === 'done') return { ok: true, already: 'done' };
  if (st === 'queued') return { ok: true, already: 'queued' };
  await tursoBatch(env, [{
    sql: "INSERT INTO tg_store(video_id,status,error,attempts,created_at,updated_at) VALUES(?,'queued','',0,?,?) " +
         "ON CONFLICT(video_id) DO UPDATE SET status='queued',error='',updated_at=excluded.updated_at",
    args: [clean, Date.now(), Date.now()],
  }]);
  return { ok: true, queued: clean };
}

async function tgSaveStatus(env, id, status, err) {
  const now=Date.now();
  const r=rowsToObjects(await turso(env, "INSERT INTO tg_store(video_id,status,error,attempts,created_at,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(video_id) DO UPDATE SET status=excluded.status,error=excluded.error,attempts=COALESCE(tg_store.attempts,0)+1,updated_at=excluded.updated_at RETURNING attempts", [id,status,String(err||'').slice(0,300),now,now]));
  return Number(r[0]?.attempts||1);
}

async function tgPipeline(env, { budget = 2, order = 'new', parallel = 0 } = {}) {
  const out = { enabled: tgEnabled(env), uploaded: 0, skipped: 0, failed: 0, items: [] };
  if (!out.enabled) { out.items.push({ note: 'TG_BOT_TOKEN / TG_CHAT_ID set nahi hai — iske bina app pehle jaisa (YouTube embed) chalta rahega' }); return out; }
  const cfg = tgCfg(env);
  const day = new Date().toISOString().slice(0, 10);
  if ((await getSetting(env, 'tg_day', '')) !== day) { await setSetting(env, 'tg_day', day); await setSetting(env, 'tg_used', '0'); }
  let used = parseInt(await getSetting(env, 'tg_used', '0'), 10) || 0;
  if (used >= cfg.dailyLimit) { out.items.push({ note: 'aaj ka TG daily limit (' + cfg.dailyLimit + ') poora — kal phir chalega' }); out.usedToday = used; out.dailyLimit = cfg.dailyLimit; return out; }
  const burnOn = String(await getSetting(env, 'tg_burn_on', '1')) !== '0';
  if (!burnOn) {
    const manual = String(await getSetting(env, 'tg_pause_manual', '0')) === '1';
    const resumeMin = envInt(env, 'TG_PAUSE_RESUME_MIN', 20, 0, 1440);
    let pauseAt = parseInt(await getSetting(env, 'tg_pause_at', '0'), 10) || 0;
    if (!pauseAt) { pauseAt = parseInt(await getSetting(env, 'tg_last_run_at', '0'), 10) || Date.now(); await setSetting(env, 'tg_pause_at', String(pauseAt)).catch(() => {}); }
    const cnt = parseInt(await getSetting(env, 'tg_pause_count', '0'), 10) || 0;
    const waitMin = resumeMin * clamp(1 + Math.floor(cnt / 2), 1, 2);
    const waitedMin = Math.round((Date.now() - pauseAt) / 60000);
    if (!manual && resumeMin > 0 && waitedMin >= waitMin) {
      await setSetting(env, 'tg_pause_count', String(cnt + 1)).catch(() => {});
      await setSetting(env, 'tg_burn_on', '1').catch(() => {});
      await setSetting(env, 'tg_fail_streak', '0').catch(() => {});
      await setSetting(env, 'tg_pause_at', '0').catch(() => {});
      await setSetting(env, 'tg_pause_reason', 'auto-resume #' + (cnt + 1) + ' (' + waitedMin + ' min baad, khud)').catch(() => {});
      out.autoResumed = cnt + 1;
    } else {
      out.paused = true;
      out.manualPause = manual;
      out.note = (await getSetting(env, 'tg_pause_reason', 'paused')) + (manual ? ' — manual pause (resume: /api/tg/burn?go=1&on=1&secret=…)' : (resumeMin > 0 ? ' — agla auto-resume ~' + Math.max(1, waitMin - waitedMin) + ' min me' : ''));
      if (!manual && String(env.TG_PAUSE_PROBE || '1') !== '0') {
        budget = 1;
        out.probe = true;
        out.note += ' — probe chal raha hai (1 video/tick, poora khaali nahi)';
      } else { await setSetting(env, 'tg_stage', 'paused').catch(() => {}); return out; }
    }
  }
  const lockRaw = String(await getSetting(env, 'tg_lock_until', '0') || '0');
  const lockUntil = parseInt(lockRaw.split(':')[0], 10) || 0;
  if (Date.now() < lockUntil) { out.locked = true; out.note = 'pehle se ek run chal raha hai (' + Math.ceil((lockUntil - Date.now()) / 1000) + 's baaki) — duplicate upload se bacha'; return out; }
  const lockToken = Math.random().toString(36).slice(2, 8);
  // the lock must hit the DB *now* (immediate) and must be re-read *fresh*,
  // otherwise a write-through cache makes the mutual-exclusion check a no-op.
  await setSetting(env, 'tg_lock_until', String(Date.now() + envInt(env, 'TG_LOCK_SEC', 45, 15, 900) * 1000) + ':' + lockToken, { immediate: true }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const lockNow = String(await getSettingFresh(env, 'tg_lock_until', '') || '');
  if (!lockNow.endsWith(lockToken)) { out.locked = true; out.note = 'doosra run pehle aa gaya — main ruk gaya (duplicate se bacha)'; return out; }
  await setSetting(env, 'tg_stage', 'lock').catch(() => {});
  await setSetting(env, 'tg_last_run_at', String(Date.now())).catch(() => {});
  const bRuns = parseInt(await getSetting(env, 'tg_blocked_runs', '0'), 10) || 0;
  if (bRuns >= envInt(env, 'TG_SLEEP_AFTER', 3, 1, 50)) {
    let cm = 'none';
    try { const c = JSON.parse(await getSetting(env, 'grab_cookie_mode', '') || '{}'); cm = (c && c.mode) || 'none'; } catch (e) {}
    const sb = envInt(env, 'TG_SLEEP_BUDGET', 1, 0, 8);
    if (cm === 'none' && budget > sb) { budget = sb; out.sleep = true; out.sleepNote = 'bot-check wave + koi effective cookie nahi — minimal probing (quota/CPU bachao), cookie lagte hi full speed'; }
  }
  const memGuardMB = envInt(env, 'TG_MEM_GUARD_MB', 72, 24, 128);
  const parCap = Math.max(1, Math.floor(memGuardMB / Math.max(1, cfg.maxBytes / 1048576)));
  const par = clamp(Math.min(parallel || envInt(env, 'TG_PARALLEL', 1, 1, 4), parCap), 1, 4);
  if (par < (parallel || envInt(env, 'TG_PARALLEL', 1, 1, 4))) out.parallelCapped = par;
  const tickMs = envInt(env, 'TG_TICK_SECONDS', 10, 4, 55) * 1000;
  const failPause = envInt(env, 'TG_FAIL_PAUSE', 8, 2, 100);
  const skipCap = envInt(env, 'TG_SKIP_CAP', 3, 1, 20);
  let streak = 0, cands = [], i = 0, t0 = Date.now();
  const runStart = Date.now();
  const runMs = envInt(env, 'TG_RUN_MS', 12000, 4000, 110000);
  try {
  streak = parseInt(await getSetting(env, 'tg_fail_streak', '0'), 10) || 0;
  if (String(env.TG_AUTO_REVIVE || '1') !== '0') {
    const maxAtt0 = envInt(env, 'TG_MAX_ATTEMPTS', 3, 1, 20);
    const reviveH = envInt(env, 'TG_REVIVE_H', 6, 0, 720);
    if (reviveH > 0) {
      try {
        const revRows = rowsToObjects(await turso(env, "SELECT video_id FROM tg_store WHERE status IN ('failed','blocked') AND COALESCE(attempts,0) >= ? AND COALESCE(updated_at,0) < ? ORDER BY updated_at ASC LIMIT ?", [maxAtt0, Date.now() - reviveH * 3600e3, Math.max(1, budget)]));
        for (const rv of revRows) {
          await turso(env, "UPDATE tg_store SET status='queued', attempts=0, error='', updated_at=? WHERE video_id=?", [Date.now(), String(rv.video_id)]);
          out.revived = (out.revived || 0) + 1;
        }
      } catch (e) {}
    }
  }
  try { cands = await tgCandidates(env, Math.max(1, budget * 3), order); } catch (e) { out.error = String(e.message || e).slice(0, 200); }
  out.cands = cands.length;
  await setSetting(env, 'tg_stage', 'cands:' + cands.length).catch(() => {});
  t0 = Date.now();
  const one = async (c) => {
    const id = String(c.video_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);
    if (!id) return null;
    try {
      const got = await grabMp4(env, id, { maxBytes: cfg.maxBytes, maxDuration: cfg.maxDuration });
      if (got.skip) { await tgSaveStatus(env, id, 'skipped', got.skip); return { kind: 'skip', id, skipped: got.skip }; }
      const caption = [got.title || c.title || '', (got.channel ? '@' + got.channel : '') + (c.category ? ' · ' + c.category : ''), 'https://youtu.be/' + id, '#shorts #' + String(c.category || 'shorts')].filter(Boolean).join('\n');
      const sent = await tgSendVideo(env, { bytes: got.bytes, filename: id + '.mp4', caption, duration: got.duration, width: got.width, height: got.height });
      // If the upload worked, the video is in the channel — a failing DB write must
      // NOT turn it into a 'failed' row, or the next run uploads it a second time.
      let dbWarn = null;
      try { await tgSaveDone(env, id, sent, got.duration); }
      catch (e) { dbWarn = String((e && e.message) || e).slice(0, 80); console.warn('tgSaveDone failed for', id, dbWarn); }
      return { kind: 'done', id, mb: +(got.size / 1048576).toFixed(2), itag: got.itag, via: got.via, dbWarn, tg_file_id: String(sent.file_id || '').slice(0, 26) + '…' };
    } catch (e) {
      const blocked = !!(e && e.grabKind === 'blocked');
      const attempts = await tgSaveStatus(env, id, blocked ? 'blocked' : 'failed', String(e.message || e)).catch(() => 0);
      return { kind: blocked ? 'blocked' : 'fail', id, error: String(e.message || e).slice(0, 160), attempts };
    }
  };
  while (i < cands.length && out.uploaded + out.failed < budget && out.skipped < skipCap && Date.now() - runStart < runMs) {
    if (Date.now() - t0 > tickMs) { out.items.push({ note: 'time budget khatam (' + Math.round(tickMs / 1000) + 's)' }); break; }
    if (sfLeft() < 8) { out.items.push({ note: 'subrequest budget khatam — agle tick me continue' }); out.budgetStop = true; break; }
    const left = budget - (out.uploaded + out.failed);
    const batch = cands.slice(i, i + Math.min(par, left)); i += batch.length;
    const res = await Promise.all(batch.map((c) => one(c).catch((e) => ({ kind: 'fail', id: String(c.video_id || ''), error: String(e.message || e) }))));
    for (const r of res) {
      if (!r) continue;
      if (r.kind === 'done') { out.uploaded++; used++; streak = 0; await setSetting(env, 'tg_used', String(used)).catch(() => {}); out.items.push({ id: r.id, mb: r.mb, itag: r.itag, via: r.via, tg_file_id: r.tg_file_id }); }
      else if (r.kind === 'skip') { out.skipped++; out.items.push({ id: r.id, skipped: r.skipped }); }
      else if (r.kind === 'blocked') { out.failed++; out.blocked = (out.blocked || 0) + 1; out.items.push({ id: r.id, blocked: true, error: r.error, attempts: r.attempts }); }
      else { out.failed++; streak++; out.items.push({ id: r.id, error: r.error, attempts: r.attempts }); }
    }
    await setSetting(env, 'tg_stage', 'v:' + i + '/' + cands.length + ' up:' + out.uploaded + ' sk:' + out.skipped + ' bl:' + (out.blocked || 0)).catch(() => {});
  }
  } catch (e) { out.error = String(e.message || e).slice(0, 200); }
  await setSetting(env, 'tg_last_result', JSON.stringify({ at: Date.now(), uploaded: out.uploaded, skipped: out.skipped, failed: out.failed, blocked: out.blocked || 0, usedToday: used, partial: out.error ? 1 : 0, sleep: out.sleep ? 1 : 0, cands: out.cands || 0, stage: 'loop', err: out.error ? String(out.error).slice(0, 80) : undefined }).slice(0, 400)).catch(() => {});
  await setSetting(env, 'tg_stage', 'work:' + out.uploaded + '/' + out.failed).catch(() => {});
  await setSetting(env, 'tg_fail_streak', String(streak)).catch(() => {});
  if (streak >= failPause) {
    const rm = envInt(env, 'TG_PAUSE_RESUME_MIN', 20, 0, 1440);
    await setSetting(env, 'tg_burn_on', '0').catch(() => {});
    await setSetting(env, 'tg_pause_manual', '0').catch(() => {});
    await setSetting(env, 'tg_pause_at', String(Date.now())).catch(() => {});
    await setSetting(env, 'tg_pause_reason', 'auto-pause: ' + streak + ' lagatar fail (YouTube/bot-check)' + (rm > 0 ? ' — ~' + rm + ' min me KHUD resume hoga, ya turant: /api/tg/retry-failed?go=1&secret=…' : ' — resume: /api/tg/burn?go=1&on=1&secret=…')).catch(() => {});
    out.autoPaused = streak;
  }
  out.usedToday = used; out.dailyLimit = cfg.dailyLimit; out.streak = streak; out.parallel = par;
  try {
    const didWork = (out.uploaded + out.failed + out.skipped) > 0;
    const onlyBlocked = didWork && (out.blocked || 0) > 0 && out.uploaded === 0 && out.failed === (out.blocked || 0);
    if (didWork) {
      const bPrev = parseInt(await getSetting(env, 'tg_blocked_runs', '0'), 10) || 0;
      await setSetting(env, 'tg_blocked_runs', String(onlyBlocked ? bPrev + 1 : 0));
    }
    await setSetting(env, 'tg_last_result', JSON.stringify({ at: Date.now(), uploaded: out.uploaded, skipped: out.skipped, failed: out.failed, blocked: out.blocked || 0, usedToday: used, partial: out.error ? 1 : 0, sleep: out.sleep ? 1 : 0, cands: out.cands || 0, stage: (out.probe ? 'probe' : (out.stage || 'end')), err: out.error ? String(out.error).slice(0, 90) : undefined }).slice(0, 400));
  } catch (e) {}
  await setSetting(env, 'tg_lock_until', '0', { immediate: true }).catch(() => {});
  await flushSettings(env).catch(() => {});
  return out;
}

async function tgProgress(env) {
  const cfg=tgCfg(env);
  const now=Date.now(),d1At=now-86400000,d7At=now-7*86400000;
  // one pipeline for every count we need (was 6-8 round-trips per call)
  const [aggR,grpR,rateR,newR,totR]=await tursoMany(env,[
    { sql:'SELECT done,failed,blocked,skipped,queued,bytes FROM tg_aggregate WHERE id=1 AND initialized=1', args:[] },
    { sql:"SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked,SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,COALESCE(SUM(CASE WHEN status='done' THEN size ELSE 0 END),0) AS bytes FROM tg_store", args:[] },
    { sql:"SELECT COALESCE(SUM(CASE WHEN updated_at>? THEN 1 ELSE 0 END),0) AS n1,COUNT(*) AS n7 FROM tg_store WHERE status='done' AND updated_at>?", args:[d1At,d7At] },
    { sql:"SELECT COUNT(*) AS n FROM videos v WHERE v.added_at>? AND NOT EXISTS (SELECT 1 FROM tg_store t WHERE t.video_id=v.video_id)", args:[d1At] },
    { sql:'SELECT COUNT(*) AS n FROM videos', args:[] },
  ]);
  const first=r=>rowsToObjects(r)[0]||{};
  let st=first(aggR);
  if(!Object.prototype.hasOwnProperty.call(st,'done'))st=first(grpR);
  const rates=first(rateR);
  let total;try{total=await getVideoCount(env);}catch(e){total=Math.max(0,Number(first(totR).n||0));}
  const failed=Number(st.failed||0),skipped=Number(st.skipped||0),queued=Number(st.queued||0),blocked=Number(st.blocked||0),done=Number(st.done||0),pending=Math.max(0,total-done-skipped-failed-blocked);
  const rate24=Number(rates.n1||0),rate7=Math.round(Number(rates.n7||0)/7),perDay=rate24||rate7||(cfg.burnPerDay||0);
  const newUnstored=first(newR);
  // settings now come from the per-request cache (0 subrequests)
  const keys=['grab_cookie_mode','tg_blocked_runs','tg_stage','tg_burn_on','tg_pause_reason','tg_fail_streak','tg_last_run_at','tg_last_result'];
  const sm={};
  for(const k of keys) sm[k]=String(await getSetting(env,k,'')||'');
  let cookieMode=null,cookieModeAt=0;try{const c=sm.grab_cookie_mode?JSON.parse(sm.grab_cookie_mode):null;cookieMode=(c&&c.mode)||null;cookieModeAt=Number((c&&c.at)||0)||0;}catch(e){}
  const bRuns=parseInt(sm.tg_blocked_runs||'0',10)||0;
  const hint=(bRuns>=3&&cookieMode==='none')?('bot-check wave chal rahi hai aur koi effective cookie nahi — engine ab SLEEP mode me hai (sirf '+envInt(env,'TG_SLEEP_BUDGET',1,0,8)+' video/tick probing, CPU/quota bachao). LOGGED-IN cookie lagte hi sab khud full speed + '+blocked+' blocked videos turant retry. Fix: /cookie page'):((blocked>=10)?(blocked+' videos YouTube bot-check me atki hain — /cookie page pe fresh (logged-in) export lagao; engine har 6h khud revive karta hai'):((cookieMode==='none'&&(done+failed)>0)?'cookie effective nahi — engine bina cookie chal raha hai (self-heal). Naya export: /cookie page':undefined));
  return {total,totalApprox:true,done,failed,blocked,skipped,queued,pending,cookieMode,cookieModeAt,blockedRuns:bRuns,hint,naye:{last24h_stored:rate24,pending_new:Number(newUnstored.n||0)},storeGB:+(Number(st.bytes||0)/1073741824).toFixed(2),stage:sm.tg_stage||'',burn_on:String(sm.tg_burn_on||'1')!=='0',pause_reason:sm.tg_pause_reason||'',fail_streak:parseInt(sm.tg_fail_streak||'0',10)||0,lastRunAt:parseInt(sm.tg_last_run_at||'0',10)||0,lastResult:sm.tg_last_result||'',rate:{last24h:rate24,perDay7d:rate7},etaDays:perDay>0?Math.ceil(pending/perDay):null,etaDate:perDay>0?new Date(Date.now()+(pending/perDay)*86400000).toISOString().slice(0,10):null,note:perDay>0?'poora backlog '+pending+' videos, ~'+perDay+'/din speed (total approx)':'rate abhi pata nahi — kuch upload hone do'};
}
async function attachTgSources(env, videos) {
  const list = Array.isArray(videos) ? videos : [];
  if (!list.length) return list;
  if (!tgEnabled(env)) return list;
  const ids = list.map((v) => String(v.id || '')).filter((x) => /^[A-Za-z0-9_-]{11}$/.test(x));
  if (!ids.length || sfLeft() < 3) return list;
  const rows = rowsToObjects(await turso(env, "SELECT video_id FROM tg_store WHERE status='done' AND video_id IN (" + ids.map(() => '?').join(',') + ")", ids));
  const done = new Set(rows.map((r) => String(r.video_id)));
  for (const v of list) if (done.has(String(v.id))) v.src = '/v/' + v.id;
  return list;
}

function tgCacheKey(id) { return new Request('https://tg-cache.invalid/v/' + id); }
function tgMetaCacheKey(id) { return new Request('https://tg-cache.invalid/m/' + id); }

async function handleTgVideo(request, env, url) {
  const raw = decodeURIComponent(String(url.pathname || '').slice(3)).replace(/\.mp4$/i, '');
  const id = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);
  if (id.length !== 11) return json({ ok: false, error: 'bad video id' }, 400);
  if (!tgEnabled(env)) return json({ ok: false, error: 'TG storage configure nahi hai (TG_BOT_TOKEN / TG_CHAT_ID)' }, 503);
  const cfg = tgCfg(env),hasCache=typeof caches!=='undefined'&&caches.default;
  let body=null,total=0,row=null;
  if(hasCache){try{const hit=await caches.default.match(tgCacheKey(id));if(hit){body=new Uint8Array(await hit.arrayBuffer());total=body.length;}}catch(e){}}
  if(!body){
    if(hasCache){try{const m=await caches.default.match(tgMetaCacheKey(id));if(m)row=await m.json();}catch(e){}}
    if(!row){
      await ensureSchema(env);
      const rows=rowsToObjects(await turso(env,"SELECT file_id,size,status FROM tg_store WHERE video_id=? AND status='done'",[id]));row=rows[0]||null;
      if(row&&row.file_id&&hasCache)try{await caches.default.put(tgMetaCacheKey(id),new Response(JSON.stringify(row),{headers:{'content-type':'application/json','cache-control':'public, max-age=3600'}}));}catch(e){}
    }
    if(!row||!row.file_id)return json({ok:false,error:'ye video abhi Telegram me store nahi hua',videoId:id,hint:'POST /api/tg/ingest?limit=2 se abhi upload karo (ya cron ka wait karo)'},404);
    try {
      const f = await tgGetFile(env, row.file_id);
      const fsize = Number(f.file_size || row.size || 0);
      const dlCap = tgFileLimitBytes(env);
      if (fsize && fsize > dlCap) {
        return json({ ok: false, error: 'file ' + Math.round(fsize / 1048576) + 'MB hai — Bot API se download limit ' + Math.round(dlCap / 1048576) + 'MB hai', hint: 'TG_MAX_MB chhota rakho (ab ye khud clamp hota hai), ya TG_LOCAL_API=1 ke saath local Bot API server lagao' }, 413);
      }
      const dl = await sfFetch(cfg.api + '/file/bot' + cfg.token + '/' + f.file_path);
      if (!dl.ok) return json({ ok: false, error: 'telegram file fetch fail ' + dl.status }, 502);
      body = new Uint8Array(await dl.arrayBuffer());
      total = body.length;
      if (hasCache) { try { await caches.default.put(tgCacheKey(id), new Response(body.slice(0), { headers: { 'content-type': 'video/mp4', 'cache-control': 'max-age=86400' } })); } catch (e) {} }
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 502);
    }
  }

  const base = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=3600',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Content-Length, Content-Range, Accept-Ranges',
    'x-tg-store': 'telegram',
    'x-video-id': id,
  };
  if (url.searchParams.get('download') === '1') base['content-disposition'] = 'attachment; filename="' + id + '.mp4"';

  if (request.method === 'HEAD') return new Response(null, { headers: { ...base, 'content-length': String(total) } });

  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] !== '' ? parseInt(m[1], 10) : 0;
    let end = m && m[2] !== '' ? parseInt(m[2], 10) : total - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) return new Response(null, { status: 416, headers: { ...base, 'content-range': 'bytes */' + total } });
    const slice = body.slice(start, end + 1);
    return new Response(slice, { status: 206, headers: { ...base, 'content-length': String(slice.length), 'content-range': 'bytes ' + start + '-' + end + '/' + total } });
  }
  return new Response(body, { headers: { ...base, 'content-length': String(total) } });
}
