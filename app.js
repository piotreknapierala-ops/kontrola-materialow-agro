const STORAGE_KEYS = {
  projects: 'agroMaterial.projects.v1',
  items: 'agroMaterial.items.v1',
};

const $ = (id) => document.getElementById(id);
const el = {
  projectInput: $('projectInput'), projectName: $('projectName'), projectSource: $('projectSource'), projectHints: $('projectHints'),
  laser3dMode: $('laser3dMode'), dropzone: $('dropzone'), fileInput: $('fileInput'), folderInput: $('folderInput'), folderBtn: $('folderBtn'), fileList: $('fileList'), fileSummary: $('fileSummary'), warnings: $('warnings'),
  analyzeBtn: $('analyzeBtn'), exportBtn: $('exportBtn'), clearBtn: $('clearBtn'), exportDbBtn: $('exportDbBtn'), importDbInput: $('importDbInput'),
  results: $('results'), resultTitle: $('resultTitle'), resultMeta: $('resultMeta'), serviceFlags: $('serviceFlags'), kpis: $('kpis'),
  reportBody: document.querySelector('#reportTable tbody'), hideOk: $('hideOk'), showExtras: $('showExtras'), searchInput: $('searchInput'), diagnostics: $('diagnostics'),
};

const state = {
  datasets: [],
  files: [],
  warnings: [],
  projects: loadJson(STORAGE_KEYS.projects, {}),
  items: loadJson(STORAGE_KEYS.items, {}),
  analysis: null,
  masterItems: {},
  masterLoaded: false,
};

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; }
}
function saveDb() {
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(state.projects));
  localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(state.items));
  refreshProjectHints();
}

function itemRecord(code) {
  code=normalizeCode(code);
  const learned=state.items[code] || {};
  const master=state.masterItems[code] || {};
  return {
    name: master.name || learned.name || '',
    unit: (master.unit || learned.unit || '').toLowerCase(),
    category: master.category || learned.category || '',
    sources: learned.sources || []
  };
}
function itemExists(code) { code=normalizeCode(code); return !!(state.masterItems[code] || state.items[code]); }
function *allItemEntries() {
  const seen=new Set();
  for(const [code,rec] of Object.entries(state.masterItems)){ seen.add(code); yield [code,rec]; }
  for(const [code] of Object.entries(state.items)){ if(!seen.has(code)) yield [code,itemRecord(code)]; }
}
async function loadMasterItems() {
  try {
    const r=await fetch(`indeksy.json?v=3`,{cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    state.masterItems=await r.json();
    state.masterLoaded=true;
    const box=document.getElementById('masterDbStatus');
    if(box) box.textContent=`Baza indeksów: ${Object.keys(state.masterItems).length.toLocaleString('pl-PL')} pozycji`;
  } catch(err) {
    state.warnings.push(`Nie załadowano stałej bazy indeksów: ${err.message}. Nazwy będą uzupełniane z eksportów systemowych.`);
    renderWarnings();
  }
}

function normalizeSpaces(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function normalizeProject(v) {
  const s = normalizeSpaces(v).toUpperCase();
  const m = s.match(/\bP\s*[\/-]\s*(\d{1,4})\s*[\/-]\s*(\d{2})\b/);
  if (!m) return '';
  return `P/${m[1].padStart(3,'0')}/${m[2]}`;
}
function projectNameFromCombined(v, project) {
  const s = normalizeSpaces(v);
  if (!s) return '';
  const p = project || normalizeProject(s);
  const m = s.match(/\((.+)\)\s*$/);
  if (m) return normalizeSpaces(m[1]);
  if (p) return normalizeSpaces(s.replace(new RegExp(p.replaceAll('/','[\\/-]'), 'i'), '').replace(/[()]/g,''));
  return '';
}
function rememberProject(project, name, source='plik systemowy') {
  if (!project) return;
  const n = normalizeSpaces(name);
  if (!state.projects[project]) state.projects[project] = { name: n || '', source, seen: 1 };
  else {
    state.projects[project].seen = (state.projects[project].seen || 0) + 1;
    if (n && (!state.projects[project].name || state.projects[project].name.length < n.length)) {
      state.projects[project].name = n;
      state.projects[project].source = source;
    }
  }
}
function updateProjectDisplay() {
  const p = normalizeProject(el.projectInput.value);
  const rec = state.projects[p];
  if (rec?.name) {
    el.projectName.textContent = rec.name;
    el.projectSource.textContent = `Zapamiętane w lokalnej bazie (${rec.source || 'import'}).`;
  } else {
    el.projectName.textContent = '—';
    el.projectSource.textContent = p ? 'Nazwa zostanie odczytana po wczytaniu eksportów.' : 'Wpisz numer projektu.';
  }
  el.analyzeBtn.disabled = !p || !state.datasets.length;
}
function refreshProjectHints() {
  el.projectHints.innerHTML = Object.entries(state.projects)
    .sort(([a],[b]) => b.localeCompare(a, 'pl'))
    .slice(0,500)
    .map(([p,r]) => `<option value="${esc(p)}">${esc(r.name || '')}</option>`).join('');
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g,'').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : 0;
}
function parseMassKg(v) {
  const s = normalizeSpaces(v).replace(',', '.').toLowerCase();
  const n = Number((s.match(/-?\d+(?:\.\d+)?/)||[])[0]);
  if (!Number.isFinite(n)) return 0;
  if (/\bg$/.test(s) && !/\bkg$/.test(s)) return n / 1000;
  return n;
}
function parseLengthMm(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim().replace(',', '.');
  const n = Number((s.match(/-?\d+(?:\.\d+)?/)||[])[0]);
  return Number.isFinite(n) ? n : 0;
}
function round(v, d=3) { if (!Number.isFinite(v)) return null; const p=10**d; return Math.round(v*p)/p; }
function fmt(v, unit='') {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  const max = Math.abs(n) >= 100 ? 1 : 3;
  return n.toLocaleString('pl-PL',{maximumFractionDigits:max}) + (unit ? ` ${unit}` : '');
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normText(s) {
  return normalizeSpaces(s).toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/⌀|ø/g,' fi ').replace(/\bfi\b/g,' ')
    .replace(/stal nierdzewna|nierdzewny|nierdzewna|nierdzewne/g,' nierdzew ')
    .replace(/aluminiowy|aluminiowa|aluminium/g,' alu ')
    .replace(/rurka/g,'rura').replace(/pret/g,'pret').replace(/wałek|walek/g,'walek')
    .replace(/gat\.?/g,' ').replace(/gr\.?/g,' ').replace(/mm/g,' ')
    .replace(/[^a-z0-9,.x]+/g,' ').replace(/,/g,'.').replace(/\s+/g,' ').trim();
}
function tokens(s) { return new Set(normText(s).split(' ').filter(x => x.length>1)); }
function nums(s) { return [...normText(s).matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]); }
function jaccard(a,b) {
  const A=tokens(a), B=tokens(b); if(!A.size || !B.size) return 0;
  let inter=0; A.forEach(x=>{if(B.has(x)) inter++}); return inter/(A.size+B.size-inter);
}
function similarity(a,b) {
  const na=nums(a), nb=nums(b); let nscore=0;
  if (na.length && nb.length) { const B=new Set(nb); nscore=na.filter(x=>B.has(x)).length/Math.max(na.length,nb.length); }
  return 0.58*nscore + 0.42*jaccard(a,b);
}
function itemSimilarity(query,candidate) {
  const qn=nums(query), cn=new Set(nums(candidate));
  const nscore=qn.length ? qn.filter(x=>cn.has(x)).length/qn.length : 0;
  const Q=tokens(query), C=tokens(candidate); let hit=0; Q.forEach(x=>{if(C.has(x))hit++});
  const tscore=Q.size ? hit/Q.size : 0;
  return 0.62*nscore + 0.38*tscore;
}

function parseItemCell(v) {
  const s = normalizeSpaces(v);
  const m = s.match(/^([^\s]+)\s+-\s+(.+)$/);
  return m ? { code:m[1].trim(), name:m[2].trim() } : { code:'', name:s };
}
function normalizeCode(v) { return normalizeSpaces(v).replace(/\.0$/,''); }
function rememberItem(code, name, unit, source='system') {
  code=normalizeCode(code); if(!code) return;
  const rec=state.items[code] || {name:'',unit:'',category:'',sources:[]};
  if (name && (!rec.name || rec.name.length < name.length)) rec.name=normalizeSpaces(name);
  if (unit) rec.unit=normalizeSpaces(unit).toLowerCase();
  if (!rec.sources.includes(source)) rec.sources.push(source);
  state.items[code]=rec;
}
function resolveCode(raw, descriptor='') {
  const s=normalizeCode(raw);
  const parts=s.split(/[\/;,]+/).map(x=>normalizeCode(x)).filter(Boolean);
  const candidates=[];
  for(const p of (parts.length?parts:[s])) {
    candidates.push(p);
    if (/^\d+$/.test(p) && p.length<5) candidates.push(p.padStart(5,'0'));
    if (/^0+\d+$/.test(p)) candidates.push(p.replace(/^0+/,''));
  }
  for(const c of candidates) if(itemExists(c)) return {code:c, confidence:'exact', note:c!==s?`Indeks znormalizowany z ${s}`:''};
  if (descriptor) {
    let best=null;
    for(const [code,rec] of allItemEntries()) {
      const score=itemSimilarity(descriptor, `${rec.name||''}`);
      if(score>=0.82 && (!best || score>best.score)) best={code,score};
    }
    if(best) return {code:best.code,confidence:'fuzzy',note:`Dopasowanie po nazwie ${Math.round(best.score*100)}%`};
  }
  return {code:s,confidence:'unknown',note:'Indeks nierozpoznany w danych systemowych'};
}

function uniqueHeaders(row) {
  const seen={};
  return row.map((h,i)=>{
    const base=normalizeSpaces(h)||`COL_${i+1}`; seen[base]=(seen[base]||0)+1; return seen[base]===1?base:`${base}#${seen[base]}`;
  });
}
function matrixToRows(matrix) {
  if(!matrix?.length) return {headers:[],rows:[]};
  const headers=uniqueHeaders(matrix[0]);
  return {headers,rows:matrix.slice(1).filter(r=>r.some(v=>v!==null&&v!==undefined&&v!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??null])))};
}
function hasHeaders(headers, required) { const S=new Set(headers); return required.every(x=>S.has(x)); }
function classifySheet(headers, filename) {
  if(hasHeaders(headers,['Kod','Nazwa','Jednostka','Kategoria']) && !headers.includes('Ilość zasobu')) return {kind:'master',label:'Baza indeksów'};
  if(hasHeaders(headers,['Kod','Nazwa','Ilość zasobu','Magazyn'])) return {kind:'resources',label:'Zasoby'};
  if(hasHeaders(headers,['Dokument','Towar','Zmiana ilości','Projekt26'])) return {kind:'system',label:'System: ZKP/RW/ZDWP/KPLW'};
  if(hasHeaders(headers,['Długość','Tworzywo','Ilość','Odpad','Etykieta'])) return {kind:'cutlist',label:`Rozpiska ${technologyFromName(filename)}`};
  if(hasHeaders(headers,['Numer części','Ilość na całe zlecenie','Projekt','Materiał','Masa','Długość'])) return {kind:'bom',label:`Konstrukcja ${technologyFromName(filename)}`};
  return {kind:'unknown',label:'Nierozpoznany arkusz'};
}
function technologyFromName(filename='') {
  const s=normText(filename);
  if(s.includes('laser 3d')) return 'Laser 3D';
  if(s.includes('laser 2d')) return 'Laser 2D';
  if(s.includes('toczone')) return 'Toczone';
  if(s.includes('wykrawarka')) return 'Wykrawarka';
  if(s.includes('zakupowe')) return 'Zakupowe';
  if(s.includes('ciete') || s.includes('ciet')) return 'Cięte';
  return 'Inne';
}

