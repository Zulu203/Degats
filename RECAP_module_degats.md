# Récapitulatif — module Dégâts (iReach)

Source : dépôt GitHub zulu203/degats (branche main, commit d44afdc). Ce fil ne contient aucun code WinDev ni l'analyse HFSQL.

## Objectif
Dans iReach (WinDev), marquer les dégâts d'un véhicule sur un modèle 3D, les enregistrer en base, y joindre des photos et imprimer un contrat de véhicule de remplacement (état au départ et au retour).

## Architecture
- Page `Degats.html` (v19), chargée dans le champ HTML WinDev `HTM_Container`.
- 3D avec three.js. Modèles `berline.glb`, `suv.glb`, `van.glb`.
- Langues `lang_fr.js` (fichier maître), `lang_nl.js`, `lang_en.js`, choisies par `?lang=`.

### WinDev → page (`HTM_Container.ExecuteJS`)
- `setContexte(carstock, job, model)`
- `initDamageTypes(json)`
- `chargerDommages(json)`
- `envoyerSauvegarde()`
- `ajouterPhoto(damageId, path)`
- `setRapportInfos(json)` et `chargerPhotos(json)`
- `open2DReport()`, `print2DReport()`, `close2DReport()`
- `get2DReportPayload()`

### Page → WinDev
Par postMessage (`window.parent`, `window.WinDev` ou `window.Android`), avec le presse-papier en secours. Actions :
- `HTML_READY`
- `GET_DAMAGES_RESPONSE`, avec `carstock`, `job`, `count`, `damages` (JSON) et `deleted` (JSON)
- `REQUEST_PHOTO`, `DELETE_PHOTO`, `VIEW_PHOTO`

## Base de données (vue de la page seulement)
- `Carstock_damage` : types de dégâts `{id, description}`.
- `Carstock_damage_detail`, une ligne par dégât :
  - `damage_id` ;
  - `position_xvalue`, `position_yvalue`, `position_zvalue` : coordonnées dans le repère du modèle 3D ;
  - `damage_level` : gravité, 2 par défaut ;
  - `memo` : le premier dégât porte la marque `[M:x]`, qui mémorise le modèle de véhicule ;
  - `digital` : chemins des photos séparés par des virgules (`numberjob/vehicule/damage_id_N.jpg`) ;
  - `idcarstock_damage1` à `idcarstock_damage5` : jusqu'à 5 types par dégât.

## Décisions déjà prises
- Le modèle de véhicule est mémorisé par la marque `[M:x]` dans le memo, sans nouvelle colonne.
- Les photos sont stockées sur un serveur d'images ; la base ne garde que leurs chemins.
- Le rapport fusionne les contrats Iacolino (Seraing) et Peerlings (Pelt) : A4, noir et blanc, 2 pages (le contrat, puis une annexe avec les 5 vues et les photos).
- Les montants des conditions changent selon le garage. Ils passent par `terms` : `cleaningFee`, `deductible`, `fuelPrice`, `kmPerDay`, `dailyRate`, `customerRate`. La valeur `false` retire la clause.
- La correspondance avec les champs iReach `@` est documentée dans le README, avec un exemple de code WinDev.

## Fait (côté HTML)
- Le marquage 3D.
- La sauvegarde et le chargement.
- La gestion des photos côté page.
- Le contrat imprimable en FR, NL et EN.
- Les PDF d'exemple dans `exemples/`.

## Points ouverts (côté WinDev)
- Le code de la fenêtre : réception de `HTML_READY`, analyse de `GET_DAMAGES_RESPONSE`, écriture HFSQL, traitement de la liste `deleted`.
- La capture et l'upload des photos, puis l'appel à `ajouterPhoto`.
- La lecture des photos sur le serveur pour `chargerPhotos` (`LirePhotoServeur` n'est qu'un exemple dans le README).
- La structure complète des tables : clés et liens avec Carstock et Job.

## Prochaine étape
1. Récupérer le code WinDev des fenêtres et procédures, et la description des tables.
2. L'aligner sur le README et sur `Degats.html` : fonctions `damageToRow` et `rowToDamage`, et le bloc « PONT WINDEV ↔ PAGE ».
