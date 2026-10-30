/* Méthode Pfitzinger (Pete Pfitzinger : mésocycles et seuil lactique) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { series, fractions, continu } = PlanCore;

  PlanCore.seances({
    VMA_PFITZ: { nom: 'VO2max', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [2, 5], [15, 25], [0.9, 0.5]), 'k5', 'en trottinant') }
  });

  PlanCore.methode({ id: 'pfitzinger', nom: 'Pfitzinger', titre: 'Pete Pfitzinger : mésocycles et seuil lactique',
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
        { nom: 'Préparation à la course', f: 1, q: c => ['VMA_PFITZ', c.dist > 30000 ? 'EF_LD' : 'TEMPO'], sl: 'SL_SPE' }],
    ordre: 4,
    fiche: { public: 'Marathoniens expérimentés à gros volume', plan: '12 à 18 semaines', mise: 'complexe', h: 6, j: 5 },
    bio: "Pete Pfitzinger, marathonien américain, deux fois olympique (1984 et 1988), physiologiste de l'exercice. Coauteur avec Scott Douglas d'<cite>Advanced Marathoning</cite> et de <cite>Faster Road Racing</cite>." });
})();
