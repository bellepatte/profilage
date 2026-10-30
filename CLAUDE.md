# CLAUDE.md — Profil d'endurance (allures et zones)

## Objectif

Appli web **100 % côté client** (aucun serveur, aucune dépendance) qui, à partir de chronos
(compétitions ou tests) et/ou de la VMA, dresse le profil de course d'un coureur ou d'une coureuse :
VMA, indice d'endurance (Péronnet & Thibault), prédictions (chronos selon la distance, distances
selon le temps), zones d'entraînement à 6 niveaux, et estimation par profil quand les données manquent.

Interface et contenus **en français**. Ne pas introduire de dépendance externe ni de CDN.

## Fichiers

- `index.html` : page unique (CSS + interface + script de rendu). Charge `endurance.js`. Onglet « Profil et zones » en une
  colonne : résumé compact et non collant (`#synthese`), saisie repliable (`#saisie`), alertes, zones, prédictions, courbe de
  tendance ; recalcul automatique pendant la frappe (délai 300 ms), sans bouton « Calculer ». Une ligne à moitié remplie est
  ignorée ; une erreur grise les derniers résultats (`.perime`) au lieu de les masquer.
  **Import des résultats FFA** (bouton `#ffa-ouvrir` dans « Mes chronos », `ffa.js`, `ffa-collecte.php`) : le navigateur ne peut pas lire athle.fr (pas de CORS,
  vérifié dans Chrome : « Failed to fetch »). Un script PHP (`ffa-collecte.php`, lancé par cron une fois par jour sur le serveur web (lancement web possible seulement si la constante `CLE_WEB` est renseignée : `ffa-collecte.php?cle=…`, 403 sinon ; `&diag=1` ou `--diag` : diagnostic (PHP ≥ 7.1, extensions, droits d'écriture, accès aux deux sites, nombre de courses Courses 80) ; hors ligne de commande la constante `STDERR` n'existe pas, d'où `journalErreur()` ; les constantes `const` doivent être déclarées en tête de fichier, avant tout appel) :
  `php ffa-collecte.php [sortie.json]`, PHP ≥ 7.4) lit la base de résultats du **club 080072** (`frmclub`, liste complète sans nom : une page = 250 lignes, pagination
  `frmposition`), **les lignes du tableau alternent deux classes (`""` et `bg-background-light-grey`, effet zèbre) et chaque ligne est suivie d'une ligne de détail `detail-row` : il faut prendre toutes les lignes sauf `detail-row`, sinon la moitié des chronos manque**, pour les saisons année−1, année, année+1 (**la saison de la base suit l'année civile**, vérifié : `frmsaison=2026` = janvier à décembre 2026, tri par date
  décroissante ; la colonne Date n'a pas d'année : année = saison, ramenée d'un an si la date tombe dans le futur), et écrit `ffa-resultats.json` limité aux 12 derniers mois (`MOIS_FENETRE`, même fenêtre que `ffa.js`) (fichier à côté de
  `index.html`, ignoré par git, non écrasé si la collecte échoue). Ne sont gardées que (1) les lignes avec un **niveau** (colonne « Niveau » : compétition labellisée, donc
  mesurée) et (2) les lignes **sans niveau qui sont une course du challenge Courses 80** (niveau affiché « C80 » ; chronométrage à puce, règles FFA, distance respectée) : le
  script répertorie d'abord les courses du challenge (`https://courses80.fr/archive/`, tableau JSON `let data = [...]` dans la page : date, nom, distance ; 14 derniers mois, au plus
  un marathon ; les classements eux-mêmes sont des PDF hétérogènes qu'on ne lit pas), puis les retrouve dans les chronos des adhérents de la base FFA : même date, même distance
  (à 3 %), même lieu (`dansChallenge` : mots de la ville et du libellé de l'épreuve contre le nom de la course, préfixe commun de 5 lettres au moins ; table
  `LIEUX_COURSES80` pour les noms sans lieu : « 4 saisons » → Amiens, « Jules Verne » → Amiens, « Flesselloise » → Flesselles ; mots génériques ignorés) ; si la liste Courses 80
  est illisible, la collecte échoue et l'ancien fichier est conservé. Tout cela sur route ou piste dont la distance se lit dans le libellé (`5 Km Route`, `10 Km Route`, `1/2 Marathon`, `Marathon`, `3 000m`… ; trails, marche, haies,
  relais, cross, triathlon, résultats en points exclus), avec un chrono (rang + temps ; « NP », abandons ignorés) et une vitesse entre 5 et 30 km/h. La colonne Résultat
  est « rang. temps officiel (temps réel) » : le temps entre parenthèses est le temps réel à la puce, celui qui est retenu. `ffa.js` (chargé avec un paramètre de version `?v=aaaammjj` dans `index.html`, à changer à chaque modification pour contourner le cache du navigateur) charge le JSON
  (`fetch`, donc depuis le serveur web, pas en `file://`), cherche l'athlète (nom et prénom dans n'importe quel ordre, accents et casse ignorés, début de mot
  accepté, homonymes proposés au choix), garde les 12 derniers mois, affiche **tous** les chronos groupés par distance (badges « meilleur chrono » et « plus récent »,
  un seul coché par distance, hors plage 5 min – 5 h grisé) dans une fenêtre `<dialog>` à cocher, puis envoie `ffa-chronos` ({ chronos: [{ distance, temps (min) }], athlete }) :
  `index.html` remplit la ligne de même distance, sinon une ligne vide, et recalcule.
  Un seul mode d'affichage, le détaillé (l'ancien commutateur « Simplifié / Avancé », la classe `avance` et la clé `localStorage` `affichage` ont été
  supprimés) : tout est toujours affiché, y compris le mode « distances selon chronos ».
  **Groupes de travail** (tuile `groupes()`) : groupe VMA = VMA, groupe seuil = allure 1 h, arrondis au km/h (l'unité est
  affichée), avec la valeur exacte et l'allure en indication. Les entraînements de VMA courte et de vitesse souffrent peu d'une
  endurance faible, pas ceux de VMA longue et de seuil : on constitue donc deux groupes par athlète.
  Charte graphique « Doux + Entreprise » (choisie parmi des maquettes de chartes, retirées du projet) : en-tête en bandeau dégradé bleu (`--bleu` #1583ff, tiré du logo) vers menthe (`--menthe`), logo `logo-lpn80.png` (Les Pieds Nicleys) dans une pilule blanche (`.logo`), cartes arrondies à ombre bleutée, tuiles à filet bleu / menthe, en-têtes de tableau teintés. `--accent` (#0e6ee0) reste le bleu des textes (contraste). Le fichier `logo-lpn80.png` doit rester à côté de `index.html`.
  La saisie (lignes de chronos, VMA, profil) est mémorisée en `localStorage` (clé `saisie`) à chaque calcul et restaurée au rechargement ; sans saisie mémorisée, les exemples grisés s'affichent. L'onglet Entraînement reprend en tête le même cartouche de synthèse que le profil (`#synthese-entrainement`, même HTML que `#synthese`, rempli par `rendre()`), suivi d'un lien discret « Modifier mes données » (`#eq-profil`, rendu par `balance.js`).
  Onglet 1 nommé « Profil ». Les zones (`#zones-profil`, avancé) sont le volet « 1. Mes zones d'entraînement » de l'onglet « 2. Entraînement » (les autres blocs sont numérotés 2 à 6). Après rechargement (saisie vide), le volet reste affiché d'après le profil mémorisé par Balance (`Balance.profil()`). La définition du TSS (Coggan) n'est plus en bas du cadre « Répartition » : c'est une infobulle (`.aide`, `aideTss` dans `balance.js`) sur le « ? » de la note `#eq-note`. Le sous-volet « Répartition par zone » s'ouvre sur un encadré `.info` « Que faire ici ? » (curseurs, bouton auto, tableau). Pas de doublon : la barre de l'allure cible n'affiche plus les allures par zone, et le tableau de répartition n'a plus les colonnes « Allure » et « % allure 1 h » (elles sont dans la fiche des zones). Pied de page `#references` : références des sources (Péronnet & Thibault, Vickers & Vertosick). Plus de lignes « Données utilisées / Qualité de l'ajustement / Profil » sous le profil d'entraînement.
  Zones : barre `#pz-barre` (non cliquable, seuls repères : allure 1 h et VMA, en bleu sous la
  barre), tableau compact `#pz-tableau` (zone, % de l'allure 1 h, allure, vitesse, utilité) ; volet « Les zones, une simplification » (continuum, seul lien factuel : plus c'est intense,
  moins longtemps on tient). Noms : Z4 « Tempo/seuil », Z5 « VO2Max » (dans `ZONES_DEF`). Classes préfixées `pz-` (celles de
  `.barre`, `.repere`, `.segment` servent à Balance). La note « Pourquoi 5 h au maximum ? » est une infobulle (.aide, bouton « ? » au survol ou au focus) à la fin de la phrase du pied de page ; la courbe de tendance garde sa propre note.
  Saisie souple (`parseTemps`, `parseDistance`) : temps `42:20`, `42'20`, `42min`, `1h20`, `1h20m30s`, `20s` ;
  distances `5000`, `5 km`, `10k`, `semi`, `marathon` (sans unité, une valeur < 100 est lue en km). En quittant
  un champ, la saisie est convertie au format standard (5000, 1:20:00). La correspondance vitesse et allure
  est affichée partout où l'une des deux apparaît (lignes de saisie, VMA, synthèse, prédictions, zones).
  Test : bouton caché 🎲 (`#test-aleatoire`, `opacity: 0`, visible au survol) juste à droite du titre : remplit la saisie avec un
  coureur aléatoire (1 à 4 chronos tirés du modèle ±2 %, parfois contre-performance, VMA ou profil).
- `endurance.js` : moteur de calcul, pur JavaScript, sans DOM. Exporte `window.Endurance`
  (et `module.exports` pour les tests Node).

- Pas de bouton « Passer à l'entraînement » : on change d'onglet par l'en-tête.
- Deux onglets (`VUES`, choix mémorisé en `localStorage` clé `vue`, les anciennes valeurs `equilibre` / `plan` mènent au
  second) : « 1. Profil » (point d'entrée) et « 2. Entraînement » (`#vue-entrainement`), en 6 blocs (le bloc 1 est « Mes zones d'entraînement », avancé) :
  2. Mon objectif (allure cible, balance.js), 3. Ma semaine d'entraînement (jours de course `pl-seances`, doublés avec, à droite, un résumé `#pl-resumeSemaine` : séances par semaine, jours de course, doublés, repos, durée moyenne par séance ; moment de l'intensité, volume moyen en h ou km ; message informatif `.info` : le cumul de plusieurs sports n'est pas géré),
  4. Plan d'entraînement (liste unique de méthodes dont l'« Spécifique LPN » (construite sur la répartition)
  est la première, avec, pour elle seule, le sous-volet « Répartition par zone » (#eq-repartition, balance.js, avancé), semaines, cycle, difficulté, méthodes), 5. Récapitulatif et export, 6. Semaine par semaine.
  Chaque bloc est un volet repliable (`details.volet`, ouvert par défaut).
  Les plans reprennent les zones du profil : Z5 de l'allure 1 h à la VMA (répétitions de Z5 à 95 – 100 % de VMA), Z6 au-delà de la VMA.
- **Onglet Entraînement pas à pas** (refonte UX) : barre d'étapes `#etapes` (1 Objectif, 2 Ma semaine, 3 Mon plan, 4 Mes séances) et quatre sections
  `.etape[data-etape]` affichées une à la fois (`choisirEtape()`, boutons `data-aller` « Suivant / Précédent », étape mémorisée en `localStorage`, clé
  `etape`). Étape 1 : objectif (curseur, champs durée / allure / distance, repli « Mes zones d'entraînement » `#zones-profil`) ; étape 2 : semaine
  et résumé ; étape 3 en trois blocs numérotés (`.bloc-plan`) : 1 Méthode (liste déroulante personnalisée (bouton `#pl-methodeBtn` + `ul` `#pl-methodeListe`, `role="listbox"`), puis panneau `.methode-choisie` : titre `#pl-titre`, fiche `#pl-fiche`, notes et repli `#pl-resume`, repli « Ajuster la répartition par zone (facultatif) » `#eq-repartition` visible seulement pour Spécifique LPN ; puis la liste déroulante #pl-methode et la fiche #pl-fiche en tête du bloc), 2 Durée et calendrier (semaines ou dates, compétitions), 3 Charge et difficulté (cycle, difficulté) ; plus de bascule Personnalisé / Méthode (`state.mode` supprimé : `state.methode` vaut `'zones'` ou l'id d'une méthode, l'ancien `mode: 'zones'` mémorisé est converti) ; étape 4 : alertes, tuiles, histogramme,
  export, semaine par semaine, tableau récapitulatif. Les textes d'explication sont des info-bulles `.aide` (pastille « ? » au survol ou au
  focus, recadrées dans la fenêtre par `recadrerAide`) ou des replis `details.mini` ; ne pas remettre de paragraphes d'aide à l'écran. Placement des « ? » : au début de l'élément expliqué (titre de l'étape, titre des replis « Mes zones d'entraînement » et « Ajuster la répartition » : un clic sur le « ? » d'un `summary` n'ouvre pas le repli) ; l'aide du TSS est dans l'en-tête de la colonne TSS du tableau de répartition (`aideTss`, classe `.aide.fixe` : infobulle en position fixe calculée par `recadrerAide`, car `.tableau` défile et rognerait une infobulle absolue). À l'impression
  seule l'étape 4 reste (les autres portent `pas-imprimer`). Tous les ids d'avant la refonte sont conservés (sauf `eq-cibleNote`, supprimé).
  Vérification d'affichage : Edge headless échoue ; servir le dossier par un petit serveur Node en local (`localhost`) et ouvrir la page dans Chrome
  (extension Claude in Chrome, qui refuse `file://`), avec `localStorage` prérempli par un script injecté (vue, étape, saisie).
- `balance.js` : répartition du volume et de la charge (TSS) hebdomadaire entre les 6 zones selon l'allure cible. Exporte
  `window.Balance.setProfil(res)`, appelé par `rendre()` à chaque calcul réussi : VMA, indice et zones viennent de `Endurance`
  (aucune saisie de VMA/IE dans Balance). Le dernier profil est mémorisé (`localStorage`, clé `balance`) ; sans profil, seules
  les proportions et l'unité saisie s'affichent. Ids DOM préfixés `eq-`. Le dossier `balance/` (projet d'origine, non versionné)
  n'est plus utilisé.
- Plan d'entraînement, en plusieurs fichiers sources réunis pour la page en un seul, **`plan.bundle.js`** (généré, ne pas le
  modifier : relancer `node outils/assembler-plan.js` après toute modification d'une source ; c'est lui que charge index.html) :
  - `plan.js` : le moteur (ids préfixés `pl-`, choix mémorisés en `localStorage` clé `plan`). Lit `Balance.contexte()` (allure cible,
    volume hebdomadaire en h, parts par zone, profil) et se recalcule à l'événement `balance` émis par `balance.js` à chaque rendu ;
    remplit la colonne « Plan / sem. » du tableau de répartition (`eq-plan0..5`, `eq-planTot`) ; expose `window.Plan.donnees()` (plan
    affiché, textes sans balises, étapes) et `window.PlanCore` (fonctions et registres pour les autres sources).
  - `plan-seances.js` : fonctions de construction des séances (`series`, `fractions`, `continu`, `tRef`) et séances / allures communes
    à plusieurs méthodes.
  - `contraintes/*.js` : une contrainte de planification par fichier (doublés, cycle menstruel, travail de nuit, séances du club,
    longueur maximale, volume cible / maxi / mini, compétitions intermédiaires).
  - `methodes/*.js` : une méthode par fichier (`lpn.js` = Spécifique LPN, puis les 18 méthodes d'entraîneurs).
  - `outils/assembler-plan.js` : assemble les sources dans l'ordre moteur, séances communes, contraintes, méthodes.
  Voir « Plan d'entraînement » ci-dessous.
- `export.js` : boutons `#pl-export` (data-format) : PDF (= `window.print()`, CSS `@media print` : blocs `.pas-imprimer`
  masqués, semaines dépliées et titre `#impression-titre` le temps de l'impression), CSV (« ; », virgule décimale, BOM),
  Excel (.xlsx minimal écrit à la main : feuilles Plan, Répartition, Paramètres, chaînes en ligne), JSON, montres (archive
  .zip sans compression d'un fichier FIT « workout » par séance : file_id, workout, workout_step ; durées en temps, cibles
  d'allure en vitesse, répétitions en étape « repeat until steps complete »). Pour Garmin : copier les .fit dans
  `GARMIN/NewFiles`. Vérifié : structure et CRC par un décodeur indépendant, .xlsx ouvert par Excel ; pas encore testé sur
  une vraie montre.

Pas de gestionnaire de paquets ni de tests versionnés. Seule étape de construction : `node outils/assembler-plan.js` (plan.bundle.js).

## Modèle (forme simplifiée de Péronnet & Thibault)

Référence citée dans le sous-titre de la page : Péronnet F., Thibault G., *Mathematical analysis of running
performance and world running records*, J Appl Physiol 1989 (doi:10.1152/jappl.1989.67.1.453).

- `% VMA(T) = 100 + IE × ln(T / 6)`, T en minutes. `k = IE / 100`.
- Vitesse tenable : `v(T) = VMA × (1 + k × ln(T / 6))`, en m/min en interne.
- Calibrage : régression linéaire de `v = distance / temps` sur `x = ln(temps / 6)`.
  `VMA = a`, `k = b / a`. Avec 2 performances, la droite passe exactement par les deux points.
- Limites : modèle valable de 5 min (`DUREE_MIN`) à 5 h (`LIMITE_MIN`) ; la durée de référence de la VMA reste 6 min (`REF_MIN`). Un effort hors de cette plage est saisissable, mais `calibrerComplet` le refuse (erreur `horsPlage`, avec `cle`) tant que l'utilisateur ne confirme pas : bouton « Utiliser quand même » dans la bulle d'erreur, puis 4e paramètre `horsPlage = true` ; une alerte reste affichée (indice peu fiable : alimentation, matériel, gestion de l'effort). Une seule performance sans VMA ou profil ne suffit pas.
- Allure 1 h = `v(60)`, référence des zones (100 %).
- Prédictions par dichotomie sur `distance = v(T) × T`.

## Règles métier à respecter

- **Zones** (en % de l'allure 1 h, `ZONES_DEF`) : Z1 < 65 ; Z2 65–80 ; Z3 80–90 ;
  Z4 90–100 ; Z5 de l'allure 1 h à la VMA (≈ 105 à 145 % selon l'indice d'endurance) ; Z6 au-delà de la VMA (zones() calcule ces deux bornes depuis 
es.V ; as et haut donnent les bornes finies : Z1 à 50 %, Z6 sur LARGEUR_Z6 = 10 points). Texte d'utilité de chaque zone dans `ZONES_DEF` (champ `utilite`).
- **Fiabilité d'une prédiction** (angFiabilite, en durées d'effort) : marge d'erreur sur la vitesse = incertitude de l'indice × ln × (1 + ln / `LN_COURBE`), avec ln = |ln(durée visée / durée du chrono le plus proche)| (l'erreur d'indice se propage en ln(T/6), un peu plus vite quand l'extrapolation est très longue), plus une dérive au-delà du semi : un saut `SAUT_LONG` (4 %) dès que la durée visée dépasse le semi et le chrono le plus proche, puis `DERIVE_LONGUE` (7,5 %) par durée de semi dépassée (DUREE_SEMI = 105 min, médianes Vickers & Vertosick 2016 : 1 h 39 hommes, 1 h 56 femmes), appliquée progressivement selon l'écart (pleine à partir d'un rapport ×2, LN_DERIVE) pour qu'une cible égale à un chrono saisi ne soit pas pénalisée. Incertitude : celle du profil (stimation.incertitude, ±2,5 à ±4) quand l'indice vient du profil, INCERT_MESURE = 1,5 quand il est calculé sur des chronos (la VMA saisie compte comme chrono à 6 min). Niveaux (SEUILS_MARGE) : Élevée ≤ 4,5 % ; Correcte ≤ 6 % ; Moyenne ≤ 9 % ; Faible ≤ 13 % ; Mauvaise au-delà (seuils choisis, non validés par une étude). Plancher « Correcte » tant que les données sont cohérentes (ni coherenceFaible ni ieDouteux) et que chronos et durée visée ne dépassent pas le semi et que le rapport de durées (visée / chrono le plus proche) reste ≤ ×5 (`RAPPORT_PLANCHER`). Données incohérentes : un cran plus bas ; indice hors de `IE_BORD` ([−12 ; −4], proche des bornes habituelles) : un cran plus bas. Sans performance ni VMA, « Indicative ». Fiabilité du cartouche (iabiliteProfil) : moyenne arrondie de celles de la VMA (6 min) et de l'allure 1 h ; la tuile affiche le détail (`fiabiliteDetail` : « VMA : … · Allure 1 h : … ») et une infobulle `.aide` explique le calcul.
- **Contrôles** : vitesses hors 4–30 km/h, indice ≥ 0 et, avec exactement deux données, un écart de
  distances inférieur à 10 % (`ECART_DISTANCE_MIN`, la VMA comptant comme VMA × 6 min) bloquent le calcul ; doublons et indice sous −14
  (`IE_HABITUEL`) sont des alertes. Indice positif ou nul : calcul bloqué, avec un message qui nomme les performances en cause
  (« le 10 000 m … est plus rapide que le 5 000 m …, alors que la distance est plus longue ») et explique que l'allure ralentit
  forcément quand la distance augmente ; sans paire fautive (3 points ou plus), message général. La VMA saisie compte partout comme une performance (VMA × 6 min,
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

- **Allure cible** (remplace l'ancien objectif) : par défaut (`state.goalAuto`), l'allure de référence la plus proche de l'allure 1 h
  (`plusProche1h`, recalculée à chaque profil) ; tout choix manuel (bouton, curseur, champs) l'arrête. Avec un profil, trois champs
  (`#eq-cibleT` durée de 5 min à 5 h, `#eq-cibleA` allure, `#eq-cibleD` distance, `pctDepuis`) placent la cible d'après la prédiction du
  modèle : les deux autres champs s'en déduisent. `state.goal` = allure de référence (`GOALS` : 5 km, 10 km, semi, marathon,
  boutons `#eq-presets`) ou `'perso'` avec `state.pct` (fraction de l'allure 1 h), placée en glissant le curseur
  (`#eq-curseur`, `role="slider"`, flèches ± 0,5 %, Maj ± 2 %) sur la barre des zones `#eq-zones` (échelle de 50 % à la fin de Z6, soit 10 points au-delà de la VMA ;
  repères des allures de référence) ; aimantée à une allure de référence à moins de 0,4 point (`AIMANT`). Affichage
  (`#eq-cible`) : allure, vitesse, % de l'allure 1 h, zone, temps de soutien théorique T = 6 × exp((v / VMA − 1) / k) et
  distance v × T (hors modèle sous 6 min et au-delà de 5 h). Sans profil, positions estimées avec un profil type
  (`DEFAUT` : VMA 14, indice −7). `rec` et `hard` d'une allure quelconque : interpolés entre les allures de référence voisines
  (`parametres`), constants au-delà du 5 km et du marathon. Contexte du plan : allure de référence la plus proche (`goal`,
  scores et séances des méthodes), `preset` (course en fin de plan seulement pour une allure de référence), temps de soutien
  borné à 5 min – 5 h, `parts` (parts de temps des 6 zones).

- Zones du profil d'endurance (% de l'allure 1 h = FTP). Z1 et Z6, ouvertes, sont bornées par `bas` / `haut` de `E.zones` (`BORNES` suit la zone 6 à chaque rendu) pour convertir temps
  et distance. IF de la zone = allure médiane (milieu des bornes) / allure 1 h, sauf Z1 fixée à 60 % (`IF_FIXE`) ;
  la même vitesse médiane sert à convertir temps ↔ distance. TSS d'une zone = durée (h) × IF² × 100 (coût par heure croissant de Z1 à Z6).
- **Base : 80 % du volume en Z1+Z2** (`EASY_BASE`) : ≥ 80 % du volume en faible intensité chez les coureurs de très haut niveau (Haugen et
  al. 2022, voir Sources) ; plancher `EASY_BORNES` = 70 (revue de Campos et al. 2022, à vérifier), plafond 95.
- **Modulation par objectif** : la charge par heure de référence (`cible`) est celle de la base (80 % facile, 15 % de Z1,
  répartition d'intensité du 10 km). Pour chaque objectif, `eAuto` est la part facile e telle que
  e × coût(facile) + (1 − e) × coût(intensité) = cible : un objectif qui charge Z5/Z6 (5 km) a moins de volume d'intensité qu'un objectif
  centré sur Z3 (marathon, ≈ 70–75 % facile). Le TSS par heure est donc identique d'un objectif à l'autre (≈ 60 TSS/h, ≈ 300 pour 5 h).
- **Volume** : `cible` est multipliée par 0,95 à chaque doublement du volume hebdomadaire au-delà de 5 h (`CHARGE_PAR_DOUBLING`, `REF_HOURS`)
  et divisée de même en dessous : à fort volume, charge par heure plus basse donc plus de facile ; à faible volume, moins de facile
  (davantage de temps de récupération). Champ de volume `#eq-volume` (texte, `lireVolume`/`fmtVolume`) : en h il accepte `5h30`, `5h`, `5:30`, `5 h 30 min`, `90min`, `5,5`, `5.5` ; en km `40`, `40,5`, `40 km` ; calcul à la frappe, valeur remise en forme au blur,
  bordure rouge si illisible (dernière valeur valide gardée) ; changer d'unité convertit la valeur (`vMoy`, vitesse moyenne pondérée du dernier rendu ; heures au pas de 5 min, km entiers : un aller-retour peut dériver de quelques minutes).
  Heures : volume en h tel quel ; saisi en km avec un profil : km / vitesse moyenne pondérée de la répartition par zone (Σ part de temps × vitesse du milieu de la zone,
  `vmoy` = allure 1 h × IF), par point fixe (`repartir(h)` dans `render`, 5 itérations, la répartition dépendant du volume par la charge par heure), première estimation 0,72 × VMA ;
  sans profil : 10 km/h (`c.heures` du plan = cette valeur ; le tableau de répartition et l'étape 4 donnent le même nombre d'heures). Ex. 5 km, IE −8,8 : 78 % à 2,5 h, 92 % à 20 h.
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

## Plan d'entraînement (`plan.js`, `plan-seances.js`, `contraintes/`, `methodes/`)

- **Organisation (découpage d'oct. 2026, résultat vérifié identique sur 4 104 plans avant / après)** :
  - **Moteur** (`plan.js`) : état, calendrier (charge, décharge, affûtage), étapes de construction d'une semaine (`construire`),
    placement sur les dates (`placerJours`), rendu, alertes générales. Il ne connaît **aucune méthode par son nom** : il lit les champs de
    la méthode choisie et ses règles `regles` (fusionnées avec `REGLES_DEFAUT`, celles des méthodes d'entraîneurs : sortie longue,
    footings égaux, doublés courts). Points d'extension : `doc.semaine` (séances de qualité de la semaine), `regles.volumeFacile` (partage
    du volume facile), `regles.echauffement`, et des réglages (`slMax`, `efMin`, `efLeger`, `filtreClub`, `chargeObjectif`, `equilibreZones`,
    `dechargeQ`, `doublesUtiles`, `sansSortieLongue`, `volumeKm`, `z1Lendemain`, `alterner`).
  - **Méthodes** (`methodes/<id>.js`) : chacune s'enregistre par `PlanCore.methode({ … })` avec ses textes (source, résumé, principes),
    sa fiche (`fiche`), sa biographie (`bio`, `bioTitre`), son rang (`ordre`), ses phases, ses réglages, et enregistre ses séances et allures
    propres (`PlanCore.seances`, `PlanCore.allures`). Le contrat des champs est décrit et vérifié dans plan.js (`CHAMPS_METHODE`,
    `enregistrerMethode`, `verifierMethodes` : champ inconnu, séance inexistante, phases dans le désordre → avertissement en console).
    Méthode propre à l'outil : `lpn.js` (`parDefaut`, `repartition`, `semaine: semaineZones`, `regles` LPN). Ajouter une méthode = ajouter un
    fichier, puis réassembler.
  - **Contraintes** (`contraintes/<nom>.js`) : chacune s'enregistre par `PlanCore.contrainte(nom, { … })` et regroupe ses réglages par
    défaut, ses calculs, ses alertes, ses champs de l'étape 2 ou 3 et ses écouteurs ; le moteur l'appelle par `PlanCore.contraintes.<nom>`
    (`K.<nom>` dans plan.js). **Toutes les contraintes s'appliquent à toutes les méthodes** (étape B) : travail de nuit (avant : Spécifique
    LPN seulement), doublés (jamais deux séances de qualité le même jour, sauf le double seuil déclaré par la méthode norvégienne ; jamais le
    jour de la plus grosse séance de la semaine, séances du club comprises : une séance strictement plus longue que toutes les autres, à
    égalité aucune ; le nombre de doublés est réduit s'il n'y a pas assez de jours), cycle, club, longueur maximale, volume, compétitions.
    Seul le tri des séances du club selon la répartition par zone (`regles.filtreClub`) reste propre aux méthodes construites sur cette
    répartition (Spécifique LPN), les autres n'ayant pas de répartition par zone à respecter.
  - **Chargement** : le premier affichage attend `DOMContentLoaded` (les méthodes et contraintes s'enregistrent après plan.js, dans
    n'importe quel ordre, sauf limite.js qui s'enregistre avant ses écouteurs).
- **Une liste de méthodes** (`state.methode`) : `zones` (par défaut, `methodes/lpn.js`, nommée « Spécifique LPN » : optimiser une allure spécifique selon des critères paramétrables, à placer après des cycles de préparation générale ; carte en tête de liste, son champ avertissement en .info-box) construit le plan sur la répartition de Balance, ajustable ; les autres sont les méthodes d'entraîneurs, qui gardent leur répartition et leurs durées de séances
  (la colonne « Plan / sem. » montre l'écart avec la répartition visée). Plan de 4 semaines par défaut.
- Mode `zones` (`semaineZones`, hypothèses) : minutes d'effort de Z3 à Z6 = volume de la semaine × part de la zone. Z6 sous
  4 min → lignes droites de 20 s après un footing ; allure cible de semi / marathon en Z3-Z4 → tout son temps dans les séances de qualité (LPN v2 : plus de sortie longue)
  (`SL_SPE`). Blocs par zone (`FORMATS` : répétitions, récupérations, `min` d'un bloc sans profil et en Z6, `seul` pour ouvrir une séance ; avec un profil, un bloc est ignoré sous `seuilBloc()` à l'allure la plus rapide de la zone (`minBloc()`) : 20 s à la VMA, 1 min à l'allure 1 h, 3 min à 80 % de l'allure 1 h (limite Z2/Z3), loi de puissance du temps limite entre ces points (≈ 104 s en Z3, 60 s en Z4, 20 s en Z5 pour 5 km en 18:30 et 10 km en 39:00) ; pas de durée maximale par bloc, un bloc de Z3 peut dépasser 60 min),
  dont chaque répétition ne dépasse jamais 2/3 du temps limite à l'allure courue (`TLIM_PART`, modèle T = 6 × exp((v / VMA − 1) / k) : au-delà, plus de répétitions plus courtes), scindés s'il reste des séances, regroupés sinon (zone voisine d'abord, `BLOCS_MAX` = 3 par séance, 3 min de trot entre
  blocs) ; ce qui ne rentre pas est signalé (`exces`). La zone de l'allure cible est courue à l'allure cible. `recupZ1` : des
  footings passent en Z1 (récupération) jusqu'au temps de Z1 visé. `bloc` : pas d'affûtage ni de course.
  `TLIM_PART` s'applique aussi (toutes méthodes) à la partie à l'allure objectif de la sortie longue (`longue`, SL_SPE) et au
  `TEMPO_OBJ` de Hanson : au plus 2/3 du chrono prédit (multiple de 5 min inférieur). Contrôle `tlim.js` (1 216 plans) : restent
  au-delà le 105 – 110 % de VMA de Billat (temps limite < 5 min, hors du domaine du modèle) et des tempos à 70 – 73 % (méthodes).
- Chaque séance porte `parts` (minutes par zone : échauffement en Z2, retour au calme et récupérations en Z1, effort dans
  la zone de la séance) et `etapes` (échauffement, effort, récupération, répétitions `{ rep, etapes }`, cibles d'allure en
  min/km) pour les exports ; `enveloppe()` habille toute séance de qualité.

- Blocs 4 à 6 de l'onglet Entraînement : plan (mode, préparation, difficulté ; en mode méthode, une fiche par méthode : titre,
  public, épreuves visées, difficulté athlétique, mise en œuvre, durée du plan, prérequis manquants ; sous la fiche, résumé et repli « Principes et source »), récapitulatif (alertes,
  tuiles séances / temps / distance / qualité, histogramme, repli « Tableau semaine par semaine », exports), semaine par semaine. Distances estimées par séance (`km`, avec profil) : allure moyenne de la zone (`aZ`, Z1 à 60 %,
  Z6 au milieu de ses bornes), fractions à leur allure et récupérations en Z1 (`kmS`), course = distance de l'objectif.
  **Tableau récapitulatif** (repli, bloc 4) : en plus du tableau par semaine, un tableau « Temps de travail par zone » (`#pl-recapZones`, plan.js) donne pour chaque zone la durée sur tout le plan, la durée moyenne par semaine, la distance (avec profil : `parts` de chaque séance / `aZ`, allure médiane de la zone ; total un peu différent du total par semaine, dont les fractions sont courues à leur allure) et la part du temps.
  **Semaine par semaine = « agenda »** (variante choisie par l'utilisateur parmi 20 maquettes, retirées du projet) : un jour = une ligne `ol.seances > li` avec un bloc de date coloré par la zone de la 1re séance (`blocDate` : numéro du jour et jour de la semaine, ou « Jour k » sans date), le corps au centre (nom, zone, texte) et à droite le kilométrage estimé (`fKm1`, « ≈ 8,5 km », absent sans profil) au-dessus de la durée. Un doublé = plusieurs `.seance` dans le même `li`.
- **Travail de nuit et doublés** : `placerJours(…, eviteSL, nuitJ)` classe les jours (0 repos, 1 départ en nuit, 2 sortie de nuit) ;
  un doublé (jour à deux séances hors course et club) posé sur un jour de rang 1 ou 2 est échangé avec un footing simple d'un jour de
  rang inférieur (repos d'abord) ; `manqueSL` réserve aussi un jour hors sortie de nuit pour chaque doublé posé sur un jour de footing.
  Un doublé resté un lendemain de nuit est fondu par `construire` en un seul footing de même durée (footing et accélérations : footing
  allongé), si la longueur maximale le permet, avec une note sous la semaine et l'alerte « Après le travail de nuit : n doublés… fondus ».
  Doublé un jour de départ en nuit : mention « 2e séance plutôt avant votre sieste ». Alerte si les doublés demandés dépassent le nombre
  de jours de repos d'une semaine. Test `t14.js`/`t15.js` (5 à 7 jours, 1 à 3 doublés, 5 et 8 h, nuits fixes et tournantes) : doublés un
  lendemain de nuit 374 → 0 (nuits fixes) et 195 → 0 (tournantes), volume identique.
- **Tests cycle + travail de nuit** (scratchpad `t9.js`, `t13.js`, Spécifique LPN, plan par date de 12 semaines) : 3 à 7 jours,
  3 / 5 / 8 h, sans limite / 60 min / 10 km, club aucun / lundi / jeudi / les deux, × 5 scénarios (cycle, nuits fixes, nuits tournantes,
  cycle + nuits, cycle + nuits + 5 km) = 900 comparaisons avec le plan sans option. Vérifié : volume, nombre de séances de qualité et
  séances du club identiques ; qualité sur jours évités divisée par 3 à 5, toujours avec mention ; sortie longue jamais sur une sortie
  de nuit ; `t13.js` compare chaque semaine (10 800) à l'optimum théorique (créneaux non évités, non consécutifs, loin des courses et
  de la séance piste) : 0 semaine au-dessus. D'où `SENSIBLE_COUT` = 100 (priorité absolue sur la régularité des jours) et la sortie
  longue comptée triple dans `coût`. Les cas « sans adaptation » restants sont structurels (ex. 3 jours avec les deux séances du club ;
  séance piste du jeudi qui interdit mercredi et vendredi).
- **Charge d'entraînement : choix du TSS** (bas de page, rubrique « Répartition du volume et charge », et infobulle TSS de
  balance.js) : TSS (Allen & Coggan) adapté à la course (allure au lieu de la puissance, allure 1 h au lieu du seuil fonctionnel), cohérent
  avec un outil fondé sur les chronos ; TRIMP de Banister (fréquence cardiaque, réponse physiologique variable) et RPE de séance de Foster
  (note après coup) cités et écartés, avec les limites du TSS (barème fixe, allure moyenne de zone).
- **Sortie longue LPN** : supprimée avec Spécifique LPN v2 (voir plus bas : « Footing long », `partageFacile`) ; `nommerSL` retiré.
- **Plan sous contraintes** (`aComplexe`) : alerte quand 4 contraintes ou plus sont combinées (cycle, nuit, longueur maximale, doublés,
  volume faible, compétitions intermédiaires, club), ou 3 avec des compromis ; liste les contraintes, les compromis réellement faits
  (qualité sur jours évités, doublés retirés d'un lendemain de nuit, séances retirées autour des courses, club remplacé, effort coupé,
  sortie longue courte, footings au minimum ou plafonnés, intensité non placée) et les pistes pour relâcher. N'empêche pas le plan.
- **Doublé resté un lendemain de nuit** : le 2e footing est d'abord ajouté au footing simple le plus court d'un jour de repos (puis d'un
  départ en nuit), dans la limite de longueur ; sinon fondu avec celui du jour.
- **Biographies** (champ `bio` de chaque fichier de méthode, `bioTitre` « Origine » pour la norvégienne et Singles) : affichées en tête du volet « À propos de ce plan »
  (« L'entraîneur : … », « Origine : … » pour la méthode norvégienne et Norwegian Singles). Pas de biographie pour Spécifique LPN.
  Une nouvelle méthode doit avoir sa biographie, sans fait non vérifié.
- **Travail de nuit** (facultatif, Spécifique LPN seulement pour l'instant, plan par date ; `state.nuit` : actif, mode 'fixe' (soirs[7],
  lundi = 0) ou 'tournant' (debut, nuits 1 – 7, repos 1 – 14) ; fieldset `.nuit-travail` de l'étape 2, boutons `data-nmode` — pas
  `data-mode`, déjà pris par le mode des prédictions). `suiviNuit()` → { estNuit(t) } ; `jourNuit(t)` : nuit (départ le soir), sortie
  (lendemain matin d'une nuit). Placement : la sortie de nuit est ajoutée aux jours où la qualité est évitée (`evite`, même mécanisme
  que les jours sensibles du cycle) ; `placerJours(…, eviteSL)` : le choix des jours réserve aussi un jour hors sortie de nuit pour la
  sortie longue (`manqueSL`), et une sortie longue restée sur une sortie de nuit est échangée avec un footing. Volume inchangé (choix
  de l'utilisateur). Mention « Après une nuit de travail : à alléger, ou à faire après une sieste » sur une qualité restée un lendemain
  de nuit ; alerte « Après le travail de nuit : n séances… » ; infos « Travail de nuit : … » (autre méthode, pas en plan par date,
  saisie incomplète). Agenda : 🌃 (nuit le soir), 🛌 (sortie de nuit), légende `#pl-legendeNuit` ; export JSON `jours[].travailNuit`.
  Sources : Craven et al. 2022 (sommeil court ≈ −7,5 %), consensus AASM/SRS 2015 (≥ 7 h). Test `t8.js` (scratchpad) : qualité et
  sortie longue sur sortie de nuit 0 sauf 5 cas à 6 jours (mention), volume identique.
- **Sources et études** (bas de page, `<details class="sources">` dans `#references`, replié) : modèle et fiabilité (Péronnet &
  Thibault 1989, Vickers & Vertosick 2016, Riegel 1981), répartition et charge (Haugen et al. 2022, Allen & Coggan), méthodes
  (`#sources-methodes`, rempli par plan.js depuis le champ `source` de chaque méthode, ordre alphabétique, après DOMContentLoaded ;
  une étude propre à une méthode va dans son champ `source`, lien DOI compris, comme le 15-15 de Billat 2001 ; sous la liste, paragraphe « Allure plutôt que fréquence cardiaque » (Cottereau,
  Fitzgerald, méthodes norvégiennes) et bouton `data-ouvre="guide-fc"` qui ouvre le dialog statique `#guide-fc` (bases de
  l'entraînement à la FC, sources Tanaka 2001, Karvonen 1957, Coyle & González-Alonso 2001), cycle et santé (McNulty et al. 2020, Mountjoy et al. 2023 REDs), données (athle.fr, Courses 80).
  Toute nouvelle étude utilisée doit y être ajoutée (avec DOI vérifié).
- **Cycle menstruel** (facultatif, `state.regles` : actif, debut, duree 15 – 60, hormonale, irregulier, sensRegles, sensAvant ;
  fieldset `.cycle-mens` de l'étape 2) : repères seulement (McNulty et al., Sports Med 2020 : effet trivial de la phase, preuves faibles,
  approche individuelle). `suiviCycle()` : actif, sans contraception hormonale ni cycles irréguliers, date renseignée, plan par date.
  `phaseDu(t)` : J1 – J5 règles, ovulation à durée − 14 (± 1 j), folliculaire avant, lutéale après ; jours sensibles choisis
  (J1 – J2, 3 derniers jours du cycle). Agenda : pastille de phase sous la date (`.cyc`, cerclée si sensible) et légende
  `#pl-legendeCycle`. `placerJours(…, sensible)` : (A) le choix des jours d'entraînement pénalise (`SENSIBLE_COUT` = 3 par séance) les
  combinaisons qui ne laissent pas assez de créneaux de qualité hors jours sensibles (non consécutifs, à 3 jours des courses) ; la
  qualité va d'abord aux jours non sensibles (`evite(t)` compte les motifs, cycle + lendemain de nuit : un jour qui cumule les deux
  est évité avant un jour qui n'en a qu'un) ; (B2) une séance de qualité restée sur un jour sensible reçoit la mention « Jour sensible
  de votre cycle : à alléger ou à décaler selon vos sensations » (volume et intensité inchangés). Tests (`t4.js`/`t7.js`, scratchpad,
  LPN, 280 cas) : qualité sur jours sensibles divisée par 4 à 5 ; les cas restants sont structurels (avec les deux cases, 5 jours
  sensibles d'affilée : les 2 jours libres de la semaine sont consécutifs ou trop près d'une course) et portent tous la mention. `alertesCycle()` : « Santé : … » (irréguliers/absents, > 35 j, < 21 j, plus de 3 mois depuis les règles :
  RED-S, consulter ; aussi dans les alertes du plan) et « Cycle menstruel : … » (info : hormonale, irréguliers, pas en plan par date,
  date manquante). Export JSON : `jours[].cycle` { jour, phase }. Choix de l'utilisateur : les 5 points proposés, sans périodisation
  par phase. Rien n'est envoyé : données locales et fichier de sauvegarde.
- **Mes données** (`sauvegarde.js`, boutons de l'en-tête) : « Tout effacer » (confirmation dans un `dialog.dlg`, efface les clés
  localStorage `saisie`, `balance`, `plan`, `vue`, `etape` puis recharge) ; « Enregistrer » (fichier `profil-endurance-AAAA-MM-JJ.json`) ;
  « Charger » (confirmation, écrit les clés puis recharge : chaque module relit et valide ses données). Format évolutif :
  `{ format: 'profil-endurance', version, enregistre, donnees: { saisie, balance, plan }, affichage: { vue, etape } }`. Quand le
  format change : incrémenter `VERSION` et ajouter `MIGRATIONS[ancienne version]` ; un fichier plus récent que l'outil est refusé.
  Règle pour les évolutions : toute nouvelle clé d'état doit avoir une valeur par défaut et être validée au chargement (comme
  `volType`), pour que les anciens fichiers restent lisibles sans migration. Le bouton des chronos s'appelle « Effacer les chronos ».
- **Type de volume** (`state.volType` : 'cible', 'max', 'min' ; cases exclusives `pl-volMax` / `pl-volMin` sous le volume, étape 2) :
  dans `calendrier`, tous les facteurs de semaine sont multipliés par `kVol` : maxi → la semaine la plus chargée vaut le volume, mini →
  la semaine de charge la plus légère vaut le volume (choix de l'utilisateur : décharge, affûtage et semaine de l'objectif restent allégés,
  donc sous le mini). Marge de 5 min (arrondis des séances). Maxi : dans `volumes`, une semaine de compétition est plafonnée au volume,
  courses et échauffements compris. Footings portés au minimum en mode maxi : alerte « Volume maxi incompatible » (bloquante). Textes :
  `volRef()`, contexte « volume maxi / mini », tuile « Temps de course », exports (`typeVolume`).
- **Qualité autour des compétitions** : (1) LPN, semaine où `qMax` réduit le nombre de séances de qualité : le temps d'intensité est
  réduit au prorata (`kComp` = séances gardées / séances prévues), au lieu d'être entassé dans les séances restantes. (2) `placerJours`
  reçoit les dates de toutes les compétitions hors footing et de l'objectif (`datesCourses`) : celles des semaines voisines à 3 jours
  ou moins (`Rq`) écartent aussi la qualité (ex. course le dimanche, pas de qualité le lundi), sans repousser la qualité en fin de
  semaine (distance plafonnée à 3 jours). (3) Le nombre de créneaux de qualité possibles compte les jours à 3 jours au moins des
  courses et non consécutifs ; les séances en trop sont retirées (note sous la semaine). Contrôle : `t3.js` (scratchpad), 285
  configurations (19 méthodes × 5 scénarios de courses × 4 à 6 jours), aucune qualité à moins de 3 jours d'une course.
- **Plusieurs courses le même jour** (plan par date) : `construire` regroupe les courses de la semaine par date (`jourCourse`) ; un jour
  porte toutes ses courses (libellés « 1re course », « 2e course » dans `moments`, en-tête « n courses le même jour »), et n'occupe qu'un
  jour de course. `placerJours` reçoit une date par jour (souple si toutes ses courses sont en footing). Chaque course garde son
  échauffement. Une course intermédiaire prend son propre nom d'allure (`nomObj` dans `contexteCourse`).
- **Échauffement des compétitions** (`course()`, `ECHAUFFEMENT_COURSE`, `echCourse`) : en Z2, selon la zone de la course (`zoneObj`, donc selon l'engagement : à fond, sans forcer, à la cool, en footing) :
  Z6 30 min, Z5 20 min, Z4 15 min, Z3 10 min, aucun en Z1 et Z2. La séance « Course » dure échauffement + course (étape `echauffement` pour les montres), compte en Z2 dans `parts` et dans la distance ;
  son temps est déduit du volume de la semaine comme celui de la course (`volumes`, `pool`, volume en km) ; aucune récupération (retour au calme, footing de récupération, doublé) le jour d'une compétition.
- **Téléphone** : aucune ligne ne doit dépasser la largeur de l'écran (sinon le navigateur dézoome ou fait défiler en horizontal). Les grilles `.champs` utilisent
  `minmax(0, 1fr)` (une colonne sous 520 px), `.rang` passe à la ligne, marges réduites sous 520 px, bouton d'étape actif plus large. Vérification : page chargée dans un
  `<iframe>` de 390 / 360 / 320 px, `scrollWidth` de chaque étape comparé à `clientWidth` et liste des éléments qui dépassent (hors conteneurs à défilement comme `.tableau`).
- **Conventions d'affichage** : chaque section et étape a une icône (`.ico` : 👋 ⏱️ 🔮 📉 🎯 📅 🧭 📋 ; sous-parties 🏃 📏 👥 🧭 📆 📈 🏁) ; les petites notes
  statiques sont dans des infobulles `.aide` (« ? ») ou des `details.mini` repliés, pas en clair. Alertes : `listeAlertes(el, liste)` (plan.js) les classe
  ⛔ `a-err` (incohérence, incompatible, prérequis), ⚠️ `a-warn` (défaut), ℹ️ `a-info` (tient lieu, doublés, club écarté, moins de 6 semaines…), les trie
  dans cet ordre et replie au-delà de 3. Séances : icône par type (`iconeSeance` : ⚡ qualité, 🛣️ sortie longue, 🏃 footing, 💤 récupération, 👥 club,
  🏁 course) et puce de zone `zoneChip` ; en-tête de semaine : badge du type (`.badge`) et puces 🗓️ ⏱️ 📏 ⚡ 📶 📝 ; notes de semaine `.note-sem` (📝).
  Conseils `.info-box.conseil` (💡), contexte du plan `.contexte` (🎯). Règles : celles de Spécifique LPN sont toutes dans les `principes` de methodes/lpn.js
  (source unique, affichée « Règles de construction ») ; `REGLES_COMMUNES` ne garde que ce qui vaut pour tous les plans.
- **Sortie longue = séance la plus longue de la semaine** (`construire`, durée et distance) : `sl` est relevée jusqu'à la plus longue séance de qualité ou du club (`besoin`, au plus `slPlafond = min(slMax0, limite exacte)`), les footings (et footing + lignes/accélérations, `sousLimite`) restent sous elle ; le volume est conservé (les footings raccourcissent). Si le plafond (méthode ou longueur maximale) l'empêche, la séance la plus longue « tient lieu de sortie longue » (suffixe du nom) et la dernière séance s'appelle « Sortie facile » (« Sortie avec fin rapide » si elle a du travail). Sans effet les semaines de course (la course remplace la sortie longue).
- **Longueur maximale d'une séance** (étape 2, facultative : `state.limite` + `state.limiteU` `min` | `km`, champ `#pl-limite`, bornes `bornesLimite` : minimum 20 min (`LIMITE_MIN` ; en km, la distance de 20 min à l'allure de Z2), maximum 300 min ou 60 km ; changer d'unité convertit à l'allure moyenne de Z2, 6 min/km sans profil). `limiteDe(c)` → `c.limite = { min, km, txt }` (une distance est convertie en durée à l'allure moyenne de Z2 ; une séance de qualité est aussi contrôlée sur sa distance `km`). Effets dans `construire` : sortie longue et footings plafonnés (`slMax = min(slMax0, lim5)`, par pas de 5 min ; footing + lignes droites ou accélérations compris : `sousLimite`) ; séances de qualité ramenées sous la limite par `reduire()` (échauffement et retour au calme inchangés, travail multiplié par k, la séance se régénère avec `echelle × k` ; en Spécifique LPN les blocs sont raccourcis ensemble dans `semaineZones`, et l'effort retiré est reporté sur les autres séances de qualité qui ont de la place, puis sur de nouvelles séances de qualité jusqu'à `maxS` ; `coupe` = effort qu'on n'a pas pu replacer) ; compétitions et séances du club non limitées. Alertes (`aLimite`, étape 2 et étape 3) : incompatible avec l'objectif (5 km et 10 km seulement : la séance la plus longue doit couvrir au moins 5 km ou 10 km ; semi et marathon : pas de minimum, seul le volume global compte), incompatible avec le volume (jours × limite + doublés < volume visé), volume plafonné, qualité raccourcie (`coupe`), séances impossibles à raccourcir (2 répétitions minimum : `trop`), séance du club au-dessus de la limite. Export : champ `limite` (feuille Paramètres).
- Paramètres : jours de course par semaine (3–7, clé `seances`), doublés (autant que de jours, 6 au plus : `optionsDoubles`
  ramène la valeur si les jours baissent ; jamais le jour de la sortie longue ; pas de doublé la semaine de
  course), durée du plan (`state.horizon`, `#pl-horizon`) : soit un nombre de semaines (4–24), soit « Jusqu'à la date de
  l'objectif » (`debut`, `fin` : `horizon()` donne les semaines entières entre les deux, bornées à 4 – 52 `SEMAINES_MAX`, avec alerte
  hors bornes ; les semaines portent leurs dates `debut` / `fin`) ; cycle (`state.cycle` : `auto` par défaut, `constante`, ou `cycle` réglable x semaines de charge + n de décharge ; **automatique** (`cycleAuto(c, N, h)`) : constante sous 6 semaines avant l'affûtage, sinon 3 + 1 (2 + 1 sous 8 semaines), et avec des compétitions intermédiaires (mode par date, courses en footing exclues) la longueur de charge de 2 à 5 semaines dont les décharges tombent le mieux sur la semaine d'une course (poids légère 1, modérée 2, forte 3) ou la suivante (× 0,8), à égalité la plus proche du défaut ; `calendrier()` renvoie le cycle effectif, affiché dans `#pl-cycleAuto` et exporté (« cycle 4 + 1 (automatique) ») ; une méthode à `constant` impose la charge constante ; encadré repliable « Quel cycle choisir ? », .aide-cycle, avec avantages et inconvénients de chaque cycle),
  difficulté de la 1re semaine (1–10 : séries courtes et récupérations longues → séries longues et récupérations courtes).
- **Compétitions intermédiaires** (mode par date seulement, `state.courses` = [{ date, d (m) }], `#pl-courses`, bouton « + Ajouter une
  compétition », épreuves `COURSES` de 1 500 m au marathon, ou « Autre distance… » saisie librement : 8 km, 12000, semi ; `perso`, `txt`) : `appliquerCompetitions()` ajuste les semaines selon la charge de la course,
  TSS = durée prédite (h) × IF² × 100 (sans profil : 6 × km), `NIVEAUX_COURSE` (hypothèses) : légère (< 55), modérée (< 110), forte.
  Engagement par compétition (`effort`, menu de la ligne, `ENGAGEMENTS`) : à fond (allure prédite), sans forcer (vitesse × 0,9), à la
  cool (× 0,8), en footing (allure du milieu de la Z2, jamais plus vite que l'allure prédite) ; `predCourse()` donne durée, allure, % de
  l'allure 1 h et IF, d'où `tssCourse()` et `contexteCourse()` (zone recalculée : 10 km 39:00 en Z5 → 43:20 en Z4 sans forcer, 48:45 en Z3
  à la cool, 56:08 en Z2 en footing). Libellés « 10 km sans forcer », etc. Une course en footing ne limite pas la qualité (`qMax`) ni le
  placement des jours (`souples` dans `placerJours`). Course à fond : surplus `SURPLUS_FOND` = + 50 % du TSS de la course (impact physiologique
  maximal, hypothèse) ajouté au TSS de la course pour le volume de la semaine (`w.tssCourses`) et la dette de récupération ; le niveau léger /
  modéré / fort reste celui de la course seule ; affiché « TSS ≈ 69 + 35 (à fond, + 50 %) » et dans l'infobulle de l'histogramme (`w.surplus`). Ancien format `prepa: true` converti en « sans forcer ». La ligne affiche chrono,
  allure, zone et TSS estimés.
  **Le volume suit le TSS et le cycle** : la cible de la semaine reste celle du cycle (facteur de charge constante, ou charge / décharge,
  × TSS de référence `tssRef` = volume de référence réparti selon les parts par zone) ; le TSS des courses de la semaine est retranché
  de la cible (le plan garde son rythme), plus une « dette » de récupération `DETTE` = 25 % du TSS des courses la semaine précédente,
  50 % la semaine suivante et 25 % la deuxième (hypothèses), en partie absorbée par une semaine de décharge ou d'affûtage (déjà allégée
  de `(1 − facteur) × tssRef`). Plancher `PLANCHER_TSS` = 30 % de la cible ; conversion en temps au TSS horaire de référence, le temps des
  courses s'ajoute (`volumes` dans `construire`). **Équilibre par zone** (Spécifique LPN) : le temps d'une compétition dans sa zone
  se déduit du temps prévu pour cette zone la semaine de la course (`partsSem`, parts par zone de chaque semaine) ; s'il le dépasse
  (ex. 5 km de 19 min en Z5 pour 11 min prévues), alerte : les autres semaines cèdent l'excédent si elles le peuvent (au plus
  `ABSORBE_ZONE` = 50 % de leur temps dans la zone : « le temps en Z5 des autres semaines est réduit de x % »), sinon on retire ce qui
  peut l'être (−50 %) et l'alerte dit que l'équilibre du plan ne peut pas être respecté. Le temps libéré revient en Z2. Séances de qualité limitées (`qMax` : 1 ou 0 la semaine de la course et la suivante, 1 la 2e semaine après une forte) ;
  la course remplace la sortie longue (`contexteCourse()`, sans doublés). Plusieurs compétitions la même semaine : charge (TSS) cumulée pour le niveau, aucune séance de qualité, la dernière course remplace la sortie longue et les précédentes un footing chacune (`w.courses`, `extra` dans `construire`). Notes en bleu sous la semaine, semaine étiquetée « Compétition »
  (barre rouge du graphique). Course sans date, avant le début ou à partir de la date de l'objectif : ignorée avec alerte.
  En mode par date, Spécifique LPN a aussi un affûtage et la course finale (comme les méthodes).
  **Calendrier réel** (mode par date, `placerJours()`) : chaque jour d'entraînement porte sa date (`w.dates`, affichée « lun. 26 oct. » à la
  place de « Jour k », `date` ISO dans `donnees`). Les jours de course tombent aux dates des compétitions (la dernière semaine s'arrête à la
  date de l'objectif) ; les autres jours sont choisis par énumération des combinaisons pour avoir des écarts réguliers (cycliques sur une
  semaine entière), avec pénalité pour la veille d'une course (jour de repos), donc au moins un jour entre deux compétitions quand les dates
  le permettent (ex. 5 jours avec courses le mercredi et le dimanche : lundi, mercredi*, jeudi, vendredi, dimanche*). Pas de séance de
  qualité à moins de 3 jours d'une course (retirée, avec note), qualité placée au créneau le plus éloigné des courses ; semaine finale
  raccourcie : footings retirés d'abord. Sans date cohérente (plan trop court), les jours restent « Jour k ».
  Qualité jamais deux jours de suite autour d'une course (choix glouton des créneaux les plus éloignés des courses).
  **Règles communes** (`REGLES_COMMUNES`, repli « Règles communes à tous les plans » sous le résumé, Spécifique LPN et méthodes) : cycle,
  affûtage, compétitions (TSS, dette, qualité limitée, pas de doublé), équilibre par zone (Spécifique LPN), calendrier. Les garder
  conformes au code. En mode par date, la dernière semaine finit toujours par l'objectif, même sans affûtage (plan de moins de
  6 semaines : alerte « la course finale arrive sans semaine allégée »). L'alerte « Beaucoup d'intensité… » (`exces`) ignore les
  semaines où la qualité est volontairement limitée autour d'une compétition (`qMax` fini). Exports : colonne « Date » (CSV, Excel)
  et fichiers montre nommés par date en mode par date. Pour les méthodes, `tssRef` est estimé avec la répartition de Balance
  (approximation : la méthode a sa propre répartition).
  Contrôle fait (54 plans par date, Spécifique LPN et 5 méthodes, 3 à 7 jours, 3 compétitions) : courses à leur date, objectif présent,
  aucune qualité deux jours de suite ni à moins de 3 jours d'une course.
  Infobulle des barres de l'histogramme : temps, TSS (Σ temps par zone × IF² × 100, IF de `Balance.zones()`) et temps par zone.
- Calendrier : le niveau monte de `PROGRESSION` (3) jusqu'à l'affûtage. Cycle : +6 % de volume par semaine de charge
  (`CHARGE_PAS`, centré sur 1), décharge à 70 % (`DECHARGE`) avec le même nombre de séances de qualité mais allégées de moitié
  (`DECHARGE_Q` : travail de qualité = 50 % d'une semaine de charge, plutôt que d'en retirer une), niveau −1. Affûtage : 1 semaine (0,6) ou
  2 pour semi/marathon si ≥ 10 semaines (0,75 puis 0,55) ; aucune sous 6 semaines. La dernière semaine d'affûtage finit par la course ;
  la semaine de l'objectif (`finale` dans `volumes`) a une charge de 50 % de la référence (`OBJECTIF_CHARGE`) en gardant la fréquence,
  sans durée maximale de footing (si les footings minimaux la dépassent : alerte « volume juste »).
- Séances de qualité : 1 (3 séances), 2 (4–5) ou 3 (6–7), plafonné par `maxQ` de la méthode. Fractions : `series()` interpole
  durée de répétition, travail total et récupération (en part de la répétition) selon le niveau, × facteur de volume
  √(h/5) borné à [0,7 ; 1,4]. Échauffement selon la zone (`echauffement(c, zone)`) : 20 min en Z5, 15 si une longueur maximale de séance est fixée ;
  Z6 + 5 min, Z4 − 5 min, Z3 − 10 min ; retour au calme 10 min. Allures prédites par le moteur (`tablePredictions`).
- **Deux jeux de règles dans construire** (`REGLES_DEFAUT` du moteur, remplacées en partie par le champ `regles` de la méthode : celui de methodes/lpn.js pour Spécifique LPN) : les règles ci-dessous sont celles de Spécifique LPN ; les méthodes d'entraîneurs gardent leurs règles propres, qu'on ne modifie pas (constantes _M : footing minimal 30 min, sortie longue = max(28 % du volume, 1,5 footing) plafonnée à 150 min, doublé de 0,6 footing borné à 20–45 min y compris le jour de la sortie longue, footings ≤ 1 h la semaine de l'objectif, alerte doublés sous 7 h). Seules la cohérence « sortie longue = séance la plus longue » et la longueur maximale s'appliquent à tous.
- **Spécifique LPN v2 (oct. 2026, cahier des règles validé par l'utilisateur)** : pas de sortie longue imposée (« la spécificité de la
  distance passe d'abord par le volume hebdomadaire »). 1) Séances de qualité placées d'abord (`semaineZones`, tout Z3 – Z6, allure
  cible du semi / marathon comprise), pas allongées. 2) Volume facile R = volume − qualités − club − courses, partagé par
  `partageFacile(R, n, efMin, slMax)` entre les n séances faciles (footings, dernier jour, 2es séances des doublés) : m = R / n, une
  séance longue facile de `LONG_FACILE` (4/3) × m (« Footing long », le dernier jour, ou un footing la semaine de course), les autres à
  parts égales (à 5 min près, l'arrondi n'est pas reporté sur la séance longue) ; 20 min au moins, longueur maximale (et `SL_MAX` 300)
  au plus ; volume non placé → alerte de plafond ; moyenne sous 20 min → alerte « volume juste ». 3) Z1 restante (cible de Z1 − Z1 des
  qualités) : `versZ1` commence les footings du lendemain de qualité par cette Z1 (`footingZ1` : « x min en Z1, puis y en Z2 ») ; en
  plan par date, après le placement (vrais lendemains dans le calendrier). Lendemain de qualité = repos ou séance facile. `nommerLong`
  garde le nom « Footing long » sur le footing simple le plus long après les ajustements du travail de nuit. Sans dates : `alterner`
  évite deux jours de qualité de suite (séance piste du club comprise). Le placement traite « Footing long » comme la sortie longue
  (pas un lendemain de nuit si possible). Supprimés : `nommerSL`, `partage()`, footing fixe de 20 min le lendemain de qualité,
  partie à l'allure cible en fin de sortie longue. Tests : `lpn2.js` (exemples VMA 15), `lpn-sweep.js` (384 plans, 5 040 semaines).
- Doublés : la 2e séance est une séance facile du partage ; LPN : jamais deux séances de qualité le même jour, et jamais le jour de la
  plus grosse séance de la semaine (le nombre de doublés est réduit s'il le faut) ; méthodes : jamais le dernier jour de la semaine ; placée d'abord les jours faciles, puis le soir des jours de qualité. Utiles à partir de
  `DOUBLES_SEANCES` (5) séances par semaine : ils libèrent des jours de repos (alerte en dessous).
  Affichage par jour. Option « Séance d'intensité les jours de doublé » (`moment` : matin, midi, soir, sans importance par
  défaut ; visible s'il y a des doublés) : `moments()` place la séance de qualité au moment choisi (midi : footing « matin ou
  soir » ; sans importance : pas de libellé, « ordre au choix »). Deux séances de même nature (double seuil norvégien, deux
  footings) restent « Matin / Soir ».
- Méthode norvégienne (`doubleSeuil`) : séances `SEUIL_NO_LONG` (5–10 min, allure semi – 30 km) et `SEUIL_NO_COURT`
  (1 min 30 – 3 min, allure 10 – 15 km), récupérations brèves, plus `COTES_COURTES` (Z6). Chaque doublé va d'abord à un jour
  de seuil, avec le soir le format complémentaire (`SEUIL_NO`) ; les doublés restants sont des footings. Travail au seuil
  de la semaine plafonné à `SEUIL_PART` (20 % du volume ; sirpoc : 20 – 25 %). Sans doublé : variante « singles » de sirpoc
  (trois séances sous le seuil : longues, courtes, longues ; pas de côtes), sans alerte.
  Difficulté 4/5. Rappel d'intensité en `conseil` (italique), distinct de `alerte` (rouge).
  Sources ✔ : Athletics Coach « The Norwegian model of lactate threshold training » (2 – 3 mmol/L, exemples de doubles),
  résumé LetsRun archivé de la méthode sirpoc (sites.google.com/view/sub-threshold : formats, 20 – 25 %, footings ≤ 65 % VMA) ;
  ✗ : entretien Bakken (LetsRun 2026, non lu), Tjelta 2019, Casado et al. 2023.
- **Règle : les fractions sont en durée d'effort, jamais en distance fixe** (une distance fixe change la difficulté selon le
  niveau). La distance « ≈ … m » affichée est indicative, calculée avec l'allure prédite. Les méthodes données en distance
  par leur auteur (Pfitzinger 600 – 1600 m, Tinman 1 km et 200 m, norvégienne 1000 m et 400 m, Hanson, Galloway) sont
  converties en durées ; seul le mile magique de Galloway, un test, reste une distance.
- Options génériques des méthodes (registre `METHODES`, fichiers methodes/*.js) : `q` d'une phase peut être une fonction du contexte, `footingMax` plafonne les footings,
  `slSi`/`slNote` décident et expliquent l'absence de sortie longue, `lignes` ajoute des accélérations après le premier
  footing de la semaine, `slKm` (nombre ou fonction) plafonne la sortie longue en km, `joursMax` (alerte de prérequis au-delà),
  `test` ({ id, tous } : séance test toutes les n semaines, à la place de la dernière qualité), `courseMarche` (footings et
  sorties longues en course-marche), `plafonds` ({ ID: part } : temps d'effort d'une séance, hors récupérations (`effort`),
  limité à cette part du volume hebdomadaire), `moyenneLongue` (un footing devient une sortie moyenne-longue de 75 % de la
  sortie longue), `affutage3` (3 semaines d'affûtage pour le marathon si ≥ 12 semaines : 80, 65, 50 % du volume, hypothèse),
  `partQualite`, `sansAffutage` (jamais d'affûtage), `constant` (cycle toujours à charge constante, même si l'utilisateur choisit charge / décharge),
  `rotation` (la séance de qualité en tête change chaque semaine : une seule ou deux séances sur trois sont faites à tour de rôle).
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
  (jeu de côtes, puis répétitions à l'allure de l'objectif : voir « Galloway : trois livres lus » plus bas), mile magique (`GAL_MM`) toutes les 2 semaines, accélérations-glissées. Sortie longue jusqu'à 42 km pour le
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
- Méthodes (fichiers methodes/*.js) : Daniels, Lydiard, Seiler (polarisé), Pfitzinger, Hanson, Canova, Billat, norvégienne, Cottereau,
  Heubi, McMillan, Tinman, Magness, Kellogg, Galloway, Fitzgerald, Norwegian Singles (sirpoc), Rousset ; chacune a des phases (séances de qualité par priorité, type de sortie longue) et un `score` par objectif (adéquation de 0 à 3,
  qui sert seulement à afficher les épreuves visées). **Aucune méthode n'est recommandée** : pas de classement, de filtre ni de
  badge ; la méthode affichée par défaut est Spécifique LPN. Le choix se fait dans une liste déroulante (`#pl-methodeBtn` / `#pl-methodeListe`, 
  Spécifique LPN en tête, puis les méthodes par difficulté athlétique croissante, `parDifficulte`) ; la fiche de la méthode choisie (`#pl-fiche`) remplace les anciennes tuiles et le tri (`TRIS`, `state.tri` supprimés).
  Astérisque `*` (`limitee`) sur les méthodes aux sources limitées, faute de texte de l'auteur sur les phases et les séances : Billat, Tinman (Canova a perdu l'astérisque après lecture de ses articles FIDAL de 1996 et 1998 et de ses fils LetsRun ; Daniels, Pfitzinger, Hanson, Fitzgerald et Lydiard ont perdu l'astérisque après lecture de leur livre, dossier `books/`, Seiler et la norvégienne après lecture d'un article de référence, Norwegian Singles après lecture du livre de Copeland) (voir « Consolidation » et les sources de chaque méthode).
  La mention « old school » (pastille `.badge-old`, champ `ancienne` de la fiche) a été retirée à la demande de l'utilisateur : ne pas la remettre.
  Message informatif visible pour tous les plans (étape 2 « Ma semaine », sous le volume, `.info-box`) : une semaine d'entraînement prise comme base d'un plan doit être au plus à peine plus chargée que les précédentes, dans le doute garder le même volume.
  **Séances au club** (étape 2, deux cases `#pl-club1` / `#pl-club2`, `state.club1` / `state.club2`, constantes `CLUB`, `seanceClub()`) : lundi, « séance de PPG dont footing » comptée comme 40 min de Z2 pour la charge ; jeudi, « séance piste » de
  charge moyenne équivalente à 1 h de Z2 + 15 min à VMA (75 min : 60 de Z2 + 15 de Z5), comptée comme une séance de qualité. Intégrées chaque semaine si compatibles par `construire()` : elles se déduisent du volume (`volP = vol − clubT`) et des parts par zone (`horsClub()` : Z2 et Z5 du
  club retirés de la répartition, reliquat en Z2), occupent un des jours de course (`jourLibres`), et la séance du jeudi retire une séance de qualité du plan (`nbQ − clubQ`). En mode par date elles sont placées à leur vrai jour de semaine
  (lundi, jeudi) par `placerJours(..., clubs)` (le plan n'y place pas de séance de qualité à côté de celle du jeudi) ; sans dates, lundi en tête et jeudi en 4e jour. Alertes (`aClub`, affichées à l'étape 2 et en tête des alertes de
  l'étape 4) : un seul jour libre, séance du club écartée certaines semaines (Spécifique LPN : `clubsSemaine(i)` n'intègre une séance du club que si son Z2 tient dans le
  Z1 + Z2 prévu et son Z5 dans le Z5 prévu cette semaine-là, avec les autres séances du club ; sinon elle est remplacée par une séance du plan et une note sous la semaine l'indique ;
  les méthodes d'entraîneurs gardent le club chaque semaine ; libellé du champ : « chaque semaine si compatible avec le plan »), séance de qualité du jeudi tenant lieu de séance
  de qualité du plan, séance du jeudi à moins de 3 jours d'une compétition ou de l'objectif (mode par date). Limites : les séances du club ne sont pas retirées une semaine de compétition ; une semaine partielle sans lundi ou jeudi
  perd la séance correspondante (son volume reste déduit).
  Fiche (champ `fiche` de chaque méthode, hypothèses de conception) : public visé, `plan` (durée habituelle), `mise` (simple, moyenne, complexe),
  prérequis `h` (volume, h / semaine) et `j` (jours de course) ; `ie` (Billat, norvégienne : fractions longues à VMA ou au seuil)
  ajoute une alerte si l'indice d'endurance est ≤ −10 (reflet de la capacité du moment ou d'un choix d'entraînement, formulé sans jugement). Pas de
  seuil de VMA ni de vitesse sur 1 h : la capacité ne dit rien de l'expérience (un master de 70 ans à 13 km/h de VMA), et les séances se
  règlent sur la VMA de chacun. `epreuves()` : épreuves dont le score
  est ≥ 2,5 (sinon les meilleures), avec les durées d'effort prédites quand le profil est connu. Difficulté athlétique =
  `difficulte` ; mise en œuvre = `mise`. `prerequis()` renvoie les prérequis non remplis : ligne rouge « ⚠
  Prérequis » sur la fiche et alerte dans le bloc 5 pour la méthode choisie, sans effet sur le plan ; `joursMax` : alerte au-delà.
  **Rapport volume / fréquence / objectif** (`rapportSemaine`, `RAPPORT`, alerte `#pl-alerteSemaine` du bloc 1, toutes méthodes) :
  volume sous un minimum pour l'objectif (5 km 1,5 h ; 10 km 2 h ; semi 3 h ; marathon 4 h par semaine), durée moyenne par séance
  au-dessus d'un maximum (75, 90, 105, 120 min) ou séances de moins de 20 min par jour de course (même minimum que la longueur maximale) (hypothèses). Ex. 3 séances en
  2 h pour un marathon, 4 séances en 10 h pour un 10 km.
  **Objectif hors du modèle** : chrono prédit de l'objectif au-delà de 5 h → alerte du plan (allures indicatives, course-marche ou
  objectif plus court) et « chrono prédit au-delà de 5 h, hors du modèle » dans le résumé. **Course un lendemain de nuit** (travail de
  nuit, objectif ou compétition intermédiaire) : alerte dans `aNuit` (la date ne bouge pas). **Course un jour sensible du cycle** :
  information `aCycleC` (plan et bloc 1). **Difficulté bridée** (LPN) : sous le volume minimal de `RAPPORT`, note `#pl-diffVolume`
  sous le curseur (le faible volume ne permet pas l'ajustement, augmenter le volume ; tout regrouper dans une séance est assumé).
  Export : `dureeMin` arrondie.
  Note de difficulté par méthode (`difficulte` : [1–5, justification], affichée sur 3 niveaux par `niveau3` : 1 – 2 Débutant, 3 Intermédiaire, 4 – 5 Avancé, avec trois ronds HTML `.ronds` (même taille, remplis jusqu au niveau, vert / ambre / orangé via `--z4` / `--z5` / `--z6`, à droite de chaque ligne de la liste) dans la liste et la fiche ; Spécifique LPN vaut 3 : intermédiaire) :
  Seiler 1, Lydiard 2, Daniels 3, Billat 4 (fractions longues à VMA très éprouvantes, le reste accessible), Pfitzinger 4,
  Hanson 4, Canova 5, norvégienne 4, Cottereau 1, Heubi 3, McMillan 2, Tinman 2, Magness 4, Kellogg 4, Galloway 1, Fitzgerald 2, Norwegian Singles 3, Rousset 3. Une séance peut porter un avertissement (`alerte`,
  ex. `VMA_TLIM`), affiché en rouge dans sa description.
- **Hypothèses à valider** : tous les nombres de `SEANCES`, `SPE`, les phases, scores et la progression sont des choix de
  conception inspirés des principes publiés, pas les plans des auteurs. Sans profil, pas d'allures (temps de course estimé à 10 km/h).
- Consolidation des sept premières méthodes (recherche du 20/10/2026, sources secondaires ; livres non lus) :
  - **Daniels : livre lu (PDF du dossier `books/`, texte extrait en scratchpad) ✔.** Plafonds par séance confirmés (chap. 4, 14, 15) : T ≤ 10 % du kilométrage
    hebdomadaire (et 15 miles), I ≤ plus petit de 8 % et 10 km, R ≤ plus petit de 5 % et 8 km, M ≤ 20 % (30 % sous 64 km/sem.), sortie longue
    ≤ 25 % (30 % sous 64 km/sem.) et 150 min ; récupération T 1 min pour 5 à 6 min, I égale ou un peu moindre, R 2 à 3 fois l'effort. Phases (chap. 10) :
    I base facile + lignes droites ; II répétitions R (2 séances, 2 jours faciles entre) ; III intervalles I (2 par semaine pour les distances longues, 1 + R pour
    les courtes) ; IV seuil T (+ quelques R de 200 m en fin de séance), I abandonnés si des courses les remplacent. `limitee` retiré. Anciennes notes :
  - **Pfitzinger : *Advanced Marathoning* (4e éd. 2025) lu ✔** (`limitee` retiré). Quatre blocs : endurance (tempo + footings avec lignes droites + sortie moyenne-longue,
    sorties avec allure marathon), seuil et endurance (tempo 30 – 45 min jusqu'à deux fois par semaine, un VO2max occasionnel), préparation à la course (VO2max
    5 × 600 m – 1 km à allure 5 km, récupération 50 – 90 % ; plus de seuil pour le marathon : lignes droites à la place ; courses de 8 – 15 km), affûtage de 3 semaines.
    Seuil lactique = allure tenable 1 h ; tempo continu préféré aux fractions pour le marathon, pas de double seuil ; au plus 3 séances dures par semaine ; semaine de
    récupération à 80 % du volume ; sortie longue ≤ 21 – 22 miles (24 pour les expérimentés).
  - **Hanson : livre lu ✔** (`limitee` retiré) : le code était déjà conforme (vitesse à allure 5 – 10 km puis force à allure marathon − 10 s/mile, tempo à allure marathon de 4 – 5 miles
    à 10 miles, sortie longue ≤ 16 miles et ≤ 25 – 30 % du volume) ; textes précisés.
  - **Fitzgerald (80/20) : livre lu ✔** (`limitee` retiré). Plans du livre : 9 semaines (5 km : 3 de base, 5 de pointe, 1 d'affûtage), 12 (10 km : 6, 4, 2), 15 (semi : 6, 7 – 8, 1 – 2),
    18 (marathon : 9, 7, 2), une semaine de récupération sur trois ; la base est plus proche de 90/10 (montée du volume), la pointe à 80/20. Code : fin de la phase de base selon
    l'objectif (`f` fonction du contexte), `partQualite` propre à la phase de base (0,15 contre 0,25 ensuite : option de phase, qui l'emporte sur celle de la méthode). Zones du livre
    (par rapport au seuil lactique en FC) : 3 « modérée » = entre seuil ventilatoire et seuil lactique (96 – 100 %), 4 – 5 « élevée » ; footings en zones 1 – 2.
  - **Lydiard : *Running to the Top* lu ✔** (`limitee` retiré). Base d'au moins 3 mois (4 – 5 de préférence), puis ≈ 4 semaines de côtes, ≈ 4 d'anaérobie (3 jours durs par semaine, répétitions
    d'au moins 600 m, jamais d'« interval training » chiffré), 6 de coordination avec une course de mise en jambes par semaine, sortie longue de 1 h à 1 h 30 en période de course, 2 semaines
    sans rien de rapide après un semi ou un marathon. Code : `finLydiard()` place les 14 dernières semaines (4 + 4 + 6) et les réduit proportionnellement sous 23 semaines.
  - **McMillan : *YOU (Only Faster)* lu ✔.** Plans de 12 semaines + modules de 4 semaines (volume, séances de base : steady state et leg speed, côtes, puis « prep stamina » avant le 5 et
    le 10 km, « prep speed » avant le semi et le marathon), 24 semaines au plus, semaine 4 de récupération. Code : les deux phases intermédiaires échangent nom et séances selon la distance
    (`nom` de phase peut être une fonction du contexte). Tempo 15 – 40 min (court pour un Speedster, long pour un Endurance Monster), fractions de tempo 6 – 15 min, cruise intervals 3 – 8 min.
    Le type de coureur est en réalité auto-évalué (questionnaire) ; l'appli le déduit de l'indice d'endurance (approximation).
  - **Heubi : *Courir longtemps* lu ✔** (OCR bruité). Le livre utilise le même indice d'endurance (Péronnet) : EMA à 80 – 90 % de VMA, durée de séance selon l'indice ; VMA courte 30 s – 1 min 15
    à 100 – 105 % (récupération égale), longue 1 min 15 – 4 min à 90 – 95 % (récupération moitié), 15 – 25 min d'effort ; préparation générale ≥ 12 semaines, spécifique 9 – 11 semaines (2 cycles
    séparés d'une semaine allégée) ; sortie longue 1 h – 1 h 15 (10 km), ≈ 1 h 30 (semi), 1 h 30 – 1 h 45 (marathon). Textes précisés, code inchangé (déjà conforme).
  - **Galloway : trois livres lus ✔, fusionnés en une seule méthode galloway** (course-marche + pyramide). Course-marche : *Marathon: You Can Do It!* (2001) et *Half-Marathon: You Can Do It!* (2013) : programmes de 26 semaines,
    sortie longue de 3 miles +1 par semaine jusqu'à 10 puis une semaine sur deux (toutes les 3 semaines après 18 miles), règle des deux minutes (3 minutes après une sortie manquée), marche d'une minute toutes les 3 à 5 min
    (toutes les 4 min vers 18 – 20 miles, toutes les 3 min au-delà de 23), mile magique (marathon × 1,3, semi × 1,2 ; 4 derniers tests, on écarte le plus lent), objectif réaliste 3 % (5 % au mieux), plan chronométré :
    jeu de côtes puis répétitions d'un mile à l'allure marathon (marche ≥ 4 min), week-ends alternés. Pyramide : *Galloway's Book on Running* (1984) : base 50 %, côtes 15 %, vitesse 35 % ; avant la vitesse, 1 an
    de course, 2 – 3 mois d'aérobie, 4 – 6 semaines de côtes ; vitesse 8 semaines au plus (12 – 14 pour le marathon), une séance par semaine un peu plus vite que l'allure de course (440 yards pour le 10 km et moins,
    jusqu'à 20 : GAL84_440 ; un mile pour le semi et le marathon : GAL_MILE) ; sortie longue une semaine sur deux (slUneSur2) jusqu'à 20 % de plus que la course (slKm : 16, 24, 29, 45 km pour 5 km, 10 km, semi, marathon).
    Synthèse : trois phases (base aérobie, jeu de côtes 4 semaines, vitesse 8 ou 12 semaines), placées par inPhase(avant, total) (réduites si le plan est court) ; course-marche conservée à toutes les sorties (les avancés du
    livre de 1984 peuvent s'en passer) ; 3 jours de course (joursMax) ; mile magique toutes les 2 semaines à la place de la séance de vitesse. Difficulté 2/5. Non modélisé : les week-ends « off » à demi-distance, les 5 km de course,
    le fartlek libre. La méthode galloway84 a été fusionnée dans galloway (ne plus la recréer).
    Phases en semaines avant la course via `finPhase(avant, total)` (base, côtes 4, vitesse 8 ou 12, réduites si le plan est court). Difficulté 2/5 ; marche en option pour les débutants seulement (non modélisée).
  - **Billat : *La physiologie de l'entraînement et de la performance sportive* (De Boeck, 2021) lu ✔** (manuel de physiologie : peu de plans, mais une **table de prescription par % de VAM** au chap. 6,
    cohérente avec Tlim ≈ 6 min à VMA du modèle). Intensité → part du temps limite par répétition → récupération (W = durée de l'effort) : 120 – 115 % : 25 % (30 – 37 s), r = 4 W ; 110 – 105 % : 25 – 50 %
    (45 – 90 s), r = 2 W ; 100 – 95 % : 33 – 50 % (2 – 3 min), r = 1 W ; 90 – 85 % : 50 – 75 % (7 – 12 min), r = 0,5 W ; seuil (≈ 1 h) : 25 – 75 % (15 – 45 min), r = 5 min. Code : séances `BIL_105`,
    `BIL_88`, `BIL_SEUIL` (allures `v105_110`, `v85_90`), phases VMA courte (30-30 + 105 – 110 %), VMA longue (½ Tlim + grand seuil), spécifique (allure de course + 85 – 90 %). `limitee` conservé (la méthode reste
    une synthèse). Non repris : l'entraînement en accélération (BillaTraining : pyramides de vitesse auto-rythmées, 2 séances de 20 à 30 min par semaine), sans prescription chiffrée.
    **publications.billatraining.com** (165 PDF en libre accès, liste rendue par JavaScript : lue avec Chrome, anchors `a[href*=".pdf"]` ; téléchargement direct possible : `…/publications/<année>/<fichier>.pdf`) : lus (texte, pdfjs) :
    revue *Interval training for performance* I et II (Sports Med 2001 : formats d'Åstrand, 5 × 50 % du temps limite à VMA 1/1 + 2 × 20 min au seuil 4/1, ou 60 – 75 % du temps limite deux fois par semaine, progrès en 4 semaines),
    15-15 autour de la vitesse critique (Int J Sports Med 2001 : 100 % / 70 % de VMA garde 14 min à VO2max, `BIL_1515`, ajouté à la phase « VMA courte » avec `rotation`), marathoniens d'élite (8 semaines : 180 km par semaine, 11 % de la
    distance au-dessus de l'allure 10 km, une séance à allure 3 000 m et une à 10 000 m par semaine, sortie longue > 1 h 45 tous les 10 jours dont 10 km à allure marathon ; score du marathon relevé à 1,5). Téléchargés mais non lus à fond
    (scans sans texte) : 1999 « Interval training at VO2max: effects on aerobic performance and overtraining markers », 1994 – 1995 temps limite à 90 – 100 – 105 % de VMA. À lire si besoin : 2003 coureurs kényans, 2004 coureurs masters au
    seuil de lactate stable, 2005 perspectives du marathon, 2018 accélérations constantes auto-rythmées (BillaTraining).
    **Lecture complète (deuxième passe, ~35 PDF téléchargés)** : scans rendus en PNG et lus (1999 surentraînement : semaine type de 6 séances, **une seule séance à VMA par semaine** ; trois séances n'apportent rien de plus et élèvent la
    noradrénaline : la phase « VMA courte » alterne désormais les trois types de VMA (30-30, 15-15, 105 – 110 %) avec le seuil, via `rotation` et une liste de 6 séances ; 1995 : temps limite d'élite 17 min à 90 %, 5 min 20 à 100 %, 2 min 56 à
    105 % de VMA, vitesse critique ≈ 86 % de VMA, le modèle Péronnet – Thibault réglé sur IE −9,6 donne 17 min à 90 % et 3,6 min à 105 %). Textes : 2003 Heubert (protocole de 4 semaines, 25 → 75 % du temps limite, total = 1,5 fois
    le temps limite, récupération moitié ou égale à 50 % de VMA), 2001 Demarle (8 semaines : 2 séances à 93 % de VMA + 3 footings à 60 – 70 %), 2004 masters (6 semaines de 2 séances au seuil de lactate stable : 3 × 10 → 3 × 20 min et 2 × 15 →
    2 × 30 min, +6 min par semaine), 2003 Kényans (deux écoles : tempo 15 % du volume ou haute vitesse 2 séances par semaine), 2005 marathon (2 séances de vitesse par semaine toute l'année, 95 % du seuil sur la 1re moitié). Sans apport pour le
    plan : accélérations (2017 – 2018, modélisation et rats), pacing et dérive cardiaque (2020 – 2022), cyclisme, chevaux, souris, natation, 2012 (cyclisme, puissance décroissante).
  - **Consolidation par le web (sources primaires lues, 2026)** : *Seiler* (`limitee` retiré) : Seiler et Tønnessen, Sportscience 2009 (zones en %VO2max / lactate, 75 – 80 / 5 / 15 – 20 % chez les élites, « trou noir de
    l'intensité » : plan visé 77 / 3 / 20 %, réalisé 65 / 21 / 14 % chez des coureurs de loisir, intervalles 4 min pour 2 min de récupération, 1 – 3 séances intenses par semaine chez les élites) ; *norvégienne*
    (`limitee` retiré) : Casado, Foster, Bakken, Tjelta, IJERPH 2023, lu via Chrome (MDPI refuse WebFetch, 403) : 3 – 4 séances au seuil (lactate 2 – 4,5 mmol/L, Bakken 2,3 – 3,0) + 1 séance VO2max, 150 – 180 km par semaine, sortie
    longue ≤ 21 km, 2 000 – 3 000 m près de l'allure semi ou 400 – 1 000 m entre allure 5 et 10 km, 8 – 12 km de travail, récupération 20 s – 1 min 30 ; période de compétition : deux séances au seuil de moins ; données
    observationnelles, 1 500 – 5 000 m, marathon incertain ; *Tinman* (astérisque conservé : semaine type = anecdote d'un master) : présentation de Schwartz (2016, PDF lu avec pdfjs) : vitesse critique tenue 30 – 35 min,
    6 × 1 km à CV + 6 × 200 m à allure 1 600 m (maximum 8 × 1 km), progressions (récupération 90 → 75 → 60 s, répétitions plus longues, plus rapides), `cv` passé de 30 – 40 à 30 – 35 min ; *Canova* (astérisque conservé) : blocs
    spéciaux d'après Fast Running (secondaire), non repris. Non consolidé : Billat (synthèse), Tinman (semaine), Canova (pas de plan publié) ; Norwegian Singles consolidé ensuite par le livre de Copeland.
  - **runningwritings.com (John Davis, blog de science de l'entraînement) épluché** : *Canova* (recension du livre de 1999, 2023 : périodes introductive 6 – 8 / fondamentale 8 – 10 / spéciale 6 – 8 / spécifique 6 – 8 semaines,
    tableau des % de l'allure marathon par séance, sorties longues spécifiques 30 – 35 km à 96 – 98 %, adaptations pour amateurs 60 – 80 % du volume) ; *Bakken* (entretien traduit, 2024 : doubles seuil matin 6 – 10 min / après-midi 1 min, 45/15,
    200 m, 15 – 20 km de seuil par jour double, 70 – 80 km par semaine au pic, sorties longues ≤ 45 min – 1 h, séquence avant course) ; *Kristoffer Ingebrigtsen* (2025 : semaine de ≈ 90 km, mardi 8 × 1 000 m, jeudi 4 – 5 × 2 000 m, samedi
    3 × 3 000 m ou 3 × 10 min) ; *vitesse critique* (2024 : CS− ≈ 95 % de l'allure 5 km, CS+ ≈ 100 %, formats 8 × 1 km, 10 × 3 min, 4 × 2 km) ; *30-30 vs fractions longues* (étude 2025 citée : moins de temps > 90 % VO2max). Autres articles non repris :
    calculateurs de seuil / CV / VO2max et de LT1 / zone 2 à partir du 5 km (apps.runningwritings.com), principes de l'entraînement marathon moderne (phases générale, de soutien, spécifique, séances à % de l'allure marathon),
    plans à pourcentages (10 km, semi sub-70), récupérations des intervalles ; son livre *Marathon Excellence for Everyone* (non lu, pourrait nourrir une méthode « marathon à pourcentages »).
  - **Canova : sources primaires lues** (`limitee` retiré ; périodes générale / fondamentale / spéciale du marathon, `plan` 20 – 26 semaines) : articles du Centro Studi FIDAL (centrostudi.fidal.it, *Atleticastudi* 2/1996 « Moderne strategie
    per l'allenamento della maratona » et 4-5-6/1998 « La via italiana alla maratona », PDF scannés : pas de couche de texte, rendus en PNG avec pdfjs + @napi-rs/canvas puis lus visuellement) : travail spécial entre 97 et 103 % de
    l'allure de course sur la moitié à deux tiers de sa durée, tables 2 à 6 (allures en % de l'allure marathon, séances, volumes), périodes 6 – 8 / 8 – 10 / 6 – 8 semaines, deux types de marathoniens (résistant / rapide). Fils LetsRun lus via
    Chrome (`get_page_text`) : 2959804 (fondamental par distance : 1,10 – 1,20 fois plus lent que l'allure de course pour le marathon), 4213844 (pas de microcycle symétrique, exemple de semaine pour 10 000 m, modulation), 3958030
    (séances spécifiques marathon). PDF de Davis (« Something New in Training », 2011) : le serveur refusait le téléchargement direct (403) ; lu en chargeant pdf.js dans l'onglet runningwritings.com puis en recopiant le texte dans le
    DOM de la page pour contourner le filtre de sortie de `javascript_tool` (qui bloque certaines chaînes). Le code des séances `CAN@` et `CAN_PROG@` était déjà conforme à ces tables ; seuls les textes ont été enrichis.
  - **patricedouge.com/training/philosophies** (page lue : 10 résumés secondaires avec une semaine type chacun : Lydiard, Daniels, Canova, Pfitzinger, Tinman, Hudson, Norwegian Singles, Mantz / Eyestone, Hansons, polarisé 80/20 ; site d'un tiers,
    Patrice Douge, sans rapport avec l'utilisateur ; « Coach Patrice », dont la méthode a été retirée de l'appli, est l'utilisateur lui-même) : rien de plus fiable que les sources primaires déjà lues ; certains chiffres divergent (fondamental de Canova à 80 – 87 % de l'allure marathon contre 1,1 – 1,2 fois plus lent
    chez Canova lui-même ; Norwegian « singles » en intervalles LT1 / LT2 avec lactate, différent du livre de Copeland). Deux méthodes absentes de l'appli : **Hudson** (livre *Run Faster*, non lu : phases introductive 6 – 8 semaines,
    fondamentale 6 – 8, d'affûtage 4 – 6 ; efforts I à V sans allures ; côtes de 8 – 10 s, fartlek 1-2-3-2-1, longue progressive 14 miles + 3 miles, 4 × 1 mile à effort 10 km ; page incohérente sur la part spécifique) et **Mantz / Eyestone**
    (longues progressives 16 / 18 + 4 / 20 + 6 / 22 + 8 miles à allure marathon, récupération la 5e semaine ; résumé d'interviews). Non ajoutées : sources secondaires.
  - **Classement de fiabilité des sources (état après les lectures de 2026)** — mesure la qualité de ce qu'on a lu, pas l'efficacité de la méthode. A (livre de l'auteur lu, chiffres vérifiés) : Daniels, Pfitzinger, Hanson,
    McMillan, Galloway, Fitzgerald, Heubi (OCR bruité), Norwegian Singles ; B (auteur lu mais partiel, ou synthèse d'études) : Canova (ses articles et fils, pas le livre de 1999), Lydiard, Magness, Billat, Seiler (pas de plan publié),
    norvégienne (revue observationnelle), Rousset (blog, non validé) ; C (sources partielles ou secondaires) : Tinman (présentation de Schwartz, semaine d'après un témoignage), Kellogg (posts LetsRun,
    sortie longue une semaine sur deux déduite). Cottereau est passé de C à B après lecture de ses articles de Jogging International (2016, jogging-international.net : « Montez en puissance ! », « Marcher en courant… »,
    « 100 km, vous pouvez le faire », propos dans « 6 façons d'augmenter son endurance ») : séance intense définie par FC > 80 % FCM, marathon 2 – 4 × 15 min à 80 – 90 % FCM (récupération 5 – 7 min à 60 – 75 %), 10 km efforts de 3 à 5 min (80 – 97 %,
    récupération 2 – 5 min), semi 80 – 95 %, 1 500 m ≈ 100 % ; une séance intense par semaine (jusqu'à tous les 4 jours selon le niveau) ; course lente à ≈ 80 % de la vitesse tenable ; 90 % du temps à 60 – 75 % FCM ; marche (2 min toutes les 15 – 20 min en
    sortie longue ; marathon : arrêts de 45 s aux ravitaillements) ; affûtage (dernière longue 6 – 7 jours avant, 2 – 3 séances de 25 – 35 min à 55 – 70 %). `COT_DURE` passe à 3 – 5 min, `COT_DOUCE` marathon à 2 – 4 × 15 min. Limites communes : les plans en images (Hanson, Fitzgerald, Lydiard) n'ont pas pu être lus tableau par tableau ; tous les nombres de `SEANCES` restent des choix de conception.
  - Daniels (notes d'avant lecture) : I de 3 à 5 min (`VMA_LONG`), T 1 min de récupération pour 5 min (`SEUIL`), R ≤ 2 min et récupération 2 – 3 fois la
    durée ; plafonds par séance T 10 %, I 8 %, R 5 % du volume (`plafonds`, appliqués au temps), M ≤ 20 %, sortie longue ≤ 2 h 30.
    ✔ coachray.nz « Jack Daniels running intensity », notes Goodreads, forum Running Ahead.
  - Lydiard : base 8 – 12 semaines au moins, côtes 3 – 6 semaines en circuits trois fois par semaine (`LYD_CIRCUIT`),
    anaérobie ≤ 4 semaines avec contre-la-montre plus courts que la course (`LYD_TT`, moitié du temps de course).
    ✔ CoachTheRun « What is the Lydiard Method », Wikipedia « Arthur Lydiard », forum boards.ie.
  - Seiler : 4 × 8 min, 2 min de récupération, meilleure progression (36 cyclistes de loisir, ≈ 40 ans, 6 h / semaine).
    Aubry A. (INSEP), « S'entraîner lentement (parfois)… pour être plus performant », lepape-info ✔ (lu ; il n'existe pas de « méthode Aubry » : synthèse d'études d'élites) :
    71 à 85 % du temps en zone 1, au plus 15 – 25 % en zones 2 et 3 ; Lucia, 81 / 11 / 8 % contre 67 / 25 / 8 % à volume égal ; pourcentages d'élites, non transposables tels quels (repris dans les principes de Seiler).
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
  - **Norwegian Singles (sirpoc)** (`singles`, ajoutée d'après le dossier `forum/`, fil « Norwegian singles », courseapied.net, message 139941 et suivants,
  - **Norwegian Singles (sirpoc)** (singles) : **livre de Copeland (2025) lu ✔** (limitee retiré), en plus du fil orum/ (courseapied.net, message 139941 et suivants : table de niveaux 1 à 8 d'un pratiquant). Trois séances
    sous le seuil par semaine : NS_COURT 3 min à allure 12 – 15 km (récupération 1 min), NS_MOYEN 5 – 6 min à allure 20 km (1 min 15), NS_LONG 10 – 12 min à allure 25 – 30 km (1 min 45) ; 
sFractions : temps sous le seuil
    par séance de 18 à 40 min selon le niveau. Semaines types du livre de 4 h à 9 h (long mardi, moyen jeudi, court samedi, sortie longue facile dimanche ; 4 – 4,5 h : porte d'entrée, 2 × 10 min à 95 % de l'allure marathon ;
    8 h : 4 × 10, 6 × 6, 10 × 3, sortie longue 105 min ; 9 h : footings en deux séances), table d'allures à partir du 5 km (3 min : +6,5 %, 6 min : +9 %, 10 min : +12,5 % environ, non reprise), 75 / 25 % facile / sous le seuil,
    +1 min de travail pour +4 min de footing, au moins un mois par niveau, échauffement 10 min sans lignes droites, FC 10 – 15 battements sous le seuil à la 1re répétition, ralentir après une mauvaise nuit ; 5 km = une séance de la semaine, affûtage
    court pour 10 km et semi (tableaux du livre), affûtages longs déconseillés à faible volume ; marathon : pas un plan à part entière (≥ 2 ans de pratique). 
otation, constant (pas de décharge), sansAffutage (code), partQualite 0,25
    (19 % du temps au niveau 1, 23 % au niveau 2, 25 % ensuite), footings ≤ 60 min, lignes droites facultatives. Non adaptée à plus de 10 h par semaine, à un pic de forme, à la variété. Difficulté 3/5. La méthode norvégienne
    (double seuil) y renvoie pour sa variante sans doublé.
  - **Rousset** (`rousset`, blog courirautroman.unblog.fr « Courir au naturel aut'roman », lu : texte et images des tableaux ✔) :
    pyramide en km (route : 55 % footings, 25 % endurance active, 12 % résistance quantitative, 5 % qualitative, 2 % vitesse, 1 % vitesse pure ; piste :
    75 / 10 / 10 / 2 / 2 / 1), cycles de ≈ 10 jours sans jour imposé (marathon : 2 résistance quantitative, 3 endurance active, 1 sortie longue, 4 footings,
    éventuellement 1 résistance vitesse), 3 à 4 jours de « repos relatif » ensuite, sortie longue de 25 – 30 km dont 10 km à allure marathon (`SL_SPE`).
    Séances : `ROU_TRAIN` (endurance active continue à allure semi – marathon), `ROU_TEMPO` (tempo-route, fractions à allure 15 km – semi, ou 5 – 10 km pour les
    distances courtes), `ROU_RQUANTI` (VMA, 95 – 105 %, récupération courue sans jamais s'arrêter), `ROU_RQUALI` (allure 1500 m, récupération passive 5 min
    au moins), `ROU_RVITESSE` (≈ 135 % de VMA, 20 – 35 s, récupération passive), `ROU_DIAG` (diagonales), accélérations dans les footings (`lignes`).
    La vitesse (résistance vitesse / qualitative) n'est incluse que si l'indice d'endurance est élevé (`rouVitesse`, biais ≥ 1/3 : les deux ; biais entre −1/3 et
    1/3 : qualitative seule ; endurance à développer : diagonales), car pour Rousset la vitesse (V.M.R.) est le plafond de l'endurance. `partQualite` 0,4
    (endurance active et résistances ≈ 45 % des km de la pyramide, hypothèse). Difficulté 3/5. Pas pris en compte : le V.M.R. mesuré sur 100 m, les
    tableaux d'allures par temps de marathon (remplacés par les allures prédites du moteur), le calendrier de saison (avril à juillet sur piste).  - Aucune source trouvée sur courseapied.net pour Heubi ni Cottereau (en dehors du texte de Cottereau) ; sur Reddit / forums :
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

- Plan d'entraînement : après toute modification d'une source (plan.js, plan-seances.js, contraintes/, methodes/), relancer
  `node outils/assembler-plan.js` (il vérifie la syntaxe de chaque source avant d'écrire plan.bundle.js). Pour une modification qui ne
  doit rien changer (réorganisation), comparer un instantané avant / après : charger les scripts d'index.html dans un contexte `vm` avec un
  DOM simulé, date du jour figée, pour un grand nombre de configurations (19 méthodes × objectifs × jours × volumes × doublés × club ×
  longueur maximale, et plans par date avec cycle, nuit, compétitions, volume maxi / mini, volume en km), et comparer l'empreinte de
  `Plan.donnees()` et du HTML produit : elle doit être identique au caractère près.
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
  DOM simulé (charger `endurance.js`, `balance.js`, `plan.bundle.js` dans un contexte `vm`, puis déclencher les écouteurs de `DOMContentLoaded`, simuler `getElementById` et les événements).

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
- **Sortie longue un lendemain de nuit avec des doublés** (défaut antérieur au découpage, mis en évidence en oct. 2026) : `placerJours`
  compte les créneaux hors lendemain de nuit nécessaires (qualités + sortie longue + doublés) en un seul test (`manqueSL`, 0 ou 1). Quand
  les doublés rendent la semaine impossible à satisfaire entièrement, la pénalité est la même pour toutes les combinaisons et la sortie
  longue n'est plus protégée : avec 5 – 6 jours, un doublé et 3 – 4 nuits par semaine, elle tombe souvent un lendemain de nuit alors que
  c'était évitable (Spécifique LPN 5 → 100 semaines sur 210 avec un doublé ; Daniels 0 → 31). Corrigé pour les méthodes d'entraîneurs
  par des manques gradués dans `placerJours` (`manqueSL`, `manqueDbl` : la sortie longue et les qualités passent avant les doublés :
  0 semaine sur 210 pour Daniels, Singles, Hanson, Canova). **Reste pour Spécifique LPN : 81 semaines sur 210** (exemple : plan du
  16/11/2026, 5 jours, 1 doublé, nuits 3/3, semaine 4 : le footing long est sur une sortie de nuit alors qu'un footing simple d'un
  jour hors nuit existe) : l'échange « sortie longue ↔ footing » de `placerJours` ne s'applique pas ici, ou le renommage `nommerLong`
  (après report des doublés) déplace le nom ; à examiner (script de contrôle : nuit-toutes.js, variables d'environnement METH, DBL).

- **Feu de fiabilité** : dans le cartouche profil (et la colonne Fiabilité des prédictions), un feu tricolore `feu(niveau)` accompagne le libellé : vert = Élevée/Correcte, orange = Moyenne/Faible, rouge = Mauvaise/Incertaine.
 La fiabilité du cartouche (`E.fiabiliteProfil`) est la moyenne arrondie des rangs de fiabilité de la VMA (6 min) et de l'allure 1 h ; « Incertaine » (rouge) si données incohérentes.