async function readWorkbook(file, sourceName=file.name) {
  if (!window.XLSX) throw new Error('Nie załadowała się biblioteka XLSX. Sprawdź połączenie z internetem.');
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data,{type:'array',raw:true,cellDates:false});
  const out=[];
  for(const sheetName of wb.SheetNames) {
    const ws=wb.Sheets[sheetName];
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,blankrows:false});
    if(!matrix.length) continue;
    const {headers,rows}=matrixToRows(matrix);
    const cls=classifySheet(headers,sourceName);
    out.push({fileName:sourceName,sheetName,headers,rows,...cls,technology:technologyFromName(sourceName)});
  }
  return out;
}

const ARCHIVE_CDN = 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/';
let archiveModulePromise = null;
let archiveWorkerBlobUrl = null;

async function getArchiveModule() {
  if (!archiveModulePromise) {
    archiveModulePromise = (async () => {
      const mod = await import(`${ARCHIVE_CDN}libarchive.js`);
      if (!archiveWorkerBlobUrl) {
        const workerUrl = `${ARCHIVE_CDN}worker-bundle.js`;
        const r = await fetch(workerUrl, {cache:'force-cache', mode:'cors'});
        if (!r.ok) throw new Error(`nie pobrano modułu archiwów (HTTP ${r.status})`);
        let workerSource = await r.text();
        // Worker z CDN nie może być uruchomiony bezpośrednio przez GitHub Pages.
        // Uruchamiamy go z lokalnego adresu blob:, ale pozostawiamy bazę URL modułu
        // wskazującą na CDN, aby libarchive.wasm nadal został znaleziony.
        workerSource = workerSource.replace(/import\.meta\.url/g, JSON.stringify(workerUrl));
        archiveWorkerBlobUrl = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
      }
      mod.Archive.init({
        getWorker: () => new Worker(archiveWorkerBlobUrl, {type:'module'})
      });
      return mod;
    })();
  }
  return archiveModulePromise;
}

function isArchiveFile(name) {
  return /\.(7z|zip|rar|tar|tgz|gz)$/i.test(name || '');
}
function isWorkbookFile(name) {
  return /\.(xlsx|xls|xlsb|csv)$/i.test(name || '');
}

async function expandArchive(file) {
  let archive = null;
  try {
    const {Archive} = await getArchiveModule();
    archive = await Archive.open(file);
    const entries = await archive.getFilesArray();
    const wanted = entries.filter(entry => entry?.file && isWorkbookFile(entry.file.name));
    const files = [];
    for (const entry of wanted) {
      const extracted = entry.file instanceof File ? entry.file : await entry.file.extract();
      const innerPath = `${entry.path || ''}${extracted.name}`.replace(/^\/+/, '');
      files.push(new File([extracted], `${file.name}__${innerPath}`, {
        type: extracted.type || 'application/octet-stream',
        lastModified: extracted.lastModified || file.lastModified
      }));
    }
    try { await archive.close(); } catch {}
    return files;
  } catch(err) {
    try { if (archive) await archive.close(); } catch {}
    state.warnings.push(`Nie udało się odczytać archiwum ${file.name}: ${err.message}.`);
    return [];
  }
}

function fileSourceName(file) {
  return normalizeSpaces(file?._agroRelativePath || file?.webkitRelativePath || file?.name || '');
}

