/* Méthode Fitzgerald (Matt Fitzgerald : 80/20 Running) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, fD, arrondi, moy, al, kmS, series, fractions, continu, footing, ALLURES } = PlanCore;

  PlanCore.seances({
    // Fitzgerald (80/20) : sa zone 3 = seuil (allure 1 h), zone 4 = VO2max (allure 3000 – 5000 m), zone 5 = vitesse (allure 1500 m)
    FITZ_TEMPO: { nom: 'Tempo (zone 3)', zone: 'Z4', gen: (l, s, c) => continu(c, lerp(20, 30, l) * s, 'seuil') },
    FITZ_CRUISE: { nom: 'Cruise intervals (zone 3)', zone: 'Z4', gen: (l, s, c) => fractions(c, series(l, s, [5, 8], [18, 30], [0.33, 0.25]), 'seuil', 'en trottinant (zone 1)') },
    FITZ_LONG_INT: { nom: 'Intervalles longs (zone 4)', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [3, 5], [15, 24], [0.67, 0.4]), 'i', 'en trottinant (zone 1)') },
    FITZ_SHORT_INT: { nom: 'Intervalles courts (zone 5)', zone: 'Z6', gen: (l, s, c) => fractions(c, series(l, s, [1, 1.5], [8, 14], [1.5, 1]), 'r', 'en trottinant (zone 1)') },
    FITZ_FARTLEK: { nom: 'Speed play (zone 4)', zone: 'Z5', gen: (l, s, c) => {
      const n = Math.max(4, Math.round(lerp(6, 10, l) * s)), r = arrondi(lerp(0.5, 1, l));
      return { travail: n * (r + 1), effort: n * r, km: c.profil && kmS(c, { n, r, rc: 1 }, moy(ALLURES.i.min(c))),
        texte: `footing en zone 2 avec ${n} accélérations de ${fD(r)} ${al(c, 'i')}, 1 min de footing entre chacune` };
    } }
  });

  PlanCore.methode({ id: 'fitzgerald', nom: 'Fitzgerald', titre: 'Matt Fitzgerald : 80/20 Running',
    source: "Fitzgerald M., 80/20 Running: Run Stronger and Race Faster by Training Slower (Penguin, 2014 : chap. 6 zones, chap. 7 séances, chap. 8 à 11 plans de 9, 12, 15 et 18 semaines, annexe sur le contrôle de l'intensité).",
    resume: "Environ 80 % du temps d'entraînement en faible intensité (zones 1 – 2) et 20 % en intensité modérée à élevée (zones 3 – 5), compté en temps. Trois jours durs par semaine (deux séances et la sortie longue), séparés par des jours faciles ; une semaine de récupération toutes les trois semaines ; une phase de base puis une phase de développement spécifique.",
    principes: ['Zones en % de la fréquence cardiaque au seuil : 1 faible aérobie (75 – 80 %), 2 aérobie modérée (81 – 89 %), 3 seuil (96 – 100 %), 4 VO2max (102 – 105 %), 5 vitesse (≥ 106 %) ; les écarts entre zones (90 – 95 %, 101 %) sont volontairement évités.',
      'Faible intensité : footings de récupération (zone 1), footings de base (zone 2), sortie longue ; échauffements, retours au calme et récupérations comptent comme du facile.',
      'Séances : tempo (20 à 30 min en zone 3), cruise intervals (par exemple 4 × 6 min, 2 min de trot), intervalles longs (3 à 5 min en zone 4), intervalles courts (60 à 90 s en zone 5), speed play, côtes, sortie longue avec fin rapide.',
      "5 km : plus d'intensité élevée ; marathon : plus d'intensité modérée (zone 3). Une semaine de récupération toutes les trois semaines.",
      "Plans du livre : 9 semaines pour le 5 km (3 de base, 5 de pointe, 1 d'affûtage), 12 pour le 10 km (6, 4, 2), 15 pour le semi (6, 7 ou 8, 1 ou 2), 18 pour le marathon (9, 7, 2). La base est plus proche de 90/10 (on monte le volume), la pointe respecte le 80/20.",
      'Ici, la qualité de la semaine (récupérations comprises) est plafonnée à 25 % du temps ; zone 3 = allure 1 h, zone 4 = allure 3000 – 5000 m, zone 5 = allure 1500 m.'],
    maxQ: 2, partQualite: 0.25, lignes: { n: 6, texte: 'lignes droites de 20 s (trop courtes pour compter dans les 20 %)' },
    score: { '5k': 2.5, '10k': 3, semi: 3, marathon: 3 },
    difficulte: [2, "surtout du facile, deux séances dures par semaine dosées à 20 % du temps"],
    // base : 3 semaines sur 9 (5 km), 6 sur 12 (10 km), 6 sur 15 (semi), 9 sur 18 (marathon), proche de 90/10 ; développement ensuite à 80/20
    phases: [{ nom: 'Base', f: c => ({ '5k': 0.33, '10k': 0.5, semi: 0.4, marathon: 0.5 })[c.goal] ?? 0.5, partQualite: 0.15, q: ['FITZ_FARTLEK', 'COTES', 'FITZ_TEMPO'], sl: 'SL_FIN' },
      { nom: 'Développement', f: 1, q: c => ({ '5k': ['FITZ_LONG_INT', 'FITZ_SHORT_INT'], '10k': ['FITZ_CRUISE', 'FITZ_LONG_INT'], semi: ['FITZ_TEMPO', 'FITZ_CRUISE'], marathon: ['FITZ_CRUISE', 'FITZ_TEMPO'] })[c.goal], sl: c => (c.dist > 20000 ? 'SL_SPE' : 'SL_FIN') }],
    ordre: 15,
    fiche: { public: 'Amateurs réguliers visant un chrono, du 5 km au marathon', plan: '9 à 18 semaines', mise: 'simple', h: 3, j: 4 },
    bio: "Matt Fitzgerald, auteur et entraîneur américain spécialiste de l'endurance ; <cite>80/20 Running</cite> (2014) adapte aux coureurs amateurs les travaux de Stephen Seiler." });
})();
