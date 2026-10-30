/* Méthode Heubi (Bruno Heubi : puissance, endurance, efficience) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { pv, series, fractions, biais } = PlanCore;

  const emaPct = (c) => Math.round(82.5 + 2.5 * biais(c)); // Heubi : 80 à 85 % de VMA selon l'indice d'endurance

  PlanCore.allures({
    // Heubi : endurance active à 80 – 85 % de VMA, placée selon l'indice d'endurance (85 % pour une bonne endurance)
    ema: { nom: c => `${emaPct(c)} % de VMA (endurance active, selon votre indice d'endurance)`, min: c => pv(emaPct(c) - 1, emaPct(c) + 1)(c) }
  });

  PlanCore.seances({
    // Heubi : VMA courte (30 s à 1 min 15), moyenne, longue, volume effort + récupération de 20 à 26 min, récupération active
    // à ≈ 50 % de VMA ; endurance active (EMA) à 80 – 85 % de VMA selon l'indice d'endurance
    HEU_VMA_COURTE: { nom: 'VMA courte', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [0.5, 1.25], [10, 13], [1, 1]), 'v100', 'active à ≈ 50 % de VMA') },
    HEU_VMA_MOY: { nom: 'VMA moyenne', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.5, 3], [11, 14], [0.8, 0.6]), 'v95_100', 'active à ≈ 50 % de VMA') },
    HEU_VMA_LONGUE: { nom: 'VMA longue', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [12, 16], [0.6, 0.4]), 'v90', 'active à ≈ 50 % de VMA') },
    HEU_EMA: { nom: 'Endurance active (EMA)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [10, 20], [20, 40], [0.2, 0.1], 2), 'ema', 'en trottinant') }
  });

  PlanCore.methode({ id: 'heubi', nom: 'Heubi', titre: 'Bruno Heubi : puissance, endurance, efficience',
    source: 'Heubi B., Courir longtemps : les clés pour réussir (chap. « Les bases de l\'entraînement » : VMA, EMA, durées selon l\'indice d\'endurance ; « Les clés de la réussite pour préparer son défi » : préparations générale et spécifique) ; brunoheubi.com : « La préparation générale », « La préparation spécifique », « La séance de VMA dans mes règles de l\'art ».',
    resume: "La performance repose sur la puissance (VMA), l'endurance et l'efficience. Une préparation générale (VMA courte et moyenne, endurance active à 80 – 85 % de VMA) précède une préparation spécifique de 8 à 10 semaines : VMA entretenue, endurance active chaque semaine et fractions à l'allure de l'objectif, dans la sortie longue pour le marathon.",
    principes: ['Toutes les allures en % de VMA ; footings à 60 – 65 % de VMA.',
      "Endurance active (EMA) à 80 – 85 % de VMA, selon l'indice d'endurance (ici 85 % pour une bonne endurance, 80 % pour une endurance à développer).",
      'VMA courte : fractions de 30 s à 1 min 15 ; volume effort + récupération de 20 à 26 min ; récupération active à ≈ 50 % de VMA ; partir un peu sous l\'allure cible.',
      "Endurance active (EMA) : le livre la situe de 80 à 90 % de VMA, avec une durée de séance donnée par l'indice d'endurance (table tirée de Péronnet : plus l'indice est bas, plus la séance est courte, ex. IE −8 : 45 min à 80 % ou 3 × 9 min à 85 %) ; une ou deux séances par semaine ; VMA : fractions de 30 s à 1 min 15 à 100 – 105 % (récupération égale), 1 min 15 à 4 min à 90 – 95 % (récupération moitié), 15 à 25 min d'effort au total, échauffement de 20 min.",
      'Préparation générale : au moins 12 semaines, en cycles de 3 semaines séparés par une semaine de relâchement, accent sur la VMA (une séance tous les 4 à 6 jours pour progresser, tous les 10 à 14 jours pour entretenir) ; sortie longue facultative (1 h à 1 h 15 pour le 10 km, ≈ 1 h 30 pour le semi, 1 h 30 à 1 h 45 pour le marathon).',
      'Préparation spécifique (au moins 2 cycles séparés par une semaine allégée, soit 9 à 11 semaines) : VMA (95 – 105 % pour 10 km et semi, 90 – 100 % pour le marathon) une fois par semaine ou tous les 15 jours, EMA chaque semaine, fractions à l\'allure de l\'objectif ; marathon : fractions à allure marathon dans la sortie longue.'],
    maxQ: 3, score: { '5k': 2, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [3, "séances de VMA et d'endurance active soutenues, mais dosées en volume et adaptées à l'indice d'endurance"],
    phases: [{ nom: 'Préparation générale', f: 0.4, q: ['HEU_VMA_COURTE', 'HEU_EMA', 'HEU_VMA_MOY'], sl: 'SL' },
      { nom: 'Préparation spécifique', f: 1, q: c => (c.goal === 'marathon' ? ['HEU_EMA', 'HEU_VMA_LONGUE', 'SPE'] : ['SPE', 'HEU_EMA', 'HEU_VMA_COURTE']), sl: 'SL_SPE' }],
    ordre: 10,
    fiche: { public: "Coureurs sur route, du 10 km à l'ultra, qui connaissent leur VMA", plan: '12 à 16 semaines', mise: 'moyenne', h: 3, j: 3 },
    bio: "Bruno Heubi (né en 1960), coureur d'ultrafond français, vainqueur des 100 km de Millau et double champion du monde de 100 km par équipes avec l'équipe de France ; entraîneur et auteur de <cite>Courir longtemps</cite>." });
})();
