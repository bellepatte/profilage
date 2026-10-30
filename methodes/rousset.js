/* Méthode Rousset (Didier Rousset : courir au naturel (aut\) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, pv, aZ, series, fractions, continu, biais, f1, footing } = PlanCore;

  // Rousset : la vitesse (résistance vitesse, qualitative) est pour ceux qui en manquent (indice d'endurance proche de 0), pas pour une endurance à développer
  const rouVitesse = (c) => (biais(c) >= 1 / 3 ? ['ROU_RVITESSE', 'ROU_RQUALI'] : biais(c) > -1 / 3 ? ['ROU_RQUALI'] : ['ROU_DIAG']);

  PlanCore.allures({
    // Rousset : résistance vitesse ≈ 95 – 100 % de sa vitesse sur la distance (150 à 200 m), soit environ 130 – 140 % de VMA
    rVitesse: { nom: '95 – 100 % de votre vitesse sur la distance (≈ 135 % de VMA)', min: pv(130, 140) }
  });

  PlanCore.seances({
    // Rousset : endurance active (train à allure marathon – semi, tempo-route en fractions à allure 10 km – semi), résistance quantitative (VMA,
    // récupération courue sans jamais s'arrêter), résistance qualitative et vitesse (récupérations longues et passives), diagonales
    ROU_TRAIN: { nom: 'Train (endurance active)', zone: 'Z3', gen: (l, s, c) => continu(c, lerp(20, 45, l) * s, 'mcSteady') },
    ROU_TEMPO: { nom: 'Tempo-route', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [4, 12], [16, 36], [0.2, 0.15]), c.dist > 20000 ? 'lt' : 'k10', 'en trottinant, sans jamais s\'arrêter') },
    ROU_RQUANTI: { nom: 'Résistance quantitative (VMA)', zone: 'Z5', conseil: "Ne jamais marcher ni s'arrêter : la récupération se court (en trottinant, pas moins de 9 km/h). Réglez l'effort à la sensation plutôt qu'au chrono.",
      gen: (l, s, c) => fractions(c, series(l, s, [0.75, 3.5], [12, 20], [1.1, 0.8]), l < 0.5 ? 'v100' : 'v95_100', 'en trottinant') },
    ROU_RQUALI: { nom: 'Résistance qualitative', zone: 'Z6', conseil: "Récupération longue et passive (5 à 10 min, voire plus) : partir détendu, à 90 – 95 % de vos possibilités sur la distance.",
      gen: (l, s, c) => fractions(c, series(l, s, [0.75, 1.6], [4, 8], [5, 4], 5), 'r', 'passive') },
    ROU_RVITESSE: { nom: 'Résistance vitesse', zone: 'Z6', conseil: 'Récupération complète (5 à 10 min) : chaque répétition doit rester vive et relâchée.',
      gen: (l, s, c) => fractions(c, series(l, s, [0.4, 0.55], [2, 3.5], [12, 12], 5), 'rVitesse', 'passive ou en marchant') },
    ROU_DIAG: { nom: 'Diagonales', zone: 'Z6', gen: (l, s, c) => {
      const n = Math.round(lerp(20, 40, l));
      return { travail: n, effort: n * 0.25, km: c.profil && (n * 0.1 + n * 0.75 / aZ(c, 'Z1')), texte: `${n} diagonales d'un terrain de sport (≈ 100 m) : accélération progressive puis relâchement, retour en trottant sur la longueur (≈ 45 s)` };
    } }
  });

  PlanCore.methode({ id: 'rousset', nom: 'Rousset', titre: 'Didier Rousset : courir au naturel (aut\'roman)',
    source: "Rousset D., « Courir au naturel aut'roman » (blog courirautroman.unblog.fr, texte et tableaux écrits au début des années 1990) : pyramide des pourcentages, cycles de 10 jours, séances et allures ; mentions sur le forum courseapied.net (fil « méthode Didier »).",
    resume: "Beaucoup de footings lents, presque tous les jours, et des cycles d'environ 10 jours où l'on glisse, entre deux footings, les formes de travail dont on a besoin : endurance active (train, tempo-route), résistance quantitative (VMA), résistance qualitative et vitesse pour ceux qui en manquent. L'intensité se règle à la sensation, jamais jusqu'à l'épuisement.",
    principes: ["Pyramide en kilomètres (route, marathon) : 55 % de footings lents (± 10), 25 % d'endurance active (± 10), 12 % de résistance quantitative (± 5), 5 % de résistance qualitative, 2 % de résistance vitesse, 1 % de vitesse. Piste (1500 – 5000 m) : 75 % / 10 % / 10 % / 2 % / 2 % / 1 %.",
      "Cycle de 10 jours, sans jour imposé : marathon et semi = 2 résistance quantitative, 3 endurance active, 1 sortie longue, 4 footings et, si besoin, 1 résistance vitesse ; 5 et 10 km = plus de résistance quantitative et qualitative. Entre deux séances, deux footings de récupération en général ; ensuite 3 à 4 jours de « repos relatif » (footings), et 2 à 3 jours très faciles avant et après une compétition.",
      "Endurance active : le train (allure marathon à semi, fréquence 140 – 180) et le tempo-route (fractions à allure 10 km – semi, récupération courue) ; à manier avec douceur, jamais tous les footings au seuil.",
      "Résistance quantitative (travail de VMA : 12 × 400 m, 10 × 500 m, 5 × 1000 m, 25 × 200 m à 95 – 105 % de VMA) : récupération courue (trot sur 200 m ou sur la distance), sans jamais s'arrêter ni marcher. Résistance qualitative (5 × 500 m, > 110 % de VMA) et résistance vitesse (6 × 150 m, ≈ 135 %) : récupérations longues et passives (5 à 15 min). Diagonales de terrain de sport (20 à 50) et côtes en bonds (Lydiard « light »).",
      "La vitesse (V.M.R.) est le plafond de l'endurance : un coureur lent sur 100 m a besoin de vitesse et de résistance (pas avant d'avoir un bon foncier) ; une endurance à développer demande surtout des footings longs et lents, du train et de la résistance quantitative. Ici, le choix se fait d'après votre indice d'endurance.",
      "Footings à moins de 140 pulsations (112 – 124 pour récupérer), avec quelques accélérations (Fayolle) ; régler les séances à la sensation d'intensité plutôt qu'au chrono ; ne pas viser la ligne d'un objectif mais celle de sa valeur actuelle ; pas de marathon avec moins de quelques mois de préparation."],
    maxQ: 3, partQualite: 0.4, lignes: { n: 6, texte: 'accélérations progressives de 15 à 20 s dans le footing (Fayolle)' },
    noteProfil: c => (!c.profil ? '' : biais(c) >= 1 / 3 ? `Indice d'endurance ${f1(c.profil.IE)} : bonne endurance, peu de vitesse relative, donc résistance vitesse et qualitative incluses (selon Rousset, la vitesse est le plafond de l'endurance).`
      : biais(c) <= -1 / 3 ? `Indice d'endurance ${f1(c.profil.IE)} : endurance à développer, donc pas de résistance vitesse ni qualitative, mais des footings longs, du train et de la résistance quantitative.` : ''),
    score: { '5k': 2, '10k': 2.5, semi: 3, marathon: 3 },
    difficulte: [3, "beaucoup de footings et des séances variées (VMA, tempo, vitesse selon vos lacunes), réglées à la sensation, jamais jusqu'à l'épuisement"],
    phases: [{ nom: 'Foncier', f: 0.45, q: c => (c.dist > 20000 ? ['ROU_TRAIN', 'ROU_RQUANTI', 'ROU_TEMPO'] : ['ROU_TEMPO', 'ROU_RQUANTI', 'ROU_DIAG']), sl: 'SL' },
      { nom: 'Développement', f: 0.8, q: c => (c.dist > 20000 ? ['ROU_TEMPO', 'ROU_RQUANTI', ...rouVitesse(c)] : ['ROU_RQUANTI', 'ROU_TEMPO', ...rouVitesse(c)]), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: c => ['SPE', 'ROU_RQUANTI', c.dist > 20000 ? 'ROU_TRAIN' : rouVitesse(c)[0]], sl: 'SL_SPE' }],
    ordre: 18,
    fiche: { public: 'Coureurs réguliers (4 à 7 sorties par semaine), du 5 km au marathon, qui réglent leur effort à la sensation', plan: '16 à 18 semaines', mise: 'moyenne', h: 4, j: 4 },
    bio: "Didier Rousset, entraîneur français dont la méthode, écrite au début des années 1990, est diffusée par son blog « Courir au naturel » et discutée sur le forum courseapied.net (« méthode Didier »)." });
})();
