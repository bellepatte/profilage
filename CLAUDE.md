# CLAUDE.md — Profilage athlétique (allures et zones)

## Objectif

Appli web **100 % côté client** (aucun serveur, aucune dépendance) qui, à partir de chronos
(compétitions ou tests) et/ou de la VMA, dresse le profil de course d'un coureur ou d'une coureuse :
VMA, indice d'endurance (Péronnet & Thibault), prédictions (chronos selon la distance, distances
selon le temps), zones d'entraînement à 6 niveaux, et estimation par profil quand les données manquent.

Interface et contenus **en français**. Ne pas introduire de dépendance externe ni de CDN.

## Fichiers

- `index.html` : page unique (CSS + interface + script de rendu). Charge `endurance.js`. Saisie à
  gauche (fixe sur grand écran), résultats à droite ; recalcul automatique pendant la frappe (délai
  300 ms), sans bouton « Calculer ». Une ligne à moitié remplie est ignorée ; une erreur grise les
  derniers résultats (`.perime`) au lieu de les masquer.
  Deux modes d'affichage (choix dans l'en-tête, mémorisé en `localStorage`, « Simplifié » par défaut) :
  tout élément réservé au mode avancé porte la classe `avance` ; `.requis` le rend visible malgré tout
  (profil requis ou déjà rempli). Le mode « distances selon chronos » n'existe qu'en avancé.
  Saisie souple (`parseTemps`, `parseDistance`) : temps `42:20`, `42'20`, `42min`, `1h20`, `1h20m30s`, `20s` ;
  distances `5000`, `5 km`, `10k`, `semi`, `marathon` (sans unité, une valeur < 100 est lue en km). En quittant
  un champ, la saisie est convertie au format standard (5000, 1:20:00). La correspondance vitesse et allure
  est affichée partout où l'une des deux apparaît (lignes de saisie, VMA, synthèse, prédictions, zones).
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
  Z4 90–100 ; Z5 100–120 ; Z6 > 120. Textes « Quand l'utiliser » (liste `quand`) dans `ZONES_DEF`.
- **Fiabilité d'une prédiction** selon l'extrapolation de la distance hors de la plage saisie
  (`SEUILS_FIABILITE`) : Élevée ≤ 10 % ; Moyenne ≤ 60 % ; Faible ≤ 120 % ; Très faible ≤ 200 % ;
  Fantaisiste au-delà. Si les données sont incohérentes (`coherenceFaible`), la fiabilité baisse d'un cran. Une VMA connue compte comme un chrono sur 6 min. Sans performance ni VMA connue, « Indicative ».
- **Contrôles** : vitesses hors 4–30 km/h, indice ≥ 0 et, avec exactement deux données, un écart de
  distances inférieur à 10 % (`ECART_DISTANCE_MIN`, la VMA comptant comme VMA × 6 min) bloquent le calcul ; doublons et indice sous −14
  (`IE_HABITUEL`) sont des alertes. La VMA saisie compte partout comme une performance (VMA × 6 min,
  en 6:00), y compris dans la régression et donc dans le contrôle de l'indice. **Cohérence** : (1) une
  vitesse qui augmente quand la distance augmente est signalée par paire, VMA comprise ; (2) une contre-performance est une performance hors de
  la tendance (> 2 points de % VMA) dont le retrait rend les autres cohérentes (≥ 4 points au total).
  Sans contre-performance identifiable, les points hors tendance sont « à vérifier ». Une
  incohérence reste dans le calcul, mais abaisse la fiabilité d'un cran (`coherenceFaible`).
- **Profil** (`estimerIE`) : point de départ −8 (coureur moyen), effets par volume, fréquence,
  expérience, âge et reprise (`ANCRES` interpolés linéairement, `EFFET_REPRISE`), incertitude ±1,5 plus 0,5 par facteur
  manquant. Bornes −14 à −2. Les coefficients sont des **hypothèses**, à valider avec des données réelles.
  L'effet « âge » en particulier est discutable : la VO2max diminue avec l'âge.
- **Repli** (`calibrerComplet`) : la VMA compte comme une donnée (chrono sur 6 min). Une seule
  donnée (une performance, ou la VMA seule) ne suffit que si le profil est renseigné : la VMA est
  alors déduite du profil, ou l'indice vient du profil. Profil vide → refusé. Deux données ou plus →
  calcul normal ; rien → erreur.
- **Usage du profil** : il ne sert aux prédictions que si les données sont insuffisantes (repli ci-dessus)
  ou incohérentes (`coherenceFaible` avec profil renseigné : l'indice d'endurance vient alors du profil,
  la VMA reste celle des données). Si les chronos sont cohérents, le profil est affiché mais non utilisé
  (`profilUtilise`).
- Indice d'endurance : **plus proche de 0 = meilleure endurance**. Repères affichés (`REPERES_IE`) :
  > −4 vitesse à retravailler en priorité ; ]−6, −4] très bonne endurance, vitesse à développer ;
  ]−8, −6] profil équilibré ; ]−10, −8] endurance à développer ; ≤ −10 endurance à développer en priorité.
  Indice entre −2 et 0 : alerte « anormalement proche de 0 » (symétrique de l'alerte sous −14).

## Conventions

- Moteur : fonctions pures, pas d'accès au DOM. Les messages d'erreur et d'alerte sont en français.
- Interface : chaque donnée formatée passe par les helpers `f1`, `f2`, `fDist`, `E.formatAllure`,
  `E.formatTemps`, `E.formatDuree`. Ne pas dupliquer ces formats.
- Les ids DOM utilisés par le script doivent exister dans le HTML.
- Virgule décimale à l'affichage (`toFixed(…).replace('.', ',')`), point en entrée numérique.
- Le code a été réduit deux fois : garder la concision, éviter le code mort et les champs inutilisés.

## Vérifier une modification

Node.js (v24 installé) est dans `C:\Program Files\nodejs\node.exe`, et `node` n'est pas dans le PATH de
certaines sessions : utiliser le chemin complet.

- Syntaxe moteur : `node --check endurance.js`
- Syntaxe du script de la page : extraire le contenu de `<script>…</script>` et lancer `node --check`.
- Non-régression du calcul : comparer les sorties de `calibrerComplet`, `calibrer`, `tablePredictions`,
  `tableDistances`, `zones` avant et après une modification, sur plusieurs jeux de données (exemples,
  contre-performance, VMA connue, profil, erreurs). Les sorties doivent être identiques
  si le calcul n'a pas été modifié intentionnellement.
- Affichage : Edge headless (`msedge.exe --headless=new --screenshot=… --window-size=1280,2600 file:///…`)
  produit une capture lisible. Il impose une largeur minimale d'environ 500 px : pour le téléphone,
  afficher la page dans une `<iframe>` de 390 px. Lancer une capture à la fois, avec un `--user-data-dir` temporaire.

## Exemples de référence

- 5 km 18:30 et 10 km 39:00 : VMA ≈ 17,47 km/h, IE ≈ −6,4, allure 1 h ≈ 4:02/km.
- 4000 m 14:00 et 10 km 37:00 : VMA ≈ 17,95 km/h, IE ≈ −5,3, 5 km prédit ≈ 17:44.

## Points ouverts

- Valider les coefficients du profil (`ANCRES`) et la pertinence de l'effet âge.
- Affichage téléphone vérifié en capture à 390 px ; reste à tester sur un vrai appareil (saisie tactile).
- Les tests de non-régression ne sont pas dans le projet : les ajouter si le projet doit évoluer.
