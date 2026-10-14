# CLAUDE.md — Profilage athlétique (allures et zones)

## Objectif

Appli web **100 % côté client** (aucun serveur, aucune dépendance) qui, à partir de chronos
(compétitions ou tests) et/ou de la VMA, dresse le profil de course d'un coureur ou d'une coureuse :
VMA, indice d'endurance (Péronnet & Thibault), allures selon la durée, chronos prédictifs,
zones d'entraînement à 6 niveaux, et estimation par profil quand les données manquent.

Interface et contenus **en français**. Ne pas introduire de dépendance externe ni de CDN.

## Fichiers

- `index.html` : page unique (CSS + interface + script de rendu). Charge `endurance.js`.
- `endurance.js` : moteur de calcul, pur JavaScript, sans DOM. Exporte `window.Endurance`
  (et `module.exports` pour les tests Node).

Il n'y a pas de build, pas de gestionnaire de paquets, pas de tests versionnés.

## Modèle (forme simplifiée de Péronnet & Thibault)

- `% VMA(T) = 100 + IE × ln(T / 6)`, T en minutes. `k = IE / 100`.
- Vitesse tenable : `v(T) = VMA × (1 + k × ln(T / 6))`, en m/min en interne.
- Calibrage : régression linéaire de `v = distance / temps` sur `x = ln(temps / 6)`.
  `VMA = a`, `k = b / a`. Avec 2 performances, la droite passe exactement par les deux points.
- Limites : modèle valable d'environ 6 min à 5 h. Une seule performance sans VMA ou profil ne suffit pas.
- Allure 1 h = `v(60)`, référence des zones (100 %).
- Prédictions par dichotomie sur `distance = v(T) × T`.

## Règles métier à respecter

- **Zones** (en % de l'allure 1 h, `ZONES_DEF`) : Z1 < 65 ; Z2 65–80 ; Z3 80–90 ;
  Z4 90–100 ; Z5 100–120 ; Z6 > 120. Textes d'objectif et d'usage dans `ZONES_DEF`.
- **Fiabilité d'une prédiction** selon l'extrapolation de la distance hors de la plage saisie
  (`SEUILS_FIABILITE`) : Élevée ≤ 10 % ; Moyenne ≤ 60 % ; Faible ≤ 120 % ; Très faible ≤ 200 % ;
  Fantaisiste au-delà. Sans performance, « Indicative ».
- **Contrôles** : vitesses hors 4–30 km/h bloquent le calcul ; doublons, incohérences
  (k ≥ 0), écart > 2 points de % VMA et performance plus rapide que la VMA donnée sont des alertes.
  Les alertes ne modifient pas la fiabilité.
- **Profil** (`estimerIE`) : point de départ −8 (coureur moyen), effets par volume, fréquence,
  expérience, âge et reprise (`PALIERS`, `EFFET_REPRISE`), incertitude ±1,5 plus 0,5 par facteur
  manquant. Bornes −14 à −2. Les coefficients sont des **hypothèses**, à valider avec des données réelles.
  L'effet « âge » en particulier est discutable : la VO2max diminue avec l'âge.
- **Repli** (`calibrerComplet`) : ≥ 2 durées différentes → calcul normal ; une seule
  performance → VMA déduite du profil ; VMA seule → indice du profil ; rien → erreur.
- Indice d'endurance : **plus proche de 0 = meilleure endurance**. Repères affichés :
  ≥ −6 très bonne, ≥ −9 correcte, sinon à développer.

## Conventions

- Moteur : fonctions pures, pas d'accès au DOM. Les messages d'erreur et d'alerte sont en français.
- Interface : chaque donnée formatée passe par les helpers `f1`, `f2`, `fDist`, `E.formatAllure`,
  `E.formatTemps`, `E.formatDuree`. Ne pas dupliquer ces formats.
- Les ids DOM utilisés par le script doivent exister dans le HTML.
- Virgule décimale à l'affichage (`toFixed(…).replace('.', ',')`), point en entrée numérique.
- Le code a été réduit une fois : garder la concision, éviter le code mort et les champs inutilisés.

## Vérifier une modification

Node.js (v24 installé) est dans `C:\Program Files\nodejs\node.exe`, et `node` n'est pas dans le PATH de
certaines sessions : utiliser le chemin complet.

- Syntaxe moteur : `node --check endurance.js`
- Syntaxe du script de la page : extraire le contenu de `<script>…</script>` et lancer `node --check`.
- Non-régression du calcul : comparer les sorties de `calibrer`, `tablePredictions`, `tableDurees`,
  `zones` avant et après une modification, sur plusieurs jeux de données (deux exemples, quatre
  performances, une VMA connue, une erreur de saisie). Les sorties doivent être identiques
  si le calcul n'a pas été modifié intentionnellement.
- L'affichage n'a pas été vérifié dans un navigateur : ouvrir `index.html` pour contrôler la mise en page.

## Exemples de référence

- 5 km 18:30 et 10 km 39:00 : VMA ≈ 17,47 km/h, IE ≈ −6,4, allure 1 h ≈ 4:02/km.
- 4000 m 14:00 et 10 km 37:00 : VMA ≈ 17,95 km/h, IE ≈ −5,3, 5 km prédit ≈ 17:44.

## Points ouverts

- Valider les coefficients du profil (`PALIERS`) et la pertinence de l'effet âge.
- Vérifier l'affichage sur téléphone (cartes de zones, barre, tableaux).
- Les tests de non-régression ne sont pas dans le projet : les ajouter si le projet doit évoluer.