async function collectDroppedFiles(dataTransfer) {
  const out=[];
  const items=[...(dataTransfer?.items || [])];

  async function walkHandle(handle, path='') {
    if(!handle) return;
    if(handle.kind==='file') {
      const file=await handle.getFile();
      try { Object.defineProperty(file,'_agroRelativePath',{value:`${path}${file.name}`, configurable:true}); } catch { file._agroRelativePath=`${path}${file.name}`; }
      out.push(file);
      return;
    }
    if(handle.kind==='directory') {
      for await (const child of handle.values()) await walkHandle(child, `${path}${handle.name}/`);
    }
  }

  function walkEntry(entry, path='') {
    return new Promise((resolve,reject)=>{
      if(entry.isFile) {
        entry.file(file=>{
          try { Object.defineProperty(file,'_agroRelativePath',{value:`${path}${file.name}`, configurable:true}); } catch { file._agroRelativePath=`${path}${file.name}`; }
          out.push(file); resolve();
        },reject);
      } else if(entry.isDirectory) {
        const reader=entry.createReader(); const all=[];
        const readBatch=()=>reader.readEntries(async entries=>{
          if(!entries.length) {
            try { for(const child of all) await walkEntry(child,`${path}${entry.name}/`); resolve(); } catch(err){ reject(err); }
          } else { all.push(...entries); readBatch(); }
        },reject);
        readBatch();
      } else resolve();
    });
  }

  if(items.length) {
    for(const item of items) {
      try {
        if(typeof item.getAsFileSystemHandle==='function') {
          const handle=await item.getAsFileSystemHandle();
          if(handle) { await walkHandle(handle); continue; }
        }
        if(typeof item.webkitGetAsEntry==='function') {
          const entry=item.webkitGetAsEntry();
          if(entry) { await walkEntry(entry); continue; }
        }
        const f=item.getAsFile?.(); if(f) out.push(f);
      } catch(err) {
        const f=item.getAsFile?.(); if(f) out.push(f);
      }
    }
  }
  if(!out.length) out.push(...[...(dataTransfer?.files || [])]);
  return out;
}

async function addFiles(fileList) {
  const incoming=[...fileList];
  for(const file of incoming) {
    const sourceName=fileSourceName(file) || file.name;
    if(!isArchiveFile(file.name) && !isWorkbookFile(file.name)) continue;
    const originalKey=`${sourceName}|${file.size}|${file.lastModified}`;
    if(state.files.some(f=>f.key===originalKey)) continue;
    if(isArchiveFile(file.name)) {
      state.files.push({key:originalKey,name:sourceName,size:file.size,type:'archive',status:'Szukam Exceli w archiwum…'}); renderFiles();
      const inside=await expandArchive(file);
      const rec=state.files.find(f=>f.key===originalKey);
      rec.status=inside.length ? `${inside.length} plik${inside.length===1?'':'i'} Excel/CSV z archiwum` : 'Brak odczytanych Exceli';
      for(const sub of inside) {
        const inner=sub.name.includes('__') ? sub.name.split('__').slice(1).join('__') : sub.name;
        await ingestFile(sub, `${sourceName} → ${inner}`);
      }
    } else await ingestFile(file, sourceName);
  }
  saveDb(); renderFiles(); renderWarnings(); updateProjectDisplay();
}
async function ingestFile(file, sourceName=fileSourceName(file)||file.name) {
  const key=`${sourceName}|${file.size}|${file.lastModified}`;
  if(state.files.some(f=>f.key===key)) return;
  const rec={key,name:sourceName,size:file.size,type:'pending',status:'Odczyt…'}; state.files.push(rec); renderFiles();
  try {
    const sets=await readWorkbook(file, sourceName);
    const known=sets.filter(x=>x.kind!=='unknown');
    state.datasets.push(...known);
    const kinds=[...new Set(known.map(x=>x.kind))]; rec.type=kinds.length===1?kinds[0]:(known.length?'mixed':'error');
    rec.status=known.length ? known.map(x=>`${x.label}: ${x.rows.length}`).join(' · ') : 'Brak rozpoznanych danych';
    for(const ds of known) learnFromDataset(ds);
  } catch(err) { rec.type='error'; rec.status=err.message; state.warnings.push(`${sourceName}: ${err.message}`); }
}

function learnFromDataset(ds) {
  if(ds.kind==='system') {
    for(const r of ds.rows) {
      const p=normalizeProject(r.Projekt26)||normalizeProject(r.Numer);
      const name=projectNameFromCombined(r.Projekt26,p)||normalizeSpaces(r['Nazwa projektu']);
      rememberProject(p,name,'system');
      const item=parseItemCell(r.Towar); const unit=r['Zmiana ilości Jednostka']||r['Ilość Jednostka'];
      rememberItem(item.code,item.name,unit,'ruchy');
    }
  } else if(ds.kind==='resources') {
    for(const r of ds.rows) {
      const current=normalizeProject(r.NrZAMP)||normalizeProject(r.Projekt26);
      const source=normalizeProject(r.Projekt26);
      if(source) rememberProject(source,projectNameFromCombined(r.Projekt26,source),'zasoby/pochodzenie');
      if(current && current===source) rememberProject(current,projectNameFromCombined(r.Projekt26,current),'zasoby');
      rememberItem(r.Kod,r.Nazwa,r['Ilość zasobu Jednostka'],'zasoby');
    }
  } else if(ds.kind==='master') {
    for(const r of ds.rows) {
      const code=normalizeCode(r.Kod); if(!code) continue;
      state.masterItems[code]={name:normalizeSpaces(r.Nazwa),unit:normalizeSpaces(r.Jednostka).toLowerCase(),category:normalizeSpaces(r.Kategoria)};
    }
    state.masterLoaded=true;
  }
}

function renderFiles() {
  const labels={system:'SYSTEM',resources:'ZASOBY',bom:'KONSTRUKCJA',cutlist:'ROZPISKA',master:'BAZA INDEKSÓW',mixed:'MIESZANY',archive:'ARCHIWUM',error:'BŁĄD',pending:'…'};
  const cls={system:'system',resources:'resource',bom:'construction',cutlist:'construction',master:'resource',mixed:'system',archive:'archive',error:'error',pending:''};
  el.fileList.innerHTML=state.files.map(f=>`<div class="file-item"><div><strong title="${esc(f.name)}">${esc(f.name)}</strong><small>${esc(f.status||'')}</small></div><span class="tag ${cls[f.type]||''}">${labels[f.type]||f.type}</span></div>`).join('');
  if(state.files.length){
    const counts=state.datasets.reduce((a,d)=>(a[d.kind]=(a[d.kind]||0)+d.rows.length,a),{});
    el.fileSummary.classList.remove('hidden');
    el.fileSummary.textContent=`Wczytano: ${state.files.length} plików/paczek · konstrukcja ${counts.bom||0} wierszy · rozpiski ${counts.cutlist||0} · system ${counts.system||0} · zasoby ${counts.resources||0}`;
  } else el.fileSummary.classList.add('hidden');
}
function renderWarnings() {
  if(state.warnings.length){el.warnings.classList.remove('hidden');el.warnings.textContent=state.warnings.join('\n');}
  else {el.warnings.classList.add('hidden');el.warnings.textContent='';}
}

function docType(doc='') {
  const s=normalizeSpaces(doc).toUpperCase();
  if(/^KZKP/.test(s)) return 'ZKP';
  if(/^ZKP/.test(s)) return 'ZKP';
  if(/^ZDWP/.test(s)) return 'ZDWP';
  if(/^RW/.test(s)) return 'RW';
  if(/^KKPLW|^KPLW/.test(s)) return 'KPLW';
  return 'OTHER';
}
function projectRows(project) {
  const system=[], resources=[], bom=[], cutlist=[];
  for(const ds of state.datasets) {
    if(ds.kind==='system') {
      for(const r of ds.rows) {
        const p=normalizeProject(r.Projekt26)||normalizeProject(r.Numer);
        if(p===project) system.push({...r,__file:ds.fileName,__sheet:ds.sheetName});
      }
    } else if(ds.kind==='resources') {
      for(const r of ds.rows) {
        const p=normalizeProject(r.NrZAMP)||normalizeProject(r.Projekt26);
        if(p===project) resources.push({...r,__file:ds.fileName,__sheet:ds.sheetName});
      }
    } else if(ds.kind==='bom') { const fp=normalizeProject(ds.fileName); if(!fp||fp===project) bom.push(...ds.rows.map(r=>({...r,__file:ds.fileName,__tech:ds.technology}))); }
    else if(ds.kind==='cutlist') { const fp=normalizeProject(ds.fileName); if(!fp||fp===project) cutlist.push(...ds.rows.map(r=>({...r,__file:ds.fileName,__tech:ds.technology}))); }
  }
  return {system,resources,bom,cutlist};
}

