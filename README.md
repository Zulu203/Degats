# Degats — marquage des dégâts sur modèle 3D (page HTML pour WinDev)

Page `Degats.html` chargée dans un champ HTML WinDev (`HTM_Container`). Le véhicule est affiché en 3D
(three.js, modèles `berline.glb`, `suv.glb`, `van.glb`), l'utilisateur pose des dégâts en cliquant sur
la carrosserie, WinDev enregistre tout dans `Carstock_damage_detail`.

Langues : `lang_fr.js` (maître), `lang_nl.js`, `lang_en.js` — paramètre `?lang=nl`. Toute nouvelle clé
s'ajoute d'abord dans `lang_fr.js`.

## Fonctions appelées par WinDev (`HTM_Container.ExecuteJS`)

| Fonction | Rôle |
|---|---|
| `setContexte(carstock, job, model)` | contexte courant ; `model` > 0 charge et verrouille le véhicule |
| `initDamageTypes(json)` | types de dégâts depuis `Carstock_damage` (`[{id, description}]`) |
| `chargerDommages(json)` | charge les lignes de `Carstock_damage_detail` (colonnes = clés JSON, dont `digital`) |
| `envoyerSauvegarde()` | envoie `GET_DAMAGES_RESPONSE` (postMessage + presse-papier) |
| `ajouterPhoto(damageId, path)` | WinDev confirme une photo uploadée (chemin `numberjob/vehicule/damage_id_N.jpg`) |
| `setRapportInfos(json)` | données du contrat imprimable (garage, client, véhicule, départ / retour, montants des conditions) |
| `chargerPhotos(json)` | photos des dégâts pour le rapport : `[{damage_id, path, src}]` (`src` = base64 ou URL) |
| `open2DReport()` / `print2DReport()` / `close2DReport()` | ouvrir / imprimer / fermer le contrat |
| `get2DReportPayload()` | données du rapport (JSON) |

## Messages envoyés à WinDev (postMessage, champ `action`)

| Action | Quand | Contenu |
|---|---|---|
| `HTML_READY` | page chargée | `version` |
| `GET_DAMAGES_RESPONSE` | sauvegarde | `carstock`, `job`, `count`, `damages` (JSON), `deleted` (JSON) |
| `REQUEST_PHOTO` | bouton « + Ajouter une photo » | `damageId`, `carstock`, `job` → WinDev ouvre l'appareil photo, uploade, puis appelle `ajouterPhoto` |
| `DELETE_PHOTO` | suppression d'une photo | `damageId`, `path` |
| `VIEW_PHOTO` | clic sur une vignette | `path` |

La colonne `digital` contient les chemins des photos d'un dégât, séparés par des virgules.

## Contrat de véhicule de remplacement imprimable (`report2d.js`, `report2d.css`)

Le bouton « Rapport » produit un contrat de mise à disposition d'un véhicule de remplacement,
A4 portrait, noir et blanc. Il fusionne les deux contrats d'exemple : l'attestation Iacolino
(Seraing) et le contrat de Peerlings (Pelt, `exemples/vehicle_replacement_contract.doc`).
Il existe en français, néerlandais (reprenant le texte Peerlings) et anglais (`?lang=`).

**Page 1 — le contrat**
1. en-tête du garage (nom, adresse, téléphone, e-mail, logo possible), dossier (OR) et n° véhicule ;
2. titre « Mise à disposition d'un véhicule de remplacement » / « Uitlening van een vervangwagen » ;
3. encadrés **Client** (conducteur, adresse, tél. / GSM, permis) et **Véhicule de remplacement**
   (marque / modèle / version, châssis, carburant, immatriculation) ;
4. **État du véhicule au départ** (vue du dessus 3D avec les repères + liste des dégâts) et
   **État du véhicule au retour** (vue vierge + lignes pointillées), avec la phrase « Le véhicule
   est présumé en bon état, sauf les remarques suivantes » ;
5. **Conditions générales** communes (11 clauses, voir plus bas) ;
6. tableau **Départ / Retour** (date, heure, kilométrage, niveau carburant), retour prévu ;
7. déclaration du client et signatures, « Fait à …, en 2 exemplaires, le … ».

