/* Méthode Cottereau (Serge Cottereau : courir lentement pour progresser) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { allureDist, series, fractions, footing } = PlanCore;

  PlanCore.allures({
    // Cottereau : résistance douce ≈ allure marathon à semi (80 – 90 % FCM), résistance dure ≈ allure 10 km (> 85 % FCM)
    rDouce: { nom: 'allure marathon – semi (résistance douce, 80 – 90 % FCM)', min: c => [allureDist(c, 42195), allureDist(c, 21097)] },
    rDure: { nom: 'allure 10 km (résistance dure, 90 – 95 % FCM)', min: c => allureDist(c, 10000) }
  });

  PlanCore.seances({
    // Cottereau : résistance douce (blocs longs, récupération très lente de 5 à 7 min pour le marathon) et résistance dure
    // (3 à 4 min, récupération de même durée) ; pas de VMA courte
    COT_DOUCE: { nom: 'Résistance douce', zone: 'Z3', gen: (l, s, c) => {
      const m = c.goal === 'marathon';
      return fractions(c, series(l, s, m ? [15, 15] : [10, 12], m ? [30, 60] : [20, 30], m ? [0.47, 0.33] : [0.5, 0.4]), 'rDouce', 'en trottinant très lentement');
    } },
    COT_DURE: { nom: 'Résistance dure', zone: 'Z5',
      conseil: "Échauffement conseillé par Cottereau : 15 min d'endurance, 2 à 3 min de marche, 5 min de résistance douce, 1 à 2 min de marche, 6 à 7 lignes droites progressives d'environ 20 s. À la fin, vous devez pouvoir refaire autant de répétitions à la même vitesse.",
      gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [9, 20], [1, 0.8]), 'rDure', 'en trottinant très lentement') }
  });

  PlanCore.methode({ id: 'cottereau', nom: 'Cottereau', titre: 'Serge Cottereau : courir lentement pour progresser',
    source: "Cottereau S., « Principes de base de l'entraînement » (texte reproduit sur le forum courseapied.net) ; Cottereau S., Jogging International : « Montez en puissance ! », « Marcher en courant… » et « 100 km, vous pouvez le faire » (2016 : séances intenses par distance, marche, plans, affûtage), propos sur la course lente dans « 6 façons d'augmenter son endurance » ; « Courir lentement pour progresser, la méthode Serge Cottereau », Esprit Trail.",
    resume: "S'entraîner régulièrement, souvent, longtemps et surtout très peu intensément : au moins les trois quarts du temps en endurance, au plus un cinquième en résistance douce (≈ allure marathon) et une seule séance de résistance dure (≈ allure 10 km) par semaine. Intensités réglées au cardiofréquencemètre, jamais jusqu'à l'épuisement.",
    principes: ['Endurance (60 – 80 % FCM, surtout 65 – 75 %) : au moins les trois quarts du temps de la semaine.',
      'Résistance douce (80 – 90 % FCM) : au plus un cinquième du temps, jamais deux jours de suite ; pour le marathon, 2 à 3 × 15 min, récupération de 5 à 7 min très lente.',
      "Résistance dure (jusqu'à ≈ 95 % FCM) : une séance par semaine, répétitions de 3 à 4 min, récupération de même durée ; pas de VMA courte pour les coureurs de fond.",
      'Séances de 45 à 75 min ; pour le marathon, une séance par semaine prolongée vers 2 h.',
      "Séance intense (Jogging International, 2016) : la fréquence cardiaque dépasse 80 % de la FCM pendant une partie de la séance. Marathon : 80 – 90 % de la FCM, 2 à 4 × 15 min, 5 à 7 min de récupération à 60 – 75 % ; séance de 1 h 45 à 2 h 15, la plus dure de la semaine. Semi : 80 – 95 %. 10 km : 80 – 97 %, efforts de 3 à 5 min répétés 2, 3 fois ou plus, 2 à 5 min de récupération. 1 500 m : près de 100 %, 3 à 4 × 1 min à 1 min 15, 3 à 4 min de récupération. Une séance intense par semaine pour la plupart des coureurs, plus souvent (tous les 6, 5 ou 4 jours) selon le niveau et la période ; 2 à 3 jours de footing très facile ensuite.",
      "Course lente : la plupart des sorties à environ 80 % de la vitesse que l'on tiendrait sur la même distance (15 km faisables à 5 min/km : 6 min 15 /km). Environ 90 % de l'entraînement à 60 – 75 % de la FCM, au plus 10 % en résistance douce par blocs de 10 à 20 min.",
      "Marche : commencer chaque séance en marchant (200 à 300 m), puis courir ; en sortie longue, environ 2 min de marche toutes les 15 à 20 min ; sur terrain vallonné, marcher les montées. Marathon : arrêt complet d'environ 45 s à chaque ravitaillement (7 – 8 arrêts, environ 5 min au total pour un coureur en 3 h ; 1 min à 1 min 30 pour 3 h 30 ou plus), qui fait gagner du temps ; sans intérêt sous environ 2 h 30.",
      "Affûtage : la dernière longue séance 6 ou 7 jours avant la course, puis 2 ou 3 séances de 25 à 35 min à 55 – 70 % de la FCM.",
      "Progression par paliers de durée puis d'intensité ; à la fin d'une séance, pouvoir en refaire autant. Allures du plan : équivalents approximatifs des zones de fréquence cardiaque."],
    maxQ: 2, footingMax: 75, slSi: c => c.goal === 'marathon',
    slNote: avec => (avec ? 'Sortie longue : une séance par semaine prolongée vers 2 h, comme le conseille Cottereau pour le marathon.'
      : "Pas de sortie longue : Cottereau ne prolonge une séance vers 2 h que pour le marathon ; les autres durent 45 à 75 min."),
    score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 3 },
    difficulte: [1, "surtout de l'endurance très facile, une seule séance dure par semaine, jamais jusqu'à l'épuisement"],
    phases: [{ nom: 'Progression par paliers', f: 1, q: c => (c.dist > 20000 ? ['COT_DOUCE', 'COT_DURE'] : ['COT_DURE', 'COT_DOUCE']), sl: 'SL' }],
    ordre: 9,
    fiche: { public: "Coureurs d'endurance, du loisir à l'ultra", plan: '12 à 16 semaines', mise: 'simple', h: 2, j: 3 },
    bio: "Serge Cottereau (né en 1938), ancien coureur de 1 500 m de niveau national, quatre fois vainqueur des 100 km de Millau. Auteur d'ouvrages de référence sur le jogging et la course de fond." });
})();
