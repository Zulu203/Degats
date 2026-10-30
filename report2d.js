/* =====================================================================
   Contrat de mise à disposition d'un véhicule de remplacement, avec l'état
   du véhicule relevé sur le modèle 3D (Belgique / Benelux). Fusion des
   modèles Iacolino (Seraing) et Peerlings (Pelt). Dérivé de la scène 3D,
   sans modifier le workflow WinDev.

   Hooks WinDev :
     setRapportInfos(json)   → garage, client, véhicule, prêt, tarifs, textes
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
  company:{name:'Iacolino', city:'Seraing', zip:'', address:'Rue de la Boverie 448', phone:'', email:'', vat:'', logo:''},
  customer:{name:'', address:'', phone:'', mobile:'', email:'', licence:''},
  vehicle:{make:'', model:'', version:'', plate:'', vin:'', fuelType:'', km:'', fuel:''},
  job:{number:'', carstock:'', date:''},
  loan:{fromDate:'', fromTime:'', toDate:'', toTime:'', km:'', fuel:''}, // départ et retour prévu
  terms:{cleaningFee:null, deductible:null, fuelPrice:null, kmPerDay:null, dailyRate:null, customerRate:null},
                     // montants des conditions générales : vide = « …… » à compléter, false = clause retirée
  observations:'',   // remarque libre au départ
  title:'',
  clauses:null,      // null = conditions générales par défaut (traductions) ; tableau ou texte
                     // (1 clause par ligne, %clean %deductible %fuel %km %rate %custrate) ; false = masquées
  place:'',          // « Fait à … » (défaut : company.city)
  copies:2
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
   Gabarit du document — contrat de mise à disposition d'un véhicule de
   remplacement, fusion des modèles Iacolino (Seraing) et Peerlings (Pelt) :
   page 1 = contrat (garage, client, véhicule, état au départ / au retour,
   conditions générales, départ / retour, signatures) ;
   page 2 = annexe (5 vues, relevé détaillé des dégâts, photos).
   ------------------------------------------------------------------ */
