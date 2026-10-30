/* =====================================================================
   Rapport des dégâts imprimable — mise en page « état des lieux »
   (structure d'un contrat de véhicule de remplacement : parties, véhicule,
   état du véhicule en 5 vues, relevé des dégâts, photos, observations,
   signatures). Dérivé de la scène 3D, sans modifier le workflow WinDev.

   Hooks WinDev :
     setRapportInfos(json)   → en-tête (société, client, véhicule, intervention)
     chargerPhotos(json)     → photos des dégâts [{damage_id, path, src}]
     open2DReport() / print2DReport() / close2DReport()
     get2DReportPayload()    → données du rapport (JSON)
   ===================================================================== */
(function(){
'use strict';

var REPORT_W = 960;
var REPORT_H = 540;
var lastViewStats = [];
var VIEW_DEFS = [
  {id:'front', label:'viewFront', fallback:'Avant', axis:'x', sign:-1},
  {id:'top',   label:'viewTop', fallback:'Dessus', axis:'y', sign:1},
  {id:'rear',  label:'viewRear', fallback:'Arrière', axis:'x', sign:1},
  {id:'left',  label:'viewLeft', fallback:'Côté gauche', axis:'z', sign:1},
  {id:'right', label:'viewRight', fallback:'Côté droit', axis:'z', sign:-1}
];

/* Infos d'en-tête fournies par WinDev (toutes optionnelles : une ligne vide
   à compléter à la main est imprimée quand une valeur manque). */
var INFO = {
  company:{name:'Iacolino', role:'responsable après-vente des établissements Iacolino', city:'Seraing', address:'Rue de la Boverie 448', phone:'', email:'', vat:'', logo:''},
  customer:{name:'', address:'', phone:'', email:'', licence:''},
  vehicle:{make:'', model:'', plate:'', vin:'', color:'', km:'', fuel:''},
  job:{number:'', carstock:'', date:'', agent:'', type:'', dateIn:'', dateOut:'', place:''},
  observations:'',
  title:'',
  reference:'',
  intro:'',          // phrase d'introduction (%name %role %city %address)
  commitment:'',     // phrase avant l'encadré des dégâts
  clauses:[],        // clauses a) b) c)… affichées sous la liste des dégâts (optionnel)
  place:'',          // « Fait à … » (défaut : company.city)
  copies:2,
  time:'',
  returnSection:true // encadré « Retour du véhicule »
};
var PHOTOS = {}; // damageId → [{path, src}]

function tr(key, fallback){
  try {
    var value = t(key);
    return value && value !== key ? value : fallback;
  } catch(e) { return fallback; }
}

function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function validDamages(){
  return damages.filter(function(d){ return d && d.damageTypes && d.damageTypes.length; });
}

function currentVehicleLabel(){
  var v = VEHICLES.find(function(x){ return x.id === currentVehicleId; });
  return v ? v.label : currentVehicleId;
}

function worldPosition(d){
  if (!carGroup) return new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0);
  carGroup.updateMatrixWorld(true);
  return carGroup.localToWorld(new THREE.Vector3(+d.x || 0, +d.y || 0, +d.z || 0));
}

function visibleFromView(d, def, center){
  if (def.id === 'top') return true;
  var p = worldPosition(d);
  if (def.axis === 'z') return def.sign > 0 ? p.z >= center.z : p.z < center.z;
  if (def.axis === 'x') return def.sign > 0 ? p.x >= center.x : p.x < center.x;
  return true;
}

/* Zone textuelle du dégât (avant / arrière / gauche / droite, haut / bas) */
function zoneLabel(d, box){
  var p = worldPosition(d); var c = box.getCenter(new THREE.Vector3()); var s = box.getSize(new THREE.Vector3());
  var parts = [];
  var dz = (p.z - c.z) / (s.z || 1), dx = (p.x - c.x) / (s.x || 1), dy = (p.y - c.y) / (s.y || 1);
  if (dx < -0.2) parts.push(tr('viewFront','Avant')); else if (dx > 0.2) parts.push(tr('viewRear','Arrière'));
  if (dz > 0.15) parts.push(tr('zoneLeft','gauche')); else if (dz < -0.15) parts.push(tr('zoneRight','droite'));
  if (dy > 0.25) parts.push(tr('zoneTop','haut')); else if (dy < -0.25) parts.push(tr('zoneBottom','bas'));
  return parts.length ? parts.join(' · ') : tr('zoneCenter','centre');
}

function makeCamera(def, box, aspect){
  var size = box.getSize(new THREE.Vector3());
  var center = box.getCenter(new THREE.Vector3());
  var naturalW = def.axis === 'x' ? size.z : size.x;
  var naturalH = def.id === 'top' ? size.z : size.y;
  naturalW = Math.max(naturalW * 1.22, 0.5);
  naturalH = Math.max(naturalH * 1.22, 0.5);
  if (naturalW / naturalH > aspect) naturalH = naturalW / aspect;
  else naturalW = naturalH * aspect;

  var dist = Math.max(size.x,size.y,size.z) * 5 + 5;
  var cam = new THREE.OrthographicCamera(
    -naturalW/2, naturalW/2, naturalH/2, -naturalH/2, 0.01, dist*3
  );

  if (def.axis === 'z') {
    cam.position.set(center.x, center.y, center.z + def.sign * dist);
    cam.up.set(0,1,0);
  } else if (def.axis === 'x') {
    cam.position.set(center.x + def.sign * dist, center.y, center.z);
    cam.up.set(0,1,0);
  } else {
    cam.position.set(center.x, center.y + dist, center.z);
    cam.up.set(0,0,-1);
  }
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return cam;
}

function drawDamageMarker(ctx, d, camera){
  var p = worldPosition(d).project(camera);
  if (p.z < -1 || p.z > 1) return;
  var x = (p.x * 0.5 + 0.5) * REPORT_W;
  var y = (-p.y * 0.5 + 0.5) * REPORT_H;
  var g = GRAVITIES.find(function(xg){ return xg.id === d.gravity; }) || GRAVITIES[1];
  var dir = (d.damageId % 2 === 0) ? 1 : -1;
  var lx = Math.max(16, Math.min(REPORT_W - 16, x + dir * 28));
  var ly = Math.max(16, Math.min(REPORT_H - 16, y - 28));

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,28,38,.75)';
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(lx,ly);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x,y,4,0,Math.PI*2);
  ctx.fillStyle = '#1b2430';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(lx,ly,13,0,Math.PI*2);
  ctx.fillStyle = g.color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 13px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(d.damageId),lx,ly+0.5);
  ctx.restore();
}

