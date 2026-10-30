/* Méthode Hanson (Méthode Hanson : fatigue cumulée) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, MILE, series, fractions, continu, tRef, TLIM_PART } = PlanCore;

  PlanCore.allures({
    // Hanson : force à l'allure marathon − 10 s par mile (table 3.4 du livre, citée sur LetsRun)
    force: { nom: c => `allure ${c.nomObj} − 10 s par mile (≈ − 6 s /km)`, min: c => c.allureObj - 10 / 60 / MILE }
  });

  PlanCore.seances({
    VMA_HANSON: { nom: 'Vitesse', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.5, 4], [12, 24], [0.8, 0.5]), 'k10', 'en trottinant') },
    // plafonné aux 2/3 du temps limite à l'allure objectif (≈ chrono prédit) : sur 5 et 10 km, l'échelle tRef dépasserait ce qu'on peut tenir
    TEMPO_OBJ: { nom: 'Tempo à allure objectif', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(90, lerp(0.2, 0.45, l) * tRef(c) * s, Math.floor(TLIM_PART * c.tObj / 5) * 5), 'obj') },
    // Hanson : 6 × 1 mile à 2 × 3 miles (≈ 6 miles au total), 400 à 800 m de trot entre les fractions
    FORCE: { nom: 'Force', zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [0.04, 0.11].map(x => x * tRef(c)), [0.18, 0.25].map(x => x * tRef(c)), [0.3, 0.15], 2.5), 'force', 'en trottinant') }
  });

  PlanCore.methode({ id: 'hanson', nom: 'Hanson', titre: 'Méthode Hanson : fatigue cumulée',
      source: 'Humphrey L., Hanson K., Hanson K., Hansons Marathon Method, VeloPress (2e éd. 2016 : chap. 3 sur les sorties longues, la vitesse, la force et le tempo ; chap. 4 sur les programmes).',
      resume: "Trois séances clés par semaine (vitesse puis force, tempo à allure objectif, sortie longue) et des footings presque tous les jours : on aborde les séances avec une fatigue accumulée, qui simule la fin de course. La sortie longue est plafonnée (environ 26 km).",
      principes: ['Vitesse (première moitié) : répétitions à allure 5 – 10 km.', "Force (seconde moitié) : répétitions longues un peu plus vite que l'allure objectif, récupération courte.",
        'Tempo : longue portion continue à allure objectif, allongée au fil des semaines.', 'Six jours de course par semaine, peu ou pas d\'entraînement croisé ; sortie longue de 16 miles (≈ 26 km) au plus.',
        "Force : allure marathon − 10 s par mile, par exemple 6 × 1 mile à 2 × 3 miles avec 400 à 800 m de trot (moins de la moitié de l'effort) ; vitesse : environ 3 miles au total à allure 5 – 10 km, juste sous la VO2max (répétitions de 2 à 8 min, de 400 m à 1 600 m selon la semaine). Ne pas courir plus vite que prévu.",
        "Tempo = allure marathon, pas plus vite : de 4 à 5 miles au début jusqu'à 10 miles (≈ 90 min) en fin de préparation ; sortie longue de 16 miles au plus, au plus 25 à 30 % du volume de la semaine et pas de jour de repos avant elle (fatigue cumulée volontaire)."],
      maxQ: 2, slKm: 26, score: { '5k': 1, '10k': 1.5, semi: 2.5, marathon: 3 },
      difficulte: [4, 'six jours de course par semaine et séances clés enchaînées sur une fatigue accumulée'],
      phases: [{ nom: 'Vitesse', f: 0.45, q: ['VMA_HANSON', 'TEMPO_OBJ'], sl: 'SL' }, { nom: 'Force', f: 1, q: ['FORCE', 'TEMPO_OBJ'], sl: 'SL' }],
    ordre: 5,
    fiche: { public: 'Marathoniens réguliers, six jours de course par semaine', plan: '18 semaines', mise: 'moyenne', h: 6, j: 6 },
    bio: "Keith et Kevin Hanson, frères entraîneurs américains, fondateurs du groupe d'élite Hansons-Brooks Distance Project (Michigan). Leur méthode est exposée dans <cite>Hansons Marathon Method</cite>, écrit avec Luke Humphrey." });
})();