var DOTS = '……………';
function fill(tpl, map){
  return String(tpl).replace(/%(\w+)/g, function(m, k){ return map[k] != null ? escapeHtml(map[k]) : m; });
}
function dottedLines(n){
  var out = '';
  for (var i = 0; i < n; i++) out += '<div class="rp-dotline"></div>';
  return out;
}
function val(v){ return (v === undefined || v === null || v === '') ? '' : String(v); }
function cell(v){ return val(v) ? escapeHtml(v) : '<span class="rp-blank"></span>'; }
function row(label, value){
  return '<tr><th>' + escapeHtml(label) + '</th><td>' + cell(value) + '</td></tr>';
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
function kmText(v){
  v = val(v); if (!v) return '';
  var n = v.replace(/\s*km$/i,'');
  return /^[\d\s.,]+$/.test(n) ? n + ' km' : v;
}

/* ---------- conditions générales communes (Belgique / Benelux) ---------- */
var DEFAULT_CLAUSES_FR = 'Le client reconnaît avoir examiné le véhicule, qui lui est remis propre intérieur et extérieur, en bon état de fonctionnement, de carrosserie et d’entretien, sauf les dégâts relevés ci-dessus. Il s’engage à l’utiliser en personne prudente et raisonnable et à le restituer dans le même état.|Le véhicule doit être restitué propre intérieur et extérieur ; à défaut, un forfait de nettoyage de %clean € TVAC sera facturé.|Le véhicule reste sous la responsabilité du client jusqu’à sa restitution au garage.|En cas d’accident ou de dégât, le conducteur remplit un constat européen d’accident et le remet au garage. Tout dégât seul, en tort ou causé par une partie inconnue est à la charge du client, à concurrence d’une franchise de %deductible €.|Toute infraction au code de la route (amendes, procès-verbaux) est à la charge du client.|Le carburant est à la charge du client. Le véhicule doit être restitué avec le même niveau de carburant qu’au départ ; le carburant manquant sera facturé %fuel € par litre (ticket de remplissage faisant preuve).|Il est interdit de fumer, boire ou manger dans le véhicule.|Le kilométrage est limité à %km km par jour.|Le prix normal d’un véhicule de remplacement est de %rate € TVAC par jour ; le client paie %custrate € par jour pour la période indiquée ci-dessous.|La remise et la reprise du véhicule se font avec un responsable du garage, pendant les heures d’ouverture. Le client prévient le garage à temps si le véhicule ne peut pas être restitué à la date prévue.|En cas de litige, les tribunaux du siège du garage sont compétents, sans préjudice des règles impératives de protection du consommateur.';
var TERM_KEYS = {clean:'cleaningFee', deductible:'deductible', fuel:'fuelPrice', km:'kmPerDay', rate:'dailyRate', custrate:'customerRate'};
function getClauses(){
  var c = INFO.clauses;
  if (c === false) return [];
  if (typeof c === 'string') c = c.split(/\r?\n|\|/);
  if (!Array.isArray(c)) c = tr('reportClauses', DEFAULT_CLAUSES_FR).split('|');
  var terms = INFO.terms || {};
  var out = [];
  c.forEach(function(x){
    x = String(x).trim(); if (!x) return;
    var skip = false;
    var html = escapeHtml(x).replace(/%(\w+)/g, function(m, k){
      if (!TERM_KEYS[k]) return m;
      var v = terms[TERM_KEYS[k]];
      if (v === false) { skip = true; return ''; }
      return (v === undefined || v === null || v === '') ? '<span class="rp-fillin">' + DOTS + '</span>' : '<b>' + escapeHtml(v) + '</b>';
    });
    if (!skip) out.push(html);
  });
  return out;
}

/* ---------- page 1 : contrat ---------- */
function headerHtml(){
  var c = INFO.company, j = INFO.job;
  var jobNo = val(j.number) || val(window.__ctxJob || '');
  var carstock = val(j.carstock) || val(window.__ctxCarstock || '');
  var lines = [c.address, [c.zip, c.city].filter(Boolean).join(' '), c.phone ? tr('reportTel','Tél.') + ' ' + c.phone : '', c.email, c.vat].filter(Boolean);
  return '<table class="rp-head"><tr>' +
      '<td class="rp-head-co">' + (c.logo ? '<img class="rp-logo" src="' + escapeHtml(c.logo) + '" alt="">' : '') +
        '<div class="rp-co-name">' + escapeHtml(c.name || '') + '</div>' +
        '<div class="rp-co-lines">' + lines.map(escapeHtml).join('<br>') + '</div></td>' +
      '<td class="rp-head-ref">' +
        '<div><span>' + escapeHtml(tr('reportContractNo','Dossier')) + '</span><b>' + (jobNo ? escapeHtml(jobNo) : '<span class="rp-blank sm"></span>') + '</b></div>' +
        '<div><span>' + escapeHtml(tr('reportStockNo','Véhicule n°')) + '</span><b>' + (carstock ? escapeHtml(carstock) : '<span class="rp-blank sm"></span>') + '</b></div>' +
      '</td>' +
    '</tr><tr><td colspan="2" class="rp-titlebar">' + escapeHtml(INFO.title || tr('reportTitle','Mise à disposition d’un véhicule de remplacement')) + '</td></tr></table>';
}

function partiesHtml(){
  var cu = INFO.customer, v = INFO.vehicle;
  var phone = [cu.phone, cu.mobile].filter(Boolean).join(' / ');
  var model = [v.make, v.model, v.version].filter(Boolean).join(' ') || currentVehicleLabel();
  return '<table class="rp-parties"><tr>' +
      '<td><div class="rp-box-h">' + escapeHtml(tr('reportCustomerBox','Client')) + '</div><table class="rp-kv">' +
        row(tr('reportDriver','Conducteur'), cu.name) +
        row(tr('reportAddress','Adresse'), cu.address) +
        row(tr('reportPhone','Tél. / GSM'), phone) +
        row(tr('reportLicence','Permis de conduire'), cu.licence) +
      '</table></td>' +
      '<td><div class="rp-box-h">' + escapeHtml(tr('reportVehicleBox','Véhicule de remplacement')) + '</div><table class="rp-kv">' +
        row(tr('reportVehicleModel','Marque / modèle'), model) +
        row(tr('reportFieldVin','Châssis'), v.vin) +
        row(tr('reportFuelType','Carburant'), v.fuelType) +
        row(tr('reportFieldPlate','Immatriculation'), v.plate) +
      '</table></td>' +
    '</tr></table>';
}

function damageShort(d, box){
  var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
  var types = d.damageTypes.map(function(tp){return tp.name;}).join(', ');
  return '<li><span class="rp-num" style="background:' + grav.color + '">' + escapeHtml(d.damageId) + '</span><span>' + escapeHtml(types) + ' — ' + escapeHtml(zoneLabel(d, box)) + '</span></li>';
}

function stateHtml(box, items, shots){
  var list = items.length
    ? '<ol class="rp-slist">' + items.map(function(d){ return damageShort(d, box); }).join('') + '</ol>' +
      '<div class="rp-annex-note">' + escapeHtml(tr('reportSeeAnnex','Détail, vues et photos en annexe.')) + '</div>'
    : '<p class="rp-empty">' + escapeHtml(tr('reportNoDamage','Aucun dégât constaté.')) + '</p>';
  var presumed = '<p class="rp-presumed">' + escapeHtml(tr('reportPresumed','Le véhicule est présumé en bon état, sauf les remarques suivantes :')) + '</p>';
  var obs = INFO.observations ? '<p class="rp-obs">' + escapeHtml(INFO.observations) + '</p>' : '';
  var lines = Math.max(3, Math.min(items.length + (INFO.observations ? 1 : 0), 7));
  return '<table class="rp-state"><tr>' +
      '<td><div class="rp-state-h">' + escapeHtml(tr('reportStateOut','État du véhicule au départ')) + '</div>' +
        '<img class="rp-state-img" alt="" src="' + shots.top.url + '">' + presumed + list + obs + '</td>' +
      '<td><div class="rp-state-h">' + escapeHtml(tr('reportStateIn','État du véhicule au retour')) + '</div>' +
        '<img class="rp-state-img" alt="" src="' + (lastTopUrl || '') + '">' + presumed + dottedLines(lines) + '</td>' +
    '</tr></table>';
}

function conditionsHtml(){
  var list = getClauses();
  if (!list.length) return '';
  return '<div class="rp-cond"><div class="rp-box-h">' + escapeHtml(tr('reportConditionsTitle','Conditions générales de mise à disposition')) + '</div>' +
    '<ol class="rp-clauses">' + list.map(function(cl){ return '<li>' + cl + '</li>'; }).join('') + '</ol></div>';
}

function loanHtml(){
  var L = INFO.loan || {}, v = INFO.vehicle;
  var km = kmText(val(L.km) || val(v.km));
  var fuel = val(L.fuel) || val(v.fuel);
  var head = '<th>' + escapeHtml(tr('reportDate','Date')) + '</th><th>' + escapeHtml(tr('reportTime','Heure')) + '</th><th>' + escapeHtml(tr('reportKm','Kilométrage')) + '</th><th>' + escapeHtml(tr('reportTank','Niveau carburant')) + '</th>';
  var planned = (val(L.toDate) || val(L.toTime))
    ? fill(tr('reportPlannedReturn','Retour prévu le %date à %time'), {date: formatDate(L.toDate), time: val(L.toTime)})
    : fill(tr('reportPlannedReturn','Retour prévu le %date à %time'), {date: DOTS, time: DOTS});
  return '<table class="rp-loan"><tr><td class="rp-loan-h" colspan="4">' + escapeHtml(tr('reportDeparture','Départ')) + '</td><td class="rp-loan-h" colspan="4">' + escapeHtml(tr('reportReturn','Retour')) + '</td></tr>' +
    '<tr>' + head + head + '</tr>' +
    '<tr><td>' + cell(formatDate(L.fromDate)) + '</td><td>' + cell(L.fromTime) + '</td><td>' + cell(km) + '</td><td>' + cell(fuel) + '</td>' +
    '<td></td><td></td><td></td><td></td></tr></table>' +
    '<p class="rp-planned">' + planned + '</p>';
}

function signaturesHtml(){
  var c = INFO.company; var now = new Date();
  var made = fill(tr('reportMadeAt','Fait à %place, en %n exemplaires, le %date'),
    {place: INFO.place || c.city || DOTS, n: INFO.copies || 2, date: formatDate(INFO.job.date) || formatDate(now)});
  return '<table class="rp-sign"><tr>' +
      '<td><p>' + escapeHtml(tr('reportDeclaration','Je déclare avoir pris connaissance des conditions générales ci-dessus, les accepter et reconnaître l’état du véhicule au départ.')) + '</p>' +
        '<p class="rp-sign-who">' + escapeHtml(tr('reportBorrower','Le client (« lu et approuvé »)')) + '</p></td>' +
      '<td><p>' + made + '</p><p class="rp-sign-who">' + fill(tr('reportForCompany','Pour %name'), {name: c.name || ''}) + '</p></td>' +
    '</tr></table>';
}

/* ---------- page 2 : annexe ---------- */
function annexHtml(box, items, shots){
  var v = INFO.vehicle, j = INFO.job;
  var ref = [val(v.plate), [v.make, v.model].filter(Boolean).join(' '), val(j.number) || val(window.__ctxJob || '')].filter(Boolean).join(' · ');
  var views = VIEW_DEFS.map(function(def){
    return '<figure class="rp-view rp-view-' + def.id + '"><img alt="" src="' + shots[def.id].url + '"><figcaption>' + escapeHtml(tr(def.label,def.fallback)) + '</figcaption></figure>';
  }).join('');
  var legend = GRAVITIES.map(function(g){
    return '<span><i class="rp-dot" style="background:' + g.color + '"></i>' + escapeHtml(gravName(g.id)) + '</span>';
  }).join('');
  var rows = items.length ? items.map(function(d){
    var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
    var types = d.damageTypes.map(function(tp){return tp.name;}).join(', ');
    var memo = typeof stripModelTag === 'function' ? stripModelTag(d.memo || '') : (d.memo || '');
    var n = (PHOTOS[d.damageId] || (d.images || [])).length;
    return '<tr><td class="c"><span class="rp-num" style="background:' + grav.color + '">' + escapeHtml(d.damageId) + '</span></td><td>' + escapeHtml(zoneLabel(d, box)) + '</td><td>' + escapeHtml(types) + '</td>' +
      '<td class="nw"><i class="rp-dot" style="background:' + grav.color + '"></i>' + escapeHtml(gravName(d.gravity)) + '</td><td>' + escapeHtml(memo) + '</td><td class="c">' + (n || '–') + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="c">' + escapeHtml(tr('reportNoDamage','Aucun dégât constaté.')) + '</td></tr>';
  return '<section class="rp-annex">' +
    '<h2 class="rp-annex-title">' + escapeHtml(tr('reportAnnexTitle','Annexe — relevé détaillé des dégâts au départ')) + '</h2>' +
    (ref ? '<div class="rp-annex-ref">' + escapeHtml(ref) + '</div>' : '') +
    '<div class="rp-views">' + views + '</div><div class="rp-legend">' + legend + '</div>' +
    '<table class="rp-table"><thead><tr><th>' + escapeHtml(tr('reportNo','N°')) + '</th><th>' + escapeHtml(tr('reportZone','Zone')) + '</th><th>' + escapeHtml(tr('reportTypes','Type(s)')) + '</th><th>' + escapeHtml(tr('reportSeverity','Gravité')) + '</th><th>' + escapeHtml(tr('reportMemo','Observation')) + '</th><th>' + escapeHtml(tr('reportPhotos','Photos')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    photosHtml(items) +
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
  return '<h3 class="rp-photos-title">' + escapeHtml(tr('reportPhotosTitle','Photos des dégâts')) + '</h3><div class="rp-photos">' + cards.join('') + '</div>';
}

var lastTopUrl = '';
function render2DReport(){
  if (!carGroup || !_modelReady) return false;
  carGroup.updateMatrixWorld(true);
  var items = validDamages();
  var box = new THREE.Box3().setFromObject(carGroup);
  applyToolbarTexts();
  lastViewStats = [];
  var shots = {};
  VIEW_DEFS.forEach(function(def){
    var shot = captureView(def, box, items);
    shots[def.id] = shot;
    lastViewStats.push({id:def.id, count:shot.count, ids:shot.ids});
  });
  lastTopUrl = captureView(VIEW_DEFS[1], box, []).url;
  document.getElementById('report2DPaper').innerHTML =
    '<div class="rp-page">' + headerHtml() + partiesHtml() + stateHtml(box, items, shots) + conditionsHtml() + loanHtml() + signaturesHtml() + '</div>' +
    annexHtml(box, items, shots);
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
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) merge(target[k], src[k]);
    else if (src[k] !== undefined && src[k] !== null) target[k] = src[k];
  });
}

/* setRapportInfos({company:{…}, customer:{…}, vehicle:{…}, job:{…}, loan:{…}, terms:{…}, …})
   Accepte aussi des clés plates (noms des champs iReach entre parenthèses) :
   customerName (@P_CORRESP), customerAddress, customerPhone (@P_TEL), customerMobile (@P_GSM),
   customerLicence (@P_DRIVERLICENSE), make, model (@VMODEL), version (@VVERSION), vin (@VCHASSIS),
   plate (@VPLATE), fuelType (@VFUEL), km (@VMILEAGE), fuel, fromDate (@PFRDAT), fromTime (@PFRTIM),
   toDate (@PTODAT), toTime (@PTOTIM), date (@DAT), jobNumber, carstock, companyName… */
window.setRapportInfos = function(json){
  try {
    var o = typeof json === 'string' ? JSON.parse(json) : (json || {});
    var flat = {
      company:{name:o.companyName, city:o.companyCity, zip:o.companyZip, address:o.companyAddress, phone:o.companyPhone, email:o.companyEmail, vat:o.companyVat, logo:o.companyLogo},
      customer:{name:o.customerName, address:o.customerAddress, phone:o.customerPhone, mobile:o.customerMobile, email:o.customerEmail, licence:o.customerLicence},
      vehicle:{make:o.make, model:o.model, version:o.version, plate:o.plate, vin:o.vin, fuelType:o.fuelType, km:o.km, fuel:o.fuel},
      job:{number:o.jobNumber, carstock:o.carstock, date:o.date},
      loan:{fromDate:o.fromDate, fromTime:o.fromTime, toDate:o.toDate, toTime:o.toTime},
      observations:o.observations, title:o.title, clauses:o.clauses, place:o.place, copies:o.copies
    };
    merge(INFO, flat);
    merge(INFO, {company:o.company, customer:o.customer, vehicle:o.vehicle, job:o.job, loan:o.loan, terms:o.terms});
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
    tableRows:document.querySelectorAll('.rp-table tbody tr').length,
    clauses:document.querySelectorAll('.rp-clauses li').length
  };
};

function initReportButton(){
  var btn = document.getElementById('btnReport2D');
  if (btn) {
    btn.textContent = tr('btnReport2D','Rapport');
    btn.title = tr('reportTitle','Mise à disposition d’un véhicule de remplacement');
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initReportButton);
else initReportButton();
})();
