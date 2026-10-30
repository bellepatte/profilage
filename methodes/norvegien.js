/* Méthode norvégienne (Méthode norvégienne : double seuil) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { fD, allureDist, aZ, kmS, series, fractions, nbDoubles, footing } = PlanCore;

  // double seuil : séance du soir associée à celle du matin, et part maximale du travail au seuil dans le volume de la semaine
  const SEUIL_NO = { SEUIL_NO_LONG: 'SEUIL_NO_COURT', SEUIL_NO_COURT: 'SEUIL_NO_LONG' }; // séance du soir d'un double seuil
  const SEUIL_PART = 0.2; // méthode norvégienne : travail au seuil de la semaine ≤ 20 % du volume (hypothèse)

  PlanCore.allures({
    ssLong: { nom: 'allure semi – 30 km, sous le seuil', min: c => [allureDist(c, 21097), allureDist(c, 30000)] },
    ssCourt: { nom: 'allure 10 – 15 km, au seuil', min: c => [allureDist(c, 10000), allureDist(c, 15000)] }
  });

  PlanCore.seances({
    // Méthode norvégienne : seuil contrôlé (lactate ≈ 2 à 4 mmol/L), fractions longues le matin, courtes le soir, récupérations brèves
    SEUIL_NO_LONG: { nom: 'Seuil, fractions longues', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 2 à 3 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [5, 10], [25, 40], [0.2, 0.1], 1), 'ssLong', 'en trottinant') },
    SEUIL_NO_COURT: { nom: 'Seuil, fractions courtes', zone: 'Z4', conseil: "Intensité contrôlée : finir en pouvant en faire plus (idéalement lactate ≈ 3 à 4 mmol/L).",
      gen: (l, s, c) => fractions(c, series(l, s, [1.5, 3], [20, 30], [0.4, 0.2], 0.5), 'ssCourt', 'en trottinant') },
    COTES_COURTES: { nom: 'Côtes courtes', zone: 'Z6', gen: (l, s, c) => {
      const S = series(l, s, [0.5, 0.75], [6, 12], [2.5, 2]);
      return { travail: S.travail, effort: S.n * S.r, km: c.profil && kmS(c, S, aZ(c, 'Z6')), texte: `${S.n} × ${fD(S.r)} de montée rapide et relâchée (Z6), retour en trottinant dans la descente (≈ ${fD(S.rc)})` };
    } }
  });

  PlanCore.methode({ id: 'norvegien', nom: 'norvégienne', titre: 'Méthode norvégienne : double seuil',
    source: "Casado A., Foster C., Bakken M., Tjelta L. I., Does Lactate-Guided Threshold Interval Training within a High-Volume Low-Intensity Approach Represent the « Next Step » in the Evolution of Distance Running Training?, Int J Environ Res Public Health 2023 (lu : description par Bakken, séance type, semaine type) ; « The Norwegian model of lactate threshold training » (Athletics Coach) ; variante « singles » de sirpoc, résumé LetsRun archivé (sub-threshold) ; Tjelta L. I., Int J Sports Sci Coach 2019 (non lu).",
    resume: "Beaucoup de volume facile et deux journées « double seuil » par semaine : fractions longues le matin, fractions courtes le soir, à une intensité contrôlée juste sous le seuil (idéalement au lactatomètre), plus une séance de côtes courtes et une sortie longue. Sans doublé : variante « singles » (trois séances sous le seuil par semaine).",
    principes: ['Deux jours par semaine à deux séances au seuil : matin, fractions longues (ex. 3 × 2 km, 4 × 10 min) ; soir, fractions courtes (ex. 8 × 1 min un peu au-dessus du seuil, 10 × 400 m juste en dessous) ; récupérations brèves.',
      "Intensité contrôlée, sous le seuil : lactate ≈ 2 à 3 mmol/L (élites) ; sans lactatomètre, effort perçu 6 – 7 sur 10, finir en pouvant en faire plus. Un peu trop vite et le travail au seuil possible tombe de moitié.",
      'Une séance courte et rapide (côtes courtes de 30 à 45 s) en fin de semaine, le reste en footing vraiment facile.',
      "Entretien de Bakken (traduit, runningwritings.com, 2024) : au plus deux jours doubles par semaine ; le matin des fractions longues de 6 à 10 min, plus lentes, à lactate et fréquence cardiaque plus bas ; l'après-midi des fractions courtes (1 min, 45 s / 15 s, 200 m) à lactate plus haut, environ quatre heures plus tard ; 15 à 20 km de travail au seuil les jours doubles (40 km, trop usant), 70 à 80 km de seuil par semaine au pic ; sorties longues d'environ 45 min à 1 h au plus ; musculation légère et explosive toute l'année ; avant une course, séance au seuil 6 – 7 jours avant, 1 000 m à allure un peu plus rapide que le 5 km 4 jours avant, seuil 2 jours avant. Conseil aux amateurs : viser le seuil où les jambes ne fléchissent pas ; c'est le volume, pas l'intensité, qui fatigue.",
      "Modèle décrit par Bakken (observé chez des coureurs de 1 500 à 5 000 m, jamais testé en essai contrôlé, applicabilité au marathon incertaine) : 3 à 4 séances au seuil (lactate de 2 à 4,5 mmol/L, Bakken visait 2,3 – 3,0) et une séance à VO2max par semaine ; 150 à 180 km par semaine, sortie longue de 21 km au plus. Séances : 2 000 à 3 000 m à allure proche du semi, ou 400 à 1 000 m entre allure 5 km et 10 km, 8 à 12 km de travail au total, récupération de 20 s à 1 min 30 ; deux séances au seuil le même jour. En période de compétition : deux séances au seuil de moins, la séance de côtes remplacée par des répétitions à l'allure de course.",
      "Sans doublé, trois séances sous le seuil par semaine (fractions longues, courtes, longues) : voir aussi la méthode Norwegian Singles (sirpoc), qui en détaille le format, les niveaux et l'absence de décharge."],
    maxQ: 3, doubleSeuil: { soir: SEUIL_NO, part: SEUIL_PART },
    score: { '5k': 2.5, '10k': 3, semi: 2.5, marathon: 2 },
    difficulte: [4, 'deux journées à double séance au seuil par semaine : intensité modérée mais volume de qualité très élevé ; sans doublé, la variante « singles » est plus accessible'],
    phases: [{ nom: 'Développement', f: 0.75, q: () => (nbDoubles() ? ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'COTES_COURTES'] : ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SEUIL_NO_LONG']), sl: 'SL' },
      { nom: 'Spécifique', f: 1, q: ['SEUIL_NO_LONG', 'SEUIL_NO_COURT', 'SPE'], sl: 'SL' }],
    ordre: 8, bioTitre: 'Origine',
    fiche: { public: "Coureurs entraînés, du 5 km au semi, à l'aise avec le travail au seuil", plan: '12 semaines ou plus', mise: 'complexe', h: 5, j: 5, ie: true },
    bio: "Pas un entraîneur unique : la méthode a été décrite par Marius Bakken, coureur norvégien de 5 000 m (deux fois olympique, 2000 et 2004) devenu médecin, et rendue célèbre par les frères Ingebrigtsen." });
})();
