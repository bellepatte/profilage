/*
 * Indice d'endurance (Péronnet & Thibault), forme simplifiée :
 *   % VMA(T) = 100 + IE × ln(T / 6)        T en minutes, IE = 100 × k
 *   v(T) = VMA × (1 + k × ln(T / 6))       vitesses en m/min en interne
 * Régression de v sur x = ln(T / 6) : VMA = a, k = b / a.
 */
(function (global) {
  'use strict';

  const REF_MIN = 6;             // durée de référence (VMA tenue ~6 min)
  const LIMITE_MIN = 300;        // modèle non applicable au-delà de 5 h
  const REF_ZONE_MIN = 60;       // référence des zones : allure 1 h
  const VITESSE_KMH = [4, 30];   // bornes réalistes de vitesse moyenne (km/h)
  const ECART_MAX = 2;           // écart max (points de % VMA) entre une performance et la courbe des autres
  const IE_HABITUEL = [-14, -2]; // bornes habituelles de l'indice d'endurance

  // Fiabilité d'une prédiction selon l'extrapolation hors de la plage saisie
  const SEUILS_FIABILITE = [
    [0.10, 'Élevée'], [0.60, 'Moyenne'], [1.20, 'Faible'], [2.00, 'Très faible'], [Infinity, 'Fantaisiste']
  ];

  // La VMA compte comme une donnée (chrono sur 6 min) : une donnée seule ne suffit pas sans profil
  const MESSAGE_DONNEE_UNIQUE = "Une seule donnée (performance ou VMA) ne suffit pas pour prédire : renseignez votre profil (volume, fréquence, expérience ou âge) ou une autre performance.";

  const DUREES_TABLE =[5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 120, 150, 180, 240, 300];
  const DISTANCES_PREDITES = [1500, 5000, 10000, 21097, 42195];

  // Zones en % de l'allure 1 h (pMin / pMax, null = sans limite)
  const ZONES_DEF = [
    { id: 'Z1', nom: 'Échauffement, récupération', pMin: null, pMax: 65,
      objectif: "Compétitions courues à ces allures (ex. ultra trail). Permet un maintien minimal des qualités d'endurance, sans surplus de fatigue. Peut aider à la récupération métabolique (par circulation sanguine)",
      utilisation: "En cas de fatigue, même légère, remplacer l'entraînement en Z2 par du Z1. Lors de sorties de très longue durée pour des préparations en ultra-distances" },
    { id: 'Z2', nom: 'Endurance fondamentale', pMin: 65, pMax: 80,
      objectif: "Compétitions courues à ces allures (ex. 100 km ou marathon selon le niveau). Amélioration modeste des capacités d'endurance, mais grandement compensée par un coût physiologique minimal permettant un gros cumul de volume",
      utilisation: "Faire la très grande majorité de votre volume dans cette zone, sur des efforts continus" },
    { id: 'Z3', nom: 'Endurance active', pMin: 80, pMax: 90,
      objectif: "Compétitions courues à ces allures ou à ce niveau d'intensité (ex. marathon ou semi selon le niveau). Développement modéré des capacités d'endurance, coût physiologique assez faible mais non négligeable. Attention à ne pas confondre avec Z2 : risque de cumul de fatigue à long terme",
      utilisation: "Sur des séances dédiées, en continu ou en séries longues (ex. 3 × 20 min)" },
    { id: 'Z4', nom: 'Tempo / seuil', pMin: 90, pMax: 100,
      objectif: "Compétitions courues à ces allures ou à ce niveau d'intensité (ex. semi ou 10 km selon le niveau). Développement efficace des capacités d'endurance, avec un coût physiologique modéré. Bon compromis, à condition de limiter le volume",
      utilisation: "En séries longues sur des séances dédiées (ex. 4 × 8 min)" },
    { id: 'Z5', nom: 'VMA', pMin: 100, pMax: 120,
      objectif: "Compétitions courues à ces allures ou à ce niveau d'intensité (ex. 5 km, finish de course). Développe significativement la puissance aérobie (consommation max d'O2) et améliore grandement les capacités athlétiques, au prix d'un coût physiologique significatif. Encadrement conseillé",
      utilisation: "Sur des séances dédiées, en séries courtes ou moyennement courtes (ex. 10 × 2 min)" },
    { id: 'Z6', nom: 'Vitesse', pMin: 120, pMax: null,
      objectif: "Compétitions courues à ces allures ou à ce niveau d'intensité (ex. 1500 m, finish de course). Développe la puissance musculaire et aérobie (consommation max d'O2). Coût physiologique pouvant être excessif sans encadrement",
      utilisation: "Sur des séances dédiées ou intégrées à d'autres zones, sur des efforts courts (ex. 5 × 20 s avec récupération longue)" }
  ];

  /* ---------- Saisie et formatage ---------- */

  /** "18:30", "1:27:00", "18,5" -> minutes décimales ; NaN si invalide */
  function parseTemps(saisie) {
    const s = String(saisie ?? '').trim().replace(',', '.');
    if (!s) return NaN;
    const p = s.split(':').map(Number);
    if (p.some(Number.isNaN) || p.length > 3) return NaN;
    let min;
    if (p.length === 1) min = p[0];
    else if (p.length === 2) min = p[0] + p[1] / 60;
    else min = p[0] * 60 + p[1] + p[2] / 60;
    return min > 0 ? min : NaN;
  }

  /** 5.8833 -> "5:53" */
  function formatAllure(minKm) {
    if (!Number.isFinite(minKm) || minKm <= 0) return '—';
    const s = Math.round(minKm * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Minutes -> "18:30" ou "1:27:00" */
  function formatTemps(min) {
    if (!Number.isFinite(min)) return '—';
    const s = Math.round(min * 60);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), p = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
  }

  /** Minutes -> "45 min", "1 h 32", "> 5 h (hors modèle)" */
  function formatDuree(min) {
    if (min === Infinity || min > LIMITE_MIN) return '> 5 h (hors modèle)';
    if (!Number.isFinite(min)) return '—';
    if (min < 1) return '< 1 min';
    if (min < 60) return `${Math.round(min)} min`;
    return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
  }

  /* ---------- Modèle ---------- */

  /** % VMA tenable sur t minutes */
  const pctVma = (k, t) => 100 * (1 + k * Math.log(t / REF_MIN));

  /** Vitesse (m/min) tenable sur t minutes */
  const vitesseMpm = (res, t) => res.V * pctVma(res.k, t) / 100;

  /** Régression linéaire y = a + b x ; null si les x sont identiques */
  function regression(xs, ys) {
    const n = xs.length;
    const sx = xs.reduce((s, x) => s + x, 0), sy = ys.reduce((s, y) => s + y, 0);
    const sxx = xs.reduce((s, x) => s + x * x, 0), sxy = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    const moy = sy / n;
    const ssRes = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0);
    const ssTot = ys.reduce((s, y) => s + (y - moy) ** 2, 0);
    return { a, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  }

  /**
   * Calibre le modèle. perfs : [{ distance (m), temps (min) }], vmaKmh : VMA connue (optionnelle).
   * Lève une erreur si les données sont inexploitables ; renvoie des avertissements si elles sont suspectes.
   */
  function calibrer(perfs, vmaKmh) {
    const valides = perfs.filter(p => p.distance > 0 && p.temps > 0);
    if (!valides.length) throw new Error("Aucune performance valide : indiquez au moins une distance et un temps.");

    for (const p of valides) {
      const kmh = p.distance / p.temps * 60 / 1000;
      if (kmh < VITESSE_KMH[0] || kmh > VITESSE_KMH[1]) {
        throw new Error(`Vitesse irréaliste sur ${p.distance} m (${kmh.toFixed(1).replace('.', ',')} km/h) : vérifiez la distance et le temps.`);
      }
    }

    const xs = valides.map(p => Math.log(p.temps / REF_MIN));
    const ys = valides.map(p => p.distance / p.temps); // m/min
    // La VMA connue est une donnée comme les autres, au point (6 min, VMA) : aucune n'est prioritaire
    const xsReg = vmaKmh > 0 ? [...xs, 0] : xs;
    const ysReg = vmaKmh > 0 ? [...ys, vmaKmh * 1000 / 60] : ys;
    const reg = regression(xsReg, ysReg);
    if (!reg) throw new Error(vmaKmh > 0
      ? "Avec une VMA connue, il faut une performance d'une durée différente de 6 min."
      : "Il faut au moins deux durées différentes (ex. 1500 m et 10 km) pour calibrer le modèle, ou renseigner la VMA connue.");
    const V = reg.a, k = reg.b / reg.a;
    const r2 = xsReg.length > 2 ? reg.r2 : null; // avec 2 points, la droite passe exactement par les deux

    // Cohérence (1) : une vitesse ne doit pas augmenter quand la distance augmente
    const violations = [];
    valides.forEach((a, i) => valides.forEach((b, j) => {
      if (b.distance > a.distance && ys[j] > ys[i]) violations.push([i, j]);
    }));

    // Cohérence (2) : une performance hors de la tendance des autres est une contre-performance
    // si son retrait rend les autres cohérentes entre elles (il faut alors au moins 3 points restants)
    const pointsReg = valides.map((p, i) => ({ perf: i, x: xs[i], y: ys[i] }));
    if (vmaKmh > 0) pointsReg.push({ perf: null, x: 0, y: vmaKmh * 1000 / 60 });
    const droiteDe = (pts) => regression(pts.map(q => q.x), pts.map(q => q.y));
    const ecart = (d, q) => 100 * (q.y - (d.a + d.b * q.x)) / d.a; // points de % VMA
    const globale = droiteDe(pointsReg);
    const horsTendance = globale ? pointsReg.filter(q => q.perf !== null && Math.abs(ecart(globale, q)) > ECART_MAX) : [];
    let contre = null;
    if (horsTendance.length && pointsReg.length >= 4) {
      contre = pointsReg.filter(q => q.perf !== null).reduce((m, q) => {
        const reste = pointsReg.filter(z => z !== q), d = droiteDe(reste);
        if (!d || !reste.every(z => Math.abs(ecart(d, z)) <= ECART_MAX)) return m;
        const e = ecart(d, q);
        return !m || Math.abs(e) > Math.abs(m.e) ? { q, e } : m;
      }, null);
    }
    const flagged = new Set(contre ? [contre.q.perf] : horsTendance.map(q => q.perf));

    const performances = valides.map((p, i) => {
      const pctVvo2 = 100 * ys[i] / V, pctModele = pctVma(k, p.temps);
      return { ...p, vitesseKmh: ys[i] * 60 / 1000, allureMinKm: 1000 / ys[i], pctVvo2, pctModele, probleme: flagged.has(i) };
    });

    const avertissements = [];

    // Messages de cohérence
    const coherenceFaible = violations.length > 0 || flagged.size > 0;
    const nom = (p) => `${String(p.distance).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} m`;
    const kmh = (v) => (v * 60 / 1000).toFixed(1).replace('.', ',');
    const enumere = (items) => items.length > 1 ? `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}` : items[0];
    for (const [i, j] of violations) {
      avertissements.push(`Une vitesse ne peut pas augmenter quand la distance augmente : le ${nom(valides[j])} en ${formatTemps(valides[j].temps)} (${kmh(ys[j])} km/h) est plus rapide que le ${nom(valides[i])} en ${formatTemps(valides[i].temps)} (${kmh(ys[i])} km/h). Vérifiez ces deux performances.`);
    }
    if (flagged.size) {
      const fautives = valides.filter((_, i) => flagged.has(i));
      const coherentes = valides.filter((_, i) => !flagged.has(i));
      const suite = coherentes.length > 1 ? ` Les autres performances (${enumere(coherentes.map(nom))}) sont cohérentes entre elles.` : '';
      if (contre) {
        const c = valides[contre.q.perf], ampleur = Math.abs(contre.e).toFixed(1).replace('.', ',');
        avertissements.push(contre.e < 0
          ? `Le ${nom(c)} en ${formatTemps(c.temps)} semble être une contre-performance : il est nettement plus lent que ce que vos autres résultats laissent attendre (${ampleur} points de % VMA). Il pèse sur les prédictions, qui sont donc moins fiables.${suite}`
          : `Le ${nom(c)} en ${formatTemps(c.temps)} est nettement plus rapide que ce que vos autres résultats laissent attendre (${ampleur} points de % VMA) : vérifiez cette saisie. Il pèse sur les prédictions, qui sont donc moins fiables.${suite}`);
      } else {
        const liste = enumere(fautives.map(p => `le ${nom(p)} en ${formatTemps(p.temps)}`));
        avertissements.push(`Les performances saisies s'accordent mal entre elles, sans qu'une seule se détache clairement : ${liste} ${fautives.length > 1 ? 'sont à vérifier' : 'est à vérifier'}. Elles pèsent sur les prédictions, qui sont donc moins fiables.`);
      }
    }
    if (valides.some(p => p.temps < REF_MIN)) avertissements.push("Une performance dure moins de 6 min : elle est hors de la plage idéale du modèle et peut peser fortement sur la VMA.");
    if (valides.some(p => p.temps > LIMITE_MIN)) avertissements.push("Une performance dure plus de 5 h : le modèle n'est pas applicable à cette durée.");

    // Incohérences entre les données
    if (k < 0 && 100 * k < IE_HABITUEL[0]) avertissements.push(`L'indice d'endurance calculé (${(100 * k).toFixed(1).replace('.', ',')}) est très éloigné des valeurs habituelles (en dessous de ${IE_HABITUEL[0]}) : vérifiez les temps saisis, en particulier l'écart entre les distances.`);
    if (k >= 0) throw new Error(`L'indice d'endurance calculé est positif ou nul (${(100 * k).toFixed(1).replace('.', ',')}) : les performances saisies ne peuvent pas être modélisées. Vérifiez les distances et les temps.`);
    const distances = valides.map(p => p.distance);
    for (const d of new Set(distances)) {
      if (distances.filter(x => x === d).length > 1) avertissements.push(`Plusieurs performances sur ${d} m : vérifiez qu'il ne s'agit pas d'un doublon.`);
    }
    if (vmaKmh > 0) {
      for (const p of performances) {
        if (p.temps >= REF_MIN && p.vitesseKmh > vmaKmh * 1.02) avertissements.push(`${p.distance} m en ${formatTemps(p.temps)} est plus rapide que la VMA indiquée : vérifiez la VMA ou ce temps.`);
      }
    }

    return {
      V, k, IE: 100 * k, r2, coherenceFaible,
      vvo2Kmh: V * 60 / 1000,
      allureVvo2: 1000 / V,
      performances,
      avertissements
    };
  }

  /** Vitesse (m/min) de référence des zones : allure 1 h */
  const vitesseReference = (res) => vitesseMpm(res, REF_ZONE_MIN);

  /** Tableau des allures pour une liste de durées */
  function tableDurees(res, durees = DUREES_TABLE) {
    return durees.map(t => {
      const v = vitesseMpm(res, t);
      return { duree: t, pct: pctVma(res.k, t), vitesseKmh: v * 60 / 1000, allureMinKm: 1000 / v, distanceKm: v * t / 1000 };
    });
  }

  /** Temps prédit (min) pour une distance (m) : dichotomie sur distance = v(T) × T */
  function predireTemps(res, distance) {
    const f = (t) => vitesseMpm(res, t) * t - distance;
    // Avec k < 0, la distance parcourable culmine au sommet de la courbe : on ne cherche que sur la partie croissante
    const sommet = res.k < 0 ? REF_MIN * Math.exp((-1 - res.k) / res.k) : Infinity;
    let lo = 0.1, hi = Math.min(2000, sommet);
    if (f(lo) > 0 || f(hi) < 0) return NaN;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /** Fiabilité d'une prédiction selon l'extrapolation de la distance hors de la plage saisie */
  function fiabilitePrediction(res, distance) {
    const d = res.performances.map(p => p.distance);
    if (res.vmaConnue) d.push(res.V * REF_MIN); // VMA connue = chrono de référence sur 6 min
    if (!d.length) return 'Indicative';
    const dMin = Math.min(...d), dMax = Math.max(...d);
    let extrapolation = 0;
    if (distance > dMax) extrapolation = (distance - dMax) / dMax;
    else if (distance < dMin) extrapolation = (dMin - distance) / dMin;
    const niveaux = SEUILS_FIABILITE.map(([, nom]) => nom);
    let i = SEUILS_FIABILITE.findIndex(([max]) => extrapolation <= max);
    if (res.coherenceFaible) i = Math.min(i + 1, niveaux.length - 1); // données incohérentes : un cran plus bas
    return niveaux[i];
  }

  /** Chronos prédits pour une liste de distances (m) */
  function tablePredictions(res, distances = DISTANCES_PREDITES) {
    return distances.map(distance => {
      const temps = predireTemps(res, distance);
      const vMpm = distance / temps;
      return {
        distance, temps,
        allureMinKm: 1000 / vMpm,
        vitesseKmh: vMpm * 60 / 1000,
        fiabilite: fiabilitePrediction(res, distance)
      };
    });
  }

  /** Distances prédites (m) pour une liste de temps (min) */
  function tableDistances(res, temps) {
    return temps.map(t => {
      const distance = vitesseMpm(res, t) * t;
      const vMpm = distance / t;
      return {
        distance, temps: t,
        allureMinKm: 1000 / vMpm,
        vitesseKmh: vMpm * 60 / 1000,
        fiabilite: fiabilitePrediction(res, distance)
      };
    });
  }

  /** Zones : bornes en allure (min/km), null si la zone est ouverte */
  function zones(res) {
    const vRef = vitesseReference(res);
    return ZONES_DEF.map(z => ({
      ...z,
      allureRapide: z.pMax === null ? null : 1000 / (vRef * z.pMax / 100),
      allureLente: z.pMin === null ? null : 1000 / (vRef * z.pMin / 100)
    }));
  }

  /* ---------- Profil : estimation de l'indice quand les données manquent ---------- */

  // Indice d'un coureur régulier, sans particularité. Hypothèses de l'estimation (à valider avec des données réelles).
  const IE_MOYEN = -8;
  const INCERT_BASE = 1.5;     // incertitude de base (points d'IE), élargie par facteur non renseigné
  const EFFET_REPRISE = -1.5;  // reprise après blessure ou pratique occasionnelle
  // Effet sur l'IE (points) selon chaque facteur. Un effet positif rapproche l'IE de 0 (endurance meilleure).
  // Points d'ancrage [valeur, effet] reliés par interpolation linéaire, constants au-delà des bornes.
  const ANCRES = {
    volume: [[10, -2], [30, -1], [50, 0], [70, 1], [90, 1.5]],        // km / semaine
    frequence: [[1, -1], [3, 0], [5, 0.5], [7, 1]],                    // séances / semaine
    experience: [[0.5, -2], [2, -1], [5, 0], [10, 1], [20, 1.5]],      // années de pratique régulière
    age: [[18, -1], [27.5, 0], [42.5, 0.5], [60, 1]]                   // années
  };
  const effetInterpole = (ancres, x) => {
    if (x <= ancres[0][0]) return ancres[0][1];
    const last = ancres[ancres.length - 1];
    if (x >= last[0]) return last[1];
    const i = ancres.findIndex(([v]) => v >= x);
    const [x0, y0] = ancres[i - 1], [x1, y1] = ancres[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  };
  const LIBELLES = { volume: ['Volume', ' km/sem'], frequence: ['Fréquence', ' séances/sem'], experience: ['Expérience', ' ans'], age: ['Âge', ' ans'] };

  /**
   * Estime l'indice d'endurance à partir du profil : chaque facteur renseigné ajoute ou retire
   * des points à un coureur moyen. Un facteur absent n'agit pas, mais élargit l'incertitude.
   *   profil : { volume, frequence, experience, age (nombres ou vides), reprise (booléen) }
   */
  function estimerIE(profil = {}) {
    let IE = IE_MOYEN, manquants = 0;
    const details = [];
    for (const cle of Object.keys(ANCRES)) {
      const brut = profil[cle];
      if (brut === '' || brut === null || brut === undefined || !Number.isFinite(Number(brut))) { manquants++; continue; }
      const x = Number(brut);
      const effet = effetInterpole(ANCRES[cle], x);
      IE += effet;
      details.push({ label: LIBELLES[cle][0], valeur: x + LIBELLES[cle][1], effet });
    }
    if (profil.reprise) {
      IE += EFFET_REPRISE;
      details.push({ label: 'Reprise ou pratique occasionnelle', valeur: 'oui', effet: EFFET_REPRISE });
    }
    IE = Math.min(IE_HABITUEL[1], Math.max(IE_HABITUEL[0], IE));
    return { IE, base: IE_MOYEN, incertitude: INCERT_BASE + 0.5 * manquants, details, renseigne: details.length > 0 };
  }

  /** Modèle à partir d'une VMA et d'un indice (sans régression) */
  function modeleDirect(V, k, performances, avertissements) {
    if (!Number.isFinite(V) || V * 60 / 1000 < VITESSE_KMH[0] || V * 60 / 1000 > VITESSE_KMH[1]) {
      throw new Error("La VMA estimée est irréaliste : vérifiez les données saisies.");
    }
    return { V, k, IE: 100 * k, r2: null, vvo2Kmh: V * 60 / 1000, allureVvo2: 1000 / V, performances, avertissements };
  }

  /**
   * Calcul avec repli sur le profil quand les données sont insuffisantes :
   *   - deux durées différentes (ou VMA + performance) : calcul normal à partir des chronos ;
   *   - une seule performance : la VMA est déduite de l'indice estimé par le profil ;
   *   - VMA seule : l'indice vient du profil.
   * Retourne le modèle, la source du calcul et l'estimation par le profil (pour comparaison).
   */
  function calibrerComplet(perfs, vmaKmh, profil = {}) {
    const estimation = estimerIE(profil);
    const valides = perfs.filter(p => p.distance > 0 && p.temps > 0);
    const dureesDistinctes = new Set(valides.map(p => p.temps)).size;
    const k = estimation.IE / 100;
    let res, source;

    if (valides.length && (vmaKmh > 0 || dureesDistinctes >= 2)) {
      res = calibrer(valides, vmaKmh);
      source = vmaKmh > 0 ? 'VMA et performances' : 'performances';
    } else if (valides.length) {
      if (!estimation.renseigne) throw new Error(MESSAGE_DONNEE_UNIQUE);
      const p = valides[0];
      const V = (p.distance / p.temps) / (1 + k * Math.log(p.temps / REF_MIN));
      const performances = valides.map(q => ({ ...q, vitesseKmh: q.distance / q.temps * 60 / 1000, allureMinKm: q.temps / q.distance * 1000, pctVvo2: 100 * (q.distance / q.temps) / V, pctModele: pctVma(k, q.temps) }));
      res = modeleDirect(V, k, performances, ["Un seul chrono : la VMA est déduite de l'indice estimé par votre profil, elle est donc indicative."]);
      source = 'une performance et le profil';
    } else if (vmaKmh > 0) {
      if (!estimation.renseigne) throw new Error(MESSAGE_DONNEE_UNIQUE);
      res = modeleDirect(vmaKmh * 1000 / 60, k, [], ["Aucune performance saisie : l'indice d'endurance vient de votre profil, les prédictions sont indicatives."]);
      source = 'VMA et profil';
    } else {
      throw new Error("Renseignez au moins une performance ou votre VMA.");
    }

    // Le profil sert aux prédictions si les données sont insuffisantes (source ci-dessus) ou incohérentes
    let profilUtilise = source === 'une performance et le profil' || source === 'VMA et profil';
    if (res.coherenceFaible && estimation.renseigne) {
      res = { ...res, k, IE: 100 * k, performances: res.performances.map(p => ({ ...p, pctModele: pctVma(k, p.temps) })) };
      res.avertissements = [...res.avertissements, `Vos performances étant incohérentes, l'indice d'endurance utilisé pour les prédictions vient du profil (${estimation.IE.toFixed(1).replace('.', ',')}) et non de vos chronos.`];
      source = `${source}, indice d'endurance du profil`;
      profilUtilise = true;
    }

    const ieDouteux = res.IE < IE_HABITUEL[0] || res.IE > IE_HABITUEL[1];
    return { ...res, source, estimation, profilUtilise, ieDouteux, vmaConnue: vmaKmh > 0, vmaSaisie: vmaKmh };
  }

  const API = {
    parseTemps, calibrer, calibrerComplet, estimerIE, pctVma, tableDurees, tablePredictions, tableDistances, zones, vitesseReference,
    formatAllure, formatTemps, formatDuree, ZONES_DEF
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Endurance = API;
})(typeof window !== 'undefined' ? window : globalThis);
