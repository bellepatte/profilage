/* Méthode Norwegian Singles (Norwegian Singles (sirpoc) : trois séances sous le seuil) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, borne, fourchette, arrondi, allureDist, fractions, continu, footing } = PlanCore;

  // Norwegian Singles : temps de travail sous le seuil par séance de 18 à 40 min selon le niveau (table de niveaux du forum courseapied.net,
  // 8 niveaux) ; livre de Copeland : court 3 min (récupération 1 min, allure 12 – 15 km), moyen 5 – 6 min (1 min 30, allure 20 km), long 10 – 12 min (1 min 30 à 2 min, allure 25 – 30 km)
  const nsFractions = (c, l, s, rep, cle) => {
    const W = borne(lerp(18, 40, l) * s, 18, 40), r = arrondi(lerp(rep[0], rep[1], l)), n = Math.max(2, Math.round(W / r)), rc = r < 5 ? 1 : r < 8 ? 1.25 : 1.75;
    return fractions(c, { r, n, rc, travail: n * r + (n - 1) * rc }, cle, 'en trottinant ou à l\'arrêt');
  };
  const NS_CONSEIL = "Sous le seuil, intensité contrôlée : fréquence cardiaque juste sous celle du seuil lactique à la dernière répétition (effort 6 – 7 sur 10) ; finir en pouvant en refaire. Si la fatigue s'accumule, baissez l'allure.";

  PlanCore.allures({
    // Norwegian Singles (sirpoc) : fractions sous le seuil à allure 15 km (courtes), semi (moyennes) et 30 km (longues)
    a15: { nom: 'allure 15 km', min: c => allureDist(c, 15000) },
    a20: { nom: 'allure 20 km', min: c => allureDist(c, 20000) },
    a30: { nom: 'allure 30 km', min: c => allureDist(c, 30000) }
  });

  PlanCore.seances({
    // Norwegian Singles (sirpoc) : trois séances sous le seuil par semaine (court, moyen, long), sans VO2max
    NS_COURT: { nom: 'Sous-seuil court', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [3, 4], 'a15') },
    NS_MOYEN: { nom: 'Sous-seuil moyen', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [5, 6], 'a20') },
    NS_LONG: { nom: 'Sous-seuil long', zone: 'Z4', conseil: NS_CONSEIL, gen: (l, s, c) => nsFractions(c, l, s, [10, 12], 'a30') }
  });

  PlanCore.methode({ id: 'singles', nom: 'Norwegian Singles', titre: 'Norwegian Singles (sirpoc) : trois séances sous le seuil',
    source: "Copeland J. (« sirpoc »), Norwegian Singles Method: Subthreshold Running Kept Simple (2025, lu : chap. 2 à 4, détermination des allures, semaines types de 4 h à 9 h, affûtage, marathon) d'après les travaux de Bakken M. et l'entraînement de K. Ingebrigtsen ; fil « Norwegian singles » du forum courseapied.net (septembre 2025 – 2026 : table de niveaux 1 à 8, avis de Bakken).",
    resume: "Variante « single » du modèle norvégien pour des amateurs de 5 à 9 h par semaine : trois séances sous le seuil lactique chaque semaine (courte, moyenne, longue), le reste en endurance très facile, une sortie longue. On maximise la charge répétable sans fatigue excessive et on la maintient : pas de semaine de décharge, pas d'affûtage, pas de VO2max ni d'allure spécifique.",
    principes: ["Trois séances sous le seuil (juste sous le second seuil lactique, haut de la zone 3 / bas de la zone 4) : court 7 – 10 × 3 min à allure 12 – 15 km (récupération 1 min), moyen 4 – 6 × 5 – 6 min à allure 20 km (1 min à 1 min 30), long 2 – 4 × 10 – 12 min à allure 25 – 30 km (1 min 30 à 2 min) ; une séance de chaque type par semaine (rotation si moins de trois séances). Semaine type du livre : long le mardi, moyen le jeudi, court le samedi, sortie longue facile le dimanche, footings faciles les autres jours.",
      "Intensité contrôlée : finir la dernière répétition juste sous la fréquence cardiaque au seuil lactique (effort 6 – 7 sur 10), 10 à 15 battements sous elle à la première répétition ; en cas de doute, ralentir. Footings à moins de 70 % de la fréquence cardiaque maximale. Commencer au bas de la fourchette d'allure ; première répétition 1 à 2 % plus lente ; après une mauvaise nuit, une maladie ou du stress, passer à la fourchette d'allure de la durée de répétition inférieure. Échauffement de 10 min en footing, sans lignes droites, retour au calme de 7 à 10 min ; récupération à l'arrêt, en marchant ou en trottant, au choix. À partir de votre dernier 5 km (table du livre : 5 km en 18:00 → 3:50 /km pour 3 min, 3:56 pour 6 min, 4:03 pour 10 min), plus prudent que les allures de course.",
      "Progression par niveaux (table du forum) : temps sous le seuil par séance de 18 min (niveau 1) à 40 min (niveau 8), semaine de 4 h 40 à 8 h, avec 20 min d'échauffement et 5 min de retour au calme par séance ; la difficulté choisie règle le niveau de départ.",
      "Part sous le seuil : 19 % du temps au niveau 1, 23 % au niveau 2, 25 % au-delà (ici, qualité plafonnée à 25 % du temps de la semaine) ; monter le volume facile en même temps que la qualité, sans augmenter vite.",
      "Pas de semaine de décharge (même charge répétable sur des mois), peu ou pas d'allure spécifique ; test sur une course ou un 5 km en solo toutes les 4 à 8 semaines pour recaler les allures. Progression : une minute de travail sous le seuil en plus pour quatre minutes de footing en plus (≈ 75 / 25 %, 78 / 22 % vers 7 h), au moins un mois à chaque niveau puis 2 – 3 semaines intermédiaires (une répétition de plus, 12 min de footing de plus), jamais en accélérant. Au-delà de 8 h par semaine, passer à des footings en deux séances.",
      "Origine : Kristoffer Ingebrigtsen (≈ 90 à 100 km par semaine, 2021) : mardi 8 × 1 000 m avec 500 m de trot, jeudi 4 – 5 × 2 000 m au seuil avec 1 min de repos, samedi 3 × 3 000 m ou 3 × 10 min, footings de 12 km les autres jours, sortie longue de 12 à 18 km. Son conseil aux amateurs : trotter jusqu'à tenir 8 – 10 km avant d'ajouter des fractions, puis plus de répétitions plutôt que plus vite (source : runningwritings.com, 2025).",
      "Courses : un 5 km compte comme une séance de la semaine, sans affûtage ; pour un 10 km ou un semi, un affûtage court (séance normale le mardi, 6 – 8 × 3 min près de l'allure semi ou marathon le jeudi, footings plus courts de 30 à 40 % la veille et l'avant-veille) et un retour progressif après la course (les affûtages longs coûtent de la forme à ceux qui s'entraînent peu).",
      "Pas adaptée si vous avez plus de 10 h par semaine, visez une course précise avec un pic de forme ou avez besoin de variété. De 4 h à 8 h par semaine (4 – 4,5 h : porte d'entrée, un jour de repos, 2 × 10 min à 95 % de l'allure marathon) ; 6 sorties recommandées (3 sous le seuil, 2 à 3 footings, une sortie longue). Marathon : l'auteur déconseille d'en faire un plan à part entière (au moins deux ans de pratique, trois mini-blocs puis affûtage) : adaptations nécessaires."],
    maxQ: 3, partQualite: 0.25, footingMax: 60, sansAffutage: true, constant: true, rotation: true,
    lignes: { n: 6, texte: 'lignes droites de 20 s (facultatives, en complément, sans gêner la récupération)' },
    score: { '5k': 3, '10k': 3, semi: 2.5, marathon: 1.5 },
    difficulte: [3, 'trois séances sous le seuil par semaine à contrôler (fréquence cardiaque), volume de qualité élevé mais intensité maîtrisée, sans repos programmé'],
    phases: [{ nom: 'Progression continue', f: 1, q: ['NS_COURT', 'NS_MOYEN', 'NS_LONG'], sl: 'SL' }],
    ordre: 17, bioTitre: 'Origine',
    fiche: { public: 'Amateurs de 4 à 8 h par semaine, du 5 km au semi, sans objectif de pic de forme', plan: '12 semaines ou plus, en continu', mise: 'moyenne', h: 4, j: 5 },
    bio: "Méthode d'un coureur amateur, J. Copeland, connu sous le pseudonyme « sirpoc » sur le forum LetsRun : tirée des travaux de Marius Bakken, elle est exposée dans son livre de 2025." });
})();