**Page 2 — l'annexe** : les 5 vues 3D avec les repères, le relevé détaillé des dégâts (zone,
types, gravité, observation, nombre de photos) et les photos des dégâts.

Une valeur absente laisse une ligne pointillée à compléter à la main.

### Conditions générales communes (Belgique / Benelux)

Les deux contrats d'exemple ont été fusionnés en un seul texte commun (clé `reportClauses`
dans `lang_fr.js`, `lang_nl.js`, `lang_en.js`, une clause par segment séparé par `|`) :
examen et état au départ, restitution propre (forfait de nettoyage), responsabilité jusqu'à la
restitution, accident (constat européen) et franchise, infractions, carburant, interdiction de
fumer / boire / manger, limite de kilométrage, prix journalier, remise et reprise avec le garage,
tribunaux compétents.

Les montants changent d'un garage à l'autre ; ils se passent dans `terms` :

| Clé `terms` | Repère dans le texte | Exemple Iacolino / Peerlings |
|---|---|---|
| `cleaningFee` | `%clean` — forfait de nettoyage (€ TVAC) | 40 / 50 + 50 |
| `deductible` | `%deductible` — franchise accident (€) | — / 750 |
| `fuelPrice` | `%fuel` — carburant manquant (€ / litre) | 3 / plein obligatoire |
| `kmPerDay` | `%km` — limite (km / jour) | 150 / — |
| `dailyRate` | `%rate` — prix normal (€ TVAC / jour) | — / 30 |
| `customerRate` | `%custrate` — prix payé par le client (€ / jour) | — / à compléter |

Valeur absente : « …… » à compléter à la main. Valeur `false` : la clause est retirée (par ex.
`"kmPerDay": false` pour un garage sans limite). `setRapportInfos({"clauses":[…]})` remplace tout
le texte, `"clauses": false` masque l'encadré.

Deux adaptations par rapport aux originaux : « en bon père de famille » devient « en personne
prudente et raisonnable » (terme du Code civil belge depuis 2020), et la clause des tribunaux
ajoute « sans préjudice des règles impératives de protection du consommateur », car une clause
d'attribution de compétence ne peut pas écarter ces règles face à un particulier.

### Correspondance avec les champs iReach (`@`)

| Champ du contrat | Champ iReach | Clé `setRapportInfos` |
|---|---|---|
| Conducteur | `@P_CORRESP` | `customer.name` |
| Adresse | `@P_ADDR @P_ADNO @P_ADBO @P_ZIP @P_CITY` | `customer.address` |
| Tél. / GSM | `@P_TEL` / `@P_GSM` | `customer.phone` / `customer.mobile` |
| Permis de conduire | `@P_DRIVERLICENSE` | `customer.licence` |
| Marque / modèle | `@MAKE @MODEL` (Iacolino) ou `@VMODEL @VVERSION` (Peerlings) | `vehicle.make`, `vehicle.model`, `vehicle.version` |
| Châssis | `@VCHASSIS` | `vehicle.vin` |
| Carburant (type) | `@VFUEL` | `vehicle.fuelType` |
| Immatriculation | `@VPLATE` | `vehicle.plate` |
| Kilométrage au départ | `@VMILEAGE` | `vehicle.km` |
| Date / heure de départ | `@PFRDAT` / `@PFRTIM` | `loan.fromDate` / `loan.fromTime` |
| Retour prévu | `@PTODAT` / `@PTOTIM` | `loan.toDate` / `loan.toTime` |
| Date du document | `@DAT` | `job.date` |
| Niveau carburant au départ | — | `vehicle.fuel` |
| Dossier / n° véhicule | `gnNumberJob` / `gnNumberCarstock` | `job.number` / `job.carstock` |
| Garage | — | `company.{name, address, zip, city, phone, email, vat, logo}` |

### Exemples PDF

