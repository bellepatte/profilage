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
  Barre des zones : repères des allures prédites (distances standard, `.repere`) ; libellés courts (`COURTS`) sur deux rangs
  alternés au-dessus (`#reperes`), détail en info-bulle.
  Test : bouton caché 🎲 (`#test-aleatoire`, `opacity: 0`, visible au survol) juste à droite du titre : remplit la saisie avec un
  coureur aléatoire (1 à 4 chronos tirés du modèle ±2 %, parfois contre-performance, VMA ou profil).
- `endurance.js` : moteur de calcul, pur JavaScript, sans DOM. Exporte `window.Endurance`
  (et `module.exports` pour les tests Node).

- Deux onglets (`VUES`, choix mémorisé en `localStorage` clé `vue`, les anciennes valeurs `equilibre` / `plan` mènent au
  second) : « 1. Profil et zones » (point d'entrée, inchangé) et « 2. Entraînement » (`#vue-entrainement`), en 6 blocs :
  1. Semaine d'entraînement (jours de course `pl-seances`, doublés, moment de l'intensité, volume moyen en h ou km),
  2. Allure cible (balance.js), 3. Répartition par zone (balance.js), 4. Plan d'entraînement (bascule « Selon ma répartition »
  / « Méthode d'entraîneur », semaines, cycle, difficulté, méthodes), 5. Récapitulatif et export, 6. Semaine par semaine.