function captureView(def, box, items){
  var off = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
  off.setPixelRatio(1);
  off.setSize(REPORT_W,REPORT_H,false);
  off.outputEncoding = THREE.sRGBEncoding;
  off.setClearColor(0xffffff,1);

  var camera2D = makeCamera(def,box,REPORT_W/REPORT_H);
  var oldMarkerVisible = markerGroup.visible;
  markerGroup.visible = false;
  off.render(scene,camera2D);
  markerGroup.visible = oldMarkerVisible;

  var canvas = document.createElement('canvas');
  canvas.width = REPORT_W; canvas.height = REPORT_H;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(off.domElement,0,0,REPORT_W,REPORT_H);

  var center = box.getCenter(new THREE.Vector3());
  var shown = items.filter(function(d){ return visibleFromView(d,def,center); });
  shown.forEach(function(d){ drawDamageMarker(ctx,d,camera2D); });

  var url = canvas.toDataURL('image/png');
  off.dispose();
  if (typeof off.forceContextLoss === 'function') off.forceContextLoss();
  return {url:url,count:shown.length,ids:shown.map(function(d){return d.damageId;})};
}

/* ------------------------------------------------------------------
   Gabarit du document — calqué sur l'« Attestation de mise à disposition
   d'un véhicule » du garage : titre centré, phrase d'introduction, liste
   de champs, encadré (texte à gauche / vue du dessus à droite), remarques,
   « Fait à …, en 2 exemplaires le … », signatures, encadré « Retour du
   véhicule », puis les photos en page suivante.
   ------------------------------------------------------------------ */
function fill(tpl, map){
  return String(tpl).replace(/%(\w+)/g, function(m, k){ return map[k] != null ? escapeHtml(map[k]) : m; });
}
function dottedLines(n){
  var out = '';
  for (var i = 0; i < n; i++) out += '<div class="rp-dotline"></div>';
  return out;
}
function fieldRow(label, value){
  return '<tr><td class="rp-fl">' + escapeHtml(label) + '</td><td class="rp-fv">' + (value ? escapeHtml(value) : '<span class="rp-blank"></span>') + '</td></tr>';
}

