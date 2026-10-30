/* Méthode Magness (Steve Magness : l\) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { E, lerp, borne, fD, fA, allureDist, kmS, series, fractions, footing } = PlanCore;

  // Magness, entonnoir : échelle des allures, de la plus lente à la plus rapide ; à la phase k (1 à 3), une allure lente et une
  // rapide se rapprochent de l'objectif (le marathon, sans allure plus lente, est approché par le côté rapide)
  const NOMS_DIST = { 1500: '1500 m', 1609: '1 mile', 3000: '3000 m', 5000: '5 km', 10000: '10 km', 15000: '15 km', 21097: 'semi-marathon', 42195: 'marathon' };
  const ECHELLE_MAG = [42195, 21097, 15000, 10000, 5000, 3000, 1500];
  const entonnoir = (c, k) => { const g = ECHELLE_MAG.indexOf(c.dist); return [ECHELLE_MAG[Math.max(0, g - (4 - k))], ECHELLE_MAG[Math.min(6, g + (4 - k))]].map(d => `MAG@${d}`); };

  PlanCore.seances({
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
    } }
  });

  PlanCore.methode({ id: 'magness', nom: 'Magness', titre: 'Steve Magness : l\'entonnoir, construire et entretenir',
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
      { nom: 'Spécifique', f: 1, q: c => ['SPE', entonnoir(c, 3)[1], entonnoir(c, 3)[0]], sl: 'SL_SPE' }],
    ordre: 13,
    fiche: { public: 'Coureurs expérimentés qui planifient en phases', plan: '16 à 24 semaines', mise: 'complexe', h: 5, j: 5 },
    bio: "Steve Magness, entraîneur et auteur américain en sciences du sport, auteur de <cite>The Science of Running</cite> et coauteur de <cite>Peak Performance</cite>." });
})();
