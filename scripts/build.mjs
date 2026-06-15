// app_template.html → public/index.html
//  1) 빌드시 데이터 주입(__DATA__/HOLE_DATA/STREAK_DATA) 제거 → 런타임 fetch(/api/data)
//  2) 라운드 추가 업로드 UI(버튼+모달+확인표) 주입
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tplPath = fs.existsSync(path.join(root, 'app_template.html'))
  ? path.join(root, 'app_template.html')
  : path.join(root, 'template', 'app_template.html');
let html = fs.readFileSync(tplPath, 'utf8');

// 1) 데이터 소스를 런타임 변수로 전환
html = html.replace(
  'const EMBEDDED = __DATA__;',
  'let EMBEDDED = [];\nlet HOLE_DATA = {};\nlet STREAK_DATA = {};'
);

// 2) 진입점 setData(EMBEDDED) → 비동기 부트스트랩
html = html.replace(
  /setData\(EMBEDDED\);\s*<\/script>/,
  `(async function boot(){
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    EMBEDDED = d.rounds || [];
    HOLE_DATA = d.holeData || {};
    STREAK_DATA = d.streak || {};
    setData(EMBEDDED);
  } catch (e) {
    const sub = document.getElementById('hdrSub');
    if (sub) sub.textContent = '데이터 로딩 실패: ' + e.message;
  }
})();
${UPLOAD_JS()}
<\/script>`
);

// 3) 업로드 UI(버튼+모달) + 스타일 주입
html = html.replace('</body>', UPLOAD_HTML() + '\n</body>');

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'index.html'), html, 'utf8');
console.log('built public/index.html (' + html.length + ' bytes)');

function UPLOAD_HTML() {
  return `
<button id="fab" title="라운드 추가">＋</button>
<div id="rmodal" class="rmodal">
  <div class="rbox">
    <div class="rhead"><b>라운드 추가</b><span id="rclose">✕</span></div>
    <div id="rstep1" class="rbody">
      <p class="rhint">보이스캐디 스코어카드 캡처를 올리면 자동으로 18홀을 읽어 표로 보여줍니다.</p>
      <label class="rfile"><input type="file" id="rfile" accept="image/*"><span id="rfilename">이미지 선택</span></label>
      <button id="rextract" class="rbtn" disabled>분석하기</button>
      <div id="rmsg" class="rmsg"></div>
    </div>
    <div id="rstep2" class="rbody" style="display:none">
      <div class="rrow"><label>날짜</label><input id="fdate" type="date"></div>
      <div class="rrow"><label>코스</label><input id="fcourse" type="text"></div>
      <div id="rvalid" class="rmsg"></div>
      <div class="rtable-wrap"><table class="rtable"><thead>
        <tr><th>홀</th><th>파</th><th>스코어</th><th>퍼팅</th><th>GIR</th><th>벌타</th></tr>
      </thead><tbody id="rtbody"></tbody></table></div>
      <div id="rsummary" class="rsum"></div>
      <div class="ractions">
        <button id="rback" class="rbtn ghost">다시</button>
        <button id="rsave" class="rbtn">저장</button>
      </div>
    </div>
  </div>
</div>
<style>
#fab{position:fixed;right:16px;bottom:90px;width:52px;height:52px;border-radius:50%;border:none;
  background:linear-gradient(150deg,var(--board),#1C6B40);color:var(--gold);font-size:1.8rem;font-weight:700;
  box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;z-index:50;line-height:1}
.rmodal{position:fixed;inset:0;background:rgba(10,20,14,.55);display:none;align-items:flex-end;justify-content:center;z-index:60}
.rmodal.on{display:flex}
.rbox{background:var(--bg);width:100%;max-width:560px;max-height:92vh;border-radius:18px 18px 0 0;overflow:auto;
  border-top:3px solid var(--gold)}
.rhead{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;
  background:linear-gradient(180deg,var(--board),var(--board-deep));color:#F5F1E0;position:sticky;top:0}
.rhead span{cursor:pointer;font-size:1.1rem}
.rbody{padding:16px}
.rhint{font-size:.78rem;color:var(--muted);line-height:1.5;margin-bottom:12px}
.rfile{display:flex;align-items:center;gap:8px;border:1.5px dashed var(--turf);border-radius:12px;padding:14px;
  cursor:pointer;background:var(--card);margin-bottom:12px}
.rfile input{display:none}
.rfile span{font-size:.82rem;color:var(--board);font-weight:700}
.rbtn{width:100%;padding:13px;border:none;border-radius:12px;background:var(--board);color:#fff;font-weight:800;
  font-size:.9rem;cursor:pointer}
.rbtn:disabled{opacity:.45}
.rbtn.ghost{background:var(--card);color:var(--board);border:1px solid var(--line)}
.ractions{display:flex;gap:10px;margin-top:14px}
.rmsg{font-size:.76rem;line-height:1.5;margin-top:10px;color:var(--muted)}
.rmsg.err{color:var(--red);font-weight:700}
.rmsg.ok{color:var(--turf);font-weight:700}
.rrow{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.rrow label{width:48px;font-size:.78rem;color:var(--muted);font-weight:700}
.rrow input{flex:1;padding:9px;border:1px solid var(--line);border-radius:9px;font-size:.9rem;background:var(--card)}
.rtable-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}
.rtable{width:100%;border-collapse:collapse;font-size:.8rem;background:var(--card)}
.rtable th{background:var(--board);color:#F5F1E0;padding:6px 4px;font-weight:700;font-size:.72rem}
.rtable td{border-top:1px solid var(--line);padding:3px;text-align:center}
.rtable input{width:42px;padding:5px 2px;border:1px solid var(--line);border-radius:6px;text-align:center;font-size:.82rem}
.rtable td:first-child{font-weight:700;color:var(--muted)}
.rsum{font-size:.82rem;color:var(--ink);margin-top:12px;padding:10px;background:var(--card);border-radius:10px;
  border:1px solid var(--line);line-height:1.6}
</style>`;
}

