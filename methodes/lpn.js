/* Méthode Spécifique LPN (méthode par défaut) : plan construit sur la répartition du volume par zone (onglet Balance). Les séances de qualité
   font tout le travail de Z3 à Z6 (blocs par zone) ; le reste du volume est partagé entre les séances faciles (une séance longue facile de 4/3
   de la moyenne, les autres à parts égales), sans sortie longue imposée ; la Z1 restante est courue les lendemains de qualité. Ses règles de
   construction (champ regles) remplacent celles des méthodes d'entraîneurs (REGLES_DEFAUT de plan.js). Chargée après plan.js. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { lerp, fD, fA, fourchette, arrondi, moy, zt, aZ, plageZ, ajoute, TLIM_PART, tlim, enveloppe, depasse, footing } = PlanCore;

  // Spécifique LPN : échauffement selon la zone : 20 min en Z5 (15 si la longueur de séance est contrainte), Z6 + 5 min, Z4 - 5 min, Z3 - 10 min
  const ECHAUFFEMENT_Z = { Z3: -10, Z4: -5, Z5: 0, Z6: 5 };
  const DECHARGE_Q = 0.5; // LPN : en décharge, le travail de qualité est la moitié de celui d'une semaine de charge (méthodes : une séance en moins)
  const OBJECTIF_CHARGE = 0.5; // LPN : semaine de l'objectif, charge ramenée à 50 % de la référence
  const SL_MAX = 300, EF_MIN = 20, EF_LEGER = 15; // LPN : plafond d'une séance facile (min) ; footing minimal ; footing avant les lignes droites
  const LONG_FACILE = 4 / 3; // LPN : la séance longue facile vaut 4/3 de la moyenne des séances faciles (pas de sortie longue imposée)
  const DOUBLES_SEANCES = 5; // LPN : nombre de séances par semaine à partir duquel un doublé est utile (libère des jours de repos)

  // Format des séances par zone (hypothèses) : durée d'une répétition (min) du niveau 1 au niveau 10, récupération en part de la
  // répétition, temps d'effort minimal d'un bloc sans profil et en Z6 (en dessous : ignoré, ou lignes droites pour Z6 ; avec un profil, voir seuilBloc), minimal pour former une séance à
  // lui seul (en dessous, le bloc s'ajoute à une autre séance)
  const FORMATS = {
    Z3: { nom: 'Allure soutenue', rep: [8, 20], recup: [0.3, 0.1], min: 5, seul: 15 },
    Z4: { nom: 'Seuil', rep: [4, 12], recup: [0.4, 0.15], min: 4, seul: 10 },
    Z5: { nom: 'VMA', rep: [1.5, 4], recup: [1, 0.6], min: 3, seul: 8 },
    Z6: { nom: 'Vitesse', rep: [0.33, 1], recup: [3, 2], min: 4, seul: 5 }
  };
  const ZI = Object.keys(FORMATS), BLOCS_MAX = 3, ENTRE_BLOCS = 3; // blocs par séance ; trot entre deux blocs (min)

  /** Temps d'effort minimal d'un bloc à l'allure a (min/km) : 20 s à la VMA, 1 min à l'allure 1 h, 3 min à 80 % de l'allure 1 h (limite Z2/Z3).
      Loi de puissance du temps limite T entre ces trois points (T = 6 min à la VMA, 60 min à l'allure 1 h), prolongée au-delà avec la pente du segment voisin. */
  function seuilBloc(c, a) {
    const T = tlim(c, a), T3 = tlim(c, 1.25 * 1000 / c.vRef);
    return T <= 60 ? (1 / 3) * Math.pow(T / 6, Math.log(3) / Math.log(10)) : Math.pow(T / 60, Math.log(3) / Math.log(T3 / 60));
  }
  /** Seuil d'ignorance d'un bloc de la zone z : seuilBloc à l'allure la plus rapide de la zone (allure cible si spe, VMA pour Z5) ;
      sans profil, ou en Z6 (lignes droites sous ce seuil), valeur fixe de FORMATS */
  const minBloc = (c, z, spe) => (!c.profil || z === 'Z6' ? FORMATS[z].min
    : seuilBloc(c, spe ? c.allureObj : z === 'Z5' ? 1000 / c.profil.V : c.zones[z].allureRapide));
  /** Bloc de m minutes d'effort dans la zone z, en répétitions (ou en continu) selon le niveau l ; spe : à l'allure cible */
  function blocZone(c, z, m, l, spe) {
    // au moins 2 répétitions hors Z3 dès que le temps le permet (pas d'effort continu en Z4 à Z6 sur un bloc court)
    // Z5 va de l'allure 1 h à la VMA : les répétitions se courent à 95 – 100 % de VMA (sans passer sous l'allure 1 h)
    const vma5 = !spe && z === 'Z5' && c.profil;
    const allure = c.profil && (spe ? [c.allureObj * 0.99, c.allureObj * 1.01] : vma5 ? [1000 / c.profil.V, Math.min(1000 / (c.profil.V * 0.95), c.zones.Z5.allureLente)] : plageZ(c, z)), a = allure && moy(allure);
    // un effort continu ne dépasse pas 2/3 du temps limite à l'allure courue (modèle : T = 6 × exp((v / VMA − 1) / k))
    const cap = a ? TLIM_PART * tlim(c, a) : Infinity;
    const F = FORMATS[z], n = Math.max(z !== 'Z3' && m >= 2 * F.rep[0] ? 2 : 1, Math.round(m / Math.min(m, lerp(F.rep[0], F.rep[1], l))), Math.ceil(m / cap - 1e-9));
    const r = arrondi(m / n) > cap ? Math.floor(cap * 12) / 12 : arrondi(m / n);
    const rc = n > 1 ? arrondi(Math.max(0.5, r * lerp(F.recup[0], F.recup[1], l))) : 0;
    const ou = spe ? `à allure ${c.nomObj}${a ? ` (${fA(c.allureObj)}, ${z})` : ''}` : vma5 ? `en Z5 (${fourchette(allure)}, 95 – 100 % de VMA)` : `en ${zt(c, z)}`;
    return { z, spe, effort: n * r, recup: (n - 1) * rc, km: c.profil ? n * r / a + (n - 1) * rc / aZ(c, 'Z1') : null,
      texte: n > 1 ? `${n} × ${fD(r)}${a ? ` (≈ ${Math.round(r / a * 10) * 100} m)` : ''} ${ou}, récupération ${fD(rc)} en trottinant (Z1)`
        : `${fD(r)} en continu ${ou}${a ? ` (≈ ${(r / a).toFixed(1).replace('.', ',')} km)` : ''}`,
      etapes: n > 1 ? [{ rep: n, etapes: [{ t: 'effort', duree: r, allure }, { t: 'recup', duree: rc }] }] : [{ t: 'effort', duree: r, allure }] };
  }
  /** Séance de qualité de un à trois blocs ([{ z, min, spe }]), du plus lent au plus rapide, 3 min de trot entre les blocs */
  function seanceZones(c, blocs, l) {
    const B = blocs.sort((a, b) => ZI.indexOf(a.z) - ZI.indexOf(b.z)).map(b => blocZone(c, b.z, b.min, l, b.spe)), entre = ENTRE_BLOCS * (B.length - 1);
    const somme = (f) => B.reduce((a, b) => a + f(b), 0), effort = somme(b => b.effort), principal = B.reduce((a, b) => (b.effort > a.effort ? b : a));
    const noms = [...new Set(B.map(b => (b.spe ? `Allure ${c.nomObj}` : FORMATS[b.z].nom)))];
    const r = { travail: effort + somme(b => b.recup) + entre, effort, km: c.profil ? somme(b => b.km) + entre / aZ(c, 'Z1') : null,
      parts: ajoute({ Z1: somme(b => b.recup) + entre }, ...B.map(b => ({ [b.z]: b.effort }))),
      etapes: B.flatMap((b, k) => (k ? [{ t: 'recup', duree: ENTRE_BLOCS }, ...b.etapes] : b.etapes)),
      texte: B.map(b => b.texte).join(` · ${ENTRE_BLOCS} min de trot · `) };
    return enveloppe(c, 'ZONES', noms.join(' + '), principal.z, r);
  }

  /** Semaine du plan selon la répartition : minutes d'effort de Z3 à Z6 (volume × part de la zone), réparties en nbQ séances.
      Z6 en petite quantité devient des lignes droites. Chaque zone forme des blocs (coupés au-delà du maximum, scindés s'il reste des séances) ;
      les plus gros ouvrent les séances, les autres s'y ajoutent (zone voisine d'abord), trois blocs au plus par séance. */
  function semaineZones(c, vol, l, nbQ, k = 1, maxS = nbQ) { // maxS : nombre maximal de séances de qualité (l'effort retiré par la limite de longueur peut en créer)
    // k : part du temps d'intensité gardée (semaine de décharge : la moitié du travail d'une semaine de charge)
    const I = Object.fromEntries(ZI.map((z, i) => [z, vol * c.parts[i + 2] * k])), zc = c.zoneObj;
    let lignes = null, exces = 0;
    if (I.Z6 > 0 && I.Z6 < FORMATS.Z6.min) {
      const n = Math.round(I.Z6 * 3); // 20 s par ligne droite
      if (n >= 3) lignes = { n, texte: 'lignes droites de 20 s (Z6, vite et relâché), 40 s de trot entre chacune' };
      I.Z6 = 0;
    }
    // pas de sortie longue en LPN : tout le temps de la zone de l'allure cible (semi, marathon) est couru dans les séances de qualité
    let ch = [];
    ZI.forEach(z => {
      if (I[z] < minBloc(c, z, z === zc)) return; // trop peu pour un bloc (sous le seuil d'ignorance à son allure) : laissé de côté
      ch.push({ z, min: I[z], spe: z === zc }); // pas de durée maximale : seule la longueur des répétitions est bornée (2/3 du temps limite)
    });
    for (;;) { // séances disponibles : on scinde le plus gros bloc s'il reste assez long
      const g = ch.reduce((a, x) => (!a || x.min > a.min ? x : a), null);
      if (ch.length >= nbQ || !g || g.min < 2 * FORMATS[g.z].seul) break;
      g.min /= 2; ch.push({ ...g });
    }
    ch.sort((a, b) => b.min - a.min);
    // ouvrent une séance : les plus gros blocs assez longs (au moins le plus gros), dans la limite de nbQ
    const nSeul = Math.max(1, ch.filter(x => x.min >= FORMATS[x.z].seul).length), seances = ch.slice(0, Math.min(nbQ, nSeul)).map(x => [x]);
    for (const x of ch.slice(seances.length)) {
      const voisin = (s) => s.some(b => Math.abs(ZI.indexOf(b.z) - ZI.indexOf(x.z)) <= 1);
      const libres = seances.filter(s => s.length < BLOCS_MAX).sort((a, b) => voisin(b) - voisin(a) || a.length - b.length);
      if (libres.length) libres[0].push(x); else exces += x.min;
    }
    // longueur maximale d'une séance : une séance trop longue est raccourcie (blocs réduits ensemble) et l'effort retiré est reporté sur les
    // autres séances de qualité qui ont de la place, puis sur de nouvelles séances de qualité (jusqu'à maxS) ; coupe : effort qu'on n'a pas pu placer (min)
    const copie = (b, k) => b.map(x => ({ ...x, min: x.min * k })), sz = (b) => seanceZones(c, copie(b, 1), l);
    const plusGrand = (ok, max) => { // plus grande valeur dans [0, max] pour laquelle ok(v) est vrai (dichotomie, ok décroissant)
      if (ok(max)) return max;
      let lo = 0, hi = max;
      for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      return lo;
    };
    let coupe = 0, trop = 0; // trop : durée de la plus longue séance qui reste au-dessus de la limite
    const S = seances.map(b => b.map(x => ({ ...x }))), reportes = [];
    if (c.limite) {
      S.forEach(b => {
        if (!depasse(c, sz(b))) return;
        const k = Math.max(0.05, plusGrand(k => !depasse(c, seanceZones(c, copie(b, k), l)), 1));
        b.forEach(x => { reportes.push({ ...x, min: x.min * (1 - k) }); x.min *= k; });
      });
      reportes.sort((a, b) => b.min - a.min);
      for (const x of reportes) {
        let m = x.min;
        for (let essai = 0; essai < 12 && m >= minBloc(c, x.z, x.spe); essai++) {
          // séance existante avec de la place (le bloc de même zone grossit, sinon un bloc s'ajoute) : la plus grande part qui tient
          let meilleur = null;
          S.forEach((b, i) => {
            const meme = b.find(y => y.z === x.z && !!y.spe === !!x.spe);
            if (!meme && b.length >= BLOCS_MAX) return;
            const avec = (v) => (meme ? b.map(y => (y === meme ? { ...y, min: y.min + v } : { ...y })) : [...b.map(y => ({ ...y })), { ...x, min: v }]);
            const v = plusGrand(t => !depasse(c, seanceZones(c, avec(t), l)), m);
            if (v >= minBloc(c, x.z, x.spe) && (!meilleur || v > meilleur.v)) meilleur = { i, v, meme };
          });
          if (meilleur) {
            const b = S[meilleur.i];
            if (meilleur.meme) meilleur.meme.min += meilleur.v; else b.push({ ...x, min: meilleur.v });
            m -= meilleur.v;
          } else if (S.length < maxS) { // nouvelle séance de qualité
            const v = Math.max(minBloc(c, x.z, x.spe), plusGrand(t => !depasse(c, seanceZones(c, [{ ...x, min: t }], l)), m));
            S.push([{ ...x, min: Math.min(v, m) }]);
            m -= Math.min(v, m);
          } else break;
        }
        if (m >= minBloc(c, x.z, x.spe)) coupe += m; // effort qu'on n'a pas pu replacer
      }
    }
    const q = S.map(b => {
      const x = sz(b);
      if (c.limite && depasse(c, x)) trop = Math.max(trop, x.duree);
      return x;
    });
    return { q, lignes, exces, coupe, trop };
  }

  // Spécifique LPN : choisit une allure à optimiser (l'allure cible) et construit le plan sur la répartition du volume par zone (ajustable)
  const LPN = { id: 'zones', nom: 'Spécifique LPN', titre: 'Spécifique LPN', ordre: 0, parDefaut: true, blocsMax: BLOCS_MAX, bloc: true,
    fiche: { public: 'Optimiser une allure spécifique selon des critères paramétrables, après des cycles de préparation générale', plan: '4 à 24 semaines', mise: 'moyenne', h: 0, j: 0 }, recupZ1: true, maxQ: 3, repartition: true,
    regles: { echauffement: (c, zone) => (c.limite ? 15 : 20) + (ECHAUFFEMENT_Z[zone] || 0), slMax: SL_MAX, efMin: EF_MIN, efLeger: EF_LEGER,
      filtreClub: true, chargeObjectif: OBJECTIF_CHARGE, equilibreZones: true, dechargeQ: DECHARGE_Q, doublesUtiles: DOUBLES_SEANCES, sansSortieLongue: true, volumeKm: true,
      z1Lendemain: true, alterner: true, volumeFacile: (x) => volumeFacileLPN(x) },
    avertissement: "Cette méthode optimise une allure précise : elle doit être précédée d'autres cycles de préparation générale (endurance de base, côtes, vitesse), qu'elle ne remplace pas.",
    score: { '5k': 3, '10k': 3, semi: 3, marathon: 3 }, difficulte: [3, "optimise une allure précise : suppose déjà une préparation générale et des séances de qualité maîtrisées ; répartition et difficulté réglables"],
    semaine: semaineZones, phases: [{ nom: 'Travail des zones', f: 1, q: [], sl: 'SL' }],
    resume: "Chaque semaine reprend la répartition par zone ci-dessus : le temps d'intensité de chaque zone (Z3 à Z6) forme des séances de qualité, la zone de l'allure cible étant courue à cette allure. Pas de sortie longue imposée : la spécificité de la distance passe d'abord par le volume de la semaine. Le reste du volume va aux séances faciles : une séance longue facile, les autres de même durée. La difficulté règle la longueur des répétitions et des récupérations, pas le temps d'intensité.",
    principes: [
      "Intensité : temps d'effort d'une zone = volume de la semaine × part de la zone, découpé en blocs regroupés en séances de qualité (1 à 3 blocs, zones voisines ensemble) ; Z6 sous 4 min devient des lignes droites de 20 s. Z5 se court à 95 – 100 % de VMA.",
      "Répétitions : jamais plus des 2/3 du temps limite à leur allure (T = 6 × exp((v / VMA − 1) / k)) ; un bloc trop court pour son allure (20 s à la VMA, 1 min à l'allure 1 h, 3 min à 80 % de l'allure 1 h) est ignoré.",
      "Échauffement selon la zone principale : 20 min en Z5 (15 min si une longueur maximale de séance est fixée), 5 min de plus en Z6, 5 de moins en Z4, 10 de moins en Z3 ; retour au calme 10 min.",
      "Séances de qualité placées en premier, sans être allongées au-delà du nécessaire ; pour le semi et le marathon, tout le temps de la zone de l'allure cible se court à cette allure dans les séances de qualité.",
      "Pas de sortie longue imposée : la spécificité de la distance passe d'abord par le volume de la semaine. Les séances faciles (Z1 et Z2, 2es séances des doublés comprises) se partagent le volume restant : m = durée moyenne, une séance longue facile de 4/3 × m (le dernier jour), les autres à parts égales ; 20 min au moins, la longueur maximale de séance au plus.",
      "Lendemain d'une séance de qualité : jour de repos ou séance facile ; la Z1 qui reste à faire (cible de Z1 moins la Z1 des séances de qualité) est courue ces jours-là.",
      "Autres séances faciles : le reste du volume, en durées qui varient de 5 min d'une séance à l'autre (20 min au moins). Volume saisi en km : la somme des km des séances vaut ce volume.",
      "Longueur maximale de séance : une séance de qualité trop longue est raccourcie, et l'effort retiré est reporté sur une autre séance de qualité ou sur une nouvelle.",
      "Doublés : la 2e séance est un footing pris sur le volume facile, jamais le dernier jour de la semaine ; utiles à partir de 5 séances par semaine, ils libèrent des jours de repos.",
      "Décharge : les séances de qualité restent, avec la moitié du travail d'une semaine de charge. Semaine de l'objectif : charge ramenée à 50 %, même nombre de séances. Affûtage et course finale seulement si le plan va jusqu'à la date de l'objectif.",
      "Séances du club : intégrées une semaine seulement si elles tiennent dans la répartition (leur Z2 dans le Z1 + Z2 prévu, leur Z5 dans le Z5 prévu) ; sinon, séance du plan à la place et note sous la semaine.",
      "Compétitions : leur temps en zone est déduit de la répartition de leur semaine ; s'il dépasse, les autres semaines compensent (jusqu'à la moitié de leur temps dans la zone), sinon une alerte le signale.",
      "À placer après des cycles de préparation générale (endurance de base, côtes, vitesse). Formats et seuils : choix de conception (hypothèses), pas une méthode publiée."] };

  /** Répartit tot minutes entre n séances faciles (pas de 5 min, entre min et max) : les durées alternent haut / bas (écart de 5 min), le surplus
      va aux séances hautes ; perdu : minutes qui ne peuvent pas être placées (plafond), court : moins de min minutes par séance */
  /** Spécifique LPN : partage du volume facile tot (min) entre n séances faciles. m = moyenne ; une séance longue facile de LONG_FACILE × m,
      les autres à parts égales. Pas de 5 min, entre min et max (longueur maximale) ; la séance longue absorbe l'arrondi, et si elle est
      plafonnée, le surplus va aux autres. Retourne { long, autre, court (moyenne sous le minimum), perdu (volume non placé) } */
  function partageFacile(tot, n, min, max) {
    if (n <= 0) return { long: 0, autres: [], court: false, perdu: Math.max(0, tot) };
    const b = (x) => Math.max(min, Math.min(max, x)), m = tot / n;
    if (n === 1) { const long = b(Math.round(tot / 5) * 5); return { long, autres: [], court: m < min, perdu: Math.max(0, tot - long) }; }
    // autres : le reste en pas de 5 min, à 5 min près les unes des autres (l'arrondi ne se cumule pas sur la séance longue)
    const long = b(Math.round(Math.min(max, LONG_FACILE * m) / 5) * 5), pas = Math.max(0, Math.round((tot - long) / 5));
    const base = Math.floor(pas / (n - 1)), plus = pas - base * (n - 1);
    const autres = Array.from({ length: n - 1 }, (_, k) => b(5 * (base + (k < plus ? 1 : 0))));
    return { long, autres, court: m < min, perdu: Math.max(0, tot - long - autres.reduce((a, x) => a + x, 0)) };
  }

  /** Volume facile de Spécifique LPN (pas de sortie longue imposée : c'est le volume de la semaine qui compte) : les séances de qualité sont
      placées d'abord, puis toutes les séances faciles (footings, dernier jour, 2es séances des doublés) se partagent le reste : une séance
      longue facile de 4/3 de la moyenne, les autres à parts égales (partageFacile). Doublés : un jour à une seule séance chacun, hors jour de
      la plus grosse séance (une qualité plus longue que la séance longue facile). La Z1 restante est courue les lendemains de qualité. */
  function volumeFacileLPN(x) {
    const { q, club, pool, nE, cs, aff, lim, slMax, slMax0, efMin, drapeaux } = x;
    let nD = Math.min(x.nD, q.length + nE), part;
    for (;;) {
      part = partageFacile(pool, nE + nD + (cs ? 0 : 1), efMin, slMax);
      // jour de la plus grosse séance (une qualité strictement plus longue que toutes les autres, séance longue facile et club compris) : pas de doublé
      const qMax = Math.max(0, ...q.map(y => y.duree)), grosseQ = qMax > part.long && qMax > Math.max(0, ...club.map(k => k.duree)) && q.filter(y => y.duree === qMax).length === 1;
      const dispo = q.length + nE - (grosseQ ? 1 : 0);
      if (nD <= Math.max(0, dispo)) break;
      nD--;
    }
    const n = nE + nD + (cs ? 0 : 1), A = part.autres, dLong = part.long, dF = n > 1 ? A[A.length - 1] : part.long;
    // semaine de course : la séance longue facile est un footing de la semaine (à défaut, la 2e séance d'un doublé), sinon le dernier jour
    const toutes = cs ? [dLong, ...A] : A;
    if (n > 0 && part.court && !aff) drapeaux.court = true; // semaine d'affûtage : volume volontairement bas, pas d'alerte
    if (!cs && part.perdu >= 5) { if (lim && slMax < slMax0) drapeaux.parLimite = true; else drapeaux.plafond = true; } // volume qui ne peut pas être placé
    return { sl: 0, dF, ml: 0, efD: toutes.slice(0, nE), secD: toutes.slice(nE, nE + nD), dLong, dD: 0, nD, reste: pool };
  }

  PlanCore.methode(LPN);
})();
