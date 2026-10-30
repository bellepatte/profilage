/* Méthode Kellogg (John Kellogg : volume aérobie et « high steady state ») : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, state, fD, fourchette, arr5, moy, allureDist, series, fractions, footing, ALLURES } = PlanCore;

  PlanCore.allures({
    deuxMiles: { nom: 'allure 2 miles (≈ 3200 m), relâché', min: c => allureDist(c, 3219) }
  });

  PlanCore.seances({
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
    } }
  });

  PlanCore.methode({ id: 'kellogg', nom: 'Kellogg', titre: 'John Kellogg : volume aérobie et « high steady state »',
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
      { nom: 'Anaérobie', f: 1, q: ['VMA_LONG', 'KEL_STEADY', 'VITESSE'], sl: 'SL' }],
    ordre: 16,
    fiche: { public: 'Coureurs expérimentés à fort volume, bâti sur des années', plan: '16 à 24 semaines', mise: 'moyenne', h: 6, j: 6 },
    bio: "John Kellogg, entraîneur américain qui a encadré des coureurs de tous niveaux, des collégiens aux internationaux américains ; ses conseils, publiés sur le forum LetsRun, ont notamment inspiré le programme de demi-fond et fond de l'université Cornell." });
})();