function aggregateSystem(rows) {
  const map=new Map();
  for(const r of rows) {
    const item=parseItemCell(r.Towar); if(!item.code) continue;
    const code=normalizeCode(item.code); const unit=normalizeSpaces(r['Zmiana ilości Jednostka']||r['Ilość Jednostka']).toLowerCase();
    if(!map.has(code)) map.set(code,{code,name:item.name,unit,zkp:0,rw:0,zdwp:0,kplw:0,docs:[],service2d:false,service3d:false});
    const a=map.get(code), q=num(r['Zmiana ilości']), t=docType(r.Dokument);
    if(t==='ZKP') a.zkp+=q; else if(t==='RW') a.rw+=q; else if(t==='ZDWP') a.zdwp+=q; else if(t==='KPLW') a.kplw+=q;
    if(r.Dokument) a.docs.push(r.Dokument);
    const n=normText(item.name); if(n.includes('palenie laserem 2d')) a.service2d=true; if(n.includes('palenie laserem 3d')) a.service3d=true;
    rememberItem(code,item.name,unit,'ruchy');
  }
  return map;
}
function aggregateResources(rows) {
  const map=new Map();
  for(const r of rows) {
    const code=normalizeCode(r.Kod); if(!code) continue;
    const unit=normalizeSpaces(r['Ilość zasobu Jednostka']).toLowerCase();
    if(!map.has(code)) map.set(code,{code,name:normalizeSpaces(r.Nazwa),unit,prod:0,mat:0,other:0,origins:new Set(),docs:[]});
    const a=map.get(code), q=num(r['Ilość zasobu']), mag=normText(r.Magazyn);
    if(mag.includes('produkcja wyposazenia')) a.prod+=q;
    else if(mag.includes('materialy wyposazenia')) a.mat+=q;
    else a.other+=q;
    const origin=normalizeProject(r.Projekt26); if(origin) a.origins.add(origin);
    if(r.Dokument) a.docs.push(r.Dokument);
    rememberItem(code,r.Nazwa,unit,'zasoby');
  }
  return map;
}

function bomConversions(bomRows) {
  const list=[];
  for(const r of bomRows) {
    if(r.__tech==='Zakupowe') continue;
    const mass=parseMassKg(r.Masa), lenMm=parseLengthMm(r.Długość);
    if(mass>0 && lenMm>0) {
      const desc=[r['Numer katalogowy'],r.Opis,r.Materiał].filter(Boolean).join(' ');
      list.push({tech:r.__tech,desc,kgPerM:mass/(lenMm/1000),file:r.__file});
    }
  }
  return list;
}
function asciiMaterial(s) {
  return normalizeSpaces(s).toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/,/g,'.');
}
function theoreticalKgPerM(name) {
  const s=asciiMaterial(name); let density=0;
  if(/alum|2017a|6060|5754/.test(s)) density=/2017/.test(s)?2800:2700;
  else if(/nierdz|a2\b|a4\b|\b304\b|\b316\b/.test(s)) density=8000;
  else if(/braz|ba1032/.test(s)) density=8300;
  else if(/pom/.test(s)) density=1410;
  else if(/pa66|tecamid/.test(s)) density=1150;
  else if(/stal|s235|s355|50hf|czarn/.test(s)) density=7850;
  if(!density) return null;
  let area=null, m;
  if(/katownik/.test(s) && (m=s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/))) {
    const a=+m[1],b=+m[2],t=+m[3]; area=t*(a+b-t);
  } else if(/profil/.test(s) && (m=s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/))) {
    const a=+m[1],b=+m[2],t=+m[3]; area=a*b-Math.max(0,a-2*t)*Math.max(0,b-2*t);
  } else if(/rura/.test(s) && (m=s.match(/(?:fi\s*)?(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/))) {
    const d=+m[1],t=+m[2]; area=Math.PI/4*(d*d-Math.max(0,d-2*t)**2);
  } else if(/pret|walek/.test(s)) {
    let d=null;
    m=s.match(/fi\s*(\d+(?:\.\d+)?)/); if(m)d=+m[1];
    if(d===null){m=s.match(/(?:pret|walek)[^0-9]{0,30}(\d+(?:\.\d+)?)\s*(?:mm)?/);if(m)d=+m[1];}
    if(d!==null){
      if(/szesciokat/.test(s)) area=Math.sqrt(3)/2*d*d;
      else if(/kwadrat/.test(s)) area=d*d;
      else area=Math.PI/4*d*d;
    }
  }
  if(!(area>0)) return null;
  return area/1e6*density;
}
function findKgPerM(cutDesc, systemName, tech, conversions) {
  const target=`${cutDesc||''} ${systemName||''}`;
  const ranked=conversions.filter(x=>x.tech===tech).map(x=>({...x,score:similarity(target,x.desc)})).sort((a,b)=>b.score-a.score);
  if(ranked.length && ranked[0].score>=0.72) {
    const top=ranked.filter(x=>x.score>=Math.max(0.72,ranked[0].score-0.06)).map(x=>x.kgPerM).filter(x=>x>0&&x<500);
    if(top.length){top.sort((a,b)=>a-b);const mid=Math.floor(top.length/2);const value=top.length%2?top[mid]:(top[mid-1]+top[mid])/2;return {kgPerM:value,score:ranked[0].score,match:ranked[0].desc,method:'BOM'};}
  }
  const theoretical=theoreticalKgPerM(systemName||cutDesc);
  if(theoretical) return {kgPerM:theoretical,score:1,match:systemName||cutDesc,method:'geometria indeksu'};
  if(ranked.length && ranked[0].score>=0.48) return {kgPerM:ranked[0].kgPerM,score:ranked[0].score,match:ranked[0].desc,method:'BOM — niższa pewność'};
  return null;
}

function constructionPurchasedRows(bomRows, sys, res) {
  const groups=new Map();
  for(const r of bomRows.filter(x=>x.__tech==='Zakupowe')) {
    const total=num(r['Ilość na całe zlecenie']); if(!total) continue;
    const raw=normalizeCode(r.Indeks||r['Numer części']);
    const desc=[r.Opis,r['Numer katalogowy'],r.Materiał,r['Numer części']].filter(Boolean).join(' ');
    const rawParts=raw.split(/[\/;,]+/).map(normalizeCode).filter(Boolean);
    let codes=[]; let confidence='exact'; let resolverNote='';
    if(rawParts.length>1){
      const exact=[];
      for(const p of rawParts){
        const variants=[p]; if(/^\d+$/.test(p)&&p.length<5)variants.push(p.padStart(5,'0'));
        const c=variants.find(x=>itemExists(x)); if(c&&!exact.includes(c))exact.push(c);
      }
      const evidenced=exact.filter(c=>sys.has(c)||res.has(c));
      codes=evidenced.length===1?evidenced:exact;
      if(!codes.length) codes=rawParts;
      confidence=evidenced.length===1?'exact':'ambiguous';
      resolverNote=evidenced.length===1?`Z alternatywnych indeksów ${raw} wybrano ${evidenced[0]} — występuje pod projektem.`:`Alternatywne indeksy dopuszczone przez konstrukcję: ${codes.join(' / ')}.`;
    } else {
      const rr=resolveCode(raw,desc); codes=rr.code?[rr.code]:[]; confidence=rr.confidence; resolverNote=rr.note;
    }
    if(!codes.length) continue;
    const displayCode=codes.join(' / '); const key=codes.slice().sort().join('|');
    const units=[...new Set(codes.map(c=>sys.get(c)?.unit||res.get(c)?.unit||itemRecord(c)?.unit||'').filter(Boolean))];
    const unit=(units[0]||'szt').toLowerCase();
    let expected=total, conversion='ilość z BOM';
    if(unit==='kg') { const m=parseMassKg(r.Masa); if(m>0){expected=m*total;conversion='masa detalu × ilość';} }
    else if(unit==='m') { const l=parseLengthMm(r.Długość); if(l>0){expected=(l/1000)*total;conversion='długość detalu × ilość';} }
    const names=codes.map(c=>itemRecord(c)?.name||sys.get(c)?.name||res.get(c)?.name||'').filter(Boolean);
    const categories=[...new Set(codes.map(c=>itemRecord(c)?.category||'').filter(Boolean))];
    if(!groups.has(key)) groups.set(key,{technology:'Zakupowe',code:displayCode,codes,name:names.join(' / ')||normalizeSpaces(r.Opis)||desc,unit,category:categories.join(' / '),expected:0,notes:[],source:'BOM zakupowe',confidence});
    const g=groups.get(key); g.expected+=expected; if(resolverNote)g.notes.push(resolverNote); if(units.length>1)g.notes.push(`Alternatywne indeksy mają różne jednostki systemowe: ${units.join(', ')}.`); g.notes.push(conversion);
  }
  return [...groups.values()];
}