function ensureOverlay(){
  var existing = document.getElementById('report2DOverlay');
  if (existing) return existing;
  var overlay = document.createElement('div');
  overlay.id = 'report2DOverlay';
  overlay.innerHTML =
    '<div class="report2d-shell">' +
      '<div class="report2d-toolbar">' +
        '<span class="report2d-toolbar-hint" id="report2DHint"></span>' +
        '<button id="report2DRefresh"></button>' +
        '<button id="report2DClose"></button>' +
        '<button class="primary" id="report2DPrint"></button>' +
      '</div>' +
      '<div class="report2d-paper" id="report2DPaper"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('report2DClose').onclick = close2DReport;
  document.getElementById('report2DRefresh').onclick = refresh2DReport;
  document.getElementById('report2DPrint').onclick = print2DReport;
  return overlay;
}

function applyToolbarTexts(){
  document.getElementById('report2DRefresh').textContent = tr('reportRefresh','Actualiser');
  document.getElementById('report2DClose').textContent = tr('reportClose','Fermer');
  document.getElementById('report2DPrint').textContent = tr('reportPrint','Imprimer');
  document.getElementById('report2DHint').textContent = tr('reportHint','Aperçu A4 — « Imprimer » ouvre la boîte de dialogue (choisir « Enregistrer en PDF » pour un fichier).');
}

function formatDate(value){
  if (!value) return '';
  var d = (value instanceof Date) ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  var locale = typeof _urlLang !== 'undefined' ? _urlLang : undefined;
  return d.toLocaleDateString(locale, {day:'2-digit',month:'2-digit',year:'numeric'});
}
function formatTime(d){
  var locale = typeof _urlLang !== 'undefined' ? _urlLang : undefined;
  return d.toLocaleTimeString(locale, {hour:'2-digit',minute:'2-digit'});
}

function headerHtml(){
  var c = INFO.company, cu = INFO.customer, v = INFO.vehicle, j = INFO.job;
  var jobNo = j.number || window.__ctxJob || '';
  var carstock = j.carstock || window.__ctxCarstock || '';
  var intro = fill(INFO.intro || tr('reportIntro','Je, soussigné garage %name, %role sis à %city au %address, certifie avoir constaté, en présence du client, l’état du véhicule décrit ci-dessous :'),
    {name:c.name, role:c.role, city:c.city, address:c.address});
  return (
    (c.logo ? '<img class="rp-logo" src="' + escapeHtml(c.logo) + '" alt="">' : '') +
    '<h1 class="rp-title">' + escapeHtml(INFO.title || tr('reportTitle','État des lieux des dégâts du véhicule :')) + '</h1>' +
    '<p class="rp-intro">' + intro + '</p>' +
    '<table class="rp-fields">' +
      fieldRow(tr('reportFieldCustomer','De Mr et/ou Mme'), cu.name) +
      fieldRow(tr('reportFieldVehicle','Le véhicule'), [v.make, v.model].filter(Boolean).join(' ') || currentVehicleLabel()) +
      fieldRow(tr('reportFieldVin','Châssis n°'), v.vin) +
      fieldRow(tr('reportFieldPlate','Immatriculé'), v.plate) +
      fieldRow(tr('reportFieldKm','Kilométrage'), v.km ? (/^[\d\s.,]+$/.test(String(v.km).replace(/\s*km$/i,'')) ? String(v.km).replace(/\s*km$/i,'') + ' km' : String(v.km)) : '') +
      fieldRow(tr('reportFieldFuel','Niveau carburant'), v.fuel) +
      fieldRow(tr('reportFieldFile','Dossier (OR / véhicule n°)'), [jobNo, carstock].filter(Boolean).join(' / ')) +
    '</table>' +
    '<p class="rp-intro">' + escapeHtml(INFO.commitment || tr('reportCommitment','Par signature de la présente, le client reconnaît l’exactitude des dégâts relevés ci-dessous ; tout dégât non mentionné est réputé absent au moment de la prise en charge :')) + '</p>'
  );
}