function UPLOAD_JS() {
  return `
/* ---------- 라운드 추가 업로드 ---------- */
(function(){
  const $=id=>document.getElementById(id);
  const fab=$('fab'),modal=$('rmodal'),fileIn=$('rfile');
  let draft=null,holeRows=[];
  function open(){modal.classList.add('on');reset();}
  function close(){modal.classList.remove('on');}
  function reset(){$('rstep1').style.display='block';$('rstep2').style.display='none';
    $('rmsg').textContent='';$('rmsg').className='rmsg';fileIn.value='';$('rfilename').textContent='이미지 선택';
    $('rextract').disabled=true;}
  fab.onclick=open; $('rclose').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  fileIn.onchange=()=>{const f=fileIn.files[0];$('rfilename').textContent=f?f.name:'이미지 선택';$('rextract').disabled=!f;};

  function toBase64(file){return new Promise((res,rej)=>{const r=new FileReader();
    r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});}

  $('rextract').onclick=async()=>{
    const f=fileIn.files[0];if(!f)return;
    const m=$('rmsg');m.className='rmsg';m.textContent='분석 중… (10~20초)';$('rextract').disabled=true;
    try{
      const b64=await toBase64(f);
      const res=await fetch('/api/extract-round',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({imageBase64:b64,mediaType:f.type||'image/jpeg'})});
      const d=await res.json();
      if(d.error){m.className='rmsg err';m.textContent='오류: '+d.error;$('rextract').disabled=false;return;}
      draft=d.draftRound;holeRows=d.holeRows;
      $('fdate').value=draft.date||'';$('fcourse').value=draft.course||'';
      renderTable();renderValid(d.validation);
      $('rstep1').style.display='none';$('rstep2').style.display='block';
    }catch(e){m.className='rmsg err';m.textContent='오류: '+e.message;$('rextract').disabled=false;}
  };

  function renderTable(){
    $('rtbody').innerHTML=holeRows.map((h,i)=>\`<tr>
      <td>\${h.hole}</td>
      <td><input data-i="\${i}" data-k="par" type="number" value="\${h.par}"></td>
      <td><input data-i="\${i}" data-k="score" type="number" value="\${h.score}"></td>
      <td><input data-i="\${i}" data-k="putt" type="number" value="\${h.putt==null?'':h.putt}"></td>
      <td><input data-i="\${i}" data-k="gir" type="checkbox" \${h.gir?'checked':''}></td>
      <td><input data-i="\${i}" data-k="pen" type="number" value="\${h.pen||0}"></td>
    </tr>\`).join('');
    $('rtbody').oninput=e=>{const t=e.target,i=+t.dataset.i,k=t.dataset.k;if(!k)return;
      holeRows[i][k]=k==='gir'?t.checked:(t.value===''?null:+t.value);recalc();};
  }
  function recalc(){
    const gross=holeRows.reduce((a,h)=>a+(+h.score||0),0);
    const putts=holeRows.reduce((a,h)=>a+(+h.putt||0),0);
    const gir=holeRows.filter(h=>h.gir).length;
    $('rsummary').innerHTML=\`<b>\${gross}타</b> · 퍼팅 \${putts} · GIR \${gir}/18 (\${(gir/18*100).toFixed(1)}%) · 페널티 \${holeRows.reduce((a,h)=>a+(+h.pen||0),0)}\`;
  }
  function renderValid(v){const el=$('rvalid');recalc();
    if(v&&v.ok){el.className='rmsg ok';el.textContent='✓ 합계 검증 통과';}
    else{el.className='rmsg err';el.textContent='⚠ '+((v&&v.issues||[]).join(' / ')||'검증 경고');}}

  $('rback').onclick=reset;
  $('rsave').onclick=async()=>{
    const btn=$('rsave');btn.disabled=true;const m=$('rvalid');
    try{
      const res=await fetch('/api/commit-round',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({date:$('fdate').value,course:$('fcourse').value,
          gross:holeRows.reduce((a,h)=>a+(+h.score||0),0),holeRows})});
      const d=await res.json();
      if(d.error){m.className='rmsg err';
        m.textContent='저장 실패: '+d.error+(d.duplicate?' (이미 존재)':'');btn.disabled=false;return;}
      m.className='rmsg ok';m.textContent='✓ 저장 완료 (No.'+d.no+'). 새로고침합니다…';
      const r=await fetch('/api/data',{cache:'no-store'});const nd=await r.json();
      EMBEDDED=nd.rounds||[];HOLE_DATA=nd.holeData||{};STREAK_DATA=nd.streak||{};
      setData(EMBEDDED);setTimeout(close,800);
    }catch(e){m.className='rmsg err';m.textContent='저장 실패: '+e.message;btn.disabled=false;}
  };
})();`;
}