function constructionCutRows(cutRows, bomRows, sys, res, outsource3d) {
  const conversions=bomConversions(bomRows); const groups=new Map();
  for(const r of cutRows) {
    const raw=normalizeCode(r.Etykieta); if(!raw) continue;
    const desc=normalizeSpaces(r.Tworzywo); const rr=resolveCode(raw,desc); const code=rr.code; const tech=r.__tech;
    const qty=num(r.Ilość); if(!(qty>0)) continue;
    const listedLenMm=parseLengthMm(r.Długość); if(!(listedLenMm>0)) continue;
    const scrapMm=Math.max(0,num(r.Odpad));
    // Laser 3D: konstrukcja wpisuje 5800 mm, ale magazynowo kupujemy/rozliczamy odcinek 6000 mm.
    const stockLenMm=(tech==='Laser 3D' && Math.abs(listedLenMm-5800)<0.001) ? 6000 : listedLenMm;
    // Ilość = liczba odcinków z danym rozkrojem; Odpad jest odpadem NA JEDEN odcinek.
    // Zużycie materiału = (długość handlowa - odpad) × ilość.
    const usedPerPieceMm=Math.max(0,stockLenMm-scrapMm);
    const usedLengthM=(usedPerPieceMm*qty)/1000;
    const key=`${tech}|${code}`;
    if(!groups.has(key)) groups.set(key,{technology:tech,code,name:'',unit:'',lengthM:0,stockPieces:0,grossLengthM:0,scrapLengthM:0,expected:0,rows:0,notes:[],source:'Rozpiska',outsource:false,conversion:null,confidence:rr.confidence,cutDesc:desc,laser3d5800Count:0});
    const g=groups.get(key);
    g.lengthM+=usedLengthM;
    g.grossLengthM+=(stockLenMm*qty)/1000;
    g.scrapLengthM+=(scrapMm*qty)/1000;
    g.stockPieces+=qty;
    g.rows+=1;
    if(tech==='Laser 3D' && Math.abs(listedLenMm-5800)<0.001) g.laser3d5800Count+=qty;
    if(rr.note)g.notes.push(rr.note);
  }
  for(const g of groups.values()) {
    const master=itemRecord(g.code)||{}, s=sys.get(g.code), z=res.get(g.code); g.name=master.name||s?.name||z?.name||g.cutDesc; g.unit=(s?.unit||z?.unit||master.unit||'').toLowerCase(); g.category=master.category||'';
    if(g.laser3d5800Count>0) g.notes.push(`Laser 3D: ${round(g.laser3d5800Count,3)} odc. o długości 5800 mm przeliczono jako 6000 mm.`);
    g.notes.push(`Rozpiska: zużycie = (długość handlowa − odpad) × ilość; brutto ${round(g.grossLengthM,3)} m − odpad ${round(g.scrapLengthM,3)} m = ${round(g.lengthM,3)} m.`);
    if(g.technology==='Laser 3D' && outsource3d) { g.outsource=true; g.expected=null; g.notes.push('Laser 3D: usługa z materiałem wykonawcy — materiał nie jest wymagany w naszym RW/ZKP/zasobach.'); continue; }
    if(g.unit==='m') { g.expected=g.lengthM; g.conversion='(długość handlowa − odpad) × ilość'; }
    else if(g.unit==='szt') { g.expected=g.stockPieces; g.conversion='suma liczby odcinków z kolumny Ilość'; }
    else if(g.unit==='kg') {
      const conv=findKgPerM(g.cutDesc,g.name,g.technology,conversions);
      if(conv){g.expected=g.lengthM*conv.kgPerM;g.conversion=`${round(g.lengthM,3)} m × ${round(conv.kgPerM,4)} kg/m`;g.notes.push(`Przelicznik ${conv.method||'BOM'}: ${round(conv.kgPerM,4)} kg/m (${Math.round(conv.score*100)}%) — ${conv.match}`);}
      else {g.expected=null;g.notes.push('Brak pewnego przelicznika długość → kg.');}
    } else { g.expected=null; g.notes.push('Nie ustalono jednostki systemowej dla indeksu.'); }
  }
  return [...groups.values()];
}