function damageLine(d, box){
  var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
  var types = d.damageTypes.map(function(tp){return tp.name;}).join(', ');
  var memo = typeof stripModelTag === 'function' ? stripModelTag(d.memo || '') : (d.memo || '');
  var n = (PHOTOS[d.damageId] || (d.images || [])).length;
  return '<li><span class="rp-num" style="background:' + grav.color + '">' + escapeHtml(d.damageId) + '</span>' +
    '<span class="rp-dl"><b>' + escapeHtml(zoneLabel(d, box)) + ' — ' + escapeHtml(types) + '</b> (' + escapeHtml(gravName(d.gravity)) + ')' +
    (memo ? ' : ' + escapeHtml(memo) : '') + (n ? ' <span class="rp-dl-photos">📷 ' + n + '</span>' : '') + '</span></li>';
}

function viewsHtml(box, items){
  lastViewStats = [];
  var shots = {};
  VIEW_DEFS.forEach(function(def){
    var shot = captureView(def,box,items);
    shots[def.id] = shot;
    lastViewStats.push({id:def.id,count:shot.count,ids:shot.ids});
  });
  var list = items.length
    ? '<ol class="rp-dlist">' + items.map(function(d){ return damageLine(d, box); }).join('') + '</ol>'
    : '<p class="rp-empty">' + escapeHtml(tr('reportNoDamage','Aucun dégât constaté.')) + '</p>';
  var clauses = (INFO.clauses && INFO.clauses.length)
    ? '<ol class="rp-clauses">' + INFO.clauses.map(function(cl){ return '<li>' + escapeHtml(cl) + '</li>'; }).join('') + '</ol>'
    : '';
  var small = ['front','rear','left','right'].map(function(id){
    var def = VIEW_DEFS.find(function(x){ return x.id === id; });
    return '<figure class="rp-view"><img alt="' + escapeHtml(tr(def.label,def.fallback)) + '" src="' + shots[id].url + '"><figcaption>' + escapeHtml(tr(def.label,def.fallback)) + '</figcaption></figure>';
  }).join('');
  var legend = GRAVITIES.map(function(g){
    return '<span><i class="rp-dot" style="background:' + g.color + '"></i>' + escapeHtml(gravName(g.id)) + '</span>';
  }).join('');
  return '<table class="rp-box"><tr>' +
      '<td class="rp-box-text">' +
        '<div class="rp-box-title">' + escapeHtml(tr('reportDamagesBoxTitle','Dégâts constatés')) + ' (' + items.length + ')</div>' +
        list + clauses +
      '</td>' +
      '<td class="rp-box-view"><img alt="' + escapeHtml(tr('viewTop','Dessus')) + '" src="' + shots.top.url + '"><div class="rp-box-cap">' + escapeHtml(tr('viewTop','Dessus')) + '</div></td>' +
    '</tr></table>' +
    '<div class="rp-views-row">' + small + '</div>' +
    '<div class="rp-legend">' + legend + '</div>';
}

function photosHtml(items){
  var cards = [];
  items.forEach(function(d){
    var list = PHOTOS[d.damageId] || (d.images || []);
    if (!list.length) return;
    var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
    var types = d.damageTypes.map(function(tp){return tp.name;}).join(', ');
    list.forEach(function(ph, i){
      var src = ph.src || (/^(https?:|data:|blob:)/.test(ph.path || '') ? ph.path : '');
      cards.push('<figure class="rp-photo">' +
        (src ? '<img src="' + escapeHtml(src) + '" alt="">' : '<div class="rp-photo-missing">' + escapeHtml(tr('reportPhotoMissing','Photo non transmise')) + '<small>' + escapeHtml(ph.path || '') + '</small></div>') +
        '<figcaption><span class="rp-num" style="background:' + grav.color + '">' + escapeHtml(d.damageId) + '</span> ' + escapeHtml(types) + (list.length > 1 ? ' <span class="rp-photo-idx">' + (i+1) + '/' + list.length + '</span>' : '') + '</figcaption>' +
      '</figure>');
    });
  });
  if (!cards.length) return '';
  var c = INFO.company, j = INFO.job;
  var ref = [j.number || window.__ctxJob, INFO.vehicle.plate].filter(Boolean).join(' · ');
  return '<section class="rp-photos-section">' +
    '<h2 class="rp-title rp-title-sm">' + escapeHtml(tr('reportPhotosTitle','Photos des dégâts')) + (ref ? ' — ' + escapeHtml(ref) : '') + '</h2>' +
    '<div class="rp-photos">' + cards.join('') + '</div>' +
  '</section>';
}

