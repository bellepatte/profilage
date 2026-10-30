/* Méthode Daniels (Jack Daniels : quatre phases, allures E, M, T, I, R) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { E } = PlanCore;

  PlanCore.methode({ id: 'daniels', nom: 'Daniels', titre: 'Jack Daniels : quatre phases, allures E, M, T, I, R',
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
        { nom: 'Transition (I)', f: 0.75, q: c => (c.dist >= 10000 ? ['VMA_LONG', 'VMA_LONG'] : ['VMA_LONG', 'VITESSE']), sl: 'SL' }, { nom: 'Qualité finale (T)', f: 1, q: ['SEUIL', 'SPE'], sl: 'SL_SPE' }],
    ordre: 1,
    fiche: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '12 à 24 semaines', mise: 'moyenne', h: 4, j: 4 },
    bio: "Jack Daniels (1933 – 2025), Américain, double médaillé olympique en pentathlon moderne devenu physiologiste de l'exercice et entraîneur universitaire. Auteur de <cite>Daniels' Running Formula</cite> (1998) et de l'indice VDOT ; le magazine Runner's World l'a désigné « meilleur entraîneur du monde »." });
})();
