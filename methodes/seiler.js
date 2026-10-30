/* Méthode Seiler (Stephen Seiler : entraînement polarisé (80/20)) : fiche, phases, séances et allures propres.
   Chargée après plan.js et plan-seances.js ; s'enregistre auprès du moteur (PlanCore.methode), qui ne la connaît que par ses champs. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { E, al, series, fractions } = PlanCore;

  PlanCore.seances({
    INTERVALLES_LONGS: { nom: 'Intervalles longs', zone: 'Z5', gen: (l, s, c) => fractions(c, series(l, s, [4, 8], [16, 32], [0.5, 0.25]), 'k10', 'en trottinant') }
  });

  PlanCore.methode({ id: 'seiler', nom: 'Seiler', titre: 'Stephen Seiler : entraînement polarisé (80/20)',
      source: "Seiler S., Tønnessen E., Intervals, Thresholds, and Long Slow Distance: the Role of Intensity and Duration in Endurance Training, Sportscience 13, 32 – 53 (2009, lu) ; Seiler S., What is best practice for training intensity and duration distribution in endurance athletes?, Int J Sports Physiol Perform 2010 ; Seiler S. et al., Scand J Med Sci Sports 2013 (intervalles 4 × 4, 4 × 8 et 4 × 16 min, 36 cyclistes de loisir) ; Aubry A., « S'entraîner lentement (parfois)… pour être plus performant », lepape-info (synthèse d'études d'élites, lue). Seiler ne publie pas de plan : le plan applique ses principes.",
      resume: "Environ 80 % des séances en faible intensité, le reste en haute intensité, très peu en zone intermédiaire. Les intervalles longs (4 à 8 min, 2 min de récupération) sont la séance type.",
      principes: ['Facile vraiment facile (Z1-Z2), dur vraiment dur : éviter la « zone grise ».', 'Deux séances intenses par semaine suffisent, même à gros volume (chez les élites, 1 à 3 séances par semaine à ou au-dessus du seuil, parmi 10 à 12 séances).',
        "Observé chez des élites : 75 à 80 % du temps en zone 1, environ 5 % en zone 2, 15 à 20 % en zone 3 (modèle à trois zones, bornées par les seuils ventilatoires). Un essai chez des coureurs de loisir visait 77 / 3 / 20 % mais a donné en pratique 65 / 21 / 14 % : sans contrôle, le facile devient trop soutenu (« trou noir de l'intensité »).",
        "Intervalles : 1 à 8 min à 90 – 100 % de VO2max, 1 à 5 min de récupération ; la meilleure réponse physiologique avec 4 min d'effort pour 2 min de récupération ; 4 × 4 min à 95 % de VO2max est une alternative proposée.",
        "Séance type : 4 × 8 min à effort élevé et régulier, 2 min de récupération (meilleure progression que 4 × 4 ou 4 × 16 min dans son étude sur des cyclistes de loisir entraînés).",
        "La répartition 80/20 se compte en séances plutôt qu'en temps.",
        "Répartitions observées chez des experts (synthèse d'Aubry, INSEP) : 71 à 85 % du temps en zone 1, au plus 15 à 25 % en zones 2 et 3 ; à volume égal, 81 / 11 / 8 % progresse mieux que 67 / 25 / 8 % (Lucia, coureurs nationaux). Ce sont des élites : ces pourcentages ne se transposent pas tels quels à d'autres niveaux."],
      maxQ: 2, score: { '5k': 2.5, '10k': 2.5, semi: 2, marathon: 2 },
      difficulte: [1, 'deux séances dures au plus, tout le reste vraiment facile : simple à suivre'],
      phases: [{ nom: 'Développement', f: 0.7, q: ['INTERVALLES_LONGS', 'VMA_LONG'], sl: 'SL' }, { nom: 'Spécifique', f: 1, q: ['INTERVALLES_LONGS', 'SPE'], sl: 'SL' }],
    ordre: 3,
    fiche: { public: 'Coureurs réguliers qui séparent nettement le facile et le dur (80/20)', plan: '8 à 12 semaines', mise: 'simple', h: 3, j: 4 },
    bio: "Stephen Seiler, physiologiste américain installé en Norvège (université d'Agder). Ses études sur la répartition de l'intensité chez les athlètes d'endurance d'élite ont popularisé l'entraînement polarisé (« 80/20 »)." });
})();
