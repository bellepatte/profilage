/* Plan : plan d'entraînement sur plusieurs semaines, construit à partir du profil (allures, zones) et de la répartition du volume
   (objectif, volume hebdomadaire de référence), selon la méthode d'un entraîneur reconnu (sources dans CLAUDE.md).
   Les séances sont des adaptations des principes publiés, pas les plans officiels de ces entraîneurs. */
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
  const ZONE_OBJ = { '5k': 'Z5', '10k': 'Z5', semi: 'Z4', marathon: 'Z3' }; // zone de l'allure de course, sans profil
  const state = { seances: 4, doubles: 0, moment: 'indifferent', semaines: 10, cycle: 'cycle', charge: 3, decharge: 1, difficulte: 4, methode: null };

  try {
    const s = JSON.parse(localStorage.getItem('plan') || '{}');
    for (const c of Object.keys(state)) if (c in s) state[c] = s[c];
  } catch (e) { /* stockage indisponible */ }
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
    sHaut: { nom: "103 – 108 % de l'allure 1 h", min: c => [1000 / (c.vRef * 1.08), 1000 / (c.vRef * 1.03)] },
    sBas: { nom: "92 – 97 % de l'allure 1 h", min: c => [1000 / (c.vRef * 0.97), 1000 / (c.vRef * 0.92)] },
    z3: { nom: 'allure soutenue Z3', min: c => [c.zones.Z3.allureRapide, c.zones.Z3.allureLente] },
    obj: { nom: c => `allure ${c.nomObj}`, min: c => c.allureObj },
    force: { nom: c => `allure ${c.nomObj} accélérée de 2,5 %`, min: c => c.allureObj / 1.025 },
    ext: { nom: c => `90 – 95 % de la vitesse ${c.nomObj}`, min: c => [c.allureObj / 0.95, c.allureObj / 0.9] }
  };
  function al(c, cle) {
    const a = ALLURES[cle], nom = typeof a.nom === 'function' ? a.nom(c) : a.nom;
    if (!c.profil) return `à ${nom}`;
    const m = a.min(c);
    return `à ${nom} (${Array.isArray(m) ? fourchette(m) : fA(m)})`;
  }
  const zt = (c, id) => (c.profil ? `${id} (${E.allureZone(c.zones[id], true)} /km)` : id);
  /** Allure moyenne d'une zone (min/km), pour estimer les distances : milieu des bornes, Z1 à 60 % et Z6 à 125 % de l'allure 1 h */
  const aZ = (c, id) => { const z = c.zones[id]; return z.pMin === null ? 1000 / (c.vRef * 0.6) : z.pMax === null ? 1000 / (c.vRef * 1.25) : (z.allureRapide + z.allureLente) / 2; };
  /** Distance (km) de fractions : répétitions à l'allure donnée, récupérations en Z1 ; null sans profil */
  const kmS = (c, S, allure) => (c.profil ? S.n * S.r / allure + (S.n - 1) * S.rc / aZ(c, 'Z1') : null);

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
    return { travail: S.travail, km: kmS(c, S, a), texte: `${S.n} × ${fD(S.r)}${d} ${al(c, cle)}, récupération ${fD(S.rc)} ${recup}` };
  }
  function continu(c, duree, cle) {
    const t = arr5(duree), km = c.profil ? t / moy(ALLURES[cle].min(c)) : null;
    return { travail: t, km, texte: `${fD(t)} en continu${km ? ` (≈ ${km.toFixed(1).replace('.', ',')} km)` : ''} ${al(c, cle)}` };
  }
  const tRef = (c) => Math.max(c.tObj, 60); // échelle des séances à allure objectif longues (Hanson, Canova)

  // gen(l, s, c) → { travail (min, récupérations comprises), texte } ; zone 'obj' : zone de l'allure de l'objectif
  const SEANCES = {
    VMA_LONG: { nom: 'Intervalles VO2max (I)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [2, 5], [12, 24], [1, 0.7]), 'i', 'en trottinant') },
    VMA_PFITZ: { nom: 'VO2max', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [2, 5], [15, 25], [0.9, 0.5]), 'k5', 'en trottinant') },
    VMA_HANSON: { nom: 'Vitesse', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.5, 4], [12, 24], [0.8, 0.5]), 'k10', 'en trottinant') },
    VMA_TLIM: { nom: 'Fractions à VMA', zone: 'Z5', alerte: "Séance très difficile : arrêtez la série si l'allure ne tient plus, plutôt que de finir à tout prix.", gen: (l, s, c) => fractions(c, series(l, s, [2, 4], [10, 20], [1, 1]), 'vma', `à 50 % de VMA${c.profil ? ` (${fA(2000 / c.profil.V)})` : ''}`) },
    TRENTE: { nom: '30-30', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(6, Math.round(lerp(8, 20, l) * s)), nbS = Math.ceil(n / 12), par = Math.ceil(n / nbS);
      return { travail: nbS * par + (nbS - 1) * 3, km: c.profil && nbS * par * 0.75 * c.profil.V / 1000 + (nbS - 1) * 3 / aZ(c, 'Z1'), texte: `${nbS > 1 ? `${nbS} séries de ` : ''}${par} × (30 s ${al(c, 'vma')}, 30 s à 50 % de VMA${c.profil ? ` (${fA(2000 / c.profil.V)})` : ''})${nbS > 1 ? ', 3 min de trot entre les séries' : ''}` };
    } },
    INTERVALLES_LONGS: { nom: 'Intervalles longs', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [4, 8], [16, 32], [0.5, 0.25]), 'k10', 'en trottinant') },
    SEUIL: { nom: 'Seuil (T)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [5, 15], [15, 35], [0.3, 0.15]), 'seuil', 'en trottinant') },
    // Méthode norvégienne : seuil contrôlé (lactate ≈ 2 à 4 mmol/L), fractions longues le matin, courtes le soir, récupérations brèves
    SEUIL_NO_LONG: { nom: 'Seuil, fractions longues', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 2 à 3 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [5, 10], [25, 40], [0.2, 0.1], 1), 'ssLong', 'en trottinant') },
    SEUIL_NO_COURT: { nom: 'Seuil, fractions courtes', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 3 à 4 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [1.5, 3], [20, 30], [0.4, 0.2], 0.5), 'ssCourt', 'en trottinant') },
    COTES_COURTES: { nom: 'Côtes courtes', zone: 'Z6', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 0.75], [6, 12], [2.5, 2]);
      return { travail: S.travail, km: c.profil && kmS(c, S, aZ(c, 'Z6')), texte: `${S.n} × ${fD(S.r)} de montée rapide et relâchée (≈ 150 à 200 m, Z6), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
    } },
    // Coach Patrice : balayage autour de l'allure 1 h ; au-dessus, fractions assez longues pour solliciter la VO2max ;
    // en dessous, endurance ; sprints longs (S.I.T.) : 4 à 6 efforts de 30 s à 1 min, récupérations très longues
    SEUIL_HAUT: { nom: 'Au-dessus du seuil', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 6], [15, 30], [0.5, 0.3]), 'sHaut', 'en trottinant') },
    SEUIL_BAS: { nom: 'Sous le seuil', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [8, 20], [20, 45], [0.15, 0.08], 1), 'sBas', 'en trottinant') },
    SIT: { nom: 'Sprints longs (S.I.T.)', zone: 'Z6',
      alerte: "Séance nerveusement coûteuse, à faire avec un engagement maximal : arrêtez dès que vous ne pouvez plus mettre le même engagement dans la répétition suivante, même si le nombre prévu n'est pas atteint. Mieux vaut moins de répétitions à fond que toutes avec un engagement limité : c'est l'engagement qui déclenche le signal d'adaptation.",
      gen: (l, s, c) => {
        const n = Math.round(lerp(4, 6, l)), r = arrondi(lerp(0.5, 1, l)), rc = arrondi(Math.max(4, r * lerp(8, 5, l)));
        return { travail: n * r + (n - 1) * rc, km: c.profil && kmS(c, { n, r, rc }, aZ(c, 'Z6')), texte: `${n} × ${fD(r)} au plus, avec un engagement physique maximal (Z6), à plat ou en côte, récupération ${fD(rc)} en marchant ou en trottinant très lentement` };
      } },
    TEMPO: { nom: 'Tempo au seuil lactique', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(15, 40, l) * s, 'lt') },
    TEMPO_OBJ: { nom: 'Tempo à allure objectif', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(90, lerp(0.2, 0.45, l) * tRef(c) * s), 'obj') },
    FORCE: { nom: 'Force', zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [0.06, 0.12].map(x => x * tRef(c)), [0.15, 0.25].map(x => x * tRef(c)), [0.3, 0.15], 1.5), 'force', 'en trottinant') },
    SPE: { nom: 'Allure spécifique', zone: 'obj', gen: (l, s, c) => {
      const p = SPE[c.goal], T = c.tObj;
      return fractions(c, series(l, s, p.rep.map(x => x * T), p.tot.map(x => Math.min(90, x * T)), [0.5, 0.2], 1), 'obj', 'en trottinant');
    } },
    SPE_EXT: { nom: 'Spécifique long', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(100, lerp(0.25, 0.5, l) * tRef(c) * s), 'ext') },
    VITESSE: { nom: 'Vitesse (R)', zone: 'Z6', gen: (l, s, c) => fractions(c, series(l, s, [0.5, 1.25], [4, 8], [3, 2]), 'r', 'en marchant ou en trottinant (récupération complète)') },
    COTES: { nom: 'Côtes', zone: 'Z5', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 1.5], [5, 12], [2.5, 1.5]);
      return { travail: S.travail, km: c.profil && kmS(c, S, aZ(c, 'Z5')), texte: `${S.n} × ${fD(S.r)} de montée à effort soutenu (Z5, à la sensation), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
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
  function qualite(id, l, s, c) {
    const S = SEANCES[id], r = S.gen(l, s, c), zone = S.zone === 'obj' ? c.zoneObj : S.zone;
    if (S.leger) return { nom: S.nom, zone, leger: true, travail: 0, extra: r.travail, lignes: r.texte };
    return { id, nom: S.nom, zone, qualite: true, travail: r.travail, duree: arr5(ECHAUFFEMENT + RETOUR + r.travail),
      km: c.profil ? (ECHAUFFEMENT + RETOUR) / aZ(c, 'Z2') + r.km : null,
      texte: `Échauffement ${ECHAUFFEMENT} min en Z2 · ${r.texte} · retour au calme ${RETOUR} min en Z1.${S.alerte ? ` <strong class="doute">${S.alerte}</strong>` : ''}${S.conseil ? ` <em>${S.conseil}</em>` : ''}` };
  }
  const avecFooting = (x, d, c) => ({ ...x, duree: arr5(d + x.extra), km: c.profil ? (d + x.extra) / aZ(c, 'Z2') : null,
    texte: `Footing ${fD(d)} en ${zt(c, 'Z2')}, puis ${x.lignes}.` });
  function longue(type, d, l, c) {
    const spe = type === 'SL_SPE' && c.dist > 20000, p = spe ? arr5(lerp(0.15, 0.35, l) * d) : 0;
    return { nom: 'Sortie longue', zone: 'Z2', duree: d, travail: p, km: c.profil ? (d - p) / aZ(c, 'Z2') + p / c.allureObj : null,
      texte: `${fD(d)} en ${zt(c, 'Z2')}${spe ? `, dont ${fD(p)} en fin de sortie ${al(c, 'obj')}` : ''}.` };
  }
  const footing = (d, c, z = 'Z2') => ({ nom: z === 'Z1' ? 'Footing très facile' : 'Footing', zone: z, duree: d, travail: 0,
    km: c.profil ? d / aZ(c, z) : null, texte: `${fD(d)} en ${zt(c, z)}.` });
  const course = (c) => ({ nom: 'Course', zone: c.zoneObj, duree: c.tObj, travail: 0, km: c.dist / 1000,
    texte: `${c.label}${c.profil ? ` : objectif ≈ ${E.formatTemps(c.tObj)}, ${al(c, 'obj')}` : ''}. Échauffement léger avant le départ.` });

  /* ---------- Méthodes ---------- */

  // phases : f = fin de la phase en part des semaines avant l'affûtage ; q = séances de qualité par ordre de priorité ; sl = sortie longue.
  // score : adéquation à l'objectif (0 à 3) ; ie : poids du biais d'indice d'endurance (+ : favorisée par une bonne endurance)
  const DOCTRINES = [
    { id: 'daniels', nom: 'Daniels', titre: 'Jack Daniels : quatre phases, allures E, M, T, I, R',
      source: "Daniels J., Daniels' Running Formula, Human Kinetics (3e éd. 2014).",
      resume: "Chaque séance a un but précis et une allure tirée du niveau du coureur : endurance (E), marathon (M), seuil (T), intervalles VO2max (I), répétitions de vitesse (R). Quatre phases : fondation, qualité initiale, transition (la plus dure), qualité finale.",
      principes: ['Deux séances de qualité par semaine, plus une sortie longue.', "Seuil (T) : répétitions de 5 à 15 min, environ 1 min de récupération pour 5 min d'effort.",
        "Intervalles (I) : 3 à 5 min, récupération égale ou un peu plus courte que l'effort.", "Répétitions (R) : courtes et rapides, récupération complète (2 à 3 fois l'effort).",
        'Sortie longue limitée à environ 25 % du volume hebdomadaire et 2 h 30.'],
      maxQ: 2, score: { '5k': 2, '10k': 2.5, semi: 2.5, marathon: 2 },
      difficulte: [3, 'allures précises à respecter, phase de transition exigeante'],
      phases: [{ nom: 'Fondation', f: 0.2, q: ['EF_LD', 'EF_LD'], sl: 'SL' }, { nom: 'Qualité initiale', f: 0.45, q: ['VITESSE', 'SEUIL'], sl: 'SL' },
        { nom: 'Transition', f: 0.75, q: ['VMA_LONG', 'SEUIL'], sl: 'SL' }, { nom: 'Qualité finale', f: 1, q: ['SEUIL', 'SPE'], sl: 'SL_SPE' }] },
    { id: 'lydiard', nom: 'Lydiard', titre: "Arthur Lydiard : la pyramide, du foncier à l'affûtage",
      source: 'Lydiard A., Gilmour G., Running with Lydiard, Hodder & Stoughton (1983 ; 2e éd. 2000).',
      resume: "Périodisation en pyramide : une longue base aérobie (beaucoup de volume, en partie à allure soutenue), puis une phase de côtes (force), une courte phase anaérobie (fractionné) et enfin coordination et affûtage.",
      principes: ['Le volume aérobie est la base de tout le reste.', 'Côtes : montées et bondissements pour la force, récupération en descendant.',
        "Le travail anaérobie vient tard et dure peu (environ 4 semaines).", 'Sortie longue chaque semaine, à allure confortable.'],
      maxQ: 3, ie: -0.5, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [2, "longue base aérobie, intensité tardive et progressive ; demande surtout du temps"],
      phases: [{ nom: 'Base aérobie', f: 0.45, q: ['SOUTENU', 'FARTLEK', 'EF_LD'], sl: 'SL' }, { nom: 'Côtes', f: 0.65, q: ['COTES', 'SOUTENU', 'COTES'], sl: 'SL' },
        { nom: 'Anaérobie', f: 0.88, q: ['VMA_LONG', 'COTES', 'VITESSE'], sl: 'SL' }, { nom: 'Coordination', f: 1, q: ['SPE', 'VITESSE', 'SOUTENU'], sl: 'SL' }] },
    { id: 'seiler', nom: 'Seiler', titre: 'Stephen Seiler : entraînement polarisé (80/20)',
      source: 'Seiler S., What is best practice for training intensity and duration distribution in endurance athletes?, Int J Sports Physiol Perform 2010 ; Seiler S. et al., Scand J Med Sci Sports 2013 (intervalles 4 × 4, 4 × 8 et 4 × 16 min).',
      resume: "Environ 80 % des séances en faible intensité, le reste en haute intensité, très peu en zone intermédiaire. Les intervalles longs (4 à 8 min, 2 min de récupération) sont la séance type.",
      principes: ['Facile vraiment facile (Z1-Z2), dur vraiment dur : éviter la « zone grise ».', 'Deux séances intenses par semaine suffisent, même à gros volume.',
        "Séance type : 4 × 8 min à effort élevé et régulier, 2 min de récupération (meilleure progression que 4 × 4 ou 4 × 16 min dans son étude sur des cyclistes de loisir entraînés).",
        "La répartition 80/20 se compte en séances plutôt qu'en temps."],
      maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2, marathon: 2 },
      difficulte: [1, 'deux séances dures au plus, tout le reste vraiment facile : simple à suivre'],
      phases: [{ nom: 'Développement', f: 0.7, q: ['INTERVALLES_LONGS', 'VMA_LONG'], sl: 'SL' }, { nom: 'Spécifique', f: 1, q: ['INTERVALLES_LONGS', 'SPE'], sl: 'SL' }] },
    { id: 'pfitzinger', nom: 'Pfitzinger', titre: 'Pete Pfitzinger : mésocycles et seuil lactique',
      source: 'Pfitzinger P., Douglas S., Advanced Marathoning, Human Kinetics (2e éd. 2009) ; Faster Road Racing, Human Kinetics (2015).',
      resume: "Mésocycles successifs : endurance, seuil lactique et endurance, préparation à la course, affûtage. Le tempo au seuil lactique et les sorties longues (avec allure marathon) sont le cœur ; le VO2max arrive en fin de préparation.",
      principes: ['Tempo continu de 20 à 40 min à allure 15 km – semi-marathon.', "VO2max : 600 à 1600 m à allure 5 km, récupération de 50 à 90 % du temps d'effort.",
        'Sorties longues avec une partie à allure marathon en préparation spécifique.', "Affûtage de 3 semaines pour le marathon (2 ici au plus)."],
      maxQ: 2, score: { '5k': 1, '10k': 1.5, semi: 3, marathon: 3 },
      difficulte: [4, 'tempos longs et sorties longues avec allure marathon, pensé pour de gros volumes'],
      phases: [{ nom: 'Endurance', f: 0.3, q: ['TEMPO', 'EF_LD'], sl: 'SL' }, { nom: 'Seuil et endurance', f: 0.65, q: ['TEMPO', 'SEUIL'], sl: 'SL_SPE' },
        { nom: 'Préparation à la course', f: 1, q: ['VMA_PFITZ', 'TEMPO'], sl: 'SL_SPE' }] },
    { id: 'hanson', nom: 'Hanson', titre: 'Méthode Hanson : fatigue cumulée',
      source: 'Humphrey L., Hanson K., Hanson K., Hansons Marathon Method, VeloPress (2012 ; 2e éd. 2016).',
      resume: "Trois séances clés par semaine (vitesse puis force, tempo à allure objectif, sortie longue) et des footings presque tous les jours : on aborde les séances avec une fatigue accumulée, qui simule la fin de course. La sortie longue est plafonnée (environ 26 km).",
      principes: ['Vitesse (première moitié) : répétitions à allure 5 – 10 km.', "Force (seconde moitié) : répétitions longues un peu plus vite que l'allure objectif, récupération courte.",
        'Tempo : longue portion continue à allure objectif, allongée au fil des semaines.', 'Six jours de course par semaine dans le plan original.'],
      maxQ: 2, slKm: 26, seancesMin: 5, score: { '5k': 1, '10k': 1.5, semi: 2.5, marathon: 3 },
      difficulte: [4, 'six jours de course par semaine et séances clés enchaînées sur une fatigue accumulée'],
      phases: [{ nom: 'Vitesse', f: 0.45, q: ['VMA_HANSON', 'TEMPO_OBJ'], sl: 'SL' }, { nom: 'Force', f: 1, q: ['FORCE', 'TEMPO_OBJ'], sl: 'SL' }] },
    { id: 'canova', nom: 'Canova', titre: "Renato Canova : l'entonnoir de la spécificité",
      source: "Canova R., conférences et entretiens sur la périodisation du demi-fond et du marathon (pas d'ouvrage de référence unique).",
      resume: "Du général au spécifique : un travail varié au début (côtes, fartlek, seuil), puis un resserrement progressif (« entonnoir ») vers des séances longues proches de l'allure de course (95 à 105 %).",
      principes: ['Période générale : côtes, fartlek, allures variées.', 'Période fondamentale : seuil, allure de course sur portions courtes.',
        "Période spécifique : beaucoup de volume à 95 – 105 % de l'allure de course, sorties longues rapides à 90 – 95 %.", 'Méthode exigeante, pensée pour des coureurs expérimentés.'],
      maxQ: 3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [5, "gros volume proche de l'allure de course, conçu pour des coureurs de haut niveau"],
      phases: [{ nom: 'Générale', f: 0.3, q: ['FARTLEK', 'COTES', 'EF_LD'], sl: 'SL' }, { nom: 'Fondamentale', f: 0.6, q: ['SEUIL', 'SPE', 'COTES'], sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: ['SPE', 'SPE_EXT', 'SEUIL'], sl: 'SL_SPE' }] },
    { id: 'billat', nom: 'Billat', titre: 'Véronique Billat : intervalles à VMA',
      source: 'Billat L. V., Interval training for performance: a scientific and empirical practice, Sports Med 2001 (parties 1 et 2).',
      resume: "Le temps passé à VMA est le levier principal du 5 et du 10 km. Deux formats : le 30-30 (30 s à VMA, 30 s à 50 % de VMA), qui accumule beaucoup de temps à VMA, et des fractions à VMA d'environ la moitié du temps limite (2 à 4 min), récupération de même durée.",
      principes: ['30-30 : 30 s à VMA, 30 s de récupération active à 50 % de VMA.', 'Fractions longues à VMA : environ la moitié du temps limite, récupération de même durée.',
        'Seuil en complément, une fois par semaine.', 'Allure de course en fin de préparation.'],
      maxQ: 2, ie: 0.5, score: { '5k': 3, '10k': 3, semi: 1.5, marathon: 1 },
      difficulte: [4, 'les fractions longues à VMA (2 à 4 min, phase « VMA longue ») sont très éprouvantes ; le 30-30 et le seuil, eux, restent accessibles'],
      phases: [{ nom: 'VMA courte', f: 0.4, q: ['TRENTE', 'SEUIL'], sl: 'SL' }, { nom: 'VMA longue', f: 0.8, q: ['VMA_TLIM', 'SEUIL'], sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: ['SPE', 'TRENTE'], sl: 'SL' }] }
  ];
  const SEUIL_NO = { SEUIL_NO_LONG: 'SEUIL_NO_COURT', SEUIL_NO_COURT: 'SEUIL_NO_LONG' }; // séance du soir d'un double seuil
  const SEUIL_PART = 0.2; // méthode norvégienne : travail au seuil de la semaine ≤ 20 % du volume (hypothèse)
  // Note de difficulté des méthodes (1 adaptée aux débutants … 5 coureurs avancés) : appréciation, pas une donnée publiée
  const NIVEAUX_METHODE = ['Débutant', 'Accessible', 'Intermédiaire', 'Confirmé', 'Avancé'];
  DOCTRINES.push({ id: 'norvegien', nom: 'norvégienne', titre: 'Méthode norvégienne : double seuil',
    source: 'Bakken M., « The Norwegian model » (site personnel) ; Tjelta L. I., Int J Sports Sci Coach 2019 (frères Ingebrigtsen) ; Casado A., Foster C., Bakken M., Tjelta L. I., Int J Environ Res Public Health 2023.',
    resume: "Beaucoup de volume facile et deux journées « double seuil » par semaine : fractions longues le matin, fractions courtes le soir, à une intensité contrôlée juste sous le seuil (idéalement au lactatomètre), plus une séance de côtes courtes et une sortie longue.",
    principes: ['Deux jours par semaine à deux séances au seuil (matin : fractions longues, soir : fractions courtes), récupérations brèves.',
      "Intensité contrôlée, sous le seuil : lactate ≈ 2 à 4 mmol/L, ou à la sensation en finissant capable d'en faire plus.",
      'Une séance courte et rapide (côtes de 200 m) en fin de semaine, le reste en footing vraiment facile.',
      'Sans doublé, variante amateur : les séances au seuil se font en séances simples.'],
    maxQ: 3, ie: -0.25, doubleSeuil: true,
    sansDouble: ['Sans doublé : variante simple', 'Sans doublé, pas de double seuil : les séances au seuil se font en séances simples (variante amateur).'], score: { '5k': 2.5, '10k': 3, semi: 2.5, marathon: 2 },
    difficulte: [4, 'deux journées à double séance au seuil par semaine : intensité modérée mais volume de qualité très élevé ; sans doublé, la variante en séances simples est plus accessible'],
    phases: [{ nom: 'Développement', f: 0.75, q: ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'COTES_COURTES'], sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SPE'], sl: 'SL' }] });
  DOCTRINES.push({ id: 'patrice', nom: 'Coach Patrice', titre: 'Coach Patrice : fréquence, biomécanique et seuil',
    source: 'Méthode de Coach Patrice (principes transmis directement, non publiés).',
    resume: "La fréquence avant tout : courir le plus souvent possible (doublés recommandés), surtout en Z1 et sur des séances courtes, pour gagner en coordination et en économie de course avec peu de fatigue. L'énergie économisée sert à des séances de seuil équilibrées autour de l'allure 1 h, avec des microcycles de sprints longs (S.I.T.) en Z6.",
    principes: ["Fréquence au maximum de l'emploi du temps, atteinte progressivement : au moins 6 séances par semaine, idéalement avec un doublé ; au moins un jour sans course à pied.",
      "Footings surtout en Z1 (bien plus qu'en Z2), courts (30 min est une bonne base) : gains biomécaniques plutôt que charge aérobie.",
      "Seuil équilibré autour de l'allure 1 h : au-dessus, fractions assez longues pour solliciter la VO2max ; en dessous, endurance.",
      "Microcycles de sprints longs (S.I.T.) à la place de la séance au-dessus du seuil : 2 semaines toutes les 6 semaines, ou 3 toutes les 8 ; 4 à 6 efforts de 30 s à 1 min, à plat ou en côte, récupérations très longues, engagement maximal. Séance nerveusement coûteuse : peu de séances successives, arrêt dès que l'engagement baisse.",
      'Lignes droites de 15 s en Z6, fluides et relâchées, après 1 ou 2 footings faciles chaque semaine (nombre selon le volume).',
      "Charge constante : décharge seulement à l'approche de l'échéance, surtout si l'objectif est long.",
      "Sortie longue seulement si la fréquence et le volume restent faibles et que l'objectif dure plus d'une heure."],
    maxQ: 2, sit: true, lignesDroites: true, frequence: true, zoneFooting: 'Z1', footingMax: 50, doublePart: 1, rampeFrequence: 0.3, joursMax: 6, totalMin: 6,
    slSi: (c) => c.tObj > 60 && state.seances + nbDoubles() <= FREQ_FAIBLE && c.heures <= VOLUME_FAIBLE,
    sansDouble: ['Sans doublé : fréquence limitée', 'Le bi-quotidien est recommandé : sans doublé, la fréquence (levier principal de la méthode) reste limitée.'],
    score: { '5k': 3, '10k': 3, semi: 3, marathon: 2 },
    difficulte: [3, "fréquence élevée et doublés à caser dans l'emploi du temps ; intensité maîtrisée et fatigue recherchée minimale"],
    phases: [{ nom: 'Progression de la fréquence', f: 0.3, q: ['SEUIL_BAS', 'SEUIL_HAUT'], sl: 'SL' },
      { nom: 'Développement', f: 1, q: ['SEUIL_HAUT', 'SEUIL_BAS'], sl: 'SL' }] });
  const FREQ_FAIBLE = 6, VOLUME_FAIBLE = 5; // Coach Patrice : séances par semaine et volume (h) jusqu'auxquels la sortie longue est gardée
  const AFFUTAGE_PHASE = { nom: 'Affûtage', q: ['SPE', 'SEUIL'], sl: 'SL' };

  // Affinité de chaque méthode avec le type de cycle : [effet sur le score, explication] (lecture des principes généraux
  // des auteurs, à vérifier) ; une méthode absente ou un cycle absent est neutre
  const CYCLES = {
    daniels: { constante: [0.25, 'Daniels conseille de garder une même charge 3 à 4 semaines avant de l\'augmenter : la charge constante s\'en rapproche.'] },
    lydiard: { constante: [0.25, 'Lydiard progresse par phases, sans semaines de décharge programmées : la charge constante lui correspond.'] },
    pfitzinger: { cycle: [0.5, 'Les mésocycles de Pfitzinger intègrent des semaines de récupération : le cycle charge / décharge suit son schéma.'],
      constante: [-0.25, 'Sans semaine de récupération, le schéma en mésocycles de Pfitzinger est moins bien respecté.'] },
    hanson: { constante: [0.5, 'Hanson monte la charge progressivement, sans semaine allégée : la fatigue cumulée est le principe de la méthode.'],
      cycle: [-0.5, 'Les semaines de décharge cassent la fatigue cumulée recherchée par la méthode Hanson.'] },
    patrice: { constante: [0.5, "Charge constante recherchée : décharge seulement à l'approche de l'échéance."],
      cycle: [-0.5, "Des semaines de décharge régulières ne font pas partie de la méthode : décharge seulement avant l'échéance."] },
    norvegien: { constante: [0.25, 'La méthode norvégienne garde une semaine type stable, avec une charge régulière : la charge constante lui correspond.'] },
    canova: { cycle: [0.25, 'Canova alterne des blocs de travail et des périodes de régénération : le cycle charge / décharge s\'en rapproche.'] }
  };
  // Affinité avec les doublés (au moins un jour à deux séances) : [effet, explication], à vérifier comme CYCLES
  const DOUBLES = {
    canova: [0.25, 'Les coureurs entraînés par Canova doublent souvent : footing léger en plus des séances.'],
    pfitzinger: [0.25, 'Pfitzinger ajoute des footings de récupération en doublé dans ses plans à gros volume.'],
    hanson: [-0.25, 'La méthode Hanson repose sur une séance par jour, presque tous les jours, plutôt que sur des doublés.'],
    patrice: [0.75, 'Bi-quotidien recommandé : la fréquence est le levier principal de la méthode.'],
    norvegien: [0.75, 'Le double seuil est le cœur de la méthode : chaque doublé sert d\'abord à un jour de seuil (deux séances au seuil).']
  };
  const biais = (c) => (c.profil ? borne((c.profil.IE + 7) / 3, -1, 1) : 0); // même convention que Balance
  const nomCycle = () => (state.cycle === 'cycle' ? `cycle ${state.charge} + ${state.decharge}` : 'charge constante');

  /** Facteurs du classement : { effet, texte (pastille), detail (info-bulle) } ; le score est leur somme */
  function facteurs(d, c) {
    const s = d.score[c.goal], f = [{ effet: s, texte: `${c.label} : ${s >= 2.5 ? 'très adaptée' : s >= 2 ? 'adaptée' : s >= 1.5 ? 'possible' : 'peu adaptée'}`,
      detail: `Adéquation de la méthode à l'objectif ${c.nomObj} (${s}/3).` }];
    const ie = (d.ie || 0) * biais(c);
    if (Math.abs(ie) >= 0.15) f.push({ effet: ie, texte: `Indice ${c.profil.IE.toFixed(1).replace('.', ',')} : ${ie > 0 ? 'favorable' : 'défavorable'}`,
      detail: d.ie < 0 ? 'Méthode centrée sur le développement de l\'endurance : plus utile si votre indice est bas.' : 'Méthode centrée sur la VMA : plus utile si votre endurance est déjà bonne.' });
    if (d.seancesMin && state.seances < d.seancesMin) f.push({ effet: -1, texte: `${state.seances} jours : trop peu`, detail: `La méthode demande au moins ${d.seancesMin} jours de course par semaine.` });
    const cy = (CYCLES[d.id] || {})[state.cycle];
    if (cy) f.push({ effet: cy[0], texte: `${nomCycle()[0].toUpperCase() + nomCycle().slice(1)} : ${cy[0] > 0 ? 'adapté' : 'peu adapté'}`, detail: cy[1] });
    const db = nbDoubles() && DOUBLES[d.id];
    if (db) f.push({ effet: db[0], texte: `Doublés : ${db[0] > 0 ? 'adaptés' : 'peu adaptés'}`, detail: db[1] });
    if (d.sansDouble && !nbDoubles()) f.push({ effet: -0.5, texte: d.sansDouble[0], detail: d.sansDouble[1] });
    const tot = state.seances + nbDoubles();
    if (d.totalMin && tot < d.totalMin) f.push({ effet: -1, texte: `${tot} séances : trop peu`, detail: `La méthode demande au moins ${d.totalMin} séances par semaine, idéalement avec un doublé.` });
    if (d.joursMax && state.seances > d.joursMax) f.push({ effet: -0.5, texte: `${state.seances} jours : pas de repos`, detail: `La méthode garde au moins un jour sans course à pied par semaine (${d.joursMax} jours au plus).` });
    return f;
  }
  const score = (d, c) => facteurs(d, c).reduce((a, x) => a + x.effet, 0);
  /** Pastille rouge (défavorable) : objectif peu adapté (1er facteur ≤ 1,5) ou autre facteur négatif */
  const rouge = (x, i) => (i === 0 ? x.effet <= 1.5 : x.effet < 0);

  /* ---------- Calendrier et semaines ---------- */

  /** Semaines : type, facteur de volume, niveau (1 à 10) et avancement (0 à 1) avant l'affûtage */
  function calendrier(c) {
    const W = state.semaines, nAff = W < 6 ? 0 : W >= 10 && c.dist > 20000 ? 2 : 1, N = W - nAff, B = state.charge + state.decharge;
    const d = state.difficulte, sem = [];
    for (let i = 0; i < N; i++) {
      const avance = PROGRESSION * i / Math.max(1, N - 1);
      if (state.cycle === 'constante') { sem.push({ type: 'Charge', facteur: 1, niveau: d + avance, frac: i / N }); continue; }
      const p = i % B, base = d + PROGRESSION * (i - p) / Math.max(1, N - 1); // niveau au début du bloc
      sem.push(p < state.charge
        ? { type: 'Charge', facteur: 1 + CHARGE_PAS * (p - (state.charge - 1) / 2), niveau: base + 0.5 * p, frac: i / N }
        : { type: 'Décharge', facteur: DECHARGE, niveau: base - 1, frac: i / N });
    }
    (nAff === 2 ? [0.75, 0.55] : nAff ? [0.6] : []).forEach(f => sem.push({ type: 'Affûtage', facteur: f, niveau: d + PROGRESSION - 2, frac: 1 }));
    return sem.map(w => ({ ...w, niveau: borne(w.niveau, 1, 10) }));
  }

  const nbDoubles = () => Math.min(state.doubles, state.seances, 6); // chaque jour de course peut être doublé, 6 au plus
  // Microcycles de sprints longs, une séance par semaine à partir de la 2e : 2 semaines toutes les 6 semaines, ou
  // 3 semaines toutes les 8 si la préparation dépasse 12 semaines
  const sitSemaine = (i, n) => { const [nb, ecart] = n > 12 ? [3, 8] : [2, 6]; return i % ecart >= 1 && i % ecart <= nb; };
  // Lignes droites de 15 s en Z6 après un footing : 1 footing par semaine sous 5 h, 2 au-delà ; 4 à 10 répétitions selon le volume
  const LD_FOOTINGS = (h) => (h < 5 ? 1 : 2), LD_REPS = (h) => borne(Math.round(2 + h), 4, 10);
  const avecLignes = (f, n) => ({ ...f, nom: `${f.nom} et lignes droites`, duree: arr5(f.duree + n),
    texte: `${f.texte.replace(/\.$/, '')}, puis ${n} lignes droites de 15 s (Z6, fluides et relâchées), retour en marchant entre chacune.` });

  function construire(doc, c) {
    const cal = calendrier(c), nbQ0 = Math.min(doc.maxQ, state.seances <= 3 ? 1 : state.seances <= 5 ? 2 : 3);
    const slMax = doc.slKm && c.profil ? doc.slKm * (c.zones.Z2.allureRapide + c.zones.Z2.allureLente) / 2 : SL_MAX;
    const nPre = cal.filter(w => w.type !== 'Affûtage').length, avecSL = !doc.slSi || doc.slSi(c), zF = doc.zoneFooting || 'Z2';
    let court = false, plafond = false; // volume insuffisant pour le nombre de séances ; footings plafonnés
    const semaines = cal.map((w, i) => {
      const aff = w.type === 'Affûtage', l = (w.niveau - 1) / 9, vol = c.heures * 60 * w.facteur, derniere = aff && i === cal.length - 1;
      const s = borne(Math.sqrt(c.heures * w.facteur / 5), 0.7, 1.4) * (aff ? 0.7 : 1);
      const phase = aff ? AFFUTAGE_PHASE : doc.phases.find(p => w.frac < p.f) || doc.phases[doc.phases.length - 1];
      const nbQ = w.type === 'Charge' ? nbQ0 : Math.max(1, nbQ0 - 1);
      let q = Array.from({ length: nbQ }, (_, j) => qualite(phase.q[j % phase.q.length], l, s, c));
      // Microcycle de sprints longs (Coach Patrice) : remplace la séance au-dessus du seuil (autre mode de sollicitation de la VO2max)
      const iHaut = q.findIndex(x => x.id === 'SEUIL_HAUT');
      if (doc.sit && !aff && sitSemaine(i, nPre) && iHaut >= 0) q[iHaut] = qualite('SIT', l, s, c);
      // Volume facile (footings, footings des séances légères, sortie longue) : la sortie longue compte pour 1,5 footing,
      // entre SL_PART du volume et son plafond ; un footing ne dépasse pas la sortie longue (1 h la semaine de course).
      // Sans sortie longue (slSi), le dernier jour est un footing de plus.
      const sansSL = !derniere && !avecSL;
      const nE = state.seances - q.length - 1, nF = nE + q.filter(x => x.leger).length + (sansSL ? 1 : 0);
      // Méthode norvégienne : chaque doublé va d'abord à un jour de seuil, avec le soir le format complémentaire (double seuil).
      // Progression de la fréquence (rampeFrequence) : les doublés arrivent peu à peu sur cette part des semaines
      const rampe = doc.rampeFrequence ? Math.min(1, (i + 1) / Math.max(1, Math.round(doc.rampeFrequence * nPre))) : 1;
      // la rampe ne descend pas sous le minimum de séances de la méthode (totalMin)
      const nD0 = derniere ? 0 : Math.min(nbDoubles(), Math.max(Math.round(nbDoubles() * rampe), (doc.totalMin || 0) - state.seances));
      const iSeuil = doc.doubleSeuil ? q.map((x, j) => (SEUIL_NO[x.id] ? j : -1)).filter(j => j >= 0) : [], iPm = iSeuil.slice(0, nD0);
      // Travail au seuil de la semaine (matins et soirs) plafonné à SEUIL_PART du volume
      const totSeuil = [...iSeuil.map(j => q[j].travail), ...iPm.map(j => qualite(SEUIL_NO[q[j].id], l, s, c).travail)].reduce((a, x) => a + x, 0);
      const kS = totSeuil ? Math.min(1, SEUIL_PART * vol / totSeuil) : 1;
      if (kS < 1) iSeuil.forEach(j => { q[j] = qualite(q[j].id, l, s * kS, c); });
      const pm = iPm.map(j => ({ matin: q[j], soir: qualite(SEUIL_NO[q[j].id], l, s * kS, c) }));
      const pool = vol - [...q, ...pm.map(p => p.soir)].reduce((a, x) => a + (x.qualite ? x.duree : x.extra), 0) - (derniere ? c.tObj : 0);
      // Autres doublés (pas la semaine de course) : footing court, DOUBLE_PART d'un footing, borné à DOUBLE_BORNES, pris sur le volume facile
      const nD = nD0 - pm.length;
      const dP = doc.doublePart || DOUBLE_PART, pSL = sansSL || derniere ? 0 : 1.5;
      const dD = nD ? arr5(borne(dP * pool / (nF + pSL + dP * nD), ...DOUBLE_BORNES)) : 0, reste = pool - nD * dD;
      const sl = pSL ? arr5(Math.min(slMax, Math.max(SL_PART * vol, reste / (nF + 1.5) * 1.5))) : 0;
      const cap = derniere ? 60 : Math.min(pSL ? sl : Infinity, doc.footingMax || Infinity);
      const brut = (reste - sl) / Math.max(1, nF), dF = arr5(Math.max(EF_MIN, Math.min(brut, cap)));
      if (nF > 0 && brut < EF_MIN) court = true;
      if (brut > dF + 5 && !derniere) plafond = true;
      q = q.map(x => (x.leger ? avecFooting(x, dF, c) : x));
      // Lignes droites (Coach Patrice) sur 1 ou 2 footings de la semaine, nombre selon le volume
      const ef = Array.from({ length: nE }, (_, k) => (doc.lignesDroites && !derniere && k < LD_FOOTINGS(c.heures)
        ? avecLignes(footing(dF, c, zF), LD_REPS(c.heures)) : footing(dF, c, zF)));
      // Ordre conseillé : un jour de qualité, puis un jour de footing, etc. ; la sortie longue (ou la course) en dernier
      const jours = [];
      q.forEach(x => { jours.push([x]); if (ef.length) jours.push([ef.pop()]); });
      ef.forEach(x => jours.push([x]));
      pm.forEach(p => jours.find(j => j[0] === p.matin).push({ ...p.soir, nom: `${p.soir.nom} (double seuil)` }));
      const dernier = [derniere ? course(c) : sansSL ? footing(dF, c, zF) : longue(phase.sl, sl, l, c)];
      // Doublés : d'abord les jours faciles, puis les jours de qualité (footing en plus), le jour de la sortie longue en dernier
      const libres = jours.filter(j => j.length === 1);
      [...libres.filter(j => !j[0].qualite), ...libres.filter(j => j[0].qualite), dernier].slice(0, nD)
        .forEach(j => j.push(footing(Math.min(dD, dF), c, zF))); // pas plus long que le footing principal
      jours.push(dernier);
      return { ...w, phase: phase.nom, jours, seances: jours.flat() };
    });
    return { semaines, court, plafond, avecSL };
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
    const b = window.Balance.contexte(), p = b.profil;
    const pred = p && E.tablePredictions(p, [b.dist])[0], ok = pred && Number.isFinite(pred.temps);
    const c = { goal: b.goal, label: b.label, nomObj: b.label.toLowerCase(), dist: b.dist, heures: b.heures, profil: ok ? p : null,
      tObj: ok ? pred.temps : b.dist / (10000 / 60), zoneObj: ZONE_OBJ[b.goal] }; // sans profil : 10 km/h
    if (c.profil) {
      const zones = E.zones(p);
      Object.assign(c, { vRef: E.vitesseReference(p), allureObj: pred.allureMinKm, zones: Object.fromEntries(zones.map(z => [z.id, z])) });
      const pct = 100 * (1000 / c.allureObj) / c.vRef;
      c.zoneObj = (zones.find(z => pct < (z.pMax ?? Infinity)) || zones[5]).id;
    }
    return c;
  }

  function render() {
    // Classement : d'abord les méthodes sans pastille rouge, puis par score ; une méthode avec du rouge n'est conseillée
    // que si toutes en ont
    const c = contexte(), classes = DOCTRINES.map(d => ({ d, s: score(d, c), r: facteurs(d, c).some(rouge) })).sort((a, b) => a.r - b.r || b.s - a.s);
    const sansRouge = classes.filter(x => !x.r), conseil = (sansRouge.length ? sansRouge : classes).slice(0, 2).map(x => x.d);
    const doc = DOCTRINES.find(d => d.id === state.methode) || conseil[0];

    $('pl-contexte').innerHTML = `Objectif <strong>${c.label}</strong> · volume de référence <strong>${fD(c.heures * 60)}</strong> par semaine` +
      (c.profil ? ` · allure objectif <strong>${fA(c.allureObj)}</strong> (≈ ${E.formatTemps(c.tObj)})` : '') +
      `, repris de « Répartition du volume ». <button type="button" class="lien" data-vue="equilibre">Modifier</button>` +
      (c.profil ? '' : ` Sans profil, les allures ne sont pas calculées : <button type="button" class="lien" data-vue="profil">saisir mes chronos</button>.`);

    // Cartes compactes : titre, pastilles du classement, difficulté et sa raison ; le détail de la méthode choisie est plus bas
    $('pl-methodes').innerHTML = classes.map(({ d }) => {
      const fs = facteurs(d, c), classe = (x, i) => (rouge(x, i) ? 'moins' : (i === 0 ? x.effet >= 2.5 : x.effet > 0) ? 'plus' : '');
      const pastilles = fs.map((x, i) => `<span class="facteur ${classe(x, i)}" title="${x.detail}">${x.texte}</span>`).join('');
      return `<button type="button" class="methode${d === doc ? ' actif' : ''}" data-m="${d.id}" aria-pressed="${d === doc}">
        ${conseil.includes(d) ? `<span class="badge" title="${fs.map(x => x.detail).join(' ')}">Conseillée</span>` : ''}<strong>${d.titre}</strong>
        <span class="facteurs">${pastilles}</span>
        <span class="difficulte"><span class="points" aria-hidden="true">${'●'.repeat(d.difficulte[0])}<span>${'●'.repeat(5 - d.difficulte[0])}</span></span> Difficulté ${d.difficulte[0]}/5 · ${NIVEAUX_METHODE[d.difficulte[0] - 1]}</span>
        <span class="sous">${d.difficulte[1][0].toUpperCase() + d.difficulte[1].slice(1)}.</span></button>`;
    }).join('');

    const { semaines, court, plafond, avecSL } = construire(doc, c);
    const nD = nbDoubles(), total = state.seances + nD;
    $('pl-titre').textContent = `Méthode ${doc.nom}`;
    $('pl-resume').innerHTML = `<p>${doc.resume}</p>` +
      (doc.slSi ? `<p class="note">${avecSL ? `Sortie longue gardée : objectif de plus d'une heure, avec une fréquence (${total} séances) et un volume (${fD(c.heures * 60)}) encore faibles.`
        : `Pas de sortie longue : ${c.tObj <= 60 ? "objectif de moins d'une heure" : `fréquence (${total} séances) ou volume (${fD(c.heures * 60)}) suffisants`}, le dernier jour est un footing comme les autres.`}</p>` : '') +
      `<details><summary>Principes, classement et source</summary><ul class="note">${doc.principes.map(p => `<li>${p}</li>`).join('')}</ul>` +
      `<p class="note">Classement pour vous : ${facteurs(doc, c).map(x => `<strong>${x.texte}</strong> (${x.detail.replace(/\.$/, '')})`).join(' ; ')}.</p>` +
      `<p class="note">Source : ${doc.source}</p></details>`;

    const alertes = [];
    // Méthode fondée sur la fréquence (frequence) : des footings de 30 min sont la base recherchée, le volume découle de la fréquence
    if (court) alertes.push(doc.frequence
      ? `Avec ${total} séances par semaine, les footings sont à ${EF_MIN} min (la base de la méthode) : le volume réel dépasse le volume de référence certaines semaines, c'est la fréquence qui le fixe.`
      : `Volume juste pour ${total} séances par semaine : les footings sont portés à ${EF_MIN} min, le volume réel dépasse donc le volume de référence certaines semaines.${nD ? ' Réduisez le nombre de doublés.' : ''}`);
    if (doc.joursMax && state.seances > doc.joursMax) alertes.push(`La méthode ${doc.nom} garde au moins un jour sans course à pied par semaine : ${doc.joursMax} jours au plus.`);
    if (doc.totalMin && total < doc.totalMin) alertes.push(`La méthode ${doc.nom} demande au moins ${doc.totalMin} séances par semaine, idéalement avec un doublé (par exemple ${doc.totalMin - 1} jours dont 1 doublé) : avec ${total}, elle perd son principe.`);
    if (plafond && doc.frequence) alertes.push(`Footings plafonnés à ${doc.footingMax} min : pour ce volume, la méthode ${doc.nom} préfère augmenter la fréquence (jours de course, doublés) plutôt que la durée des séances.`);
    else if (plafond) alertes.push(`Volume élevé pour ${total} séances par semaine : les footings sont limités à la durée de la sortie longue, le volume réel reste sous le volume de référence certaines semaines. Ajoutez des jours de course ou des doublés.`);
    if (doc.seancesMin && state.seances < doc.seancesMin) alertes.push(`La méthode ${doc.nom} repose sur ${doc.seancesMin} jours de course ou plus par semaine : avec ${state.seances}, elle perd son principe.`);
    if (nD && c.heures < DOUBLE_VOLUME && !doc.frequence) alertes.push(`Les doublés servent surtout à absorber un gros volume : sous ≈ ${DOUBLE_VOLUME} h par semaine, des séances simples un peu plus longues apportent autant, avec plus de récupération.`);
    if (state.semaines < 6) alertes.push("Moins de 6 semaines : pas d'affûtage, le plan sert plutôt de bloc d'entraînement.");
    $('pl-alertes').innerHTML = alertes.map(a => `<li>${a}</li>`).join('');
    $('pl-alertes').hidden = !alertes.length;

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
    const cls = (w) => ({ Charge: 'charge', 'Décharge': 'decharge', 'Affûtage': 'affutage' })[w.type];
    $('pl-volumes').innerHTML = semaines.map((w, i) => `<div class="${cls(w)}" style="height:${(totaux[i] / max * 100).toFixed(1)}%" title="Semaine ${i + 1} · ${w.type} · ${fD(totaux[i])}"><span>${i + 1}</span></div>`).join('');
    $('pl-recapTete').innerHTML = `<tr><th>Sem.</th><th>Type · phase</th><th class="num">Séances</th><th class="num">Temps</th>${c.profil ? '<th class="num">Distance</th>' : ''}<th class="num">Qualité</th></tr>`;
    $('pl-recap').innerHTML = semaines.map((w, i) => `<tr><td>${i + 1}</td><td>${w.type}${w.phase === w.type ? '' : ` · ${w.phase}`}</td>
      <td class="num">${recap[i].n}${recap[i].n > recap[i].jours ? ` <span class="sous">(${recap[i].jours} j)</span>` : ''}</td><td class="num">${fD(recap[i].temps)}</td>
      ${c.profil ? `<td class="num">≈ ${fKm(recap[i].km)}</td>` : ''}<td class="num">${fD(recap[i].qualite)}</td></tr>`).join('');
    $('pl-recapTotal').innerHTML = `<tr><td>Total</td><td></td><td class="num">${tot.n}</td><td class="num">${fD(tot.temps)}</td>${c.profil ? `<td class="num">≈ ${fKm(tot.km)}</td>` : ''}<td class="num">${fD(tot.qualite)}</td></tr>`;

    const ouverts = [...document.querySelectorAll('#pl-liste details')].map(d => d.open);
    $('pl-liste').innerHTML = semaines.map((w, i) => {
      const r = recap[i];
      return `<details class="semaine ${cls(w)}"${(ouverts.length ? ouverts[i] : i === 0) ? ' open' : ''}>
        <summary>Semaine ${i + 1} · ${w.type}${w.phase === w.type ? '' : ` · ${w.phase}`} <span class="sous">· ${r.n} séances · ${fD(r.temps)}${r.km === null ? '' : ` · ≈ ${fKm(r.km)}`} · niveau ${Math.round(w.niveau)}/10</span></summary>
        <ol class="seances">${w.jours.map((j, k) => `<li style="--c:var(--${j[0].zone.toLowerCase()})"><span class="jour">Jour ${k + 1}${j.length > 1 ? ` · doublé${moments(j)[0][0] ? '' : ', ordre au choix'}` : ''}</span>` +
          moments(j).map(([m, x]) => `<div><strong>${m ? `${m} : ` : ''}${x.nom}</strong> <span class="sous">· ${fD(x.duree)}</span><div class="sous">${x.texte}</div></div>`).join('') + '</li>').join('')}</ol>
        <p class="note">${r.qualite ? `Travail de qualité ≈ ${fD(r.qualite)}, récupérations comprises.` : 'Pas de travail de qualité cette semaine (footings, lignes droites).'}</p></details>`;
    }).join('');

    const premiere = semaines[0].seances.find(x => x.qualite);
    $('pl-diffLbl').textContent = `${state.difficulte}/10`;
    $('pl-diffNote').innerHTML = premiere ? `Première semaine, ${premiere.nom.toLowerCase()} : ${premiere.texte}` : 'Première semaine : footings et lignes droites (phase de fondation).';
    $('pl-cycleNb').hidden = state.cycle !== 'cycle';
    $('pl-momentBloc').hidden = !nbDoubles();
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
  $('pl-moment').value = state.moment;
  $('pl-moment').addEventListener('change', e => { state.moment = e.target.value; render(); });
  $('pl-cycle').value = state.cycle;
  $('pl-cycle').addEventListener('change', e => { state.cycle = e.target.value; render(); });
  $('pl-methodes').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { state.methode = b.dataset.m; render(); } });
  document.addEventListener('balance', render); // nouveau profil, objectif ou volume dans Balance

  render();
})();