function footerHtml(){
  var c = INFO.company; var now = new Date();
  var made = fill(tr('reportMadeAt','Fait à %place, en %n exemplaires le %date, à %time'),
    {place: INFO.place || c.city, n: INFO.copies || 2, date: formatDate(INFO.job.date) || formatDate(now), time: INFO.time || formatTime(now)});
  var remarks = INFO.observations ? '<div class="rp-remarks-text">' + escapeHtml(INFO.observations) + '</div>' + dottedLines(1) : dottedLines(2);
  var ret = INFO.returnSection === false ? '' :
    '<table class="rp-box rp-return"><tr>' +
      '<td class="rp-box-text">' +
        '<div class="rp-box-title rp-center">' + escapeHtml(tr('reportReturnTitle','Retour du véhicule')) + '</div>' +
        '<p class="rp-return-line">' + escapeHtml(tr('reportReturnDate','Le')) + ' <span class="rp-dots">….</span> / <span class="rp-dots">….</span> / <span class="rp-dots">….</span> &nbsp; ' + escapeHtml(tr('reportAt','à')) + ' <span class="rp-dots">….</span> h <span class="rp-dots">….</span></p>' +
        '<p class="rp-return-line">' + escapeHtml(tr('reportReturnKm','Kilométrage :')) + '</p>' +
        '<p class="rp-return-line">' + escapeHtml(tr('reportRemarks','Remarques :')) + '</p>' + dottedLines(1) +
        '<p class="rp-return-line rp-sign-label">' + escapeHtml(tr('reportSignatures','Signatures')) + '</p>' +
        '<div class="rp-sign-row"><span>' + escapeHtml(tr('reportTheGarage','Le garage')) + '</span><span>' + escapeHtml(tr('reportTheCustomer','Le client')) + '</span></div>' +
        '<div class="rp-sign-space"></div>' +
      '</td>' +
      '<td class="rp-box-view"><img alt="" src="' + (lastTopUrl || '') + '"><div class="rp-box-cap">' + escapeHtml(tr('reportReturnDiagram','Nouveaux dégâts au retour')) + '</div></td>' +
    '</tr></table>';
  return '<p class="rp-remarks"><u>' + escapeHtml(tr('reportRemarks','Remarques :')) + '</u></p>' + remarks +
    '<p class="rp-made">' + made + '</p>' +
    '<div class="rp-sign-row rp-sign-main"><span>' + fill(tr('reportForCompany','Pour %name'), {name:c.name}) + '</span><span>' + escapeHtml(tr('reportCustomerSignature','Signature du client')) + '</span></div>' +
    '<div class="rp-sign-space"></div>' +
    ret;
}
var lastTopUrl = '';
function render2DReport(){
  if (!carGroup || !_modelReady) return false;
  carGroup.updateMatrixWorld(true);
  var items = validDamages();
  var box = new THREE.Box3().setFromObject(carGroup);
  applyToolbarTexts();
  var views = viewsHtml(box, items);
  lastTopUrl = (lastViewStats.length && typeof captureView === 'function') ? captureView(VIEW_DEFS[1], box, []).url : '';
  document.getElementById('report2DPaper').innerHTML =
    '<div class="rp-page">' + headerHtml() + views + footerHtml() + '</div>' +
    photosHtml(items);
  return true;
}

function open2DReport(){
  ensureOverlay();
  if (!render2DReport()) {
    alert(tr('reportNotReady','Le modèle 3D n’est pas encore prêt.'));
    return false;
  }
  document.getElementById('report2DOverlay').classList.add('open');
  return true;
}

function close2DReport(){
  var overlay = document.getElementById('report2DOverlay');
  if (overlay) overlay.classList.remove('open');
}

function refresh2DReport(){
  if (!render2DReport()) alert(tr('reportNotReady','Le modèle 3D n’est pas encore prêt.'));
}

function print2DReport(){
  var overlay = ensureOverlay();
  if (!overlay.classList.contains('open') && !open2DReport()) return;
  setTimeout(function(){ window.print(); },120);
}

/* ------------------------------------------------------------------
   Hooks WinDev
   ------------------------------------------------------------------ */
function merge(target, src){
  Object.keys(src || {}).forEach(function(k){
    if (src[k] && typeof src[k] === 'object' && target[k] && typeof target[k] === 'object') merge(target[k], src[k]);
    else if (src[k] !== undefined && src[k] !== null) target[k] = src[k];
  });
}

