/* Méthode Lydiard (Arthur Lydiard : la pyramide, du foncier à l'affûtage) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, borne, fD, fA, arr5, allureT, aZ, continu, finPhase } = PlanCore;

  const finLydiard = finPhase;

  PlanCore.allures({
    z3: { nom: 'allure soutenue Z3', min: c => [c.zones.Z3.allureRapide, c.zones.Z3.allureLente] }
  });

  PlanCore.seances({
    // Lydiard : circuit de côte (montée en bondissant, descente rapide et relâchée, accélérations à plat), 2 à 4 tours
    LYD_CIRCUIT: { nom: 'Circuit de côte', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(2, Math.round(lerp(2, 4, l) * s));
      return { travail: n * 6, km: c.profil && n * 6 / aZ(c, 'Z3'), texte: `${n} circuits de ≈ 6 min : montée de 1 min 30 à 2 min en bondissant (genoux hauts, bras actifs), descente rapide et relâchée, puis 4 accélérations de 15 s à plat et retour en trottinant` };
    } },
    // Lydiard : contre-la-montre sur une distance plus courte que la course (ici en durée : la moitié du temps de course)
    LYD_TT: { nom: 'Contre-la-montre', zone: 'Z5', gen: (l, s, c) => {
      const d = arr5(borne(0.5 * c.tObj, 8, 40)), a = c.profil && allureT(c, d);
      return { travail: d, km: c.profil && d / a, texte: `contre-la-montre de ${fD(d)}, à fond mais régulier${a ? ` (≈ ${fA(a)})` : ''}, sur une distance plus courte que la course` };
    } },
    SOUTENU: { nom: 'Allure soutenue', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(20, 50, l) * s, 'z3') }
  });

  PlanCore.methode({ id: 'lydiard', nom: 'Lydiard', titre: "Arthur Lydiard : la pyramide, du foncier à l'affûtage",
      source: 'Lydiard A., Gilmour G., Running to the Top (3e éd. 2013 : chap. 7 et 8, construire un programme).',
      resume: "Périodisation en pyramide : une longue base aérobie (au moins trois mois, en partie à allure soutenue sans devenir anaérobie), puis environ 4 semaines de côtes (bondissements), environ 4 semaines d'anaérobie (répétitions longues, 3 jours par semaine), et 6 semaines de coordination avec courses de mise en jambes.",
      principes: ["Base : au moins 3 mois, 4 à 5 de préférence, de course aérobie « rapide si possible, juste sous le point où l'effort devient anaérobie » : le plus de volume possible, sortie longue, footings, fartlek relâché, lignes droites ; un peu de côtes et de bonds en complément.",
        'Côtes : environ 4 semaines de transition, circuits (bondir, ressorts, course en côte, descente rapide), avec quelques lignes droites en bas.',
        "Anaérobie : environ 4 semaines, trois jours par semaine de gros effort. Lydiard n'utilise pas le fractionné chiffré : répétitions d'au moins 600 m, ou 3, 5 ou 10 km à fond, sans compter, jusqu'à ce que le corps dise stop (ici, séries cadrées par la règle des 2/3 du temps limite) ; travail de vitesse de jambes en parallèle.",
        "Coordination : environ 6 semaines, répétitions courtes à l'allure de course, fartlek facile, une course de mise en jambes par semaine (plus courte ou plus longue que l'objectif) ; une sortie longue facile de 1 h à 1 h 30 ; une journée de récupération après chaque jour dur. Les 14 dernières semaines suivent ce découpage (réduit si le plan est plus court).",
        'Après un semi ou un marathon : environ 2 semaines sans rien de rapide.'],
      maxQ: 3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [2, "longue base aérobie, intensité tardive et progressive ; demande surtout du temps"],
      // les 14 dernières semaines suivent le livre (côtes 4, anaérobie 4, coordination 6), réduites proportionnellement si le plan dure moins de 23 semaines (base : 40 % au moins)
      phases: [{ nom: 'Base aérobie', f: () => finLydiard(14), q: ['SOUTENU', 'FARTLEK', 'EF_LD'], sl: 'SL' }, { nom: 'Côtes', f: () => finLydiard(10), q: ['LYD_CIRCUIT', 'LYD_CIRCUIT', 'LYD_CIRCUIT'], sl: 'SL' },
        { nom: 'Anaérobie', f: () => finLydiard(6), q: ['VMA_LONG', 'LYD_TT', 'VITESSE'], sl: 'SL' }, { nom: 'Coordination', f: 1, q: ['SPE', 'VITESSE', 'LYD_TT'], sl: 'SL' }],
    ordre: 2,
    fiche: { public: 'Coureurs qui bâtissent une base aérobie sur la durée (semi, marathon)', plan: '16 à 30 semaines', mise: 'simple', h: 5, j: 5 },
    bio: "Arthur Lydiard (1917 – 2004), entraîneur néo-zélandais. Ses coureurs Peter Snell et Murray Halberg ont été champions olympiques à Rome en 1960 ; il a popularisé le jogging et inspiré la périodisation moderne de la course de fond." });
})();
