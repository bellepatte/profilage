/* Bibliothèque de séances : fonctions de construction (séries de fractions, effort continu) et allures et séances communes à plusieurs
   méthodes. Chargée après plan.js et avant les fichiers methodes/*.js, qui les utilisent (PlanCore.series, PlanCore.fractions…). */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, fD, arr5, arrondi, moy, allureDist, pv, al, aZ, kmS, plageA, ALLURES } = PlanCore;

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
  const tRef = (c) => Math.max(c.tObj, 60); // échelle des séances à allure objectif longues (Hanson, Canova)
  // Allure spécifique (allure de l'objectif) : durée d'une fraction et volume total, en part du temps de course prédit
  const SPE = { '5k': { rep: [0.1, 0.25], tot: [0.6, 1.2] }, '10k': { rep: [0.08, 0.2], tot: [0.4, 0.8] },
    semi: { rep: [0.06, 0.15], tot: [0.35, 0.7] }, marathon: { rep: [0.04, 0.1], tot: [0.15, 0.35] } };
  Object.assign(PlanCore, { series, fractions, continu, tRef });

  PlanCore.allures({
    vma: { nom: 'VMA', min: c => 1000 / c.profil.V },
    r: { nom: 'allure 1500 m', min: c => allureDist(c, 1500) },
    i: { nom: 'allure 3000 – 5000 m', min: c => [allureDist(c, 3000), allureDist(c, 5000)] },
    k5: { nom: 'allure 5 km', min: c => allureDist(c, 5000) },
    k10: { nom: 'allure 5 – 10 km', min: c => [allureDist(c, 5000), allureDist(c, 10000)] },
    seuil: { nom: 'allure 1 h (seuil)', min: c => 1000 / c.vRef },
    lt: { nom: 'allure 15 km – semi', min: c => [allureDist(c, 15000), allureDist(c, 21097)] },
    // allures en % de VMA (Heubi, Billat, Rousset)
    v100: { nom: '100 – 105 % de VMA', min: pv(100, 105) },
    v90: { nom: '90 – 95 % de VMA', min: pv(90, 95) },
    v95_100: { nom: '95 – 100 % de VMA', min: pv(95, 100) },
    v85_90: { nom: '85 – 90 % de VMA', min: pv(85, 90) },
    v105_110: { nom: '105 – 110 % de VMA', min: pv(105, 110) },
    // McMillan (steady state, aussi utilisé par Magness et Rousset) : allures des courses de 1 h 15 à 2 h 30
    mcSteady: { nom: 'allure semi – marathon (steady state)', min: c => [allureDist(c, 42195), allureDist(c, 21097)] },
    obj: { nom: c => `allure ${c.nomObj}`, min: c => c.allureObj }
  });

  PlanCore.seances({
    VMA_LONG: { nom: 'Intervalles VO2max (I)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [12, 24], [1, 0.7]), 'i', 'en trottinant') },
    SEUIL: { nom: 'Seuil (T)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [5, 15], [15, 35], [0.2, 0.2]), 'seuil', 'en trottinant') },
    // McMillan : zone Stamina (steady state) ; aussi utilisée par Magness
    MC_STEADY: { nom: 'Steady state', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(25, 60, l) * s, 'mcSteady') },
    TEMPO: { nom: 'Tempo au seuil lactique', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(15, 40, l) * s, 'lt') },
    SPE: { nom: 'Allure spécifique', zone: 'obj', gen: (l, s, c) => {
      const p = SPE[c.goal], T = c.tObj;
      return fractions(c, series(l, s, p.rep.map(x => x * T), p.tot.map(x => Math.min(90, x * T)), [0.5, 0.2], 1), 'obj', 'en trottinant');
    } },
    VITESSE: { nom: 'Vitesse (R)', zone: 'Z6', gen: (l, s, c) => fractions(c, series(l, s, [0.5, 1.25], [4, 8], [3, 2]), 'r', 'en marchant ou en trottinant (récupération complète)') },
    COTES: { nom: 'Côtes', zone: 'Z5', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 1.5], [5, 12], [2.5, 1.5]);
      return { travail: S.travail, effort: S.n * S.r, km: c.profil && kmS(c, S, aZ(c, 'Z5')), texte: `${S.n} × ${fD(S.r)} de montée à effort soutenu (Z5, à la sensation), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
    } },
    FARTLEK: { nom: 'Fartlek', zone: 'Z3', gen: (l, s, c) => {
      const d = arr5(lerp(20, 40, l) * s);
      return { travail: d, km: c.profil && d / aZ(c, 'Z3'), texte: `${fD(d)} de fartlek : ${Math.round(d / 4)} accélérations de 1 à 3 min (Z3 à Z5, à la sensation), trot entre les accélérations` };
    } },
    EF_LD: { nom: 'Footing et lignes droites', zone: 'Z2', leger: true, gen: (l) => {
      const n = Math.round(lerp(6, 10, l));
      return { travail: n * 4 / 3, texte: `${n} lignes droites de 20 s (vite et relâché, Z6), 1 min de marche ou de trot entre chacune` };
    } }
  });
})();