| Fichier | Contenu |
|---|---|
| [`exemples/rapport-degats-exemple.pdf`](exemples/rapport-degats-exemple.pdf) | contrat FR rempli avec des données d'exemple |
| [`exemples/rapport-degats-modele-champs.pdf`](exemples/rapport-degats-modele-champs.pdf) | contrat FR avec les champs `@` à la place des valeurs |
| [`exemples/rapport-degats-exemple-nl.pdf`](exemples/rapport-degats-exemple-nl.pdf) | idem en néerlandais, rempli |
| [`exemples/rapport-degats-modele-champs-nl.pdf`](exemples/rapport-degats-modele-champs-nl.pdf) | idem en néerlandais, avec les champs `@` |
| [`exemples/vehicle_replacement_contract.doc`](exemples/vehicle_replacement_contract.doc) | contrat Peerlings d'origine (référence) |

Les photos des exemples sont des images générées pour le test ; en production ce sont les
photos transmises par `chargerPhotos`.

### Exemple d'appel WinDev

```windev
// 1. Données du contrat (à appeler après HTML_READY, avant d'ouvrir le rapport)
sInfos is string = [
{"company":{"name":"%1","address":"%2","zip":"%3","city":"%4","phone":"%5","email":"%6"},
 "customer":{"name":"%7","address":"%8","phone":"%9","mobile":"%10","licence":"%11"},
 "vehicle":{"make":"%12","model":"%13","version":"%14","vin":"%15","plate":"%16","fuelType":"%17","km":"%18","fuel":"%19"},
 "loan":{"fromDate":"%20","fromTime":"%21","toDate":"%22","toTime":"%23"},
 "job":{"number":%24,"carstock":%25,"date":"%26"},
 "terms":{"cleaningFee":40,"deductible":750,"fuelPrice":3,"kmPerDay":150,"dailyRate":30,"customerRate":0},
 "observations":"%27"}
]
sInfos = StringBuild(sInfos, JSStr(gsGarageNom), JSStr(gsGarageAdresse), JSStr(gsGarageCP), JSStr(gsGarageVille), ...
   JSStr(gsGarageTel), JSStr(gsGarageEmail), ...
   JSStr(P_CORRESP), JSStr(P_ADDR + " " + P_ADNO + " " + P_ADBO + ", " + P_ZIP + " " + P_CITY), ...
   JSStr(P_TEL), JSStr(P_GSM), JSStr(P_DRIVERLICENSE), ...
   JSStr(MAKE), JSStr(VMODEL), JSStr(VVERSION), JSStr(VCHASSIS), JSStr(VPLATE), JSStr(VFUEL), ...
   JSStr(VMILEAGE), JSStr(sNiveauCarburant), ...
   DateToString(PFRDAT, "YYYY-MM-DD"), JSStr(PFRTIM), DateToString(PTODAT, "YYYY-MM-DD"), JSStr(PTOTIM), ...
   JSInt(gnNumberJob), JSInt(gnNumberCarstock), DateToString(Today(), "YYYY-MM-DD"), JSStr(sRemarques))
HTM_Container.ExecuteJS("setRapportInfos(" + sInfos + ")")

// 2. Photos (lues sur le serveur d'images, encodées en base64)
arrPhotos is array of strings
for each sdDamages
    for each sPath of StringToArray(sdDamages.digital, ",")
        sPath = NoSpace(sPath)
        if sPath = "" then continue
        bufImg is Buffer = LirePhotoServeur(sPath)   // fLoadBuffer / HTTPRequest selon le serveur
        if bufImg = "" then continue
        arrPhotos.Add("{""damage_id"":" + JSInt(sdDamages.damage_id) + ",""path"":""" + JSStr(sPath) + ...
                      """,""src"":""data:image/jpeg;base64," + Encode(bufImg, encodeBASE64NoCR) + """}")
    end
end
HTM_Container.ExecuteJS("chargerPhotos([" + ArrayToString(arrPhotos, ",") + "])")

// 3. Ouvrir, puis imprimer (boîte de dialogue du navigateur : imprimante ou « Enregistrer en PDF »)
HTM_Container.ExecuteJS("open2DReport()")
HTM_Container.ExecuteJS("print2DReport()")
```

## Test local

```
npx http-server . -p 8080      # puis http://localhost:8080/Degats.html?lang=fr
```
Dans la console : `setContexte(701,123,1)`, `chargerDommages([...])`, `setRapportInfos({...})`,
`chargerPhotos([...])`, `open2DReport()`.
