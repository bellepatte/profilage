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

  // Fiabilité d'une prédiction selon l'extrapolation hors de la plage saisie
  const SEUILS_FIABILITE = [
    [0.10, 'Élevée'], [0.60, 'Moyenne'], [1.20, 'Faible'], [2.00, 'Très faible'], [Infinity, 'Fantaisiste']
  ];

  const DUREES_TABLE = [5, 10, 15, 20, 30, 40, 50, 60, 75, 90, 120, 150, 180, 240, 300];
  const DISTANCES_PREDITES = [5000, 10000, 21097, 42195];

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
    let V, k, r2 = null;

    if (vmaKmh > 0) {
      V = vmaKmh * 1000 / 60;
      const ks = xs.map((x, i) => (Math.abs(x) > 1e-9 ? (ys[i] / V - 1) / x : null)).filter(v => v !== null);
      if (!ks.length) throw new Error("Avec une VMA connue, il faut une performance d'une durée différente de 6 min.");
      k = ks.reduce((s, v) => s + v, 0) / ks.length;
    } else {
      const reg = regression(xs, ys);
      if (!reg) throw new Error("Il faut au moins deux durées différentes (ex. 1500 m et 10 km) pour calibrer le modèle, ou renseigner la VMA connue.");
      V = reg.a;
      k = reg.b / reg.a;
      r2 = valides.length > 2 ? reg.r2 : null; // avec 2 performances, la droite passe exactement par les deux points
    }

    const performances = valides.map((p, i) => ({
      ...p,
      vitesseKmh: ys[i] * 60 / 1000,
      allureMinKm: 1000 / ys[i],
      pctVvo2: 100 * ys[i] / V,
      pctModele: pctVma(k, p.temps)
    }));

    const avertissements = [];
    if (valides.some(p => p.temps < REF_MIN)) avertissements.push("Une performance dure moins de 6 min : elle est hors de la plage idéale du modèle et peut peser fortement sur la VMA.");
    if (valides.some(p => p.temps > LIMITE_MIN)) avertissements.push("Une performance dure plus de 5 h : le modèle n'est pas applicable à cette durée.");

    // Incohérences entre les données
    if (k >= 0) avertissements.push("L'indice d'endurance calculé est positif ou nul : les performances ne sont pas cohérentes entre elles (vérifiez les distances et temps).");
    const distances = valides.map(p => p.distance);
    for (const d of new Set(distances)) {
      if (distances.filter(x => x === d).length > 1) avertissements.push(`Plusieurs performances sur ${d} m : vérifiez qu'il ne s'agit pas d'un doublon.`);
    }
    if (valides.length > 2) {
      for (const p of performances) {
        const ecart = Math.abs(p.pctVvo2 - p.pctModele);
        if (ecart > ECART_MAX) avertissements.push(`${p.distance} m en ${formatTemps(p.temps)} s'écarte des autres performances (écart de ${ecart.toFixed(1).replace('.', ',')} points de % VMA) : vérifiez ce temps.`);
      }
    }
    if (vmaKmh > 0) {
      for (const p of performances) {
        if (p.temps >= REF_MIN && p.pctVvo2 > 102) avertissements.push(`${p.distance} m en ${formatTemps(p.temps)} est plus rapide que la VMA indiquée : vérifiez la VMA ou ce temps.`);
      }
    }

    return {
      V, k, IE: 100 * k, r2,
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
    let lo = 0.1, hi = 2000;
    if (f(lo) > 0 || f(hi) < 0) return NaN;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /** Fiabilité d'une prédiction selon l'extrapolation de la distance hors de la plage saisie */
  function fiabilitePrediction(res, distance) {
    if (!res.performances.length) return 'Indicative';
    const d = res.performances.map(p => p.distance);
    const dMin = Math.min(...d), dMax = Math.max(...d);
    let extrapolation = 0;
    if (distance > dMax) extrapolation = (distance - dMax) / dMax;
    else if (distance < dMin) extrapolation = (dMin - distance) / dMin;
    return SEUILS_FIABILITE.find(([max]) => extrapolation <= max)[1];
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
  // Paliers inclusifs : [borne haute, effet]
  const PALIERS = {
    volume: [[20, -2], [40, -1], [60, 0], [80, 1], [Infinity, 1.5]],   // km / semaine
    frequence: [[2, -1], [3, 0], [5, 0.5], [Infinity, 1]],             // séances / semaine
    experience: [[1, -2], [3, -1], [7, 0], [15, 1], [Infinity, 1.5]],  // années de pratique régulière
    age: [[20, -1], [35, 0], [50, 0.5], [Infinity, 1]]                 // années
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
    for (const cle of Object.keys(PALIERS)) {
      const brut = profil[cle];
      if (brut === '' || brut === null || brut === undefined || !Number.isFinite(Number(brut))) { manquants++; continue; }
      const x = Number(brut);
      const effet = PALIERS[cle].find(([max]) => x <= max)[1];
      IE += effet;
      details.push({ label: LIBELLES[cle][0], valeur: x + LIBELLES[cle][1], effet });
    }
    if (profil.reprise) {
      IE += EFFET_REPRISE;
      details.push({ label: 'Reprise ou pratique occasionnelle', valeur: 'oui', effet: EFFET_REPRISE });
    }
    IE = Math.min(-2, Math.max(-14, IE));
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
      const p = valides[0];
      const V = (p.distance / p.temps) / (1 + k * Math.log(p.temps / REF_MIN));
      const performances = valides.map(q => ({ ...q, vitesseKmh: q.distance / q.temps * 60 / 1000, allureMinKm: q.temps / q.distance * 1000, pctVvo2: 100 * (q.distance / q.temps) / V, pctModele: pctVma(k, q.temps) }));
      res = modeleDirect(V, k, performances, ["Un seul chrono : la VMA est déduite de l'indice estimé par votre profil, elle est donc indicative."]);
      source = 'une performance et le profil';
    } else if (vmaKmh > 0) {
      res = modeleDirect(vmaKmh * 1000 / 60, k, [], ["Aucune performance saisie : l'indice d'endurance vient de votre profil, les prédictions sont indicatives."]);
      source = 'VMA et profil';
    } else {
      throw new Error("Renseignez au moins une performance ou votre VMA.");
    }

    return { ...res, source, estimation };
  }

  const API = {
    parseTemps, calibrer, calibrerComplet, estimerIE, tableDurees, tablePredictions, zones, vitesseReference,
    formatAllure, formatTemps, formatDuree, ZONES_DEF
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Endurance = API;
})(typeof window !== 'undefined' ? window : globalThis);
