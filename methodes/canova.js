/* Méthode Canova (Renato Canova : l'entonnoir de la spécificité) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { E, lerp, borne, fD, fA, arr5, allureDist, kmS, ajoute, series, fractions, continu, tRef, footing } = PlanCore;

  PlanCore.allures({
    ext: { nom: c => `90 – 95 % de la vitesse ${c.nomObj}`, min: c => [c.allureObj / 0.95, c.allureObj / 0.9] }
  });

  PlanCore.seances({
    // Canova : footing progressif en 3 parties, en % de la vitesse marathon (arg : 1 moyen, 2 moyen-rapide, 3 rapide)
    CAN_PROG: { nom: k => ['', 'Progressif moyen', 'Progressif moyen-rapide', 'Progressif rapide'][k], zone: k => (k === 1 ? 'Z3' : 'Z4'), gen: (l, s, c, k) => {
      const [dur, pcts] = { 1: [[60, 90], [85, 92, 100]], 2: [[45, 60], [95, 100, 105]], 3: [[20, 40], [102, 105, 108]] }[k];
      const d = arr5(Math.min(lerp(dur[0], dur[1], l) * s, dur[1])), aM = c.profil && allureDist(c, 42195);
      return { travail: d, km: c.profil && pcts.reduce((a, p) => a + d / 3 / (aM * 100 / p), 0),
        texte: `${fD(d)} en continu, en 3 parties de ${fD(d / 3)} : ${pcts.map(p => `${p} %${aM ? ` (${fA(aM * 100 / p)})` : ''}`).join(', ')} de la vitesse marathon` };
    } },
    // Canova (message de Canova sur LetsRun, « Does it matter how fast you do your long runs? ») : vitesses en % de la vitesse
    // de course, calculées à sa façon (105 % = allure − 5 %) ; volumes en multiples du temps de course T (son exemple : 5000 m)
    CAN: { nom: p => `Canova ${p} %`, zone: p => (p >= 110 ? 'Z6' : p >= 100 ? 'Z5' : 'Z4'), gen: (l, s, c, p) => {
      const T = c.tObj, a = c.profil && c.allureObj * (2 - p / 100);
      if (p <= 90) { const t = arr5(Math.min(90, lerp(2.2, 4.4, l) * T * s)); return { travail: t, km: c.profil && t / a, texte: `${fD(t)} en continu à ${p} % de la vitesse ${c.nomObj}${a ? ` (${fA(a)})` : ''}` }; }
      const P = { 110: [[0.08, 0.12], [0.6, 0.7], [1.2, 1]], 105: [[0.1, 0.2], [0.9, 1], [1, 0.7]], 100: [[0.2, 0.4], [1.6, 2], [1, 0.5]], 95: [[0.4, 0.6], [2, 3], [0.33, 0.33]] }[p];
      const S = series(l, s, P[0].map(x => x * T), P[1].map(x => borne(x * T, 5, 60)), P[2], 1);
      return { travail: S.travail, effort: S.n * S.r, km: kmS(c, S, a), texte: `${S.n} × ${fD(S.r)} à ${p} % de la vitesse ${c.nomObj}${a ? ` (${fA(a)})` : ''}, récupération ${fD(S.rc)} en trottinant` };
    } },
    SPE_EXT: { nom: 'Spécifique long', zone: 'obj', gen: (l, s, c) => continu(c, Math.min(100, lerp(0.25, 0.5, l) * tRef(c) * s), 'ext') }
  });

  PlanCore.methode({ id: 'canova', nom: 'Canova', titre: "Renato Canova : l'entonnoir de la spécificité",
      source: "Canova R., Gigliotti L., Lenzi G., La via italiana alla maratona, Atleticastudi 4-5-6/1998 (FIDAL, scan lu : tableaux 2 à 6) ; Canova R., Moderne strategie per l'allenamento della maratona, Atleticastudi 2/1996 (FIDAL, lu) ; Canova R., messages sur le forum LetsRun (fils 2959804, 4213844, 3958030, 1363335, lus) et leur synthèse par J. Davis, « Something New in Training: The Methods of Renato Canova » (2011) ; Arcelli E., Canova R., Marathon Training: A Scientific Approach (1999, non lu : recension de J. Davis, runningwritings.com, 2023) ; progressifs selon Canova : Fast Running.",
      resume: "Du général au spécifique : un travail varié au début (côtes, fartlek, seuil), puis un resserrement progressif (« entonnoir ») vers des séances longues proches de l'allure de course (95 à 105 %).",
      principes: ['Période générale : côtes, fartlek, allures variées ; progressifs moyens (60 à 90 min de 85 à 100 % de la vitesse marathon, jamais plus vite).',
        'Période fondamentale : seuil, allure de course sur portions courtes ; progressifs moyen-rapides (45 à 60 min de 95 à 105 % de la vitesse marathon).',
        "Période spécifique : beaucoup de volume à 95 – 105 % de l'allure de course, sorties longues rapides à 90 – 95 % ; progressifs rapides (20 à 40 min de 102 à 108 % de la vitesse marathon).",
        'Progressifs réservés ici au semi et au marathon (leurs % sont ceux de la vitesse marathon). Méthode exigeante, pensée pour des coureurs expérimentés.',
        "5 et 10 km, d'après un message de Canova (exemple d'un coureur de 15:00 au 5000 m) : 110 % de la vitesse de course, fractions courtes, ≈ 3 km au total, 1 min 30 de récupération ; 105 %, ≈ la distance de course au total ; 100 %, fractions jusqu'au 2000 m, 8 à 10 km, 3 min ; 95 %, fractions longues (3 × 3000 m) ou continu ; 90 %, continu de 10 à 20 km. Il compte 105 % comme l'allure moins 5 %.",
        "Spécialement pour le marathon, ses « blocs spéciaux » (deux séances longues le même jour, toutes les 3 à 4 semaines en période spécifique : le matin 85 – 90 % de la vitesse marathon puis 10 à 15 km à ≈ 98 %, 100 % ou 105 – 110 % selon la variante ; un coureur à 80 miles par semaine fait environ 60 % de son travail à l'allure marathon, un coureur à 150 miles environ 40 %) sont réservés aux coureurs de très haut niveau et ne sont pas repris ici (source secondaire : Fast Running).",
        'Ses volumes sont ceux de coureurs à très gros kilométrage : ici, la qualité de la semaine est plafonnée à 30 % du temps.',
        "Marathon, d'après la recension du livre : périodes d'introduction (6 à 8 semaines), fondamentale (8 à 10, volume maximal), spéciale (6 à 8, absente du livre) et spécifique (6 à 8) ; sorties longues spécifiques de 30 à 35 km à 96 – 98 % de l'allure marathon, 18 à 25 km continus à 100 – 103 % en période générale ; fractions extensives de 2 à 7 km à 100 – 102 % (1 km de récupération à 85 – 95 %), intensives de 500 à 1 000 m à 103 % (récupération à 97 %). Élites : 230 à 250 km par semaine.",
        "École italienne (Canova, Gigliotti, Lenzi, 1998) : le marathon est une spécialité d'extension (le volume d'abord, à une intensité compatible avec sa puissance aérobie). Le travail spécial se fait entre 97 et 103 % de l'allure de course, sur une durée de la moitié aux deux tiers de la course ; en dessous de 97 %, au-dessus de 103 % ou sur moins de la moitié de la durée, c'est du travail général ou fondamental de soutien ; les très longues sorties (au-delà de la distance de course) soutiennent le travail spécial.",
      "Table des allures de la méthode (en % de l'allure marathon) : > 110 % intervalles courts (10 × 500 m, 1 min 30) ; 110 – 108 % résistance spéciale intensive de 10 à 12 km (1 000 à 3 000 m) ; 108 – 105 % intensive-extensive de 12 à 16 km (2 000 à 5 000 m) ou course rapide progressive de 20 à 40 min ; 105 – 103 % extensive de 15 à 21 km (3 000 à 7 000 m) ou course rapide de 20 à 40 min ; allure marathon : 18 à 25 km ; 100 – 97 % course moyenne-rapide progressive (45 min à 1 h 20) et long spécial intensif de 28 à 30 km ; 97 – 95 % long spécial extensif de 32 à 36 km ; 95 – 92 % long de durée de 36 à 45 km ; 92 – 90 % très long de 40 à 52 km ; 90 – 85 % long du marathonien (2 à 3 h) ; 85 – 80 % fond lent de soutien ; moins de 80 % régénération.",
      "Résistance spéciale (période spéciale, environ 6 semaines) : extensive, de 19 à 30 km au total, répétitions de 2 à 7 km à 100 – 102 % avec 1 km de récupération à 85 – 95 % (4 × 5 000 m, 3 × 7 000 m) ; intensive, de 15 à 23 km, répétitions de 0,5 à 1 km à 103 % et plus, récupération de 0,5 à 1 km à 97 % ; long spécial de 30 à 35 km à 98 – 100 % ; bloc spécial de deux séances le même jour (10 km à 85 % puis 10 à 15 km à l'allure marathon, le matin et l'après-midi) ; une longue sortie à 92 – 94 % au-delà de la distance de course au moins une fois dans le mois précédent. Puissance aérobie : fond rapide de 20 à 40 min à 104 – 107 %, variations longues (5 000 / 7 000 m) à 103 – 107 %, moyennes (3 000 / 5 000 m) à 105 – 108 %, brèves (1 000 / 3 000 m) à 106 – 110 %, course en côte de 6 à 10 km à 3 – 6 %.",
      "Périodes (1998) : générale 6 à 8 semaines (efficacité musculaire, course continue lente, moyenne et progressive de 30 min à 1 h 30), fondamentale 8 à 10 semaines (puissance aérobie au seuil, volume maximal), spéciale 6 à 8 semaines (résistance spécifique à l'allure marathon, volume en baisse). Fondamental pour le marathon : 1 h 45 à 2 h 30 à 1,1 – 1,2 fois plus lent que l'allure de course. Le plan des 3 derniers mois contient peu de longues sorties lentes, mais des 25 à 40 km rapides (à 3 min 30 par km pour un 2 h 05 : « le meilleur moyen de perdre son temps »).",
      "Modulation : pas de semaine symétrique ; chaque allure est un type d'entraînement distinct ; plus on approche de la course, plus la récupération entre séances doit croître (deux à trois jours de régénération entre séances spécifiques) ; on n'abandonne pas les séances précédentes, on en ajoute (« s'entraîner, c'est ajouter »). Coureur « résistant » (≈ 88 % de fibres lentes, seuil aérobie proche du seuil anaérobie, lactate ≈ 2 mmol/L) : travailler la puissance (VO2max) ; coureur « rapide » (≈ 65 % de fibres lentes, lactate ≈ 3 mmol/L) : éviter les gros travaux lactiques, réduire la consommation.",
      "Adaptation pour amateurs (conseils du recenseur, pas de Canova) : 60 à 80 % du volume de séance prévu, commencer par les séances à 90 % et 110 % de l'allure marathon puis ajouter 95 %, 100 – 103 % et 105 % quand le kilométrage le permet, plusieurs jours faciles après les grosses séances, de courts blocs de jours chargés plutôt qu'un gros kilométrage."],
      maxQ: 3, partQualite: 0.3, score: { '5k': 1.5, '10k': 2, semi: 2.5, marathon: 2.5 },
      difficulte: [5, "gros volume proche de l'allure de course, conçu pour des coureurs de haut niveau"],
      phases: [{ nom: 'Générale', f: 0.3, q: c => (c.dist > 20000 ? ['CAN_PROG@1', 'COTES', 'FARTLEK'] : ['FARTLEK', 'COTES', 'CAN@90']), sl: 'SL' },
        { nom: 'Fondamentale', f: 0.6, q: c => (c.dist > 20000 ? ['SEUIL', 'CAN_PROG@2', 'SPE'] : ['CAN@95', 'CAN@110', 'CAN@90']), sl: 'SL' },
        { nom: 'Spécifique', f: 1, q: c => (c.dist > 20000 ? ['SPE', 'SPE_EXT', 'CAN_PROG@3'] : ['CAN@100', 'CAN@105', 'CAN@95']), sl: 'SL_SPE' }],
    ordre: 6,
    fiche: { public: 'Coureurs de haut niveau, semi et marathon', plan: '20 à 26 semaines', mise: 'complexe', h: 7, j: 6 },
    bio: "Renato Canova, entraîneur italien qui a encadré de nombreux coureurs de fond de niveau mondial, notamment au Kenya. Il a théorisé l'entraînement « spécifique », centré sur l'allure de course, pour le marathon." });
})();
