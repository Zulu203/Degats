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
| `setRapportInfos(json)` | en-tête du rapport imprimable (société, client, véhicule, intervention) |
| `chargerPhotos(json)` | photos des dégâts pour le rapport : `[{damage_id, path, src}]` (`src` = base64 ou URL) |
| `open2DReport()` / `print2DReport()` / `close2DReport()` | ouvrir / imprimer / fermer le rapport |
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

## Rapport imprimable (`report2d.js`, `report2d.css`)

Mise en page « état des lieux » au format A4 portrait, construite comme un contrat de véhicule de
remplacement :

1. en-tête société (logo, coordonnées) + titre, référence OR / véhicule, date ;
2. blocs **Véhicule** (marque/modèle, immatriculation, VIN, couleur, km, carburant), **Client** (nom,
   adresse, téléphone, e-mail, permis) et **Intervention** (OR, dates entrée/sortie, réceptionné par, type) ;
   une valeur absente laisse une ligne vide à compléter à la main ;
3. **État du véhicule** : 5 vues (avant, dessus, arrière, côté gauche, côté droit) rendues depuis le
   modèle 3D avec les repères numérotés, colorés selon la gravité ;
4. **Relevé des dégâts** : n°, zone, type(s), gravité, observation, nombre de photos ;
5. **Observations**, signatures (garage / client « lu et approuvé »), mention légale ;
6. page(s) suivante(s) : **photos des dégâts** (3 par ligne, légende n° + type).

### Exemple d'appel WinDev

```windev
// 1. En-tête (à appeler après HTML_READY, avant d'ouvrir le rapport)
sInfos is string = [
{"company":{"name":"%1","address":"%2","phone":"%3","email":"%4","vat":"%5"},
 "customer":{"name":"%6","address":"%7","phone":"%8","email":"%9"},
 "vehicle":{"make":"%10","model":"%11","plate":"%12","vin":"%13","color":"%14","km":"%15","fuel":"%16"},
 "job":{"number":%17,"carstock":%18,"date":"%19","dateIn":"%20","agent":"%21","type":"%22"},
 "observations":"%23"}
]
sInfos = StringBuild(sInfos, JSStr(gsSociete), JSStr(gsAdresse), JSStr(gsTel), JSStr(gsEmail), JSStr(gsTVA), ...
   JSStr(Customer.name), JSStr(Customer.address), JSStr(Customer.phone), JSStr(Customer.email), ...
   JSStr(Carstock.make), JSStr(Carstock.model), JSStr(Carstock.plate), JSStr(Carstock.vin), JSStr(Carstock.color), ...
   JSStr(Carstock.km), JSStr(Carstock.fuel), JSInt(gnNumberJob), JSInt(gnNumberCarstock), ...
   DateToString(Today(), "YYYY-MM-DD"), DateToString(Job.datein, "YYYY-MM-DD"), JSStr(myUser.m_sName), JSStr(Job.type), JSStr(Job.memo))
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
