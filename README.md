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

Mise en page calquée sur l'« Attestation de mise à disposition d'un véhicule » du garage
(A4 portrait, noir et blanc, encadrés simples), générée depuis les dégâts enregistrés :

1. titre centré, phrase d'introduction (« Je, soussigné garage …, responsable après-vente … sis à … ») ;
2. champs : De Mr et/ou Mme, Le véhicule, Châssis n°, Immatriculé, Kilométrage, Niveau carburant,
   Dossier (OR / véhicule) — une valeur absente laisse une ligne pointillée à compléter ;
3. phrase d'engagement (« Par signature de la présente, la partie locataire du dit véhicule reconnaît
   l'exactitude des dégâts relevés ci-dessous, adhère et s'engage à respecter les clauses du présent
   document »), puis l'**encadré des conditions générales** a) à i) de l'attestation à gauche et la
   **vue du dessus** du modèle 3D avec les repères à droite ;
4. encadré **Dégâts constatés** : liste numérotée (zone, type, gravité, observation, nombre de photos)
   à gauche, les 4 autres vues (avant, arrière, côté gauche, côté droit) et la légende à droite ;
5. Remarques (lignes pointillées), « Fait à Seraing, en 2 exemplaires le … à … », signatures
   « Pour Iacolino » / « Signature du client » ;
6. encadré **Retour du véhicule** (date, kilométrage, remarques, signatures garage / client, vue du
   dessus vierge pour noter les nouveaux dégâts), puis les **photos des dégâts**, 3 par ligne.

Conditions générales par défaut (clé `reportClauses` dans `lang_fr.js`, `lang_nl.js`, `lang_en.js`,
une clause par segment séparé par `|`) : le texte de l'attestation, avec la clause a) adaptée
(« sans dégât matériel autre que ceux relevés au présent document ») puisque le document liste les
dégâts. Pour un autre texte depuis WinDev : `setRapportInfos({"clauses":["…","…"]})` (ou une chaîne,
une clause par ligne) ; `"clauses":false` masque l'encadré.

Textes et coordonnées par défaut : garage Iacolino, Seraing, Rue de la Boverie 448 — tous
surchargeables par `setRapportInfos` : `company.{name, role, city, address, logo}`, `intro`,
`commitment`, `clauses`, `place`, `copies`, `time`, `returnSection` (`false` pour masquer
l'encadré retour), `title`.

### Exemples PDF

- [`exemples/rapport-degats-exemple.pdf`](exemples/rapport-degats-exemple.pdf) : document complet rempli
  avec des données d'exemple (client, véhicule, conditions générales, 7 dégâts, 5 photos).
- [`exemples/rapport-degats-modele-champs.pdf`](exemples/rapport-degats-modele-champs.pdf) : même document
  avec les champs WinDev de l'attestation à la place des valeurs (`@P_CORRESP`, `@MAKE @MODEL`,
  `@VCHASSIS`, `@VPLATE`, `@VMILEAGE`).

Les photos de ces exemples sont des images générées pour le test ; en production ce sont les
photos transmises par `chargerPhotos`.

### Exemple d'appel WinDev

```windev
// 1. En-tête (à appeler après HTML_READY, avant d'ouvrir le rapport)
// Mêmes champs que l'attestation : @P_CORRESP, @MAKE @MODEL, @VCHASSIS, @VPLATE, @VMILEAGE
sInfos is string = [
{"company":{"name":"Iacolino","role":"responsable après-vente des établissements Iacolino","city":"Seraing","address":"Rue de la Boverie 448"},
 "customer":{"name":"%1"},
 "vehicle":{"make":"%2","model":"%3","vin":"%4","plate":"%5","km":"%6","fuel":"%7"},
 "job":{"number":%8,"carstock":%9,"date":"%10"},
 "observations":"%11"}
]
sInfos = StringBuild(sInfos, JSStr(P_CORRESP), JSStr(MAKE), JSStr(MODEL), JSStr(VCHASSIS), JSStr(VPLATE), ...
   JSStr(VMILEAGE), JSStr(sNiveauCarburant), JSInt(gnNumberJob), JSInt(gnNumberCarstock), ...
   DateToString(Today(), "YYYY-MM-DD"), JSStr(sRemarques))
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
