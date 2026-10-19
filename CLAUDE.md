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

- `balance.js` : répartition de la charge (TSS) hebdomadaire entre les 6 zones selon l'objectif (5 km, 10 km, semi,
  marathon). Affichée dans le second onglet de `index.html` (« Répartition du volume », choix mémorisé en
  `localStorage` clé `vue`). Exporte `window.Balance.setProfil(res)`, appelé par `rendre()` à chaque calcul
  réussi : VMA, indice et zones viennent de `Endurance` (aucune saisie de VMA/IE dans Balance). Le dernier profil
  est mémorisé (`localStorage`, clé `balance`) ; sans profil, seules les proportions et l'unité saisie s'affichent.
  Ids DOM préfixés `eq-`. Le dossier `balance/` (projet d'origine, non versionné) n'est plus utilisé.

Il n'y a pas de build, pas de gestionnaire de paquets, pas de tests versionnés.

## Modèle (forme simplifiée de Péronnet & Thibault)

Référence citée dans le sous-titre de la page : Péronnet F., Thibault G., *Mathematical analysis of running
performance and world running records*, J Appl Physiol 1989 (doi:10.1152/jappl.1989.67.1.453).

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
- **Profil** (`estimerIE`) : point de départ −7,2 (indice médian), effets du volume et de l'âge
  (`ANCRES` interpolés linéairement) et du sexe (`EFFET_SEXE` : femme +0,3, homme −0,2), incertitude ±2,5
  plus 0,5 par facteur manquant. Bornes −14 à −2. Coefficients ajustés sur 1 848 coureurs amateurs
  (Vickers & Vertosick, *BMC Sports Sci Med Rehabil* 2016, données publiques) : indice qui remonte avec
  le volume (≈ 2,3 points de < 20 à > 100 km/sem) et après 50 ans, plus bas avant 25 ans. Ces facteurs
  n'expliquent qu'environ 7 % des écarts entre coureurs (erreur moyenne ≈ 2,1 points) : le profil reste
  très approximatif. Fréquence, expérience et reprise ont été retirées (non validables) ; fractionné et
  tempo non retenus (le public visé en fait). La référence (lien DOI) est citée dans le profil et sous l'estimation.
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

## Répartition du volume et charge (Balance, `balance.js`)

On répartit le **volume** (temps) entre les zones ; le **TSS** (Coggan) en découle et sert de contrainte d'équivalence.

- Zones de Profilage (% de l'allure 1 h = FTP). Z1 et Z6, ouvertes, sont bornées à 50 % et 130 % (`BORNES`) pour convertir temps
  et distance. IF de la zone = allure médiane (milieu des bornes) / allure 1 h, sauf Z1 fixée à 60 % et Z6 à 125 % (`IF_FIXE`) ;
  la même vitesse médiane sert à convertir temps ↔ distance. TSS d'une zone = durée (h) × IF² × 100 (coût par heure croissant de Z1 à Z6).
- **Base : 80 % du volume en Z1+Z2** (`EASY_BASE`) : ≥ 80 % du volume en faible intensité chez les coureurs de très haut niveau (Haugen et
  al. 2022, voir Sources) ; plancher `EASY_BORNES` = 70 (revue de Campos et al. 2022, à vérifier), plafond 95.
- **Modulation par objectif** : la charge par heure de référence (`cible`) est celle de la base (80 % facile, 15 % de Z1,
  répartition d'intensité du 10 km). Pour chaque objectif, `eAuto` est la part facile e telle que
  e × coût(facile) + (1 − e) × coût(intensité) = cible : un objectif qui charge Z5/Z6 (5 km) a moins de volume d'intensité qu'un objectif
  centré sur Z3 (marathon, ≈ 70–75 % facile). Le TSS par heure est donc identique d'un objectif à l'autre (≈ 60 TSS/h, ≈ 300 pour 5 h).
- **Volume** : `cible` est multipliée par 0,95 à chaque doublement du volume hebdomadaire au-delà de 5 h (`CHARGE_PAR_DOUBLING`, `REF_HOURS`)
  et divisée de même en dessous : à fort volume, charge par heure plus basse donc plus de facile ; à faible volume, moins de facile
  (davantage de temps de récupération). Heures : volume en h, ou km / (0,72 × VMA, sinon 10 km/h). Ex. 5 km, IE −8,8 : 78 % à 2,5 h, 92 % à 20 h.
- **Allure de l'objectif dans l'endurance** (`recObjectif`) : les poids de Z1 et Z2 sont multipliés par 1 + 2 × gaussienne (`SPECIFIQUE_FACILE`,
  même écart-type) autour de l'allure de l'objectif, issue du profil ; si elle est en Z2 (ex. marathon avec VMA 10 et mauvais IE), la part de
  Z1 conseillée baisse (≈ 9 % au lieu de 12 %) au profit de Z2. L'intensité se recentre sur la zone la plus proche de l'allure de course.
  Dans ce cas (allure de l'objectif < 80 % de l'allure 1 h), l'équivalence de charge est abandonnée : la part facile est au moins 
  `EASY_BASE` (80 %) et le TSS de l'objectif est donc inférieur aux autres.
- Composition de l'intensité : `GOALS[].hard` (parts de volume entre Z3..Z6) recentré par un poids gaussien (`PACE_SPREAD` = 0,15)
  autour de l'allure de l'objectif (fraction de l'allure 1 h, prédite par le moteur). Part de Z1 dans l'endurance : `GOALS[].rec`.
- **Indice d'endurance** : `biaisIE()` = (IE + 7) / 3 borné à [−1 ; 1] (0 sans profil). Mauvais IE (≤ −10) → intensité tirée vers Z3/Z4
  (aérobie) ; bon IE (≥ −4) → vers Z5/Z6 (vitesse) : poids × exp(biais × `HARD_PENTE_IE` × (rang − 1,5)). Il ne modifie pas directement
  la part facile (seulement via la charge). Message `eq-biais`. Coefficients = hypothèses, à valider.
- Curseurs libres (facile 50–100 %, Z1) ; « auto » les recale. Le TSS de la ligne Total est celui du volume saisi.
- Pas de source trouvée pour un TSS hebdomadaire selon l'expérience : le volume saisi fixe la charge totale.
- Unités : chaque valeur est une fourchette `[bas, haut]` (allure basse à haute de la zone). En km avec profil, le temps total est
  déduit de l'allure médiane de chaque zone. Sans profil en km : pas de temps ni de TSS absolu.

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

- Syntaxe moteur : `node --check endurance.js` (idem `balance.js`)
- Syntaxe du script de la page : extraire le contenu de `<script>…</script>` et lancer `node --check`.
- Non-régression du calcul : comparer les sorties de `calibrerComplet`, `calibrer`, `tablePredictions`,
  `tableDistances`, `zones` avant et après une modification, sur plusieurs jeux de données (exemples,
  contre-performance, VMA connue, profil, erreurs). Les sorties doivent être identiques
  si le calcul n'a pas été modifié intentionnellement.
- Affichage : Edge headless (`msedge.exe --headless=new --screenshot=… --window-size=1280,2600 file:///…`)
  produit une capture lisible. Il impose une largeur minimale d'environ 500 px : pour le téléphone,
  afficher la page dans une `<iframe>` de 390 px. Lancer une capture à la fois, avec un `--user-data-dir` temporaire.

## Sources de la répartition (Balance)

Vérifiées en lisant la page (✔) ou connues seulement par un résumé secondaire (✗, à confirmer avant de s'en servir comme argument) :

- ✔ Haugen T., Sandbakk Ø., Seiler S., Tønnessen E., *The Training Characteristics of World-Class Distance Runners: An Integration of
  Scientific Literature and Results-Proven Practice*, Sports Med Open 2022, doi:10.1186/s40798-022-00438-7 (PMC8975965). Marathoniens et
  coureurs de piste de classe mondiale : ≥ 80 % du volume en faible intensité toute l'année ; zone 3 (modérée) 5–15 % et zones 4–5 5–15 %
  du volume ; les marathoniens augmentent la zone 3 en se rapprochant de la course, les coureurs de piste augmentent les zones 4–5 et
  réduisent la zone 3 ; volumes de 160–220 km/sem (marathon) et 130–190 km/sem (piste). Cas isolés : Kipchoge 82–84 % / 9–10 % / 7–8 % en
  préparation générale, ≈ 91 % / 3 % / 6 % en préparation spécifique ; Longosiwa (5000 m) 85–86 % / 7–8 % / 6–8 %. Données surtout d'hommes
  de haut niveau : peu transposable tel quel aux amateurs.
- ✔ Stöggl T., Sperlich B., *The training intensity distribution among well-trained and elite endurance athletes*, Front Physiol 2015,
  doi:10.3389/fphys.2015.00295 (PMC4621419). Les études rétrospectives montrent surtout une distribution pyramidale, avec environ 70–95 % du
  temps en faible intensité.
- ✗ Seiler S., Kjerland G.Ø., Scand J Med Sci Sports 2006 (≈ 80 % faible / 20 % élevée chez des athlètes d'élite) : connu par résumé secondaire.
  Seiler précise (selon un résumé) que le 80/20 décrit la répartition des séances plus que celle du temps.
- ✗ Esteve-Lanao et al. 2005 (coureurs de fond sur 6 mois : zone 1 très majoritaire, liée aux temps de course) ; Muñoz Pérez et al. 2014
  (10 km, 30 coureurs récréatifs, 10 semaines : polarisé 77/3/20 contre 46/35/19, +5,0 % contre +3,6 %, écart non significatif).
- ✗ Campos, Casado et al. 2022 (revue systématique, coureurs de demi-fond et fond) : au moins ~70 % du volume en faible intensité ;
  PubMed 35418513 (page non lue). Sert de plancher à `EASY_BORNES`.
- ✗ Limites par séance attribuées à Daniels (seuil ≤ 10 % du kilométrage, intervalles ≤ 8 %, répétitions ≤ 5 %, aérobie ≥ 80 %) : relevées sur
  un forum, non vérifiées dans le livre, **non utilisées**.
- TSS (Coggan) : TSS = durée × IF² × 100 ; un article de TrainingPeaks note que 1 TSS de vélo n'équivaut pas à 1 rTSS (course), plus
  contraignante pour l'organisme. Aucune source solide trouvée pour une charge hebdomadaire par niveau d'expérience (les fourchettes de
  sites de calcul se contredisent) : le volume saisi fixe la charge totale.

**Ce qui est sourcé et ce qui est une hypothèse** : sont sourcés le ≥ 80 % de faible intensité (élite) et le sens qualitatif par objectif
(marathon : plus de zone 3 ; 5 et 10 km : zones 4–5). Sont des **hypothèses à valider** (aucune source) : les valeurs numériques de `GOALS`
(`rec`, `hard`), `PACE_SPREAD`, `HARD_PENTE_IE`, `IE_NEUTRE`, `CHARGE_PAR_DOUBLING` (effet du volume sur la part facile ; la
littérature citée décrit des élites, pas ce gradient), `SPECIFIQUE_FACILE`, `REF_OBJECTIF`/`REC_REF` et le principe d'équivalence de
charge entre objectifs (choix de conception, pas un résultat de recherche).

## Exemples de référence

- 5 km 18:30 et 10 km 39:00 : VMA ≈ 17,47 km/h, IE ≈ −6,4, allure 1 h ≈ 4:02/km.
- 4000 m 14:00 et 10 km 37:00 : VMA ≈ 17,95 km/h, IE ≈ −5,3, 5 km prédit ≈ 17:44.

## Points ouverts

- Coefficients du profil ajustés sur une population américaine recrutée en ligne (temps déclarés) :
  à confirmer sur des coureurs du public visé si des données sont disponibles.
- Affichage téléphone vérifié en capture à 390 px ; reste à tester sur un vrai appareil (saisie tactile).
- Les tests de non-régression ne sont pas dans le projet : les ajouter si le projet doit évoluer.