function sheetSpec(r) {
  const desc=[r.Projekt,r['Numer katalogowy'],r.Opis].filter(Boolean).join(' ');
  const material=normalizeSpaces(r.Materiał);
  const m=normText(desc).match(/(?:blacha\s*)?(?:g\s*)?(?:r\s*)?(\d+(?:\.\d+)?)\s*(?:mm)?/);
  const thickness=m?Number(m[1]):null;
  const n=normText(material);
  let family='';
  if(n.includes('alu')) family='ALU';
  else if(n.includes('nierdzew')) family='INOX';
  else if(n.includes('s235')) family='S235';
  else if(n.includes('s355')) family='S355';
  else if(n.includes('stal') || n.includes('czarn')) family='CARBON';
  else family=n.toUpperCase();
  const grade=(n.match(/\b(5754|6060|304|316)\b/)||[])[1] || (n.match(/\b(s235|s355)(?:[a-z0-9]+)?\b/)||[])[1] || '';
  return {thickness,family,grade,key:`${family}|${grade}|${thickness??'?'}`};
}
function systemSheetSpec(name) {
  const n=normText(name); if(!n.includes('blacha')) return null;
  let family='';
  if(n.includes('alu')) family='ALU';
  else if(n.includes('nierdzew')) family='INOX';
  else if(n.includes('s235')) family='S235';
  else if(n.includes('s355')) family='S355';
  else if(n.includes('stal') || n.includes('czarn')) family='CARBON';
  const grade=(n.match(/\b(5754|6060|304|316)\b/)||[])[1] || (n.match(/\b(s235|s355)(?:[a-z0-9]+)?\b/)||[])[1] || '';
  let thickness=null;
  // Systemowe nazwy zwykle: BLACHA 8X1500X3000..., ale obsługujemy też "blacha gr. 8".
  const after=n.match(/blacha[^0-9]*(\d+(?:\.\d+)?)\s*x/); if(after) thickness=Number(after[1]);
  else {
    const m1=n.match(/\b(\d+(?:\.\d+)?)\s*x\s*\d{3,4}\s*x\s*\d{3,4}\b/); if(m1) thickness=Number(m1[1]);
    else { const m2=n.match(/blacha[^0-9]*(\d+(?:\.\d+)?)(?:\s|$)/); if(m2) thickness=Number(m2[1]); }
  }
  return {family,grade,thickness};
}
function isCarbonSheetFamily(f) { return ['S235','S355','CARBON',''].includes(f||''); }
function sheetMatchLevel(expected,candidate) {
  if(!expected||!candidate||expected.thickness===null||candidate.thickness===null) return 0;
  if(Math.abs(expected.thickness-candidate.thickness)>0.01) return 0;

  // Najpewniejsze: ten sam gatunek / rodzina.
  if(expected.grade && candidate.grade && expected.grade===candidate.grade) return 4;
  if(expected.family && candidate.family && expected.family===candidate.family) return 3;

  // Blachy konstrukcyjne ze stali czarnej: pod projektem może zostać użyty wyższy/inny
  // gatunek systemowy (np. konstrukcja S235, zasób S355J2). Nie odrzucamy go, ale flagujemy.
  if(isCarbonSheetFamily(expected.family) && isCarbonSheetFamily(candidate.family)) return 2;

  // INOX/ALU bez jednoznacznego gatunku: pozwalamy na rodzinę, lecz nie mieszamy INOX z ALU/stalą czarną.
  if(expected.family==='INOX' && candidate.family==='INOX') return 2;
  if(expected.family==='ALU' && candidate.family==='ALU') return 2;
  return 0;
}
function constructionSheetRows(bomRows, sys, res) {
  const source=bomRows.filter(r=>['Laser 2D','Wykrawarka'].includes(r.__tech));
  const groups=new Map();
  for(const r of source) {
    const spec=sheetSpec(r), qty=num(r['Ilość na całe zlecenie']), mass=parseMassKg(r.Masa);
    if(!spec.thickness||!qty||!mass) continue;
    if(!groups.has(spec.key)) groups.set(spec.key,{technology:'Laser 2D / blachy',spec,netMass:0,items:0,notes:new Set()});
    const g=groups.get(spec.key); g.netMass+=mass*qty; g.items+=qty; g.notes.add(`${r.__tech}: ${r.__file}`);
  }

  // Kandydatami są WYŁĄCZNIE indeksy, które rzeczywiście występują pod analizowanym projektem
  // w ZDWP/RW/ZKP albo zasobach. Dzięki temu format 1500x3000 / 2000x4000 nie ma znaczenia:
  // wszystkie użyte formaty tego samego materiału mogą zostać zsumowane.
  const projectCodes=new Set([...sys.keys(),...res.keys()]);
  const out=[];
  for(const g of groups.values()) {
    const ranked=[];
    for(const code of projectCodes) {
      const name=itemRecord(code)?.name||sys.get(code)?.name||res.get(code)?.name||'';
      const sp=systemSheetSpec(name);
      const level=sheetMatchLevel(g.spec,sp);
      if(!level) continue;
      const s=sys.get(code), z=res.get(code);
      const evidence=Math.abs(s?.zdwp||0)+Math.abs(s?.zkp||0)+Math.abs(s?.rw||0)+Math.abs(z?.prod||0)+Math.abs(z?.mat||0)+Math.abs(z?.other||0);
      ranked.push({code,name,sp,level,evidence});
    }

    // Jeżeli istnieje zgodny gatunek, nie dokładamy zamienników. Jeżeli zgodnego nie ma,
    // bierzemy użyte pod projektem zamienniki tej samej grubości/rodziny materiałowej.
    const bestLevel=ranked.length?Math.max(...ranked.map(x=>x.level)):0;
    const selected=ranked.filter(x=>x.level===bestLevel && (x.evidence>0 || bestLevel>=3));
    const candidates=selected.map(x=>x.code);
    const names=selected.map(x=>x.name||x.code);
    const substitute=bestLevel===2 && selected.length>0;
    const mismatchNotes=[];
    if(substitute) {
      const found=[...new Set(selected.map(x=>x.sp.grade||x.sp.family).filter(Boolean))].join(', ');
      mismatchNotes.push(`Indeks przypisano po grubości i faktycznym użyciu pod projektem. Konstrukcja: ${g.spec.grade||g.spec.family}; system: ${found||'stal czarna'}. Sprawdź/zaakceptuj zamiennik materiałowy.`);
    }

    out.push({
      technology:'Laser 2D / blachy',
      code:candidates.join(', ')||'—',
      codes:candidates,
      name:names.join(' | ')||`${g.spec.family} ${g.spec.grade} blacha ${g.spec.thickness} mm`,
      unit:'kg',
      category:candidates.map(c=>itemRecord(c)?.category||'').filter(Boolean).join(' / '),
      expected:g.netMass,
      source:'BOM Laser 2D/Wykrawarka',
      confidence:candidates.length?(substitute?'matched-substitute':'matched'):'unknown',
      notes:[
        `Masa netto detali konstrukcyjnych: ${round(g.netMass,2)} kg.`,
        candidates.length?`Automatycznie przypisane indeksy systemowe: ${candidates.join(', ')}.`:'Nie znaleziono indeksu blachy w ruchach/zasobach tego projektu.',
        ...mismatchNotes,
        'Format arkusza nie rozbija zapotrzebowania: wszystkie indeksy użyte pod projektem dla tej samej grubości/gatunku są sumowane w kg.',
        'Dla blach masa konstrukcji jest minimum materiałowym; format arkusza i odpad technologiczny mogą zwiększyć prawidłową ilość systemową.',
        ...g.notes
      ]
    });
  }
  return out;
}

function sourceValues(codeOrCodes, sys, res) {
  const codes=Array.isArray(codeOrCodes)?codeOrCodes:[codeOrCodes]; let zkp=0,rw=0,zdwp=0,kplw=0,prod=0,mat=0,other=0; const origins=new Set(); let unit='',name='';
  for(const c of codes) {
    const s=sys.get(c), r=res.get(c); if(s){zkp+=s.zkp;rw+=s.rw;zdwp+=s.zdwp;kplw+=s.kplw;unit=unit||s.unit;name=name||s.name;} if(r){prod+=r.prod;mat+=r.mat;other+=r.other;unit=unit||r.unit;name=name||r.name;r.origins.forEach(x=>origins.add(x));}
  }
  return {zkp,rw,zdwp,kplw,prod,mat,other,total:zkp+rw+prod+mat,origins:[...origins],unit,name};
}
function normalizedUnit(u='') { return normalizeSpaces(u).toLowerCase().replace('szt.','szt'); }
function isFastener(d) {
  const cat=normText(d.category||''); const name=normText(d.name||'');
  return cat.includes('zlaczne') || /\b(sruba|nakretka|podkladka|nit|wkret|sworzen|zawleczka)\b/.test(name);
}
function shortageTolerance(d) {
  const e=Math.abs(Number(d.expected)||0), u=normalizedUnit(d.unit);
  if(u==='szt' || u==='kpl' || u==='para' || u==='pud') return 0.0001;
  return Math.max(0.01, e*0.005);
}
function surplusTolerance(d) {
  const e=Math.abs(Number(d.expected)||0), u=normalizedUnit(d.unit);
  if(u==='szt') {
    if(isFastener(d)) return Math.min(10, Math.max(2, e*0.05));
    return Math.min(5, Math.max(1, e*0.02));
  }
  if(u==='kpl' || u==='para') return 0.0001;
  if(['kg','m','m2','m3','t','l'].includes(u)) return Math.max(0.1, e*0.02);
  return Math.max(0.01, e*0.01);
}
function toleranceDescription(d) {
  if(normalizedUnit(d.unit)==='szt' && isFastener(d)) return 'złączne: nadwyżka do 5%, min. 2 szt., maks. 10 szt.';
  if(normalizedUnit(d.unit)==='szt') return 'sztuki: nadwyżka do 2%, min. 1 szt., maks. 5 szt.';
  if(['kg','m','m2','m3','t','l'].includes(normalizedUnit(d.unit))) return 'jednostki ciągłe: nadwyżka do 2%';
  return 'tolerancja standardowa';
}
function classifyResult(d, v) {
  if(d.outsource) return {status:'OUTSOURCING 3D',class:'info',delta:null,withinTolerance:false};
  if(d.expected===null || d.expected===undefined || !Number.isFinite(d.expected)) return {status:'BRAK PRZELICZNIKA',class:'warn',delta:null,withinTolerance:false};
  const delta=v.total-d.expected, lowTol=shortageTolerance(d), highTol=surplusTolerance(d);
  if(d.technology==='Laser 2D / blachy') {
    if(delta < -lowTol) return {status:v.zdwp>0?'BRAK MIN. / ZDWP':'BRAK MINIMUM',class:'bad',delta,withinTolerance:false,lowTol,highTol};
    if(delta <= Math.max(highTol, Math.abs(d.expected)*0.20)) return {status:'OK',class:'ok',delta,withinTolerance:true,lowTol,highTol};
    return {status:'DO WERYFIKACJI BLACHY',class:'warn',delta,withinTolerance:false,lowTol,highTol};
  }
  if(delta < -lowTol) {
    if(v.zdwp>0 && v.total<=lowTol && v.zdwp>=Math.abs(delta)-lowTol) return {status:'ZAMÓWIONE / OCZEKUJE',class:'info',delta,withinTolerance:false,lowTol,highTol};
    if(v.zdwp>0) return {status:'BRAK / JEST ZDWP',class:'bad',delta,withinTolerance:false,lowTol,highTol};
    return {status:'BRAK',class:'bad',delta,withinTolerance:false,lowTol,highTol};
  }
  if(delta > highTol) return {status:'NADWYŻKA',class:'warn',delta,withinTolerance:false,lowTol,highTol};
  return {status:'OK',class:'ok',delta,withinTolerance:true,lowTol,highTol};
}

