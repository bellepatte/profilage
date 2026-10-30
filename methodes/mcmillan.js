/* Méthode McMillan (Greg McMillan : quatre zones et type de coureur) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, state, allureDist, allureT, ajoute, series, fractions, continu, biais } = PlanCore;

  // McMillan : type de coureur d'après l'indice d'endurance ; un Speedster commence par la vitesse, un Endurance Monster par la stamina
  const typeMcMillan = (c) => (biais(c) >= 1 / 3 ? 'Endurance Monster' : biais(c) <= -1 / 3 ? 'Speedster' : 'Combo');
  const selonType = (ids) => (c) => {
    const t = typeMcMillan(c), vite = ids.filter(x => x === 'MC_SPEED'), autres = ids.filter(x => x !== 'MC_SPEED');
    return t === 'Speedster' ? [...vite, ...autres] : t === 'Endurance Monster' ? [...autres, ...vite] : ids;
  };

  PlanCore.allures({
    mcTempo: { nom: 'allure de course de 40 min à 1 h 15 (tempo)', min: c => [allureT(c, 75), allureT(c, 40)] },
    mcCruise: { nom: 'allure de course de 25 à 45 min (cruise)', min: c => [allureT(c, 45), allureT(c, 25)] },
    mcSpeed: { nom: 'allure 1500 m – 5 km (speed)', min: c => [allureDist(c, 5000), allureDist(c, 1500)] }
  });

  PlanCore.seances({
    MC_TEMPO: { nom: 'Tempo', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(15, 30, l) * s, 'mcTempo') },
    MC_TEMPO_INT: { nom: 'Tempo en fractions', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [8, 15], [20, 35], [0.35, 0.2], 2), 'mcTempo', 'en trottinant') },
    MC_CRUISE: { nom: 'Cruise intervals', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [3, 8], [18, 32], [0.5, 0.15], 0.5), 'mcCruise', 'en trottinant') },
    MC_SPEED: { nom: 'Speed (VO2max)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1, 5], [12, 24], [1, 0.5]), 'mcSpeed', 'en trottinant') }
  });

  PlanCore.methode({ id: 'mcmillan', nom: 'McMillan', titre: 'Greg McMillan : quatre zones et type de coureur',
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
      { nom: 'Spécifique', f: 1, q: selonType(['SPE', 'MC_CRUISE', 'MC_SPEED']), sl: 'SL_SPE' }],
    ordre: 11,
    fiche: { public: 'Coureurs de tous niveaux, du 5 km au marathon', plan: '10 à 16 semaines', mise: 'moyenne', h: 3, j: 4 },
    bio: "Greg McMillan, entraîneur américain formé en physiologie de l'exercice, connu pour son calculateur d'allures (McMillan Running) et son livre <cite>YOU (Only Faster)</cite>." });
})();
