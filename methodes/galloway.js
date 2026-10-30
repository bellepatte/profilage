/* Méthode Galloway (Jeff Galloway : course-marche et pyramide) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { E, fD, fA, allureDist, MILE, ajoute, series, fractions, finPhase } = PlanCore;

  const allureGalloway = (c) => allureDist(c, 42195) + 2 / MILE;
  const RATIOS_GALLOWAY = [[8.5, 4, 0.5], [9.5, 2, 0.5], [10.5, 1.5, 0.5], [12.5, 1, 0.5], [14.5, 0.5, 0.5], [15.5, 0.25, 0.5], [Infinity, 1 / 6, 0.5]];
  const ratioGalloway = (allure) => RATIOS_GALLOWAY.find(([p]) => allure * MILE <= p).slice(1);
  /** Texte course-marche ajouté aux footings et sorties longues (champ courseMarche de la méthode) */
  function courseMarche(c) {
    if (!c.profil) return ', en course-marche (ratio course / marche selon votre allure, par exemple 1 min 30 / 30 s)';
    const [r, w] = ratioGalloway(allureGalloway(c));
    return `, en course-marche : ${fD(r)} de course, ${fD(w)} de marche (ratio de Galloway pour ${fA(allureGalloway(c))})`;
  }

  PlanCore.allures({
    // Galloway : sortie longue à l'allure marathon + 2 min par mile (≈ + 1 min 15 /km)
    galSL: { nom: 'allure de sortie longue Galloway (marathon + 2 min par mile)', min: c => allureGalloway(c) }
  });

  PlanCore.seances({
    // Galloway : fractions à l'allure de l'objectif (en durée), récupération en marchant ; mile magique = test toutes les 2 semaines
    // Galloway, Marathon: You Can Do It! : répétitions « miles » à l'allure de l'objectif, marche d'au moins 4 min entre elles (en durée, pas en distance)
    GAL_MILE: { nom: "Répétitions à l'allure de l'objectif", zone: 'obj', gen: (l, s, c) => fractions(c, series(l, s, [6, 11], [18, 66], [0.4, 0.4], 2), 'obj', 'en marchant (4 min au moins)') },
    // Galloway, livre de 1984 : répétitions de 440 yards (≈ 1 min 30 à 2 min) un peu plus vite que l'allure de l'objectif, jusqu'à 20, récupération en trottinant
    GAL84_440: { nom: 'Répétitions courtes (440 yards)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [1.25, 2], [6, 30], [1, 0.8], 2), 'k10', 'en trottinant') },
    GAL_MM: { nom: 'Mile magique (test)', zone: 'Z5',
      conseil: "Le temps obtenu recale les allures : allure marathon ≈ temps du mile × 1,3 ; sortie longue ≈ temps × 1,3 + 2 min par mile. Les pauses de marche sont permises.",
      gen: (l, s, c) => {
        const t = c.profil ? allureDist(c, 42195) * MILE / 1.3 : 9;
        return { travail: t, km: MILE, texte: `1 mile (1609 m, 4 tours de piste) un peu plus vite que d'habitude, régulier, sans aller à fond${c.profil ? ` (≈ ${E.formatTemps(t)})` : ''}` };
      } }
  });

  PlanCore.methode({ id: 'galloway', nom: 'Galloway', titre: 'Jeff Galloway : course-marche et pyramide',
    source: "Galloway J., Marathon: You Can Do It! (2001 : programmes de 26 semaines, règle des deux minutes, marches selon la longueur de la sortie), Half-Marathon: You Can Do It! (2013 : mile magique, prédiction, objectifs réalistes) et Galloway's Book on Running (éd. révisée, 1984 : la pyramide, vitesse, côtes) ; jeffgalloway.com : « Train for a Marathon Finish » (table des ratios course / marche).",
    resume: "Deux apports de Galloway réunis : la course-marche (pauses de marche régulières dès le début de chaque sortie, selon un ratio qui dépend de l'allure) et sa pyramide d'entraînement (large base facile, quelques semaines de côtes, puis une période de vitesse courte). Trois jours de course par semaine, une sortie longue lente qui s'allonge progressivement jusqu'à dépasser la distance de course, un « mile magique » pour recaler les allures.",
    principes: ['Course-marche à toutes les sorties : par exemple 4 min / 30 s à 5:00 /km, 1 min 30 / 30 s à 6:15 /km, 30 s / 30 s à 8:05 /km (table de Galloway par mile). Les coureurs avancés peuvent s\'en passer (livre de 1984), mais le livre de 2013 recommande de la garder.',
      'Pyramide (1984) : base de la moitié de la préparation, 4 à 6 semaines de côtes, puis la vitesse, 8 semaines au plus (12 à 14 pour le marathon), d\'où les trois phases du plan. Avant la vitesse : un an de course et 2 à 3 mois d\'aérobie.',
      'Trois jours de course par semaine (deux sorties courtes et une longue le week-end) ; renforcement ou vélo en option les autres jours, repos la veille de la sortie longue ; jamais plus de 10 % de temps de plus d\'une semaine à l\'autre.',
      "Sorties longues : on part de la plus longue des dernières semaines et on ajoute 1 mile par semaine jusqu'à 10, puis une sortie une semaine sur deux (toutes les trois semaines après 18 miles) jusqu'à dépasser la course d'au moins 20 % (marathon : 28 miles au mieux ; 26 miles au minimum). Ici : une semaine sur deux, jusqu'à 24 km (10 km), 29 km (semi) ou 45 km (marathon).",
      'Allure de la sortie longue : au moins 2 min/mile plus lente que le marathon possible ce jour-là (3 min après une sortie manquée, 3 min sous l\'allure du semi : même résultat avec le mile magique × 1,3 + 2 min). Marche d\'une minute toutes les 3 à 5 min, toutes les 4 min vers 18 – 20 miles, toutes les 3 min dès 23 miles.',
      "Mile magique (4 tours de piste, à bloc pour vous, après échauffement et 4 accélérations-glissées) : allure marathon ≈ temps × 1,3, semi ≈ × 1,2. Une fois par semaine le premier mois, puis toutes les quelques semaines ; on garde les 4 derniers résultats, on écarte le plus lent et on moyenne les trois autres. Objectif réaliste : 3 % de mieux (5 % au mieux), atteint un peu plus d'une fois sur deux. Les courses de 5 km servent aussi de prédiction.",
      "Côtes : 4 à 12 côtes de 150 à 200 yards (10 – 15 % de pente) à l'effort d'un 5 km, descente en marchant. Vitesse : une séance par semaine, deux jours faciles ensuite ; répétitions un peu plus vites que l'allure de course (5 à 7 s par 440 yards) : 440 yards pour le 10 km et moins (jusqu'à 20), un mile pour le semi et le marathon (3 à 13, marche d'au moins 4 min entre elles), au total environ la moitié de la distance de course pour le marathon.",
      "Semaine : mardi au moins 1 min/mile plus lent que l'allure marathon ; en semaine, 1 à 3 miles à l'allure marathon prédite par les courses de 5 km ; exercices de cadence et accélérations-glissées.",
      "Ralentir de 30 s par mile (≈ 20 s /km) tous les 3 °C au-dessus de 15 °C."],
    maxQ: 1, joursMax: 3, footingMax: 45, courseMarche: { cle: 'galSL', allure: allureGalloway, texte: courseMarche }, test: { id: 'GAL_MM', tous: 2 }, slUneSur2: true, partQualite: 0.2,
    slKm: c => ({ '5k': 16, '10k': 24, semi: 29, marathon: 45 })[c.goal] ?? null, lignes: { n: 6, texte: 'accélérations-glissées de 15 à 20 s (accélérer puis se laisser glisser, foulée souple)' },
    noteProfil: c => (c.profil ? `Allure de sortie longue ≈ ${fA(allureGalloway(c))}, ratio course / marche conseillé : ${ratioGalloway(allureGalloway(c)).map(fD).join(' / ')}.` : ''),
    score: { '5k': 2, '10k': 2.5, semi: 2.5, marathon: 3 },
    difficulte: [2, "pauses de marche et allures lentes, mais une base longue, puis des côtes et des répétitions à l'allure de course"],
    // base, 4 semaines de côtes, puis vitesse (8 semaines pour le 10 km et moins, 12 pour le semi et le marathon), réduit proportionnellement si le plan est court
    phases: [{ nom: 'Base aérobie', f: c => finPhase(c.dist > 20000 ? 16 : 12, c.dist > 20000 ? 16 : 12), q: ['EF_LD'], sl: 'SL' },
      { nom: 'Jeu de côtes', f: c => finPhase(c.dist > 20000 ? 12 : 8, c.dist > 20000 ? 16 : 12), q: ['COTES'], sl: 'SL' },
      { nom: "Vitesse à l'allure de l'objectif", f: 1, q: c => (c.dist > 20000 ? ['GAL_MILE'] : ['GAL84_440']), sl: 'SL' }],
    ordre: 14,
    fiche: { public: 'Débutants et reprise, ou coureurs patients : finir un 10 km, un semi ou un marathon, ou progresser doucement', plan: '16 à 32 semaines', mise: 'simple', h: 2, j: 3 },
    bio: "Jeff Galloway, coureur américain sélectionné aux Jeux olympiques de 1972 sur 10 000 m, puis promoteur de la méthode course-marche, qui a ouvert le marathon à de nombreux débutants." });
})();
