/* Rapport 2D imprimable - dérivé de la scène 3D, sans modifier le workflow WinDev. */
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
  var lx = Math.max(14, Math.min(REPORT_W - 14, x + dir * 24));
  var ly = Math.max(14, Math.min(REPORT_H - 14, y - 24));

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(31,45,61,.72)';
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(lx,ly);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x,y,3.5,0,Math.PI*2);
  ctx.fillStyle = '#263442';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(lx,ly,11,0,Math.PI*2);
  ctx.fillStyle = g.color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px Arial';
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

function ensureOverlay(){
  var existing = document.getElementById('report2DOverlay');
  if (existing) return existing;
  var overlay = document.createElement('div');
  overlay.id = 'report2DOverlay';
  overlay.innerHTML =
    '<div class="report2d-shell">' +
      '<div class="report2d-toolbar">' +
        '<button id="report2DRefresh"></button>' +
        '<button id="report2DClose"></button>' +
        '<button class="primary" id="report2DPrint"></button>' +
      '</div>' +
      '<div class="report2d-paper">' +
        '<div class="report2d-header">' +
          '<div><h1 class="report2d-title" id="report2DTitle"></h1><div class="report2d-subtitle" id="report2DGenerated"></div></div>' +
          '<dl class="report2d-meta">' +
            '<dt id="report2DCarstockLabel"></dt><dd id="report2DCarstock"></dd>' +
            '<dt id="report2DJobLabel"></dt><dd id="report2DJob"></dd>' +
            '<dt id="report2DModelLabel"></dt><dd id="report2DModel"></dd>' +
          '</dl>' +
        '</div>' +
        '<div class="report2d-grid" id="report2DGrid"></div>' +
        '<section class="report2d-summary"><h2 id="report2DSummaryTitle"></h2>' +
          '<table class="report2d-table"><thead><tr>' +
            '<th>#</th><th id="report2DTypesHead"></th><th id="report2DSeverityHead"></th>' +
            '<th id="report2DMemoHead"></th><th id="report2DPositionHead"></th>' +
          '</tr></thead><tbody id="report2DBody"></tbody></table>' +
          '<div class="report2d-legend" id="report2DLegend"></div>' +
        '</section>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('report2DClose').onclick = close2DReport;
  document.getElementById('report2DRefresh').onclick = refresh2DReport;
  document.getElementById('report2DPrint').onclick = print2DReport;
  return overlay;
}

function applyReportTexts(){
  document.getElementById('report2DTitle').textContent = tr('reportTitle','Rapport des dégâts');
  document.getElementById('report2DRefresh').textContent = tr('reportRefresh','Actualiser');
  document.getElementById('report2DClose').textContent = tr('reportClose','Fermer');
  document.getElementById('report2DPrint').textContent = tr('reportPrint','Imprimer');
  document.getElementById('report2DCarstockLabel').textContent = tr('reportCarstock','Véhicule');
  document.getElementById('report2DJobLabel').textContent = tr('reportJob','OR');
  document.getElementById('report2DModelLabel').textContent = tr('reportModel','Modèle');
  document.getElementById('report2DSummaryTitle').textContent = tr('reportSummary','Récapitulatif des dégâts');
  document.getElementById('report2DTypesHead').textContent = tr('reportTypes','Type(s)');
  document.getElementById('report2DSeverityHead').textContent = tr('reportSeverity','Gravité');
  document.getElementById('report2DMemoHead').textContent = tr('reportMemo','Mémo');
  document.getElementById('report2DPositionHead').textContent = tr('reportPosition','Position');
}

function fillMeta(){
  var locale = typeof _urlLang !== 'undefined' ? _urlLang : undefined;
  document.getElementById('report2DGenerated').textContent =
    tr('reportGenerated','Généré le') + ' ' + new Date().toLocaleString(locale);
  document.getElementById('report2DCarstock').textContent = window.__ctxCarstock || '-';
  document.getElementById('report2DJob').textContent = window.__ctxJob || '-';
  document.getElementById('report2DModel').textContent = currentVehicleLabel();
}

