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
  company:{name:'', address:'', phone:'', email:'', vat:'', logo:''},
  customer:{name:'', address:'', phone:'', email:'', licence:''},
  vehicle:{make:'', model:'', plate:'', vin:'', color:'', km:'', fuel:''},
  job:{number:'', carstock:'', date:'', agent:'', type:'', dateIn:'', dateOut:'', place:''},
  observations:'',
  title:'',
  reference:''
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
   Gabarit du document
   ------------------------------------------------------------------ */
function field(label, value, cls){
  return '<div class="rp-field' + (cls ? ' ' + cls : '') + '"><span class="rp-field-label">' + escapeHtml(label) + '</span>' +
    '<span class="rp-field-value' + (value ? '' : ' blank') + '">' + (value ? escapeHtml(value) : '&nbsp;') + '</span></div>';
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

function headerHtml(){
  var c = INFO.company, cu = INFO.customer, v = INFO.vehicle, j = INFO.job;
  var jobNo = j.number || window.__ctxJob || '';
  var carstock = j.carstock || window.__ctxCarstock || '';
  var reference = INFO.reference || ((jobNo ? 'OR ' + jobNo : '') + (carstock ? (jobNo ? ' · ' : '') + tr('reportCarstock','Véhicule') + ' ' + carstock : ''));
  var now = new Date();
  var locale = typeof _urlLang !== 'undefined' ? _urlLang : undefined;
  return (
    '<header class="rp-head">' +
      '<div class="rp-company">' +
        (c.logo ? '<img class="rp-logo" src="' + escapeHtml(c.logo) + '" alt="">' : '') +
        '<div class="rp-company-name">' + escapeHtml(c.name || tr('reportCompanyPlaceholder','[Nom du garage / société]')) + '</div>' +
        '<div class="rp-company-lines">' + [c.address, c.phone, c.email, c.vat].filter(Boolean).map(escapeHtml).join('<br>') + '</div>' +
      '</div>' +
      '<div class="rp-title-block">' +
        '<div class="rp-doc-kicker">' + escapeHtml(tr('reportKicker','État des lieux du véhicule')) + '</div>' +
        '<h1 class="rp-title">' + escapeHtml(INFO.title || tr('reportTitle','Rapport des dégâts')) + '</h1>' +
        '<div class="rp-ref">' + escapeHtml(reference || '') + '</div>' +
        '<div class="rp-generated">' + escapeHtml(tr('reportGenerated','Généré le')) + ' ' + escapeHtml(now.toLocaleDateString(locale) + ' ' + now.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})) + '</div>' +
      '</div>' +
    '</header>' +
    '<section class="rp-parties">' +
      '<div class="rp-box">' +
        '<h2>' + escapeHtml(tr('reportVehicle','Véhicule')) + '</h2>' +
        field(tr('reportMakeModel','Marque / modèle'), [v.make, v.model].filter(Boolean).join(' ') || currentVehicleLabel()) +
        field(tr('reportPlate','Immatriculation'), v.plate) +
        field(tr('reportVin','N° de châssis (VIN)'), v.vin) +
        field(tr('reportColor','Couleur'), v.color) +
        '<div class="rp-field-row">' + field(tr('reportKm','Kilométrage'), v.km ? v.km + ' km' : '') + field(tr('reportFuel','Carburant'), v.fuel) + '</div>' +
        field(tr('reportCarstock','Véhicule') + ' n°', carstock) +
      '</div>' +
      '<div class="rp-box">' +
        '<h2>' + escapeHtml(tr('reportCustomer','Client')) + '</h2>' +
        field(tr('reportName','Nom'), cu.name) +
        field(tr('reportAddress','Adresse'), cu.address) +
        '<div class="rp-field-row">' + field(tr('reportPhone','Téléphone'), cu.phone) + field(tr('reportEmail','E-mail'), cu.email) + '</div>' +
        field(tr('reportLicence','Permis n°'), cu.licence) +
        '<h2 class="rp-sub">' + escapeHtml(tr('reportJobTitle','Intervention')) + '</h2>' +
        '<div class="rp-field-row">' + field(tr('reportJob','OR') + ' n°', jobNo) + field(tr('reportDate','Date'), formatDate(j.date) || formatDate(now)) + '</div>' +
        '<div class="rp-field-row">' + field(tr('reportDateIn','Entrée'), formatDate(j.dateIn)) + field(tr('reportDateOut','Sortie'), formatDate(j.dateOut)) + '</div>' +
        '<div class="rp-field-row">' + field(tr('reportAgent','Réceptionné par'), j.agent) + field(tr('reportJobType','Type'), j.type) + '</div>' +
      '</div>' +
    '</section>'
  );
}

function viewsHtml(box, items){
  lastViewStats = [];
  var cards = VIEW_DEFS.map(function(def){
    var shot = captureView(def,box,items);
    lastViewStats.push({id:def.id,count:shot.count,ids:shot.ids});
    return '<figure class="rp-view rp-view-' + def.id + '">' +
      '<img alt="' + escapeHtml(tr(def.label,def.fallback)) + '" src="' + shot.url + '">' +
      '<figcaption><span>' + escapeHtml(tr(def.label,def.fallback)) + '</span><span class="rp-view-count">' + shot.count + ' ' + escapeHtml(tr('reportMarkers','dégât(s) visible(s)')) + '</span></figcaption>' +
    '</figure>';
  }).join('');
  var legend = GRAVITIES.map(function(g){
    return '<span><i class="rp-dot" style="background:' + g.color + '"></i>' + escapeHtml(gravName(g.id)) + '</span>';
  }).join('');
  return '<section class="rp-section rp-views">' +
    '<h2 class="rp-h">' + escapeHtml(tr('reportViewsTitle','État du véhicule')) + '<span class="rp-h-right">' + items.length + ' ' + escapeHtml(tr('reportDamagesCount','dégât(s) relevé(s)')) + '</span></h2>' +
    '<div class="rp-views-grid">' + cards + '</div>' +
    '<div class="rp-legend"><span class="rp-legend-title">' + escapeHtml(tr('reportSeverity','Gravité')) + ' :</span>' + legend + '</div>' +
  '</section>';
}