- `balance.js` : répartition du volume et de la charge (TSS) hebdomadaire entre les 6 zones selon l'allure cible. Exporte
  `window.Balance.setProfil(res)`, appelé par `rendre()` à chaque calcul réussi : VMA, indice et zones viennent de `Endurance`
  (aucune saisie de VMA/IE dans Balance). Le dernier profil est mémorisé (`localStorage`, clé `balance`) ; sans profil, seules
  les proportions et l'unité saisie s'affichent. Ids DOM préfixés `eq-`. Le dossier `balance/` (projet d'origine, non versionné)
  n'est plus utilisé.
- `plan.js` : plan d'entraînement (ids préfixés `pl-`, choix mémorisés en `localStorage` clé `plan`). Lit `Balance.contexte()`
  (allure cible, volume hebdomadaire en h, parts par zone, profil) et se recalcule à l'événement `balance` émis par
  `balance.js` à chaque rendu ; remplit la colonne « Plan / sem. » du tableau de répartition (`eq-plan0..5`, `eq-planTot`) ;
  expose `window.Plan.donnees()` (plan affiché, textes sans balises, étapes). Voir « Plan d'entraînement » ci-dessous.
- `export.js` : boutons `#pl-export` (data-format) : PDF (= `window.print()`, CSS `@media print` : blocs `.pas-imprimer`
  masqués, semaines dépliées et titre `#impression-titre` le temps de l'impression), CSV (« ; », virgule décimale, BOM),
  Excel (.xlsx minimal écrit à la main : feuilles Plan, Répartition, Paramètres, chaînes en ligne), JSON, montres (archive
  .zip sans compression d'un fichier FIT « workout » par séance : file_id, workout, workout_step ; durées en temps, cibles
  d'allure en vitesse, répétitions en étape « repeat until steps complete »). Pour Garmin : copier les .fit dans
  `GARMIN/NewFiles`. Vérifié : structure et CRC par un décodeur indépendant, .xlsx ouvert par Excel ; pas encore testé sur
  une vraie montre.

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

- **Allure cible** (remplace l'ancien objectif) : `state.goal` = allure de référence (`GOALS` : 5 km, 10 km, semi, marathon,
  boutons `#eq-presets`) ou `'perso'` avec `state.pct` (fraction de l'allure 1 h), placée en glissant le curseur
  (`#eq-curseur`, `role="slider"`, flèches ± 0,5 %, Maj ± 2 %) sur la barre des zones `#eq-zones` (échelle 50 – 130 %,
  repères des allures de référence) ; aimantée à une allure de référence à moins de 0,4 point (`AIMANT`). Affichage
  (`#eq-cible`) : allure, vitesse, % de l'allure 1 h, zone, temps de soutien théorique T = 6 × exp((v / VMA − 1) / k) et
  distance v × T (hors modèle sous 6 min et au-delà de 5 h). Sans profil, positions estimées avec un profil type
  (`DEFAUT` : VMA 14, indice −7). `rec` et `hard` d'une allure quelconque : interpolés entre les allures de référence voisines
  (`parametres`), constants au-delà du 5 km et du marathon. Contexte du plan : allure de référence la plus proche (`goal`,
  scores et séances des méthodes), `preset` (course en fin de plan seulement pour une allure de référence), temps de soutien
  borné à 6 min – 5 h, `parts` (parts de temps des 6 zones).

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
- Barre de répartition (`eq-bar`) : avec un profil, un repère marque l'allure de l'objectif (prédite) dans le segment de sa zone,
  placé au prorata de sa position entre les bornes de la zone (Z1 et Z6 bornées par `BORNES`) ; libellé allure au-dessus (`eq-repere`).
- Curseurs libres (facile 50–100 %, Z1) ; « auto » les recale. Le TSS de la ligne Total est celui du volume saisi.
- Pas de source trouvée pour un TSS hebdomadaire selon l'expérience : le volume saisi fixe la charge totale.
- Unités : chaque valeur est une fourchette `[bas, haut]` (allure basse à haute de la zone). En km avec profil, le temps total est
  déduit de l'allure médiane de chaque zone. Sans profil en km : pas de temps ni de TSS absolu.

## Plan d'entraînement (`plan.js`)

- **Deux modes** (`state.mode`) : `zones` (par défaut, `ZONES_DOC`) construit le plan sur la répartition de Balance ; `methode`
  affiche les méthodes d'entraîneurs (bloc `#pl-blocMethodes`), qui gardent leur répartition et leurs durées de séances
  (la colonne « Plan / sem. » montre l'écart avec la répartition visée). Plan de 4 semaines par défaut.
- Mode `zones` (`semaineZones`, hypothèses) : minutes d'effort de Z3 à Z6 = volume de la semaine × part de la zone. Z6 sous
  4 min → lignes droites de 20 s après un footing ; allure cible de semi / marathon en Z3-Z4 → une partie dans la sortie longue
  (`SL_SPE`). Blocs par zone (`FORMATS` : répétitions, récupérations, `min` d'un bloc, `seul` pour ouvrir une séance, `max` par
  bloc), scindés s'il reste des séances, regroupés sinon (zone voisine d'abord, `BLOCS_MAX` = 3 par séance, 3 min de trot entre
  blocs) ; ce qui ne rentre pas est signalé (`exces`). La zone de l'allure cible est courue à l'allure cible. `recupZ1` : des
  footings passent en Z1 (récupération) jusqu'au temps de Z1 visé. `bloc` : pas d'affûtage ni de course.
- Chaque séance porte `parts` (minutes par zone : échauffement en Z2, retour au calme et récupérations en Z1, effort dans
  la zone de la séance) et `etapes` (échauffement, effort, récupération, répétitions `{ rep, etapes }`, cibles d'allure en
  min/km) pour les exports ; `enveloppe()` habille toute séance de qualité.

- Blocs 4 à 6 de l'onglet Entraînement : plan (mode, préparation, difficulté ; en mode méthode, cartes compactes : titre,
  pastilles, difficulté ; sous les cartes, résumé et repli « Principes, classement et source »), récapitulatif (alertes,
  tuiles séances / temps / distance / qualité, histogramme, repli « Tableau semaine par semaine », exports), semaine par semaine. Distances estimées par séance (`km`, avec profil) : allure moyenne de la zone (`aZ`, Z1 à 60 %,
  Z6 à 125 % de l'allure 1 h), fractions à leur allure et récupérations en Z1 (`kmS`), course = distance de l'objectif.
- Paramètres : jours de course par semaine (3–7, clé `seances`), doublés (autant que de jours, 6 au plus : `optionsDoubles`
  ramène la valeur si les jours baissent ; le jour de la sortie longue est doublé en dernier ; pas de doublé la semaine de
  course), semaines (4–24), cycle (charge constante, ou x semaines de charge + n de décharge),
  difficulté de la 1re semaine (1–10 : séries courtes et récupérations longues → séries longues et récupérations courtes).
- Calendrier : le niveau monte de `PROGRESSION` (3) jusqu'à l'affûtage. Cycle : +6 % de volume par semaine de charge
  (`CHARGE_PAS`, centré sur 1), décharge à 70 % (`DECHARGE`), une qualité en moins, niveau −1. Affûtage : 1 semaine (0,6) ou
  2 pour semi/marathon si ≥ 10 semaines (0,75 puis 0,55) ; aucune sous 6 semaines. La dernière semaine d'affûtage finit par la course.
- Séances de qualité : 1 (3 séances), 2 (4–5) ou 3 (6–7), plafonné par `maxQ` de la méthode. Fractions : `series()` interpole
  durée de répétition, travail total et récupération (en part de la répétition) selon le niveau, × facteur de volume
  √(h/5) borné à [0,7 ; 1,4]. Échauffement 20 min, retour au calme 10 min. Allures prédites par le moteur (`tablePredictions`).
- Volume facile : sortie longue = max(28 % du volume, 1,5 part), plafond 2 h 30 (Hanson : 26 km) ; le reste en footings égaux,
  de 30 min au minimum et pas plus longs que la sortie longue (alertes « volume juste » et « volume élevé »).
- Doublés : la 2e séance est un footing Z2 de `DOUBLE_PART` (0,6) footing, borné à 20–45 min (`DOUBLE_BORNES`) et pas plus long
  que le footing principal, pris sur le volume facile ; placée d'abord les jours faciles, puis le soir des jours de qualité.
  Affichage par jour. Option « Séance d'intensité les jours de doublé » (`moment` : matin, midi, soir, sans importance par
  défaut ; visible s'il y a des doublés) : `moments()` place la séance de qualité au moment choisi (midi : footing « matin ou
  soir » ; sans importance : pas de libellé, « ordre au choix »). Deux séances de même nature (double seuil norvégien, deux
  footings) restent « Matin / Soir ». Alerte sous `DOUBLE_VOLUME` (7 h/sem.) : à faible volume, les doublés servent peu.
  Affinités (`DOUBLES`, à vérifier) : Canova +0,25, Pfitzinger +0,25, Hanson −0,25, norvégienne +0,75.
- Méthode norvégienne (`doubleSeuil`) : séances `SEUIL_NO_LONG` (5–10 min, allure semi – 30 km) et `SEUIL_NO_COURT`
  (1 min 30 – 3 min, allure 10 – 15 km), récupérations brèves, plus `COTES_COURTES` (Z6). Chaque doublé va d'abord à un jour
  de seuil, avec le soir le format complémentaire (`SEUIL_NO`) ; les doublés restants sont des footings. Travail au seuil
  de la semaine plafonné à `SEUIL_PART` (20 % du volume ; sirpoc : 20 – 25 %). Sans doublé : variante « singles » de sirpoc
  (trois séances sous le seuil : longues, courtes, longues ; pas de côtes), pastille neutre (3e élément de `sansDouble` = 0).
  Difficulté 4/5 ; charge constante +0,25. Rappel d'intensité en `conseil` (italique), distinct de `alerte` (rouge).
  Sources ✔ : Athletics Coach « The Norwegian model of lactate threshold training » (2 – 3 mmol/L, exemples de doubles),
  résumé LetsRun archivé de la méthode sirpoc (sites.google.com/view/sub-threshold : formats, 20 – 25 %, footings ≤ 65 % VMA) ;
  ✗ : entretien Bakken (LetsRun 2026, non lu), Tjelta 2019, Casado et al. 2023.
- **Règle : les fractions sont en durée d'effort, jamais en distance fixe** (une distance fixe change la difficulté selon le
  niveau). La distance « ≈ … m » affichée est indicative, calculée avec l'allure prédite. Les méthodes données en distance
  par leur auteur (Pfitzinger 600 – 1600 m, Tinman 1 km et 200 m, norvégienne 1000 m et 400 m, Hanson, Galloway) sont
  converties en durées ; seul le mile magique de Galloway, un test, reste une distance.
- Options génériques de `DOCTRINES` : `q` d'une phase peut être une fonction du contexte, `footingMax` plafonne les footings,
  `slSi`/`slNote` décident et expliquent l'absence de sortie longue, `lignes` ajoute des accélérations après le premier
  footing de la semaine, `slKm` (nombre ou fonction) plafonne la sortie longue en km, `joursMax` (pastille rouge au-delà),
  `test` ({ id, tous } : séance test toutes les n semaines, à la place de la dernière qualité), `courseMarche` (footings et
  sorties longues en course-marche), `plafonds` ({ ID: part } : temps d'effort d'une séance, hors récupérations (`effort`),
  limité à cette part du volume hebdomadaire), `moyenneLongue` (un footing devient une sortie moyenne-longue de 75 % de la
  sortie longue), `affutage3` (3 semaines d'affûtage pour le marathon si ≥ 12 semaines : 80, 65, 50 % du volume, hypothèse),
  `partQualite`.
- Fitzgerald (80/20) : sa zone 3 (seuil) = allure 1 h, zone 4 (VO2max) = allure 3000 – 5000 m, zone 5 (vitesse) = allure
  1500 m. Base (speed play `FITZ_FARTLEK`, côtes, tempo) puis développement selon l'objectif (5 km : intervalles longs et
  courts ; 10 km : cruise intervals et intervalles longs ; semi et marathon : tempo et cruise intervals). Sortie longue avec
  fin rapide (`SL_FIN` : 10 à 20 min à allure marathon), ou allure de l'objectif pour semi / marathon ; `phase.sl` peut être une
  fonction. `partQualite` = 0,25 : qualité de la semaine (récupérations comprises) plafonnée à 25 % du volume (hypothèse
  pour respecter les 80/20). Cycle +0,25 (récupération toutes les 3 semaines). Difficulté 2/5. Sources ✔ : résumés de lecture
  run.wxm.be (zones en % de FC au seuil, 13 types de séances, durées des plans) et RunCulture (semaine type) ; livre non lu.
- Galloway : course-marche à toutes les sorties, ratio selon l'allure de sortie longue (`allureGalloway` = allure marathon
  + 2 min par mile ; `RATIOS_GALLOWAY` = sa table par mile, de 4 min / 30 s à 8:00 /mile jusqu'à 10 s / 30 s à 16:00 /mile).
  3 jours de course (`joursMax`), footings ≤ 45 min (hypothèse : sorties de semaine courtes), une qualité par semaine
  (`GAL_RYTHME` : 3 à 6 min à l'allure de l'objectif, récupération en marchant ; durées = hypothèse, Galloway donnant des
  distances), mile magique (`GAL_MM`) toutes les 2 semaines, accélérations-glissées. Sortie longue jusqu'à 42 km pour le
  marathon. Doublés −0,5. Difficulté 1/5. Sources ✔ : jeffgalloway.com « Train for a Marathon Finish » (ratios, allure de
  sortie longue, 26 miles, entraînement croisé lundi / mercredi / vendredi) ; ✗ : « Magic Mile » et Active.com (résumés).
- Méthodes retirées à la demande de l'utilisateur, à ne pas rajouter : Coach Patrice ; Brun et Vollmer (valeurs de % de VMA
  fixes, pensées pour le haut niveau et à « minorer » pour les amateurs sans règle précise : jugé pas sérieux).
- Méthodes françaises :
  - Cottereau : endurance ≥ 3/4 du temps, résistance douce (`COT_DOUCE`, ≈ allure marathon – semi ; marathon 2 à 3 × 15 min,
    récupération 7 → 5 min ; sinon 2 × 10 – 12 min) et résistance dure (`COT_DURE`, 3 à 4 min ≈ allure 10 km, récupération égale,
    3 à 4 répétitions, échauffement de Cottereau en `conseil`). Footings ≤ 75 min, sortie longue (≈ 2 h) seulement pour le
    marathon. Indice −0,5 (endurance d'abord). Difficulté 1/5. Les zones de FC sont converties en allures (approximation).
    Sources ✔ (lues) : « Principes de base de l'entraînement » de Cottereau, reproduits sur le forum courseapied.net (msg 135922) ;
    article Esprit Trail « Courir lentement pour progresser, la méthode Serge Cottereau ».
- Autres méthodes (options : `noteProfil(c)` ajoute une ligne sous le résumé ; `slUneSur2` = sortie longue une semaine sur
  deux ; séance paramétrée « ID@arg », nom et zone pouvant dépendre de arg) :
  - Heubi : préparation générale (VMA courte 30 s – 1 min 15 à 100 – 105 %, VMA moyenne, EMA) puis spécifique (EMA, VMA
    longue ou courte, `SPE`, sortie longue avec allure marathon). EMA à `emaPct` = 82,5 + 2,5 × biais d'indice (80 à 85 % de
    VMA). Récupération active à ≈ 50 % de VMA. Cycle +0,5 (3 semaines + 1 de relâchement). Difficulté 3/5.
    Sources ✔ : brunoheubi.com (« La préparation générale », « La préparation spécifique », « La séance de VMA… »).
  - McMillan : zones Endurance / Stamina (`MC_STEADY`, `MC_TEMPO`, `MC_TEMPO_INT`, `MC_CRUISE`) / Speed (`MC_SPEED`) / Sprint
    (lignes droites) ; allures par durée de course (`allureT`). Type de coureur déduit de l'indice (`typeMcMillan` : biais
    ≥ 1/3 Endurance Monster, ≤ −1/3 Speedster, sinon Combo) : `selonType` met la vitesse en tête (Speedster) ou en fin
    (Endurance Monster). Cycle +0,5 (3 en hausse, 1 en baisse). Difficulté 2/5. Sources ✔ : mcmillanrunning.com (six étapes,
    zones et séances, types de coureur).
  - Tinman (Tom Schwartz) : `TIN_CV` (5 à 7 × 3 min à la vitesse critique ≈ allure tenue 30 à 40 min, 1 min de trot, puis
    4 à 6 × 40 s à allure 1 mile, au lieu des 200 m d'origine), tempo, lignes droites ; peu de VO2max ; 2 jours durs, 4 faciles.
    Charge constante +0,25. Difficulté 2/5. Sources ✔ : Fast Running « Critical Velocity Training », Ward Nicholson (système
    Tinman, partie 2), forum Running Ahead (Masters, CV ≈ allure tenue 35 à 45 min, ≈ allure 10 km) ; PDF de Schwartz illisible.
  - Magness : entonnoir (`entonnoir`, `ECHELLE_MAG`) : phases Générale (sprints en côte `MAG_SPRINTS`, steady), Entonnoir 1 à 3
    (une allure lente et une rapide qui se rapprochent de l'objectif, séance `MAG@distance`), Spécifique. Difficulté 4/5.
    Sources ✔ : « My Training History Manifesto » (stevemagness.org), « Funnel periodization » (All Things Running, résumé
    secondaire) ; livre The Science of Running non lu.
  - Kellogg : phases Base, Base et seuil, Anaérobie ; séances décrites dans la consolidation LetsRun ci-dessous. Sortie longue
    une semaine sur deux (synthèse, non trouvée dans ses textes). Indice −0,25. Difficulté 4/5.
  - Les accélérations de la méthode (`lignes`) ne s'ajoutent pas une semaine qui a déjà une séance de lignes droites.
- Méthodes (`DOCTRINES`) : Daniels, Lydiard, Seiler (polarisé), Pfitzinger, Hanson, Canova, Billat, norvégienne, Cottereau,
  Heubi, McMillan, Tinman, Magness, Kellogg, Galloway, Fitzgerald ; chacune a des phases
  (séances de qualité par priorité, type de sortie longue) et un score par objectif, corrigé par le biais d'indice d'endurance
  (même formule que Balance), le nombre de séances (Hanson ≥ 5) et le type de cycle (`CYCLES` : Daniels et Lydiard +0,25 en
  charge constante ; Pfitzinger +0,5 en cycle, −0,25 en constante ; Hanson +0,5 en constante, −0,5 en cycle ; Canova +0,25 en
  cycle ; lecture des principes généraux des auteurs, à vérifier). `facteurs()` détaille le score : une pastille par facteur
  (verte favorable, rouge défavorable, explication en info-bulle) et une phrase « Classement pour vous » sous la méthode
  choisie. Pastille rouge (`rouge`) : objectif peu adapté (≤ 1,5) ou autre facteur négatif non `neutre`. Classement : méthodes
  sans rouge d'abord, parmi elles les plus simples à mettre en œuvre (`PROFILS[].mise` : simple, moyenne, complexe), puis par
  score ; les 2 premières de la liste affichée sont « Conseillées » (si toutes ont du rouge, les 2 meilleures).
  Niveau et volume (hypothèses) : `niveauCoureur` (débutant sous 3 h / semaine ou VMA < 12 km/h, confirmé dès 6 h et VMA ≥ 15,
  sinon intermédiaire ; difficulté acceptée 2, 3 ou 5) ; pastille rouge si la difficulté dépasse le niveau, ou si le volume
  ou les jours de course sont sous `PROFILS[].h` / `.j` (remplace l'ancien `seancesMin` de Hanson) ; pastille « mise en
  œuvre » neutre (+0,3 simple, −0,3 complexe). Niveau estimé affiché dans la ligne de contexte.
  Filtres cumulables (`FILTRES`, `state.filtres`, boutons `#pl-filtres`) : simples, complexes, débutants (difficulté ≤ 2 et
  ≤ 3 h), confirmé(e)s (difficulté ≥ 4 ou ≥ 6 h), épreuves courtes (score 5 ou 10 km ≥ 2,5), longues (semi ou marathon ≥ 2,5),
  très longues (`tresLongue` : Galloway, Cottereau, Fitzgerald, Lydiard, Heubi, Hanson, Pfitzinger), ultra (`ultra` :
  Cottereau, Heubi, les seuls dont l'auteur prévoit le 100 km), universelles (score ≥ 2 sur les quatre objectifs).
  Note de difficulté par méthode (`difficulte` : [1–5, justification], libellés `NIVEAUX_METHODE` de Débutant à Avancé) :
  Seiler 1, Lydiard 2, Daniels 3, Billat 4 (fractions longues à VMA très éprouvantes, le reste accessible), Pfitzinger 4,
  Hanson 4, Canova 5, norvégienne 4, Cottereau 1, Heubi 3, McMillan 2, Tinman 2, Magness 4, Kellogg 4, Galloway 1, Fitzgerald 2. Appréciation, n'influe pas sur le classement. Une séance peut porter un avertissement (`alerte`,
  ex. `VMA_TLIM`), affiché en rouge dans sa description.
- **Hypothèses à valider** : tous les nombres de `SEANCES`, `SPE`, les phases, scores et la progression sont des choix de
  conception inspirés des principes publiés, pas les plans des auteurs. Sans profil, pas d'allures (temps de course estimé à 10 km/h).
- Consolidation des sept premières méthodes (recherche du 20/10/2026, sources secondaires ; livres non lus) :
  - Daniels : I de 3 à 5 min (`VMA_LONG`), T 1 min de récupération pour 5 min (`SEUIL`), R ≤ 2 min et récupération 2 – 3 fois la
    durée ; plafonds par séance T 10 %, I 8 %, R 5 % du volume (`plafonds`, appliqués au temps), M ≤ 20 %, sortie longue ≤ 2 h 30.
    ✔ coachray.nz « Jack Daniels running intensity », notes Goodreads, forum Running Ahead.
  - Lydiard : base 8 – 12 semaines au moins, côtes 3 – 6 semaines en circuits trois fois par semaine (`LYD_CIRCUIT`),
    anaérobie ≤ 4 semaines avec contre-la-montre plus courts que la course (`LYD_TT`, moitié du temps de course).
    ✔ CoachTheRun « What is the Lydiard Method », Wikipedia « Arthur Lydiard », forum boards.ie.
  - Seiler : 4 × 8 min, 2 min de récupération, meilleure progression (36 cyclistes de loisir, ≈ 40 ans, 6 h / semaine).
    ✔ TRUE Fitness (résumé de l'étude), forum TrainerRoad ; article original non lu.
  - Pfitzinger : VO2max 800 – 1600 m (600 m les semaines de course), semaine type 4 jours de récupération + seuil + longue +
    moyenne-longue (`moyenneLongue`), affûtage de 3 semaines (`affutage3`). ✔ Running with Rock « Pfitz Marathon Training
    Plans Explained », Goodreads, RoadTrailRun (4e éd. 2025), blog The Size15 Runner ; ✗ allure LT exacte et 50 – 90 %.
  - Hanson : 6 jours, SOS (vitesse/force, tempo à allure marathon, sortie longue ≤ 16 miles), peu d'entraînement croisé.
    ✔ Marathon Handbook ; force à allure marathon − 10 s par mile : voir LetsRun ci-dessous.
  - Canova : progressifs (`CAN_PROG@1|2|3` : 60 – 90 min de 85 à 100 %, 45 – 60 min de 95 à 105 %, 20 – 40 min de 102 à 108 % de
    la vitesse marathon), réservés au semi et au marathon. ✔ Fast Running (définition des progressifs selon Canova) ;
    ✗ Arcelli & Canova 1999 (phases et % détaillés, non trouvé).
  - Billat : 30-30 (≈ 10 min à VO2max), fractions de la moitié du temps limite (`VMA_TLIM` ≈ 3 min, Tlim = 6 min dans le modèle) ;
    études sur 8 à 11 sujets, avantage du ½ Tlim seulement tendanciel. ✔ résumés HAL Montpellier, Serval (UNIL), Springer.
  - Forum LetsRun lu via Claude in Chrome (WebFetch y reçoit une erreur 403 ; passer par le navigateur de l'utilisateur) :
    - Kellogg, « The Training Wisdom of John Kellogg » (thread 192559, son texte) ✔ : progressifs jusqu'à l'état stable maximal
      (`KEL_STEADY`), 2 – 3 séries de 5 – 6 lignes droites progressives de 15 – 35 s (`KEL_LD`), 10 – 15 × 1 min à allure 2 miles
      toutes les 2 – 3 semaines (`KEL_RELAX` en `test` tous les 3), seuil en fractions 8 – 15 × 3 min à 2 × 20 min (`KEL_SEUIL`,
      extraits de recherche), semaines hautes / basses (cycle +0,25), doublés en base (+0,5), anaérobie 6 – 8 semaines, 2 pics par an.
    - Canova, « Does it matter how fast you do your long runs? » (thread 1363335, son message) ✔ : séances `CAN@110|105|100|95|90`
      pour 5 et 10 km, en % de la vitesse de course à sa façon (105 % = allure − 5 %), volumes en multiples du temps de course ;
      « Summary of Renato Canova principles » (4036906) ✔ ; blocs spéciaux marathon (threads 4660144, 6778559) non repris.
      `partQualite` 0,3 pour Canova (hypothèse : ses volumes sont ceux d'élites).
    - Hanson : force = allure marathon − 10 s par mile (table 3.4 du livre citée dans les fils 2653585 / 5514948, extraits de
      recherche ✔) ; formats 6 × 1 mile à 2 × 3 miles, 400 – 800 m de trot (`FORCE`, récupération ≥ 2 min 30).
  - Aucune source trouvée sur courseapied.net pour Heubi ni Cottereau (en dehors du texte de Cottereau) ; sur Reddit / forums :
    80/20 (zone 2 traitée comme le facile), McMillan (séance « marqueur » jugée dure, volume jugé bas), Pfitzinger 18/55
    (prérequis ≈ 40 – 45 miles / semaine).

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
  Edge headless peut refuser de démarrer (journal : « Edge is running elevated ») : tester alors la logique dans Node avec un
  DOM simulé (charger `endurance.js`, `balance.js`, `plan.js` dans un contexte `vm`, simuler `getElementById` et les événements).

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
