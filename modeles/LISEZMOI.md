# Modèles Word du rapport des dégâts

Le rapport (contrat de mise à disposition + annexe des dégâts) peut être construit
à partir d'un fichier **Word (.docx)** de ce dossier, au lieu du modèle intégré à la page.

- `standard.docx` : le contrat standard, identique au modèle intégré.
- Un garage peut avoir son propre fichier, par exemple `iacolino.docx`.

## Comment l'utiliser

1. Ouvrir le fichier dans Word, le modifier (textes, logo, tableaux, couleurs…).
2. Garder les **champs** `{{…}}` là où les informations doivent apparaître.
3. Enregistrer en `.docx` (format Word normal) et le remettre dans ce dossier.

Le modèle est choisi par l'adresse de la page : `Degats.html?…&modele=standard`
(ou par WinDev avec `setModeleRapport('standard')`). Sans `modele=`, la page garde
le modèle intégré.

## Les champs

Un champ vide est imprimé « …………… » (à compléter au stylo).
Avec un `?` à la fin, par exemple `{{garage.adresse?}}`, un champ vide n'imprime rien,
et la ligne disparaît si elle ne contient rien d'autre.

| Champ | Contenu |
|---|---|
| `{{garage.nom}}` `{{garage.adresse}}` `{{garage.cp_ville}}` `{{garage.ville}}` | garage (site de l'OR) |
| `{{garage.telephone}}` `{{garage.email}}` `{{garage.tva}}` | garage |
| `{{or.numero}}` `{{or.date}}` | numéro et date de l'OR |
| `{{vehicule.numero}}` | numéro de carstock |
| `{{client.nom}}` `{{client.adresse}}` `{{client.telephone}}` | client (téléphone = tél. / GSM) |
| `{{client.tel}}` `{{client.gsm}}` `{{client.email}}` `{{client.permis}}` | client |
| `{{vehicule.marque}}` `{{vehicule.modele}}` `{{vehicule.marque_modele}}` | véhicule |
| `{{vehicule.chassis}}` `{{vehicule.plaque}}` `{{vehicule.carburant}}` `{{vehicule.km}}` | véhicule |
| `{{depart.date}}` `{{depart.heure}}` `{{depart.km}}` `{{depart.carburant}}` | départ du prêt |
| `{{retour.date}}` `{{retour.heure}}` | retour prévu |
| `{{tarif.nettoyage}}` `{{tarif.franchise}}` `{{tarif.carburant}}` | montants des conditions |
| `{{tarif.km_jour}}` `{{tarif.prix_jour}}` `{{tarif.prix_client}}` | montants des conditions |
| `{{observations}}` | remarque libre |
| `{{date}}` | date du jour |
| `{{lieu}}` | ville du garage |

## Les blocs (seuls sur leur ligne)

| Bloc | Ce qui est inséré |
|---|---|
| `{{VUE_DESSUS}}` | la voiture vue du dessus, avec les dégâts |
| `{{VUE_DESSUS_VIDE}}` | la voiture vue du dessus, sans dégâts (état au retour) |
| `{{LISTE_DEGATS}}` | la liste courte des dégâts (numéro, types, zone) |
| `{{VUES}}` | les 5 vues de la voiture + la légende des gravités |
| `{{DEGATS}}` | le tableau détaillé des dégâts |
| `{{PHOTOS}}` | les photos des dégâts |

## Conseils

- Construire la mise en page avec des **tableaux** (bordures visibles ou non).
- Éviter les zones de texte flottantes, formes et WordArt : elles sont mal placées.
- Pour passer à une nouvelle page : Insertion > Saut de page (Ctrl + Entrée).
- Police Calibri conseillée (identique sur tablette et PC).
