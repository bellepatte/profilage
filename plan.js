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

  const ECHAUFFEMENT = 20, RETOUR = 10, EF_LEGER = 30; // min : autour d'une séance de qualité ; footing avant les lignes droites
  const PROGRESSION = 3; // niveaux de difficulté gagnés entre la première et la dernière semaine avant l'affûtage
  const CHARGE_PAS = 0.06, DECHARGE = 0.7; // volume : +6 % par semaine de charge d'un bloc ; 70 % en semaine de décharge
  const SL_PART = 0.28, SL_MAX = 150, EF_MIN = 30; // sortie longue : part du volume hebdomadaire et plafond (min) ; footing minimal
  const DOUBLE_PART = 0.6, DOUBLE_BORNES = [20, 45], DOUBLE_VOLUME = 7; // 2e séance d'un doublé : part d'un footing, bornes (min) ; volume (h) en dessous duquel les doublés servent peu
  // Allure spécifique (allure de l'objectif) : durée d'une fraction et volume total, en part du temps de course prédit
  const SPE = { '5k': { rep: [0.1, 0.25], tot: [0.6, 1.2] }, '10k': { rep: [0.08, 0.2], tot: [0.4, 0.8] },
    semi: { rep: [0.06, 0.15], tot: [0.35, 0.7] }, marathon: { rep: [0.04, 0.1], tot: [0.15, 0.35] } };
  // mode : 'zones' (plan construit sur la répartition de Balance) ou 'methode' (méthode d'un entraîneur)
  const state = { mode: 'zones', seances: 4, doubles: 0, moment: 'indifferent', semaines: 4, horizon: 'semaines', debut: '', fin: '', courses: [], cycle: 'cycle', charge: 3, decharge: 1, difficulte: 4, methode: null, tri: 'difficulte', triDesc: false };

  try {
    const s = JSON.parse(localStorage.getItem('plan') || '{}');
    for (const c of Object.keys(state)) if (c in s) state[c] = s[c];
  } catch (e) { /* stockage indisponible */ }
  if (state.mode !== 'methode') state.mode = 'zones';
  state.triDesc = state.triDesc === true;
  if (state.horizon !== 'date') state.horizon = 'semaines';
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
    // Heubi : endurance active à 80 – 85 % de VMA, placée selon l'indice d'endurance (85 % pour une bonne endurance)
    ema: { nom: c => `${emaPct(c)} % de VMA (endurance active, selon votre indice d'endurance)`, min: c => pv(emaPct(c) - 1, emaPct(c) + 1)(c) },
    // McMillan : allures des courses de 1 h 15 à 2 h 30 (steady), 40 min à 1 h 15 (tempo), 25 à 45 min (cruise), 1500 m à 5 km (speed)
    mcSteady: { nom: 'allure semi – marathon (steady state)', min: c => [allureDist(c, 42195), allureDist(c, 21097)] },
    mcTempo: { nom: 'allure de course de 40 min à 1 h 15 (tempo)', min: c => [allureT(c, 75), allureT(c, 40)] },
    mcCruise: { nom: 'allure de course de 25 à 45 min (cruise)', min: c => [allureT(c, 45), allureT(c, 25)] },
    mcSpeed: { nom: 'allure 1500 m – 5 km (speed)', min: c => [allureDist(c, 5000), allureDist(c, 1500)] },
    // Tinman : vitesse critique ≈ allure tenue environ 30 min ; allure 1 mile pour les fractions courtes de fin de séance
    cv: { nom: 'vitesse critique (≈ allure tenue 30 à 40 min)', min: c => [allureT(c, 40), allureT(c, 30)] },
    mile: { nom: 'allure 1 mile', min: c => allureDist(c, 1609) },
    deuxMiles: { nom: 'allure 2 miles (≈ 3200 m), relâché', min: c => allureDist(c, 3219) },
    // Galloway : sortie longue à l'allure marathon + 2 min par mile (≈ + 1 min 15 /km)
    galSL: { nom: 'allure de sortie longue Galloway (marathon + 2 min par mile)', min: c => allureGalloway(c) },
    // Norwegian Singles (sirpoc) : fractions sous le seuil à allure 15 km (courtes), semi (moyennes) et 30 km (longues)
    a15: { nom: 'allure 15 km', min: c => allureDist(c, 15000) },
    aSemi: { nom: 'allure semi-marathon', min: c => allureDist(c, 21097) },
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
  // 8 niveaux), récupération de 1 min ; court : répétitions de 3 – 4 min, moyen : 6 – 8 min, long : 9 – 12 min
  const nsFractions = (c, l, s, rep, cle) => {
    const W = borne(lerp(18, 40, l) * s, 18, 40), r = arrondi(lerp(rep[0], rep[1], l)), n = Math.max(2, Math.round(W / r));
    return fractions(c, { r, n, rc: 1, travail: n * r + (n - 1) }, cle, 'en trottinant ou à l\'arrêt');
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
    INTERVALLES_LONGS: { nom: 'Intervalles longs', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [4, 8], [16, 32], [0.5, 0.25]), 'k10', 'en trottinant') },
    // Daniels : cruise intervals de 5 à 15 min, 1 min de récupération pour 5 min d'effort
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
      return fractions(c, series(l, s, m ? [15, 15] : [10, 12], m ? [30, 45] : [20, 30], m ? [0.47, 0.33] : [0.5, 0.4]), 'rDouce', 'en trottinant très lentement');
    } },
    COT_DURE: { nom: 'Résistance dure', zone: 'Z5',
      conseil: "Échauffement conseillé par Cottereau : 15 min d'endurance, 2 à 3 min de marche, 5 min de résistance douce, 1 à 2 min de marche, 6 à 7 lignes droites progressives d'environ 20 s. À la fin, vous devez pouvoir refaire autant de répétitions à la même vitesse.",
      gen: (l, s, c) => fractions(c, series(l, s, [3, 4], [9, 16], [1, 1]), 'rDure', 'en trottinant très lentement') },
    // Norwegian Singles (sirpoc) : trois séances sous le seuil par semaine (court, moyen, long), sans VO2max
    NS_COURT: { nom: 'Sous-seuil court', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [3, 4], 'a15') },
    NS_MOYEN: { nom: 'Sous-seuil moyen', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [6, 8], 'aSemi') },
    NS_LONG: { nom: 'Sous-seuil long', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [9, 12], 'a30') },
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
    GAL_RYTHME: { nom: "Allure de l'objectif", zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [3, 6], [12, 24], [0.6, 0.4], 2), 'obj', 'en marchant') },
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
    TEMPO_OBJ: { nom: 'Tempo à allure objectif', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(90, lerp(0.2, 0.45, l) * tRef(c) * s), 'obj') },
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
    return enveloppe(c, id, nom, zone, r, S);
  }
  /** Séance de qualité complète : échauffement, corps de séance r ({ travail, effort, km, texte, etapes, parts }), retour au calme.
      effort : temps à l'allure de la séance, sans les récupérations (plafonds de Daniels) ; parts : minutes par zone, les
      récupérations comptent en Z1, l'effort dans la zone de la séance (sauf si r.parts le détaille) ; etapes : pour les montres */
  function enveloppe(c, id, nom, zone, r, S = {}) {
    const effort = r.effort ?? r.travail;
    return { id, nom, zone, qualite: true, travail: r.travail, effort, duree: arr5(ECHAUFFEMENT + RETOUR + r.travail),
      km: c.profil ? (ECHAUFFEMENT + RETOUR) / aZ(c, 'Z2') + r.km : null,
      parts: ajoute({ Z2: ECHAUFFEMENT, Z1: RETOUR }, r.parts || { Z1: r.travail - effort, [zone]: effort }),
      etapes: [{ t: 'echauffement', duree: ECHAUFFEMENT, allure: plageZ(c, 'Z2') }, ...(r.etapes || [{ t: 'effort', duree: r.travail, nom }]),
        { t: 'retour', duree: RETOUR, allure: plageZ(c, 'Z1') }],
      texte: `Échauffement ${ECHAUFFEMENT} min en Z2 · ${r.texte} · retour au calme ${RETOUR} min en Z1.${S.alerte ? ` <strong class="doute">${S.alerte}</strong>` : ''}${S.conseil ? ` <em>${S.conseil}</em>` : ''}` };
  }
  // Footing suivi de lignes droites (séance légère) : le quart du temps des lignes droites compte en Z6
  const avecFooting = (x, d, c) => ({ ...x, duree: arr5(d + x.extra), km: c.profil ? (d + x.extra) / aZ(c, 'Z2') : null,
    parts: { Z2: d + x.extra * 0.75, Z6: x.extra * 0.25 },
    etapes: [{ t: 'footing', duree: d, allure: plageZ(c, 'Z2') }, { t: 'effort', duree: x.extra, nom: 'Lignes droites' }],
    texte: `Footing ${fD(d)} en ${zt(c, 'Z2')}, puis ${x.lignes}.` });
  // SL_SPE : fin de sortie à l'allure de l'objectif (semi, marathon) ; SL_FIN : « fast finish » de 10 à 20 min à allure marathon
  function longue(type, d, l, c) {
    const spe = type === 'SL_SPE' && c.dist > 20000, fin = type === 'SL_FIN';
    const p = spe ? arr5(lerp(0.15, 0.35, l) * d) : fin ? arr5(lerp(10, 20, l)) : 0, aFin = c.profil && (fin ? allureDist(c, 42195) : c.allureObj);
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
  const course = (c) => ({ nom: 'Course', zone: c.zoneObj, duree: c.tObj, travail: 0, km: c.dist / 1000, parts: { [c.zoneObj]: c.tObj },
    etapes: [{ t: 'effort', duree: c.tObj, allure: c.profil && [c.allureObj * 0.99, c.allureObj * 1.01], nom: c.label }],
    texte: `${c.label}${c.profil ? ` : objectif ≈ ${E.formatTemps(c.tObj)}, ${al(c, 'obj')}` : ''}. Échauffement léger avant le départ.` });

  /* ---------- Méthodes ---------- */

  // phases : f = fin de la phase en part des semaines avant l'affûtage ; q = séances de qualité par ordre de priorité ; sl = sortie longue.
  // score : adéquation à l'objectif (0 à 3) ; ie : poids du biais d'indice d'endurance (+ : favorisée par une bonne endurance)
  const DOCTRINES = [
    { id: 'daniels', nom: 'Daniels', titre: 'Jack Daniels : quatre phases, allures E, M, T, I, R',
      source: "Daniels J., Daniels' Running Formula, Human Kinetics (3e éd. 2014) ; résumés : Coach Ray (« Jack Daniels running intensity »), notes de lecture Goodreads, forum Running Ahead.",
      resume: "Chaque séance a un but précis et une allure tirée du niveau du coureur : endurance (E), marathon (M), seuil (T), intervalles VO2max (I), répétitions de vitesse (R). Quatre phases : fondation, qualité initiale, transition (la plus dure), qualité finale.",
      principes: ['Deux séances de qualité par semaine, plus une sortie longue.', "Seuil (T) : répétitions de 5 à 15 min, environ 1 min de récupération pour 5 min d'effort ; au plus 10 % du volume hebdomadaire par séance.",
        "Intervalles (I) : 3 à 5 min, récupération égale ou un peu plus courte que l'effort ; au plus 8 % du volume hebdomadaire.", "Répétitions (R) : 2 min au plus par répétition, récupération de 2 à 3 fois la durée (et non la distance) ; au plus 5 % du volume hebdomadaire.",
        'Allure marathon (M) : au plus 20 % du volume hebdomadaire ; sortie longue de 2 h 30 au plus (hors ultra).',
        'Plafonds appliqués ici au temps (et non au kilométrage) : une séance trop longue pour votre volume est raccourcie.'],
      maxQ: 2, plafonds: { SEUIL: 0.1, VMA_LONG: 0.08, VITESSE: 0.05 }, score: { '5k': 2, '10k': 2.5, semi: 2.5, marathon: 2 },
      difficulte: [3, 'allures précises à respecter, phase de transition exigeante'],
      phases: [{ nom: 'Fondation', f: 0.2, q: ['EF_LD', 'EF_LD'], sl: 'SL' }, { nom: 'Qualité initiale', f: 0.45, q: ['VITESSE', 'SEUIL'], sl: 'SL' },
        { nom: 'Transition', f: 0.75, q: ['VMA_LONG', 'SEUIL'], sl: 'SL' }, { nom: 'Qualité finale', f: 1, q: ['SEUIL', 'SPE'], sl: 'SL_SPE' }] },
    { id: 'lydiard', nom: 'Lydiard', titre: "Arthur Lydiard : la pyramide, du foncier à l'affûtage",
      source: 'Lydiard A., Gilmour G., Running with Lydiard, Hodder & Stoughton (1983 ; 2e éd. 2000) ; résumés : CoachTheRun (« What is the Lydiard Method »), Wikipedia, forum boards.ie.',
      resume: "Périodisation en pyramide : une longue base aérobie (beaucoup de volume, en partie à allure soutenue), puis une phase de côtes (circuits avec bondissements), une courte phase anaérobie (fractionné, contre-la-montre) et enfin coordination et affûtage.",
      principes: ["Base : 8 à 12 semaines au moins (idéalement 3 à 6 mois) de course aérobie : sortie longue « agréablement fatigante », footings faciles, fartlek relâché, lignes droites ; pas de vrai fractionné.",
        'Côtes : 3 à 6 semaines, circuits trois fois par semaine (montée en bondissant, descente rapide et relâchée, accélérations à plat).',
        "Anaérobie : 4 semaines au plus, fractionné et contre-la-montre sur des distances plus courtes que la course.",
        'Coordination et affûtage : vitesse courte et allure de course, volume en baisse ; la sortie longue continue le week-end, plus facile.'],
      maxQ: 3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [2, "longue base aérobie, intensité tardive et progressive ; demande surtout du temps"],
      phases: [{ nom: 'Base aérobie', f: 0.45, q: ['SOUTENU', 'FARTLEK', 'EF_LD'], sl: 'SL' }, { nom: 'Côtes', f: 0.65, q: ['LYD_CIRCUIT', 'LYD_CIRCUIT', 'LYD_CIRCUIT'], sl: 'SL' },
        { nom: 'Anaérobie', f: 0.88, q: ['VMA_LONG', 'LYD_TT', 'VITESSE'], sl: 'SL' }, { nom: 'Coordination', f: 1, q: ['SPE', 'VITESSE', 'LYD_TT'], sl: 'SL' }] },
    { id: 'seiler', nom: 'Seiler', titre: 'Stephen Seiler : entraînement polarisé (80/20)',
      source: "Seiler S., What is best practice for training intensity and duration distribution in endurance athletes?, Int J Sports Physiol Perform 2010 ; Seiler S. et al., Scand J Med Sci Sports 2013 (intervalles 4 × 4, 4 × 8 et 4 × 16 min, 36 cyclistes de loisir) ; résumés : TRUE Fitness, forum TrainerRoad ; Aubry A., « S'entraîner lentement (parfois)… pour être plus performant », lepape-info (synthèse d'études d'élites, lue).",
      resume: "Environ 80 % des séances en faible intensité, le reste en haute intensité, très peu en zone intermédiaire. Les intervalles longs (4 à 8 min, 2 min de récupération) sont la séance type.",
      principes: ['Facile vraiment facile (Z1-Z2), dur vraiment dur : éviter la « zone grise ».', 'Deux séances intenses par semaine suffisent, même à gros volume.',
        "Séance type : 4 × 8 min à effort élevé et régulier, 2 min de récupération (meilleure progression que 4 × 4 ou 4 × 16 min dans son étude sur des cyclistes de loisir entraînés).",
        "La répartition 80/20 se compte en séances plutôt qu'en temps.",
        "Répartitions observées chez des experts (synthèse d'Aubry, INSEP) : 71 à 85 % du temps en zone 1, au plus 15 à 25 % en zones 2 et 3 ; à volume égal, 81 / 11 / 8 % progresse mieux que 67 / 25 / 8 % (Lucia, coureurs nationaux). Ce sont des élites : ces pourcentages ne se transposent pas tels quels à d'autres niveaux."],
      maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2, marathon: 2 },
      difficulte: [1, 'deux séances dures au plus, tout le reste vraiment facile : simple à suivre'],
      phases: [{ nom: 'Développement', f: 0.7, q: ['INTERVALLES_LONGS', 'VMA_LONG'], sl: 'SL' }, { nom: 'Spécifique', f: 1, q: ['INTERVALLES_LONGS', 'SPE'], sl: 'SL' }] },
    { id: 'pfitzinger', nom: 'Pfitzinger', titre: 'Pete Pfitzinger : mésocycles et seuil lactique',
      source: 'Pfitzinger P., Douglas S., Advanced Marathoning, Human Kinetics (2e éd. 2009, 4e éd. 2025) ; Faster Road Racing (2015) ; résumés : Running with Rock (« Pfitz Marathon Training Plans Explained »), RoadTrailRun, Goodreads.',
      resume: "Mésocycles successifs : endurance, seuil lactique et endurance, préparation à la course, affûtage. Le tempo au seuil lactique et les sorties longues (avec allure marathon) sont le cœur ; le VO2max arrive en fin de préparation.",
      principes: ['Semaine type : quatre jours de récupération, une séance au seuil lactique, une sortie longue et une sortie moyenne-longue.',
        'Tempo continu de 20 à 40 min à allure 15 km – semi-marathon, allongé au fil des mésocycles.',
        "VO2max : fractions de 2 à 5 min à allure 5 km (données en distance par Pfitzinger, 800 à 1600 m, 600 m les semaines de course : ici en durée, pour que l'effort soit le même à tous les niveaux), récupération de 50 à 90 % du temps d'effort.",
        'Sorties longues avec une partie à allure marathon en préparation spécifique.', 'Affûtage de 3 semaines pour le marathon.'],
      maxQ: 2, moyenneLongue: true, affutage3: true, score: { '5k': 1, '10k': 1.5, semi: 3, marathon: 3 },
      difficulte: [4, 'tempos longs et sorties longues avec allure marathon, pensé pour de gros volumes'],
      phases: [{ nom: 'Endurance', f: 0.3, q: ['TEMPO', 'EF_LD'], sl: 'SL' }, { nom: 'Seuil et endurance', f: 0.65, q: ['TEMPO', 'SEUIL'], sl: 'SL_SPE' },
        { nom: 'Préparation à la course', f: 1, q: ['VMA_PFITZ', 'TEMPO'], sl: 'SL_SPE' }] },
    { id: 'hanson', nom: 'Hanson', titre: 'Méthode Hanson : fatigue cumulée',
      source: 'Humphrey L., Hanson K., Hanson K., Hansons Marathon Method, VeloPress (2012 ; 2e éd. 2016) ; résumé : Marathon Handbook ; forum LetsRun (« Hanson\'s Strength Workouts for the Marathon », « Thoughts on Hanson\'s Marathon Method? »).',
      resume: "Trois séances clés par semaine (vitesse puis force, tempo à allure objectif, sortie longue) et des footings presque tous les jours : on aborde les séances avec une fatigue accumulée, qui simule la fin de course. La sortie longue est plafonnée (environ 26 km).",
      principes: ['Vitesse (première moitié) : répétitions à allure 5 – 10 km.', "Force (seconde moitié) : répétitions longues un peu plus vite que l'allure objectif, récupération courte.",
        'Tempo : longue portion continue à allure objectif, allongée au fil des semaines.', 'Six jours de course par semaine, peu ou pas d\'entraînement croisé ; sortie longue de 16 miles (≈ 26 km) au plus.',
        "Force : allure marathon − 10 s par mile (table 3.4 du livre, citée sur LetsRun), par exemple 6 × 1 mile à 2 × 3 miles avec 400 à 800 m de trot ; vitesse : environ 3 miles au total à allure 5 – 10 km. Ne pas courir la force plus vite que prévu."],
      maxQ: 2, slKm: 26, score: { '5k': 1, '10k': 1.5, semi: 2.5, marathon: 3 },
      difficulte: [4, 'six jours de course par semaine et séances clés enchaînées sur une fatigue accumulée'],
      phases: [{ nom: 'Vitesse', f: 0.45, q: ['VMA_HANSON', 'TEMPO_OBJ'], sl: 'SL' }, { nom: 'Force', f: 1, q: ['FORCE', 'TEMPO_OBJ'], sl: 'SL' }] },
    { id: 'canova', nom: 'Canova', titre: "Renato Canova : l'entonnoir de la spécificité",
      source: "Canova R., messages sur le forum LetsRun (« Does it matter how fast you do your long runs? », résumé « Summary of Renato Canova principles ») ; Arcelli E., Canova R. (1999, non lu) ; progressifs selon Canova : Fast Running.",
      resume: "Du général au spécifique : un travail varié au début (côtes, fartlek, seuil), puis un resserrement progressif (« entonnoir ») vers des séances longues proches de l'allure de course (95 à 105 %).",
      principes: ['Période générale : côtes, fartlek, allures variées ; progressifs moyens (60 à 90 min de 85 à 100 % de la vitesse marathon, jamais plus vite).',
        'Période fondamentale : seuil, allure de course sur portions courtes ; progressifs moyen-rapides (45 à 60 min de 95 à 105 % de la vitesse marathon).',
        "Période spécifique : beaucoup de volume à 95 – 105 % de l'allure de course, sorties longues rapides à 90 – 95 % ; progressifs rapides (20 à 40 min de 102 à 108 % de la vitesse marathon).",
        'Progressifs réservés ici au semi et au marathon (leurs % sont ceux de la vitesse marathon). Méthode exigeante, pensée pour des coureurs expérimentés.',
        "5 et 10 km, d'après un message de Canova (exemple d'un coureur de 15:00 au 5000 m) : 110 % de la vitesse de course, fractions courtes, ≈ 3 km au total, 1 min 30 de récupération ; 105 %, ≈ la distance de course au total ; 100 %, fractions jusqu'au 2000 m, 8 à 10 km, 3 min ; 95 %, fractions longues (3 × 3000 m) ou continu ; 90 %, continu de 10 à 20 km. Il compte 105 % comme l'allure moins 5 %.",
        "Spécialement pour le marathon, ses « blocs spéciaux » (deux séances longues le même jour) sont réservés aux coureurs de très haut niveau et ne sont pas repris ici.",
        'Ses volumes sont ceux de coureurs à très gros kilométrage : ici, la qualité de la semaine est plafonnée à 30 % du temps.'],
      maxQ: 3, partQualite: 0.3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [5, "gros volume proche de l'allure de course, conçu pour des coureurs de haut niveau"],
      phases: [{ nom: 'Générale', f: 0.3, q: c => (c.dist > 20000 ? ['CAN_PROG@1', 'COTES', 'FARTLEK'] : ['FARTLEK', 'COTES', 'CAN@90']), sl: 'SL' },
        { nom: 'Fondamentale', f: 0.6, q: c => (c.dist > 20000 ? ['SEUIL', 'CAN_PROG@2', 'SPE'] : ['CAN@95', 'CAN@110', 'CAN@90']), sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: c => (c.dist > 20000 ? ['SPE', 'SPE_EXT', 'CAN_PROG@3'] : ['CAN@100', 'CAN@105', 'CAN@95']), sl: 'SL_SPE' }] },
    { id: 'billat', nom: 'Billat', titre: 'Véronique Billat : intervalles à VMA',
      source: 'Billat L. V., Interval training for performance: a scientific and empirical practice, Sports Med 2001 (parties 1 et 2) ; études 30-30 et ½ Tlim (HAL Montpellier, Serval UNIL, Eur J Appl Physiol).',
      resume: "Le temps passé à VMA est le levier principal du 5 et du 10 km. Deux formats : le 30-30 (30 s à VMA, 30 s à 50 % de VMA), qui accumule beaucoup de temps à VMA, et des fractions à VMA de la moitié du temps limite (≈ 3 min), récupération de même durée.",
      principes: ['30-30 : 30 s à VMA, 30 s de récupération active à 50 % de VMA ; permet de rester une dizaine de minutes à VO2max.',
        'Fractions longues à VMA : la moitié du temps limite (≈ 3 min ici, la VMA étant tenue environ 6 min dans le modèle), récupération de même durée ; dans les études de son équipe, elles gardent plus longtemps au-dessus de 90 % de VO2max que le 30-30.',
        'Seuil en complément, une fois par semaine.', 'Allure de course en fin de préparation.',
        "Preuves : petits échantillons (8 à 11 coureurs) ; l'avantage des fractions de la moitié du temps limite sur le 30-30 n'est qu'une tendance."],
      maxQ: 2, score: { '5k': 3, '10k': 3, semi: 1.5, marathon: 1 },
      difficulte: [4, 'les fractions longues à VMA (≈ 3 min, phase « VMA longue ») sont très éprouvantes ; le 30-30 et le seuil, eux, restent accessibles'],
      phases: [{ nom: 'VMA courte', f: 0.4, q: ['TRENTE', 'SEUIL'], sl: 'SL' }, { nom: 'VMA longue', f: 0.8, q: ['VMA_TLIM', 'SEUIL'], sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: ['SPE', 'TRENTE'], sl: 'SL' }] }
  ];
  const SEUIL_NO = { SEUIL_NO_LONG: 'SEUIL_NO_COURT', SEUIL_NO_COURT: 'SEUIL_NO_LONG' }; // séance du soir d'un double seuil
  const SEUIL_PART = 0.2; // méthode norvégienne : travail au seuil de la semaine ≤ 20 % du volume (hypothèse)
  // Note de difficulté des méthodes (1 adaptée aux débutants … 5 coureurs avancés) : appréciation, pas une donnée publiée
  const NIVEAUX_METHODE = ['Débutant', 'Accessible', 'Intermédiaire', 'Confirmé', 'Avancé'];
  DOCTRINES.push({ id: 'norvegien', nom: 'norvégienne', titre: 'Méthode norvégienne : double seuil',
    source: "Bakken M., « The Norwegian model » (site personnel) et entretien LetsRun (2026) ; « The Norwegian model of lactate threshold training » (Athletics Coach) ; variante « singles » de sirpoc, résumé LetsRun archivé (sub-threshold) ; Tjelta L. I., Int J Sports Sci Coach 2019 ; Casado A. et al., Int J Environ Res Public Health 2023.",
    resume: "Beaucoup de volume facile et deux journées « double seuil » par semaine : fractions longues le matin, fractions courtes le soir, à une intensité contrôlée juste sous le seuil (idéalement au lactatomètre), plus une séance de côtes courtes et une sortie longue. Sans doublé : variante « singles » (trois séances sous le seuil par semaine).",
    principes: ['Deux jours par semaine à deux séances au seuil : matin, fractions longues (ex. 3 × 2 km, 4 × 10 min) ; soir, fractions courtes (ex. 8 × 1 min un peu au-dessus du seuil, 10 × 400 m juste en dessous) ; récupérations brèves.',
      "Intensité contrôlée, sous le seuil : lactate ≈ 2 à 3 mmol/L (élites) ; sans lactatomètre, effort perçu 6 – 7 sur 10, finir en pouvant en faire plus. Un peu trop vite et le travail au seuil possible tombe de moitié.",
      'Une séance courte et rapide (côtes courtes de 30 à 45 s) en fin de semaine, le reste en footing vraiment facile.',
      "Sans doublé, trois séances sous le seuil par semaine (fractions longues, courtes, longues) : voir aussi la méthode Norwegian Singles (sirpoc), qui en détaille le format, les niveaux et l'absence de décharge."],
    maxQ: 3, doubleSeuil: true,
    score: { '5k': 2.5, '10k': 3, semi: 2.5, marathon: 2 },
    difficulte: [4, 'deux journées à double séance au seuil par semaine : intensité modérée mais volume de qualité très élevé ; sans doublé, la variante « singles » est plus accessible'],
    phases: [{ nom: 'Développement', f: 0.75, q: () => (nbDoubles() ? ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'COTES_COURTES'] : ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SEUIL_NO_LONG']), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SPE'], sl: 'SL' }] });
  // Autres méthodes. q d'une phase peut dépendre du contexte (fonction de c)
  DOCTRINES.push({ id: 'cottereau', nom: 'Cottereau', titre: 'Serge Cottereau : courir lentement pour progresser',
    source: "Cottereau S., « Principes de base de l'entraînement » (texte reproduit sur le forum courseapied.net) ; « Courir lentement pour progresser, la méthode Serge Cottereau », Esprit Trail.",
    resume: "S'entraîner régulièrement, souvent, longtemps et surtout très peu intensément : au moins les trois quarts du temps en endurance, au plus un cinquième en résistance douce (≈ allure marathon) et une seule séance de résistance dure (≈ allure 10 km) par semaine. Intensités réglées au cardiofréquencemètre, jamais jusqu'à l'épuisement.",
    principes: ['Endurance (60 – 80 % FCM, surtout 65 – 75 %) : au moins les trois quarts du temps de la semaine.',
      'Résistance douce (80 – 90 % FCM) : au plus un cinquième du temps, jamais deux jours de suite ; pour le marathon, 2 à 3 × 15 min, récupération de 5 à 7 min très lente.',
      "Résistance dure (jusqu'à ≈ 95 % FCM) : une séance par semaine, répétitions de 3 à 4 min, récupération de même durée ; pas de VMA courte pour les coureurs de fond.",
      'Séances de 45 à 75 min ; pour le marathon, une séance par semaine prolongée vers 2 h.',
      "Progression par paliers de durée puis d'intensité ; à la fin d'une séance, pouvoir en refaire autant. Allures du plan : équivalents approximatifs des zones de fréquence cardiaque."],
    maxQ: 2, footingMax: 75, slSi: c => c.goal === 'marathon',
    slNote: avec => (avec ? 'Sortie longue : une séance par semaine prolongée vers 2 h, comme le conseille Cottereau pour le marathon.'
      : "Pas de sortie longue : Cottereau ne prolonge une séance vers 2 h que pour le marathon ; les autres durent 45 à 75 min."),
    score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 3 },
    difficulte: [1, "surtout de l'endurance très facile, une seule séance dure par semaine, jamais jusqu'à l'épuisement"],
    phases: [{ nom: 'Progression par paliers', f: 1, q: c => (c.dist > 20000 ? ['COT_DOUCE', 'COT_DURE'] : ['COT_DURE', 'COT_DOUCE']), sl: 'SL' }] },
  { id: 'heubi', nom: 'Heubi', titre: 'Bruno Heubi : puissance, endurance, efficience',
    source: 'Heubi B., brunoheubi.com : « La préparation générale », « La préparation spécifique », « La séance de VMA dans mes règles de l\'art », « Performance = puissance + endurance + efficience ».',
    resume: "La performance repose sur la puissance (VMA), l'endurance et l'efficience. Une préparation générale (VMA courte et moyenne, endurance active à 80 – 85 % de VMA) précède une préparation spécifique de 8 à 10 semaines : VMA entretenue, endurance active chaque semaine et fractions à l'allure de l'objectif, dans la sortie longue pour le marathon.",
    principes: ['Toutes les allures en % de VMA ; footings à 60 – 65 % de VMA.',
      "Endurance active (EMA) à 80 – 85 % de VMA, selon l'indice d'endurance (ici 85 % pour une bonne endurance, 80 % pour une endurance à développer).",
      'VMA courte : fractions de 30 s à 1 min 15 ; volume effort + récupération de 20 à 26 min ; récupération active à ≈ 50 % de VMA ; partir un peu sous l\'allure cible.',
      'Préparation générale : au moins 2 cycles de 3 semaines, séparés par une semaine de relâchement ; sortie longue facultative.',
      'Préparation spécifique : VMA (95 – 105 % pour 10 km et semi, 90 – 100 % pour le marathon) une fois par semaine ou tous les 15 jours, EMA chaque semaine, fractions à l\'allure de l\'objectif ; marathon : fractions à allure marathon dans la sortie longue.'],
    maxQ: 3, score: { '5k': 2, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [3, "séances de VMA et d'endurance active soutenues, mais dosées en volume et adaptées à l'indice d'endurance"],
    phases: [{ nom: 'Préparation générale', f: 0.4, q: ['HEU_VMA_COURTE', 'HEU_EMA', 'HEU_VMA_MOY'], sl: 'SL' },
      { nom: 'Préparation spécifique', f: 1, q: c => (c.goal === 'marathon' ? ['HEU_EMA', 'HEU_VMA_LONGUE', 'SPE'] : ['SPE', 'HEU_EMA', 'HEU_VMA_COURTE']), sl: 'SL_SPE' }] },
  { id: 'mcmillan', nom: 'McMillan', titre: 'Greg McMillan : quatre zones et type de coureur',
    source: 'McMillan G., mcmillanrunning.com : « McMillan\'s Six Step Training System », « Zones & Workouts », « The 3 Runner Types ».',
    resume: "Quatre zones (Endurance, Stamina, Speed, Sprint) et un plan adapté au type de coureur : Speedster (à l'aise sur le court et rapide), Endurance Monster (à l'aise sur le long) ou Combo. Base, puis stamina, speed et travail spécifique, avec 3 semaines en hausse pour 1 en baisse et 2 à 3 semaines d'affûtage.",
    principes: ['Endurance : 60 à 80 % du volume hebdomadaire, footings de 30 à 90 min, sortie longue de 1 h 15 au moins, une de 1 h 30 à 2 h 30 tous les 7 à 14 jours.',
      'Stamina : steady state 25 à 75 min, tempo 15 à 30 min, tempo en fractions de 8 à 15 min (2 à 5 min de trot), cruise intervals de 3 à 8 min (30 s à 2 min de trot).',
      "Speed : fractions de 1 à 5 min à allure 1500 m – 5 km, récupération égale ou plus courte ; Sprint : lignes droites de 15 à 20 s.",
      'Type de coureur (ici déduit de votre indice d\'endurance) : un Speedster a besoin de peu de séances de vitesse (6 à 8 sur 3 à 4 semaines), un Endurance Monster de plus de stamina.',
      '3 semaines en hausse pour 1 en baisse ; aucune phase hors endurance au-delà de 8 semaines.'],
    maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2.5, marathon: 2.5 }, lignes: { n: 6, texte: 'lignes droites de 15 à 20 s (Sprint, souples et relâchées)' },
    noteProfil: c => (c.profil ? `Votre type de coureur selon McMillan, d'après votre indice d'endurance (${c.profil.IE.toFixed(1).replace('.', ',')}) : <strong>${typeMcMillan(c)}</strong>.` : ''),
    difficulte: [2, 'plans pour tous les niveaux, adaptés au type de coureur ; intensités modérées en zone Stamina'],
    phases: [{ nom: 'Base', f: 0.2, q: ['MC_STEADY', 'EF_LD'], sl: 'SL' },
      { nom: 'Stamina', f: 0.55, q: selonType(['MC_TEMPO', 'MC_CRUISE', 'MC_SPEED']), sl: 'SL' },
      { nom: 'Speed', f: 0.8, q: selonType(['MC_SPEED', 'MC_TEMPO_INT', 'MC_STEADY']), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: selonType(['SPE', 'MC_CRUISE', 'MC_SPEED']), sl: 'SL_SPE' }] },
  { id: 'tinman', nom: 'Tinman', titre: 'Tom « Tinman » Schwartz : vitesse critique',
    source: 'Schwartz T., séances de vitesse critique (Fast Running, « Critical Velocity Training ») ; présentation du système Tinman (Ward Nicholson, « Running renewal at age 59 », partie 2).',
    resume: "Beaucoup de course facile toute l'année et des séances « modérément dures » plutôt qu'héroïques : la vitesse critique (CV, allure tenue environ 30 min) développe l'endurance des fibres rapides. Tempo, côtes et lignes droites complètent ; la VO2max est travaillée avec parcimonie.",
    principes: ["Vitesse critique : allure « assez dure » tenue 30 à 40 min (souvent proche de l'allure 10 km) ; deux jours durs par semaine, quatre faciles ; séance type : 5 à 7 × 3 min (ou 1 km) avec 1 min de trot, puis 5 × 30 à 45 s à allure 1 mile ; ici en durée, pour que l'effort soit le même à tous les niveaux.",
      'Courir les séances à l\'allure prévue, sans en faire une course ; éviter les séances « de super-héros ».',
      'Volume facile à modéré important toute l\'année ; progression graduelle, sans changement brutal d\'une saison à l\'autre.',
      'VO2max avec parcimonie (moins de volume par séance que la plupart des entraîneurs), d\'autant moins que l\'on court souvent.'],
    maxQ: 2, score: { '5k': 3, '10k': 2.5, semi: 2, marathon: 1.5 }, lignes: { n: 6, texte: 'lignes droites de 20 s, relâchées' },
    difficulte: [2, 'séances modérément dures, jamais jusqu\'à l\'épuisement ; peu de VO2max'],
    phases: [{ nom: 'Développement', f: 0.75, q: ['TIN_CV', 'TEMPO'], sl: 'SL' }, { nom: 'Affinage', f: 1, q: ['TIN_CV', 'SPE'], sl: 'SL' }] },
  { id: 'magness', nom: 'Magness', titre: 'Steve Magness : l\'entonnoir, construire et entretenir',
    source: 'Magness S., The Science of Running (2014) ; « My Training History Manifesto » (stevemagness.org) ; « Funnel periodization » (All Things Running).',
    resume: "Du général au spécifique en entonnoir : on travaille d'abord des allures éloignées de l'objectif, des deux côtés (plus lentes et plus rapides), puis elles se rapprochent de l'allure de course, en entretenant ce qui a été construit. Sprints en côte pour la puissance, au plus trois jours durs par semaine.",
    principes: ['Phase générale : footings, sprints en côte (puissance neuromusculaire) et endurance générale.',
      "Entonnoir : à chaque bloc, une allure plus lente et une plus rapide que l'objectif se rapprochent de l'allure de course (ex. 8 km : marathon et 1500 m, puis semi et 3000 m, puis 10 – 12 km et 5 km, puis allure 8 km).",
      'Construire puis entretenir : un rappel des allures déjà travaillées toutes les 2 à 3 semaines.',
      'Au plus trois jours durs par semaine, alternance dur / facile ; marathon : travail spécifique sur les 6 à 8 dernières semaines.'],
    maxQ: 3, score: { '5k': 3, '10k': 3, semi: 2.5, marathon: 2 }, lignes: { n: 6, texte: 'accélérations de 15 s à allure de course' },
    difficulte: [4, "beaucoup d'allures différentes à maîtriser, pensé pour des coureurs de compétition"],
    phases: [{ nom: 'Générale', f: 0.2, q: ['MAG_SPRINTS', 'MC_STEADY'], sl: 'SL' },
      { nom: 'Entonnoir 1', f: 0.4, q: c => [...entonnoir(c, 1), 'MAG_SPRINTS'], sl: 'SL' },
      { nom: 'Entonnoir 2', f: 0.6, q: c => [...entonnoir(c, 2), 'MAG_SPRINTS'], sl: 'SL' },
      { nom: 'Entonnoir 3', f: 0.8, q: c => [...entonnoir(c, 3), entonnoir(c, 1)[0]], sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: c => ['SPE', entonnoir(c, 3)[1], entonnoir(c, 3)[0]], sl: 'SL_SPE' }] },
  { id: 'galloway', nom: 'Galloway', titre: 'Jeff Galloway : course-marche (« Run-Walk-Run »)',
    source: "Galloway J., jeffgalloway.com : « Train for a Marathon Finish » (ratios course / marche, allure de sortie longue, sorties longues jusqu'à 26 miles) et « Magic Mile » ; principes de vitesse rapportés par Active.com (« 4 Steps to Your Perfect Pace »).",
    resume: "Des pauses de marche régulières dès le début de chaque sortie, selon un ratio course / marche qui dépend de l'allure : on finit sans être essoufflé, avec moins de fatigue et de risque de blessure. Trois jours de course par semaine, une sortie longue lente qui s'allonge progressivement, un « mile magique » toutes les deux semaines pour recaler les allures.",
    principes: ['Course-marche à toutes les sorties : par exemple 4 min / 30 s à 5:00 /km, 1 min 30 / 30 s à 6:15 /km, 30 s / 30 s à 8:05 /km (table de Galloway par mile).',
      'Trois jours de course par semaine (deux sorties courtes et une longue le week-end) ; renforcement ou vélo en option les autres jours, repos la veille de la sortie longue.',
      'Sortie longue lente : allure du mile magique × 1,3 + 2 min par mile, jamais essoufflé ; pour le marathon, jusqu\'à 26 miles (42 km).',
      'Mile magique toutes les deux semaines (1 mile un peu plus vite que d\'habitude, sans aller à fond) : allure marathon ≈ temps × 1,3.',
      "Pour un objectif chronométré, une séance par semaine à l'allure de l'objectif (fractions de quelques minutes, récupération en marchant) ; exercices de cadence et accélérations-glissées.",
      "Ralentir de 30 s par mile (≈ 20 s /km) tous les 3 °C au-dessus de 15 °C."],
    maxQ: 1, joursMax: 3, footingMax: 45, courseMarche: true, test: { id: 'GAL_MM', tous: 2 },
    slKm: c => (c.goal === 'marathon' ? 42 : null), lignes: { n: 6, texte: 'accélérations-glissées de 15 à 20 s (accélérer puis se laisser glisser, foulée souple)' },
    noteProfil: c => (c.profil ? `Allure de sortie longue ≈ ${fA(allureGalloway(c))}, ratio course / marche conseillé : ${ratioGalloway(allureGalloway(c)).map(fD).join(' / ')}.` : ''),
    score: { '5k': 2, '10k': 2, semi: 2.5, marathon: 3 },
    difficulte: [1, 'pauses de marche, allures lentes et trois jours de course par semaine : pensée pour finir sans se blesser'],
    phases: [{ nom: 'Progression', f: 1, q: ['GAL_RYTHME'], sl: 'SL' }] },
  { id: 'fitzgerald', nom: 'Fitzgerald', titre: 'Matt Fitzgerald : 80/20 Running',
    source: "Fitzgerald M., 80/20 Running: Run Stronger and Race Faster by Training Slower (Penguin, 2014) ; résumés de lecture (run.wxm.be, « 80/20 Running ») et de la méthode (RunCulture, « The 80/20 running method by Fitzgerald »).",
    resume: "Environ 80 % du temps d'entraînement en faible intensité (zones 1 – 2) et 20 % en intensité modérée à élevée (zones 3 – 5), compté en temps. Trois jours durs par semaine (deux séances et la sortie longue), séparés par des jours faciles ; une semaine de récupération toutes les trois semaines ; une phase de base puis une phase de développement spécifique.",
    principes: ['Zones en % de la fréquence cardiaque au seuil : 1 faible aérobie (75 – 80 %), 2 aérobie modérée (81 – 89 %), 3 seuil (96 – 100 %), 4 VO2max (102 – 105 %), 5 vitesse (≥ 106 %) ; les écarts entre zones (90 – 95 %, 101 %) sont volontairement évités.',
      'Faible intensité : footings de récupération (zone 1), footings de base (zone 2), sortie longue ; échauffements, retours au calme et récupérations comptent comme du facile.',
      'Séances : tempo (20 à 30 min en zone 3), cruise intervals (par exemple 4 × 6 min, 2 min de trot), intervalles longs (3 à 5 min en zone 4), intervalles courts (60 à 90 s en zone 5), speed play, côtes, sortie longue avec fin rapide.',
      "5 km : plus d'intensité élevée ; marathon : plus d'intensité modérée (zone 3). Une semaine de récupération toutes les trois semaines.",
      'Ici, la qualité de la semaine (récupérations comprises) est plafonnée à 25 % du temps ; zone 3 = allure 1 h, zone 4 = allure 3000 – 5000 m, zone 5 = allure 1500 m.'],
    maxQ: 2, partQualite: 0.25, lignes: { n: 6, texte: 'lignes droites de 20 s (trop courtes pour compter dans les 20 %)' },
    score: { '5k': 2.5, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [2, "surtout du facile, deux séances dures par semaine dosées à 20 % du temps"],
    phases: [{ nom: 'Base', f: 0.5, q: ['FITZ_FARTLEK', 'COTES', 'FITZ_TEMPO'], sl: 'SL_FIN' },
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
    source: "Copeland J. (« sirpoc »), Norwegian Singles Method: Subthreshold Running Kept Simple (2025), d'après les travaux de Bakken M. et l'entraînement de K. Ingebrigtsen ; fil « Norwegian singles » du forum courseapied.net (septembre 2025 – 2026 : résumé de la méthode, table de niveaux 1 à 8, avis de Bakken) ; résumé LetsRun archivé (sub-threshold).",
    resume: "Variante « single » du modèle norvégien pour des amateurs de 5 à 9 h par semaine : trois séances sous le seuil lactique chaque semaine (courte, moyenne, longue), le reste en endurance très facile, une sortie longue. On maximise la charge répétable sans fatigue excessive et on la maintient : pas de semaine de décharge, pas d'affûtage, pas de VO2max ni d'allure spécifique.",
    principes: ["Trois séances sous le seuil (juste sous le second seuil lactique, haut de la zone 3 / bas de la zone 4) : court 8 – 12 × 3 – 4 min à allure 15 km, moyen 4 – 6 × 6 – 8 min à allure semi, long 3 × 10 – 12 min à allure 30 km, récupération de 1 min ; une séance de chaque type par semaine (rotation si moins de trois séances).",
      "Intensité contrôlée : finir la dernière répétition juste sous la fréquence cardiaque au seuil lactique (effort 6 – 7 sur 10) ; en cas de doute, ralentir. Footings à moins de 70 % de la fréquence cardiaque maximale.",
      "Progression par niveaux (table du forum) : temps sous le seuil par séance de 18 min (niveau 1) à 40 min (niveau 8), semaine de 4 h 40 à 8 h, avec 20 min d'échauffement et 5 min de retour au calme par séance ; la difficulté choisie règle le niveau de départ.",
      "Part sous le seuil : 19 % du temps au niveau 1, 23 % au niveau 2, 25 % au-delà (ici, qualité plafonnée à 25 % du temps de la semaine) ; monter le volume facile en même temps que la qualité, sans augmenter vite.",
      "Pas de semaine de décharge ni d'affûtage (même charge répétable sur des mois), peu ou pas d'allure spécifique ; test sur une course ou un 5 km en solo toutes les 4 à 8 semaines pour recaler les allures.",
      "Pas adaptée si vous avez plus de 10 h par semaine, visez une course précise avec un pic de forme ou avez besoin de variété. Au moins 4 h 30 par semaine ; 6 sorties recommandées (3 sous le seuil, 2 à 3 footings, une sortie longue). Marathon : adaptations nécessaires."],
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
  const nomCycle = () => (state.cycle === 'cycle' ? `cycle ${state.charge} + ${state.decharge}` : 'charge constante');

  // Fiche de chaque méthode (hypothèses de conception) : public visé, durée habituelle du plan, mise en œuvre (simple, moyenne,
  // complexe) et prérequis dont l'absence déclenche une alerte, sans effet sur le plan : volume (h / semaine) et jours de course ;
  // ie : méthode à fractions longues à VMA ou au seuil, plus dures à tenir avec un indice d'endurance très bas. Aucun seuil de VMA ou
  // de vitesse : la capacité du moment ne dit rien de l'expérience, et les séances se règlent sur la VMA de chacun.
  // limitee : sources limitées (ni livre ni texte de l'auteur sur les phases et les séances : résumés, forums), marquée d'un astérisque.
  const FICHES = {
    galloway: { public: 'Débutants et reprise : finir un 10 km, un semi ou un marathon', plan: '16 à 30 semaines', mise: 'simple', h: 2, j: 3, ancienne: true },
    cottereau: { public: "Coureurs d'endurance, du loisir à l'ultra", plan: '12 à 16 semaines', mise: 'simple', h: 2, j: 3, ancienne: true },
    seiler: { public: 'Coureurs réguliers qui séparent nettement le facile et le dur (80/20)', plan: '8 à 12 semaines', mise: 'simple', h: 3, j: 4, limitee: true },
    fitzgerald: { public: 'Amateurs réguliers visant un chrono, du 5 km au marathon', plan: '12 à 18 semaines', mise: 'simple', h: 3, j: 4, limitee: true },
    tinman: { public: 'Coureurs de 5 à 10 km qui veulent peu de jours durs', plan: '8 à 12 semaines', mise: 'simple', h: 4, j: 5, limitee: true },
    lydiard: { public: 'Coureurs qui bâtissent une base aérobie sur la durée (semi, marathon)', plan: '16 à 30 semaines', mise: 'simple', h: 5, j: 5, limitee: true, ancienne: true },
    heubi: { public: "Coureurs sur route, du 10 km à l'ultra, qui connaissent leur VMA", plan: '12 à 16 semaines', mise: 'moyenne', h: 3, j: 3, ancienne: true },
    rousset: { public: 'Coureurs réguliers (4 à 7 sorties par semaine), du 5 km au marathon, qui réglent leur effort à la sensation', plan: '16 à 18 semaines', mise: 'moyenne', h: 4, j: 4, ancienne: true },
    singles: { public: 'Amateurs de 5 à 9 h par semaine, du 5 km au semi, sans objectif de pic de forme', plan: '12 semaines ou plus, en continu', mise: 'moyenne', h: 4.5, j: 5, limitee: true },
    billat: { public: 'Coureurs de 5 et 10 km qui développent la VO2max', plan: '6 à 10 semaines', mise: 'moyenne', h: 3, j: 3, ie: true, limitee: true },
    mcmillan: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '10 à 16 semaines', mise: 'moyenne', h: 3, j: 4 },
    daniels: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '12 à 24 semaines', mise: 'moyenne', h: 4, j: 4, limitee: true },
    hanson: { public: 'Marathoniens réguliers, six jours de course par semaine', plan: '18 semaines', mise: 'moyenne', h: 6, j: 6, limitee: true },
    kellogg: { public: 'Coureurs expérimentés à fort volume, bâti sur des années', plan: '16 à 24 semaines', mise: 'moyenne', h: 6, j: 6 },
    pfitzinger: { public: 'Marathoniens expérimentés à gros volume', plan: '12 à 18 semaines', mise: 'complexe', h: 6, j: 5, limitee: true },
    norvegien: { public: "Coureurs entraînés, du 5 km au semi, à l'aise avec le travail au seuil", plan: '12 semaines ou plus', mise: 'complexe', h: 5, j: 5, ie: true, limitee: true },
    magness: { public: 'Coureurs expérimentés qui planifient en phases', plan: '16 à 24 semaines', mise: 'complexe', h: 5, j: 5 },
    canova: { public: 'Coureurs de haut niveau, semi et marathon', plan: '16 à 24 semaines', mise: 'complexe', h: 7, j: 6, limitee: true }
  };
  const MISE = { simple: 'Simple', moyenne: 'Moyenne', complexe: 'Complexe' };
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

  // Tri de la liste des méthodes : clé numérique ou texte (ordre croissant), départage par la difficulté puis l'ordre de la liste
  const TRIS = {
    difficulte: ['Difficulté athlétique', d => d.difficulte[0]],
    mise: ['Mise en œuvre', d => ({ simple: 0, moyenne: 1, complexe: 2 })[FICHES[d.id].mise]],
    duree: ['Durée du plan', d => FICHES[d.id].plan.match(/\d+/g).map(Number).reduce((a, x, i) => a + x / (i + 1) ** 3, 0)], // 1re valeur, puis 2e
    epreuves: ['Épreuves visées', d => { const L = objectifs(d); return L[0][1] + L[L.length - 1][1] / 1e6; }], // plus courtes d'abord
    public: ['Public', d => FICHES[d.id].public]
  };
  if (!TRIS[state.tri]) state.tri = 'difficulte';
  const trier = (liste) => {
    const cle = TRIS[state.tri][1], sens = state.triDesc ? -1 : 1;
    return liste.map((d, i) => ({ d, i, k: cle(d) })).sort((a, b) => sens * (typeof a.k === 'string' ? a.k.localeCompare(b.k, 'fr') : a.k - b.k) || a.d.difficulte[0] - b.d.difficulte[0] || a.i - b.i).map(x => x.d);
  };

  // Rapport volume / fréquence / objectif (hypothèses) : volume minimal (h par semaine) et durée moyenne maximale d'une séance (min)
  // pour chaque objectif ; en dessous de MOY_MIN min par jour de course, les séances sont trop courtes pour être utiles
  const RAPPORT = { '5k': { h: 1.5, moy: 75 }, '10k': { h: 2, moy: 90 }, semi: { h: 3, moy: 105 }, marathon: { h: 4, moy: 120 } };
  const MOY_MIN = 30;
  /** Alertes sur le rapport entre volume, nombre de séances et objectif (ex. 3 séances en 2 h pour un marathon) */
  function rapportSemaine(c) {
    const R = RAPPORT[c.goal], n = state.seances + nbDoubles(), jour = c.heures * 60 / state.seances, moy = c.heures * 60 / n, a = [];
    const nom = OBJECTIFS.find(([k]) => k === c.goal)[2], pour = `${c.course ? '' : 'une allure proche d\'' }un ${nom}`;
    if (c.heures < R.h) a.push(`Rapport défavorable : ${fD(c.heures * 60)} en ${n} séance${n > 1 ? 's' : ''} par semaine, c'est peu pour ${pour} (au moins ${R.h} h). La sortie longue restera courte et la préparation limitée.`);
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
      Z6 en petite quantité devient des lignes droites ; pour une allure cible de semi ou de marathon (Z3, Z4), une partie de sa
      zone passe dans la sortie longue. Chaque zone forme des blocs (coupés au-delà du maximum, scindés s'il reste des séances) ;
      les plus gros ouvrent les séances, les autres s'y ajoutent (zone voisine d'abord), trois blocs au plus par séance. */
  function semaineZones(c, vol, l, nbQ) {
    const I = Object.fromEntries(ZI.map((z, i) => [z, vol * c.parts[i + 2]])), zc = c.zoneObj;
    let lignes = null, sl = 'SL', exces = 0;
    if (I.Z6 > 0 && I.Z6 < FORMATS.Z6.min) {
      const n = Math.round(I.Z6 * 3); // 20 s par ligne droite
      if (n >= 3) lignes = { n, texte: 'lignes droites de 20 s (Z6, vite et relâché), 40 s de trot entre chacune' };
      I.Z6 = 0;
    }
    if (c.dist > 20000 && (zc === 'Z3' || zc === 'Z4') && I[zc] > 0) { // estimation de la partie à l'allure cible de la sortie longue
      I[zc] = Math.max(0, I[zc] - lerp(0.15, 0.35, l) * Math.min(SL_MAX, SL_PART * vol));
      sl = 'SL_SPE';
    }
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
    return { q: seances.map(b => seanceZones(c, b, l)), lignes, sl, exces };
  }

  const ZONES_DOC = { id: 'zones', nom: 'selon votre répartition', titre: 'Plan selon votre répartition', bloc: true, recupZ1: true, maxQ: 3,
    semaine: semaineZones, phases: [{ nom: 'Travail des zones', f: 1, q: [], sl: 'SL' }],
    resume: "Chaque semaine reprend la répartition par zone ci-dessus (corrigée du temps en zone des compétitions intermédiaires) : le temps d'intensité de chaque zone (Z3 à Z6) est découpé en blocs, regroupés en séances de qualité (un à trois blocs, zones voisines ensemble) ; la zone de l'allure cible est courue à cette allure. Le reste du volume va aux footings (Z1 pour la récupération, Z2) et à la sortie longue. La difficulté règle la longueur des répétitions et des récupérations, pas le temps d'intensité.",
    principes: ["Temps d'effort d'une zone = volume de la semaine × part de la zone ; Z6 sous 4 min devient des lignes droites de 20 s.",
      "Z5 va de l'allure 1 h à la VMA (répétitions à 95 – 100 % de VMA), Z6 est au-delà de la VMA.",
      "Un bloc (l'effort d'une zone dans une séance) est découpé en répétitions, sans durée maximale ; il est ignoré s'il est plus court qu'un seuil qui dépend de l'allure : 20 s à la VMA, 1 min à l'allure 1 h, 3 min à la limite Z2/Z3 (80 % de l'allure 1 h).",
      "Une répétition ne dépasse jamais les 2/3 du temps limite à son allure (T = 6 × exp((v / VMA − 1) / k)) ; la difficulté règle sa longueur et les récupérations.",
      "Allure cible de semi ou de marathon : une partie de la sortie longue se court à cette allure. Pas d'affûtage ni de course, sauf si le plan va jusqu'à une date d'objectif (affûtage, course finale et compétitions intermédiaires).",
      'Formats et seuils : choix de conception (hypothèses), pas une méthode publiée.'] };

  /* ---------- Dates et compétitions intermédiaires ---------- */

  const JOUR = 864e5, SEMAINES_MAX = 52;
  const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const fDate = (t, jour) => new Date(t).toLocaleDateString('fr-FR', { ...(jour ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: 'UTC' });
  const COURSES = [[1500, '1 500 m'], [3000, '3 000 m'], [5000, '5 km'], [10000, '10 km'], [15000, '15 km'], [21097, 'Semi-marathon'], [30000, '30 km'], [42195, 'Marathon']];
  const nomCourse = (d) => (COURSES.find(x => x[0] === d) || [d, d >= 1000 ? `${(d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${d} m`])[1];

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
    const p = predCourse(c, d, effort), x = { ...c, dist: d, label: nomCompet({ d, effort }), tObj: d / (10000 / 60) / engagement({ effort }).k };
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
          `Compétition${courses.length > 1 ? 's' : ''} : ${quand} (charge ${n.nom}${courses.length > 1 ? ' au total' : ''}, ${charge}) : le TSS ${courses.length > 1 ? 'des courses' : 'de la course'} est retranché du TSS de la semaine${sansQ}, ${courses.length > 1 ? 'les courses remplacent la sortie longue et des footings' : 'la course remplace la sortie longue'}.`,
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
  function placerJours(jours, w, dates, souples = []) { // souples[k] : course k courue en footing, sans contrainte sur la qualité ni la veille
    const oMax = Math.round((w.fin - w.debut) / JOUR), R = dates.map(t => Math.round((t - w.debut) / JOUR)), Rd = R.filter((_, k) => !souples[k]);
    if (oMax < 0 || R.some(r => r < 0 || r > oMax)) return { jours, dates: null, retires: 0 }; // dates incohérentes (plan trop court) : jours non datés
    const course = (j) => j.some(x => x.nom === 'Course');
    const libres = Array.from({ length: oMax + 1 }, (_, o) => o).filter(o => !R.includes(o));
    let autres = jours.filter(j => !course(j)), retires = 0;
    if (Rd.length) { // pas de séance de qualité à moins de 3 jours d'une course : on ne garde que celles qui ont un créneau assez éloigné
      const loin = libres.filter(o => Math.min(...Rd.map(r => Math.abs(o - r))) >= 3).length;
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
    const coût = (S) => {
      const tous = [...S, ...R].sort((a, b) => a - b), n = tous.length;
      if (n < 2) return 0;
      const cycle = oMax === 6, ecarts = tous.slice(1).map((o, k) => o - tous[k]).concat(cycle ? [7 - tous[n - 1] + tous[0]] : []);
      const ideal = cycle ? 7 / n : oMax / (n - 1);
      return ecarts.reduce((a, e) => a + (e - ideal) ** 2, 0) + 4 * S.filter(o => Rd.includes(o + 1)).length + (R.length ? 0 : 2 * (oMax - tous[n - 1]));
    };
    let meilleur = null;
    const choisir = (debut, S) => {
      if (S.length === autres.length) { const k = coût(S); if (!meilleur || k < meilleur.k - 1e-9) meilleur = { k, S: S.slice() }; return; }
      for (let i = debut; i < libres.length; i++) choisir(i + 1, [...S, libres[i]]);
    };
    choisir(0, []);
    const creneaux = meilleur ? meilleur.S : [], distCourse = (o) => (Rd.length ? Math.min(...Rd.map(r => Math.abs(o - r))) : 9);
    const attribue = new Map(); // décalage → jour
    const qualite = autres.filter(j => j[0].qualite), faciles = autres.filter(j => !j[0].qualite);
    if (Rd.length && qualite.length) { // autour d'une course, la qualité va aux créneaux les plus éloignés des courses, jamais deux jours de suite
      const tries = creneaux.slice().sort((a, b) => distCourse(b) - distCourse(a) || a - b), pris = [];
      for (const o of tries) if (pris.length < qualite.length && !pris.some(p => Math.abs(p - o) === 1)) pris.push(o);
      for (const o of tries) if (pris.length < qualite.length && !pris.includes(o)) pris.push(o); // à défaut, le plus éloigné restant
      pris.sort((a, b) => a - b).forEach((o, k) => attribue.set(o, qualite[k]));
      creneaux.filter(o => !attribue.has(o)).forEach((o, k) => attribue.set(o, faciles[k]));
    } else creneaux.forEach((o, k) => attribue.set(o, autres[k]));
    let courseK = 0;
    R.forEach(o => attribue.set(o, jours.filter(course)[courseK++]));
    const ordre = [...attribue.keys()].sort((a, b) => a - b);
    return { jours: ordre.map(o => attribue.get(o)), dates: ordre.map(o => w.debut + o * JOUR), retires };
  }

  /* ---------- Calendrier et semaines ---------- */

  /** Semaines : type, facteur de volume, niveau (1 à 10) et avancement (0 à 1) avant l'affûtage */
  // affutage3 (Pfitzinger) : 3 semaines d'affûtage pour le marathon si la préparation fait au moins 12 semaines
  function calendrier(c, doc) {
    const h = horizon(), W = h.W, nAff = W < 6 || doc.sansAffutage || (doc.bloc && state.horizon !== 'date') ? 0 : doc.affutage3 && c.dist > 30000 && W >= 12 ? 3 : W >= 10 && c.dist > 20000 ? 2 : 1;
    const N = W - nAff, B = state.charge + state.decharge;
    const d = state.difficulte, sem = [];
    for (let i = 0; i < N; i++) {
      const avance = PROGRESSION * i / Math.max(1, N - 1);
      if (state.cycle === 'constante' || doc.constant) { sem.push({ type: 'Charge', facteur: 1, niveau: d + avance, frac: i / N }); continue; }
      const p = i % B, base = d + PROGRESSION * (i - p) / Math.max(1, N - 1); // niveau au début du bloc
      sem.push(p < state.charge
        ? { type: 'Charge', facteur: 1 + CHARGE_PAS * (p - (state.charge - 1) / 2), niveau: base + 0.5 * p, frac: i / N }
        : { type: 'Décharge', facteur: DECHARGE, niveau: base - 1, frac: i / N });
    }
    ({ 3: [0.8, 0.65, 0.5], 2: [0.75, 0.55], 1: [0.6], 0: [] })[nAff].forEach(f => sem.push({ type: 'Affûtage', facteur: f, niveau: d + PROGRESSION - 2, frac: 1 }));
    const cal = sem.map((w, i) => ({ ...w, niveau: borne(w.niveau, 1, 10), ...(h.d0 ? { debut: h.d0 + i * 7 * JOUR, fin: h.d1 >= h.d0 + i * 7 * JOUR && h.d1 < h.d0 + (i * 7 + 6) * JOUR ? h.d1 : h.d0 + (i * 7 + 6) * JOUR } : {}) }));
    return { cal, alertes: h.d0 ? appliquerCompetitions(cal, c, h) : [] };
  }

  const nbDoubles = () => Math.min(state.doubles, state.seances, 6); // chaque jour de course peut être doublé, 6 au plus
  // Accélérations après un footing, une fois par semaine (lignes : { n, texte } de la méthode), +1 min par répétition
  const avecLignes = (f, L) => ({ ...f, nom: `${f.nom} et accélérations`, duree: arr5(f.duree + L.n), parts: ajoute(f.parts, { Z2: L.n * 2 / 3, Z6: L.n / 3 }),
    etapes: [...f.etapes, { t: 'effort', duree: L.n, nom: 'Accélérations' }], texte: `${f.texte.replace(/\.$/, '')}, puis ${L.n} ${L.texte}.` });

  function construire(doc, ctx) {
    const c = doc.courseMarche ? { ...ctx, courseMarche: true } : ctx; // footings et sorties longues en course-marche (Galloway)
    const { cal, alertes: aCourses } = calendrier(c, doc), nbQ0 = Math.min(doc.maxQ, state.seances <= 3 ? 1 : state.seances <= 5 ? 2 : 3);
    // Plafond de la sortie longue : slKm (km, nombre ou fonction du contexte) converti à l'allure de la sortie longue, sinon SL_MAX
    const slKm = typeof doc.slKm === 'function' ? doc.slKm(c) : doc.slKm;
    const slMax = slKm && c.profil ? slKm * (c.courseMarche ? allureGalloway(c) : (c.zones.Z2.allureRapide + c.zones.Z2.allureLente) / 2) : SL_MAX;
    const avecSL = !doc.slSi || doc.slSi(c);
    // TSS hebdomadaire de référence (volume de référence réparti selon les parts par zone, TSS d'une zone = durée (h) × IF² × 100)
    const tssRef = c.heures * c.parts.reduce((a, p, k) => a + p * window.Balance.zones()[k].iff ** 2 * 100, 0);
    // Volume de la semaine : TSS fixé par le cycle (facteur de la semaine × TSS de référence) moins le TSS des compétitions et la récupération
    // à prévoir (dette, en partie absorbée par une décharge ou un affûtage), converti en temps au TSS horaire de référence ; plancher
    // de PLANCHER_TSS de la cible ; le temps des compétitions s'y ajoute (il est retiré plus bas du volume facile)
    const volumes = cal.map(w => {
      const inter = (w.courses || []).map(x => contexteCourse(c, x.d, x.effort)), cible = w.facteur, dette = Math.max(0, (w.dette || 0) - tssRef * Math.max(0, 1 - cible));
      const fEff = tssRef > 0 && (w.tssCourses || dette) ? Math.max(PLANCHER_TSS * cible, cible - ((w.tssCourses || 0) + dette) / tssRef) : cible;
      return { inter, fEff, vol: c.heures * 60 * fEff + inter.reduce((a, x) => a + x.tObj, 0) };
    });
    // Équilibre du plan (plan personnalisé) : le temps en zone d'une compétition intermédiaire se déduit du temps prévu par la répartition pour
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
    let court = false, plafond = false, exces = 0; // volume insuffisant pour le nombre de séances ; footings plafonnés ; intensité non placée (min)
    const semaines = cal.map((w, i) => {
      // derniere : semaine de l'objectif (seulement pour une allure de référence : 5 km, 10 km, semi, marathon) : dernière semaine d'affûtage,
      // ou, si le plan va jusqu'à la date de l'objectif, dernière semaine même sans affûtage (plan court)
      const aff = w.type === 'Affûtage', l = (w.niveau - 1) / 9, derniere = i === cal.length - 1 && c.course && (aff || state.horizon === 'date');
      // courses de la semaine : compétitions intermédiaires (par date) puis objectif (dernière semaine) ; la dernière remplace la sortie longue,
      // les autres un footing chacune
      const { inter, fEff, vol } = volumes[i], cp = { ...c, parts: partsSem[i] }; // cp : parts par zone de la semaine (équilibre avec les compétitions)
      const cl = [...inter, ...(derniere ? [c] : [])], cs = cl[cl.length - 1] || null, extra = cl.slice(0, -1);
      const s = borne(Math.sqrt(c.heures * fEff / 5), 0.7, 1.4) * (aff ? 0.7 : 1);
      const phase = aff ? AFFUTAGE_PHASE : doc.phases.find(p => w.frac < p.f) || doc.phases[doc.phases.length - 1];
      const nbQ = Math.min(w.qMax ?? Infinity, w.type === 'Charge' ? nbQ0 : Math.max(1, nbQ0 - 1)); // qMax : limité autour d'une compétition
      // semaine (plan selon la répartition) : séances de qualité, lignes droites et type de sortie longue tirés des minutes par zone
      const sem = doc.semaine ? (nbQ ? doc.semaine(cp, vol, l, nbQ) : { q: [], lignes: null, sl: 'SL', exces: 0 }) : null;
      if (sem && !(w.qMax < Infinity)) exces = Math.max(exces, sem.exces); // autour d'une compétition, la qualité est volontairement limitée
      const ids = sem ? [] : typeof phase.q === 'function' ? phase.q(c) : phase.q, L = sem ? sem.lignes : doc.lignes;
      let q = sem ? sem.q : Array.from({ length: nbQ }, (_, j) => qualite(ids[(j + (doc.rotation ? i : 0)) % ids.length], l, s, c)); // rotation : une autre séance en tête chaque semaine
      // plafonds (Daniels) : temps d'effort d'une séance limité à une part du volume de la semaine (T 10 %, I 8 %, R 5 %)
      q = q.map(x => { const p = doc.plafonds && doc.plafonds[x.id]; return p && x.effort > p * vol ? qualite(x.id, l, s * p * vol / x.effort, c) : x; });
      // partQualite (Fitzgerald, 80/20) : travail de qualité de la semaine, récupérations comprises, plafonné à cette part du volume
      const totQ = q.reduce((a, x) => a + x.travail, 0), kQ = doc.partQualite && totQ ? Math.min(1, doc.partQualite * vol / totQ) : 1;
      if (kQ < 1) q = q.map(x => (x.qualite ? qualite(x.id, l, s * kQ, c) : x));
      // Test périodique (Galloway : mile magique toutes les 2 semaines) à la place de la dernière séance de qualité
      if (doc.test && !aff && q.length && i % doc.test.tous === 1) q[q.length - 1] = qualite(doc.test.id, l, s, c);
      // Volume facile (footings, footings des séances légères, sortie longue) : la sortie longue compte pour 1,5 footing,
      // entre SL_PART du volume et son plafond ; un footing ne dépasse pas la sortie longue (1 h la semaine de course).
      // Sans sortie longue (slSi), le dernier jour est un footing de plus.
      const sansSL = !cs && (!avecSL || (doc.slUneSur2 && i % 2 === 1)); // slUneSur2 : sortie longue une semaine sur deux
      const nE = Math.max(0, state.seances - q.length - 1 - extra.length), nF = nE + q.filter(x => x.leger).length + (sansSL ? 1 : 0);
      // Méthode norvégienne : chaque doublé va d'abord à un jour de seuil, avec le soir le format complémentaire (double seuil)
      const nD0 = cs ? 0 : nbDoubles();
      const iSeuil = doc.doubleSeuil ? q.map((x, j) => (SEUIL_NO[x.id] ? j : -1)).filter(j => j >= 0) : [], iPm = iSeuil.slice(0, nD0);
      // Travail au seuil de la semaine (matins et soirs) plafonné à SEUIL_PART du volume
      const totSeuil = [...iSeuil.map(j => q[j].travail), ...iPm.map(j => qualite(SEUIL_NO[q[j].id], l, s, c).travail)].reduce((a, x) => a + x, 0);
      const kS = totSeuil ? Math.min(1, SEUIL_PART * vol / totSeuil) : 1;
      if (kS < 1) iSeuil.forEach(j => { q[j] = qualite(q[j].id, l, s * kS, c); });
      const pm = iPm.map(j => ({ matin: q[j], soir: qualite(SEUIL_NO[q[j].id], l, s * kS, c) }));
      const pool = vol - [...q, ...pm.map(p => p.soir)].reduce((a, x) => a + (x.qualite ? x.duree : x.extra), 0) - cl.reduce((a, x) => a + x.tObj, 0);
      // Autres doublés (pas la semaine de course) : footing court, DOUBLE_PART d'un footing, borné à DOUBLE_BORNES, pris sur le volume facile
      const nD = nD0 - pm.length;
      const pSL = sansSL || cs ? 0 : 1.5;
      const dD = nD ? arr5(borne(DOUBLE_PART * pool / (nF + pSL + DOUBLE_PART * nD), ...DOUBLE_BORNES)) : 0, reste = pool - nD * dD;
      const sl = pSL ? arr5(Math.min(slMax, Math.max(SL_PART * vol, reste / (nF + 1.5) * 1.5))) : 0;
      const cap = derniere ? 60 : Math.min(pSL ? sl : slMax, doc.footingMax || Infinity); // footings ≤ 1 h la semaine de l'objectif
      // moyenneLongue (Pfitzinger) : un footing devient une sortie moyenne-longue (75 % de la sortie longue), hors affûtage
      const ml = doc.moyenneLongue && !aff && pSL && nE >= 2 ? arr5(0.75 * sl) : 0;
      const brut = (reste - sl - ml) / Math.max(1, nF - (ml ? 1 : 0)), dF = arr5(Math.max(EF_MIN, Math.min(brut, cap)));
      if (nF > 0 && brut < EF_MIN) court = true;
      if (brut > dF + 5 && !cs) plafond = true;
      q = q.map(x => (x.leger ? avecFooting(x, dF, c) : x));
      // Accélérations (lignes) après le premier footing de la semaine, sauf si la semaine a déjà des lignes droites (séance légère)
      const lignes = L && !cs && !q.some(x => x.leger);
      const ef = Array.from({ length: nE }, (_, k) => (ml && k === nE - 1 ? { ...footing(ml, c), nom: 'Sortie moyenne-longue' }
        : lignes && k === 0 ? avecLignes(footing(dF, c), L) : footing(dF, c)));
      // Ordre conseillé : un jour de qualité, puis un jour de footing, etc. ; la sortie longue (ou la course) en dernier
      const jours = [];
      q.forEach(x => { jours.push([x]); if (ef.length) jours.push([ef.pop()]); });
      ef.forEach(x => jours.push([x]));
      pm.forEach(p => jours.find(j => j[0] === p.matin).push({ ...p.soir, nom: `${p.soir.nom} (double seuil)` }));
      const typeSL = sem ? sem.sl : typeof phase.sl === 'function' ? phase.sl(c) : phase.sl;
      const dernier = [cs ? course(cs) : sansSL ? footing(dF, c) : longue(typeSL, sl, l, c)];
      // Doublés : d'abord les jours faciles, puis les jours de qualité (footing en plus), le jour de la sortie longue en dernier
      const libres = jours.filter(j => j.length === 1);
      [...libres.filter(j => !j[0].qualite), ...libres.filter(j => j[0].qualite), dernier].slice(0, nD)
        .forEach(j => j.push(footing(Math.min(dD, dF), c))); // pas plus long que le footing principal
      extra.forEach(x => jours.push([course(x)]));
      jours.push(dernier);
      // recupZ1 (plan selon la répartition) : footings passés en Z1 (récupération) jusqu'au temps de Z1 visé, d'abord les
      // secondes séances des doublés, puis les footings du lendemain d'une séance de qualité, puis les autres
      if (doc.recupZ1) {
        let manque = vol * cp.parts[0] - jours.flat().reduce((a, x) => a + (x.parts.Z1 || 0), 0);
        const cand = [...jours.flatMap((j, k) => j.slice(1).map(x => [k, j.indexOf(x)])),
          ...jours.map((j, k) => [k, 0]).filter(([k]) => k > 0 && jours[k - 1][0].qualite), ...jours.map((j, k) => [k, 0])];
        for (const [k, m] of cand) {
          const x = jours[k][m];
          if (manque <= 0) break;
          if (x.nom !== 'Footing' || x.etapes.length > 1 || manque < x.duree / 2) continue; // footings simples seulement (pas les accélérations)
          jours[k][m] = footing(x.duree, c, 'Z1');
          manque -= x.duree;
        }
      }
      // Mode par date : les jours sont placés sur le calendrier (courses aux dates des compétitions, objectif à la date de fin)
      if (w.debut) {
        const p = placerJours(jours, w, [...(w.courses || []).map(x => x.t), ...(derniere ? [w.fin] : [])], (w.courses || []).map(x => x.effort === 'footing'));
        if (p.retires) (w.notes = w.notes || []).push(`${p.retires} séance${p.retires > 1 ? 's' : ''} de moins cette semaine : pas de séance de qualité à moins de 3 jours d'une course, ni après la date de l'objectif.`);
        return { ...w, phase: phase.nom, jours: p.jours, dates: p.dates, seances: p.jours.flat() };
      }
      return { ...w, phase: phase.nom, jours, seances: jours.flat() };
    });
    return { semaines, court, plafond, avecSL, exces, aCourses: [...aCourses, ...aZones] };
  }

  /* ---------- Rendu ---------- */

  /** Séances d'un jour avec leur moment : un doublé place la séance d'intensité selon state.moment ;
      deux séances de même nature (double seuil, deux footings) restent matin / soir */
  function moments(j) {
    if (j.length < 2) return [['', j[0]]];
    const q = j.filter(x => x.qualite), f = j.filter(x => !x.qualite);
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
    return c;
  }

  // Règles appliquées par construire() quel que soit le plan (personnalisé ou méthode d'entraîneur), affichées sous le résumé
  const REGLES_COMMUNES = [
    "Cycle : charge constante (même volume chaque semaine), ou semaines de charge (+ 6 % de volume par semaine) suivies d'une semaine de décharge (70 % du volume, une séance de qualité en moins, un niveau plus bas).",
    "Affûtage avant l'objectif : 1 semaine (60 % du volume), 2 pour le semi et le marathon à partir de 10 semaines, 3 pour le marathon avec Pfitzinger à partir de 12 semaines ; aucun sous 6 semaines. La dernière semaine finit par la course. Le plan personnalisé n'a d'affûtage et de course que s'il va jusqu'à la date de l'objectif.",
    "Compétitions intermédiaires (plan par date) : le TSS de la course (+ 50 % pour une course à fond, impact physiologique maximal) est retranché de la cible du cycle pour sa semaine ; la récupération (25 % de ce TSS la semaine précédente, 50 % puis 25 % les deux suivantes) est prise en partie sur les semaines de décharge ou d'affûtage, déjà allégées ; volume au moins égal à 30 % de la cible.",
    "Engagement dans une compétition : à fond (allure prédite), sans forcer (10 % moins vite), à la cool (20 % moins vite) ou en footing (milieu de la Z2) ; sa durée, son TSS et sa zone sont recalculés, et c'est ce temps en zone qui est déduit de la répartition. Une course en footing ne limite pas les séances de qualité autour d'elle.",
    "Autour d'une compétition : séances de qualité limitées selon sa charge (légère, modérée ou forte), aucune à moins de 3 jours d'une course, pas de doublé la semaine de la course ; la course remplace la sortie longue (s'il y en a plusieurs, les autres remplacent un footing).",
    "Plan personnalisé : le temps d'une compétition dans sa zone est déduit de la répartition ; s'il dépasse le temps prévu cette semaine-là, les autres semaines compensent (jusqu'à la moitié de leur temps dans la zone), sinon une alerte signale que l'équilibre du plan ne peut pas être respecté.",
    "Calendrier (plan par date) : les jours sont datés, les courses tombent à leur date, les autres jours sont répartis régulièrement, en évitant la veille d'une course ; la dernière semaine s'arrête à la date de l'objectif."];

  let donnees = null; // dernier plan affiché, lu par export.js
  const brut = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  function render() {
    const c = contexte(), zones = state.mode === 'zones';
    const doc = zones ? ZONES_DOC : DOCTRINES.find(d => d.id === state.methode) || DOCTRINES[0]; // aucune méthode n'est recommandée : la première par défaut

    document.querySelectorAll('#pl-mode [data-plan]').forEach(b => {
      b.classList.toggle('actif', b.dataset.plan === state.mode);
      b.setAttribute('aria-pressed', b.dataset.plan === state.mode);
    });
    $('pl-blocMethodes').hidden = zones;
    $('eq-repartition').hidden = !zones; // la répartition par zone ne concerne que le plan personnalisé
    $('pl-contexte').innerHTML = `${c.course ? 'Objectif' : 'Allure travaillée'} <strong>${c.label}</strong>` +
      (c.profil ? ` (<strong>${fA(c.allureObj)}</strong>, ${c.course ? `chrono prédit ≈ ${E.formatTemps(c.tObj)}` : c.tObj >= 299 ? 'tenue plus de 5 h' : `tenue ≈ ${E.formatTemps(c.tObj)}`})` : '') +
      ` · volume <strong>${fD(c.heures * 60)}</strong> par semaine.` +
      (c.profil ? '' : ` Sans profil, les allures ne sont pas calculées : <button type="button" class="lien" data-vue="profil">saisir mes chronos</button>.`);

    // Fiche synthétique de chaque méthode : public, épreuves visées, difficultés, durée du plan et prérequis non remplis (alerte)
    const point = (n) => `<span class="points" aria-hidden="true">${'●'.repeat(n)}<span>${'●'.repeat(5 - n)}</span></span>`;
    $('pl-tri').value = state.tri;
    $('pl-triSens').textContent = state.triDesc ? '↓ décroissant' : '↑ croissant';
    $('pl-methodes').innerHTML = trier(DOCTRINES).map(d => {
      const F = FICHES[d.id], manque = prerequis(d, c), n = d.difficulte[0];
      return `<button type="button" class="methode${d === doc ? ' actif' : ''}" data-m="${d.id}" aria-pressed="${d === doc}">
        <strong>${d.titre}${F.ancienne ? ' <span class="badge-old" title="Méthode ancienne, issue de l\'entraînement traditionnel">old school</span>' : ''}${F.limitee ? ' <abbr title="Sources limitées : construit à partir de résumés et de forums, sans le texte de l\'auteur sur les phases et les séances">*</abbr>' : ''}</strong>
        <span class="ligne-fiche"><span class="sous">Public</span> ${F.public}</span>
        <span class="ligne-fiche"><span class="sous">Épreuves visées</span> ${epreuves(d, c)}</span>
        <span class="ligne-fiche" title="${d.difficulte[1][0].toUpperCase() + d.difficulte[1].slice(1)}."><span class="sous">Difficulté athlétique</span> ${point(n)} ${n}/5 · ${NIVEAUX_METHODE[n - 1]}</span>
        <span class="ligne-fiche"><span class="sous">Mise en œuvre</span> ${MISE[F.mise]}</span>
        <span class="ligne-fiche"><span class="sous">Durée du plan</span> ${F.plan}</span>
        ${manque.length ? `<span class="prerequis">⚠ Prérequis : ${manque.join(' ; ')}</span>` : ''}</button>`;
    }).join('');

    const { semaines, court, plafond, avecSL, exces, aCourses } = construire(doc, c), hor = horizon();
    const nD = nbDoubles(), total = state.seances + nD;
    const pl = (n, mot) => `<strong>${n}</strong> ${mot}${n > 1 ? 's' : ''}`;
    $('pl-resumeSemaine').innerHTML = `<div class="grand">${total}<small>séance${total > 1 ? 's' : ''} / semaine</small></div><ul>`
      + `<li>${pl(state.seances, 'jour')} de course</li><li>${nD ? pl(nD, 'doublé') : 'Aucun doublé'}</li><li>${pl(7 - state.seances, 'jour')} de repos</li>`
      + `<li>≈ <strong>${fD(c.heures * 60 / total)}</strong> par séance</li></ul>`;
    $('pl-titre').textContent = zones ? doc.titre : `Méthode ${doc.nom}`;
    $('pl-resume').innerHTML = `<p>${doc.resume}</p>` +
      (doc.noteProfil && doc.noteProfil(c) ? `<p class="note">${doc.noteProfil(c)}</p>` : '') +
      (doc.slNote ? `<p class="note">${doc.slNote(avecSL)}</p>` : '') +
      `<details><summary>${zones ? 'Règles de construction' : 'Principes et source'}</summary><ul class="note">${doc.principes.map(p => `<li>${p}</li>`).join('')}</ul>` +
      (zones ? '' : `<p class="note">Source : ${doc.source}</p>`) + '</details>' +
      `<details><summary>Règles communes à tous les plans (cycle, affûtage, compétitions)</summary><ul class="note">${REGLES_COMMUNES.map(p => `<li>${p}</li>`).join('')}</ul></details>`;

    const alertes = [];
    if (exces >= 1) alertes.push(`Beaucoup d'intensité pour le nombre de séances de qualité : jusqu'à ${fD(exces)} d'effort par semaine n'ont pas pu être placés (${BLOCS_MAX} blocs par séance au plus). Ajoutez des jours de course ou baissez la part d'intensité.`);
    if (court) alertes.push(`Volume juste pour ${total} séances par semaine : les footings sont portés à ${EF_MIN} min, le volume réel dépasse donc le volume de référence certaines semaines.${nD ? ' Réduisez le nombre de doublés.' : ''}`);
    if (plafond) alertes.push(`Volume élevé pour ${total} séances par semaine : les footings sont limités à ${doc.footingMax ? `${doc.footingMax} min (durée maximale conseillée par la méthode)` : 'la durée de la sortie longue'}, le volume réel reste sous le volume de référence certaines semaines. ${doc.joursMax ? `La méthode prévoit ${doc.joursMax} jours de course : baissez plutôt le volume hebdomadaire.` : 'Ajoutez des jours de course ou des doublés.'}`);
    const manque = zones ? [] : prerequis(doc, c);
    if (manque.length) alertes.push(`Prérequis de la méthode ${doc.nom} non remplis (${manque.join(' ; ')}) : avec vos données, elle perd une partie de son principe.`);
    if (nD && c.heures < DOUBLE_VOLUME) alertes.push(`Les doublés servent surtout à absorber un gros volume : sous ≈ ${DOUBLE_VOLUME} h par semaine, des séances simples un peu plus longues apportent autant, avec plus de récupération.`);
    if ((!zones || state.horizon === 'date') && hor.W < 6 && !doc.sansAffutage) alertes.push(state.horizon === 'date' ? "Moins de 6 semaines avant l'objectif : pas d'affûtage, la course finale arrive sans semaine allégée." : "Moins de 6 semaines : pas d'affûtage, le plan sert plutôt de bloc d'entraînement.");
    if (hor.invalide) alertes.push(`Renseignez le début du plan et la date de l'objectif (après le début) : en attendant, le plan fait ${state.semaines} semaines.`);
    if (hor.brut < 4) alertes.push("Moins de 4 semaines entre le début du plan et l'objectif : le plan est porté à 4 semaines et dépasse la date de l'objectif.");
    if (hor.brut > SEMAINES_MAX) alertes.push(`Plus de ${SEMAINES_MAX} semaines avant l'objectif : le plan est limité à ${SEMAINES_MAX} semaines, avancez la date de début.`);
    aCourses.forEach(a => alertes.push(a));
    $('pl-alertes').innerHTML = alertes.map(a => `<li>${a}</li>`).join('');
    $('pl-alertes').hidden = !alertes.length;
    const rapport = rapportSemaine(c);
    $('pl-alerteSemaine').innerHTML = rapport.map(a => `<li>${a}</li>`).join('');
    $('pl-alerteSemaine').hidden = !rapport.length;

    // Récapitulatif : séances, temps, distance (avec profil) et travail de qualité, par semaine et sur tout le plan
    const somme = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
    const recap = semaines.map(w => ({ n: w.seances.length, jours: w.jours.length, temps: somme(w.seances, x => x.duree),
      km: c.profil ? somme(w.seances, x => x.km) : null, qualite: somme(w.seances, x => x.travail) }));
    const tot = { n: somme(recap, r => r.n), temps: somme(recap, r => r.temps), km: c.profil ? somme(recap, r => r.km) : null, qualite: somme(recap, r => r.qualite) };
    const W = semaines.length, fKm = (x) => `${Math.round(x)} km`, totaux = recap.map(r => r.temps), max = Math.max(...totaux);
    const tuile = (label, valeur, sous) => `<div class="chiffre"><div class="label">${label}</div><div class="valeur">${valeur}</div><div class="sous">${sous}</div></div>`;
    $('pl-chiffres').innerHTML = [
      tuile('Séances', String(tot.n), `${(tot.n / W).toFixed(1).replace('.', ',')} par semaine, sur ${state.seances} jours`),
      tuile('Temps de course', fD(tot.temps), `${fD(tot.temps / W)} par semaine (référence ${fD(c.heures * 60)})`),
      tuile('Distance', tot.km === null ? '—' : `≈ ${fKm(tot.km)}`, tot.km === null ? 'profil nécessaire' : `≈ ${fKm(tot.km / W)} par semaine`),
      tuile('Travail de qualité', fD(tot.qualite), `${Math.round(100 * tot.qualite / tot.temps)} % du temps, récupérations comprises`)
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
        <summary>Semaine ${i + 1}${w.debut ? ` (${fDate(w.debut)} – ${fDate(w.fin)})` : ''} · ${etiq(w)} <span class="sous">· ${r.n} séances · ${fD(r.temps)}${r.km === null ? '' : ` · ≈ ${fKm(r.km)}`} · niveau ${Math.round(w.niveau)}/10</span></summary>
        <ol class="seances">${w.jours.map((j, k) => `<li style="--c:var(--${j[0].zone.toLowerCase()})"><span class="jour">${w.dates ? fDate(w.dates[k], true) : `Jour ${k + 1}`}${j.length > 1 ? ` · doublé${moments(j)[0][0] ? '' : ', ordre au choix'}` : ''}</span>` +
          moments(j).map(([m, x]) => `<div><strong>${m ? `${m} : ` : ''}${x.nom}</strong> <span class="sous">· ${fD(x.duree)}</span><div class="sous">${x.texte}</div></div>`).join('') + '</li>').join('')}</ol>
        <p class="note">${r.qualite ? `Travail de qualité ≈ ${fD(r.qualite)}, récupérations comprises.` : 'Pas de travail de qualité cette semaine (footings, lignes droites).'}</p>
        ${(w.notes || []).map(n => `<p class="note course">${n}</p>`).join('')}</details>`;
    }).join('');

    const premiere = semaines[0].seances.find(x => x.qualite);
    $('pl-diffLbl').textContent = `${state.difficulte}/10`;
    $('pl-diffNote').innerHTML = premiere ? `Première semaine, ${premiere.nom.toLowerCase()} : ${premiere.texte}` : 'Première semaine : footings et lignes droites (phase de fondation).';
    $('pl-cycleNb').hidden = state.cycle !== 'cycle';

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
    donnees = { titre: zones ? doc.titre : `Méthode ${doc.nom}`, mode: state.mode, methode: zones ? null : doc.id,
      contexte: { allure: c.label, allureMinKm: c.profil ? c.allureObj : null, tempsMin: c.profil ? c.tObj : null, volumeH: c.heures, jours: state.seances,
        doubles: nD, semaines: W, cycle: nomCycle(), difficulte: state.difficulte },
      repartition: ZIDS.map((z, i) => ({ zone: z, cible: Math.round(1000 * c.parts[i]) / 10, plan: Math.round(1000 * (parts[z] || 0) / totP) / 10 })),
      semaines: semaines.map((w, i) => ({ numero: i + 1, type: w.type, phase: w.phase, debut: w.debut ? new Date(w.debut).toISOString().slice(0, 10) : null, fin: w.fin ? new Date(w.fin).toISOString().slice(0, 10) : null, notes: (w.notes || []).slice(), niveau: Math.round(w.niveau), tempsMin: recap[i].temps, km: recap[i].km,
        jours: w.jours.map((j, k) => ({ jour: k + 1, date: w.dates ? new Date(w.dates[k]).toISOString().slice(0, 10) : null, seances: moments(j).map(([m, x]) => ({ moment: m, nom: x.nom, zone: x.zone, dureeMin: x.duree,
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
  $('pl-moment').value = state.moment;
  $('pl-moment').addEventListener('change', e => { state.moment = e.target.value; render(); });
  $('pl-cycle').value = state.cycle;
  $('pl-cycle').addEventListener('change', e => { state.cycle = e.target.value; render(); });
  $('pl-methodes').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { state.methode = b.dataset.m; render(); } });
  $('pl-tri').innerHTML = Object.entries(TRIS).map(([k, [nom]]) => `<option value="${k}">${nom}</option>`).join('');
  $('pl-tri').addEventListener('change', e => { state.tri = e.target.value; render(); });
  $('pl-triSens').addEventListener('click', () => { state.triDesc = !state.triDesc; render(); });
  $('pl-mode').addEventListener('click', e => { const b = e.target.closest('[data-plan]'); if (b) { state.mode = b.dataset.plan; render(); } });
  document.addEventListener('balance', render); // nouveau profil, allure cible, volume ou répartition dans Balance

  window.Plan = { donnees: () => donnees };
  render();
})();