function analyze() {
  const project=normalizeProject(el.projectInput.value); if(!project) return;
  const rows=projectRows(project), sys=aggregateSystem(rows.system), res=aggregateResources(rows.resources);
  saveDb();
  const projectName=state.projects[project]?.name||projectNameFromCombined(rows.system[0]?.Projekt26,project)||projectNameFromCombined(rows.resources[0]?.Projekt26,project)||'';
  if(projectName) rememberProject(project,projectName,'analiza'); saveDb(); updateProjectDisplay();

  const service3d=[...sys.values()].some(x=>x.service3d && (x.zdwp!==0||x.zkp!==0||x.rw!==0));
  const service2d=[...sys.values()].some(x=>x.service2d && (x.zdwp!==0||x.zkp!==0||x.rw!==0));
  const mode=el.laser3dMode.value; const outsource3d=mode==='external'||(mode==='auto'&&service3d);

  const demands=[
    ...constructionPurchasedRows(rows.bom,sys,res),
    ...constructionCutRows(rows.cutlist,rows.bom,sys,res,outsource3d),
    ...constructionSheetRows(rows.bom,sys,res),
  ];

  const usedCodes=new Set(); const report=[];
  for(const d of demands) {
    const codes=d.codes || (d.code && d.code!=='—' ? [d.code] : []); codes.forEach(c=>usedCodes.add(c));
    if(!d.category){ const cats=[...new Set(codes.map(c=>itemRecord(c)?.category||'').filter(Boolean))]; d.category=cats.join(' / '); }
    const v=sourceValues(codes,sys,res); const result=classifyResult(d,v);
    const notes=[...(d.notes||[])]; if(d.conversion)notes.push(`Przeliczenie: ${d.conversion}.`);
    if(v.origins.length && v.origins.some(x=>x!==project)) notes.push(`Pochodzenie zasobu: ${v.origins.join(', ')} — materiał może pochodzić z innego zlecenia.`);
    if(v.kplw) notes.push(`W danych występuje KPLW: ${fmt(v.kplw,v.unit)}. KPLW nie jest dodawane do raportu przed kompletacją.`);
    if(result.status==='NADWYŻKA') notes.push(`Dopuszczalna nadwyżka: ${fmt(result.highTol,d.unit)} (${toleranceDescription(d)}).`);
    const fallbackName = codes.map(c=>itemRecord(c)?.name||'').filter(Boolean).join(' / ');
    report.push({...d,...v,
      name:d.name||v.name||fallbackName||d.cutDesc||'',
      category:d.category||codes.map(c=>itemRecord(c)?.category||'').filter(Boolean).join(' / '),
      unit:d.unit||v.unit||'',delta:result.delta,status:result.status,statusClass:result.class,notes:[...new Set(notes)]});
  }

  const extras=[];
  const allCodes=new Set([...sys.keys(),...res.keys()]);
  for(const code of allCodes) {
    if(usedCodes.has(code)) continue; const v=sourceValues(code,sys,res); if(Math.abs(v.total)<1e-9) continue;
    const name=itemRecord(code)?.name||v.name||''; const n=normText(name); if(n.includes('palenie laserem')) continue;
    extras.push({technology:'Poza konstrukcją',code,name,unit:v.unit,category:itemRecord(code)?.category||'',expected:0,...v,delta:v.total,status:'POZA KONSTRUKCJĄ',statusClass:'gray',notes:[v.origins.length?`NrZAMP / pochodzenie: ${v.origins.join(', ')}`:'Indeks ma stan/ruch pod projektem, ale nie został znaleziony w dostarczonych listach konstrukcyjnych.'],extra:true});
  }

  const unresolved=demands.filter(d=>d.confidence==='unknown'||d.expected===null).map(d=>`${d.technology}: ${d.code} — ${d.name||d.cutDesc||''}`);
  const kplwTotal=[...sys.values()].reduce((s,x)=>s+Math.abs(x.kplw),0);
  state.analysis={project,projectName,rows,sys,res,report,extras,service2d,service3d,outsource3d,unresolved,kplwTotal,generated:new Date()};
  renderResults(); el.exportBtn.disabled=false;
}