/* setRapportInfos({company:{…}, customer:{…}, vehicle:{…}, job:{…}, observations, title})
   Accepte aussi des clés plates : plate, vin, km, fuel, customerName, customerAddress,
   customerPhone, customerEmail, companyName, companyAddress, agent, dateIn, dateOut… */
window.setRapportInfos = function(json){
  try {
    var o = typeof json === 'string' ? JSON.parse(json) : (json || {});
    var flat = {
      company:{name:o.companyName, role:o.companyRole, city:o.companyCity, address:o.companyAddress, phone:o.companyPhone, email:o.companyEmail, vat:o.companyVat, logo:o.companyLogo},
      customer:{name:o.customerName, address:o.customerAddress, phone:o.customerPhone, email:o.customerEmail, licence:o.customerLicence},
      vehicle:{make:o.make, model:o.model, plate:o.plate, vin:o.vin, color:o.color, km:o.km, fuel:o.fuel},
      job:{number:o.jobNumber, carstock:o.carstock, date:o.date, agent:o.agent, type:o.jobType, dateIn:o.dateIn, dateOut:o.dateOut, place:o.place},
      observations:o.observations, title:o.title, reference:o.reference,
      intro:o.intro, commitment:o.commitment, clauses:o.clauses, place:o.place, copies:o.copies, time:o.time, returnSection:o.returnSection
    };
    merge(INFO, flat);
    merge(INFO, {company:o.company, customer:o.customer, vehicle:o.vehicle, job:o.job});
    var overlay = document.getElementById('report2DOverlay');
    if (overlay && overlay.classList.contains('open')) render2DReport();
    return 'OK';
  } catch(e) { console.error('setRapportInfos', e); return 'ERR:' + e.message; }
};

/* chargerPhotos([{damage_id, path, src}]) — src = data:image/jpeg;base64,… ou URL http(s).
   Remplace les photos connues des dégâts cités ; chargerPhotos([]) ne change rien. */
window.chargerPhotos = function(json){
  try {
    var arr = typeof json === 'string' ? JSON.parse(json) : (json || []);
    var byId = {};
    (arr || []).forEach(function(p){
      var id = +(p.damage_id || p.damageId); if (!id) return;
      var src = p.src || p.dataUrl || '';
      if (src && !/^(data:|https?:|blob:)/.test(src)) src = 'data:image/jpeg;base64,' + src.replace(/\s+/g,'');
      (byId[id] = byId[id] || []).push({path:p.path || '', src:src});
    });
    Object.keys(byId).forEach(function(id){ PHOTOS[id] = byId[id]; });
    var overlay = document.getElementById('report2DOverlay');
    if (overlay && overlay.classList.contains('open')) render2DReport();
    return 'OK:' + Object.keys(byId).length;
  } catch(e) { console.error('chargerPhotos', e); return 'ERR:' + e.message; }
};
window.viderPhotosRapport = function(){ PHOTOS = {}; return 'OK'; };

window.open2DReport = open2DReport;
window.close2DReport = close2DReport;
window.refresh2DReport = refresh2DReport;
window.print2DReport = print2DReport;
window.ouvrirRapport = open2DReport;
window.imprimerRapport = print2DReport;
window.get2DReportPayload = function(){
  return {
    version: window.__version,
    carstock: window.__ctxCarstock,
    job: window.__ctxJob,
    model: window.__ctxModel,
    vehicleId: currentVehicleId,
    infos: INFO,
    damages: validDamages().map(damageToRow),
    photos: Object.keys(PHOTOS).map(function(id){ return {damage_id:+id, count:PHOTOS[id].length}; })
  };
};
window.__report2DDiag = function(){
  var overlay = document.getElementById('report2DOverlay');
  return {
    available:true,
    modelReady:!!_modelReady,
    overlayOpen:!!(overlay && overlay.classList.contains('open')),
    vehicleId:currentVehicleId,
    damageCount:validDamages().length,
    photoCount:Object.keys(PHOTOS).reduce(function(n,k){ return n + PHOTOS[k].length; },0),
    views:lastViewStats.slice(),
    tableRows:document.querySelectorAll('.rp-dlist li').length
  };
};

function initReportButton(){
  var btn = document.getElementById('btnReport2D');
  if (btn) {
    btn.textContent = tr('btnReport2D','Rapport');
    btn.title = tr('reportTitle','Rapport des dégâts');
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initReportButton);
else initReportButton();
})();