function fillViews(box,items){
  var grid = document.getElementById('report2DGrid');
  grid.innerHTML = '';
  lastViewStats = [];
  VIEW_DEFS.forEach(function(def){
    var shot = captureView(def,box,items);
    lastViewStats.push({id:def.id,count:shot.count,ids:shot.ids});
    var card = document.createElement('div');
    card.className = 'report2d-view report2d-view-' + def.id;
    var head = document.createElement('div'); head.className = 'report2d-view-head';
    var label = document.createElement('span'); label.textContent = tr(def.label,def.fallback);
    var count = document.createElement('span'); count.className = 'report2d-view-count';
    count.textContent = shot.count + ' ' + tr('reportMarkers','dégât(s) visible(s)');
    var img = document.createElement('img'); img.alt = label.textContent; img.src = shot.url;
    head.appendChild(label); head.appendChild(count); card.appendChild(head); card.appendChild(img);
    grid.appendChild(card);
  });
}

function fillSummary(items){
  var body = document.getElementById('report2DBody');
  body.innerHTML = '';
  if (!items.length) {
    var empty = document.createElement('tr');
    empty.innerHTML = '<td colspan="5" class="report2d-empty">' +
      escapeHtml(tr('reportNoDamage','Aucun dégât enregistré')) + '</td>';
    body.appendChild(empty);
  } else {
    items.forEach(function(d){
      var grav = GRAVITIES.find(function(g){return g.id===d.gravity;}) || GRAVITIES[1];
      var types = d.damageTypes.map(function(tp){return tp.icon + ' ' + tp.name;}).join(', ');
      var memo = typeof stripModelTag === 'function' ? stripModelTag(d.memo || '') : (d.memo || '');
      var trEl = document.createElement('tr');
      trEl.innerHTML =
        '<td class="num">' + escapeHtml(d.damageId) + '</td>' +
        '<td>' + escapeHtml(types) + '</td>' +
        '<td class="sev"><span class="report2d-dot" style="background:' + grav.color + '"></span>' +
          escapeHtml(gravName(d.gravity)) + '</td>' +
        '<td>' + escapeHtml(memo) + '</td>' +
        '<td class="report2d-position">' +
          escapeHtml((+d.x).toFixed(4) + ', ' + (+d.y).toFixed(4) + ', ' + (+d.z).toFixed(4)) +
        '</td>';
      body.appendChild(trEl);
    });
  }

  var legend = document.getElementById('report2DLegend');
  legend.innerHTML = GRAVITIES.map(function(g){
    return '<span><i class="report2d-dot" style="background:' + g.color + '"></i>' +
      escapeHtml(gravName(g.id)) + '</span>';
  }).join('');
}

function render2DReport(){
  if (!carGroup || !_modelReady) return false;
  carGroup.updateMatrixWorld(true);
  var items = validDamages();
  var box = new THREE.Box3().setFromObject(carGroup);
  applyReportTexts();
  fillMeta();
  fillViews(box,items);
  fillSummary(items);
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
  setTimeout(function(){ window.print(); },80);
}

window.open2DReport = open2DReport;
window.close2DReport = close2DReport;
window.refresh2DReport = refresh2DReport;
window.print2DReport = print2DReport;
window.get2DReportPayload = function(){
  return {
    version: window.__version,
    carstock: window.__ctxCarstock,
    job: window.__ctxJob,
    model: window.__ctxModel,
    vehicleId: currentVehicleId,
    damages: validDamages().map(damageToRow)
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
    views:lastViewStats.slice(),
    tableRows:document.querySelectorAll('#report2DBody tr').length
  };
};

function initReportButton(){
  var btn = document.getElementById('btnReport2D');
  if (btn) {
    btn.textContent = tr('btnReport2D','Rapport 2D');
    btn.title = tr('reportTitle','Rapport des dégâts');
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initReportButton);
else initReportButton();
})();