function tableHtml(items, box){
  var rows;
  if (!items.length) {
    rows = '<tr><td colspan="6" class="rp-empty">' + escapeHtml(tr('reportNoDamage','Aucun dégât enregistré')) + '</td></tr>';
  } else {
    rows = items.map(function(d){
      var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
      var types = d.damageTypes.map(function(tp){return tp.name;}).join(', ');
      var memo = typeof stripModelTag === 'function' ? stripModelTag(d.memo || '') : (d.memo || '');
      var n = (PHOTOS[d.damageId] || (d.images || [])).length;
      return '<tr>' +
        '<td class="num"><span class="rp-num" style="background:' + grav.color + '">' + escapeHtml(d.damageId) + '</span></td>' +
        '<td>' + escapeHtml(zoneLabel(d, box)) + '</td>' +
        '<td>' + escapeHtml(types) + '</td>' +
        '<td class="sev"><i class="rp-dot" style="background:' + grav.color + '"></i>' + escapeHtml(gravName(d.gravity)) + '</td>' +
        '<td>' + escapeHtml(memo) + '</td>' +
        '<td class="num">' + (n ? n : '–') + '</td>' +
      '</tr>';
    }).join('');
  }
  return '<section class="rp-section">' +
    '<h2 class="rp-h">' + escapeHtml(tr('reportSummary','Relevé des dégâts')) + '</h2>' +
    '<table class="rp-table"><thead><tr>' +
      '<th>#</th><th>' + escapeHtml(tr('reportZone','Zone')) + '</th><th>' + escapeHtml(tr('reportTypes','Type(s)')) + '</th>' +
      '<th>' + escapeHtml(tr('reportSeverity','Gravité')) + '</th><th>' + escapeHtml(tr('reportMemo','Observation')) + '</th><th>' + escapeHtml(tr('reportPhotos','Photos')) + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
  '</section>';
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
  return '<section class="rp-section rp-photos-section">' +
    '<h2 class="rp-h">' + escapeHtml(tr('reportPhotosTitle','Photos des dégâts')) + '</h2>' +
    '<div class="rp-photos">' + cards.join('') + '</div>' +
  '</section>';
}

function footerHtml(){
  return '<section class="rp-section rp-obs">' +
    '<h2 class="rp-h">' + escapeHtml(tr('reportObservations','Observations')) + '</h2>' +
    '<div class="rp-obs-box">' + (INFO.observations ? escapeHtml(INFO.observations) : '') + '</div>' +
  '</section>' +
  '<section class="rp-signatures">' +
    '<div class="rp-sign"><div class="rp-sign-title">' + escapeHtml(tr('reportSignCompany','Pour le garage')) + '</div><div class="rp-sign-sub">' + escapeHtml(tr('reportSignName','Nom, date et signature')) + '</div><div class="rp-sign-area"></div></div>' +
    '<div class="rp-sign"><div class="rp-sign-title">' + escapeHtml(tr('reportSignCustomer','Le client')) + '</div><div class="rp-sign-sub">' + escapeHtml(tr('reportSignApproved','« Lu et approuvé », date et signature')) + '</div><div class="rp-sign-area"></div></div>' +
  '</section>' +
  '<footer class="rp-foot">' + escapeHtml(tr('reportFootnote','Le présent document constate l\'état de la carrosserie au moment de la prise en charge. Les dégâts non mentionnés sont réputés absents. Les positions sont relevées sur le modèle 3D du véhicule.')) + '</footer>';
}

function render2DReport(){
  if (!carGroup || !_modelReady) return false;
  carGroup.updateMatrixWorld(true);
  var items = validDamages();
  var box = new THREE.Box3().setFromObject(carGroup);
  applyToolbarTexts();
  document.getElementById('report2DPaper').innerHTML =
    '<div class="rp-page">' + headerHtml() + viewsHtml(box, items) + tableHtml(items, box) + footerHtml() + '</div>' +
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
      company:{name:o.companyName, address:o.companyAddress, phone:o.companyPhone, email:o.companyEmail, vat:o.companyVat, logo:o.companyLogo},
      customer:{name:o.customerName, address:o.customerAddress, phone:o.customerPhone, email:o.customerEmail, licence:o.customerLicence},
      vehicle:{make:o.make, model:o.model, plate:o.plate, vin:o.vin, color:o.color, km:o.km, fuel:o.fuel},
      job:{number:o.jobNumber, carstock:o.carstock, date:o.date, agent:o.agent, type:o.jobType, dateIn:o.dateIn, dateOut:o.dateOut, place:o.place},
      observations:o.observations, title:o.title, reference:o.reference
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
    tableRows:document.querySelectorAll('.rp-table tbody tr').length
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
