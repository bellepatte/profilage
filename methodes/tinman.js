/* Méthode Tinman (Tom « Tinman » Schwartz : vitesse critique) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, allureDist, allureT, al, aZ, series, fractions, footing } = PlanCore;

  PlanCore.allures({
    // Tinman : vitesse critique ≈ allure tenue environ 30 min ; allure 1 mile pour les fractions courtes de fin de séance
    cv: { nom: 'vitesse critique (≈ allure tenue 30 à 35 min)', min: c => [allureT(c, 35), allureT(c, 30)] },
    mile: { nom: 'allure 1 mile', min: c => allureDist(c, 1609) }
  });

  PlanCore.seances({
    // Tinman : 5 à 7 × 3 min à la vitesse critique, 1 min de trot, puis 4 à 6 × 40 s à allure 1 mile (version en durée
    // donnée par Schwartz pour les parcours non mesurés)
    TIN_CV: { nom: 'Vitesse critique (CV)', zone: 'Z4', gen: (l, s, c) => {
      const S = series(l, s, [3, 3], [15, 21], [0.33, 0.33]), m = Math.round(lerp(4, 6, l)), f = fractions(c, S, 'cv', 'en trottinant');
      return { travail: S.travail + 3 + m * 1.67, effort: f.effort + m * 0.67, km: c.profil && f.km + m * 0.67 / allureDist(c, 1609) + (m + 3) / aZ(c, 'Z1'),
        texte: `${f.texte}, puis 3 min de trot et ${m} × 40 s ${al(c, 'mile')}, récupération 1 min en trottinant` };
    } }
  });

  PlanCore.methode({ id: 'tinman', nom: 'Tinman', titre: 'Tom « Tinman » Schwartz : vitesse critique',
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
    phases: [{ nom: 'Développement', f: 0.75, q: ['TIN_CV', 'TEMPO'], sl: 'SL' }, { nom: 'Affinage', f: 1, q: ['TIN_CV', 'SPE'], sl: 'SL' }],
    ordre: 12,
    fiche: { public: 'Coureurs de 5 à 10 km qui veulent peu de jours durs', plan: '8 à 12 semaines', mise: 'simple', h: 4, j: 5, limitee: true },
    bio: "Tom « Tinman » Schwartz, entraîneur américain (Tinman Endurance Coaching), connu pour l'entraînement à la vitesse critique." });
})();