function differenceRows(includeExtras=true) {
  if(!state.analysis) return [];
  const rows=[...state.analysis.report.filter(r=>r.status!=='OK')];
  if(includeExtras) rows.push(...state.analysis.extras);
  return rows;
}
function visibleRows() {
  if(!state.analysis) return [];
  let rows=differenceRows(el.showExtras.checked);
  const q=normText(el.searchInput.value); if(q) rows=rows.filter(r=>normText(`${r.code} ${r.name} ${r.technology} ${r.status}`).includes(q));
  const severity={bad:0,warn:1,info:2,gray:3,ok:4}; rows.sort((a,b)=>(severity[a.statusClass]??9)-(severity[b.statusClass]??9)||String(a.technology).localeCompare(String(b.technology),'pl')||String(a.code).localeCompare(String(b.code),'pl'));
  return rows;
}
function renderResults() {
  const a=state.analysis; if(!a)return; el.results.classList.remove('hidden');
  el.resultTitle.textContent=`${a.project}${a.projectName?` — ${a.projectName}`:''}`;
  el.resultMeta.textContent=`System: ${a.rows.system.length} wierszy · zasoby: ${a.rows.resources.length} · listy konstrukcyjne: ${a.rows.bom.length} · rozpiski: ${a.rows.cutlist.length}`;
  el.serviceFlags.innerHTML=[
    `<span class="flag ${a.service2d?'ok':'warn'}">Laser 2D: ${a.service2d?'usługa wykryta':'brak ZDWP usługi'}</span>`,
    `<span class="flag ${a.outsource3d?'ok':'warn'}">Laser 3D: ${a.outsource3d?'materiał wykonawcy':'nasz materiał / brak potwierdzenia outsourcingu'}</span>`,
    a.kplwTotal?`<span class="flag warn">KPLW wykryte — pomijane w bilansie</span>`:''
  ].join('');
  const rr=a.report; const counts={ok:0,bad:0,warn:0,info:0,conv:0}; rr.forEach(r=>{if(r.status==='OK')counts.ok++;else if(r.statusClass==='bad')counts.bad++;else if(r.statusClass==='warn')counts.warn++;else counts.info++;if(r.status==='BRAK PRZELICZNIKA')counts.conv++;});
  el.kpis.innerHTML=`
    <div class="kpi ok"><b>${counts.ok}</b><span>zgodne — pominięte</span></div>
    <div class="kpi bad"><b>${counts.bad}</b><span>braki / błędy</span></div>
    <div class="kpi warn"><b>${counts.warn}</b><span>nadwyżki / weryfikacja</span></div>
    <div class="kpi info"><b>${counts.info}</b><span>zamówione / outsourcing</span></div>
    <div class="kpi warn"><b>${counts.conv}</b><span>brak przelicznika</span></div>
    <div class="kpi"><b>${a.extras.length}</b><span>indeksy poza konstrukcją</span></div>`;
  renderTable(); renderDiagnostics();
}
function renderTable() {
  const rows=visibleRows();
  el.reportBody.innerHTML=rows.map(r=>`<tr>
    <td>${esc(r.technology)}</td><td><strong>${esc(r.code)}</strong></td><td>${esc(r.name||'')}</td><td>${esc(r.unit||'')}</td>
    <td class="num">${fmt(r.expected)}</td><td class="num">${fmt(r.zkp)}</td><td class="num">${fmt(r.rw)}</td><td class="num">${fmt(r.prod)}</td><td class="num">${fmt(r.mat)}</td><td class="num"><strong>${fmt(r.total)}</strong></td><td class="num">${fmt(r.zdwp)}</td><td class="num">${fmt(r.delta)}</td>
    <td><span class="status ${r.statusClass}">${esc(r.status)}</span></td><td>${esc((r.notes||[]).join(' · '))}</td>
  </tr>`).join('') || `<tr><td colspan="14" style="padding:24px;text-align:center;color:#66727f">Brak pozycji dla wybranych filtrów.</td></tr>`;
}
function renderDiagnostics() {
  const a=state.analysis; const chunks=[];
  chunks.push(`<div class="diag-section"><h4>Rozpoznanie projektu</h4><div class="diag-list">Numer: <code>${esc(a.project)}</code> · nazwa: <strong>${esc(a.projectName||'nie ustalono')}</strong>. Baza nazw projektów jest zapisywana w tej przeglądarce.</div></div>`);
  if(a.unresolved.length) chunks.push(`<div class="diag-section"><h4>Pozycje wymagające dopracowania resolvera / przelicznika</h4><div class="diag-list">${a.unresolved.map(x=>`• ${esc(x)}`).join('<br>')}</div></div>`);
  const transferred=[]; for(const [code,r] of a.res.entries()) if([...r.origins].some(x=>x!==a.project)) transferred.push(`${code} — ${r.name}: źródło ${[...r.origins].join(', ')}`);
  if(transferred.length) chunks.push(`<div class="diag-section"><h4>Zasoby pochodzące z innych zleceń</h4><div class="diag-list">${transferred.slice(0,80).map(x=>`• ${esc(x)}`).join('<br>')}${transferred.length>80?`<br>… i ${transferred.length-80} kolejnych`:''}</div></div>`);
  if(a.kplwTotal) chunks.push(`<div class="diag-section"><h4>Kompletacja</h4><div class="diag-list">W plikach znaleziono KPLW dla projektu. Zgodnie z logiką raportu przed kompletacją te ilości <strong>nie są dodawane</strong> do bilansu.</div></div>`);
  chunks.push(`<div class="diag-section"><h4>Założenia wersji v0.7</h4><div class="diag-list">• ZKP/KZKP i RW są liczone z pola „Zmiana ilości”.<br>• ZDWP jest informacyjne — nie jest dodawane do stanu projektu.<br>• Zasoby są rozdzielane na „Produkcja wyposażenia” i „Materiały wyposażenia”. Bieżący projekt jest brany z NrZAMP (kolumna L), a Projekt26 zostaje jako informacja o pochodzeniu — dzięki temu widać przesunięcia z innych projektów.<br>• Blachy Laser 2D: aplikacja najpierw buduje zapotrzebowanie z konstrukcji, a następnie automatycznie przypisuje indeksy faktycznie użyte pod projektem po grubości i materiale. Różne formaty arkuszy są sumowane w kg. Gdy pod projektem użyto zamiennika gatunkowego (np. S355J2 zamiast S235), indeks jest przypisany automatycznie, ale raport zawiera ostrzeżenie o zamienniku.<br>• Wszystkie dostarczone zestawienia konstrukcyjne są addytywne. Foldery datowane używane jako „zwiększenia ilości” są sumowane z zestawieniem bazowym, a nie zastępują go.<br>• Raport główny i eksport pokazują wyłącznie różnice / pozycje wymagające reakcji.<br>• Niedobór jest traktowany rygorystycznie; niewielka nadwyżka jest tolerowana zależnie od kategorii i jednostki. Dla złącznych: do 5%, minimum 2 szt., maksymalnie 10 szt. nadwyżki.</div></div>`);
  el.diagnostics.innerHTML=chunks.join('');
}

function exportReport() {
  const a=state.analysis; if(!a||!window.XLSX)return;
  const all=differenceRows(true);
  const data=all.map(r=>({
    'Projekt':a.project,'Nazwa projektu':a.projectName,'Technologia':r.technology,'Indeks':r.code,'Materiał':r.name,'Kategoria':r.category||'','JM systemowa':r.unit,
    'Konstrukcja':r.expected,'ZKP':r.zkp,'RW':r.rw,'Produkcja wyposażenia':r.prod,'Materiały wyposażenia':r.mat,'Razem w projekcie':r.total,'ZDWP':r.zdwp,'Różnica':r.delta,'Status':r.status,'Uwagi':(r.notes||[]).join(' | '),
    'Pochodzenie NrZAMP':(r.origins||[]).join(', ')
  }));
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(data); ws['!cols']=[{wch:12},{wch:28},{wch:18},{wch:14},{wch:52},{wch:12},{wch:13},{wch:10},{wch:10},{wch:18},{wch:19},{wch:15},{wch:12},{wch:12},{wch:25},{wch:70},{wch:25}];
  XLSX.utils.book_append_sheet(wb,ws,'Raport');
  const src=[...a.rows.system.map(r=>({...r,'Źródło':'SYSTEM'})),...a.rows.resources.map(r=>({...r,'Źródło':'ZASOBY'}))];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(src),'Źródła systemowe');
  const meta=[['Projekt',a.project],['Nazwa',a.projectName],['Data analizy',new Date().toLocaleString('pl-PL')],['Laser 2D usługa',a.service2d?'TAK':'NIE'],['Laser 3D materiał wykonawcy',a.outsource3d?'TAK':'NIE'],['KPLW pominięte',a.kplwTotal?'TAK':'NIE']];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(meta),'Metryka');
  XLSX.writeFile(wb,`Raport_materialowy_${a.project.replaceAll('/','-')}.xlsx`,{compression:true});
}

function exportDb() {
  const payload={version:1,exportedAt:new Date().toISOString(),projects:state.projects,items:state.items};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download='agro_baza_materialowa.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function importDb(file) {
  try { const obj=JSON.parse(await file.text()); if(obj.projects)Object.assign(state.projects,obj.projects); if(obj.items)Object.assign(state.items,obj.items);saveDb();updateProjectDisplay(); }
  catch(err){state.warnings.push(`Import bazy: ${err.message}`);renderWarnings();}
}

el.projectInput.addEventListener('input',updateProjectDisplay);
el.dropzone.addEventListener('click',e=>{if(e.target.closest('button'))return;el.fileInput.click()}); el.dropzone.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button'))el.fileInput.click()});
el.fileInput.addEventListener('change',e=>addFiles(e.target.files));
el.folderBtn?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();el.folderInput.click()});
el.folderInput?.addEventListener('change',e=>addFiles(e.target.files));
['dragenter','dragover'].forEach(ev=>el.dropzone.addEventListener(ev,e=>{e.preventDefault();el.dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>el.dropzone.addEventListener(ev,e=>{e.preventDefault();el.dropzone.classList.remove('drag')}));
el.dropzone.addEventListener('drop',async e=>{const files=await collectDroppedFiles(e.dataTransfer);await addFiles(files)});
el.clearBtn.addEventListener('click',()=>{state.datasets=[];state.files=[];state.warnings=[];state.analysis=null;renderFiles();renderWarnings();el.results.classList.add('hidden');el.exportBtn.disabled=true;updateProjectDisplay();});
el.analyzeBtn.addEventListener('click',analyze); el.exportBtn.addEventListener('click',exportReport); el.exportDbBtn.addEventListener('click',exportDb); el.importDbInput.addEventListener('change',e=>e.target.files[0]&&importDb(e.target.files[0]));
[el.showExtras].filter(Boolean).forEach(x=>x.addEventListener('change',renderTable)); el.searchInput.addEventListener('input',renderTable); el.laser3dMode.addEventListener('change',()=>{if(state.analysis)analyze()});

async function init(){ await loadMasterItems(); refreshProjectHints(); updateProjectDisplay(); renderFiles(); renderWarnings(); }
init();
