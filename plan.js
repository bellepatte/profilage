/* Plan : plan d'entraînement sur plusieurs semaines, construit à partir du profil (allures, zones) et de la répartition du volume
   (allure cible, volume hebdomadaire, parts par zone), soit directement sur cette répartition, soit selon la méthode d'un
   entraîneur reconnu (sources dans CLAUDE.md). Les séances sont des adaptations des principes publiés, pas les plans officiels
   de ces entraîneurs. Chaque séance porte ses minutes par zone (parts) et ses étapes (exports, montres). */
(function () {
  'use strict';
  const E = window.Endurance;
  const $ = (id) => document.getElementById(id);
  const lerp = (a, b, l) => a + (b - a) * l;
  const borne = (x, a, b) => Math.min(b, Math.max(a, x));

  // Deux jeux de règles : Spécifique LPN (nos règles, ci-dessous : constantes LPN) et les méthodes d'entraîneurs (leurs règles propres, qu'on ne
  // modifie pas : constantes sans suffixe, ou `_M`). c.lpn et la variable `lpn` de construire() choisissent le jeu.
  const RETOUR = 10; // min : retour au calme d'une séance de qualité
  const ECHAUFFEMENT = 20; // méthodes : échauffement
  // Spécifique LPN : échauffement selon la zone : 20 min en Z5 (15 si la longueur de séance est contrainte), Z6 + 5 min, Z4 - 5 min, Z3 - 10 min
  const ECHAUFFEMENT_Z = { Z3: -10, Z4: -5, Z5: 0, Z6: 5 };
  const echauffement = (c, zone) => (c.lpn ? (c.limite ? 15 : 20) + (ECHAUFFEMENT_Z[zone] || 0) : ECHAUFFEMENT);
  const PROGRESSION = 3; // niveaux de difficulté gagnés entre la première et la dernière semaine avant l'affûtage
  const CHARGE_PAS = 0.06, DECHARGE = 0.7; // volume : +6 % par semaine de charge d'un bloc ; 70 % en semaine de décharge
  const DECHARGE_Q = 0.5; // LPN : en décharge, le travail de qualité est la moitié de celui d'une semaine de charge (méthodes : une séance en moins)
  const OBJECTIF_CHARGE = 0.5; // LPN : semaine de l'objectif, charge ramenée à 50 % de la référence
  const SL_MAX = 300, EF_MIN = 20, EF_LEGER = 15; // LPN : plafond d'une séance facile (min) ; footing minimal ; footing avant les lignes droites
  const LONG_FACILE = 4 / 3; // LPN : la séance longue facile vaut 4/3 de la moyenne des séances faciles (pas de sortie longue imposée)
  const DOUBLES_SEANCES = 5; // LPN : nombre de séances par semaine à partir duquel un doublé est utile (libère des jours de repos)
  const SL_PART_M = 0.28, SL_MAX_M = 150, EF_MIN_M = 30; // méthodes : sortie longue (part du volume, plafond en min), footing minimal
  const DOUBLE_PART_M = 0.6, DOUBLE_BORNES_M = [20, 45], DOUBLE_VOLUME_M = 7; // méthodes : 2e séance d'un doublé (part d'un footing, bornes en min) ; volume (h) sous lequel les doublés servent peu
  // Allure spécifique (allure de l'objectif) : durée d'une fraction et volume total, en part du temps de course prédit
  const SPE = { '5k': { rep: [0.1, 0.25], tot: [0.6, 1.2] }, '10k': { rep: [0.08, 0.2], tot: [0.4, 0.8] },
    semi: { rep: [0.06, 0.15], tot: [0.35, 0.7] }, marathon: { rep: [0.04, 0.1], tot: [0.15, 0.35] } };
  // methode : 'zones' (Spécifique LPN, construite sur la répartition de Balance) ou l'identifiant d'une méthode d'entraîneur
  const state = { seances: 4, doubles: 0, moment: 'indifferent', semaines: 4, horizon: 'semaines', debut: '', fin: '', courses: [], cycle: 'auto', charge: 3, decharge: 1, difficulte: 4, methode: null, club1: false, club2: false, limite: null, limiteU: 'min', volType: 'cible',
    regles: { actif: false, debut: '', duree: 28, hormonale: false, irregulier: false, sensRegles: false, sensAvant: false }, // suivi du cycle menstruel (facultatif)
    nuit: { actif: false, mode: 'fixe', soirs: [false, false, false, false, false, false, false], debut: '', nuits: 3, repos: 4 } }; // travail de nuit (facultatif, LPN)

  try {
    const s = JSON.parse(localStorage.getItem('plan') || '{}');
    for (const c of Object.keys(state)) if (c in s) state[c] = s[c];
    if (s.mode === 'zones') state.methode = 'zones'; // ancien choix « Personnalisé » (devenu Spécifique LPN)
  } catch (e) { /* stockage indisponible */ }
  if (!state.methode) state.methode = 'zones'; // Spécifique LPN est le choix par défaut
  if (!['auto', 'constante', 'cycle'].includes(state.cycle)) state.cycle = 'auto';
  if (state.horizon !== 'date') state.horizon = 'semaines';
  if (state.limiteU !== 'km') state.limiteU = 'min';
  if (!['max', 'min'].includes(state.volType)) state.volType = 'cible'; // volume saisi : cible, maxi ou mini
  { // cycle menstruel : valeurs par défaut pour les champs absents ou invalides (anciennes sauvegardes)
    const r = state.regles && typeof state.regles === 'object' ? state.regles : {};
    state.regles = { actif: !!r.actif, debut: typeof r.debut === 'string' ? r.debut : '', duree: Number.isFinite(r.duree) ? borne(Math.round(r.duree), 15, 60) : 28,
      hormonale: !!r.hormonale, irregulier: !!r.irregulier, sensRegles: !!r.sensRegles, sensAvant: !!r.sensAvant };
    const n = state.nuit && typeof state.nuit === 'object' ? state.nuit : {}; // travail de nuit : idem
    state.nuit = { actif: !!n.actif, mode: n.mode === 'tournant' ? 'tournant' : 'fixe', soirs: Array.from({ length: 7 }, (_, k) => !!(Array.isArray(n.soirs) && n.soirs[k])),
      debut: typeof n.debut === 'string' ? n.debut : '', nuits: Number.isFinite(n.nuits) ? borne(Math.round(n.nuits), 1, 7) : 3, repos: Number.isFinite(n.repos) ? borne(Math.round(n.repos), 1, 14) : 4 };
  }
  if (!(state.limite > 0)) state.limite = null;
  state.courses = Array.isArray(state.courses) ? state.courses.filter(x => x && typeof x.date === 'string' && (x.d === null || Number.isFinite(x.d))) : [];
  state.courses.forEach(x => { if (x.prepa && !x.effort) x.effort = 'sansForcer'; delete x.prepa; }); // ancien choix « sans forcer »
  const save = () => { try { localStorage.setItem('plan', JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } };

  /* ---------- Formats ---------- */

  const fD = (m) => { // durée : 45 s, 1 min 30, 12 min, 1 h 05
    if (m >= 59.5) { const r = Math.round(m); return `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`; }
    const s = Math.round(m * 12) * 5;
    return s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s / 60} min`;
  };
  const fA = (x) => `${E.formatAllure(x)} /km`;
  const fourchette = ([a, b]) => { const x = E.formatAllure(Math.min(a, b)), y = E.formatAllure(Math.max(a, b)); return x === y ? `${x} /km` : `${x}–${y} /km`; };
  const arr5 = (x) => Math.max(5, Math.round(x / 5) * 5);
  const arrondi = (x) => (x >= 2 ? Math.round(x * 2) / 2 : x >= 1 ? Math.round(x * 4) / 4 : Math.round(x * 12) / 12);
  const moy = (m) => (Array.isArray(m) ? (m[0] + m[1]) / 2 : m);

  /* ---------- Allures (min/km), prédites par le moteur ---------- */

  const allureDist = (c, d) => E.tablePredictions(c.profil, [d])[0].allureMinKm;
  const pv = (lo, hi) => c => [1000 / (c.profil.V * hi / 100), 1000 / (c.profil.V * lo / 100)]; // allures entre lo et hi % de VMA
  /** Allure (min/km) d'une course de t minutes, prédite par le moteur */
  const allureT = (c, t) => t / (E.tableDistances(c.profil, [t])[0].distance / 1000);
  const emaPct = (c) => Math.round(82.5 + 2.5 * biais(c)); // Heubi : 80 à 85 % de VMA selon l'indice d'endurance
  // Galloway : allure de sortie longue (min/km) et ratio course / marche (min) selon cette allure, d'après sa table par mile
  const MILE = 1.609;
  const allureGalloway = (c) => allureDist(c, 42195) + 2 / MILE;
  const RATIOS_GALLOWAY = [[8.5, 4, 0.5], [9.5, 2, 0.5], [10.5, 1.5, 0.5], [12.5, 1, 0.5], [14.5, 0.5, 0.5], [15.5, 0.25, 0.5], [Infinity, 1 / 6, 0.5]];
  const ratioGalloway = (allure) => RATIOS_GALLOWAY.find(([p]) => allure * MILE <= p).slice(1);
  /** Texte course-marche (Galloway) ajouté aux footings et sorties longues ; vide hors de cette méthode */
  function courseMarche(c) {
    if (!c.courseMarche) return '';
    if (!c.profil) return ', en course-marche (ratio course / marche selon votre allure, par exemple 1 min 30 / 30 s)';
    const [r, w] = ratioGalloway(allureGalloway(c));
    return `, en course-marche : ${fD(r)} de course, ${fD(w)} de marche (ratio de Galloway pour ${fA(allureGalloway(c))})`;
  }
  const ALLURES = {
    vma: { nom: 'VMA', min: c => 1000 / c.profil.V },
    r: { nom: 'allure 1500 m', min: c => allureDist(c, 1500) },
    i: { nom: 'allure 3000 – 5000 m', min: c => [allureDist(c, 3000), allureDist(c, 5000)] },
    k5: { nom: 'allure 5 km', min: c => allureDist(c, 5000) },
    k10: { nom: 'allure 5 – 10 km', min: c => [allureDist(c, 5000), allureDist(c, 10000)] },
    seuil: { nom: 'allure 1 h (seuil)', min: c => 1000 / c.vRef },
    lt: { nom: 'allure 15 km – semi', min: c => [allureDist(c, 15000), allureDist(c, 21097)] },
    ssLong: { nom: 'allure semi – 30 km, sous le seuil', min: c => [allureDist(c, 21097), allureDist(c, 30000)] },
    ssCourt: { nom: 'allure 10 – 15 km, au seuil', min: c => [allureDist(c, 10000), allureDist(c, 15000)] },
    // Cottereau : résistance douce ≈ allure marathon à semi (80 – 90 % FCM), résistance dure ≈ allure 10 km (> 85 % FCM)
    rDouce: { nom: 'allure marathon – semi (résistance douce, 80 – 90 % FCM)', min: c => [allureDist(c, 42195), allureDist(c, 21097)] },
    rDure: { nom: 'allure 10 km (résistance dure, 90 – 95 % FCM)', min: c => allureDist(c, 10000) },
    // Heubi : allures en % de VMA
    v100: { nom: '100 – 105 % de VMA', min: pv(100, 105) },
    v90: { nom: '90 – 95 % de VMA', min: pv(90, 95) },
    v95_100: { nom: '95 – 100 % de VMA', min: pv(95, 100) },
    v85_90: { nom: '85 – 90 % de VMA', min: pv(85, 90) }, // Billat
    v105_110: { nom: '105 – 110 % de VMA', min: pv(105, 110) },
    // Heubi : endurance active à 80 – 85 % de VMA, placée selon l'indice d'endurance (85 % pour une bonne endurance)
    ema: { nom: c => `${emaPct(c)} % de VMA (endurance active, selon votre indice d'endurance)`, min: c => pv(emaPct(c) - 1, emaPct(c) + 1)(c) },
    // McMillan : allures des courses de 1 h 15 à 2 h 30 (steady), 40 min à 1 h 15 (tempo), 25 à 45 min (cruise), 1500 m à 5 km (speed)
    mcSteady: { nom: 'allure semi – marathon (steady state)', min: c => [allureDist(c, 42195), allureDist(c, 21097)] },
    mcTempo: { nom: 'allure de course de 40 min à 1 h 15 (tempo)', min: c => [allureT(c, 75), allureT(c, 40)] },
    mcCruise: { nom: 'allure de course de 25 à 45 min (cruise)', min: c => [allureT(c, 45), allureT(c, 25)] },
    mcSpeed: { nom: 'allure 1500 m – 5 km (speed)', min: c => [allureDist(c, 5000), allureDist(c, 1500)] },
    // Tinman : vitesse critique ≈ allure tenue environ 30 min ; allure 1 mile pour les fractions courtes de fin de séance
    cv: { nom: 'vitesse critique (≈ allure tenue 30 à 35 min)', min: c => [allureT(c, 35), allureT(c, 30)] },
    mile: { nom: 'allure 1 mile', min: c => allureDist(c, 1609) },
    deuxMiles: { nom: 'allure 2 miles (≈ 3200 m), relâché', min: c => allureDist(c, 3219) },
    // Galloway : sortie longue à l'allure marathon + 2 min par mile (≈ + 1 min 15 /km)
    galSL: { nom: 'allure de sortie longue Galloway (marathon + 2 min par mile)', min: c => allureGalloway(c) },
    // Norwegian Singles (sirpoc) : fractions sous le seuil à allure 15 km (courtes), semi (moyennes) et 30 km (longues)
    a15: { nom: 'allure 15 km', min: c => allureDist(c, 15000) },
    a20: { nom: 'allure 20 km', min: c => allureDist(c, 20000) },
    a30: { nom: 'allure 30 km', min: c => allureDist(c, 30000) },
    // Rousset : résistance vitesse ≈ 95 – 100 % de sa vitesse sur la distance (150 à 200 m), soit environ 130 – 140 % de VMA
    rVitesse: { nom: '95 – 100 % de votre vitesse sur la distance (≈ 135 % de VMA)', min: pv(130, 140) },
    z3: { nom: 'allure soutenue Z3', min: c => [c.zones.Z3.allureRapide, c.zones.Z3.allureLente] },
    obj: { nom: c => `allure ${c.nomObj}`, min: c => c.allureObj },
    // Hanson : force à l'allure marathon − 10 s par mile (table 3.4 du livre, citée sur LetsRun)
    force: { nom: c => `allure ${c.nomObj} − 10 s par mile (≈ − 6 s /km)`, min: c => c.allureObj - 10 / 60 / MILE },
    ext: { nom: c => `90 – 95 % de la vitesse ${c.nomObj}`, min: c => [c.allureObj / 0.95, c.allureObj / 0.9] }
  };
  function al(c, cle) {
    const a = ALLURES[cle], nom = typeof a.nom === 'function' ? a.nom(c) : a.nom;
    if (!c.profil) return `à ${nom}`;
    const m = a.min(c);
    return `à ${nom} (${Array.isArray(m) ? fourchette(m) : fA(m)})`;
  }
  const zt = (c, id) => (c.profil ? `${id} (${E.allureZone(c.zones[id], true)} /km)` : id);
  /** Allure moyenne d'une zone (min/km), pour estimer les distances : milieu des bornes, Z1 à 60 % de l'allure 1 h */
  const aZ = (c, id) => { const z = c.zones[id]; return z.pMin === null ? 1000 / (c.vRef * 0.6) : z.pMax === null ? 1000 / (c.vRef * (z.bas + z.haut) / 200) : (z.allureRapide + z.allureLente) / 2; };
  /** Distance (km) de fractions : répétitions à l'allure donnée, récupérations en Z1 ; null sans profil */
  const kmS = (c, S, allure) => (c.profil ? S.n * S.r / allure + (S.n - 1) * S.rc / aZ(c, 'Z1') : null);
  /** Plage d'allures (min/km, [rapide, lente]) d'une zone, zones ouvertes bornées (as / haut de E.zones) ; null sans profil */
  const plageZ = (c, id) => { if (!c.profil) return null; const z = c.zones[id]; return [z.allureRapide ?? 1000 / (c.vRef * z.haut / 100), z.allureLente ?? 1000 / (c.vRef * z.bas / 100)]; };
  /** Plage d'allures d'une clé de ALLURES (± 1,5 % autour d'une allure unique) ; null sans profil */
  const plageA = (c, cle) => { if (!c.profil) return null; const m = ALLURES[cle].min(c); return Array.isArray(m) ? [Math.min(...m), Math.max(...m)] : [m * 0.985, m * 1.015]; };
  /** Zone d'une allure (min/km) */
  const zoneDe = (c, allure) => { const p = 100 * (1000 / allure) / c.vRef; return (Object.values(c.zones).find(z => p < (z.pMax ?? Infinity)) || c.zones.Z6).id; };
  /** Somme de répartitions par zone ({ Z1: min, … }) */
  const ajoute = (...ps) => ps.reduce((a, p) => { for (const k in p) a[k] = (a[k] || 0) + p[k]; return a; }, {});

  /* ---------- Longueur maximale d'une séance (étape 2, facultative) ---------- */

  // Limite en durée, ou en distance convertie en durée à l'allure moyenne de Z2 (6 min/km sans profil). min : durée limite, km : distance
  // limite (null en durée), txt : texte des alertes
  // Minimum : 20 min (en km, la distance de 20 min à l'allure de Z2) ; maximum : 5 h ou 60 km
  const LIMITE_MIN = EF_MIN;
  const allureZ2 = (c) => (c.profil ? aZ(c, 'Z2') : 6);
  const bornesLimite = (c) => (state.limiteU === 'km' ? [Math.ceil(LIMITE_MIN / allureZ2(c) * 2) / 2, 60] : [LIMITE_MIN, 300]);
  function limiteDe(c) {
    if (!(state.limite > 0)) return null;
    const km = state.limiteU === 'km', allure = allureZ2(c), n = state.limite;
    const min = Math.max(LIMITE_MIN, km ? n * allure : n);
    return { min, km: km ? n : null, txt: km ? `${n.toLocaleString('fr-FR')} km${c.profil ? ` (≈ ${fD(min)})` : ''}` : fD(n) };
  }
  /** Séance (durée, et distance si la limite est en km) au-dessus de la limite c.limite */
  const depasse = (c, x) => !!c.limite && (x.duree > c.limite.min + 0.01 || !!(c.limite.km && x.km && x.km > c.limite.km + 0.01));
  /** Séance ramenée sous la limite : regen(k) la refait avec un travail multiplié par k (échauffement et retour au calme inchangés) */
  function reduire(c, x, regen) {
    const L = c.limite, fixe = (x.echauf ?? echauffement(c, x.zone)) + RETOUR;
    let k = 1, y = x;
    for (let n = 0; n < 8 && depasse(c, y); n++) {
      const r = [(L.min - fixe) / Math.max(1, y.duree - fixe)];
      if (L.km && y.km) r.push(L.km / y.km);
      k *= Math.max(0.3, Math.min(...r) * 0.97);
      y = regen(k);
    }
    return y;
  }

  /* ---------- Séances ---------- */

  // Fractions : durée d'une répétition et travail total (min) selon le niveau l (0 à 1) et le facteur de volume s ;
  // récupération en part de la répétition (de la plus longue à la plus courte quand le niveau monte)
  function series(l, s, rep, total, recup, recupMin = 0) {
    const r = arrondi(lerp(rep[0], rep[1], l)), n = Math.max(2, Math.round(lerp(total[0], total[1], l) * s / r));
    const rc = arrondi(Math.max(recupMin, r * lerp(recup[0], recup[1], l)));
    return { r, n, rc, travail: n * r + (n - 1) * rc };
  }
  function fractions(c, S, cle, recup) {
    const a = c.profil && moy(ALLURES[cle].min(c)), d = c.profil ? ` (≈ ${Math.round(S.r / a * 10) * 100} m)` : '';
    return { travail: S.travail, effort: S.n * S.r, km: kmS(c, S, a), texte: `${S.n} × ${fD(S.r)}${d} ${al(c, cle)}, récupération ${fD(S.rc)} ${recup}`,
      etapes: [{ rep: S.n, etapes: [{ t: 'effort', duree: S.r, allure: plageA(c, cle) }, { t: 'recup', duree: S.rc }] }] };
  }
  function continu(c, duree, cle) {
    const t = arr5(duree), km = c.profil ? t / moy(ALLURES[cle].min(c)) : null;
    return { travail: t, km, texte: `${fD(t)} en continu${km ? ` (≈ ${km.toFixed(1).replace('.', ',')} km)` : ''} ${al(c, cle)}`, etapes: [{ t: 'effort', duree: t, allure: plageA(c, cle) }] };
  }
  // Norwegian Singles : temps de travail sous le seuil par séance de 18 à 40 min selon le niveau (table de niveaux du forum courseapied.net,
  // 8 niveaux) ; livre de Copeland : court 3 min (récupération 1 min, allure 12 – 15 km), moyen 5 – 6 min (1 min 30, allure 20 km), long 10 – 12 min (1 min 30 à 2 min, allure 25 – 30 km)
  const nsFractions = (c, l, s, rep, cle) => {
    const W = borne(lerp(18, 40, l) * s, 18, 40), r = arrondi(lerp(rep[0], rep[1], l)), n = Math.max(2, Math.round(W / r)), rc = r < 5 ? 1 : r < 8 ? 1.25 : 1.75;
    return fractions(c, { r, n, rc, travail: n * r + (n - 1) * rc }, cle, 'en trottinant ou à l\'arrêt');
  };
  const NS_CONSEIL = "Sous le seuil, intensité contrôlée : fréquence cardiaque juste sous celle du seuil lactique à la dernière répétition (effort 6 – 7 sur 10) ; finir en pouvant en refaire. Si la fatigue s'accumule, baissez l'allure.";
  const tRef = (c) => Math.max(c.tObj, 60); // échelle des séances à allure objectif longues (Hanson, Canova)
  // Magness, entonnoir : échelle des allures, de la plus lente à la plus rapide ; à la phase k (1 à 3), une allure lente et une
  // rapide se rapprochent de l'objectif (le marathon, sans allure plus lente, est approché par le côté rapide)
  const NOMS_DIST = { 1500: '1500 m', 1609: '1 mile', 3000: '3000 m', 5000: '5 km', 10000: '10 km', 15000: '15 km', 21097: 'semi-marathon', 42195: 'marathon' };
  const ECHELLE_MAG = [42195, 21097, 15000, 10000, 5000, 3000, 1500];
  const entonnoir = (c, k) => { const g = ECHELLE_MAG.indexOf(c.dist); return [ECHELLE_MAG[Math.max(0, g - (4 - k))], ECHELLE_MAG[Math.min(6, g + (4 - k))]].map(d => `MAG@${d}`); };
  // McMillan : type de coureur d'après l'indice d'endurance ; un Speedster commence par la vitesse, un Endurance Monster par la stamina
  const typeMcMillan = (c) => (biais(c) >= 1 / 3 ? 'Endurance Monster' : biais(c) <= -1 / 3 ? 'Speedster' : 'Combo');
  const selonType = (ids) => (c) => {
    const t = typeMcMillan(c), vite = ids.filter(x => x === 'MC_SPEED'), autres = ids.filter(x => x !== 'MC_SPEED');
    return t === 'Speedster' ? [...vite, ...autres] : t === 'Endurance Monster' ? [...autres, ...vite] : ids;
  };

  // gen(l, s, c) → { travail (min, récupérations comprises), texte } ; zone 'obj' : zone de l'allure de l'objectif
  const SEANCES = {
    VMA_LONG: { nom: 'Intervalles VO2max (I)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [12, 24], [1, 0.7]), 'i', 'en trottinant') },
    VMA_PFITZ: { nom: 'VO2max', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [2, 5], [15, 25], [0.9, 0.5]), 'k5', 'en trottinant') },
    VMA_HANSON: { nom: 'Vitesse', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.5, 4], [12, 24], [0.8, 0.5]), 'k10', 'en trottinant') },
    // Billat : fractions de la moitié du temps limite à VMA ; dans le modèle, la VMA est tenue 6 min, d'où ≈ 3 min
    VMA_TLIM: { nom: 'Fractions à VMA', zone: 'Z5', alerte: "Séance très difficile : arrêtez la série si l'allure ne tient plus, plutôt que de finir à tout prix.", gen: (l, s, c) => fractions(c, series(l, s, [2.5, 3.5], [10, 20], [1, 1]), 'vma', `à 50 % de VMA${c.profil ? ` (${fA(2000 / c.profil.V)})` : ''}`) },
    TRENTE: { nom: '30-30', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(6, Math.round(lerp(8, 20, l) * s)), nbS = Math.ceil(n / 12), par = Math.ceil(n / nbS);
      return { travail: nbS * par + (nbS - 1) * 3, effort: nbS * par / 2, km: c.profil && nbS * par * 0.75 * c.profil.V / 1000 + (nbS - 1) * 3 / aZ(c, 'Z1'), texte: `${nbS > 1 ? `${nbS} séries de ` : ''}${par} × (30 s ${al(c, 'vma')}, 30 s à 50 % de VMA${c.profil ? ` (${fA(2000 / c.profil.V)})` : ''})${nbS > 1 ? ', 3 min de trot entre les séries' : ''}` };
    } },
    // Billat et al. 2001 (Int J Sports Med) : 15 s / 15 s autour de la vitesse critique (≈ 86 % de VMA) : 100 % / 70 % de VMA, l'amplitude la plus faible garde 14 min à VO2max (le double d'une amplitude de 60 / 110 %)
    BIL_1515: { nom: '15-15 (amplitude réduite)', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(20, Math.round(lerp(28, 48, l) * s)), nbS = Math.ceil(n / 24), par = Math.ceil(n / nbS);
      return { travail: nbS * par / 2 + (nbS - 1) * 3, effort: nbS * par / 4, km: c.profil && nbS * par * 0.425 * c.profil.V / 1000 + (nbS - 1) * 3 / aZ(c, 'Z1'), texte: `${nbS > 1 ? `${nbS} séries de ` : ''}${par} × (15 s ${al(c, 'vma')}, 15 s à 70 % de VMA${c.profil ? ` (${fA(1000 / (0.7 * c.profil.V))})` : ''})${nbS > 1 ? ', 3 min de trot entre les séries' : ''}` };
    } },
    INTERVALLES_LONGS: { nom: 'Intervalles longs', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [4, 8], [16, 32], [0.5, 0.25]), 'k10', 'en trottinant') },
    // Daniels : cruise intervals de 5 à 15 min, 1 min de récupération pour 5 min d'effort
    // Billat (livre, chap. 6, table de prescription par % de VAM) : répétitions en fraction du temps limite, récupération en multiple de l'effort
    BIL_105: { nom: 'Fractions courtes à 105 – 110 % de VMA', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [0.75, 1.5], [8, 15], [2, 2]), 'v105_110', 'en trottinant') },
    BIL_88: { nom: 'Fractions longues à 85 – 90 % de VMA', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [7, 12], [14, 36], [0.5, 0.5]), 'v85_90', 'en trottinant') },
    BIL_SEUIL: { nom: 'Seuil en grandes fractions', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [15, 30], [30, 75], [0.25, 0.15]), 'seuil', 'en trottinant') },
    SEUIL: { nom: 'Seuil (T)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [5, 15], [15, 35], [0.2, 0.2]), 'seuil', 'en trottinant') },
    // Lydiard : circuit de côte (montée en bondissant, descente rapide et relâchée, accélérations à plat), 2 à 4 tours
    LYD_CIRCUIT: { nom: 'Circuit de côte', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(2, Math.round(lerp(2, 4, l) * s));
      return { travail: n * 6, km: c.profil && n * 6 / aZ(c, 'Z3'), texte: `${n} circuits de ≈ 6 min : montée de 1 min 30 à 2 min en bondissant (genoux hauts, bras actifs), descente rapide et relâchée, puis 4 accélérations de 15 s à plat et retour en trottinant` };
    } },
    // Lydiard : contre-la-montre sur une distance plus courte que la course (ici en durée : la moitié du temps de course)
    LYD_TT: { nom: 'Contre-la-montre', zone: 'Z5', gen: (l, s, c) => {
      const d = arr5(borne(0.5 * c.tObj, 8, 40)), a = c.profil && allureT(c, d);
      return { travail: d, km: c.profil && d / a, texte: `contre-la-montre de ${fD(d)}, à fond mais régulier${a ? ` (≈ ${fA(a)})` : ''}, sur une distance plus courte que la course` };
    } },
    // Canova : footing progressif en 3 parties, en % de la vitesse marathon (arg : 1 moyen, 2 moyen-rapide, 3 rapide)
    CAN_PROG: { nom: k => ['', 'Progressif moyen', 'Progressif moyen-rapide', 'Progressif rapide'][k], zone: k => (k === 1 ? 'Z3' : 'Z4'), gen: (l, s, c, k) => {
      const [dur, pcts] = { 1: [[60, 90], [85, 92, 100]], 2: [[45, 60], [95, 100, 105]], 3: [[20, 40], [102, 105, 108]] }[k];
      const d = arr5(Math.min(lerp(dur[0], dur[1], l) * s, dur[1])), aM = c.profil && allureDist(c, 42195);
      return { travail: d, km: c.profil && pcts.reduce((a, p) => a + d / 3 / (aM * 100 / p), 0),
        texte: `${fD(d)} en continu, en 3 parties de ${fD(d / 3)} : ${pcts.map(p => `${p} %${aM ? ` (${fA(aM * 100 / p)})` : ''}`).join(', ')} de la vitesse marathon` };
    } },
    // Méthode norvégienne : seuil contrôlé (lactate ≈ 2 à 4 mmol/L), fractions longues le matin, courtes le soir, récupérations brèves
    SEUIL_NO_LONG: { nom: 'Seuil, fractions longues', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 2 à 3 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [5, 10], [25, 40], [0.2, 0.1], 1), 'ssLong', 'en trottinant') },
    SEUIL_NO_COURT: { nom: 'Seuil, fractions courtes', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 3 à 4 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [1.5, 3], [20, 30], [0.4, 0.2], 0.5), 'ssCourt', 'en trottinant') },
    COTES_COURTES: { nom: 'Côtes courtes', zone: 'Z6', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 0.75], [6, 12], [2.5, 2]);
      return { travail: S.travail, effort: S.n * S.r, km: c.profil && kmS(c, S, aZ(c, 'Z6')), texte: `${S.n} × ${fD(S.r)} de montée rapide et relâchée (Z6), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
    } },
    // Cottereau : résistance douce (blocs longs, récupération très lente de 5 à 7 min pour le marathon) et résistance dure
    // (3 à 4 min, récupération de même durée) ; pas de VMA courte
    COT_DOUCE: { nom: 'Résistance douce', zone: 'Z3', gen: (l, s, c) => {
      const m = c.goal === 'marathon';
      return fractions(c, series(l, s, m ? [15, 15] : [10, 12], m ? [30, 60] : [20, 30], m ? [0.47, 0.33] : [0.5, 0.4]), 'rDouce', 'en trottinant très lentement');
    } },
    COT_DURE: { nom: 'Résistance dure', zone: 'Z5',
      conseil: "Échauffement conseillé par Cottereau : 15 min d'endurance, 2 à 3 min de marche, 5 min de résistance douce, 1 à 2 min de marche, 6 à 7 lignes droites progressives d'environ 20 s. À la fin, vous devez pouvoir refaire autant de répétitions à la même vitesse.",
      gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [9, 20], [1, 0.8]), 'rDure', 'en trottinant très lentement') },
    // Norwegian Singles (sirpoc) : trois séances sous le seuil par semaine (court, moyen, long), sans VO2max
    NS_COURT: { nom: 'Sous-seuil court', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [3, 4], 'a15') },
    NS_MOYEN: { nom: 'Sous-seuil moyen', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [5, 6], 'a20') },
    NS_LONG: { nom: 'Sous-seuil long', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [10, 12], 'a30') },
    // Rousset : endurance active (train à allure marathon – semi, tempo-route en fractions à allure 10 km – semi), résistance quantitative (VMA,
    // récupération courue sans jamais s'arrêter), résistance qualitative et vitesse (récupérations longues et passives), diagonales
    ROU_TRAIN: { nom: 'Train (endurance active)', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(20, 45, l) * s, 'mcSteady') },
    ROU_TEMPO: { nom: 'Tempo-route', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [4, 12], [16, 36], [0.2, 0.15]), c.dist > 20000 ? 'lt' : 'k10', 'en trottinant, sans jamais s\'arrêter') },
    ROU_RQUANTI: { nom: 'Résistance quantitative (VMA)', zone: 'Z5', conseil: "Ne jamais marcher ni s'arrêter : la récupération se court (en trottinant, pas moins de 9 km/h). Réglez l'effort à la sensation plutôt qu'au chrono.",
      gen: (l, s, c) => fractions(c, series(l, s, [0.75, 3.5], [12, 20], [1.1, 0.8]), l < 0.5 ? 'v100' : 'v95_100', 'en trottinant') },
    ROU_RQUALI: { nom: 'Résistance qualitative', zone: 'Z6', conseil: "Récupération longue et passive (5 à 10 min, voire plus) : partir détendu, à 90 – 95 % de vos possibilités sur la distance.",
      gen: (l, s, c) => fractions(c, series(l, s, [0.75, 1.6], [4, 8], [5, 4], 5), 'r', 'passive') },
    ROU_RVITESSE: { nom: 'Résistance vitesse', zone: 'Z6', conseil: 'Récupération complète (5 à 10 min) : chaque répétition doit rester vive et relâchée.',
      gen: (l, s, c) => fractions(c, series(l, s, [0.4, 0.55], [2, 3.5], [12, 12], 5), 'rVitesse', 'passive ou en marchant') },
    ROU_DIAG: { nom: 'Diagonales', zone: 'Z6', gen: (l, s, c) => {
      const n = Math.round(lerp(20, 40, l));
      return { travail: n, effort: n * 0.25, km: c.profil && (n * 0.1 + n * 0.75 / aZ(c, 'Z1')), texte: `${n} diagonales d'un terrain de sport (≈ 100 m) : accélération progressive puis relâchement, retour en trottant sur la longueur (≈ 45 s)` };
    } },
    // Heubi : VMA courte (30 s à 1 min 15), moyenne, longue, volume effort + récupération de 20 à 26 min, récupération active
    // à ≈ 50 % de VMA ; endurance active (EMA) à 80 – 85 % de VMA selon l'indice d'endurance
    HEU_VMA_COURTE: { nom: 'VMA courte', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [0.5, 1.25], [10, 13], [1, 1]), 'v100', 'active à ≈ 50 % de VMA') },
    HEU_VMA_MOY: { nom: 'VMA moyenne', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.5, 3], [11, 14], [0.8, 0.6]), 'v95_100', 'active à ≈ 50 % de VMA') },
    HEU_VMA_LONGUE: { nom: 'VMA longue', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [12, 16], [0.6, 0.4]), 'v90', 'active à ≈ 50 % de VMA') },
    HEU_EMA: { nom: 'Endurance active (EMA)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [10, 20], [20, 40], [0.2, 0.1], 2), 'ema', 'en trottinant') },
    // McMillan : zone Stamina (steady state, tempo, tempo en fractions, cruise intervals) et Speed (VO2max)
    MC_STEADY: { nom: 'Steady state', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(25, 60, l) * s, 'mcSteady') },
    MC_TEMPO: { nom: 'Tempo', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(15, 30, l) * s, 'mcTempo') },
    MC_TEMPO_INT: { nom: 'Tempo en fractions', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [8, 15], [20, 35], [0.35, 0.2], 2), 'mcTempo', 'en trottinant') },
    MC_CRUISE: { nom: 'Cruise intervals', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [3, 8], [18, 32], [0.5, 0.15], 0.5), 'mcCruise', 'en trottinant') },
    MC_SPEED: { nom: 'Speed (VO2max)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1, 5], [12, 24], [1, 0.5]), 'mcSpeed', 'en trottinant') },
    // Tinman : 5 à 7 × 3 min à la vitesse critique, 1 min de trot, puis 4 à 6 × 40 s à allure 1 mile (version en durée
    // donnée par Schwartz pour les parcours non mesurés)
    TIN_CV: { nom: 'Vitesse critique (CV)', zone: 'Z4', gen: (l, s, c) => {
      const S = series(l, s, [3, 3], [15, 21], [0.33, 0.33]), m = Math.round(lerp(4, 6, l)), f = fractions(c, S, 'cv', 'en trottinant');
      return { travail: S.travail + 3 + m * 1.67, effort: f.effort + m * 0.67, km: c.profil && f.km + m * 0.67 / allureDist(c, 1609) + (m + 3) / aZ(c, 'Z1'),
        texte: `${f.texte}, puis 3 min de trot et ${m} × 40 s ${al(c, 'mile')}, récupération 1 min en trottinant` };
    } },
    // Magness, entonnoir : fractions à l'allure d'une distance (arg) qui se rapproche de l'objectif au fil des phases ;
    // côté rapide (≤ 5 km) fractions courtes, côté lent fractions longues
    MAG: { nom: d => `Allure ${NOMS_DIST[d]}`, zone: d => (d <= 1500 ? 'Z6' : d <= 5000 ? 'Z5' : d <= 15000 ? 'Z4' : 'Z3'), gen: (l, s, c, d) => {
      const T = c.profil ? E.tablePredictions(c.profil, [d])[0].temps : d / (10000 / 60), rapide = d <= 5000;
      const S = series(l, s, (rapide ? [0.08, 0.2] : [0.15, 0.35]).map(x => Math.min(20, x * T)),
        (rapide ? [0.6, 1] : [0.5, 0.9]).map(x => borne(x * T, 5, 45)), rapide ? [0.8, 0.5] : [0.2, 0.1], 1);
      const a = c.profil && allureDist(c, d);
      return { travail: S.travail, km: kmS(c, S, a), texte: `${S.n} × ${fD(S.r)} à allure ${NOMS_DIST[d]}${a ? ` (${fA(a)})` : ''}, récupération ${fD(S.rc)} en trottinant` };
    } },
    MAG_SPRINTS: { nom: 'Sprints en côte', zone: 'Z6', gen: (l) => {
      const n = Math.round(lerp(6, 10, l));
      return { travail: n * 2.7, effort: n * 0.15, km: 0.4, texte: `${n} × 8 à 10 s de sprint en côte (Z6, puissance), récupération complète de 2 à 3 min en marchant` };
    } },
    // Galloway : fractions à l'allure de l'objectif (en durée), récupération en marchant ; mile magique = test toutes les 2 semaines
    // Galloway, Marathon: You Can Do It! : répétitions « miles » à l'allure de l'objectif, marche d'au moins 4 min entre elles (en durée, pas en distance)
    GAL_MILE: { nom: "Répétitions à l'allure de l'objectif", zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [6, 11], [18, 66], [0.4, 0.4], 2), 'obj', 'en marchant (4 min au moins)') },
    // Galloway, livre de 1984 : répétitions de 440 yards (≈ 1 min 30 à 2 min) un peu plus vite que l'allure de l'objectif, jusqu'à 20, récupération en trottinant
    GAL84_440: { nom: 'Répétitions courtes (440 yards)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.25, 2], [6, 30], [1, 0.8], 2), 'k10', 'en trottinant') },
    GAL_MM: { nom: 'Mile magique (test)', zone: 'Z5',
      conseil: "Le temps obtenu recale les allures : allure marathon ≈ temps du mile × 1,3 ; sortie longue ≈ temps × 1,3 + 2 min par mile. Les pauses de marche sont permises.",
      gen: (l, s, c) => {
        const t = c.profil ? allureDist(c, 42195) * MILE / 1.3 : 9;
        return { travail: t, km: MILE, texte: `1 mile (1609 m, 4 tours de piste) un peu plus vite que d'habitude, régulier, sans aller à fond${c.profil ? ` (≈ ${E.formatTemps(t)})` : ''}` };
      } },
    // Fitzgerald (80/20) : sa zone 3 = seuil (allure 1 h), zone 4 = VO2max (allure 3000 – 5000 m), zone 5 = vitesse (allure 1500 m)
    FITZ_TEMPO: { nom: 'Tempo (zone 3)', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(20, 30, l) * s, 'seuil') },
    FITZ_CRUISE: { nom: 'Cruise intervals (zone 3)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [5, 8], [18, 30], [0.33, 0.25]), 'seuil', 'en trottinant (zone 1)') },
    FITZ_LONG_INT: { nom: 'Intervalles longs (zone 4)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [15, 24], [0.67, 0.4]), 'i', 'en trottinant (zone 1)') },
    FITZ_SHORT_INT: { nom: 'Intervalles courts (zone 5)', zone: 'Z6', gen: (l, s, c) => fractions(c, series(l, s, [1, 1.5], [8, 14], [1.5, 1]), 'r', 'en trottinant (zone 1)') },
    FITZ_FARTLEK: { nom: 'Speed play (zone 4)', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(4, Math.round(lerp(6, 10, l) * s)), r = arrondi(lerp(0.5, 1, l));
      return { travail: n * (r + 1), effort: n * r, km: c.profil && kmS(c, { n, r, rc: 1 }, moy(ALLURES.i.min(c))),
        texte: `footing en zone 2 avec ${n} accélérations de ${fD(r)} ${al(c, 'i')}, 1 min de footing entre chacune` };
    } },
    // Kellogg (« The Training Wisdom of John Kellogg », LetsRun) : footing progressif jusqu'à l'état stable maximal ; seuil en
    // fractions (8 – 15 × 3 min à 2 × 20 min, récupérations courtes) ; 10 – 15 × 1 min à allure 2 miles, 1 min de trot ;
    // 2 – 3 séries de 5 – 6 lignes droites progressives de 15 à 35 s
    KEL_STEADY: { nom: 'Progressif « high-end »', zone: 'Z4', gen: (l, s, c) => {
      const t = arr5(lerp(25, 50, l) * s), a = c.profil && ALLURES.lt.min(c);
      return { travail: t, km: c.profil && t / moy(a), texte: `${fD(t)} en accélérant peu à peu de l'allure facile jusqu'à l'état stable maximal (« maximum steady state » : le plus vite possible en restant fluide et en contrôle${a ? `, ≈ ${fourchette(a)}` : ''})` };
    } },
    KEL_SEUIL: { nom: 'Seuil en fractions', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [3, 20], [24, 45], [0.33, 0.1], 1), 'lt', 'en trottinant') },
    KEL_RELAX: { nom: 'Rapide et relâché', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1, 1], [10, 15], [1, 1]), 'deuxMiles', 'en trottinant, sans se crisper') },
    KEL_LD: { nom: 'Footing et séries de lignes droites', zone: 'Z2', leger: true, gen: (l) => {
      const nS = Math.round(lerp(2, 3, l)), n = Math.round(lerp(5, 6, l));
      return { travail: nS * n + (nS - 1) * 7, texte: `${nS} séries de ${n} lignes droites de 15 à 35 s, chacune un peu plus vite que la précédente, relâchées (Z6), retour en trottinant ; 5 à 10 min de footing entre les séries` };
    } },
    // Canova (message de Canova sur LetsRun, « Does it matter how fast you do your long runs? ») : vitesses en % de la vitesse
    // de course, calculées à sa façon (105 % = allure − 5 %) ; volumes en multiples du temps de course T (son exemple : 5000 m)
    CAN: { nom: p => `Canova ${p} %`, zone: p => (p >= 110 ? 'Z6' : p >= 100 ? 'Z5' : 'Z4'), gen: (l, s, c, p) => {
      const T = c.tObj, a = c.profil && c.allureObj * (2 - p / 100);
      if (p <= 90) { const t = arr5(Math.min(90, lerp(2.2, 4.4, l) * T * s)); return { travail: t, km: c.profil && t / a, texte: `${fD(t)} en continu à ${p} % de la vitesse ${c.nomObj}${a ? ` (${fA(a)})` : ''}` }; }
      const P = { 110: [[0.08, 0.12], [0.6, 0.7], [1.2, 1]], 105: [[0.1, 0.2], [0.9, 1], [1, 0.7]], 100: [[0.2, 0.4], [1.6, 2], [1, 0.5]], 95: [[0.4, 0.6], [2, 3], [0.33, 0.33]] }[p];
      const S = series(l, s, P[0].map(x => x * T), P[1].map(x => borne(x * T, 5, 60)), P[2], 1);
      return { travail: S.travail, effort: S.n * S.r, km: kmS(c, S, a), texte: `${S.n} × ${fD(S.r)} à ${p} % de la vitesse ${c.nomObj}${a ? ` (${fA(a)})` : ''}, récupération ${fD(S.rc)} en trottinant` };
    } },
    TEMPO: { nom: 'Tempo au seuil lactique', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(15, 40, l) * s, 'lt') },
    // plafonné aux 2/3 du temps limite à l'allure objectif (≈ chrono prédit) : sur 5 et 10 km, l'échelle tRef dépasserait ce qu'on peut tenir
    TEMPO_OBJ: { nom: 'Tempo à allure objectif', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(90, lerp(0.2, 0.45, l) * tRef(c) * s, Math.floor(TLIM_PART * c.tObj / 5) * 5), 'obj') },
    // Hanson : 6 × 1 mile à 2 × 3 miles (≈ 6 miles au total), 400 à 800 m de trot entre les fractions
    FORCE: { nom: 'Force', zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [0.04, 0.11].map(x => x * tRef(c)), [0.18, 0.25].map(x => x * tRef(c)), [0.3, 0.15], 2.5), 'force', 'en trottinant') },
    SPE: { nom: 'Allure spécifique', zone: 'obj', gen: (l, s, c) => {
      const p = SPE[c.goal], T = c.tObj;
      return fractions(c, series(l, s, p.rep.map(x => x * T), p.tot.map(x => Math.min(90, x * T)), [0.5, 0.2], 1), 'obj', 'en trottinant');
    } },
    SPE_EXT: { nom: 'Spécifique long', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(100, lerp(0.25, 0.5, l) * tRef(c) * s), 'ext') },
    VITESSE: { nom: 'Vitesse (R)', zone: 'Z6', gen: (l, s, c) => fractions(c, series(l, s, [0.5, 1.25], [4, 8], [3, 2]), 'r', 'en marchant ou en trottinant (récupération complète)') },
    COTES: { nom: 'Côtes', zone: 'Z5', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 1.5], [5, 12], [2.5, 1.5]);
      return { travail: S.travail, effort: S.n * S.r, km: c.profil && kmS(c, S, aZ(c, 'Z5')), texte: `${S.n} × ${fD(S.r)} de montée à effort soutenu (Z5, à la sensation), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
    } },
    FARTLEK: { nom: 'Fartlek', zone: 'Z3', gen: (l, s, c) => {
      const d = arr5(lerp(20, 40, l) * s);
      return { travail: d, km: c.profil && d / aZ(c, 'Z3'), texte: `${fD(d)} de fartlek : ${Math.round(d / 4)} accélérations de 1 à 3 min (Z3 à Z5, à la sensation), trot entre les accélérations` };
    } },
    SOUTENU: { nom: 'Allure soutenue', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(20, 50, l) * s, 'z3') },
    EF_LD: { nom: 'Footing et lignes droites', zone: 'Z2', leger: true, gen: (l) => {
      const n = Math.round(lerp(6, 10, l));
      return { travail: n * 4 / 3, texte: `${n} lignes droites de 20 s (vite et relâché, Z6), 1 min de marche ou de trot entre chacune` };
    } }
  };

  /** Séance de qualité ; une séance légère (lignes droites) reçoit la durée de son footing plus tard (avecFooting) */
  // id « SEANCE@arg » : séance paramétrée (Magness : distance de l'allure travaillée) ; nom et zone peuvent dépendre de arg
  function qualite(id, l, s, c) {
    const [base, a] = id.split('@'), arg = Number(a), S = SEANCES[base], r = S.gen(l, s, c, arg);
    const nom = typeof S.nom === 'function' ? S.nom(arg) : S.nom, z = typeof S.zone === 'function' ? S.zone(arg) : S.zone, zone = z === 'obj' ? c.zoneObj : z;
    if (S.leger) return { nom, zone, leger: true, travail: 0, extra: r.travail, lignes: r.texte };
    return { ...enveloppe(c, id, nom, zone, r, S), echelle: s }; // echelle : facteur de volume, pour la ramener sous la limite de longueur
  }
  /** Séance de qualité complète : échauffement, corps de séance r ({ travail, effort, km, texte, etapes, parts }), retour au calme.
      effort : temps à l'allure de la séance, sans les récupérations (plafonds de Daniels) ; parts : minutes par zone, les
      récupérations comptent en Z1, l'effort dans la zone de la séance (sauf si r.parts le détaille) ; etapes : pour les montres */
  function enveloppe(c, id, nom, zone, r, S = {}) {
    const effort = r.effort ?? r.travail, echauf = echauffement(c, zone);
    return { id, nom, zone, qualite: true, echauf, travail: r.travail, effort, duree: arr5(echauf + RETOUR + r.travail),
      km: c.profil ? (echauf + RETOUR) / aZ(c, 'Z2') + r.km : null,
      parts: ajoute({ Z2: echauf, Z1: RETOUR }, r.parts || { Z1: r.travail - effort, [zone]: effort }),
      etapes: [{ t: 'echauffement', duree: echauf, allure: plageZ(c, 'Z2') }, ...(r.etapes || [{ t: 'effort', duree: r.travail, nom }]),
        { t: 'retour', duree: RETOUR, allure: plageZ(c, 'Z1') }],
      texte: `Échauffement ${echauf} min en Z2 · ${r.texte} · retour au calme ${RETOUR} min en Z1.${S.alerte ? ` <strong class="doute">${S.alerte}</strong>` : ''}${S.conseil ? ` <em>${S.conseil}</em>` : ''}` };
  }
  // Footing suivi de lignes droites (séance légère) : le quart du temps des lignes droites compte en Z6
  const avecFooting = (x, d, c) => ({ ...x, duree: arr5(d + x.extra), km: c.profil ? (d + x.extra) / aZ(c, 'Z2') : null,
    parts: { Z2: d + x.extra * 0.75, Z6: x.extra * 0.25 },
    etapes: [{ t: 'footing', duree: d, allure: plageZ(c, 'Z2') }, { t: 'effort', duree: x.extra, nom: 'Lignes droites' }],
    texte: `Footing ${fD(d)} en ${zt(c, 'Z2')}, puis ${x.lignes}.` });
  // SL_SPE : fin de sortie à l'allure de l'objectif (semi, marathon) ; SL_FIN : « fast finish » de 10 à 20 min à allure marathon
  function longue(type, d, l, c) {
    const spe = type === 'SL_SPE' && c.dist > 20000, fin = type === 'SL_FIN';
    // partie à l'allure objectif plafonnée aux 2/3 du temps limite à cette allure (≈ chrono prédit), comme tout effort continu
    const p = spe ? Math.min(arr5(lerp(0.15, 0.35, l) * d), Math.floor(TLIM_PART * c.tObj / 5) * 5) : fin ? arr5(lerp(10, 20, l)) : 0, aFin = c.profil && (fin ? allureDist(c, 42195) : c.allureObj);
    const zFin = !p ? null : c.profil ? zoneDe(c, aFin) : fin ? 'Z3' : c.zoneObj;
    return { nom: 'Sortie longue', zone: 'Z2', duree: d, travail: p, km: c.profil ? (d - p) / (c.courseMarche ? allureGalloway(c) : aZ(c, 'Z2')) + p / aFin : null,
      parts: p ? { Z2: d - p, [zFin]: p } : { Z2: d },
      etapes: [{ t: 'footing', duree: d - p, allure: c.courseMarche ? plageA(c, 'galSL') : plageZ(c, 'Z2') }, ...(p ? [{ t: 'effort', duree: p, allure: aFin && [aFin * 0.985, aFin * 1.015] }] : [])],
      texte: `${fD(d)} ${c.courseMarche ? al(c, 'galSL') : `en ${zt(c, 'Z2')}`}${courseMarche(c)}${spe ? `, dont ${fD(p)} en fin de sortie ${al(c, 'obj')}`
        : fin ? `, dont ${fD(p)} en fin de sortie à allure marathon${aFin ? ` (${fA(aFin)})` : ''} (fin rapide)` : ''}.` };
  }
  // Footing en Z2, ou de récupération en Z1 (plan selon la répartition)
  const footing = (d, c, z = 'Z2') => ({ nom: z === 'Z1' ? 'Footing de récupération' : 'Footing', zone: z, duree: d, travail: 0, km: c.profil ? d / aZ(c, z) : null,
    parts: { [z]: d }, etapes: [{ t: 'footing', duree: d, allure: plageZ(c, z) }], texte: `${fD(d)} en ${zt(c, z)}${courseMarche(c)}.` });
  /** LPN, lendemain de qualité : footing de d min qui commence par z1 min en Z1 (la Z1 restante de la semaine), le reste en Z2 */
  const footingZ1 = (d, z1, c) => (z1 >= d - 2.5 ? footing(d, c, 'Z1') : { nom: 'Footing', zone: 'Z2', duree: d, travail: 0,
    km: c.profil ? z1 / aZ(c, 'Z1') + (d - z1) / aZ(c, 'Z2') : null, parts: { Z1: z1, Z2: d - z1 },
    etapes: [{ t: 'footing', duree: z1, allure: plageZ(c, 'Z1') }, { t: 'footing', duree: d - z1, allure: plageZ(c, 'Z2') }],
    texte: `${fD(z1)} en ${zt(c, 'Z1')} (récupération), puis ${fD(d - z1)} en ${zt(c, 'Z2')}.` });
  // Séances du club (cases à cocher de l'étape 2), chaque semaine si compatibles avec le plan (voir clubsSemaine dans construire) : lundi, « séance de PPG dont footing », comptée comme 40 min
  // en Z2 pour la charge ; jeudi, « séance piste », de charge moyenne équivalente à 1 h en Z2 + 15 min à VMA (compte comme une séance de qualité).
  // Elles comptent dans le volume, occupent un jour de course et, par le jeudi, une séance de qualité.
  const CLUB = [{ id: 'club1', jour: 'lundi', dow: 1, duree: 40, parts: { Z2: 40 }, travail: 0 },
    { id: 'club2', jour: 'jeudi', dow: 4, duree: 75, parts: { Z2: 60, Z5: 15 }, travail: 15 }];
  const clubsActifs = () => CLUB.filter(k => state[k.id]);
  const seanceClub = (k, c) => (k.id === 'club1'
    ? { nom: 'Séance de PPG dont footing (club, lundi)', zone: 'Z2', duree: 40, travail: 0, km: c.profil ? 40 / aZ(c, 'Z2') : null, parts: { Z2: 40 }, club: true,
      etapes: [{ t: 'footing', duree: 40, allure: plageZ(c, 'Z2') }],
      texte: 'Séance de PPG (préparation physique générale) dont footing, au club : comptée comme 40 min en Z2 pour la charge (distance estimée à l\'allure moyenne de Z2).' }
    : { nom: 'Séance piste (club, jeudi)', zone: 'Z5', duree: 75, travail: 15, qualite: true, effort: 15, km: c.profil ? 60 / aZ(c, 'Z2') + 15 / (1000 / c.profil.V) : null, parts: { Z2: 60, Z5: 15 }, club: true,
      etapes: [{ t: 'footing', duree: 60, allure: plageZ(c, 'Z2') }, { t: 'effort', duree: 15, allure: c.profil && [1000 / c.profil.V * 0.99, 1000 / c.profil.V * 1.01], nom: 'Z5, équivalent à 15 min à VMA' }],
      texte: `Séance piste au club, de charge moyenne équivalente à ${fD(60)} en ${zt(c, 'Z2')} plus 15 min à VMA${c.profil ? ` (${fA(1000 / c.profil.V)})` : ''} (distance estimée sur cette base).` });
  // Échauffement avant une compétition, en Z2, selon la zone de la course : Z6 30 min, Z5 20 min, Z4 15 min, Z3 10 min, aucun en Z1 et Z2 (course en footing
  // comprise). Il s'ajoute au volume de la semaine ; aucune récupération (retour au calme, footing de récupération) n'est prévue le jour d'une compétition.
  const ECHAUFFEMENT_COURSE = { Z3: 10, Z4: 15, Z5: 20, Z6: 30 };
  const echCourse = (c) => ECHAUFFEMENT_COURSE[c.zoneObj] || 0;
  const course = (c) => {
    const ech = echCourse(c);
    return { nom: 'Course', zone: c.zoneObj, duree: c.tObj + ech, travail: 0, km: c.dist / 1000 + (ech && c.profil ? ech / aZ(c, 'Z2') : 0),
      parts: ech ? ajoute({ Z2: ech }, { [c.zoneObj]: c.tObj }) : { [c.zoneObj]: c.tObj },
      etapes: [...(ech ? [{ t: 'echauffement', duree: ech, allure: plageZ(c, 'Z2') }] : []), { t: 'effort', duree: c.tObj, allure: c.profil && [c.allureObj * 0.99, c.allureObj * 1.01], nom: c.label }],
      texte: `${ech ? `Échauffement ${ech} min en ${zt(c, 'Z2')}, puis ` : ''}${c.label}${c.profil ? ` : objectif ≈ ${E.formatTemps(c.tObj)}, ${al(c, 'obj')}` : ''}.${ech ? '' : ' Échauffement léger avant le départ.'} Pas de récupération ce jour-là.` };
  };

  /* ---------- Méthodes ---------- */

  // phases : f = fin de la phase en part des semaines avant l'affûtage ; q = séances de qualité par ordre de priorité ; sl = sortie longue.
  // score : adéquation à l'objectif (0 à 3) ; ie : poids du biais d'indice d'endurance (+ : favorisée par une bonne endurance)
  // fin d'une phase, `avant` semaines avant la course dans un plan de `total` semaines pour la fin de préparation (réduit proportionnellement si le plan est plus court, base : 40 % au moins)
  const finPhase = (avant, total = 14) => { const W = horizon().W; return 1 - avant * Math.min(1, 0.6 * W / total) / W; };
  const finLydiard = finPhase;
  const DOCTRINES = [
    { id: 'daniels', nom: 'Daniels', titre: 'Jack Daniels : quatre phases, allures E, M, T, I, R',
      source: "Daniels J., Daniels' Running Formula, Human Kinetics (chap. 4 : plafonds par séance ; chap. 10 : les quatre phases ; chap. 14 : plans de cross).",
      resume: "Chaque séance a un but précis et une allure tirée du niveau du coureur : endurance (E), marathon (M), seuil (T), intervalles VO2max (I), répétitions de vitesse (R). Quatre phases : fondation, qualité initiale, transition (la plus dure), qualité finale.",
      principes: ["Un seul nouveau type d'effort par phase : base facile (avec lignes droites), puis répétitions R (vitesse, sans fatigue aérobie), puis intervalles I, puis seuil T en fin de saison. Les phases précédentes sont entretenues par une séance.",
        'Deux séances de qualité par semaine, plus une sortie longue facile.', "Seuil (T) : répétitions de 5 à 15 min, environ 1 min de récupération pour 5 à 6 min d'effort ; au plus 10 % du volume hebdomadaire par séance.",
        "Intervalles (I) : 3 à 5 min, récupération égale ou un peu plus courte que l'effort ; au plus 8 % du volume hebdomadaire (10 km au plus). Deux séances I par semaine pour les distances longues, une seule pour les courtes (qui gardent une séance R).", "Répétitions (R) : 2 min au plus par répétition, récupération de 2 à 3 fois la durée (et non la distance) ; au plus 5 % du volume hebdomadaire (8 km au plus).",
        'Allure marathon (M) : au plus 20 % du volume hebdomadaire (30 % sous 64 km par semaine) ; sortie longue : 25 % du volume (30 % sous 64 km par semaine), 2 h 30 au plus.',
        'Plafonds appliqués ici au temps (et non au kilométrage) : une séance trop longue pour votre volume est raccourcie.'],
      maxQ: 2, plafonds: { SEUIL: 0.1, VMA_LONG: 0.08, VITESSE: 0.05 }, score: { '5k': 2, '10k': 2.5, semi: 2.5, marathon: 2 },
      difficulte: [3, 'allures précises à respecter, phase de transition exigeante'],
      phases: [{ nom: 'Fondation', f: 0.2, q: ['EF_LD', 'EF_LD'], sl: 'SL' }, { nom: 'Qualité initiale (R)', f: 0.45, q: ['VITESSE', 'VITESSE'], sl: 'SL' },
        { nom: 'Transition (I)', f: 0.75, q: c => (c.dist >= 10000 ? ['VMA_LONG', 'VMA_LONG'] : ['VMA_LONG', 'VITESSE']), sl: 'SL' }, { nom: 'Qualité finale (T)', f: 1, q: ['SEUIL', 'SPE'], sl: 'SL_SPE' }] },
    { id: 'lydiard', nom: 'Lydiard', titre: "Arthur Lydiard : la pyramide, du foncier à l'affûtage",
      source: 'Lydiard A., Gilmour G., Running to the Top (3e éd. 2013 : chap. 7 et 8, construire un programme).',
      resume: "Périodisation en pyramide : une longue base aérobie (au moins trois mois, en partie à allure soutenue sans devenir anaérobie), puis environ 4 semaines de côtes (bondissements), environ 4 semaines d'anaérobie (répétitions longues, 3 jours par semaine), et 6 semaines de coordination avec courses de mise en jambes.",
      principes: ["Base : au moins 3 mois, 4 à 5 de préférence, de course aérobie « rapide si possible, juste sous le point où l'effort devient anaérobie » : le plus de volume possible, sortie longue, footings, fartlek relâché, lignes droites ; un peu de côtes et de bonds en complément.",
        'Côtes : environ 4 semaines de transition, circuits (bondir, ressorts, course en côte, descente rapide), avec quelques lignes droites en bas.',
        "Anaérobie : environ 4 semaines, trois jours par semaine de gros effort. Lydiard n'utilise pas le fractionné chiffré : répétitions d'au moins 600 m, ou 3, 5 ou 10 km à fond, sans compter, jusqu'à ce que le corps dise stop (ici, séries cadrées par la règle des 2/3 du temps limite) ; travail de vitesse de jambes en parallèle.",
        "Coordination : environ 6 semaines, répétitions courtes à l'allure de course, fartlek facile, une course de mise en jambes par semaine (plus courte ou plus longue que l'objectif) ; une sortie longue facile de 1 h à 1 h 30 ; une journée de récupération après chaque jour dur. Les 14 dernières semaines suivent ce découpage (réduit si le plan est plus court).",
        'Après un semi ou un marathon : environ 2 semaines sans rien de rapide.'],
      maxQ: 3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [2, "longue base aérobie, intensité tardive et progressive ; demande surtout du temps"],
      // les 14 dernières semaines suivent le livre (côtes 4, anaérobie 4, coordination 6), réduites proportionnellement si le plan dure moins de 23 semaines (base : 40 % au moins)
      phases: [{ nom: 'Base aérobie', f: () => finLydiard(14), q: ['SOUTENU', 'FARTLEK', 'EF_LD'], sl: 'SL' }, { nom: 'Côtes', f: () => finLydiard(10), q: ['LYD_CIRCUIT', 'LYD_CIRCUIT', 'LYD_CIRCUIT'], sl: 'SL' },
        { nom: 'Anaérobie', f: () => finLydiard(6), q: ['VMA_LONG', 'LYD_TT', 'VITESSE'], sl: 'SL' }, { nom: 'Coordination', f: 1, q: ['SPE', 'VITESSE', 'LYD_TT'], sl: 'SL' }] },
    { id: 'seiler', nom: 'Seiler', titre: 'Stephen Seiler : entraînement polarisé (80/20)',
      source: "Seiler S., Tønnessen E., Intervals, Thresholds, and Long Slow Distance: the Role of Intensity and Duration in Endurance Training, Sportscience 13, 32 – 53 (2009, lu) ; Seiler S., What is best practice for training intensity and duration distribution in endurance athletes?, Int J Sports Physiol Perform 2010 ; Seiler S. et al., Scand J Med Sci Sports 2013 (intervalles 4 × 4, 4 × 8 et 4 × 16 min, 36 cyclistes de loisir) ; Aubry A., « S'entraîner lentement (parfois)… pour être plus performant », lepape-info (synthèse d'études d'élites, lue). Seiler ne publie pas de plan : le plan applique ses principes.",
      resume: "Environ 80 % des séances en faible intensité, le reste en haute intensité, très peu en zone intermédiaire. Les intervalles longs (4 à 8 min, 2 min de récupération) sont la séance type.",
      principes: ['Facile vraiment facile (Z1-Z2), dur vraiment dur : éviter la « zone grise ».', 'Deux séances intenses par semaine suffisent, même à gros volume (chez les élites, 1 à 3 séances par semaine à ou au-dessus du seuil, parmi 10 à 12 séances).',
        "Observé chez des élites : 75 à 80 % du temps en zone 1, environ 5 % en zone 2, 15 à 20 % en zone 3 (modèle à trois zones, bornées par les seuils ventilatoires). Un essai chez des coureurs de loisir visait 77 / 3 / 20 % mais a donné en pratique 65 / 21 / 14 % : sans contrôle, le facile devient trop soutenu (« trou noir de l'intensité »).",
        "Intervalles : 1 à 8 min à 90 – 100 % de VO2max, 1 à 5 min de récupération ; la meilleure réponse physiologique avec 4 min d'effort pour 2 min de récupération ; 4 × 4 min à 95 % de VO2max est une alternative proposée.",
        "Séance type : 4 × 8 min à effort élevé et régulier, 2 min de récupération (meilleure progression que 4 × 4 ou 4 × 16 min dans son étude sur des cyclistes de loisir entraînés).",
        "La répartition 80/20 se compte en séances plutôt qu'en temps.",
        "Répartitions observées chez des experts (synthèse d'Aubry, INSEP) : 71 à 85 % du temps en zone 1, au plus 15 à 25 % en zones 2 et 3 ; à volume égal, 81 / 11 / 8 % progresse mieux que 67 / 25 / 8 % (Lucia, coureurs nationaux). Ce sont des élites : ces pourcentages ne se transposent pas tels quels à d'autres niveaux."],
      maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2, marathon: 2 },
      difficulte: [1, 'deux séances dures au plus, tout le reste vraiment facile : simple à suivre'],
      phases: [{ nom: 'Développement', f: 0.7, q: ['INTERVALLES_LONGS', 'VMA_LONG'], sl: 'SL' }, { nom: 'Spécifique', f: 1, q: ['INTERVALLES_LONGS', 'SPE'], sl: 'SL' }] },
    { id: 'pfitzinger', nom: 'Pfitzinger', titre: 'Pete Pfitzinger : mésocycles et seuil lactique',
      source: 'Pfitzinger P., Douglas S., Advanced Marathoning, Human Kinetics (4e éd. 2025 : chap. 1 à 3 et plans de 18 semaines jusqu\'à 55 miles par semaine) ; Faster Road Racing (2015, non lu).',
      resume: "Quatre blocs successifs : endurance (le plus long), seuil lactique et endurance, préparation à la course (avec courses de mise en jambes), affûtage. Le tempo au seuil lactique et les sorties longues (avec allure marathon) sont le cœur ; le VO2max arrive en fin de préparation et remplace le seuil dans le dernier bloc.",
      principes: ['Semaine type : quatre jours de récupération, une séance au seuil lactique, une sortie longue et une sortie moyenne-longue ; au plus trois séances difficiles par semaine, une semaine de récupération à 80 % du volume toutes les 3 à 5 semaines.',
        "Tempo continu de 20 à 40 min (35 à 45 min dans quelques séances) à l'allure que l'on tient environ 1 h (≈ 15 km pour un marathonien en 3 h, 10 à 15 s/mile plus lent que le 10 km) ; pour le marathon, le tempo continu est préféré aux fractions ; pas de double seuil.",
        'Sorties longues à 10 – 20 % sous l\'allure marathon, sans dépasser 21 – 22 miles (une de 24 pour les expérimentés) ; une sortie longue tous les trois semaines au moins sur jambes fraîches.',
        "VO2max : fractions de 2 à 5 min à allure 5 km (données en distance par Pfitzinger, 800 à 1600 m, 600 m les semaines de course : ici en durée, pour que l'effort soit le même à tous les niveaux), récupération de 50 à 90 % du temps d'effort.",
        'Sorties longues avec une partie à allure marathon en préparation spécifique.', 'Affûtage de 3 semaines pour le marathon.'],
      maxQ: 2, moyenneLongue: true, affutage3: true, score: { '5k': 1, '10k': 1.5, semi: 3, marathon: 3 },
      difficulte: [4, 'tempos longs et sorties longues avec allure marathon, pensé pour de gros volumes'],
      phases: [{ nom: 'Endurance', f: 0.3, q: ['TEMPO', 'EF_LD'], sl: 'SL' }, { nom: 'Seuil et endurance', f: 0.65, q: ['TEMPO', 'SEUIL'], sl: 'SL_SPE' },
        { nom: 'Préparation à la course', f: 1, q: c => ['VMA_PFITZ', c.dist > 30000 ? 'EF_LD' : 'TEMPO'], sl: 'SL_SPE' }] },
    { id: 'hanson', nom: 'Hanson', titre: 'Méthode Hanson : fatigue cumulée',
      source: 'Humphrey L., Hanson K., Hanson K., Hansons Marathon Method, VeloPress (2e éd. 2016 : chap. 3 sur les sorties longues, la vitesse, la force et le tempo ; chap. 4 sur les programmes).',
      resume: "Trois séances clés par semaine (vitesse puis force, tempo à allure objectif, sortie longue) et des footings presque tous les jours : on aborde les séances avec une fatigue accumulée, qui simule la fin de course. La sortie longue est plafonnée (environ 26 km).",
      principes: ['Vitesse (première moitié) : répétitions à allure 5 – 10 km.', "Force (seconde moitié) : répétitions longues un peu plus vite que l'allure objectif, récupération courte.",
        'Tempo : longue portion continue à allure objectif, allongée au fil des semaines.', 'Six jours de course par semaine, peu ou pas d\'entraînement croisé ; sortie longue de 16 miles (≈ 26 km) au plus.',
        "Force : allure marathon − 10 s par mile, par exemple 6 × 1 mile à 2 × 3 miles avec 400 à 800 m de trot (moins de la moitié de l'effort) ; vitesse : environ 3 miles au total à allure 5 – 10 km, juste sous la VO2max (répétitions de 2 à 8 min, de 400 m à 1 600 m selon la semaine). Ne pas courir plus vite que prévu.",
        "Tempo = allure marathon, pas plus vite : de 4 à 5 miles au début jusqu'à 10 miles (≈ 90 min) en fin de préparation ; sortie longue de 16 miles au plus, au plus 25 à 30 % du volume de la semaine et pas de jour de repos avant elle (fatigue cumulée volontaire)."],
      maxQ: 2, slKm: 26, score: { '5k': 1, '10k': 1.5, semi: 2.5, marathon: 3 },
      difficulte: [4, 'six jours de course par semaine et séances clés enchaînées sur une fatigue accumulée'],
      phases: [{ nom: 'Vitesse', f: 0.45, q: ['VMA_HANSON', 'TEMPO_OBJ'], sl: 'SL' }, { nom: 'Force', f: 1, q: ['FORCE', 'TEMPO_OBJ'], sl: 'SL' }] },
    { id: 'canova', nom: 'Canova', titre: "Renato Canova : l'entonnoir de la spécificité",
      source: "Canova R., Gigliotti L., Lenzi G., La via italiana alla maratona, Atleticastudi 4-5-6/1998 (FIDAL, scan lu : tableaux 2 à 6) ; Canova R., Moderne strategie per l'allenamento della maratona, Atleticastudi 2/1996 (FIDAL, lu) ; Canova R., messages sur le forum LetsRun (fils 2959804, 4213844, 3958030, 1363335, lus) et leur synthèse par J. Davis, « Something New in Training: The Methods of Renato Canova » (2011) ; Arcelli E., Canova R., Marathon Training: A Scientific Approach (1999, non lu : recension de J. Davis, runningwritings.com, 2023) ; progressifs selon Canova : Fast Running.",
      resume: "Du général au spécifique : un travail varié au début (côtes, fartlek, seuil), puis un resserrement progressif (« entonnoir ») vers des séances longues proches de l'allure de course (95 à 105 %).",
      principes: ['Période générale : côtes, fartlek, allures variées ; progressifs moyens (60 à 90 min de 85 à 100 % de la vitesse marathon, jamais plus vite).',
        'Période fondamentale : seuil, allure de course sur portions courtes ; progressifs moyen-rapides (45 à 60 min de 95 à 105 % de la vitesse marathon).',
        "Période spécifique : beaucoup de volume à 95 – 105 % de l'allure de course, sorties longues rapides à 90 – 95 % ; progressifs rapides (20 à 40 min de 102 à 108 % de la vitesse marathon).",
        'Progressifs réservés ici au semi et au marathon (leurs % sont ceux de la vitesse marathon). Méthode exigeante, pensée pour des coureurs expérimentés.',
        "5 et 10 km, d'après un message de Canova (exemple d'un coureur de 15:00 au 5000 m) : 110 % de la vitesse de course, fractions courtes, ≈ 3 km au total, 1 min 30 de récupération ; 105 %, ≈ la distance de course au total ; 100 %, fractions jusqu'au 2000 m, 8 à 10 km, 3 min ; 95 %, fractions longues (3 × 3000 m) ou continu ; 90 %, continu de 10 à 20 km. Il compte 105 % comme l'allure moins 5 %.",
        "Spécialement pour le marathon, ses « blocs spéciaux » (deux séances longues le même jour, toutes les 3 à 4 semaines en période spécifique : le matin 85 – 90 % de la vitesse marathon puis 10 à 15 km à ≈ 98 %, 100 % ou 105 – 110 % selon la variante ; un coureur à 80 miles par semaine fait environ 60 % de son travail à l'allure marathon, un coureur à 150 miles environ 40 %) sont réservés aux coureurs de très haut niveau et ne sont pas repris ici (source secondaire : Fast Running).",
        'Ses volumes sont ceux de coureurs à très gros kilométrage : ici, la qualité de la semaine est plafonnée à 30 % du temps.',
        "Marathon, d'après la recension du livre : périodes d'introduction (6 à 8 semaines), fondamentale (8 à 10, volume maximal), spéciale (6 à 8, absente du livre) et spécifique (6 à 8) ; sorties longues spécifiques de 30 à 35 km à 96 – 98 % de l'allure marathon, 18 à 25 km continus à 100 – 103 % en période générale ; fractions extensives de 2 à 7 km à 100 – 102 % (1 km de récupération à 85 – 95 %), intensives de 500 à 1 000 m à 103 % (récupération à 97 %). Élites : 230 à 250 km par semaine.",
        "École italienne (Canova, Gigliotti, Lenzi, 1998) : le marathon est une spécialité d'extension (le volume d'abord, à une intensité compatible avec sa puissance aérobie). Le travail spécial se fait entre 97 et 103 % de l'allure de course, sur une durée de la moitié aux deux tiers de la course ; en dessous de 97 %, au-dessus de 103 % ou sur moins de la moitié de la durée, c'est du travail général ou fondamental de soutien ; les très longues sorties (au-delà de la distance de course) soutiennent le travail spécial.",
      "Table des allures de la méthode (en % de l'allure marathon) : > 110 % intervalles courts (10 × 500 m, 1 min 30) ; 110 – 108 % résistance spéciale intensive de 10 à 12 km (1 000 à 3 000 m) ; 108 – 105 % intensive-extensive de 12 à 16 km (2 000 à 5 000 m) ou course rapide progressive de 20 à 40 min ; 105 – 103 % extensive de 15 à 21 km (3 000 à 7 000 m) ou course rapide de 20 à 40 min ; allure marathon : 18 à 25 km ; 100 – 97 % course moyenne-rapide progressive (45 min à 1 h 20) et long spécial intensif de 28 à 30 km ; 97 – 95 % long spécial extensif de 32 à 36 km ; 95 – 92 % long de durée de 36 à 45 km ; 92 – 90 % très long de 40 à 52 km ; 90 – 85 % long du marathonien (2 à 3 h) ; 85 – 80 % fond lent de soutien ; moins de 80 % régénération.",
      "Résistance spéciale (période spéciale, environ 6 semaines) : extensive, de 19 à 30 km au total, répétitions de 2 à 7 km à 100 – 102 % avec 1 km de récupération à 85 – 95 % (4 × 5 000 m, 3 × 7 000 m) ; intensive, de 15 à 23 km, répétitions de 0,5 à 1 km à 103 % et plus, récupération de 0,5 à 1 km à 97 % ; long spécial de 30 à 35 km à 98 – 100 % ; bloc spécial de deux séances le même jour (10 km à 85 % puis 10 à 15 km à l'allure marathon, le matin et l'après-midi) ; une longue sortie à 92 – 94 % au-delà de la distance de course au moins une fois dans le mois précédent. Puissance aérobie : fond rapide de 20 à 40 min à 104 – 107 %, variations longues (5 000 / 7 000 m) à 103 – 107 %, moyennes (3 000 / 5 000 m) à 105 – 108 %, brèves (1 000 / 3 000 m) à 106 – 110 %, course en côte de 6 à 10 km à 3 – 6 %.",
      "Périodes (1998) : générale 6 à 8 semaines (efficacité musculaire, course continue lente, moyenne et progressive de 30 min à 1 h 30), fondamentale 8 à 10 semaines (puissance aérobie au seuil, volume maximal), spéciale 6 à 8 semaines (résistance spécifique à l'allure marathon, volume en baisse). Fondamental pour le marathon : 1 h 45 à 2 h 30 à 1,1 – 1,2 fois plus lent que l'allure de course. Le plan des 3 derniers mois contient peu de longues sorties lentes, mais des 25 à 40 km rapides (à 3 min 30 par km pour un 2 h 05 : « le meilleur moyen de perdre son temps »).",
      "Modulation : pas de semaine symétrique ; chaque allure est un type d'entraînement distinct ; plus on approche de la course, plus la récupération entre séances doit croître (deux à trois jours de régénération entre séances spécifiques) ; on n'abandonne pas les séances précédentes, on en ajoute (« s'entraîner, c'est ajouter »). Coureur « résistant » (≈ 88 % de fibres lentes, seuil aérobie proche du seuil anaérobie, lactate ≈ 2 mmol/L) : travailler la puissance (VO2max) ; coureur « rapide » (≈ 65 % de fibres lentes, lactate ≈ 3 mmol/L) : éviter les gros travaux lactiques, réduire la consommation.",
      "Adaptation pour amateurs (conseils du recenseur, pas de Canova) : 60 à 80 % du volume de séance prévu, commencer par les séances à 90 % et 110 % de l'allure marathon puis ajouter 95 %, 100 – 103 % et 105 % quand le kilométrage le permet, plusieurs jours faciles après les grosses séances, de courts blocs de jours chargés plutôt qu'un gros kilométrage."],
      maxQ: 3, partQualite: 0.3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [5, "gros volume proche de l'allure de course, conçu pour des coureurs de haut niveau"],
      phases: [{ nom: 'Générale', f: 0.3, q: c => (c.dist > 20000 ? ['CAN_PROG@1', 'COTES', 'FARTLEK'] : ['FARTLEK', 'COTES', 'CAN@90']), sl: 'SL' },
        { nom: 'Fondamentale', f: 0.6, q: c => (c.dist > 20000 ? ['SEUIL', 'CAN_PROG@2', 'SPE'] : ['CAN@95', 'CAN@110', 'CAN@90']), sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: c => (c.dist > 20000 ? ['SPE', 'SPE_EXT', 'CAN_PROG@3'] : ['CAN@100', 'CAN@105', 'CAN@95']), sl: 'SL_SPE' }] },
    { id: 'billat', nom: 'Billat', titre: 'Véronique Billat : intervalles à VMA',
      source: 'Billat V., La physiologie de l\'entraînement et de la performance sportive, De Boeck Supérieur (2021 : chap. 6, table de prescription par % de la vitesse aérobie maximale) ; Billat L. V., Interval training for performance: a scientific and empirical practice, parties I et II, Sports Med 2001 (lu) ; Billat V. et al., Eur J Appl Physiol 2000 (30-30 et ½ Tlim) et Int J Sports Med 22(3) 2001 (<a href="https://doi.org/10.1055/s-2001-16389" target="_blank" rel="noopener">15-15 autour de la vitesse critique : 14 min à VO2max chez des coureurs de plus de 50 ans</a>, séance 15-15 à amplitude réduite) ; Billat V. et al., Int J Sports Med 2001 (entraînement de huit semaines de marathoniens d\'élite) ; publications.billatraining.com (165 articles en libre accès, dont ces textes).',
      resume: "Le temps passé à VMA est le levier principal du 5 et du 10 km. Deux formats : le 30-30 (30 s à VMA, 30 s à 50 % de VMA), qui accumule beaucoup de temps à VMA, et des fractions à VMA de la moitié du temps limite (≈ 3 min), récupération de même durée.",
      principes: ['30-30 : 30 s à VMA, 30 s de récupération active à 50 % de VMA ; permet de rester une dizaine de minutes à VO2max.',
        'Fractions longues à VMA : la moitié du temps limite (≈ 3 min ici, la VMA étant tenue environ 6 min dans le modèle), récupération de même durée ; dans les études de son équipe, elles gardent plus longtemps au-dessus de 90 % de VO2max que le 30-30.',
        "Table de prescription du livre (intensité en % de VMA, répétition en part du temps limite à cette intensité) : 105 – 110 % : 25 à 50 % du temps limite (45 s à 1 min 30), récupération double de l'effort ; 95 – 100 % : 33 à 50 % (2 à 3 min), récupération égale ; 85 – 90 % : 50 à 75 % du temps limite (7 à 12 min), récupération moitié ; seuil (≈ 1 h) : 25 à 75 % (15 à 45 min), récupération de 5 min. Ici la règle des 2/3 du temps limite plafonne chaque répétition.",
        'Seuil en grandes fractions en complément, une fois par semaine.', 'Allure de course en fin de préparation.',
        "Non repris : l'entraînement en accélération (pyramides de vitesse montantes et descendantes, 2 séances de 20 à 30 min par semaine, sans freiner brutalement en récupération), décrit sans prescription chiffrée.",
        "Semaine type de Billat (Med Sci Sports Exerc 1999, 6 séances, ≈ 85 km) : lundi 1 h facile à 60 % de VMA ; mardi 5 × 50 % du temps limite à VMA (1 000 m en 3 min) avec 3 min de récupération à 50 % de VMA ; mercredi 45 min à 70 % ; jeudi 1 h à 70 % ; vendredi 2 × 20 min au seuil de lactate (85 % de VMA) avec 5 min à 60 % ; samedi repos ; dimanche 1 h à 70 %. Une séance à VMA par semaine suffit : trois séances par semaine pendant quatre semaines n'ont rien apporté de plus et ont élevé la noradrénaline (marqueur de surentraînement) ; une seule fait monter la VMA de 20,5 à 21,1 km/h.",
        "Séance au seuil de lactate stable (Billat et al., Pflügers Arch 2004, vétérans, six semaines) : deux séances par semaine à la place des deux plus courts footings, la première 3 × 10 min avec 5 min à 70 %, la seconde 2 × 15 min ; on ajoute 2 min par répétition (soit 6 min de travail au total) chaque semaine, jusqu'à 3 × 20 min et 2 × 30 min ; la durée tenue au seuil passe de 44 à 63 min. Pour le marathon, ne pas partir plus vite que 95 % de cette vitesse sur la première moitié (revue de 2005).",
        "Kényans d'élite (Med Sci Sports Exerc 2003) : deux écoles. Basse vitesse : 15 % du volume en tempo au seuil (45 à 70 min) et 6 × 1 mile entre allure 3 000 m et 10 000 m. Haute vitesse (≈ 160 km par semaine pour les hommes, 130 pour les femmes) : deux séances par semaine, 10 à 20 × 400 – 600 m à VMA (ou 7 × 200 m à 120 %) et 10 × 1 000 m ou 5 × 2 000 m à allure 10 km. Marathoniens d'élite (revue de 2005) : deux séances de vitesse par semaine toute l'année (15 × 400 m à allure 3 000 m, 6 × 2 000 m à allure 10 000 m), musculation deux fois par semaine.",
        "Protocole de quatre semaines (Heubert et al., Can J Appl Physiol 2003, deux séances par semaine) : intensités de 90 à 115 % de VMA, répétitions de 25 % du temps limite au début à 75 % à la fin (au moins 60 % pour progresser sur 3 000 m, d'après Smith 1999), temps total de course égal à 1,5 fois le temps limite, récupération égale à la moitié de la répétition (90 – 100 %) ou à sa durée (115 %), à 50 % de VMA. Huit semaines à deux séances par semaine à 93 % de VMA (≈ allure 10 km, répétitions de 25 à 50 % du temps limite à cette allure) et trois footings de récupération à 60 – 70 % de VMA : le temps tenu à cette vitesse augmente (Demarle et al., J Appl Physiol 2001).",
        "Temps limite mesurés chez 14 coureurs de fond d'élite (Billat et al., 1995) : 17 min à 90 % de VMA, 5 min 20 à 100 %, 2 min 56 à 105 % ; vitesse critique ≈ 86 % de VMA (chez des étudiants : 14 min à 90 %, 6 min à 100 %, 2 min à 120 %, 1 min à 140 %). Le modèle de l'appli réglé sur un indice d'endurance de −9,6 donne 17 min à 90 % et 3,6 min à 105 %.",
        "15-15 autour de la vitesse critique (≈ 86 % de VMA ; coureurs de 52 ans habitués aux sorties lentes) : 15 s à 100 % de VMA, 15 s à 70 % (amplitude de 35 %) ou 90 % / 80 % gardent 14 min à VO2max, le double d'une alternance 110 % / 60 % ; lactate plus bas (9 contre 11 mmol/L). Formats de la revue de 2001 : une séance par semaine de 5 répétitions à 50 % du temps limite à VMA avec récupération égale à 50 % de VMA, plus 2 × 20 min au seuil de lactate stable avec 5 min à 60 % de VMA ; ou 60 à 75 % du temps limite, deux fois par semaine : la VMA, la vitesse sur 3 000 m et le temps limite progressent en 4 semaines.",
        "Marathon d'élite (huit semaines avant les sélections, 180 km par semaine pour les hommes, 155 pour les femmes, soit 90 % du volume de la phase précédente) : 11 % (hommes) et 7 % (femmes) de la distance au-dessus de l'allure 10 km, une séance courte par semaine à allure 3 000 m (20 × 400 m avec 100 m de récupération en 45 s, ou 4 – 5 × 1 000 m avec 400 m en 2 min), une à allure 10 000 m (3 – 4 × 2 000 m, 400 m en 2 min), une sortie longue de plus de 1 h 45 tous les 10 jours dont 10 km à allure marathon ; VO2max + 5,4 %.",
        "Preuve récente (étude de 2025 sur 12 coureurs de demi-fond, citée par runningwritings.com) : 24 × 30 s à 100 % de la vitesse à VO2max donnent moins de temps au-dessus de 90 % de VO2max (≈ 201 s) que 4 × 3 min à 95 % (≈ 328 s) : les fractions longues sont plus efficaces que le 30-30 pour ce critère.",
        "Preuves : petits échantillons (8 à 11 coureurs) ; l'avantage des fractions de la moitié du temps limite sur le 30-30 n'est qu'une tendance."],
      maxQ: 2, rotation: true, score: { '5k': 3, '10k': 3, semi: 1.5, marathon: 1.5 },
      difficulte: [4, 'les fractions longues à VMA (≈ 3 min, phase « VMA longue ») sont très éprouvantes ; le 30-30 et le seuil, eux, restent accessibles'],
      phases: [{ nom: 'VMA courte', f: 0.4, q: ['TRENTE', 'BIL_SEUIL', 'BIL_1515', 'BIL_SEUIL', 'BIL_105', 'BIL_SEUIL'], sl: 'SL' }, // rotation : chaque semaine une séance à VMA (3 types qui alternent) et une au seuil { nom: 'VMA longue', f: 0.8, q: ['VMA_TLIM', 'BIL_SEUIL'], sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: ['SPE', 'BIL_88'], sl: 'SL' }] }
  ];
  const SEUIL_NO = { SEUIL_NO_LONG: 'SEUIL_NO_COURT', SEUIL_NO_COURT: 'SEUIL_NO_LONG' }; // séance du soir d'un double seuil
  const SEUIL_PART = 0.2; // méthode norvégienne : travail au seuil de la semaine ≤ 20 % du volume (hypothèse)
  // Note de difficulté des méthodes (1 adaptée aux débutants … 5 coureurs avancés) : appréciation, pas une donnée publiée
  // Difficulté athlétique affichée sur 3 niveaux (débutant, intermédiaire, avancé), d'après la note de 1 à 5 de chaque méthode : 1 – 2, 3, 4 – 5
  const NIVEAUX_METHODE = ['Débutant', 'Intermédiaire', 'Avancé'];
  const niveau3 = (n) => (n <= 2 ? 1 : n === 3 ? 2 : 3);
  // trois ronds de même taille, remplis jusqu'au niveau, colorés selon le niveau (vert, ambre, orangé)
  const ronds = (n) => { const k = niveau3(n); return `<span class="ronds n${k}" role="img" aria-label="Difficulté : ${NIVEAUX_METHODE[k - 1]}">${'<i class="on"></i>'.repeat(k)}${'<i></i>'.repeat(3 - k)}</span>`; };
  DOCTRINES.push({ id: 'norvegien', nom: 'norvégienne', titre: 'Méthode norvégienne : double seuil',
    source: "Casado A., Foster C., Bakken M., Tjelta L. I., Does Lactate-Guided Threshold Interval Training within a High-Volume Low-Intensity Approach Represent the « Next Step » in the Evolution of Distance Running Training?, Int J Environ Res Public Health 2023 (lu : description par Bakken, séance type, semaine type) ; « The Norwegian model of lactate threshold training » (Athletics Coach) ; variante « singles » de sirpoc, résumé LetsRun archivé (sub-threshold) ; Tjelta L. I., Int J Sports Sci Coach 2019 (non lu).",
    resume: "Beaucoup de volume facile et deux journées « double seuil » par semaine : fractions longues le matin, fractions courtes le soir, à une intensité contrôlée juste sous le seuil (idéalement au lactatomètre), plus une séance de côtes courtes et une sortie longue. Sans doublé : variante « singles » (trois séances sous le seuil par semaine).",
    principes: ['Deux jours par semaine à deux séances au seuil : matin, fractions longues (ex. 3 × 2 km, 4 × 10 min) ; soir, fractions courtes (ex. 8 × 1 min un peu au-dessus du seuil, 10 × 400 m juste en dessous) ; récupérations brèves.',
      "Intensité contrôlée, sous le seuil : lactate ≈ 2 à 3 mmol/L (élites) ; sans lactatomètre, effort perçu 6 – 7 sur 10, finir en pouvant en faire plus. Un peu trop vite et le travail au seuil possible tombe de moitié.",
      'Une séance courte et rapide (côtes courtes de 30 à 45 s) en fin de semaine, le reste en footing vraiment facile.',
      "Entretien de Bakken (traduit, runningwritings.com, 2024) : au plus deux jours doubles par semaine ; le matin des fractions longues de 6 à 10 min, plus lentes, à lactate et fréquence cardiaque plus bas ; l'après-midi des fractions courtes (1 min, 45 s / 15 s, 200 m) à lactate plus haut, environ quatre heures plus tard ; 15 à 20 km de travail au seuil les jours doubles (40 km, trop usant), 70 à 80 km de seuil par semaine au pic ; sorties longues d'environ 45 min à 1 h au plus ; musculation légère et explosive toute l'année ; avant une course, séance au seuil 6 – 7 jours avant, 1 000 m à allure un peu plus rapide que le 5 km 4 jours avant, seuil 2 jours avant. Conseil aux amateurs : viser le seuil où les jambes ne fléchissent pas ; c'est le volume, pas l'intensité, qui fatigue.",
      "Modèle décrit par Bakken (observé chez des coureurs de 1 500 à 5 000 m, jamais testé en essai contrôlé, applicabilité au marathon incertaine) : 3 à 4 séances au seuil (lactate de 2 à 4,5 mmol/L, Bakken visait 2,3 – 3,0) et une séance à VO2max par semaine ; 150 à 180 km par semaine, sortie longue de 21 km au plus. Séances : 2 000 à 3 000 m à allure proche du semi, ou 400 à 1 000 m entre allure 5 km et 10 km, 8 à 12 km de travail au total, récupération de 20 s à 1 min 30 ; deux séances au seuil le même jour. En période de compétition : deux séances au seuil de moins, la séance de côtes remplacée par des répétitions à l'allure de course.",
      "Sans doublé, trois séances sous le seuil par semaine (fractions longues, courtes, longues) : voir aussi la méthode Norwegian Singles (sirpoc), qui en détaille le format, les niveaux et l'absence de décharge."],
    maxQ: 3, doubleSeuil: true,
    score: { '5k': 2.5, '10k': 3, semi: 2.5, marathon: 2 },
    difficulte: [4, 'deux journées à double séance au seuil par semaine : intensité modérée mais volume de qualité très élevé ; sans doublé, la variante « singles » est plus accessible'],
    phases: [{ nom: 'Développement', f: 0.75, q: () => (nbDoubles() ? ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'COTES_COURTES'] : ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SEUIL_NO_LONG']), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SPE'], sl: 'SL' }] });
  // Autres méthodes. q d'une phase peut dépendre du contexte (fonction de c)
  DOCTRINES.push({ id: 'cottereau', nom: 'Cottereau', titre: 'Serge Cottereau : courir lentement pour progresser',
    source: "Cottereau S., « Principes de base de l'entraînement » (texte reproduit sur le forum courseapied.net) ; Cottereau S., Jogging International : « Montez en puissance ! », « Marcher en courant… » et « 100 km, vous pouvez le faire » (2016 : séances intenses par distance, marche, plans, affûtage), propos sur la course lente dans « 6 façons d'augmenter son endurance » ; « Courir lentement pour progresser, la méthode Serge Cottereau », Esprit Trail.",
    resume: "S'entraîner régulièrement, souvent, longtemps et surtout très peu intensément : au moins les trois quarts du temps en endurance, au plus un cinquième en résistance douce (≈ allure marathon) et une seule séance de résistance dure (≈ allure 10 km) par semaine. Intensités réglées au cardiofréquencemètre, jamais jusqu'à l'épuisement.",
    principes: ['Endurance (60 – 80 % FCM, surtout 65 – 75 %) : au moins les trois quarts du temps de la semaine.',
      'Résistance douce (80 – 90 % FCM) : au plus un cinquième du temps, jamais deux jours de suite ; pour le marathon, 2 à 3 × 15 min, récupération de 5 à 7 min très lente.',
      "Résistance dure (jusqu'à ≈ 95 % FCM) : une séance par semaine, répétitions de 3 à 4 min, récupération de même durée ; pas de VMA courte pour les coureurs de fond.",
      'Séances de 45 à 75 min ; pour le marathon, une séance par semaine prolongée vers 2 h.',
      "Séance intense (Jogging International, 2016) : la fréquence cardiaque dépasse 80 % de la FCM pendant une partie de la séance. Marathon : 80 – 90 % de la FCM, 2 à 4 × 15 min, 5 à 7 min de récupération à 60 – 75 % ; séance de 1 h 45 à 2 h 15, la plus dure de la semaine. Semi : 80 – 95 %. 10 km : 80 – 97 %, efforts de 3 à 5 min répétés 2, 3 fois ou plus, 2 à 5 min de récupération. 1 500 m : près de 100 %, 3 à 4 × 1 min à 1 min 15, 3 à 4 min de récupération. Une séance intense par semaine pour la plupart des coureurs, plus souvent (tous les 6, 5 ou 4 jours) selon le niveau et la période ; 2 à 3 jours de footing très facile ensuite.",
      "Course lente : la plupart des sorties à environ 80 % de la vitesse que l'on tiendrait sur la même distance (15 km faisables à 5 min/km : 6 min 15 /km). Environ 90 % de l'entraînement à 60 – 75 % de la FCM, au plus 10 % en résistance douce par blocs de 10 à 20 min.",
      "Marche : commencer chaque séance en marchant (200 à 300 m), puis courir ; en sortie longue, environ 2 min de marche toutes les 15 à 20 min ; sur terrain vallonné, marcher les montées. Marathon : arrêt complet d'environ 45 s à chaque ravitaillement (7 – 8 arrêts, environ 5 min au total pour un coureur en 3 h ; 1 min à 1 min 30 pour 3 h 30 ou plus), qui fait gagner du temps ; sans intérêt sous environ 2 h 30.",
      "Affûtage : la dernière longue séance 6 ou 7 jours avant la course, puis 2 ou 3 séances de 25 à 35 min à 55 – 70 % de la FCM.",
      "Progression par paliers de durée puis d'intensité ; à la fin d'une séance, pouvoir en refaire autant. Allures du plan : équivalents approximatifs des zones de fréquence cardiaque."],
    maxQ: 2, footingMax: 75, slSi: c => c.goal === 'marathon',
    slNote: avec => (avec ? 'Sortie longue : une séance par semaine prolongée vers 2 h, comme le conseille Cottereau pour le marathon.'
      : "Pas de sortie longue : Cottereau ne prolonge une séance vers 2 h que pour le marathon ; les autres durent 45 à 75 min."),
    score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 3 },
    difficulte: [1, "surtout de l'endurance très facile, une seule séance dure par semaine, jamais jusqu'à l'épuisement"],
    phases: [{ nom: 'Progression par paliers', f: 1, q: c => (c.dist > 20000 ? ['COT_DOUCE', 'COT_DURE'] : ['COT_DURE', 'COT_DOUCE']), sl: 'SL' }] },
  { id: 'heubi', nom: 'Heubi', titre: 'Bruno Heubi : puissance, endurance, efficience',
    source: 'Heubi B., Courir longtemps : les clés pour réussir (chap. « Les bases de l\'entraînement » : VMA, EMA, durées selon l\'indice d\'endurance ; « Les clés de la réussite pour préparer son défi » : préparations générale et spécifique) ; brunoheubi.com : « La préparation générale », « La préparation spécifique », « La séance de VMA dans mes règles de l\'art ».',
    resume: "La performance repose sur la puissance (VMA), l'endurance et l'efficience. Une préparation générale (VMA courte et moyenne, endurance active à 80 – 85 % de VMA) précède une préparation spécifique de 8 à 10 semaines : VMA entretenue, endurance active chaque semaine et fractions à l'allure de l'objectif, dans la sortie longue pour le marathon.",
    principes: ['Toutes les allures en % de VMA ; footings à 60 – 65 % de VMA.',
      "Endurance active (EMA) à 80 – 85 % de VMA, selon l'indice d'endurance (ici 85 % pour une bonne endurance, 80 % pour une endurance à développer).",
      'VMA courte : fractions de 30 s à 1 min 15 ; volume effort + récupération de 20 à 26 min ; récupération active à ≈ 50 % de VMA ; partir un peu sous l\'allure cible.',
      "Endurance active (EMA) : le livre la situe de 80 à 90 % de VMA, avec une durée de séance donnée par l'indice d'endurance (table tirée de Péronnet : plus l'indice est bas, plus la séance est courte, ex. IE −8 : 45 min à 80 % ou 3 × 9 min à 85 %) ; une ou deux séances par semaine ; VMA : fractions de 30 s à 1 min 15 à 100 – 105 % (récupération égale), 1 min 15 à 4 min à 90 – 95 % (récupération moitié), 15 à 25 min d'effort au total, échauffement de 20 min.",
      'Préparation générale : au moins 12 semaines, en cycles de 3 semaines séparés par une semaine de relâchement, accent sur la VMA (une séance tous les 4 à 6 jours pour progresser, tous les 10 à 14 jours pour entretenir) ; sortie longue facultative (1 h à 1 h 15 pour le 10 km, ≈ 1 h 30 pour le semi, 1 h 30 à 1 h 45 pour le marathon).',
      'Préparation spécifique (au moins 2 cycles séparés par une semaine allégée, soit 9 à 11 semaines) : VMA (95 – 105 % pour 10 km et semi, 90 – 100 % pour le marathon) une fois par semaine ou tous les 15 jours, EMA chaque semaine, fractions à l\'allure de l\'objectif ; marathon : fractions à allure marathon dans la sortie longue.'],
    maxQ: 3, score: { '5k': 2, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [3, "séances de VMA et d'endurance active soutenues, mais dosées en volume et adaptées à l'indice d'endurance"],
    phases: [{ nom: 'Préparation générale', f: 0.4, q: ['HEU_VMA_COURTE', 'HEU_EMA', 'HEU_VMA_MOY'], sl: 'SL' },
      { nom: 'Préparation spécifique', f: 1, q: c => (c.goal === 'marathon' ? ['HEU_EMA', 'HEU_VMA_LONGUE', 'SPE'] : ['SPE', 'HEU_EMA', 'HEU_VMA_COURTE']), sl: 'SL_SPE' }] },
  { id: 'mcmillan', nom: 'McMillan', titre: 'Greg McMillan : quatre zones et type de coureur',
    source: 'McMillan G., YOU (Only Faster), 2e éd. (plans de 12 semaines, chap. 15 à 21 sur les zones et séances, chap. 24 et 38 sur les adaptations et les modules) ; mcmillanrunning.com : « The 3 Runner Types ».',
    resume: "Quatre zones (Endurance, Stamina, Speed, Sprint) et un plan adapté au type de coureur : Speedster (à l'aise sur le court et rapide), Endurance Monster (à l'aise sur le long) ou Combo. Base, puis stamina, speed et travail spécifique, avec 3 semaines en hausse pour 1 en baisse et 2 à 3 semaines d'affûtage.",
    principes: ['Endurance : 60 à 80 % du volume hebdomadaire, footings de 30 à 90 min, sortie longue de 1 h 15 au moins, une de 1 h 30 à 2 h 30 tous les 7 à 14 jours.',
      'Stamina : steady state 25 à 90 min (on ajoute 10 min à chaque séance jusqu\'à environ 1 h), tempo 15 à 40 min (15 à 25 min pour un Speedster, 30 à 40 pour un Endurance Monster), tempo en fractions de 6 à 15 min (2 à 5 min de trot), cruise intervals de 3 à 8 min (30 s à 2 min de trot).',
      'Plans de 12 semaines, ajouts de modules de 4 semaines avant (volume, séances de base, côtes, puis stamina avant le 5 et le 10 km, vitesse avant le semi et le marathon), 24 semaines au plus ; la semaine 4 de chaque module est une semaine de récupération.',
      "Speed : fractions de 1 à 5 min à allure 1500 m – 5 km, récupération égale ou plus courte ; Sprint : lignes droites de 15 à 20 s.",
      'Type de coureur (ici déduit de votre indice d\'endurance) : un Speedster a besoin de peu de séances de vitesse (6 à 8 sur 3 à 4 semaines), un Endurance Monster de plus de stamina.',
      '3 semaines en hausse pour 1 en baisse ; aucune phase hors endurance au-delà de 8 semaines.'],
    maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2.5, marathon: 2.5 }, lignes: { n: 6, texte: 'lignes droites de 15 à 20 s (Sprint, souples et relâchées)' },
    noteProfil: c => (c.profil ? `Votre type de coureur selon McMillan, d'après votre indice d'endurance (${c.profil.IE.toFixed(1).replace('.', ',')}) : <strong>${typeMcMillan(c)}</strong>.` : ''),
    difficulte: [2, 'plans pour tous les niveaux, adaptés au type de coureur ; intensités modérées en zone Stamina'],
    phases: [{ nom: 'Base', f: 0.2, q: ['MC_STEADY', 'EF_LD'], sl: 'SL' },
      // préparation avant la phase spécifique (livre, chap. 38) : stamina avant les courses de vitesse (5 et 10 km), vitesse avant le semi et le marathon
      { nom: c => (c.dist > 20000 ? 'Speed' : 'Stamina'), f: 0.55, q: c => selonType(c.dist > 20000 ? ['MC_SPEED', 'MC_TEMPO_INT', 'MC_STEADY'] : ['MC_TEMPO', 'MC_CRUISE', 'MC_SPEED'])(c), sl: 'SL' },
      { nom: c => (c.dist > 20000 ? 'Stamina' : 'Speed'), f: 0.8, q: c => selonType(c.dist > 20000 ? ['MC_TEMPO', 'MC_CRUISE', 'MC_SPEED'] : ['MC_SPEED', 'MC_TEMPO_INT', 'MC_STEADY'])(c), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: selonType(['SPE', 'MC_CRUISE', 'MC_SPEED']), sl: 'SL_SPE' }] },
  { id: 'tinman', nom: 'Tinman', titre: 'Tom « Tinman » Schwartz : vitesse critique',
    source: 'Schwartz T., « Critical Velocity Training », présentation de Tinman Endurance Coaching (2016, lue : définition, séances types, progressions) ; Fast Running, « Critical Velocity Training » ; Ward Nicholson, « Running renewal at age 59 », partie 2 (organisation de la semaine, source secondaire).',
    resume: "Beaucoup de course facile toute l'année et des séances « modérément dures » plutôt qu'héroïques : la vitesse critique (CV, allure tenue environ 30 min) développe l'endurance des fibres rapides. Tempo, côtes et lignes droites complètent ; la VO2max est travaillée avec parcimonie.",
    principes: ["Vitesse critique : allure « assez dure » tenue 30 à 35 min (proche de l'allure 10 km, un peu plus lente que le 5 km) ; deux jours durs par semaine, quatre faciles (organisation d'un coureur master, source secondaire) ; séance type de Schwartz : 6 × 1 km à la vitesse critique avec 200 m de trot, puis 6 × 200 m à allure 1 600 m (maximum 8 × 1 km) ; ici en durée, pour que l'effort soit le même à tous les niveaux.",
      "Vitesse critique (CS) selon Davis (runningwritings.com, 2024) : CS− ≈ 95 % de la vitesse de 5 km (CS+ ≈ 100 %), entre l'allure 5 km et 10 km chez un coureur entraîné ; temps de tenue à CS de 17 à 45 min selon les études : s'entraîner autour de CS plutôt que pile dessus ; formats 8 × 1 km à CS− (1 min 30 de trot), 10 × 3 min (1 min 30), 4 × 2 km (3 min) ; à ajouter au seuil et à la VO2max, pas à les remplacer.",
      "Progression d'une semaine à l'autre, au choix : réduire la récupération (90 s, 75 s, 60 s de trot), allonger les répétitions (12 × 400 m, 6 × 800 m, 5 × 1 000 m, soit le même volume) ou accélérer un peu les répétitions. Utilisable toute l'année, à placer dans un footing d'environ une heure ; s'arrêter plus tôt si la fatigue est excessive.",
      'Courir les séances à l\'allure prévue, sans en faire une course ; éviter les séances « de super-héros ».',
      'Volume facile à modéré important toute l\'année ; progression graduelle, sans changement brutal d\'une saison à l\'autre.',
      'VO2max avec parcimonie (moins de volume par séance que la plupart des entraîneurs), d\'autant moins que l\'on court souvent.'],
    maxQ: 2, score: { '5k': 3, '10k': 2.5, semi: 2, marathon: 1.5 }, lignes: { n: 6, texte: 'lignes droites de 20 s, relâchées' },
    difficulte: [2, 'séances modérément dures, jamais jusqu\'à l\'épuisement ; peu de VO2max'],
    phases: [{ nom: 'Développement', f: 0.75, q: ['TIN_CV', 'TEMPO'], sl: 'SL' }, { nom: 'Affinage', f: 1, q: ['TIN_CV', 'SPE'], sl: 'SL' }] },
  { id: 'magness', nom: 'Magness', titre: 'Steve Magness : l\'entonnoir, construire et entretenir',
    source: 'Magness S., The Science of Running (2014 : périodisation en entonnoir, d\'après Hudson 2008) ; « My Training History Manifesto » (stevemagness.org).',
    resume: "Du général au spécifique en entonnoir : on travaille d'abord des allures éloignées de l'objectif, des deux côtés (plus lentes et plus rapides), puis elles se rapprochent de l'allure de course, en entretenant ce qui a été construit. Sprints en côte pour la puissance, au plus trois jours durs par semaine.",
    principes: ['Phase générale : footings, sprints en côte (puissance neuromusculaire) et endurance générale.',
      "Entonnoir : à chaque bloc, une allure plus lente et une plus rapide que l'objectif se rapprochent de l'allure de course (ex. 8 km : marathon et 1500 m, puis semi et 3000 m, puis 10 – 12 km et 5 km, puis allure 8 km).",
      "Volume : il augmente au début, plafonne ensuite et reste à peu près constant jusqu'à l'affûtage, où il ne baisse que légèrement (livre). Côté aérobie, l'entonnoir va du footing à allure marathon vers le seuil, puis les intervalles à allure 10 km et 5 km ; côté vitesse, des sprints de 60 m vers 200 m à allure 800 m, 400 m à allure 1 500 m, 800 m à allure 3 000 m.",
      'Construire puis entretenir : un rappel des allures déjà travaillées toutes les 2 à 3 semaines.',
      'Au plus trois jours durs par semaine, alternance dur / facile ; marathon : travail spécifique sur les 6 à 8 dernières semaines.'],
    maxQ: 3, score: { '5k': 3, '10k': 3, semi: 2.5, marathon: 2 }, lignes: { n: 6, texte: 'accélérations de 15 s à allure de course' },
    difficulte: [4, "beaucoup d'allures différentes à maîtriser, pensé pour des coureurs de compétition"],
    phases: [{ nom: 'Générale', f: 0.2, q: ['MAG_SPRINTS', 'MC_STEADY'], sl: 'SL' },
      { nom: 'Entonnoir 1', f: 0.4, q: c => [...entonnoir(c, 1), 'MAG_SPRINTS'], sl: 'SL' },
      { nom: 'Entonnoir 2', f: 0.6, q: c => [...entonnoir(c, 2), 'MAG_SPRINTS'], sl: 'SL' },
      { nom: 'Entonnoir 3', f: 0.8, q: c => [...entonnoir(c, 3), entonnoir(c, 1)[0]], sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: c => ['SPE', entonnoir(c, 3)[1], entonnoir(c, 3)[0]], sl: 'SL_SPE' }] },
  { id: 'galloway', nom: 'Galloway', titre: 'Jeff Galloway : course-marche et pyramide',
    source: "Galloway J., Marathon: You Can Do It! (2001 : programmes de 26 semaines, règle des deux minutes, marches selon la longueur de la sortie), Half-Marathon: You Can Do It! (2013 : mile magique, prédiction, objectifs réalistes) et Galloway's Book on Running (éd. révisée, 1984 : la pyramide, vitesse, côtes) ; jeffgalloway.com : « Train for a Marathon Finish » (table des ratios course / marche).",
    resume: "Deux apports de Galloway réunis : la course-marche (pauses de marche régulières dès le début de chaque sortie, selon un ratio qui dépend de l'allure) et sa pyramide d'entraînement (large base facile, quelques semaines de côtes, puis une période de vitesse courte). Trois jours de course par semaine, une sortie longue lente qui s'allonge progressivement jusqu'à dépasser la distance de course, un « mile magique » pour recaler les allures.",
    principes: ['Course-marche à toutes les sorties : par exemple 4 min / 30 s à 5:00 /km, 1 min 30 / 30 s à 6:15 /km, 30 s / 30 s à 8:05 /km (table de Galloway par mile). Les coureurs avancés peuvent s\'en passer (livre de 1984), mais le livre de 2013 recommande de la garder.',
      'Pyramide (1984) : base de la moitié de la préparation, 4 à 6 semaines de côtes, puis la vitesse, 8 semaines au plus (12 à 14 pour le marathon), d\'où les trois phases du plan. Avant la vitesse : un an de course et 2 à 3 mois d\'aérobie.',
      'Trois jours de course par semaine (deux sorties courtes et une longue le week-end) ; renforcement ou vélo en option les autres jours, repos la veille de la sortie longue ; jamais plus de 10 % de temps de plus d\'une semaine à l\'autre.',
      "Sorties longues : on part de la plus longue des dernières semaines et on ajoute 1 mile par semaine jusqu'à 10, puis une sortie une semaine sur deux (toutes les trois semaines après 18 miles) jusqu'à dépasser la course d'au moins 20 % (marathon : 28 miles au mieux ; 26 miles au minimum). Ici : une semaine sur deux, jusqu'à 24 km (10 km), 29 km (semi) ou 45 km (marathon).",
      'Allure de la sortie longue : au moins 2 min/mile plus lente que le marathon possible ce jour-là (3 min après une sortie manquée, 3 min sous l\'allure du semi : même résultat avec le mile magique × 1,3 + 2 min). Marche d\'une minute toutes les 3 à 5 min, toutes les 4 min vers 18 – 20 miles, toutes les 3 min dès 23 miles.',
      "Mile magique (4 tours de piste, à bloc pour vous, après échauffement et 4 accélérations-glissées) : allure marathon ≈ temps × 1,3, semi ≈ × 1,2. Une fois par semaine le premier mois, puis toutes les quelques semaines ; on garde les 4 derniers résultats, on écarte le plus lent et on moyenne les trois autres. Objectif réaliste : 3 % de mieux (5 % au mieux), atteint un peu plus d'une fois sur deux. Les courses de 5 km servent aussi de prédiction.",
      "Côtes : 4 à 12 côtes de 150 à 200 yards (10 – 15 % de pente) à l'effort d'un 5 km, descente en marchant. Vitesse : une séance par semaine, deux jours faciles ensuite ; répétitions un peu plus vites que l'allure de course (5 à 7 s par 440 yards) : 440 yards pour le 10 km et moins (jusqu'à 20), un mile pour le semi et le marathon (3 à 13, marche d'au moins 4 min entre elles), au total environ la moitié de la distance de course pour le marathon.",
      "Semaine : mardi au moins 1 min/mile plus lent que l'allure marathon ; en semaine, 1 à 3 miles à l'allure marathon prédite par les courses de 5 km ; exercices de cadence et accélérations-glissées.",
      "Ralentir de 30 s par mile (≈ 20 s /km) tous les 3 °C au-dessus de 15 °C."],
    maxQ: 1, joursMax: 3, footingMax: 45, courseMarche: true, test: { id: 'GAL_MM', tous: 2 }, slUneSur2: true, partQualite: 0.2,
    slKm: c => ({ '5k': 16, '10k': 24, semi: 29, marathon: 45 })[c.goal] ?? null, lignes: { n: 6, texte: 'accélérations-glissées de 15 à 20 s (accélérer puis se laisser glisser, foulée souple)' },
    noteProfil: c => (c.profil ? `Allure de sortie longue ≈ ${fA(allureGalloway(c))}, ratio course / marche conseillé : ${ratioGalloway(allureGalloway(c)).map(fD).join(' / ')}.` : ''),
    score: { '5k': 2, '10k': 2.5, semi: 2.5, marathon: 3 },
    difficulte: [2, "pauses de marche et allures lentes, mais une base longue, puis des côtes et des répétitions à l'allure de course"],
    // base, 4 semaines de côtes, puis vitesse (8 semaines pour le 10 km et moins, 12 pour le semi et le marathon), réduit proportionnellement si le plan est court
    phases: [{ nom: 'Base aérobie', f: c => finPhase(c.dist > 20000 ? 16 : 12, c.dist > 20000 ? 16 : 12), q: ['EF_LD'], sl: 'SL' },
      { nom: 'Jeu de côtes', f: c => finPhase(c.dist > 20000 ? 12 : 8, c.dist > 20000 ? 16 : 12), q: ['COTES'], sl: 'SL' },
      { nom: "Vitesse à l'allure de l'objectif", f: 1, q: c => (c.dist > 20000 ? ['GAL_MILE'] : ['GAL84_440']), sl: 'SL' }] },
  { id: 'fitzgerald', nom: 'Fitzgerald', titre: 'Matt Fitzgerald : 80/20 Running',
    source: "Fitzgerald M., 80/20 Running: Run Stronger and Race Faster by Training Slower (Penguin, 2014 : chap. 6 zones, chap. 7 séances, chap. 8 à 11 plans de 9, 12, 15 et 18 semaines, annexe sur le contrôle de l'intensité).",
    resume: "Environ 80 % du temps d'entraînement en faible intensité (zones 1 – 2) et 20 % en intensité modérée à élevée (zones 3 – 5), compté en temps. Trois jours durs par semaine (deux séances et la sortie longue), séparés par des jours faciles ; une semaine de récupération toutes les trois semaines ; une phase de base puis une phase de développement spécifique.",
    principes: ['Zones en % de la fréquence cardiaque au seuil : 1 faible aérobie (75 – 80 %), 2 aérobie modérée (81 – 89 %), 3 seuil (96 – 100 %), 4 VO2max (102 – 105 %), 5 vitesse (≥ 106 %) ; les écarts entre zones (90 – 95 %, 101 %) sont volontairement évités.',
      'Faible intensité : footings de récupération (zone 1), footings de base (zone 2), sortie longue ; échauffements, retours au calme et récupérations comptent comme du facile.',
      'Séances : tempo (20 à 30 min en zone 3), cruise intervals (par exemple 4 × 6 min, 2 min de trot), intervalles longs (3 à 5 min en zone 4), intervalles courts (60 à 90 s en zone 5), speed play, côtes, sortie longue avec fin rapide.',
      "5 km : plus d'intensité élevée ; marathon : plus d'intensité modérée (zone 3). Une semaine de récupération toutes les trois semaines.",
      "Plans du livre : 9 semaines pour le 5 km (3 de base, 5 de pointe, 1 d'affûtage), 12 pour le 10 km (6, 4, 2), 15 pour le semi (6, 7 ou 8, 1 ou 2), 18 pour le marathon (9, 7, 2). La base est plus proche de 90/10 (on monte le volume), la pointe respecte le 80/20.",
      'Ici, la qualité de la semaine (récupérations comprises) est plafonnée à 25 % du temps ; zone 3 = allure 1 h, zone 4 = allure 3000 – 5000 m, zone 5 = allure 1500 m.'],
    maxQ: 2, partQualite: 0.25, lignes: { n: 6, texte: 'lignes droites de 20 s (trop courtes pour compter dans les 20 %)' },
    score: { '5k': 2.5, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [2, "surtout du facile, deux séances dures par semaine dosées à 20 % du temps"],
    // base : 3 semaines sur 9 (5 km), 6 sur 12 (10 km), 6 sur 15 (semi), 9 sur 18 (marathon), proche de 90/10 ; développement ensuite à 80/20
    phases: [{ nom: 'Base', f: c => ({ '5k': 0.33, '10k': 0.5, semi: 0.4, marathon: 0.5 })[c.goal] ?? 0.5, partQualite: 0.15, q: ['FITZ_FARTLEK', 'COTES', 'FITZ_TEMPO'], sl: 'SL_FIN' },
      { nom: 'Développement', f: 1, q: c => ({ '5k': ['FITZ_LONG_INT', 'FITZ_SHORT_INT'], '10k': ['FITZ_CRUISE', 'FITZ_LONG_INT'], semi: ['FITZ_TEMPO', 'FITZ_CRUISE'], marathon: ['FITZ_CRUISE', 'FITZ_TEMPO'] })[c.goal], sl: c => (c.dist > 20000 ? 'SL_SPE' : 'SL_FIN') }] },
  { id: 'kellogg', nom: 'Kellogg', titre: 'John Kellogg : volume aérobie et « high steady state »',
    source: "Kellogg J., « The Training Wisdom of John Kellogg » (son texte, forum LetsRun), « 4 Principles to Correct Training » (LetsRun, 2000) ; fils LetsRun sur ses séances au seuil ; synthèse « Distance Running Training – John Kellogg ».",
    resume: "Un entraînement surtout aérobie et un volume construit sur des années. Une à trois sorties par semaine accélèrent jusqu'à l'« état stable maximal » (le plus vite possible en restant fluide et en contrôle) ; un jour de lignes droites progressives ; une courte période anaérobie (6 à 8 semaines) avant chacun des deux pics de l'année.",
    principes: ["Sorties « high-end » : partir à l'allure facile et accélérer jusqu'à l'état stable maximal, une prévue par semaine et une ou deux de plus si l'on se sent bien ; jamais plus de deux jours durs de suite.",
      'Vitesse : un jour par semaine, 2 à 3 séries de 5 à 6 lignes droites de 15 à 35 s, de plus en plus vite, 5 à 10 min de footing entre les séries ; toutes les 2 à 3 semaines, 10 à 15 × 1 min à allure 2 miles, 1 min de trot, sans se crisper.',
      'Seuil en fractions (8 à 15 × 3 min, 3 – 4 × 2 miles, 2 × 20 min, récupérations courtes), aussi souvent que possible sans avoir besoin d\'un jour de récupération très lent.',
      'Alterner semaines hautes et basses en montant le volume ; ne jamais augmenter fortement volume et intensité en même temps ; doublés en période de base (1 à 2, puis 3 à 4 par semaine les semaines hautes) ; 50 % sur terrain souple.',
      "Période anaérobie dure de 6 à 8 semaines (1 à 3 séances par semaine) tous les 5 à 6 mois : deux pics par an, environ 20 semaines de préparation chacun.",
      "Sortie longue une semaine sur deux (repère tiré d'une synthèse de ses principes, non trouvé dans ses textes)."],
    maxQ: 3, slUneSur2: true, test: { id: 'KEL_RELAX', tous: 3 }, score: { '5k': 2.5, '10k': 3, semi: 2.5, marathon: 2 },
    slNote: () => 'Sortie longue une semaine sur deux ; les autres semaines, le dernier jour est un footing.',
    difficulte: [4, 'méthode pensée pour un volume élevé, construit sur des années'],
    phases: [{ nom: 'Base', f: 0.35, q: ['KEL_STEADY', 'KEL_LD', 'KEL_STEADY'], sl: 'SL' },
      { nom: 'Base et seuil', f: 0.65, q: ['KEL_STEADY', 'KEL_SEUIL', 'KEL_LD'], sl: 'SL' },
      { nom: 'Anaérobie', f: 1, q: ['VMA_LONG', 'KEL_STEADY', 'VITESSE'], sl: 'SL' }] });
  // Rousset : la vitesse (résistance vitesse, qualitative) est pour ceux qui en manquent (indice d'endurance proche de 0), pas pour une endurance à développer
  const rouVitesse = (c) => (biais(c) >= 1 / 3 ? ['ROU_RVITESSE', 'ROU_RQUALI'] : biais(c) > -1 / 3 ? ['ROU_RQUALI'] : ['ROU_DIAG']);
  DOCTRINES.push({ id: 'singles', nom: 'Norwegian Singles', titre: 'Norwegian Singles (sirpoc) : trois séances sous le seuil',
    source: "Copeland J. (« sirpoc »), Norwegian Singles Method: Subthreshold Running Kept Simple (2025, lu : chap. 2 à 4, détermination des allures, semaines types de 4 h à 9 h, affûtage, marathon) d'après les travaux de Bakken M. et l'entraînement de K. Ingebrigtsen ; fil « Norwegian singles » du forum courseapied.net (septembre 2025 – 2026 : table de niveaux 1 à 8, avis de Bakken).",
    resume: "Variante « single » du modèle norvégien pour des amateurs de 5 à 9 h par semaine : trois séances sous le seuil lactique chaque semaine (courte, moyenne, longue), le reste en endurance très facile, une sortie longue. On maximise la charge répétable sans fatigue excessive et on la maintient : pas de semaine de décharge, pas d'affûtage, pas de VO2max ni d'allure spécifique.",
    principes: ["Trois séances sous le seuil (juste sous le second seuil lactique, haut de la zone 3 / bas de la zone 4) : court 7 – 10 × 3 min à allure 12 – 15 km (récupération 1 min), moyen 4 – 6 × 5 – 6 min à allure 20 km (1 min à 1 min 30), long 2 – 4 × 10 – 12 min à allure 25 – 30 km (1 min 30 à 2 min) ; une séance de chaque type par semaine (rotation si moins de trois séances). Semaine type du livre : long le mardi, moyen le jeudi, court le samedi, sortie longue facile le dimanche, footings faciles les autres jours.",
      "Intensité contrôlée : finir la dernière répétition juste sous la fréquence cardiaque au seuil lactique (effort 6 – 7 sur 10), 10 à 15 battements sous elle à la première répétition ; en cas de doute, ralentir. Footings à moins de 70 % de la fréquence cardiaque maximale. Commencer au bas de la fourchette d'allure ; première répétition 1 à 2 % plus lente ; après une mauvaise nuit, une maladie ou du stress, passer à la fourchette d'allure de la durée de répétition inférieure. Échauffement de 10 min en footing, sans lignes droites, retour au calme de 7 à 10 min ; récupération à l'arrêt, en marchant ou en trottant, au choix. À partir de votre dernier 5 km (table du livre : 5 km en 18:00 → 3:50 /km pour 3 min, 3:56 pour 6 min, 4:03 pour 10 min), plus prudent que les allures de course.",
      "Progression par niveaux (table du forum) : temps sous le seuil par séance de 18 min (niveau 1) à 40 min (niveau 8), semaine de 4 h 40 à 8 h, avec 20 min d'échauffement et 5 min de retour au calme par séance ; la difficulté choisie règle le niveau de départ.",
      "Part sous le seuil : 19 % du temps au niveau 1, 23 % au niveau 2, 25 % au-delà (ici, qualité plafonnée à 25 % du temps de la semaine) ; monter le volume facile en même temps que la qualité, sans augmenter vite.",
      "Pas de semaine de décharge (même charge répétable sur des mois), peu ou pas d'allure spécifique ; test sur une course ou un 5 km en solo toutes les 4 à 8 semaines pour recaler les allures. Progression : une minute de travail sous le seuil en plus pour quatre minutes de footing en plus (≈ 75 / 25 %, 78 / 22 % vers 7 h), au moins un mois à chaque niveau puis 2 – 3 semaines intermédiaires (une répétition de plus, 12 min de footing de plus), jamais en accélérant. Au-delà de 8 h par semaine, passer à des footings en deux séances.",
      "Origine : Kristoffer Ingebrigtsen (≈ 90 à 100 km par semaine, 2021) : mardi 8 × 1 000 m avec 500 m de trot, jeudi 4 – 5 × 2 000 m au seuil avec 1 min de repos, samedi 3 × 3 000 m ou 3 × 10 min, footings de 12 km les autres jours, sortie longue de 12 à 18 km. Son conseil aux amateurs : trotter jusqu'à tenir 8 – 10 km avant d'ajouter des fractions, puis plus de répétitions plutôt que plus vite (source : runningwritings.com, 2025).",
      "Courses : un 5 km compte comme une séance de la semaine, sans affûtage ; pour un 10 km ou un semi, un affûtage court (séance normale le mardi, 6 – 8 × 3 min près de l'allure semi ou marathon le jeudi, footings plus courts de 30 à 40 % la veille et l'avant-veille) et un retour progressif après la course (les affûtages longs coûtent de la forme à ceux qui s'entraînent peu).",
      "Pas adaptée si vous avez plus de 10 h par semaine, visez une course précise avec un pic de forme ou avez besoin de variété. De 4 h à 8 h par semaine (4 – 4,5 h : porte d'entrée, un jour de repos, 2 × 10 min à 95 % de l'allure marathon) ; 6 sorties recommandées (3 sous le seuil, 2 à 3 footings, une sortie longue). Marathon : l'auteur déconseille d'en faire un plan à part entière (au moins deux ans de pratique, trois mini-blocs puis affûtage) : adaptations nécessaires."],
    maxQ: 3, partQualite: 0.25, footingMax: 60, sansAffutage: true, constant: true, rotation: true,
    lignes: { n: 6, texte: 'lignes droites de 20 s (facultatives, en complément, sans gêner la récupération)' },
    score: { '5k': 3, '10k': 3, semi: 2.5, marathon: 1.5 },
    difficulte: [3, 'trois séances sous le seuil par semaine à contrôler (fréquence cardiaque), volume de qualité élevé mais intensité maîtrisée, sans repos programmé'],
    phases: [{ nom: 'Progression continue', f: 1, q: ['NS_COURT', 'NS_MOYEN', 'NS_LONG'], sl: 'SL' }] });
  DOCTRINES.push({ id: 'rousset', nom: 'Rousset', titre: 'Didier Rousset : courir au naturel (aut\'roman)',
    source: "Rousset D., « Courir au naturel aut'roman » (blog courirautroman.unblog.fr, texte et tableaux écrits au début des années 1990) : pyramide des pourcentages, cycles de 10 jours, séances et allures ; mentions sur le forum courseapied.net (fil « méthode Didier »).",
    resume: "Beaucoup de footings lents, presque tous les jours, et des cycles d'environ 10 jours où l'on glisse, entre deux footings, les formes de travail dont on a besoin : endurance active (train, tempo-route), résistance quantitative (VMA), résistance qualitative et vitesse pour ceux qui en manquent. L'intensité se règle à la sensation, jamais jusqu'à l'épuisement.",
    principes: ["Pyramide en kilomètres (route, marathon) : 55 % de footings lents (± 10), 25 % d'endurance active (± 10), 12 % de résistance quantitative (± 5), 5 % de résistance qualitative, 2 % de résistance vitesse, 1 % de vitesse. Piste (1500 – 5000 m) : 75 % / 10 % / 10 % / 2 % / 2 % / 1 %.",
      "Cycle de 10 jours, sans jour imposé : marathon et semi = 2 résistance quantitative, 3 endurance active, 1 sortie longue, 4 footings et, si besoin, 1 résistance vitesse ; 5 et 10 km = plus de résistance quantitative et qualitative. Entre deux séances, deux footings de récupération en général ; ensuite 3 à 4 jours de « repos relatif » (footings), et 2 à 3 jours très faciles avant et après une compétition.",
      "Endurance active : le train (allure marathon à semi, fréquence 140 – 180) et le tempo-route (fractions à allure 10 km – semi, récupération courue) ; à manier avec douceur, jamais tous les footings au seuil.",
      "Résistance quantitative (travail de VMA : 12 × 400 m, 10 × 500 m, 5 × 1000 m, 25 × 200 m à 95 – 105 % de VMA) : récupération courue (trot sur 200 m ou sur la distance), sans jamais s'arrêter ni marcher. Résistance qualitative (5 × 500 m, > 110 % de VMA) et résistance vitesse (6 × 150 m, ≈ 135 %) : récupérations longues et passives (5 à 15 min). Diagonales de terrain de sport (20 à 50) et côtes en bonds (Lydiard « light »).",
      "La vitesse (V.M.R.) est le plafond de l'endurance : un coureur lent sur 100 m a besoin de vitesse et de résistance (pas avant d'avoir un bon foncier) ; une endurance à développer demande surtout des footings longs et lents, du train et de la résistance quantitative. Ici, le choix se fait d'après votre indice d'endurance.",
      "Footings à moins de 140 pulsations (112 – 124 pour récupérer), avec quelques accélérations (Fayolle) ; régler les séances à la sensation d'intensité plutôt qu'au chrono ; ne pas viser la ligne d'un objectif mais celle de sa valeur actuelle ; pas de marathon avec moins de quelques mois de préparation."],
    maxQ: 3, partQualite: 0.4, lignes: { n: 6, texte: 'accélérations progressives de 15 à 20 s dans le footing (Fayolle)' },
    noteProfil: c => (!c.profil ? '' : biais(c) >= 1 / 3 ? `Indice d'endurance ${f1(c.profil.IE)} : bonne endurance, peu de vitesse relative, donc résistance vitesse et qualitative incluses (selon Rousset, la vitesse est le plafond de l'endurance).`
      : biais(c) <= -1 / 3 ? `Indice d'endurance ${f1(c.profil.IE)} : endurance à développer, donc pas de résistance vitesse ni qualitative, mais des footings longs, du train et de la résistance quantitative.` : ''),
    score: { '5k': 2, '10k': 2.5, semi: 3, marathon: 3 },
    difficulte: [3, "beaucoup de footings et des séances variées (VMA, tempo, vitesse selon vos lacunes), réglées à la sensation, jamais jusqu'à l'épuisement"],
    phases: [{ nom: 'Foncier', f: 0.45, q: c => (c.dist > 20000 ? ['ROU_TRAIN', 'ROU_RQUANTI', 'ROU_TEMPO'] : ['ROU_TEMPO', 'ROU_RQUANTI', 'ROU_DIAG']), sl: 'SL' },
      { nom: 'Développement', f: 0.8, q: c => (c.dist > 20000 ? ['ROU_TEMPO', 'ROU_RQUANTI', ...rouVitesse(c)] : ['ROU_RQUANTI', 'ROU_TEMPO', ...rouVitesse(c)]), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: c => ['SPE', 'ROU_RQUANTI', c.dist > 20000 ? 'ROU_TRAIN' : rouVitesse(c)[0]], sl: 'SL_SPE' }] });
  const AFFUTAGE_PHASE = { nom: 'Affûtage', q: ['SPE', 'SEUIL'], sl: 'SL' };

  const biais = (c) => (c.profil ? borne((c.profil.IE + 7) / 3, -1, 1) : 0); // même convention que Balance

  // Fiche de chaque méthode (hypothèses de conception) : public visé, durée habituelle du plan, mise en œuvre (simple, moyenne,
  // complexe) et prérequis dont l'absence déclenche une alerte, sans effet sur le plan : volume (h / semaine) et jours de course ;
  // ie : méthode à fractions longues à VMA ou au seuil, plus dures à tenir avec un indice d'endurance très bas. Aucun seuil de VMA ou
  // de vitesse : la capacité du moment ne dit rien de l'expérience, et les séances se règlent sur la VMA de chacun.
  // limitee : sources limitées (ni livre ni texte de l'auteur sur les phases et les séances : résumés, forums), marquée d'un astérisque.
  const FICHES = {
    zones: { public: 'Optimiser une allure spécifique selon des critères paramétrables, après des cycles de préparation générale', plan: '4 à 24 semaines', mise: 'moyenne', h: 0, j: 0 },
    galloway: { public: 'Débutants et reprise, ou coureurs patients : finir un 10 km, un semi ou un marathon, ou progresser doucement', plan: '16 à 32 semaines', mise: 'simple', h: 2, j: 3 },
    cottereau: { public: "Coureurs d'endurance, du loisir à l'ultra", plan: '12 à 16 semaines', mise: 'simple', h: 2, j: 3 },
    seiler: { public: 'Coureurs réguliers qui séparent nettement le facile et le dur (80/20)', plan: '8 à 12 semaines', mise: 'simple', h: 3, j: 4 },
    fitzgerald: { public: 'Amateurs réguliers visant un chrono, du 5 km au marathon', plan: '9 à 18 semaines', mise: 'simple', h: 3, j: 4 },
    tinman: { public: 'Coureurs de 5 à 10 km qui veulent peu de jours durs', plan: '8 à 12 semaines', mise: 'simple', h: 4, j: 5, limitee: true },
    lydiard: { public: 'Coureurs qui bâtissent une base aérobie sur la durée (semi, marathon)', plan: '16 à 30 semaines', mise: 'simple', h: 5, j: 5 },
    heubi: { public: "Coureurs sur route, du 10 km à l'ultra, qui connaissent leur VMA", plan: '12 à 16 semaines', mise: 'moyenne', h: 3, j: 3 },
    rousset: { public: 'Coureurs réguliers (4 à 7 sorties par semaine), du 5 km au marathon, qui réglent leur effort à la sensation', plan: '16 à 18 semaines', mise: 'moyenne', h: 4, j: 4 },
    singles: { public: 'Amateurs de 4 à 8 h par semaine, du 5 km au semi, sans objectif de pic de forme', plan: '12 semaines ou plus, en continu', mise: 'moyenne', h: 4, j: 5 },
    billat: { public: 'Coureurs de 5 et 10 km qui développent la VO2max', plan: '6 à 10 semaines', mise: 'moyenne', h: 3, j: 3, ie: true, limitee: true },
    mcmillan: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '10 à 16 semaines', mise: 'moyenne', h: 3, j: 4 },
    daniels: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '12 à 24 semaines', mise: 'moyenne', h: 4, j: 4 },
    hanson: { public: 'Marathoniens réguliers, six jours de course par semaine', plan: '18 semaines', mise: 'moyenne', h: 6, j: 6 },
    kellogg: { public: 'Coureurs expérimentés à fort volume, bâti sur des années', plan: '16 à 24 semaines', mise: 'moyenne', h: 6, j: 6 },
    pfitzinger: { public: 'Marathoniens expérimentés à gros volume', plan: '12 à 18 semaines', mise: 'complexe', h: 6, j: 5 },
    norvegien: { public: "Coureurs entraînés, du 5 km au semi, à l'aise avec le travail au seuil", plan: '12 semaines ou plus', mise: 'complexe', h: 5, j: 5, ie: true },
    magness: { public: 'Coureurs expérimentés qui planifient en phases', plan: '16 à 24 semaines', mise: 'complexe', h: 5, j: 5 },
    canova: { public: 'Coureurs de haut niveau, semi et marathon', plan: '20 à 26 semaines', mise: 'complexe', h: 7, j: 6 }
  };
  const MISE = { simple: 'Simple', moyenne: 'Moyenne', complexe: 'Complexe' };
  // Biographie rapide de l'auteur de chaque méthode (« À propos de ce plan »), sans détail incertain. Vérifiées par recherche (oct. 2026) :
  // Daniels, Cottereau, Heubi, Bakken (norvégienne), Kellogg ; les autres reposent sur des faits largement connus, à revérifier si besoin
  const BIOS = {
    daniels: "Jack Daniels (1933 – 2025), Américain, double médaillé olympique en pentathlon moderne devenu physiologiste de l'exercice et entraîneur universitaire. Auteur de <cite>Daniels' Running Formula</cite> (1998) et de l'indice VDOT ; le magazine Runner's World l'a désigné « meilleur entraîneur du monde ».",
    lydiard: "Arthur Lydiard (1917 – 2004), entraîneur néo-zélandais. Ses coureurs Peter Snell et Murray Halberg ont été champions olympiques à Rome en 1960 ; il a popularisé le jogging et inspiré la périodisation moderne de la course de fond.",
    seiler: "Stephen Seiler, physiologiste américain installé en Norvège (université d'Agder). Ses études sur la répartition de l'intensité chez les athlètes d'endurance d'élite ont popularisé l'entraînement polarisé (« 80/20 »).",
    pfitzinger: "Pete Pfitzinger, marathonien américain, deux fois olympique (1984 et 1988), physiologiste de l'exercice. Coauteur avec Scott Douglas d'<cite>Advanced Marathoning</cite> et de <cite>Faster Road Racing</cite>.",
    hanson: "Keith et Kevin Hanson, frères entraîneurs américains, fondateurs du groupe d'élite Hansons-Brooks Distance Project (Michigan). Leur méthode est exposée dans <cite>Hansons Marathon Method</cite>, écrit avec Luke Humphrey.",
    canova: "Renato Canova, entraîneur italien qui a encadré de nombreux coureurs de fond de niveau mondial, notamment au Kenya. Il a théorisé l'entraînement « spécifique », centré sur l'allure de course, pour le marathon.",
    billat: "Véronique Billat, physiologiste française, professeure des universités. Ses travaux sur la vitesse associée à la VO2max (la VMA) et sur le temps qu'on peut y tenir ont fondé de nombreuses séances de fractionné.",
    norvegien: "Pas un entraîneur unique : la méthode a été décrite par Marius Bakken, coureur norvégien de 5 000 m (deux fois olympique, 2000 et 2004) devenu médecin, et rendue célèbre par les frères Ingebrigtsen.",
    cottereau: "Serge Cottereau (né en 1938), ancien coureur de 1 500 m de niveau national, quatre fois vainqueur des 100 km de Millau. Auteur d'ouvrages de référence sur le jogging et la course de fond.",
    heubi: "Bruno Heubi (né en 1960), coureur d'ultrafond français, vainqueur des 100 km de Millau et double champion du monde de 100 km par équipes avec l'équipe de France ; entraîneur et auteur de <cite>Courir longtemps</cite>.",
    mcmillan: "Greg McMillan, entraîneur américain formé en physiologie de l'exercice, connu pour son calculateur d'allures (McMillan Running) et son livre <cite>YOU (Only Faster)</cite>.",
    tinman: "Tom « Tinman » Schwartz, entraîneur américain (Tinman Endurance Coaching), connu pour l'entraînement à la vitesse critique.",
    magness: "Steve Magness, entraîneur et auteur américain en sciences du sport, auteur de <cite>The Science of Running</cite> et coauteur de <cite>Peak Performance</cite>.",
    galloway: "Jeff Galloway, coureur américain sélectionné aux Jeux olympiques de 1972 sur 10 000 m, puis promoteur de la méthode course-marche, qui a ouvert le marathon à de nombreux débutants.",
    fitzgerald: "Matt Fitzgerald, auteur et entraîneur américain spécialiste de l'endurance ; <cite>80/20 Running</cite> (2014) adapte aux coureurs amateurs les travaux de Stephen Seiler.",
    kellogg: "John Kellogg, entraîneur américain qui a encadré des coureurs de tous niveaux, des collégiens aux internationaux américains ; ses conseils, publiés sur le forum LetsRun, ont notamment inspiré le programme de demi-fond et fond de l'université Cornell.",
    singles: "Méthode d'un coureur amateur, J. Copeland, connu sous le pseudonyme « sirpoc » sur le forum LetsRun : tirée des travaux de Marius Bakken, elle est exposée dans son livre de 2025.",
    rousset: "Didier Rousset, entraîneur français dont la méthode, écrite au début des années 1990, est diffusée par son blog « Courir au naturel » et discutée sur le forum courseapied.net (« méthode Didier »)."
  };
  const OBJECTIFS = [['5k', 5000, '5 km'], ['10k', 10000, '10 km'], ['semi', 21097, 'semi'], ['marathon', 42195, 'marathon']];
  const f1 = (x) => x.toFixed(1).replace('.', ',');

  /** Prérequis que vos données ne remplissent pas (volume, fréquence) et indice d'endurance très bas pour les méthodes à fractions longues : texte des alertes */
  function prerequis(d, c) {
    const P = FICHES[d.id], a = [];
    if (c.heures < P.h) a.push(`volume : ${P.h} h par semaine au moins (vous : ${fD(c.heures * 60)})`);
    if (state.seances < P.j) a.push(`fréquence : ${P.j} jours de course au moins (vous : ${state.seances})`);
    if (d.joursMax && state.seances > d.joursMax) a.push(`fréquence : ${d.joursMax} jours de course au plus (vous : ${state.seances})`);
    if (P.ie && c.profil && c.profil.IE <= -10) a.push(`indice d'endurance ${f1(c.profil.IE)} : les fractions longues à VMA ou au seuil seront plus dures à tenir`);
    return a;
  }

  /** Objectifs visés par une méthode : adéquation d'au moins 2,5 sur 3, sinon les meilleurs */
  const objectifs = (d) => { const seuil = Math.min(2.5, Math.max(...Object.values(d.score))); return OBJECTIFS.filter(([k]) => d.score[k] >= seuil); };
  /** Épreuves visées et, avec un profil, durée d'effort correspondante */
  function epreuves(d, c) {
    const L = objectifs(d);
    const noms = L.length > 2 ? `${L[0][2]} à ${L[L.length - 1][2]}` : L.map(x => x[2]).join(' et ');
    if (!c.profil) return noms;
    const [t1, t2] = E.tablePredictions(c.profil, [L[0][1], L[L.length - 1][1]]).map(p => fD(Math.round(p.temps)));
    return `${noms} (≈ ${t1 === t2 ? t1 : `${t1} à ${t2}`})`;
  }

  // Liste déroulante des méthodes : difficulté athlétique croissante (départage par l'ordre de la liste)
  const parDifficulte = (liste) => liste.map((d, i) => ({ d, i })).sort((a, b) => a.d.difficulte[0] - b.d.difficulte[0] || a.i - b.i).map(x => x.d);

  // Rapport volume / fréquence / objectif (hypothèses) : volume minimal (h par semaine) et durée moyenne maximale d'une séance (min)
  // pour chaque objectif ; en dessous de MOY_MIN min par jour de course, les séances sont trop courtes pour être utiles
  const RAPPORT = { '5k': { h: 1.5, moy: 75 }, '10k': { h: 2, moy: 90 }, semi: { h: 3, moy: 105 }, marathon: { h: 4, moy: 120 } };
  const MOY_MIN = LIMITE_MIN;
  /** Alertes sur le rapport entre volume, nombre de séances et objectif (ex. 3 séances en 2 h pour un marathon) */
  function rapportSemaine(c) {
    const R = RAPPORT[c.goal], n = state.seances + nbDoubles(), jour = c.heures * 60 / state.seances, moy = c.heures * 60 / n, a = [];
    const nom = OBJECTIFS.find(([k]) => k === c.goal)[2], pour = `${c.course ? '' : 'une allure proche d\'' }un ${nom}`;
    if (c.heures < R.h) a.push(`Rapport défavorable : ${fD(c.heures * 60)} en ${n} séance${n > 1 ? 's' : ''} par semaine, c'est peu pour ${pour} (au moins ${R.h} h). ${state.methode === 'zones' ? 'Les séances resteront courtes' : 'La sortie longue restera courte'} et la préparation limitée.`);
    else if (moy > R.moy) a.push(`Rapport défavorable : ${fD(c.heures * 60)} en ${n} séances par semaine, soit ≈ ${fD(moy)} par séance, c'est long pour ${pour} (≈ ${fD(R.moy)} au plus en moyenne). Ajoutez des jours de course ou des doublés, ou baissez le volume.`);
    else if (jour < MOY_MIN) a.push(`Séances trop courtes : ≈ ${fD(jour)} par jour de course. Regroupez le volume sur moins de jours.`);
    return a;
  }

  /* ---------- Plan selon la répartition (Balance) ---------- */

  // Format des séances par zone (hypothèses) : durée d'une répétition (min) du niveau 1 au niveau 10, récupération en part de la
  // répétition, temps d'effort minimal d'un bloc sans profil et en Z6 (en dessous : ignoré, ou lignes droites pour Z6 ; avec un profil, voir seuilBloc), minimal pour former une séance à
  // lui seul (en dessous, le bloc s'ajoute à une autre séance)
  const FORMATS = {
    Z3: { nom: 'Allure soutenue', rep: [8, 20], recup: [0.3, 0.1], min: 5, seul: 15 },
    Z4: { nom: 'Seuil', rep: [4, 12], recup: [0.4, 0.15], min: 4, seul: 10 },
    Z5: { nom: 'VMA', rep: [1.5, 4], recup: [1, 0.6], min: 3, seul: 8 },
    Z6: { nom: 'Vitesse', rep: [0.33, 1], recup: [3, 2], min: 4, seul: 5 }
  };
  const TLIM_PART = 2 / 3; // un effort continu ne dépasse pas cette part du temps limite à l'allure courue
  const ZI = Object.keys(FORMATS), BLOCS_MAX = 3, ENTRE_BLOCS = 3; // blocs par séance ; trot entre deux blocs (min)

  /** Temps limite (min) à l'allure a (min/km) : T = 6 × exp((v / VMA − 1) / k) */
  const tlim = (c, a) => 6 * Math.exp((1000 / a / c.profil.V - 1) / c.profil.k);
  /** Temps d'effort minimal d'un bloc à l'allure a (min/km) : 20 s à la VMA, 1 min à l'allure 1 h, 3 min à 80 % de l'allure 1 h (limite Z2/Z3).
      Loi de puissance du temps limite T entre ces trois points (T = 6 min à la VMA, 60 min à l'allure 1 h), prolongée au-delà avec la pente du segment voisin. */
  function seuilBloc(c, a) {
    const T = tlim(c, a), T3 = tlim(c, 1.25 * 1000 / c.vRef);
    return T <= 60 ? (1 / 3) * Math.pow(T / 6, Math.log(3) / Math.log(10)) : Math.pow(T / 60, Math.log(3) / Math.log(T3 / 60));
  }
  /** Seuil d'ignorance d'un bloc de la zone z : seuilBloc à l'allure la plus rapide de la zone (allure cible si spe, VMA pour Z5) ;
      sans profil, ou en Z6 (lignes droites sous ce seuil), valeur fixe de FORMATS */
  const minBloc = (c, z, spe) => (!c.profil || z === 'Z6' ? FORMATS[z].min
    : seuilBloc(c, spe ? c.allureObj : z === 'Z5' ? 1000 / c.profil.V : c.zones[z].allureRapide));
  /** Bloc de m minutes d'effort dans la zone z, en répétitions (ou en continu) selon le niveau l ; spe : à l'allure cible */
  function blocZone(c, z, m, l, spe) {
    // au moins 2 répétitions hors Z3 dès que le temps le permet (pas d'effort continu en Z4 à Z6 sur un bloc court)
    // Z5 va de l'allure 1 h à la VMA : les répétitions se courent à 95 – 100 % de VMA (sans passer sous l'allure 1 h)
    const vma5 = !spe && z === 'Z5' && c.profil;
    const allure = c.profil && (spe ? [c.allureObj * 0.99, c.allureObj * 1.01] : vma5 ? [1000 / c.profil.V, Math.min(1000 / (c.profil.V * 0.95), c.zones.Z5.allureLente)] : plageZ(c, z)), a = allure && moy(allure);
    // un effort continu ne dépasse pas 2/3 du temps limite à l'allure courue (modèle : T = 6 × exp((v / VMA − 1) / k))
    const cap = a ? TLIM_PART * tlim(c, a) : Infinity;
    const F = FORMATS[z], n = Math.max(z !== 'Z3' && m >= 2 * F.rep[0] ? 2 : 1, Math.round(m / Math.min(m, lerp(F.rep[0], F.rep[1], l))), Math.ceil(m / cap - 1e-9));
    const r = arrondi(m / n) > cap ? Math.floor(cap * 12) / 12 : arrondi(m / n);
    const rc = n > 1 ? arrondi(Math.max(0.5, r * lerp(F.recup[0], F.recup[1], l))) : 0;
    const ou = spe ? `à allure ${c.nomObj}${a ? ` (${fA(c.allureObj)}, ${z})` : ''}` : vma5 ? `en Z5 (${fourchette(allure)}, 95 – 100 % de VMA)` : `en ${zt(c, z)}`;
    return { z, spe, effort: n * r, recup: (n - 1) * rc, km: c.profil ? n * r / a + (n - 1) * rc / aZ(c, 'Z1') : null,
      texte: n > 1 ? `${n} × ${fD(r)}${a ? ` (≈ ${Math.round(r / a * 10) * 100} m)` : ''} ${ou}, récupération ${fD(rc)} en trottinant (Z1)`
        : `${fD(r)} en continu ${ou}${a ? ` (≈ ${(r / a).toFixed(1).replace('.', ',')} km)` : ''}`,
      etapes: n > 1 ? [{ rep: n, etapes: [{ t: 'effort', duree: r, allure }, { t: 'recup', duree: rc }] }] : [{ t: 'effort', duree: r, allure }] };
  }
  /** Séance de qualité de un à trois blocs ([{ z, min, spe }]), du plus lent au plus rapide, 3 min de trot entre les blocs */
  function seanceZones(c, blocs, l) {
    const B = blocs.sort((a, b) => ZI.indexOf(a.z) - ZI.indexOf(b.z)).map(b => blocZone(c, b.z, b.min, l, b.spe)), entre = ENTRE_BLOCS * (B.length - 1);
    const somme = (f) => B.reduce((a, b) => a + f(b), 0), effort = somme(b => b.effort), principal = B.reduce((a, b) => (b.effort > a.effort ? b : a));
    const noms = [...new Set(B.map(b => (b.spe ? `Allure ${c.nomObj}` : FORMATS[b.z].nom)))];
    const r = { travail: effort + somme(b => b.recup) + entre, effort, km: c.profil ? somme(b => b.km) + entre / aZ(c, 'Z1') : null,
      parts: ajoute({ Z1: somme(b => b.recup) + entre }, ...B.map(b => ({ [b.z]: b.effort }))),
      etapes: B.flatMap((b, k) => (k ? [{ t: 'recup', duree: ENTRE_BLOCS }, ...b.etapes] : b.etapes)),
      texte: B.map(b => b.texte).join(` · ${ENTRE_BLOCS} min de trot · `) };
    return enveloppe(c, 'ZONES', noms.join(' + '), principal.z, r);
  }

  /** Semaine du plan selon la répartition : minutes d'effort de Z3 à Z6 (volume × part de la zone), réparties en nbQ séances.
      Z6 en petite quantité devient des lignes droites. Chaque zone forme des blocs (coupés au-delà du maximum, scindés s'il reste des séances) ;
      les plus gros ouvrent les séances, les autres s'y ajoutent (zone voisine d'abord), trois blocs au plus par séance. */
  function semaineZones(c, vol, l, nbQ, k = 1, maxS = nbQ) { // maxS : nombre maximal de séances de qualité (l'effort retiré par la limite de longueur peut en créer)
    // k : part du temps d'intensité gardée (semaine de décharge : la moitié du travail d'une semaine de charge)
    const I = Object.fromEntries(ZI.map((z, i) => [z, vol * c.parts[i + 2] * k])), zc = c.zoneObj;
    let lignes = null, exces = 0;
    if (I.Z6 > 0 && I.Z6 < FORMATS.Z6.min) {
      const n = Math.round(I.Z6 * 3); // 20 s par ligne droite
      if (n >= 3) lignes = { n, texte: 'lignes droites de 20 s (Z6, vite et relâché), 40 s de trot entre chacune' };
      I.Z6 = 0;
    }
    // pas de sortie longue en LPN : tout le temps de la zone de l'allure cible (semi, marathon) est couru dans les séances de qualité
    let ch = [];
    ZI.forEach(z => {
      if (I[z] < minBloc(c, z, z === zc)) return; // trop peu pour un bloc (sous le seuil d'ignorance à son allure) : laissé de côté
      ch.push({ z, min: I[z], spe: z === zc }); // pas de durée maximale : seule la longueur des répétitions est bornée (2/3 du temps limite)
    });
    for (;;) { // séances disponibles : on scinde le plus gros bloc s'il reste assez long
      const g = ch.reduce((a, x) => (!a || x.min > a.min ? x : a), null);
      if (ch.length >= nbQ || !g || g.min < 2 * FORMATS[g.z].seul) break;
      g.min /= 2; ch.push({ ...g });
    }
    ch.sort((a, b) => b.min - a.min);
    // ouvrent une séance : les plus gros blocs assez longs (au moins le plus gros), dans la limite de nbQ
    const nSeul = Math.max(1, ch.filter(x => x.min >= FORMATS[x.z].seul).length), seances = ch.slice(0, Math.min(nbQ, nSeul)).map(x => [x]);
    for (const x of ch.slice(seances.length)) {
      const voisin = (s) => s.some(b => Math.abs(ZI.indexOf(b.z) - ZI.indexOf(x.z)) <= 1);
      const libres = seances.filter(s => s.length < BLOCS_MAX).sort((a, b) => voisin(b) - voisin(a) || a.length - b.length);
      if (libres.length) libres[0].push(x); else exces += x.min;
    }
    // longueur maximale d'une séance : une séance trop longue est raccourcie (blocs réduits ensemble) et l'effort retiré est reporté sur les
    // autres séances de qualité qui ont de la place, puis sur de nouvelles séances de qualité (jusqu'à maxS) ; coupe : effort qu'on n'a pas pu placer (min)
    const copie = (b, k) => b.map(x => ({ ...x, min: x.min * k })), sz = (b) => seanceZones(c, copie(b, 1), l);
    const plusGrand = (ok, max) => { // plus grande valeur dans [0, max] pour laquelle ok(v) est vrai (dichotomie, ok décroissant)
      if (ok(max)) return max;
      let lo = 0, hi = max;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      return lo;
    };
    let coupe = 0, trop = 0; // trop : durée de la plus longue séance qui reste au-dessus de la limite
    const S = seances.map(b => b.map(x => ({ ...x }))), reportes = [];
    if (c.limite) {
      S.forEach(b => {
        if (!depasse(c, sz(b))) return;
        const k = Math.max(0.05, plusGrand(k => !depasse(c, seanceZones(c, copie(b, k), l)), 1));
        b.forEach(x => { reportes.push({ ...x, min: x.min * (1 - k) }); x.min *= k; });
      });
      reportes.sort((a, b) => b.min - a.min);
      for (const x of reportes) {
        let m = x.min;
        for (let essai = 0; essai < 12 && m >= minBloc(c, x.z, x.spe); essai++) {
          // séance existante avec de la place (le bloc de même zone grossit, sinon un bloc s'ajoute) : la plus grande part qui tient
          let meilleur = null;
          S.forEach((b, i) => {
            const meme = b.find(y => y.z === x.z && !!y.spe === !!x.spe);
            if (!meme && b.length >= BLOCS_MAX) return;
            const avec = (v) => (meme ? b.map(y => (y === meme ? { ...y, min: y.min + v } : { ...y })) : [...b.map(y => ({ ...y })), { ...x, min: v }]);
            const v = plusGrand(t => !depasse(c, seanceZones(c, avec(t), l)), m);
            if (v >= minBloc(c, x.z, x.spe) && (!meilleur || v > meilleur.v)) meilleur = { i, v, meme };
          });
          if (meilleur) {
            const b = S[meilleur.i];
            if (meilleur.meme) meilleur.meme.min += meilleur.v; else b.push({ ...x, min: meilleur.v });
            m -= meilleur.v;
          } else if (S.length < maxS) { // nouvelle séance de qualité
            const v = Math.max(minBloc(c, x.z, x.spe), plusGrand(t => !depasse(c, seanceZones(c, [{ ...x, min: t }], l)), m));
            S.push([{ ...x, min: Math.min(v, m) }]);
            m -= Math.min(v, m);
          } else break;
        }
        if (m >= minBloc(c, x.z, x.spe)) coupe += m; // effort qu'on n'a pas pu replacer
      }
    }
    const q = S.map(b => {
      const x = sz(b);
      if (c.limite && depasse(c, x)) trop = Math.max(trop, x.duree);
      return x;
    });
    return { q, lignes, exces, coupe, trop };
  }

  // Spécifique LPN : choisit une allure à optimiser (l'allure cible) et construit le plan sur la répartition du volume par zone (ajustable)
  const ZONES_DOC = { id: 'zones', nom: 'Spécifique LPN', titre: 'Spécifique LPN', bloc: true, recupZ1: true, maxQ: 3,
    avertissement: "Cette méthode optimise une allure précise : elle doit être précédée d'autres cycles de préparation générale (endurance de base, côtes, vitesse), qu'elle ne remplace pas.",
    score: { '5k': 3, '10k': 3, semi: 3, marathon: 3 }, difficulte: [3, "optimise une allure précise : suppose déjà une préparation générale et des séances de qualité maîtrisées ; répartition et difficulté réglables"],
    semaine: semaineZones, phases: [{ nom: 'Travail des zones', f: 1, q: [], sl: 'SL' }],
    resume: "Chaque semaine reprend la répartition par zone ci-dessus : le temps d'intensité de chaque zone (Z3 à Z6) forme des séances de qualité, la zone de l'allure cible étant courue à cette allure. Pas de sortie longue imposée : la spécificité de la distance passe d'abord par le volume de la semaine. Le reste du volume va aux séances faciles : une séance longue facile, les autres de même durée. La difficulté règle la longueur des répétitions et des récupérations, pas le temps d'intensité.",
    principes: [
      "Intensité : temps d'effort d'une zone = volume de la semaine × part de la zone, découpé en blocs regroupés en séances de qualité (1 à 3 blocs, zones voisines ensemble) ; Z6 sous 4 min devient des lignes droites de 20 s. Z5 se court à 95 – 100 % de VMA.",
      "Répétitions : jamais plus des 2/3 du temps limite à leur allure (T = 6 × exp((v / VMA − 1) / k)) ; un bloc trop court pour son allure (20 s à la VMA, 1 min à l'allure 1 h, 3 min à 80 % de l'allure 1 h) est ignoré.",
      "Échauffement selon la zone principale : 20 min en Z5 (15 min si une longueur maximale de séance est fixée), 5 min de plus en Z6, 5 de moins en Z4, 10 de moins en Z3 ; retour au calme 10 min.",
      "Séances de qualité placées en premier, sans être allongées au-delà du nécessaire ; pour le semi et le marathon, tout le temps de la zone de l'allure cible se court à cette allure dans les séances de qualité.",
      "Pas de sortie longue imposée : la spécificité de la distance passe d'abord par le volume de la semaine. Les séances faciles (Z1 et Z2, 2es séances des doublés comprises) se partagent le volume restant : m = durée moyenne, une séance longue facile de 4/3 × m (le dernier jour), les autres à parts égales ; 20 min au moins, la longueur maximale de séance au plus.",
      "Lendemain d'une séance de qualité : jour de repos ou séance facile ; la Z1 qui reste à faire (cible de Z1 moins la Z1 des séances de qualité) est courue ces jours-là.",
      "Autres séances faciles : le reste du volume, en durées qui varient de 5 min d'une séance à l'autre (20 min au moins). Volume saisi en km : la somme des km des séances vaut ce volume.",
      "Longueur maximale de séance : une séance de qualité trop longue est raccourcie, et l'effort retiré est reporté sur une autre séance de qualité ou sur une nouvelle.",
      "Doublés : la 2e séance est un footing pris sur le volume facile, jamais le dernier jour de la semaine ; utiles à partir de 5 séances par semaine, ils libèrent des jours de repos.",
      "Décharge : les séances de qualité restent, avec la moitié du travail d'une semaine de charge. Semaine de l'objectif : charge ramenée à 50 %, même nombre de séances. Affûtage et course finale seulement si le plan va jusqu'à la date de l'objectif.",
      "Séances du club : intégrées une semaine seulement si elles tiennent dans la répartition (leur Z2 dans le Z1 + Z2 prévu, leur Z5 dans le Z5 prévu) ; sinon, séance du plan à la place et note sous la semaine.",
      "Compétitions : leur temps en zone est déduit de la répartition de leur semaine ; s'il dépasse, les autres semaines compensent (jusqu'à la moitié de leur temps dans la zone), sinon une alerte le signale.",
      "À placer après des cycles de préparation générale (endurance de base, côtes, vitesse). Formats et seuils : choix de conception (hypothèses), pas une méthode publiée."] };

  /* ---------- Dates et compétitions intermédiaires ---------- */

  const JOUR = 864e5, SEMAINES_MAX = 52;
  const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const fDate = (t, jour) => new Date(t).toLocaleDateString('fr-FR', { ...(jour ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: 'UTC' });
  const COURSES = [[1500, '1 500 m'], [3000, '3 000 m'], [5000, '5 km'], [10000, '10 km'], [15000, '15 km'], [21097, 'Semi-marathon'], [30000, '30 km'], [42195, 'Marathon']];
  const nomCourse = (d) => (COURSES.find(x => x[0] === d) || [d, d >= 1000 ? `${(d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${d} m`])[1];

  /* ---------- Cycle menstruel (facultatif) ---------- */

  // Repères seulement : la phase du cycle n'a qu'un effet trivial sur la performance, preuves de faible qualité, approche individuelle
  // conseillée (McNulty et al., Sports Med 2020). Règles J1 à J5, ovulation estimée à durée − 14 (± 1 jour), phase folliculaire avant,
  // lutéale après. Jours sensibles choisis par l'utilisatrice (J1 – J2, 3 derniers jours du cycle) : le plan y évite les séances de qualité
  // quand il le peut (préférence, pas interdiction), sans toucher au volume. Pas de suivi avec une contraception hormonale (pas de
  // phases naturelles) ni avec des cycles irréguliers (phases imprévisibles), seulement en plan par date.
  const REGLES_JOURS = 5;
  const PHASES = { regles: 'règles', folliculaire: 'phase folliculaire', ovulation: 'ovulation (estimée)', luteale: 'phase lutéale' };
  const suiviCycle = () => {
    const r = state.regles, d0 = parseDate(r.debut);
    return r.actif && !r.hormonale && !r.irregulier && Number.isFinite(d0) && state.horizon === 'date' ? { d0, n: r.duree } : null;
  };
  /** Jour du cycle (1 à n), phase et jour sensible à la date t */
  function phaseDu(t, s) {
    const j = ((Math.round((t - s.d0) / JOUR) % s.n) + s.n) % s.n + 1, ov = s.n - 14;
    const phase = j <= REGLES_JOURS ? 'regles' : Math.abs(j - ov) <= 1 ? 'ovulation' : j < ov ? 'folliculaire' : 'luteale';
    return { j, phase, sensible: (state.regles.sensRegles && j <= 2) || (state.regles.sensAvant && j > s.n - 3) };
  }
  /** Alertes du suivi du cycle : santé (cycles absents, longs, courts ou irréguliers) et conditions du suivi */
  function alertesCycle() {
    const r = state.regles, a = [];
    if (!r.actif) return a;
    const d0 = parseDate(r.debut), ecart = Number.isFinite(d0) ? Math.floor((Date.now() - d0) / JOUR) : null;
    const signes = [r.irregulier && 'cycles irréguliers ou absents', r.duree > 35 && `cycles longs (${r.duree} jours)`, r.duree < 21 && `cycles courts (${r.duree} jours)`,
      ecart > 90 && `plus de 3 mois depuis le début des dernières règles`].filter(Boolean);
    if (signes.length) a.push(`Santé : ${signes.join(', ')}. Chez une coureuse, des règles absentes ou très espacées peuvent signaler un déficit énergétique (RED-S), avec des risques pour les os et la santé. Parlez-en à un médecin ou une sage-femme.`);
    if (r.hormonale) a.push('Cycle menstruel : avec une contraception hormonale, il n\'y a pas de phases naturelles à suivre ; le plan n\'est pas adapté.');
    else if (r.irregulier) a.push('Cycle menstruel : avec des cycles irréguliers, les phases ne sont pas prévisibles ; le plan n\'est pas adapté.');
    else if (state.horizon !== 'date') a.push('Cycle menstruel : le suivi s\'applique au plan par date (étape 3, durée « Jusqu\'à la date de l\'objectif »).');
    else if (!Number.isFinite(d0)) a.push('Cycle menstruel : renseignez la date du début des dernières règles.');
    return a;
  }

  /* ---------- Travail de nuit (facultatif, Spécifique LPN) ---------- */

  // Le manque de sommeil réduit la performance (≈ −7,5 % en moyenne après une nuit courte, Craven et al., Sports Med 2022) ; un adulte
  // a besoin d'au moins 7 h de sommeil (consensus AASM / SRS 2015). Pas de règle chiffrée publiée pour l'entraînement : le plan joue sur
  // le placement, pas sur le volume. Jour de nuit : on part travailler le soir (entraînement possible, plutôt après le sommeil) ; sortie
  // de nuit : le matin qui suit une nuit travaillée (dette de sommeil) : pas de qualité ni de sortie longue si un autre jour le permet.
  /** Calendrier des nuits ({ estNuit(t) }) : nuits fixes (soirs de la semaine, lundi = 0) ou planning tournant (n nuits, r jours de repos) ; null si inactif */
  const suiviNuit = () => {
    const N = state.nuit;
    if (!N.actif || state.horizon !== 'date') return null;
    if (N.mode === 'fixe') return N.soirs.some(Boolean) ? { estNuit: (t) => N.soirs[(new Date(t).getUTCDay() + 6) % 7] } : null;
    const d0 = parseDate(N.debut), P = N.nuits + N.repos;
    return Number.isFinite(d0) ? { estNuit: (t) => ((Math.round((t - d0) / JOUR) % P) + P) % P < N.nuits } : null;
  };
  /** Jour de nuit (départ le soir) et sortie de nuit (lendemain matin d'une nuit travaillée) à la date t */
  const jourNuit = (t, s) => ({ nuit: s.estNuit(t), sortie: s.estNuit(t - JOUR) });
  /** Alertes du travail de nuit : conditions du suivi (méthode, plan par date, saisie) */
  function alertesNuit(lpn) {
    const N = state.nuit, a = [];
    if (!N.actif) return a;
    if (!lpn) a.push('Travail de nuit : pris en compte avec Spécifique LPN seulement (pour l\'instant).');
    else if (state.horizon !== 'date') a.push('Travail de nuit : le suivi s\'applique au plan par date (étape 3, durée « Jusqu\'à la date de l\'objectif »).');
    else if (N.mode === 'fixe' && !N.soirs.some(Boolean)) a.push('Travail de nuit : cochez les soirs où vous partez travailler.');
    else if (N.mode === 'tournant' && !Number.isFinite(parseDate(N.debut))) a.push('Travail de nuit : renseignez la date de la première nuit du planning.');
    return a;
  }

  /** Durée du plan : nombre de semaines saisi, ou semaines entières du début du plan à la date de l'objectif (4 à 52) */
  function horizon() {
    if (state.horizon !== 'date') return { W: state.semaines };
    const d0 = parseDate(state.debut), d1 = parseDate(state.fin);
    if (!(d1 > d0)) return { W: state.semaines, invalide: true };
    const brut = Math.ceil((d1 - d0 + JOUR) / (7 * JOUR));
    return { W: borne(brut, 4, SEMAINES_MAX), brut, d0, d1 };
  }

  // Compétitions intermédiaires (hypothèses de conception) : leur charge TSS = durée (h) × IF² × 100 (IF = allure de course / allure 1 h),
  // cumulée si plusieurs courses tombent la même semaine, se retranche du TSS de la semaine fixé par le cycle (charge constante, ou
  // charge / décharge) : le plan garde le rythme du cycle. DETTE : part du TSS des courses à récupérer la veille (semaine précédente),
  // puis les deux semaines suivantes ; les semaines de décharge ou d'affûtage, déjà allégées, en absorbent une partie.
  // q : nombre maximal de séances de qualité sur la veille, la semaine des courses et les deux suivantes (les courses remplacent la sortie
  // longue, et des footings s'il y en a plusieurs).
  const ABSORBE_ZONE = 0.5; // part maximale du temps d'une zone que les autres semaines peuvent céder à une compétition qui dépasse le temps prévu
  // Course à fond : impact physiologique maximal, compté comme un surplus de TSS (hypothèse) qui s'ajoute au TSS de la course pour le volume
  // de la semaine et la récupération (le niveau léger / modéré / fort reste celui de la course elle-même)
  const SURPLUS_FOND = 0.5; // + 50 % du TSS de la course
  const DETTE = [0.25, 0, 0.5, 0.25], PLANCHER_TSS = 0.3; // le TSS d'entraînement d'une semaine ne descend pas sous 30 % de sa cible
  const NIVEAUX_COURSE = [
    { nom: 'légère', tss: 55, q: [Infinity, 1, 1, Infinity], resume: 'une séance de qualité au plus la semaine de la course et la suivante' },
    { nom: 'modérée', tss: 110, q: [Infinity, 0, 0, Infinity], resume: 'pas de séance de qualité la semaine de la course et la suivante' },
    { nom: 'forte', tss: Infinity, q: [Infinity, 0, 0, 1], resume: 'pas de séance de qualité la semaine de la course et la suivante, une seule la semaine d\'après' }];
  const niveauTss = (tss) => NIVEAUX_COURSE.find(n => tss < n.tss);
  // Engagement dans une compétition intermédiaire (hypothèses) : à fond (allure prédite), sans forcer (−10 % de vitesse), à la cool (−20 %),
  // ou en footing (allure du milieu de la Z2, jamais plus vite que l'allure prédite). Durée = distance / vitesse, IF plus bas, donc TSS et
  // zone recalculés ; une course en footing ne limite pas les séances de qualité autour d'elle.
  const ENGAGEMENTS = { fond: { nom: 'À fond', k: 1, suffixe: '' }, sansForcer: { nom: 'Sans forcer (−10 %)', k: 0.9, suffixe: ' sans forcer' },
    cool: { nom: 'À la cool (−20 %)', k: 0.8, suffixe: ' à la cool' }, footing: { nom: 'En footing (Z2)', k: 0.75, suffixe: ' en footing' } };
  const engagement = (x) => ENGAGEMENTS[x.effort] || ENGAGEMENTS.fond;
  const nomCompet = (x) => `${nomCourse(x.d)}${engagement(x).suffixe}`;
  /** Prédiction d'une compétition (d mètres) selon l'engagement : facteur de vitesse k (footing : milieu de la Z2 / vitesse prédite) ; null sans profil */
  function predCourse(c, d, effort) {
    const p = c.profil && E.tablePredictions(c.profil, [d])[0];
    if (!p || !Number.isFinite(p.temps)) return null;
    const v = p.vitesseKmh * 1000 / 60, k = effort === 'footing' ? Math.min(1, 1000 / moy([c.zones.Z2.allureRapide, c.zones.Z2.allureLente]) / v) : engagement({ effort }).k;
    return { k, temps: p.temps / k, allure: p.allureMinKm / k, pct: k * v / c.vRef * 100, IF: k * v / c.vRef };
  }
  function tssCourse(c, d, effort) {
    const p = predCourse(c, d, effort);
    return p ? p.temps / 60 * p.IF ** 2 * 100 : d / 1000 * 6 * engagement({ effort }).k; // sans profil : estimation par la distance
  }
  /** Course intermédiaire sous la forme du contexte attendu par course() : chrono, allure et zone selon l'engagement */
  function contexteCourse(c, d, effort) {
    const p = predCourse(c, d, effort), x = { ...c, dist: d, label: nomCompet({ d, effort }), nomObj: nomCourse(d).toLowerCase(), tObj: d / (10000 / 60) / engagement({ effort }).k };
    if (!p) return { ...x, profil: null };
    return { ...x, tObj: p.temps, allureObj: p.allure, zoneObj: (Object.values(c.zones).find(z => p.pct < (z.pMax ?? Infinity)) || c.zones.Z6).id };
  }  /** Applique les compétitions intermédiaires aux semaines : volume, séances de qualité maximales, notes et courses (plusieurs par semaine
      possibles, la charge est cumulée) ; renvoie les alertes */
  function appliquerCompetitions(sem, c, h) {
    const alertes = [], parSemaine = {};
    state.courses.forEach(({ date, d, effort }) => {
      const t = parseDate(date);
      if (!(d > 0)) { alertes.push(`Compétition du ${Number.isNaN(t) ? 'jour non précisé' : fDate(t)} : distance invalide, ignorée.`); return; }
      if (Number.isNaN(t)) { alertes.push(`Compétition sans date (${nomCourse(d)}) : ignorée.`); return; }
      if (t < h.d0 || t >= h.d1) { alertes.push(`La compétition du ${fDate(t)} (${nomCourse(d)}) est en dehors du plan (entre le début et la veille de l'objectif) : ignorée.`); return; }
      (parSemaine[Math.floor((t - h.d0) / (7 * JOUR))] ||= []).push({ d, t, effort: ENGAGEMENTS[effort] ? effort : 'fond' });
    });
    Object.entries(parSemaine).forEach(([k, liste]) => {
      const i = +k, courses = liste.sort((x, y) => x.t - y.t), tss = courses.reduce((a, x) => a + tssCourse(c, x.d, x.effort), 0), n = niveauTss(tss);
      const noms = courses.map(nomCompet).join(' + '), quand = courses.map(x => `${nomCompet(x)} le ${fDate(x.t, true)}`).join(', ');
      const surplus = courses.filter(x => x.effort === 'fond').reduce((a, x) => a + SURPLUS_FOND * tssCourse(c, x.d, x.effort), 0), total = tss + surplus;
      const charge = `TSS ≈ ${Math.round(tss)}${surplus ? ` + ${Math.round(surplus)} (à fond)` : ''}`;
      [-1, 0, 1, 2].forEach((o, j) => {
        const w = sem[i + o];
        if (!w || (o !== 0 && DETTE[j] === 0 && n.q[j] === Infinity)) return;
        w.dette = (w.dette || 0) + DETTE[j] * total; // TSS à récupérer cette semaine (veille ou suites des courses)
        // courses toutes en footing : pas de limite de qualité (seul leur TSS compte)
        w.qMax = Math.min(w.qMax ?? Infinity, courses.every(x => x.effort === 'footing') ? Infinity : courses.length > 1 && o === 0 ? 0 : n.q[j]);
        const sansQ = w.qMax === 0 ? ', pas de séance de qualité' : '';
        (w.notes = w.notes || []).push([`Veille de la compétition du ${fDate(courses[0].t)} (${noms}, ${charge}) : volume allégé pour garder de la fraîcheur.`,
          `Compétition${courses.length > 1 ? 's' : ''} : ${quand} (charge ${n.nom}${courses.length > 1 ? ' au total' : ''}, ${charge}) : le TSS ${courses.length > 1 ? 'des courses' : 'de la course'} est retranché du TSS de la semaine${sansQ}, ${courses.length > 1 ? `les courses remplacent ${c.lpn ? 'des séances faciles' : 'la sortie longue et des footings'}` : `la course remplace ${c.lpn ? 'une séance facile' : 'la sortie longue'}`}.`,
          `Récupération après ${noms} (${charge}) : volume réduit${sansQ}.`, `Reprise progressive après ${noms}.`][j]);
        if (o === 0) { w.courses = courses; w.tssCourses = total; w.surplus = surplus; w.etiquette = `Compétition${courses.length > 1 ? 's' : ''} ${noms}`; }
      });
    });
    return alertes;
  }
  /** Place les jours d'une semaine sur le calendrier (mode par date). Les jours de course tombent aux dates des compétitions ; les autres
      jours sont répartis au mieux (écarts réguliers, pas la veille d'une course si possible, au moins un jour entre deux courses quand les
      dates le permettent) ; les séances de qualité s'écartent des courses. dates : dates des courses de la semaine, dans l'ordre des jours
      de course. Dernière semaine : elle s'arrête à la date de l'objectif, les jours en trop sont retirés (footings d'abord).
      Renvoie { jours, dates, retires } triés par date. */
  function placerJours(jours, w, dates, souples = [], clubs = [], voisines = [], sensible = () => false, eviteSL = null, nuitJ = null) { // sensible(t) : qualité évitée si possible (cycle, sortie de nuit) ; eviteSL(t) : sortie longue et doublés évités (sortie de nuit) ; nuitJ(t) : départ en nuit le soir (doublé évité si possible) // souples[k] : course k courue en footing, sans contrainte sur la qualité ni la veille
    // clubs : séances fixes du club { t (date), jour } : elles gardent leur jour ; celle de qualité écarte les séances de qualité des jours voisins
    const oMax = Math.round((w.fin - w.debut) / JOUR), R = dates.map(t => Math.round((t - w.debut) / JOUR)), Rd = R.filter((_, k) => !souples[k]);
    if (oMax < 0 || R.some(r => r < 0 || r > oMax)) return { jours, dates: null, retires: 0 }; // dates incohérentes (plan trop court) : jours non datés
    const C = clubs.map(x => ({ o: Math.round((x.t - w.debut) / JOUR), jour: x.jour })).filter(x => x.o >= 0 && x.o <= oMax && !R.includes(x.o)), Co = C.map(x => x.o);
    const Cq = C.filter(x => x.jour[0].qualite).map(x => x.o);
    // voisines : courses des semaines voisines (hors footing), qui écartent aussi la qualité et la veille (ex. course le dimanche, lundi suivant)
    // jours sensibles (cycle, lendemain de nuit) → nombre de motifs : qualité évitée si possible, d'abord sur les jours qui cumulent les deux
    const Sx = new Map(Array.from({ length: oMax + 1 }, (_, o) => [o, +sensible(w.debut + o * JOUR)]).filter(([, n]) => n > 0));
    const Rq = [...Rd, ...voisines.map(t => Math.round((t - w.debut) / JOUR)).filter(o => (o < 0 && o >= -3) || (o > oMax && o <= oMax + 3))];
    const course = (j) => j.some(x => x.nom === 'Course');
    const libres = Array.from({ length: oMax + 1 }, (_, o) => o).filter(o => !R.includes(o) && !Co.includes(o));
    let autres = jours.filter(j => !course(j)), retires = 0;
    if (Rq.length) { // pas de séance de qualité à moins de 3 jours d'une course : on ne garde que celles qui ont un créneau assez éloigné
      // créneaux possibles : à 3 jours au moins des courses, et jamais deux jours de qualité de suite (comptage glouton, optimal sur une ligne)
      const loin = libres.filter(o => Math.min(...Rq.map(r => Math.abs(o - r))) >= 3).reduce((a, o) => (a.length && o - a[a.length - 1] < 2 ? a : [...a, o]), []).length;
      const trop = autres.filter(j => j[0].qualite).slice(loin);
      retires += trop.length;
      autres = autres.filter(j => !trop.includes(j));
    }
    if (autres.length > libres.length) { // semaine raccourcie : on garde les séances de qualité, puis les autres dans l'ordre
      const garde = new Set([...autres.filter(j => j[0].qualite), ...autres.filter(j => !j[0].qualite)].slice(0, libres.length));
      retires += autres.length - garde.size;
      autres = autres.filter(j => garde.has(j));
    }
    // jours d'entraînement choisis : combinaison de libres qui rend les écarts réguliers (cycliques sur une semaine entière)
    // Cycle menstruel : jours choisis de façon à laisser assez de créneaux de qualité hors des jours sensibles (non consécutifs, à 3 jours
    // au moins des courses) ; chaque séance de qualité qui devrait tomber un jour sensible coûte SENSIBLE_COUT : priorité absolue sur la régularité des jours (seulement quand le cycle ou le travail de nuit est suivi)
    const nQ = autres.filter(j => j[0].qualite).length, SENSIBLE_COUT = 100;
    const manqueSens = (S) => (!Sx.size || !nQ ? 0 : Math.max(0, nQ - S.filter(o => !Sx.has(o) && Rq.every(r => Math.abs(o - r) >= 3) && !Cq.some(q => Math.abs(q - o) === 1))
      .sort((a, b) => a - b).reduce((a, o) => (a.length && o - a[a.length - 1] < 2 ? a : [...a, o]), []).length));
    // Travail de nuit : il faut aussi un jour hors sortie de nuit pour la sortie longue (en plus des créneaux de qualité)
    // et un jour hors sortie de nuit pour chaque doublé posé sur un jour de footing (un doublé sur un jour de qualité est déjà compté)
    const estSL = (j) => j.some(x => /^(Sortie longue|Footing long)/.test(x.nom)), avecSLsem = !!eviteSL && autres.some(estSL);
    const estDouble = (j) => j.length > 1 && !j.some(x => x.nom === 'Course' || x.club), nDblF = eviteSL ? autres.filter(j => estDouble(j) && !j[0].qualite && !estSL(j)).length : 0;
    const manqueSL = (S) => (eviteSL && S.filter(o => !eviteSL(w.debut + o * JOUR)).length < nQ + (avecSLsem ? 1 : 0) + nDblF ? 1 : 0);
    const coût = (S) => {
      const tous = [...S, ...R, ...Co].sort((a, b) => a - b), n = tous.length, pen = SENSIBLE_COUT * (manqueSens(S) + 3 * manqueSL(S)); // la sortie longue pèse triple (une seule par semaine, la plus longue : à tenir hors sortie de nuit, même au prix de jours moins réguliers)
      if (n < 2) return pen;
      const cycle = oMax === 6, ecarts = tous.slice(1).map((o, k) => o - tous[k]).concat(cycle ? [7 - tous[n - 1] + tous[0]] : []);
      const ideal = cycle ? 7 / n : oMax / (n - 1);
      return ecarts.reduce((a, e) => a + (e - ideal) ** 2, 0) + 4 * S.filter(o => Rq.includes(o + 1)).length + (R.length ? 0 : 2 * (oMax - tous[n - 1])) + pen;
    };
    let meilleur = null;
    const choisir = (debut, S) => {
      if (S.length === autres.length) { const k = coût(S); if (!meilleur || k < meilleur.k - 1e-9) meilleur = { k, S: S.slice() }; return; }
      for (let i = debut; i < libres.length; i++) choisir(i + 1, [...S, libres[i]]);
    };
    choisir(0, []);
    const creneaux = meilleur ? meilleur.S : [], distCourse = (o) => Math.min(9, ...Rd.map(r => Math.abs(o - r)), ...Rq.slice(Rd.length).map(r => Math.min(3, Math.abs(o - r)))); // courses voisines : au-delà de 3 jours, sans préférence (pas de qualité repoussée en fin de semaine)
    const attribue = new Map(); // décalage → jour
    const qualite = autres.filter(j => j[0].qualite), faciles = autres.filter(j => !j[0].qualite);
    if ((Rq.length || Cq.length || Sx.size) && qualite.length) { // autour d'une course, la qualité va aux créneaux les plus éloignés des courses, jamais deux jours de suite (ni à côté du club de qualité)
      const tries = creneaux.slice().sort((a, b) => (Sx.get(a) || 0) - (Sx.get(b) || 0) || distCourse(b) - distCourse(a) || a - b), pris = [];
      for (const o of tries) if (pris.length < qualite.length && distCourse(o) >= 3 && !pris.some(p => Math.abs(p - o) === 1) && !Cq.some(q => Math.abs(q - o) === 1)) pris.push(o);
      for (const o of tries) if (pris.length < qualite.length && !pris.includes(o) && distCourse(o) >= 3) pris.push(o); // à défaut, deux jours de qualité de suite plutôt qu'à moins de 3 jours d'une course
      for (const o of tries) if (pris.length < qualite.length && !pris.includes(o)) pris.push(o); // en dernier recours, le plus éloigné restant
      pris.sort((a, b) => a - b).forEach((o, k) => attribue.set(o, qualite[k]));
      creneaux.filter(o => !attribue.has(o)).forEach((o, k) => attribue.set(o, faciles[k]));
    } else creneaux.forEach((o, k) => attribue.set(o, autres[k]));
    let courseK = 0;
    R.forEach(o => attribue.set(o, jours.filter(course)[courseK++]));
    C.forEach(x => attribue.set(x.o, x.jour));
    // Sortie longue tombée sur un jour à éviter (sortie de nuit) : échangée avec un footing d'un autre jour, le plus loin des courses
    const oSL = eviteSL && [...attribue.keys()].find(o => estSL(attribue.get(o)));
    if (oSL !== undefined && oSL !== null && oSL !== false && eviteSL(w.debut + oSL * JOUR)) {
      const oF = [...attribue.keys()].filter(o => o !== oSL && !R.includes(o) && !Co.includes(o) && !eviteSL(w.debut + o * JOUR) && attribue.get(o).every(x => !x.qualite))
        .sort((a, b) => distCourse(b) - distCourse(a) || b - a)[0];
      if (oF !== undefined) { const j = attribue.get(oSL); attribue.set(oSL, attribue.get(oF)); attribue.set(oF, j); }
    }
    // Doublés (travail de nuit) : jamais un lendemain de nuit si possible ; échangés avec un footing simple d'un jour de repos (ni sortie ni départ en nuit),
    // à défaut d'un jour de départ en nuit ; s'il n'y a pas de place, construire() fond le doublé en un seul footing
    const rang = (o) => (eviteSL(w.debut + o * JOUR) ? 2 : nuitJ && nuitJ(w.debut + o * JOUR) ? 1 : 0); // 0 repos, 1 départ en nuit, 2 sortie de nuit
    if (eviteSL) for (const o of [...attribue.keys()].filter(o => estDouble(attribue.get(o)) && rang(o) > 0).sort((a, b) => rang(b) - rang(a))) {
      const cand = [...attribue.keys()].filter(p => rang(p) < rang(o) && !R.includes(p) && !Co.includes(p) && attribue.get(p).length === 1 && !attribue.get(p)[0].qualite && !estSL(attribue.get(p)))
        .sort((a, b) => rang(a) - rang(b) || a - b);
      if (cand.length && !attribue.get(o)[0].qualite) { const j = attribue.get(o); attribue.set(o, attribue.get(cand[0])); attribue.set(cand[0], j); }
    }
    const ordre = [...attribue.keys()].sort((a, b) => a - b);
    return { jours: ordre.map(o => attribue.get(o)), dates: ordre.map(o => w.debut + o * JOUR), retires };
  }

  /* ---------- Calendrier et semaines ---------- */

  /** Cycle automatique (hypothèses) : charge constante sous 6 semaines d'entraînement ; sinon 3 semaines de charge pour 1 de décharge (2 + 1 sous
      8 semaines), ajusté aux compétitions intermédiaires : on retient la longueur de charge (2 à 5 semaines) dont les semaines de décharge
      tombent le mieux sur la semaine d'une compétition notable (poids : charge légère 1, modérée 2, forte 3) ou sur la suivante (récupération,
      poids × 0,8) ; à égalité, la plus proche de la valeur par défaut. N : semaines avant l'affûtage. */
  function cycleAuto(c, N, h) {
    if (N < 6) return { type: 'constante', charge: 0, decharge: 0, raison: `plan de ${N} semaine${N > 1 ? 's' : ''} : trop court pour alterner charge et décharge` };
    const poids = {}; // semaine → poids des compétitions (courses en footing exclues : elles ne comptent que pour leur TSS)
    if (state.horizon === 'date' && h.d0) {
      const parSemaine = {};
      state.courses.forEach(({ date, d, effort }) => {
        const t = parseDate(date);
        if (!(d > 0) || Number.isNaN(t) || t < h.d0 || t >= h.d1 || effort === 'footing') return;
        (parSemaine[Math.floor((t - h.d0) / (7 * JOUR))] ||= []).push(tssCourse(c, d, effort));
      });
      Object.entries(parSemaine).forEach(([i, l]) => { poids[i] = NIVEAUX_COURSE.indexOf(niveauTss(l.reduce((a, x) => a + x, 0))) + 1; });
    }
    const defaut = N < 8 ? 2 : 3, avecCourses = Object.keys(poids).length > 0;
    let meilleur = null;
    for (let charge = 2; charge <= 5; charge++) {
      const B = charge + 1;
      if (B > N) break;
      const decharge = (i) => i >= 0 && i % B >= charge;
      const s = Object.entries(poids).reduce((a, [i, w]) => a + w * ((decharge(+i) ? 1 : 0) + (decharge(+i + 1) ? 0.8 : 0)), 0) - 0.01 * Math.abs(charge - defaut);
      if (!meilleur || s > meilleur.s + 1e-9) meilleur = { s, charge };
    }
    return { type: 'cycle', charge: meilleur.charge, decharge: 1, raison: avecCourses
      ? `vos semaines de décharge tombent sur ou juste après vos compétitions intermédiaires, sur ${N} semaines`
      : `cycle classique pour ${N} semaines${N < 8 ? ' (plan court)' : ''}` };
  }
  const nomCycle = (cy) => (cy.type === 'cycle' ? `cycle ${cy.charge} + ${cy.decharge}${cy.auto ? ' (automatique)' : ''}` : 'charge constante');

  /** Semaines : type, facteur de volume, niveau (1 à 10) et avancement (0 à 1) avant l'affûtage */
  // affutage3 (Pfitzinger) : 3 semaines d'affûtage pour le marathon si la préparation fait au moins 12 semaines
  function calendrier(c, doc) {
    const h = horizon(), W = h.W, nAff = W < 6 || doc.sansAffutage || (doc.bloc && state.horizon !== 'date') ? 0 : doc.affutage3 && c.dist > 30000 && W >= 12 ? 3 : W >= 10 && c.dist > 20000 ? 2 : 1;
    const N = W - nAff;
    // cycle effectif : choix de l'utilisateur, ou calcul automatique ; une méthode à charge constante l'impose
    const cy = doc.constant ? { type: 'constante', charge: 0, decharge: 0, imposee: true }
      : state.cycle === 'auto' ? { ...cycleAuto(c, N, h), auto: true }
        : state.cycle === 'constante' ? { type: 'constante', charge: 0, decharge: 0 } : { type: 'cycle', charge: state.charge, decharge: state.decharge };
    const B = cy.charge + cy.decharge;
    const d = state.difficulte, sem = [];
    for (let i = 0; i < N; i++) {
      const avance = PROGRESSION * i / Math.max(1, N - 1);
      if (cy.type === 'constante') { sem.push({ type: 'Charge', facteur: 1, niveau: d + avance, frac: i / N }); continue; }
      const p = i % B, base = d + PROGRESSION * (i - p) / Math.max(1, N - 1); // niveau au début du bloc
      sem.push(p < cy.charge
        ? { type: 'Charge', facteur: 1 + CHARGE_PAS * (p - (cy.charge - 1) / 2), niveau: base + 0.5 * p, frac: i / N }
        : { type: 'Décharge', facteur: DECHARGE, niveau: base - 1, frac: i / N });
    }
    ({ 3: [0.8, 0.65, 0.5], 2: [0.75, 0.55], 1: [0.6], 0: [] })[nAff].forEach(f => sem.push({ type: 'Affûtage', facteur: f, niveau: d + PROGRESSION - 2, frac: 1 }));
    // Volume saisi : cible (moyenne des semaines de charge, tel quel), maxi (la semaine la plus chargée vaut le volume) ou mini (la semaine de
    // charge la plus légère vaut le volume) ; tout le cycle est décalé d'autant, décharge et affûtage compris (ils restent allégés)
    const charges = sem.filter(w => w.type === 'Charge').map(w => w.facteur);
    // marge de 5 min (pas d'arrondi des séances) pour que le volume réel respecte bien le maxi ou le mini
    const marge = c.heures > 0 ? 5 / (c.heures * 60) : 0;
    const kVol = state.volType === 'max' && sem.length ? (1 - marge) / Math.max(...sem.map(w => w.facteur)) : state.volType === 'min' && charges.length ? (1 + marge) / Math.min(...charges) : 1;
    sem.forEach(w => { w.facteur *= kVol; });
    const cal = sem.map((w, i) => ({ ...w, niveau: borne(w.niveau, 1, 10), ...(h.d0 ? { debut: h.d0 + i * 7 * JOUR, fin: h.d1 >= h.d0 + i * 7 * JOUR && h.d1 < h.d0 + (i * 7 + 6) * JOUR ? h.d1 : h.d0 + (i * 7 + 6) * JOUR } : {}) }));
    return { cal, cycle: cy, alertes: h.d0 ? appliquerCompetitions(cal, c, h) : [] };
  }

  const volRef = () => ({ max: 'le volume maxi', min: 'le volume mini' }[state.volType] || 'le volume de référence');
  const nbDoubles = () => Math.min(state.doubles, state.seances, 6); // chaque jour de course peut être doublé, 6 au plus
  // Accélérations après un footing, une fois par semaine (lignes : { n, texte } de la méthode), +1 min par répétition
  const avecLignes = (f, L) => ({ ...f, nom: `${f.nom} et accélérations`, duree: arr5(f.duree + L.n), km: f.km && f.km * (f.duree + L.n) / f.duree, parts: ajoute(f.parts, { Z2: L.n * 2 / 3, Z6: L.n / 3 }),
    etapes: [...f.etapes, { t: 'effort', duree: L.n, nom: 'Accélérations' }], texte: `${f.texte.replace(/\.$/, '')}, puis ${L.n} ${L.texte}.` });

  /** Répartit tot minutes entre n séances faciles (pas de 5 min, entre min et max) : les durées alternent haut / bas (écart de 5 min), le surplus
      va aux séances hautes ; perdu : minutes qui ne peuvent pas être placées (plafond), court : moins de min minutes par séance */
  /** Spécifique LPN : partage du volume facile tot (min) entre n séances faciles. m = moyenne ; une séance longue facile de LONG_FACILE × m,
      les autres à parts égales. Pas de 5 min, entre min et max (longueur maximale) ; la séance longue absorbe l'arrondi, et si elle est
      plafonnée, le surplus va aux autres. Retourne { long, autre, court (moyenne sous le minimum), perdu (volume non placé) } */
  function partageFacile(tot, n, min, max) {
    if (n <= 0) return { long: 0, autres: [], court: false, perdu: Math.max(0, tot) };
    const b = (x) => Math.max(min, Math.min(max, x)), m = tot / n;
    if (n === 1) { const long = b(Math.round(tot / 5) * 5); return { long, autres: [], court: m < min, perdu: Math.max(0, tot - long) }; }
    // autres : le reste en pas de 5 min, à 5 min près les unes des autres (l'arrondi ne se cumule pas sur la séance longue)
    const long = b(Math.round(Math.min(max, LONG_FACILE * m) / 5) * 5), pas = Math.max(0, Math.round((tot - long) / 5));
    const base = Math.floor(pas / (n - 1)), plus = pas - base * (n - 1);
    const autres = Array.from({ length: n - 1 }, (_, k) => b(5 * (base + (k < plus ? 1 : 0))));
    return { long, autres, court: m < min, perdu: Math.max(0, tot - long - autres.reduce((a, x) => a + x, 0)) };
  }

  function construire(doc, ctx) {
    const lpn = doc === ZONES_DOC; // Spécifique LPN : nos règles ; méthodes d'entraîneurs : leurs règles propres, inchangées
    const c = { ...ctx, lpn, ...(doc.courseMarche ? { courseMarche: true } : {}) }; // footings et sorties longues en course-marche (Galloway)
    const { cal, alertes: aCourses, cycle } = calendrier(c, doc), nbQ0 = Math.min(doc.maxQ, state.seances <= 3 ? 1 : state.seances <= 5 ? 2 : 3);
    // Plafond de la sortie longue : slKm (km, nombre ou fonction du contexte) converti à l'allure de la sortie longue, sinon SL_MAX
    const slKm = typeof doc.slKm === 'function' ? doc.slKm(c) : doc.slKm;
    const slMax0 = slKm && c.profil ? slKm * (c.courseMarche ? allureGalloway(c) : (c.zones.Z2.allureRapide + c.zones.Z2.allureLente) / 2) : lpn ? SL_MAX : SL_MAX_M;
    // Longueur maximale d'une séance (étape 2) : plafonne aussi la sortie longue et les footings (par pas de 5 min)
    const lim = c.limite, lim5 = lim ? Math.max(5, Math.floor(lim.min / 5) * 5) : Infinity, slMax = Math.min(slMax0, lim5), efMin = Math.min(lpn ? EF_MIN : EF_MIN_M, lim5);
    const limiter = (x, l) => { // séance de qualité ramenée sous la limite (coupe : effort retiré) ; sans effet sur une séance sans échelle (club, test)
      if (!lim || !x.qualite || !x.echelle || !depasse(c, x)) return x;
      const y = reduire(c, x, k => qualite(x.id, l, x.echelle * k, c));
      coupe += x.effort - y.effort;
      if (depasse(c, y)) trop = Math.max(trop, y.duree);
      return y;
    };
    const avecSL = !doc.slSi || doc.slSi(c);
    // Séances du club : durée totale, temps par zone, nombre de jours occupés et de séances de qualité prises sur le plan
    const clubs = clubsActifs(), nClub = clubs.length, clubT = clubs.reduce((a, k) => a + k.duree, 0), clubQ = clubs.filter(k => k.travail).length;
    const clubZ = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].map(z => clubs.reduce((a, k) => a + (k.parts[z] || 0), 0));
    const jourLibres = state.seances - nClub; // jours de course laissés au plan (sortie longue comprise)
    // Parts par zone du reste de la semaine : le temps du club en Z2 et en Z5 est déduit de la répartition, le reliquat va en Z2
    const horsClub = (parts, vol) => {
      if (!nClub || vol - clubT <= 0) return parts;
      const p = parts.map((x, k) => Math.max(0, vol * x - clubZ[k]) / (vol - clubT));
      p[1] += 1 - p.reduce((a, x) => a + x, 0);
      return p;
    };
    const aClubSem = { sansQualite: 0, ecartees: {} };
    // Spécifique LPN : une séance du club n'est intégrée une semaine que si son temps en Z2 tient dans le temps prévu en Z1 + Z2 et son temps en Z5
    // dans le temps prévu en Z5 (avec les autres séances du club de la semaine) ; sinon elle est écartée (remplacée par une séance du plan,
    // avec une note). Les méthodes d'entraîneurs gardent leurs séances du club chaque semaine.
    const clubsSemaine = (i) => {
      if (!lpn) return { clubs, ecartees: [] };
      const { vol } = volumes[i], ok = [], ecartees = [];
      for (const k of clubs) {
        const tz = (z) => [...ok, k].reduce((a, x) => a + (x.parts[z] || 0), 0), dispo12 = vol * (partsSem[i][0] + partsSem[i][1]), dispo5 = vol * partsSem[i][4];
        const motif = tz('Z2') > dispo12 + 0.01 ? `son temps en Z2 (${fD(tz('Z2'))} avec le club) dépasse le temps prévu en Z1 + Z2 (${fD(dispo12)})`
          : tz('Z5') > dispo5 + 0.01 ? `son temps en Z5 (${fD(tz('Z5'))}) dépasse le temps prévu en Z5 (${fD(dispo5)})` : null;
        if (motif) ecartees.push({ k, motif }); else ok.push(k);
      }
      return { clubs: ok, ecartees };
    };
    // TSS hebdomadaire de référence (volume de référence réparti selon les parts par zone, TSS d'une zone = durée (h) × IF² × 100)
    const tssRef = c.heures * c.parts.reduce((a, p, k) => a + p * window.Balance.zones()[k].iff ** 2 * 100, 0);
    // Volume de la semaine : TSS fixé par le cycle (facteur de la semaine × TSS de référence) moins le TSS des compétitions et la récupération
    // à prévoir (dette, en partie absorbée par une décharge ou un affûtage), converti en temps au TSS horaire de référence ; plancher
    // de PLANCHER_TSS de la cible ; le temps des compétitions s'y ajoute (il est retiré plus bas du volume facile)
    const volumes = cal.map((w, i) => {
      // semaine de l'objectif (voir `derniere`) : charge ramenée à 50 % de la référence, la fréquence est gardée
      const finale = i === cal.length - 1 && c.course && (w.type === 'Affûtage' || state.horizon === 'date');
      const inter = (w.courses || []).map(x => ({ ...contexteCourse(c, x.d, x.effort), t: x.t, effort: x.effort })), cible = lpn && finale ? Math.min(w.facteur, OBJECTIF_CHARGE) : w.facteur, dette = Math.max(0, (w.dette || 0) - tssRef * Math.max(0, 1 - cible));
      const tCourses = inter.reduce((a, x) => a + x.tObj + echCourse(x), 0);
      let fEff = tssRef > 0 && (w.tssCourses || dette) ? Math.max(PLANCHER_TSS * cible, cible - ((w.tssCourses || 0) + dette) / tssRef) : cible;
      // Volume maxi : les compétitions comprises, la semaine ne dépasse pas le volume saisi
      if (state.volType === 'max' && c.heures > 0) fEff = Math.min(fEff, Math.max(0, 1 - (tCourses + 5) / (c.heures * 60)));
      return { inter, fEff, vol: c.heures * 60 * fEff + tCourses };
    });
    // Équilibre du plan (Spécifique LPN) : le temps en zone d'une compétition intermédiaire se déduit du temps prévu par la répartition pour
    // cette zone cette semaine-là. S'il le dépasse, alerte ; les autres semaines cèdent l'excédent si elles le peuvent (au plus ABSORBE_ZONE de
    // leur temps dans la zone), sinon on retire ce qui peut l'être et l'équilibre du plan ne peut pas être respecté. Le temps libéré revient
    // à l'endurance (Z2).
    const partsSem = cal.map(() => c.parts.slice()), aZones = [];
    if (doc === ZONES_DOC) {
      const semCourse = cal.map((w, i) => (w.courses ? i : -1)).filter(i => i >= 0);
      for (let k = 2; k < 6; k++) {
        const id = `Z${k + 1}`, prevu = (i) => volumes[i].vol * c.parts[k], depassements = [];
        semCourse.forEach(i => {
          const courses = volumes[i].inter.filter(x => x.zoneObj === id), r = courses.reduce((a, x) => a + x.tObj, 0);
          if (!r) return;
          partsSem[i][k] = Math.max(0, prevu(i) - r) / volumes[i].vol;
          if (r > prevu(i)) depassements.push({ i, r, t: prevu(i), noms: courses.map(x => x.label).join(' + ') });
        });
        if (!depassements.length) continue;
        const autres = cal.map((_, i) => i).filter(i => !semCourse.includes(i)), total = autres.reduce((a, i) => a + prevu(i), 0);
        const exces = depassements.reduce((a, x) => a + x.r - x.t, 0), cede = Math.min(exces, ABSORBE_ZONE * total), f = total ? 1 - cede / total : 1;
        autres.forEach(i => { partsSem[i][k] *= f; });
        depassements.forEach(({ i, r, t, noms }) => aZones.push(exces <= ABSORBE_ZONE * total
          ? `Le ${noms} (${fD(r)} en ${id}) dépasse les ${fD(t)} de ${id} prévues la semaine ${i + 1} : le temps en ${id} des autres semaines est réduit de ${Math.round((1 - f) * 100)} % pour garder l'équilibre du plan.`
          : `Incohérence : le ${noms} (${fD(r)} en ${id}) dépasse les ${fD(t)} de ${id} prévues la semaine ${i + 1}, et les autres semaines ne peuvent pas compenser : l'équilibre du plan ne peut pas être respecté (le temps en ${id} sera supérieur à celui visé). Le temps de la course est déduit de la semaine et le temps en ${id} des autres semaines est réduit de ${Math.round((1 - f) * 100)} %.`));
      }
      partsSem.forEach(p => { p[1] += 1 - p.reduce((a, x) => a + x, 0); });
    }
    // Dates de toutes les compétitions (hors footing) et de l'objectif : chaque semaine écarte sa qualité des courses des semaines voisines
    const cyc = suiviCycle(); // suivi du cycle menstruel (plan par date), ou null
    const nuitS = lpn ? suiviNuit() : null; // travail de nuit (Spécifique LPN, plan par date), ou null
    // jours où la qualité est évitée si possible : jours sensibles du cycle, sorties de nuit ; la sortie longue évite aussi les sorties de nuit
    // jour à éviter pour la qualité : 1 par motif (jour sensible du cycle, lendemain de nuit), 2 si les deux
    const evite = cyc || nuitS ? (t) => !!(cyc && phaseDu(t, cyc).sensible) + !!(nuitS && jourNuit(t, nuitS).sortie) : undefined;
    let qSortie = 0, doublesFondus = 0, qEvitees = 0, retirees = 0; // séances de qualité restées sur une sortie de nuit ; doublés fondus en un footing ; qualité sur un jour évité (cycle, nuit) ; séances retirées autour des courses
    const datesCourses = [...cal.flatMap(w => (w.courses || []).filter(x => x.effort !== 'footing').map(x => x.t)), ...(c.course && cal.length && cal[cal.length - 1].fin ? [cal[cal.length - 1].fin] : [])];
    let court = false, plafond = false, exces = 0; // volume insuffisant pour le nombre de séances ; footings plafonnés ; intensité non placée (min)
    let coupe = 0, parLimite = false, trop = 0; // effort de qualité retiré par la limite de longueur (min) ; sortie longue ou footings plafonnés par cette limite
    const semaines = cal.map((w, i) => {
      // derniere : semaine de l'objectif (seulement pour une allure de référence : 5 km, 10 km, semi, marathon) : dernière semaine d'affûtage,
      // ou, si le plan va jusqu'à la date de l'objectif, dernière semaine même sans affûtage (plan court)
      const aff = w.type === 'Affûtage', l = (w.niveau - 1) / 9, derniere = i === cal.length - 1 && c.course && (aff || state.horizon === 'date');
      // courses de la semaine : compétitions intermédiaires (par date) puis objectif (dernière semaine) ; la dernière remplace la sortie longue,
      // les autres un footing chacune
      // séances du club de cette semaine (celles qui sont compatibles avec le plan) : remplacent les variables globales pour la semaine
      const { clubs, ecartees } = clubsSemaine(i), nClub = clubs.length, clubT = clubs.reduce((a, k) => a + k.duree, 0), clubQ = clubs.filter(k => k.travail).length;
      const clubZ = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].map(z => clubs.reduce((a, k) => a + (k.parts[z] || 0), 0)), jourLibres = state.seances - nClub;
      const horsClub = (parts, vol) => {
        if (!nClub || vol - clubT <= 0) return parts;
        const p = parts.map((x, k) => Math.max(0, vol * x - clubZ[k]) / (vol - clubT));
        p[1] += 1 - p.reduce((a, x) => a + x, 0);
        return p;
      };
      ecartees.forEach(({ k, motif }) => {
        aClubSem.ecartees[k.jour] = (aClubSem.ecartees[k.jour] || 0) + 1;
        (w.notes = w.notes || []).push(`La séance du club du ${k.jour} ne peut pas être effectuée cette semaine : ${motif}. Elle est remplacée par une séance du plan.`);
      });
      const { inter, fEff, vol } = volumes[i], volP = vol - clubT, cp = { ...c, parts: horsClub(partsSem[i], vol) }; // cp : parts par zone du reste de la semaine (équilibre avec les compétitions, hors club)
      // Plusieurs courses le même jour partagent ce jour : jourCourse regroupe les courses par date (la dernière date est celle de cs)
      const cl = [...inter, ...(derniere ? [{ ...c, t: w.fin }] : [])], cs = cl[cl.length - 1] || null;
      const jourCourse = [...cl.reduce((m, x) => m.set(x.t ?? x, [...(m.get(x.t ?? x) || []), x]), new Map()).values()];
      const extra = jourCourse.slice(0, -1); // jours de course avant celui de cs (chacun une liste de courses)
      const decharge = lpn && w.type === 'Décharge'; // (méthodes : une séance de qualité en moins, comme avant)
      const s = borne(Math.sqrt(c.heures * fEff / 5), 0.7, 1.4) * (aff ? 0.7 : 1) * (decharge ? DECHARGE_Q / Math.sqrt(DECHARGE) : 1); // le volume de la décharge est déjà à 70 %
      const phase = aff ? AFFUTAGE_PHASE : doc.phases.find(p => w.frac < (typeof p.f === 'function' ? p.f(c) : p.f)) || doc.phases[doc.phases.length - 1];
      const nomP = typeof phase.nom === 'function' ? phase.nom(c) : phase.nom;
      // LPN, décharge : même nombre de séances de qualité, allégées de moitié (plutôt que d'en retirer une)
      const nbQs = w.type === 'Charge' || decharge ? nbQ0 : Math.max(1, nbQ0 - 1), nbQ1 = Math.min(w.qMax ?? Infinity, nbQs); // qMax : limité autour d'une compétition
      // LPN : moins de séances de qualité autour d'une compétition = moins de temps d'intensité (au prorata), pas des séances plus grosses
      const kComp = nbQs > 0 ? nbQ1 / nbQs : 1;
      const nbQ = Math.max(0, nbQ1 - clubQ); // la séance de qualité du club prend la place d'une séance du plan
      if (clubQ && nbQ1 > 0 && nbQ === 0) aClubSem.sansQualite++;
      const club = clubs.map(k => seanceClub(k, c));
      // semaine (plan selon la répartition) : séances de qualité, lignes droites et type de sortie longue tirés des minutes par zone
      const sem = doc.semaine ? (nbQ ? doc.semaine(cp, volP, l, nbQ, (decharge ? DECHARGE_Q / DECHARGE : 1) * kComp, Math.max(nbQ, Math.min(doc.maxQ, w.qMax ?? Infinity, jourLibres - 2) - clubQ)) : { q: [], lignes: null, sl: 'SL', exces: 0 }) : null;
      if (sem) { coupe += sem.coupe || 0; trop = Math.max(trop, sem.trop || 0); }
      if (sem && !(w.qMax < Infinity)) exces = Math.max(exces, sem.exces); // autour d'une compétition, la qualité est volontairement limitée
      const ids = sem ? [] : typeof phase.q === 'function' ? phase.q(c) : phase.q, L = sem ? sem.lignes : doc.lignes;
      let q = sem ? sem.q : Array.from({ length: nbQ }, (_, j) => qualite(ids[(j + (doc.rotation ? i : 0)) % ids.length], l, s, c)); // rotation : une autre séance en tête chaque semaine
      // plafonds (Daniels) : temps d'effort d'une séance limité à une part du volume de la semaine (T 10 %, I 8 %, R 5 %)
      q = q.map(x => { const p = doc.plafonds && doc.plafonds[x.id]; return p && x.effort > p * vol ? qualite(x.id, l, s * p * vol / x.effort, c) : x; });
      // partQualite (Fitzgerald, 80/20) : travail de qualité de la semaine, récupérations comprises, plafonné à cette part du volume
      const pQ = phase.partQualite ?? doc.partQualite, totQ = q.reduce((a, x) => a + x.travail, 0), kQ = pQ && totQ ? Math.min(1, Math.max(0, pQ * vol - clubs.reduce((a, k) => a + k.travail, 0)) / totQ) : 1;
      if (kQ < 1) q = q.map(x => (x.qualite ? qualite(x.id, l, s * kQ, c) : x));
      // Test périodique (Galloway : mile magique toutes les 2 semaines) à la place de la dernière séance de qualité
      if (doc.test && !aff && q.length && i % doc.test.tous === 1) q[q.length - 1] = qualite(doc.test.id, l, s, c);
      if (lim && !sem) q = q.map(x => limiter(x, l)); // (le plan selon la répartition est limité dans semaineZones)
      // Volume facile (footings, footings des séances légères, sortie longue) : partagé à égalité, la sortie longue est la plus longue.
      // Sans sortie longue (slSi), le dernier jour est un footing de plus.
      const sansSL = !cs && (lpn || !avecSL || (doc.slUneSur2 && i % 2 === 1)); // slUneSur2 : sortie longue une semaine sur deux ; LPN : jamais de sortie longue
      const nE = Math.max(0, jourLibres - q.length - 1 - extra.length), nF = nE + q.filter(x => x.leger).length + (sansSL ? 1 : 0);
      // Méthode norvégienne : chaque doublé va d'abord à un jour de seuil, avec le soir le format complémentaire (double seuil)
      const nD0 = cs ? 0 : nbDoubles();
      const iSeuil = doc.doubleSeuil ? q.map((x, j) => (SEUIL_NO[x.id] ? j : -1)).filter(j => j >= 0) : [], iPm = iSeuil.slice(0, nD0);
      // Travail au seuil de la semaine (matins et soirs) plafonné à SEUIL_PART du volume
      const totSeuil = [...iSeuil.map(j => q[j].travail), ...iPm.map(j => qualite(SEUIL_NO[q[j].id], l, s, c).travail)].reduce((a, x) => a + x, 0);
      const kS = totSeuil ? Math.min(1, SEUIL_PART * vol / totSeuil) : 1;
      if (kS < 1) iSeuil.forEach(j => { q[j] = limiter(qualite(q[j].id, l, s * kS, c), l); });
      const pm = iPm.map(j => ({ matin: q[j], soir: limiter(qualite(SEUIL_NO[q[j].id], l, s * kS, c), l) }));
      let pool = volP - [...q, ...pm.map(p => p.soir)].reduce((a, x) => a + (x.qualite ? x.duree : x.extra), 0) - cl.reduce((a, x) => a + x.tObj + echCourse(x), 0);
      if (lpn && c.volKm && c.profil) {
        // Volume saisi en km (LPN) : la somme des km des séances vaut le volume (× facteur de la semaine) ; les séances faciles couvrent le reste de
        // distance à l'allure Z2 (au lieu de la conversion km → temps à l'allure moyenne de toutes les zones)
        const kmSeance = (x) => (x.km ?? x.duree / aZ(c, 'Z2')), kmFixe = [...q.filter(x => x.qualite), ...pm.map(p => p.soir), ...club].reduce((a, x) => a + kmSeance(x), 0) + cl.reduce((a, x) => a + x.dist / 1000 + echCourse(x) / aZ(c, 'Z2'), 0);
        pool = Math.max(0, c.volKm * fEff + inter.reduce((a, x) => a + x.dist / 1000 + echCourse(x) / aZ(c, 'Z2'), 0) - kmFixe) * aZ(c, 'Z2');
      }
      // Autres doublés (pas la semaine de course). LPN : un footing de plus, de la durée des autres, jamais le jour de la sortie longue (sur un
      // jour de footing ou de qualité), borné par les jours disponibles. Méthodes : footing court (DOUBLE_PART_M d'un footing, borné à DOUBLE_BORNES_M),
      // le jour de la sortie longue en dernier.
      let nD = lpn ? Math.min(nD0 - pm.length, q.length + nE - pm.length) : nD0 - pm.length;
      const pSL = sansSL || cs ? 0 : 1.5;
      const dD = !lpn && nD ? arr5(borne(DOUBLE_PART_M * pool / (nF + pSL + DOUBLE_PART_M * nD), ...DOUBLE_BORNES_M)) : 0, reste = lpn ? pool : pool - nD * dD;
      const typeSL = sem ? sem.sl : typeof phase.sl === 'function' ? phase.sl(c) : phase.sl;
      const slPlafond = Math.min(slMax0, lim ? lim.min : Infinity);
      let sl, dF, ml, efD, secD, dLong = 0; // sortie longue, footing, sortie moyenne-longue (Pfitzinger : un footing devient une sortie à 75 % de la sortie longue, hors affûtage), durées des footings de la semaine ; LPN : séance longue facile
      if (lpn) {
        // Spécifique LPN (pas de sortie longue imposée : c'est le volume de la semaine qui compte) : les séances de qualité sont placées d'abord,
        // puis toutes les séances faciles (footings, dernier jour, 2es séances des doublés) se partagent le reste : une séance longue facile de
        // 4/3 de la moyenne, les autres à parts égales (partageFacile). La Z1 restante est courue les lendemains de qualité (plus bas).
        // doublés : un jour à une seule séance chacun, hors jour de la plus grosse séance (une qualité plus longue que la séance longue facile)
        let part;
        for (;;) {
          part = partageFacile(reste, nE + nD + (cs ? 0 : 1), efMin, slMax);
          const dispo = q.length + nE - (q.some(x => x.duree > part.long) ? 1 : 0);
          if (nD <= Math.max(0, dispo)) break;
          nD--;
        }
        const n = nE + nD + (cs ? 0 : 1), A = part.autres;
        dF = n > 1 ? A[A.length - 1] : part.long; dLong = part.long; sl = 0; ml = 0;
        // semaine de course : la séance longue facile est un footing de la semaine (à défaut, la 2e séance d'un doublé), sinon le dernier jour
        const toutes = cs ? [dLong, ...A] : A;
        efD = toutes.slice(0, nE); secD = toutes.slice(nE, nE + nD);
        if (n > 0 && part.court) court = true;
        if (!cs && part.perdu >= 5) { if (lim && slMax < slMax0) parLimite = true; else plafond = true; } // volume qui ne peut pas être placé
      } else {
        efD = null;
        // Méthodes d'entraîneurs (règles inchangées) : sortie longue = 1,5 footing, au moins SL_PART_M du volume, jusqu'à son plafond ;
        // un footing ne dépasse pas la sortie longue (1 h la semaine de course). La sortie longue est allongée jusqu'à la plus longue séance de
        // qualité ou du club (durée et distance), dans la limite de son plafond ; au-delà, c'est cette séance qui en tient lieu (voir plus bas).
        const autres = [...q.filter(x => x.qualite), ...club].filter(x => x.duree), kMax = Math.max(0, ...autres.map(x => x.km || 0));
        let besoin = Math.max(0, ...autres.map(x => x.duree));
        while (c.profil && kMax && besoin < 300 && longue(typeSL, besoin, l, c).km < kMax - 0.1) besoin++;
        const slVoulu = Math.max(SL_PART_M * vol, reste / (nF + 1.5) * 1.5);
        sl = !pSL ? 0 : Math.max(arr5(Math.min(slMax, slVoulu)), Math.floor(Math.min(slPlafond, Math.ceil(besoin / 5) * 5)));
        const limBind = lim && slMax < slMax0 && (pSL ? slVoulu > slMax + 2.5 : true); // la limite de longueur est ce qui plafonne ici
        if (limBind && pSL) parLimite = true;
        const cap = derniere ? Math.min(60, slMax) : Math.min(pSL ? sl : slMax, doc.footingMax || Infinity);
        ml = doc.moyenneLongue && !aff && pSL && nE >= 2 ? arr5(0.75 * sl) : 0;
        const brut = (reste - sl - ml) / Math.max(1, nF - (ml ? 1 : 0));
        dF = arr5(Math.max(efMin, Math.min(brut, cap)));
        if (nF > 0 && brut < EF_MIN_M) court = true;
        if (brut > dF + 5 && !cs) { if (limBind && cap >= slMax - 0.01) parLimite = true; else plafond = true; }
      }
      const sousLimite = (d, ajout) => Math.max(lpn ? EF_LEGER : 5, Math.min(d, lim ? lim5 - arr5(ajout) : Infinity, sl && !lpn ? sl - 5 - arr5(ajout) : Infinity)); // footing + lignes droites ou accélérations ≤ limite (méthodes : et < sortie longue)
      q = q.map(x => (x.leger ? avecFooting(x, sousLimite(dF, x.extra), c) : x));
      // Accélérations (lignes) après le premier footing de la semaine, sauf si la semaine a déjà des lignes droites (séance légère) ;
      // LPN : le temps des accélérations est pris sur la durée du footing
      const lignes = L && !cs && !q.some(x => x.leger);
      const ef = Array.from({ length: nE }, (_, k) => (ml && k === nE - 1 ? { ...footing(ml, c), nom: 'Sortie moyenne-longue' }
        : lignes && k === 0 ? avecLignes(footing(lpn ? Math.max(EF_LEGER, efD[nE - 1] - arr5(L.n)) : sousLimite(dF, L.n), c), L) : footing(lpn ? efD[nE - 1 - k] : dF, c)));
      // Ordre conseillé : un jour de qualité, puis un jour de footing, etc. ; la sortie longue (ou la course) en dernier
      const jours = [];
      q.forEach(x => { jours.push([x]); if (ef.length) jours.push([ef.pop()]); });
      ef.forEach(x => jours.push([x]));
      pm.forEach(p => jours.find(j => j[0] === p.matin).push({ ...p.soir, nom: `${p.soir.nom} (double seuil)` }));
      const dernier = cs ? jourCourse[jourCourse.length - 1].map(course) : [lpn ? footing(dLong, c) : sansSL ? footing(dF, c) : longue(typeSL, sl, l, c)];
      // LPN : la séance longue facile, plus longue que les autres footings, est nommée (le dernier jour, ou un footing la semaine de course)
      if (lpn && dLong > dF) { const j = cs ? jours.find(j => j[0].nom === 'Footing' && j[0].duree === dLong) : dernier; if (j) j[0] = { ...j[0], nom: 'Footing long' }; }
      // après les ajustements du travail de nuit (2e footing d'un doublé ajouté à un autre footing), le nom suit le footing réellement le plus long
      const nommerLong = (js) => {
        const f = js.flatMap(j => j.filter(x => /^Footing( long)?$/.test(x.nom))), max = Math.max(0, ...f.map(x => x.duree)), tete = f.filter(x => x.duree === max);
        const actuel = f.find(x => x.nom === 'Footing long');
        if (!actuel || actuel.duree === max) return;
        js.forEach(j => j.forEach((x, m) => { if (x === actuel) j[m] = { ...x, nom: 'Footing' }; else if (tete.length === 1 && x === tete[0]) j[m] = { ...x, nom: 'Footing long' }; }));
      };
      // Doublés : d'abord les jours faciles, puis les jours de qualité (footing en plus) ; méthodes : le jour de la sortie longue en dernier (pas
      // plus long que le footing principal). LPN : jamais deux séances de qualité le même jour, et jamais le jour de la plus grosse séance de la
      // semaine (séance longue facile ou séance de qualité plus longue)
      const grosse = lpn ? [...jours.flat(), ...dernier].reduce((a, x) => (!a || x.duree > a.duree ? x : a), null) : null;
      const libres = jours.filter(j => j.length === 1 && !j.includes(grosse));
      [...libres.filter(j => !j[0].qualite), ...libres.filter(j => j[0].qualite), ...(lpn ? [] : [dernier])].slice(0, nD)
        .forEach((j, m) => j.push(footing(lpn ? secD[m] : Math.min(dD, dF), c)));
      extra.forEach(g => jours.push(g.map(course)));
      jours.push(dernier);
      // Plafond atteint et une autre séance reste plus longue : celle-ci tient lieu de sortie longue, la dernière devient une sortie facile
      const sortieL = dernier[0];
      const plusLongue = lpn ? null : [...jours.flat(), ...club].filter(x => x !== sortieL && x.duree && (x.km != null && sortieL.km != null ? x.km > sortieL.km + 0.1 : x.duree > sortieL.duree + 0.01)) // en km avec un profil, sinon en durée
        .reduce((m, x) => (!m || (x.km || x.duree) > (m.km || m.duree) ? x : m), null);
      if (!lpn && sortieL.nom === 'Sortie longue' && plusLongue) {
        // Méthodes : si une autre séance reste plus longue, elle tient lieu de sortie longue et la dernière devient une sortie facile
        dernier[0] = { ...sortieL, nom: sortieL.travail ? 'Sortie avec fin rapide' : 'Sortie facile' };
        if (!plusLongue.club) jours.forEach(j => { const m = j.indexOf(plusLongue); if (m >= 0) j[m] = { ...plusLongue, nom: `${plusLongue.nom} (tient lieu de sortie longue)` }; });
      }
      // recupZ1 (plan selon la répartition) : footings passés en Z1 (récupération) jusqu'au temps de Z1 visé ; LPN : d'abord les footings du
      // lendemain d'une séance de qualité (la Z1 restante), puis les secondes séances des doublés, puis les autres ; méthodes : secondes séances
      // d'abord. lendemain(k, js) : le jour k suit un jour de qualité (plan par date : la veille dans le calendrier)
      const versZ1 = (js, lendemain) => {
        if (!doc.recupZ1) return js;
        js = js.map(j => j.slice());
        let manque = volP * cp.parts[0] - js.flat().filter(x => !x.club).reduce((a, x) => a + (x.parts.Z1 || 0), 0);        const secondes = js.flatMap((j, k) => j.slice(1).map((_, m) => [k, m + 1])), lendemains = js.map((j, k) => [k, 0]).filter(([k]) => lendemain(k, js));
        if (lpn) for (const [k] of lendemains) { // LPN : la Z1 restante commence les footings du lendemain de qualité (par pas de 5 min)
          const x = js[k][0], z1 = Math.min(x.duree, Math.round(manque / 5) * 5);
          if (manque <= 0 || z1 < 5 || x.nom !== 'Footing' || x.etapes.length > 1) continue;
          js[k][0] = footingZ1(x.duree, z1, c); manque -= z1;
        }
        const cand = lpn ? [...secondes, ...js.map((j, k) => [k, 0])] : [...secondes, ...lendemains, ...js.map((j, k) => [k, 0])];
        for (const [k, m] of cand) {
          const x = js[k][m];
          if (manque <= 0) break;
          if (x.nom !== 'Footing' || x.etapes.length > 1 || manque < x.duree / 2) continue; // footings simples seulement (pas les accélérations)
          js[k][m] = footing(x.duree, c, 'Z1');
          manque -= x.duree;
        }
        return js;
      };
      // LPN sans dates : jamais deux jours de qualité de suite si c'est possible (qualité ajoutée par la longueur maximale, séance piste du club) :
      // on alterne qualité et jours faciles, le dernier jour compris ; la semaine de course garde la course en dernier
      const estQ = (j) => j.some(x => x.qualite || (x.club && x.travail));
      const alterner = (js) => {
        if (!lpn || cs || w.debut || !js.some((j, k) => k && estQ(j) && estQ(js[k - 1]))) return js;
        const Qj = js.filter(estQ), Fj = js.filter(j => !estQ(j)), ordre = [];
        while (Qj.length || Fj.length) { const prev = ordre[ordre.length - 1]; ordre.push((prev && estQ(prev)) || !Qj.length ? Fj.shift() || Qj.shift() : Qj.shift()); }
        return ordre;
      };
      jours.splice(0, jours.length, ...alterner(jours));
      const parDate = !!w.debut && lpn; // LPN par date : la Z1 est placée après le placement sur le calendrier (vrais lendemains de qualité)
      if (!parDate) jours.splice(0, jours.length, ...versZ1(jours, (k, js) => k > 0 && js[k - 1][0].qualite));
      // Mode par date : les jours sont placés sur le calendrier (courses aux dates des compétitions, objectif à la date de fin)
      if (w.debut) {
        // séances du club : à leur jour de la semaine (lundi, jeudi) quand il tombe dans la semaine du plan
        const fixes = clubs.map((k, m) => { for (let o = 0; o <= Math.round((w.fin - w.debut) / JOUR); o++) { const t = new Date(w.debut); t.setDate(t.getDate() + o); if (t.getDay() === k.dow) return { t: t.getTime(), jour: [club[m]] }; } return null; }).filter(Boolean);
        // une date par jour de course (plusieurs courses le même jour : un seul jour, « souple » si elles sont toutes courues en footing)
        const p = placerJours(jours, w, jourCourse.map(g => g[0].t), jourCourse.map(g => g.every(x => x.effort === 'footing')), fixes, datesCourses, evite, nuitS ? (t) => jourNuit(t, nuitS).sortie : undefined, nuitS ? (t) => jourNuit(t, nuitS).nuit : undefined);
        retirees += p.retires;
        if (p.retires) (w.notes = w.notes || []).push(`${p.retires} séance${p.retires > 1 ? 's' : ''} de moins cette semaine : pas de séance de qualité à moins de 3 jours d'une course, ni après la date de l'objectif.`);
        // Séance de qualité restée sur un jour sensible du cycle (pas d'autre créneau possible) : mention, sans toucher au volume
        // Idem le matin après une nuit de travail (pas d'autre créneau) : mention « à alléger, ou après une sieste »
        const mention = (t) => [cyc && phaseDu(t, cyc).sensible && 'Jour sensible de votre cycle : à alléger ou à décaler selon vos sensations.',
          nuitS && jourNuit(t, nuitS).sortie && 'Après une nuit de travail : à alléger, ou à faire après une sieste.'].filter(Boolean).join(' ');
        let fondus = 0; // travail de nuit : doublés restés un lendemain de nuit, reportés sur un autre footing ou fondus en un seul footing
        // Doublé resté un lendemain de nuit : son 2e footing s'ajoute d'abord au footing simple d'un jour de repos (à défaut d'un départ en nuit), le plus court,
        // dans la limite de longueur ; sinon les deux footings du jour sont fondus en un seul (plus bas)
        const jr = p.dates && nuitS ? p.jours.map(j => j.slice()) : p.jours;
        if (p.dates && nuitS) {
          const rangJ = (i) => { const x = jourNuit(p.dates[i], nuitS); return x.sortie ? 2 : x.nuit ? 1 : 0; };
          jr.forEach((j, k) => {
            if (rangJ(k) < 2 || j.length < 2 || j.some(x => x.nom === 'Course' || x.club || x.qualite)) return;
            const d2 = j[1].duree;
            const cible = jr.map((_, i) => i).filter(i => i !== k && rangJ(i) < 2 && jr[i].length === 1 && jr[i][0].nom === 'Footing' && jr[i][0].etapes.length === 1 && (!lim || jr[i][0].duree + d2 <= lim5))
              .sort((a, b) => rangJ(a) - rangJ(b) || jr[a][0].duree - jr[b][0].duree)[0];
            if (cible === undefined) return;
            jr[cible] = [footing(jr[cible][0].duree + d2, c)]; jr[k] = [j[0]]; fondus++;
          });
        }
        const jp = !p.dates || !evite ? jr : jr.map((j, k) => {
          const m = mention(p.dates[k]), n = nuitS && jourNuit(p.dates[k], nuitS);
          if (m && n && n.sortie) qSortie += j.filter(x => x.qualite && !x.club).length;
          if (m) qEvitees += j.filter(x => x.qualite && !x.club).length;
          let jj = !m ? j : j.map(x => (!x.qualite ? x : { ...x, texte: `${x.texte} <em>${m}</em>` }));
          const double = jj.length > 1 && !jj.some(x => x.nom === 'Course' || x.club);
          // Doublé un lendemain de nuit (pas d'autre jour) : les deux footings deviennent un seul, de même durée totale (dans la limite de longueur)
          if (n && n.sortie && double && jj.every(x => !x.qualite) && (!lim || jj.reduce((a, x) => a + x.duree, 0) <= lim5)) {
            fondus++;
            const [x0, x1] = jj, tot = x0.duree + x1.duree;
            jj = [x0.etapes.length === 1 ? footing(tot, c, x0.zone === 'Z1' && x1.zone === 'Z1' ? 'Z1' : 'Z2') // deux footings simples : un seul footing
              : { ...x0, duree: tot, km: x0.km === null || x1.km === null ? null : x0.km + x1.km, parts: ajoute(x0.parts, x1.parts), // footing et accélérations : footing allongé
                etapes: [{ ...x0.etapes[0], duree: x0.etapes[0].duree + x1.duree }, ...x0.etapes.slice(1)],
                texte: `${x0.texte} <em>Doublé fondu (lendemain de nuit) : ${fD(x1.duree)} de footing en plus avant les accélérations.</em>` }];
          } else if (n && n.nuit && double) jj = jj.map((x, i) => (i ? { ...x, texte: `${x.texte} <em>Jour de départ en nuit : 2e séance plutôt avant votre sieste.</em>` } : x));
          return jj;
        });
        if (fondus) { doublesFondus += fondus; (w.notes = w.notes || []).push(`Travail de nuit : ${fondus} doublé${fondus > 1 ? 's' : ''} retiré${fondus > 1 ? 's' : ''} d'un lendemain de nuit : le 2e footing est ajouté à un footing d'un autre jour, ou fondu avec celui du jour (même volume).`); }
        if (lpn) nommerLong(jp);
        const jn = !parDate ? jp : p.dates ? versZ1(jp, (k, js) => k > 0 && p.dates[k] - p.dates[k - 1] < 1.5 * JOUR && js[k - 1].some(x => x.qualite))
          : versZ1(jp, (k, js) => k > 0 && js[k - 1][0].qualite);
        return { ...w, phase: nomP, jours: jn, dates: p.dates, seances: jn.flat() };
      }
      club.forEach((x, m) => jours.splice(clubs[m].id === 'club1' ? 0 : Math.min(3, jours.length - 1), 0, [x])); // sans dates : lundi en tête, jeudi en 4e jour, avant la sortie longue
      const js = alterner(jours);
      return { ...w, phase: nomP, jours: js, seances: js.flat() };
    });
    // Alertes d'incohérence liées aux séances du club
    const aClub = [], pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    if (nClub) {
      if (jourLibres === 1) aClub.push(`Les séances du club (${clubs.map(k => k.jour).join(' et ')}) occupent ${nClub} de vos ${state.seances} jours de course : il ne reste qu'un jour libre, donc ni footing ni séance de qualité propres au plan. Ajoutez des jours de course.`);
      Object.entries(aClubSem.ecartees).forEach(([jour, n]) => aClub.push(`La séance du club du ${jour} ne peut pas être effectuée ${pl(n, 'semaine')} (elle ne tient pas dans le temps prévu par la répartition par zone) : elle est remplacée par une séance du plan ces semaines-là, avec une note sous la semaine.`));
      if (aClubSem.sansQualite) aClub.push(`La séance du jeudi tient lieu de séance de qualité (${pl(aClubSem.sansQualite, 'semaine')}) : le plan n'en ajoute pas ces semaines-là, la méthode perd une partie de son principe.`);
      const h = horizon();
      if (clubQ && h.d0) { // séance de qualité du club à moins de 3 jours d'une compétition (hors footing) ou de l'objectif
        const dates = [...state.courses.filter(x => x.d > 0 && x.effort !== 'footing').map(x => parseDate(x.date)), ...(c.course ? [h.d1] : [])].filter(t => Number.isFinite(t) && t >= h.d0 && t <= h.d1);
        const trop = [];
        semaines.forEach(w => { if (w.dates) w.jours.forEach((j, k) => { if (j[0].club && j[0].qualite) { const r = dates.find(t => Math.abs(t - w.dates[k]) < 3 * JOUR); if (r !== undefined) trop.push(`${fDate(w.dates[k], true)} (course le ${fDate(r, true)})`); } }); });
        if (trop.length) aClub.push(`La séance du club du jeudi tombe à moins de 3 jours d'une compétition : ${trop.slice(0, 3).join(', ')}${trop.length > 3 ? '…' : ''}. À alléger ou à sauter.`);
      }
    }
    // Alertes sur la longueur maximale d'une séance : compatibilité avec l'objectif et le volume, puis effets sur le plan construit
    const aLimite = [];
    if (lim) {
      const nD = nbDoubles(), capacite = (state.seances + nD) * lim.min, W = semaines.length;
      const nom = OBJECTIFS.find(([k]) => k === c.goal)[2], pour = `${c.course ? '' : "une allure proche d'"}un ${nom}`;
      // 5 km et 10 km : la séance la plus longue doit couvrir au moins la distance de l'objectif ; semi et marathon : seul le volume global compte
      const limKm = lim.km ?? lim.min / allureZ2(c), objKm = c.dist / 1000;
      if ((c.goal === '5k' || c.goal === '10k') && limKm < objKm - 0.01) aLimite.push(`Limite incompatible avec l'objectif : pour ${pour}, la séance la plus longue devrait couvrir au moins ${objKm.toLocaleString('fr-FR')} km, or la longueur maximale est de ${lim.txt}${lim.km ? '' : ` (≈ ${(Math.round(limKm * 10) / 10).toLocaleString('fr-FR')} km)`}. Relevez la limite.`);
      const volumeKo = capacite < c.heures * 60 - 1;
      if (volumeKo) aLimite.push(`Limite incompatible avec le volume : ${state.seances} séance${state.seances > 1 ? 's' : ''}${nD ? ` et ${nD} doublé${nD > 1 ? 's' : ''}` : ''} de ${lim.txt} au plus font ${fD(capacite)} par semaine, sous les ${fD(c.heures * 60)} visés. Relevez la limite, ajoutez des jours de course ou des doublés, ou baissez le volume.`);
      else if (parLimite) aLimite.push(`La longueur maximale de ${lim.txt} plafonne la sortie longue et les footings : le volume réel reste sous ${volRef()} certaines semaines.`);
      const fixe = echauffement(c, 'Z5') + RETOUR;
      if (lim.min < fixe + 20) aLimite.push(`Avec ${lim.txt} au plus, l'échauffement et le retour au calme (${fixe} min) laissent très peu de place au travail de qualité.`);
      else if (coupe >= 1) aLimite.push(`La longueur maximale de ${lim.txt} raccourcit les séances de qualité : l'effort retiré est reporté sur d'autres séances quand c'est possible, mais ≈ ${fD(coupe / W)} d'effort par semaine en moyenne n'a pas pu être replacé, le temps en intensité visé n'est pas atteint.`);
      if (trop) aLimite.push(`Certaines séances de qualité ne peuvent pas être raccourcies davantage (répétitions trop longues pour la limite) : jusqu'à ${fD(trop)}, au-dessus de la longueur maximale de ${lim.txt}. Relevez la limite ou choisissez une autre méthode.`);
      clubs.filter(k => k.duree > lim.min + 0.01).forEach(k => aLimite.push(`La séance du club du ${k.jour} (${fD(k.duree)}) dépasse la longueur maximale de ${lim.txt} : elle est gardée telle quelle.`));
    }
    // Travail de nuit : conditions du suivi, et séances de qualité restées sur une sortie de nuit
    const aNuit = alertesNuit(lpn);
    if (nuitS && nbDoubles() && cal.length && cal[0].debut) { // plus de doublés demandés que de jours de repos (ni départ en nuit ni lendemain de nuit) dans une semaine
      const repos = cal.map(w => { let n = 0; for (let t = w.debut; t <= w.fin; t += JOUR) { const x = jourNuit(t, nuitS); if (!x.nuit && !x.sortie) n++; } return n; });
      const mini = Math.min(...repos);
      if (nbDoubles() > mini) aNuit.push(`Travail de nuit : ${nbDoubles()} doublé${nbDoubles() > 1 ? 's' : ''} demandé${nbDoubles() > 1 ? 's' : ''}, mais certaines semaines n'ont que ${mini} jour${mini > 1 ? 's' : ''} de repos (ni départ en nuit ni lendemain de nuit) : les doublés en trop vont sur des jours de départ en nuit, ou sont fondus en un seul footing.`);
    }
    if (doublesFondus) aNuit.push(`Après le travail de nuit : ${doublesFondus} doublé${doublesFondus > 1 ? 's' : ''} sur l'ensemble du plan ${doublesFondus > 1 ? 'ont été retirés' : 'a été retiré'} d'un lendemain de nuit (2e footing ajouté à un autre footing ou fondu avec celui du jour, même volume), faute de jour de repos libre pour un doublé. Demandez moins de doublés ou placez vos jours de course sur vos jours de repos.`);
    // Cycle menstruel : course (objectif ou compétition intermédiaire) sur un jour sensible choisi, simple information (la date ne bouge pas)
    const aCycleC = cyc ? datesCourses.filter(t => phaseDu(t, cyc).sensible).map(t => `Cycle menstruel : la course du ${fDate(t)} tombe sur un de vos jours sensibles (${phaseDu(t, cyc).phase === 'regles' ? 'règles' : 'fin de cycle'}, estimation). La date ne se déplace pas : écoutez vos sensations à l'échauffement et adaptez votre objectif du jour si besoin.`) : [];
    if (nuitS) datesCourses.filter(t => jourNuit(t, nuitS).sortie).forEach(t => aNuit.push(`Après le travail de nuit : la course du ${fDate(t)} tombe le lendemain d'une nuit travaillée. La date ne se déplace pas : si possible, posez cette nuit ou dormez avant le départ.`));
    if (qSortie) aNuit.push(`Après le travail de nuit : ${qSortie} séance${qSortie > 1 ? 's' : ''} de qualité tombe${qSortie > 1 ? 'nt' : ''} le lendemain d'une nuit travaillée, faute d'autre créneau (mention « à alléger » sur la séance). Réduisez les jours de course ou les séances de qualité les semaines chargées en nuits.`);
    // Plan sous contraintes : beaucoup de contraintes combinées (4 ou plus, ou 3 avec des compromis) : le plan est construit, l'alerte explique
    // les contraintes actives, les compromis qu'elles ont imposés et comment retrouver de la marge
    const nCompet = cal.reduce((a, w) => a + (w.courses || []).length, 0), nD = nbDoubles(); // pl : défini plus haut (alertes du club)
    const contraintes = [cyc && 'le suivi du cycle menstruel', nuitS && 'le travail de nuit', lim && `la longueur maximale de séance (${lim.txt})`, nD && pl(nD, 'doublé'),
      (court || c.heures < RAPPORT[c.goal].h) && 'un volume faible pour l\'objectif', nCompet && pl(nCompet, 'compétition intermédiaire').replace('intermédiaire', nCompet > 1 ? 'intermédiaires' : 'intermédiaire'),
      nClub && `${pl(nClub, 'séance')} du club`].filter(Boolean);
    const compromis = [qEvitees && `${pl(qEvitees, 'séance')} de qualité sur un jour à éviter (cycle ou lendemain de nuit, avec la mention « à alléger »)`,
      doublesFondus && `${pl(doublesFondus, 'doublé')} retiré${doublesFondus > 1 ? 's' : ''} d'un lendemain de nuit`, retirees && `${pl(retirees, 'séance')} retirée${retirees > 1 ? 's' : ''} autour des compétitions`,
      Object.keys(aClubSem.ecartees).length && 'des séances du club remplacées certaines semaines', coupe >= 1 && 'de l\'effort de qualité raccourci par la longueur maximale',
      court && 'des footings portés au minimum (volume réel au-dessus du volume visé)',
      plafond && 'des footings plafonnés (volume réel sous le volume visé)', exces >= 1 && 'de l\'intensité non placée'].filter(Boolean);
    const aComplexe = contraintes.length >= 4 || (contraintes.length >= 3 && compromis.length)
      ? [`Plan sous contraintes : ${contraintes.length} contraintes combinées (${contraintes.join(', ')}). Le plan est construit, mais ${compromis.length
        ? `il a dû faire des compromis : ${compromis.join(' ; ')}.` : 'il reste peu de marge : le moindre changement peut forcer des compromis.'} Pour un plan plus fidèle à la méthode, relâchez une contrainte (moins de doublés, une longueur maximale plus haute, plus de jours de course ou de volume, moins de compétitions).`] : [];
    return { semaines, court, plafond, avecSL, exces, cycle, aClub, aLimite, aNuit, aCycleC, aComplexe, aCourses: [...aCourses, ...aZones] };
  }

  /* ---------- Rendu ---------- */

  /** Séances d'un jour avec leur moment : un doublé place la séance d'intensité selon state.moment ;
      deux séances de même nature (double seuil, deux footings) restent matin / soir */
  function moments(j) {
    if (j.length < 2) return [['', j[0]]];
    if (j.every(x => x.nom === 'Course')) return j.map((x, m) => [m ? `${m + 1}e course` : '1re course', x]); // plusieurs courses le même jour
    const q =j.filter(x => x.qualite), f = j.filter(x => !x.qualite);
    if (q.length !== 1) return j.map((x, m) => [m ? 'Soir' : 'Matin', x]);
    return { matin: [['Matin', q[0]], ['Soir', f[0]]], soir: [['Matin', f[0]], ['Soir', q[0]]],
      midi: [['Midi', q[0]], ['Matin ou soir', f[0]]], indifferent: [['', q[0]], ['', f[0]]] }[state.moment];
  }

  function contexte() {
    // Allure de référence (preset) : chrono prédit, course en fin de plan ; allure cible placée sur la barre : temps de soutien
    // théorique, sans course. Zone de l'allure cible d'après sa place en % de l'allure 1 h (aussi sans profil).
    const b = window.Balance.contexte(), p = b.profil, zones = E.zones(p || { V: 1, k: -0.06 });
    const pred = p && (b.preset ? E.tablePredictions(p, [b.dist])[0] : { temps: b.tObj, allureMinKm: b.allure }), ok = pred && Number.isFinite(pred.temps);
    const c = { goal: b.goal, label: b.label, nomObj: b.preset ? b.label.toLowerCase() : 'cible', dist: b.dist, heures: b.heures, profil: ok ? p : null,
      course: b.preset, parts: b.parts, tObj: ok ? pred.temps : b.dist / (10000 / 60), // sans profil : 10 km/h
      zoneObj: (zones.find(z => b.pct * 100 < (z.pMax ?? Infinity)) || zones[5]).id };
    if (c.profil) Object.assign(c, { vRef: E.vitesseReference(p), allureObj: pred.allureMinKm, zones: Object.fromEntries(zones.map(z => [z.id, z])) });
    c.volKm = b.volKm; // volume saisi en km (sinon null)
    c.limite = limiteDe(c);
    return c;
  }

  // Règles appliquées par construire() quel que soit le plan (personnalisé ou méthode d'entraîneur), affichées sous le résumé
  const REGLES_COMMUNES = [
    "Cycle : automatique par défaut (charge constante sous 6 semaines, sinon 3 semaines de charge pour 1 de décharge, 2 pour 1 sous 8 semaines ; avec des compétitions, la longueur de charge qui place les décharges sur ou juste après les courses chargées), charge constante (même volume chaque semaine), ou semaines de charge (+ 6 % de volume par semaine) suivies d'une semaine de décharge (70 % du volume, un niveau plus bas, une séance de qualité en moins ; Spécifique LPN : voir ses règles).",
    "Volume saisi : cible par défaut (moyenne des semaines de charge) ; maxi : la semaine la plus chargée, compétitions comprises, vaut ce volume ; mini : la semaine de charge la plus légère vaut ce volume. Tout le cycle est décalé d'autant (marge de 5 min pour les arrondis) ; décharge, affûtage et semaine de l'objectif restent allégés.",
    "Affûtage avant l'objectif : 1 semaine (60 % du volume), 2 pour le semi et le marathon à partir de 10 semaines, 3 pour le marathon avec Pfitzinger à partir de 12 semaines ; aucun sous 6 semaines. La dernière semaine finit par la course.",
    "Compétitions intermédiaires (plan par date) : le TSS de la course (+ 50 % pour une course à fond, impact physiologique maximal) est retranché de la cible du cycle pour sa semaine ; la récupération (25 % de ce TSS la semaine précédente, 50 % puis 25 % les deux suivantes) est prise en partie sur les semaines de décharge ou d'affûtage, déjà allégées ; volume au moins égal à 30 % de la cible.",
    "Engagement dans une compétition : à fond (allure prédite), sans forcer (10 % moins vite), à la cool (20 % moins vite) ou en footing (milieu de la Z2) ; sa durée, son TSS et sa zone sont recalculés, et c'est ce temps en zone qui est déduit de la répartition. Une course en footing ne limite pas les séances de qualité autour d'elle.",
    "Autour d'une compétition : séances de qualité limitées selon sa charge (légère, modérée ou forte), aucune à moins de 3 jours d'une course, pas de doublé la semaine de la course ; la course remplace la sortie longue, ou le dernier jour en Spécifique LPN (s'il y en a plusieurs, les autres remplacent un footing).",
    "Calendrier (plan par date) : les jours sont datés, les courses tombent à leur date, les autres jours sont répartis régulièrement, en évitant la veille d'une course ; la dernière semaine s'arrête à la date de l'objectif."];

  let donnees = null; // dernier plan affiché, lu par export.js
  const brut = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // Alertes classées (bloquant, attention, information) et triées dans cet ordre ; au-delà de 3, les suivantes sont repliées
  const NIVEAUX_ALERTE = [['err', /Incohérence|incompatible|non remplis|ne peuvent pas être raccourcies/], ['info', /tient lieu|servent|Moins de 6 semaines|ne peut pas être effectuée|Renseignez|^Cycle menstruel :|^Travail de nuit :/]];
  const ORDRE_ALERTE = ['err', 'warn', 'info'];
  function listeAlertes(el, liste) {
    const tri = liste.map(a => ({ a, n: (NIVEAUX_ALERTE.find(([, re]) => re.test(a)) || ['warn'])[0] })).sort((x, y) => ORDRE_ALERTE.indexOf(x.n) - ORDRE_ALERTE.indexOf(y.n));
    const li = (x) => `<li class="a-${x.n}">${x.a}</li>`, reste = tri.length - 3;
    el.innerHTML = tri.slice(0, 3).map(li).join('') + (reste > 0
      ? `<li class="a-plus"><details><summary>${reste} autre${reste > 1 ? 's' : ''} alerte${reste > 1 ? 's' : ''}</summary><ul class="alertes">${tri.slice(3).map(li).join('')}</ul></details></li>` : '');
    el.hidden = !liste.length;
  }
  // Icône d'une séance : club, course, qualité, sortie longue, récupération (Z1), footing
  const iconeSeance = (x) => (x.club ? '👥' : x.nom === 'Course' ? '🏁' : x.qualite ? '⚡' : /^(Sortie longue|Footing long)/.test(x.nom) ? '🛣️' : x.zone === 'Z1' ? '💤' : '🏃');
  const zoneChip = (z) => `<span class="zchip" style="--c:var(--${z.toLowerCase()})">${z}</span>`;

  function render() {
    const c = contexte();
    const doc = DOCTRINES.find(d => d.id === state.methode) || ZONES_DOC; // aucune méthode n'est recommandée : Spécifique LPN par défaut
    const zones = doc === ZONES_DOC;

    $('eq-repartition').hidden = !zones; // la répartition par zone ne concerne que Spécifique LPN
    $('pl-contexte').innerHTML = `${c.course ? 'Objectif' : 'Allure travaillée'} <strong>${c.label}</strong>` +
      (c.profil ? ` (<strong>${fA(c.allureObj)}</strong>, ${c.course ? (c.tObj > 300 ? 'chrono prédit au-delà de 5 h, hors du modèle' : `chrono prédit ≈ ${E.formatTemps(c.tObj)}`) : c.tObj >= 299 ? 'tenue plus de 5 h' : `tenue ≈ ${E.formatTemps(c.tObj)}`})` : '') +
      ` · volume ${{ max: 'maxi ', min: 'mini ' }[state.volType] || ''}<strong>${fD(c.heures * 60)}</strong> par semaine.` +
      (c.profil ? '' : ` Sans profil, les allures ne sont pas calculées : <button type="button" class="lien" data-vue="profil">saisir mes chronos</button>.`);

    // Choix de la méthode : liste déroulante (Spécifique LPN en tête, puis les méthodes d'entraîneurs par difficulté croissante)
    // et fiche de la méthode choisie : public, épreuves visées, difficulté, mise en œuvre, durée du plan et prérequis non remplis
    const libelle = (d) => `<span class="lm-nom">${d.titre}${FICHES[d.id].limitee ? ' *' : ''}</span>${ronds(d.difficulte[0])}`;
    $('pl-methodeBtn').innerHTML = libelle(doc);
    $('pl-methodeListe').innerHTML = [ZONES_DOC, ...parDifficulte(DOCTRINES)].map(d => `<li role="option" id="lm-${d.id}" data-m="${d.id}" aria-selected="${d === doc}">${libelle(d)}</li>`).join('');
    const fm = FICHES[doc.id], niv = doc.difficulte[0], lacunes = prerequis(doc, c);
    $('pl-fiche').innerHTML = `<p class="public" style="grid-column:1/-1;margin:0">${fm.public}${fm.limitee ? ' <abbr title="Sources limitées : construit à partir de résumés et de forums, sans le texte de l\'auteur sur les phases et les séances">* sources limitées</abbr>' : ''}</p>`
      + `<span class="ligne-fiche"><span class="sous">🎯 Épreuves visées</span> ${epreuves(doc, c)}</span>`
      + `<span class="ligne-fiche" title="${doc.difficulte[1][0].toUpperCase() + doc.difficulte[1].slice(1)}."><span class="sous">💪 Difficulté athlétique</span> ${ronds(niv)} <strong>${NIVEAUX_METHODE[niveau3(niv) - 1]}</strong></span>`
      + `<span class="ligne-fiche"><span class="sous">🛠️ Mise en œuvre</span> ${MISE[fm.mise]}</span>`
      + `<span class="ligne-fiche"><span class="sous">⏳ Durée du plan</span> ${fm.plan}</span>`
      + (lacunes.length ? `<span class="prerequis" style="grid-column:1/-1">⚠ Prérequis : ${lacunes.join(' ; ')}</span>` : '');

    const { semaines, court, plafond, avecSL, exces, cycle, aClub, aLimite, aNuit, aCycleC, aComplexe, aCourses } = construire(doc, c), hor = horizon();
    const nD = nbDoubles(), total = state.seances + nD;
    const pl = (n, mot) => `<strong>${n}</strong> ${mot}${n > 1 ? 's' : ''}`;
    $('pl-resumeSemaine').innerHTML = `<div class="grand">${total}<small>séance${total > 1 ? 's' : ''} / semaine</small></div><ul>`
      + `<li>${pl(state.seances, 'jour')} de course</li><li>${nD ? pl(nD, 'doublé') : 'Aucun doublé'}</li><li>${pl(7 - state.seances, 'jour')} de repos</li>`
      + `<li>≈ <strong>${fD(c.heures * 60 / total)}</strong> par séance</li></ul>`;
    $('pl-titre').innerHTML = zones ? `${doc.nom} <span class="sous">· optimiser une allure spécifique selon des critères paramétrables</span>` : `Méthode ${doc.nom}`;
    // Notes personnalisées visibles ; explications (résumé, principes, règles communes) repliées
    // (la difficulté détaillée de la méthode, doc.difficulte[1], est dans l'infobulle de la ligne « Difficulté athlétique »)
    $('pl-resume').innerHTML = (doc.avertissement ? `<p class="info-box">${doc.avertissement}</p>` : '') + (doc.noteProfil && doc.noteProfil(c) ? `<p class="note">${doc.noteProfil(c)}</p>` : '') +
      (doc.slNote ? `<p class="note">${doc.slNote(avecSL)}</p>` : '') +
      '<div class="replis">' +
      `<details class="mini"><summary>📖 À propos de ce plan</summary>${BIOS[doc.id] ? `<p class="note bio"><strong>${doc.id === 'norvegien' || doc.id === 'singles' ? 'Origine' : 'L\'entraîneur'} :</strong> ${BIOS[doc.id]}</p>` : ''}<p class="note">${doc.resume}</p></details>` +
      `<details class="mini"><summary>${zones ? '📐 Règles de construction' : '📚 Principes et source'}</summary><ul class="note">${doc.principes.map(p => `<li>${p}</li>`).join('')}</ul>` +
      (zones ? '' : `<p class="note">Source : ${doc.source}</p>`) + '</details>' +
      `<details class="mini"><summary>🧩 Règles communes à tous les plans</summary><ul class="note">${REGLES_COMMUNES.map(p => `<li>${p}</li>`).join('')}</ul></details></div>`;

    const alertes = [];
    if (exces >= 1) alertes.push(`Beaucoup d'intensité pour le nombre de séances de qualité : jusqu'à ${fD(exces)} d'effort par semaine n'ont pas pu être placés (${BLOCS_MAX} blocs par séance au plus). Ajoutez des jours de course ou baissez la part d'intensité.`);
    if (court) alertes.push(`${state.volType === 'max' ? 'Volume maxi incompatible avec' : 'Volume juste pour'} ${total} séances par semaine : les footings sont portés à ${zones ? EF_MIN : EF_MIN_M} min, le volume réel dépasse donc ${volRef()} certaines semaines.${nD ? ' Réduisez le nombre de doublés.' : ''}`);
    if (plafond) alertes.push(`Volume élevé pour ${total} séances par semaine : les footings sont limités à ${doc.footingMax ? `${doc.footingMax} min (durée maximale conseillée par la méthode)` : zones ? 'la durée maximale d\'une séance' : 'la durée de la sortie longue'}, le volume réel reste sous ${volRef()} certaines semaines. ${doc.joursMax ? `La méthode prévoit ${doc.joursMax} jours de course : baissez plutôt le volume hebdomadaire.` : 'Ajoutez des jours de course ou des doublés.'}`);
    const manque = zones ? [] : prerequis(doc, c);
    if (manque.length) alertes.push(`Prérequis de la méthode ${doc.nom} non remplis (${manque.join(' ; ')}) : avec vos données, elle perd une partie de son principe.`);
    if (nD && zones && total < DOUBLES_SEANCES) alertes.push(`Les doublés servent à libérer des jours de repos : ils sont utiles à partir de ${DOUBLES_SEANCES} séances par semaine (${total} ici).`);
    if (nD && !zones && c.heures < DOUBLE_VOLUME_M) alertes.push(`Les doublés servent surtout à absorber un gros volume : sous ≈ ${DOUBLE_VOLUME_M} h par semaine, des séances simples un peu plus longues apportent autant, avec plus de récupération.`);
    if ((!zones || state.horizon === 'date') && hor.W < 6 && !doc.sansAffutage) alertes.push(state.horizon === 'date' ? "Moins de 6 semaines avant l'objectif : pas d'affûtage, la course finale arrive sans semaine allégée." : "Moins de 6 semaines : pas d'affûtage, le plan sert plutôt de bloc d'entraînement.");
    if (hor.invalide) alertes.push(`Renseignez le début du plan et la date de l'objectif (après le début) : en attendant, le plan fait ${state.semaines} semaines.`);
    if (hor.brut < 4) alertes.push("Moins de 4 semaines entre le début du plan et l'objectif : le plan est porté à 4 semaines et dépasse la date de l'objectif.");
    if (hor.brut > SEMAINES_MAX) alertes.push(`Plus de ${SEMAINES_MAX} semaines avant l'objectif : le plan est limité à ${SEMAINES_MAX} semaines, avancez la date de début.`);
    if (c.profil && c.course && c.tObj > 300) alertes.push(`Objectif hors du modèle : le chrono prédit sur ${c.label.toLowerCase()} dépasse 5 h, durée au-delà de laquelle l'indice d'endurance n'est plus valable. Les allures de course du plan sont indicatives : envisagez la course-marche (méthode Galloway) ou un objectif plus court.`);
    aLimite.forEach(a => alertes.push(a));
    aClub.forEach(a => alertes.push(a));
    aCourses.forEach(a => alertes.push(a));
    const aCycle = alertesCycle(); // cycle menstruel : l'alerte santé figure aussi dans les alertes du plan
    aCycle.filter(a => /^Santé/.test(a)).forEach(a => alertes.push(a));
    aCycleC.forEach(a => alertes.push(a));
    aNuit.forEach(a => alertes.push(a));
    aComplexe.forEach(a => alertes.push(a));
    listeAlertes($('pl-alertes'), alertes);
    const rapport = [...aComplexe, ...rapportSemaine(c), ...aLimite, ...aClub, ...aCycle, ...aCycleC, ...aNuit];
    // Difficulté (LPN) : sous le volume minimal de l'objectif (RAPPORT), le temps de qualité est trop court pour que la longueur des
    // séries et des récupérations varie vraiment
    $('pl-diffVolume').hidden = !(zones && c.heures < RAPPORT[c.goal].h);
    if (document.activeElement !== $('pl-limite')) $('pl-limite').value = state.limite ?? ''; // pas pendant la frappe
    document.querySelectorAll('#pl-limiteU button').forEach(b => b.classList.toggle('actif', b.dataset.u === state.limiteU));
    $('pl-clubNote').hidden = !clubsActifs().length;
    const R = state.regles;
    $('pl-reglesActif').checked = R.actif; $('pl-reglesBloc').hidden = !R.actif;
    $('pl-reglesDebut').value = R.debut; if (document.activeElement !== $('pl-reglesDuree')) $('pl-reglesDuree').value = R.duree;
    $('pl-reglesHormonale').checked = R.hormonale; $('pl-reglesIrregulier').checked = R.irregulier;
    $('pl-reglesSensRegles').checked = R.sensRegles; $('pl-reglesSensAvant').checked = R.sensAvant;
    const NT = state.nuit;
    $('pl-nuitActif').checked = NT.actif; $('pl-nuitBloc').hidden = !NT.actif;
    document.querySelectorAll('#pl-nuitMode [data-nmode]').forEach(b => { b.classList.toggle('actif', b.dataset.nmode === NT.mode); b.setAttribute('aria-pressed', b.dataset.nmode === NT.mode); });
    $('pl-nuitFixe').hidden = NT.mode !== 'fixe'; $('pl-nuitTournant').hidden = NT.mode !== 'tournant';
    document.querySelectorAll('#pl-nuitSoirs input').forEach(i => { i.checked = NT.soirs[+i.dataset.k]; });
    $('pl-nuitDebut').value = NT.debut;
    if (document.activeElement !== $('pl-nuitNuits')) $('pl-nuitNuits').value = NT.nuits;
    if (document.activeElement !== $('pl-nuitRepos')) $('pl-nuitRepos').value = NT.repos;
    $('pl-volMax').checked = state.volType === 'max';
    $('pl-volMin').checked = state.volType === 'min';
    $('pl-club1').checked = state.club1;
    $('pl-club2').checked = state.club2;
    listeAlertes($('pl-alerteSemaine'), rapport);

    // Récapitulatif : séances, temps, distance (avec profil) et travail de qualité, par semaine et sur tout le plan
    const somme = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
    const recap = semaines.map(w => ({ n: w.seances.length, jours: w.jours.length, temps: somme(w.seances, x => x.duree),
      km: c.profil ? somme(w.seances, x => x.km) : null, qualite: somme(w.seances, x => x.travail) }));
    const tot = { n: somme(recap, r => r.n), temps: somme(recap, r => r.temps), km: c.profil ? somme(recap, r => r.km) : null, qualite: somme(recap, r => r.qualite) };
    const fKm1 = (x) => `≈ ${(Math.round(x * 10) / 10).toLocaleString('fr-FR')} km`; // distance d'une séance, estimée
    // Bloc de date de l'agenda : numéro et jour de la semaine (« Jour 1 » en l'absence de date)
    // Cycle menstruel (plan par date) : pastille de phase sous la date, cerclée les jours sensibles
    const cyc = suiviCycle();
    $('pl-legendeCycle').hidden = !cyc;
    const pastilleCycle = (t) => {
      if (!cyc) return '';
      const p = phaseDu(t, cyc);
      return `<i class="cyc ${p.phase}${p.sensible ? ' sensible' : ''}" title="Cycle : J${p.j}, ${PHASES[p.phase]}${p.sensible ? ' (jour sensible : qualité évitée si possible)' : ''}"></i>`;
    };
    // Travail de nuit (Spécifique LPN, plan par date) : 🌃 nuit travaillée le soir, 🛌 sortie de nuit (lendemain matin)
    const nuitR = zones ? suiviNuit() : null;
    $('pl-legendeNuit').hidden = !nuitR;
    const pastilleNuit = (t) => {
      if (!nuitR) return '';
      const n = jourNuit(t, nuitR);
      return (n.sortie ? '<i class="nuit" title="Sortie de nuit : dette de sommeil, qualité et sortie longue évitées si possible">🛌</i>' : '')
        + (n.nuit ? '<i class="nuit" title="Nuit de travail ce soir">🌃</i>' : '');
    };
    const blocDate = (w, k) => (w.dates
      ? `<div class="date"><b>${new Date(w.dates[k]).getUTCDate()}</b><span>${new Date(w.dates[k]).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' })}</span>${pastilleCycle(w.dates[k])}${pastilleNuit(w.dates[k])}</div>`
      : `<div class="date"><b>${k + 1}</b><span>Jour</span></div>`);
    const W = semaines.length, fKm = (x) => `${Math.round(x)} km`, totaux = recap.map(r => r.temps), max = Math.max(...totaux);
    const tuile = (ico, label, valeur, sous) => `<div class="chiffre"><div class="label"><span aria-hidden="true">${ico}</span> ${label}</div><div class="valeur">${valeur}</div><div class="sous">${sous}</div></div>`;
    $('pl-chiffres').innerHTML = [
      tuile('🗓️', 'Séances', String(tot.n), `${(tot.n / W).toFixed(1).replace('.', ',')} par semaine, sur ${state.seances} jours`),
      tuile('⏱️', 'Temps de course', fD(tot.temps), `${fD(tot.temps / W)} par semaine (${{ max: 'maxi', min: 'mini' }[state.volType] || 'réf.'} ${fD(c.heures * 60)})`),
      tuile('📏', 'Distance', tot.km === null ? '—' : `≈ ${fKm(tot.km)}`, tot.km === null ? 'profil nécessaire' : `≈ ${fKm(tot.km / W)} par semaine`),
      tuile('⚡', 'Qualité', fD(tot.qualite), `${Math.round(100 * tot.qualite / tot.temps)} % du temps, récupérations comprises`)
    ].join('');
    const cls = (w) => (w.courses ? 'competition' : ({ Charge: 'charge', 'Décharge': 'decharge', 'Affûtage': 'affutage' })[w.type]);
    const etiq = (w) => `${w.type}${w.phase === w.type ? '' : ` · ${w.phase}`}${w.etiquette ? ` · ${w.etiquette}` : ''}`;
    // Infobulle de l'histogramme : temps, charge (TSS = durée (h) × IF² × 100 par zone, IF de balance.js) et temps par zone
    const ZIDS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'], iff = window.Balance.zones().map(z => z.iff);
    const infobulle = (w, i) => {
      const p = ajoute(...w.seances.map(x => x.parts)), tss = ZIDS.reduce((a, z, k) => a + (p[z] || 0) / 60 * iff[k] ** 2 * 100, 0);
      return `Semaine ${i + 1} · ${etiq(w)}\nTemps ${fD(totaux[i])} · TSS ${Math.round(tss + (w.surplus || 0))}${w.surplus ? ` (dont +${Math.round(w.surplus)} de compétition à fond)` : ''}\n${ZIDS.filter(z => (p[z] || 0) >= 0.5).map(z => `${z} : ${fD(p[z])}`).join(' · ')}`;
    };
    $('pl-volumes').innerHTML = semaines.map((w, i) => `<div class="${cls(w)}" style="height:${(totaux[i] / max * 100).toFixed(1)}%" title="${infobulle(w, i)}"><span>${i + 1}</span></div>`).join('');
    $('pl-recapTete').innerHTML = `<tr><th>Sem.</th><th>Type · phase</th><th class="num">Séances</th><th class="num">Temps</th>${c.profil ? '<th class="num">Distance</th>' : ''}<th class="num">Qualité</th></tr>`;
    $('pl-recap').innerHTML = semaines.map((w, i) => `<tr><td>${i + 1}</td><td>${etiq(w)}</td>
      <td class="num">${recap[i].n}${recap[i].n > recap[i].jours ? ` <span class="sous">(${recap[i].jours} j)</span>` : ''}</td><td class="num">${fD(recap[i].temps)}</td>
      ${c.profil ? `<td class="num">≈ ${fKm(recap[i].km)}</td>` : ''}<td class="num">${fD(recap[i].qualite)}</td></tr>`).join('');
    $('pl-recapTotal').innerHTML = `<tr><td>Total</td><td></td><td class="num">${tot.n}</td><td class="num">${fD(tot.temps)}</td>${c.profil ? `<td class="num">≈ ${fKm(tot.km)}</td>` : ''}<td class="num">${fD(tot.qualite)}</td></tr>`;

    const ouverts = [...document.querySelectorAll('#pl-liste details')].map(d => d.open);
    $('pl-liste').innerHTML = semaines.map((w, i) => {
      const r = recap[i];
      return `<details class="semaine ${cls(w)}"${(ouverts.length ? ouverts[i] : i === 0) ? ' open' : ''}>
        <summary><span class="s-titre">Semaine ${i + 1}</span>${w.debut ? ` <span class="sous">${fDate(w.debut)} – ${fDate(w.fin)}</span>` : ''} <span class="badge ${cls(w)}">${etiq(w)}</span>
          <span class="chips"><span title="Séances">🗓️ ${r.n}</span><span title="Temps de course">⏱️ ${fD(r.temps)}</span>${r.km === null ? '' : `<span title="Distance estimée">📏 ≈ ${fKm(r.km)}</span>`}<span title="Travail de qualité, récupérations comprises">⚡ ${r.qualite ? fD(r.qualite) : '—'}</span><span title="Niveau de difficulté">📶 ${Math.round(w.niveau)}/10</span>${(w.notes || []).length ? `<span title="Notes sur cette semaine">📝 ${w.notes.length}</span>` : ''}</span></summary>
        ${(w.notes || []).map(n => `<p class="note-sem">${n}</p>`).join('')}
        <ol class="seances">${w.jours.map((j, k) => `<li style="--c:var(--${j[0].zone.toLowerCase()})">${blocDate(w, k)}<div class="corps">` +
          (j.length > 1 ? `<span class="jour">${j.every(x => x.nom === 'Course') ? `${j.length} courses le même jour` : `Doublé${moments(j)[0][0] ? '' : ', ordre au choix'}`}</span>` : '') +
          moments(j).map(([m, x]) => `<div class="seance"><div><span class="s-ico" aria-hidden="true">${iconeSeance(x)}</span><strong>${m ? `${m} : ` : ''}${x.nom}</strong> ${zoneChip(x.zone)}<div class="sous">${x.texte}</div></div><div class="droite">${x.km === null ? '' : `<b>${fKm1(x.km)}</b>`}<div class="sous">${fD(x.duree)}</div></div></div>`).join('') + '</div></li>').join('')}</ol></details>`;
    }).join('');

    const premiere = semaines[0].seances.find(x => x.qualite);
    $('pl-diffLbl').textContent = `${state.difficulte}/10`;
    $('pl-diffNote').innerHTML = premiere ? `Première semaine, ${premiere.nom.toLowerCase()} : ${premiere.texte}` : 'Première semaine : footings et lignes droites (phase de fondation).';
    $('pl-cycleNb').hidden = state.cycle !== 'cycle';
    $('pl-cycleAuto').hidden = state.cycle !== 'auto' && !cycle.imposee;
    $('pl-cycleAuto').textContent = cycle.imposee ? 'Cette méthode impose une charge constante, sans semaine de décharge.'
      : `Cycle retenu : ${cycle.type === 'cycle' ? `${cycle.charge} semaine${cycle.charge > 1 ? 's' : ''} de charge puis ${cycle.decharge} de décharge` : 'charge constante'} (${cycle.raison}).`;

    // Durée du plan : nombre de semaines, ou dates (début du plan, objectif) avec les compétitions intermédiaires
    const parDate = state.horizon === 'date';
    document.querySelectorAll('#pl-horizon [data-hor]').forEach(b => {
      b.classList.toggle('actif', b.dataset.hor === state.horizon);
      b.setAttribute('aria-pressed', b.dataset.hor === state.horizon);
    });
    $('pl-hDate').hidden = !parDate;
    $('pl-labSemaines').hidden = parDate;
    $('pl-hResume').textContent = !parDate ? '' : hor.invalide ? "Renseignez le début du plan et la date de l'objectif (après le début)."
      : `Du ${fDate(hor.d0, true)} au ${fDate(hor.d1, true)} : ${hor.W} semaine${hor.W > 1 ? 's' : ''}${c.course ? `, objectif ${c.label}` : ''}.`;
    $('pl-courses').innerHTML = state.courses.map((x, i) => {
      const tss = x.d > 0 && tssCourse(c, x.d, x.effort), n = tss && niveauTss(tss), cx = x.d > 0 && contexteCourse(c, x.d, x.effort);
      const detail = cx && cx.profil ? `≈ ${E.formatTemps(cx.tObj)} (${fA(cx.allureObj)}, ${cx.zoneObj}), ` : '';
      return `<div class="ligne-course${x.perso && !(x.d > 0) ? ' invalide' : ''}" data-i="${i}">
        <input type="date" value="${x.date}" aria-label="Date de la compétition">
        <div class="rang"><select class="epreuve" aria-label="Épreuve">${COURSES.map(([d, nom]) => `<option value="${d}"${!x.perso && d === x.d ? ' selected' : ''}>${nom}</option>`).join('')}<option value="perso"${x.perso ? ' selected' : ''}>Autre distance…</option></select>
        ${x.perso ? `<input class="dist" value="${x.txt || ''}" placeholder="ex. 8 km ou 12000" aria-label="Distance de la compétition" autocomplete="off">` : ''}</div>
        <select class="effort" aria-label="Engagement dans la course">${Object.entries(ENGAGEMENTS).map(([k, e]) => `<option value="${k}"${engagement(x) === e ? ' selected' : ''}>${e.nom}</option>`).join('')}</select>
        <button type="button" class="suppr" aria-label="Supprimer cette compétition">✕</button>
        ${n ? `<span class="conv">${nomCompet(x)} : ${detail}TSS ≈ ${Math.round(tss)}${engagement(x) === ENGAGEMENTS.fond ? ` + ${Math.round(SURPLUS_FOND * tss)} (à fond, + 50 %)` : ''}, ${x.effort === 'footing' ? 'compte comme un footing : seul son TSS est retranché, sans limite de séances de qualité' : `charge ${n.nom} (${n.resume})`}.</span>` : ''}</div>`;
    }).join('');
    $('pl-momentBloc').hidden = !nbDoubles();

    // Colonne « Plan / sem. » du tableau de répartition (balance.js) : temps moyen par semaine dans chaque zone
    const parts = ajoute(...semaines.flatMap(w => w.seances.map(x => x.parts))), totP = Object.values(parts).reduce((a, x) => a + x, 0);
    const tempsZ = (m) => (m / W < 0.5 ? '—' : fD(Math.round(m / W)));
    ZIDS.forEach((z, i) => { const td = $(`eq-plan${i}`); if (td) td.textContent = `${tempsZ(parts[z] || 0)} · ${Math.round(100 * (parts[z] || 0) / totP)} %`; });
    if ($('eq-planTot')) $('eq-planTot').textContent = tempsZ(totP);

    // Données des exports (export.js) : textes sans balises, étapes structurées pour les montres
    donnees = { titre: zones ? doc.titre : `Méthode ${doc.nom}`, mode: zones ? 'zones' : 'methode', methode: zones ? null : doc.id,
      contexte: { allure: c.label, allureMinKm: c.profil ? c.allureObj : null, tempsMin: c.profil ? c.tObj : null, volumeH: c.heures, typeVolume: state.volType, jours: state.seances,
        doubles: nD, semaines: W, cycle: nomCycle(cycle), difficulte: state.difficulte, limite: c.limite ? c.limite.txt : null },
      repartition: ZIDS.map((z, i) => ({ zone: z, cible: Math.round(1000 * c.parts[i]) / 10, plan: Math.round(1000 * (parts[z] || 0) / totP) / 10 })),
      semaines: semaines.map((w, i) => ({ numero: i + 1, type: w.type, phase: w.phase, debut: w.debut ? new Date(w.debut).toISOString().slice(0, 10) : null, fin: w.fin ? new Date(w.fin).toISOString().slice(0, 10) : null, notes: (w.notes || []).slice(), niveau: Math.round(w.niveau), tempsMin: Math.round(recap[i].temps), km: recap[i].km,
        jours: w.jours.map((j, k) => ({ jour: k + 1, date: w.dates ? new Date(w.dates[k]).toISOString().slice(0, 10) : null, ...(cyc && w.dates ? { cycle: { jour: phaseDu(w.dates[k], cyc).j, phase: PHASES[phaseDu(w.dates[k], cyc).phase] } } : {}), ...(nuitR && w.dates ? { travailNuit: { nuitLeSoir: jourNuit(w.dates[k], nuitR).nuit, sortieDeNuit: jourNuit(w.dates[k], nuitR).sortie } } : {}), seances: moments(j).map(([m, x]) => ({ moment: m, nom: x.nom, zone: x.zone, dureeMin: Math.round(x.duree),
          km: x.km === null ? null : Math.round(x.km * 10) / 10, description: brut(x.texte), etapes: x.etapes })) })) })) };
    save();
  }

  /** Doublés possibles : autant que de jours de course, 6 au plus ; la liste suit le nombre de jours */
  function optionsDoubles() {
    const max = Math.min(6, state.seances), sel = $('pl-doubles');
    state.doubles = Math.min(state.doubles, max);
    if (sel.options.length !== max + 1) sel.innerHTML = Array.from({ length: max + 1 }, (_, n) => `<option value="${n}">${n ? `${n} jour${n > 1 ? 's' : ''}` : 'Aucun'}</option>`).join('');
    sel.value = state.doubles;
  }

  // Initialisation des contrôles
  $('pl-seances').innerHTML = [3, 4, 5, 6, 7].map(n => `<option value="${n}">${n}</option>`).join('');
  const champs = { seances: [3, 7], doubles: [0, 6], semaines: [4, 24], charge: [1, 6], decharge: [1, 2], difficulte: [1, 10] };
  for (const [cle, [a, b]] of Object.entries(champs)) {
    $(`pl-${cle}`).value = state[cle];
    $(`pl-${cle}`).addEventListener('input', e => { const v = Math.round(+e.target.value); if (v >= a && v <= b) { state[cle] = v; optionsDoubles(); render(); } });
  }
  optionsDoubles();
  $('pl-debut').value = state.debut;
  $('pl-fin').value = state.fin;
  $('pl-debut').addEventListener('change', e => { state.debut = e.target.value; render(); });
  $('pl-fin').addEventListener('change', e => { state.fin = e.target.value; render(); });
  $('pl-horizon').addEventListener('click', e => {
    const b = e.target.closest('[data-hor]');
    if (!b) return;
    state.horizon = b.dataset.hor;
    if (state.horizon === 'date' && !state.debut) { state.debut = new Date().toISOString().slice(0, 10); $('pl-debut').value = state.debut; } // par défaut : aujourd'hui
    render();
  });
  $('pl-addCourse').addEventListener('click', () => { state.courses.push({ date: '', d: 10000, perso: false, txt: '', effort: 'fond' }); render(); });
  $('pl-courses').addEventListener('change', e => {
    const ligne = e.target.closest('[data-i]'), x = ligne && state.courses[+ligne.dataset.i];
    if (!x) return;
    const v = e.target.value;
    if (e.target.type === 'date') x.date = v;
    else if (e.target.classList.contains('effort')) x.effort = v; // engagement : à fond, sans forcer, à la cool, en footing
    else if (e.target.tagName === 'SELECT') { x.perso = v === 'perso'; x.d = x.perso ? (E.parseDistance(x.txt) > 0 ? E.parseDistance(x.txt) : null) : +v; }
    else { x.txt = v; x.d = E.parseDistance(v) > 0 ? E.parseDistance(v) : null; } // distance personnalisée (5000, 8 km, semi…)
    render();
  });
  $('pl-courses').addEventListener('click', e => {
    const b = e.target.closest('.suppr');
    if (b) { state.courses.splice(+b.closest('[data-i]').dataset.i, 1); render(); }
  });
  ['club1', 'club2'].forEach(k => $(`pl-${k}`).addEventListener('change', e => { state[k] = e.target.checked; render(); }));
  // Cycle menstruel : cases et champs de l'étape 2 (state.regles)
  [['actif', 'pl-reglesActif'], ['hormonale', 'pl-reglesHormonale'], ['irregulier', 'pl-reglesIrregulier'], ['sensRegles', 'pl-reglesSensRegles'], ['sensAvant', 'pl-reglesSensAvant']]
    .forEach(([k, id]) => $(id).addEventListener('change', e => { state.regles[k] = e.target.checked; render(); }));
  $('pl-reglesDebut').addEventListener('change', e => { state.regles.debut = e.target.value; render(); });
  $('pl-reglesDuree').addEventListener('change', e => { const v = Math.round(+e.target.value); if (v >= 15 && v <= 60) state.regles.duree = v; render(); });
  // Travail de nuit : cases et champs de l'étape 2 (state.nuit)
  $('pl-nuitActif').addEventListener('change', e => { state.nuit.actif = e.target.checked; render(); });
  $('pl-nuitMode').addEventListener('click', e => { const b = e.target.closest('[data-nmode]'); if (b) { state.nuit.mode = b.dataset.nmode; render(); } });
  $('pl-nuitSoirs').addEventListener('change', e => { const k = +e.target.dataset.k; if (k >= 0) { state.nuit.soirs[k] = e.target.checked; render(); } });
  $('pl-nuitDebut').addEventListener('change', e => { state.nuit.debut = e.target.value; render(); });
  [['nuits', 'pl-nuitNuits', 7], ['repos', 'pl-nuitRepos', 14]].forEach(([k, id, max]) => $(id).addEventListener('change', e => {
    const v = Math.round(+e.target.value); if (v >= 1 && v <= max) state.nuit[k] = v; render(); }));
  // Volume maxi / mini : cases exclusives (aucune cochée : volume cible)
  [['max', 'pl-volMax'], ['min', 'pl-volMin']].forEach(([t, id]) => $(id).addEventListener('change', e => { state.volType = e.target.checked ? t : 'cible'; render(); }));
  // Longueur maximale d'une séance : valeur facultative (vide = aucune) entre les bornes de l'unité ; changer d'unité convertit la valeur (allure moyenne de Z2)
  const bornerLimite = () => {
    const [a, b] = bornesLimite(contexte());
    if (state.limite !== null) state.limite = Math.min(b, Math.max(a, Math.round(state.limite * 10) / 10));
    $('pl-limite').min = a; $('pl-limite').max = b; $('pl-limite').step = state.limiteU === 'km' ? 0.5 : 5;
  };
  bornerLimite();
  $('pl-limite').addEventListener('input', e => {
    const v = parseFloat(e.target.value.replace(',', '.')), [a, b] = bornesLimite(contexte());
    if (e.target.value === '') { state.limite = null; render(); } else if (v >= a && v <= b) { state.limite = v; render(); }
  });
  $('pl-limite').addEventListener('change', () => { // hors bornes : ramené à la borne la plus proche à la sortie du champ
    const v = parseFloat($('pl-limite').value.replace(',', '.'));
    state.limite = Number.isFinite(v) ? v : null;
    bornerLimite();
    render();
    $('pl-limite').value = state.limite ?? '';
  });
  $('pl-limiteU').addEventListener('click', e => {
    const b = e.target.closest('[data-u]');
    if (!b || b.dataset.u === state.limiteU) return;
    const c = contexte(), allure = c.profil ? aZ(c, 'Z2') : 6; // min/km de conversion (Z2, ou 6 sans profil)
    if (state.limite !== null) state.limite = b.dataset.u === 'km' ? state.limite / allure : Math.round(state.limite * allure / 5) * 5;
    state.limiteU = b.dataset.u;
    bornerLimite();
    render();
  });
  $('pl-moment').value = state.moment;
  $('pl-moment').addEventListener('change', e => { state.moment = e.target.value; render(); });
  $('pl-cycle').value = state.cycle;
  $('pl-cycle').addEventListener('change', e => { state.cycle = e.target.value; render(); });
  // Liste déroulante des méthodes (listbox accessible : flèches, Entrée, Échap) ; les ronds de difficulté sont à droite de chaque ligne
  const btn = $('pl-methodeBtn'), liste = $('pl-methodeListe');
  const activer = (li) => { liste.querySelectorAll('li.actif').forEach(x => x.classList.remove('actif')); if (li) { li.classList.add('actif'); btn.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } };
  const ouvrir = (o) => { liste.hidden = !o; btn.setAttribute('aria-expanded', o); if (o) activer(liste.querySelector('[aria-selected="true"]')); };
  const choisir = (li) => { ouvrir(false); if (li && li.dataset.m !== state.methode) { state.methode = li.dataset.m; render(); } btn.focus(); };
  btn.addEventListener('click', () => ouvrir(liste.hidden));
  liste.addEventListener('click', e => choisir(e.target.closest('li')));
  liste.addEventListener('mousemove', e => { const li = e.target.closest('li'); if (li && !li.classList.contains('actif')) activer(li); });
  btn.addEventListener('keydown', e => {
    const items = [...liste.querySelectorAll('li')], cur = liste.querySelector('li.actif') || liste.querySelector('[aria-selected="true"]'), i = items.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (liste.hidden) ouvrir(true); else activer(items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]); }
    else if ((e.key === 'Enter' || e.key === ' ') && !liste.hidden) { e.preventDefault(); choisir(cur); }
    else if (e.key === 'Escape') ouvrir(false);
  });
  btn.addEventListener('keyup', e => { if (e.key === ' ') e.preventDefault(); });
  document.addEventListener('click', e => { if (!e.target.closest('.lm')) ouvrir(false); });
  document.addEventListener('balance', render); // nouveau profil, allure cible, volume ou répartition dans Balance

  // Sources des méthodes (bas de page, « Sources et études ») : tirées de la fiche de chaque méthode, par ordre alphabétique
  // (le bas de page suit les scripts dans la page : rempli une fois le document chargé)
  const remplirSources = () => { if ($('sources-methodes')) $('sources-methodes').innerHTML = DOCTRINES.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(d => `<li><strong>${d.titre}</strong>${FICHES[d.id].limitee ? ' (sources limitées)' : ''} : ${d.source}</li>`).join(''); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', remplirSources); else remplirSources();

  window.Plan = { donnees: () => donnees };
  render();
})();
