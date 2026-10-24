/*
 * Indice d'endurance (Péronnet & Thibault), forme simplifiée :
 *   % VMA(T) = 100 + IE × ln(T / 6)        T en minutes, IE = 100 × k
 *   v(T) = VMA × (1 + k × ln(T / 6))       vitesses en m/min en interne
 * Régression de v sur x = ln(T / 6) : VMA = a, k = b / a.
 */
(function (global) {
  'use strict';

  const REF_MIN = 6;             // durée de référence (VMA tenue ~6 min)
  const DUREE_MIN = 5;           // modèle non applicable en dessous de 5 min
  const LIMITE_MIN = 300;       // modèle non applicable au-delà de 5 h
  const REF_ZONE_MIN = 60;       // référence des zones : allure 1 h
  const VITESSE_KMH = [4, 30];   // bornes réalistes de vitesse moyenne (km/h)
  const ECART_MAX = 2;           // écart max (points de % VMA) entre une performance et la tendance des autres
  const ECART_DISTANCE_MIN = 0.10; // avec deux données seulement, écart minimal entre les distances
  const BORNE_BASSE = 50;        // bas de Z1, en % de l'allure 1 h (zone ouverte, bornée pour convertir temps et distance)
  const LARGEUR_Z6 = 10;         // largeur de Z6 (zone ouverte au-delà de la VMA), en points de % de l'allure 1 h
  const IE_HABITUEL = [-14, -2]; // bornes habituelles de l'indice d'endurance
  const DISTANCES_PREDITES = [1500, 5000, 10000, 21097, 42195];
  // Fiabilité d'une prédiction selon l'extrapolation hors de la plage saisie
  const SEUILS_FIABILITE = [[0.25, 'Élevée'], [0.50, 'Correcte'], [1.00, 'Moyenne'], [1.50, 'Faible'], [Infinity, 'Mauvaise']];
  // La VMA compte comme une donnée (chrono sur 6 min) : une donnée seule ne suffit pas sans profil
  const MESSAGE_DONNEE_UNIQUE = "Une seule donnée (performance ou VMA) ne suffit pas pour prédire : renseignez votre profil (volume, âge ou sexe) ou une autre performance.";

  // Zones en % de l'allure 1 h (pMin / pMax, null = sans limite). Z5 s'arrête à la VMA, Z6 commence à la VMA : ces deux bornes
  // (pMax de Z5, pMin de Z6) sont calculées par zones() ; les valeurs ci-dessous sont des valeurs types (VMA à 120 %).
  const ZONES_DEF = [
    { id: 'Z1', nom: 'Échauffement, récupération', pMin: null, pMax: 65, utilite: 'Récupérer, favoriser la régénération' },
    { id: 'Z2', nom: 'Endurance fondamentale', pMin: 65, pMax: 80, utilite: 'Développer l\'endurance aérobie' },
    { id: 'Z3', nom: 'Endurance active', pMin: 80, pMax: 90, utilite: 'Améliorer l\'endurance à allure soutenue' },
    { id: 'Z4', nom: 'Tempo/seuil', pMin: 90, pMax: 100, utilite: 'Améliorer la capacité à maintenir une allure élevée' },
    { id: 'Z5', nom: 'VO2Max', pMin: 100, pMax: 120, utilite: 'Développer la puissance aérobie maximale' },
    { id: 'Z6', nom: 'Vitesse', pMin: 120, pMax: null, utilite: 'Développer la vitesse, la puissance musculaire et aérobie' }
  ];

  /* ---------- Saisie et formatage ---------- */

  const virgule = (x, n = 1) => x.toFixed(n).replace('.', ',');
  const kmh = (vMpm) => vMpm * 60 / 1000;
  const metres = (d) => `${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} m`;
  const enumere = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}` : items[0]);

  /** "18:30", "1:27:00", "18,5", "42min", "42'20", "1h20", "1h20m30s", "20s" -> minutes décimales ; NaN si invalide */
  function parseTemps(saisie) {
    const s = String(saisie ?? '').trim().toLowerCase().replace(/,/g, '.');
    if (!s) return NaN;
    let min;
    if (s.includes(':') || /^\d+(\.\d+)?$/.test(s)) { // mm:ss, h:mm:ss ou minutes décimales
      const p = s.split(':').map(Number);
      if (p.some(Number.isNaN) || p.length > 3) return NaN;
      min = p.length === 1 ? p[0] : p.length === 2 ? p[0] + p[1] / 60 : p[0] * 60 + p[1] + p[2] / 60;
    } else { // avec unités : heures (h), minutes (min, mn, m, '), secondes (s, sec, '', ")
      const n = '(\\d+(?:\\.\\d+)?)(?![\\d.])'; // nombre entier, jamais coupé en deux
      const m = s.match(new RegExp(`^(?:${n}\\s*h)?\\s*(?:${n}\\s*(?:min|mn|m|')?)?\\s*(?:${n}\\s*(?:sec|s|''|")?)?$`));
      if (!m || !(m[1] || m[2] || m[3])) return NaN;
      min = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60;
    }
    return min > 0 ? min : NaN;
  }

  /** "5000", "5000 m", "5 km", "5,5km", "10k", "semi", "marathon" -> mètres ; sans unité, une valeur < 100 est lue en km ; NaN si invalide */
  function parseDistance(saisie) {
    const s = String(saisie ?? '').trim().toLowerCase().replace(/,/g, '.').replace(/(\d)\s+(?=\d)/g, '$1');
    if (/^(semi|demi)([\s-]*marathon)?$/.test(s)) return 21097;
    if (s === 'marathon') return 42195;
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(km|k|m)?$/);
    if (!m) return NaN;
    const x = Number(m[1]), d = (m[2] ?? (x < 100 ? 'km' : 'm')) === 'm' ? x : Math.round(x * 1000);
    return d > 0 ? d : NaN;
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
    const s = Math.round(min * 60), p = (n) => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
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
  /** Vitesse (m/min) de référence des zones : allure 1 h */
  const vitesseReference = (res) => vitesseMpm(res, REF_ZONE_MIN);

  /** Régression linéaire y = a + b x sur des points { x, y } ; null si les x sont identiques */
  function regression(points) {
    const n = points.length, somme = (f) => points.reduce((s, q) => s + f(q), 0);
    const sx = somme(q => q.x), sy = somme(q => q.y), sxx = somme(q => q.x * q.x), sxy = somme(q => q.x * q.y);
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n, moy = sy / n;
    const ssRes = somme(q => (q.y - (a + b * q.x)) ** 2), ssTot = somme(q => (q.y - moy) ** 2);
    return { a, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  }

  /**
   * Calibre le modèle. perfs : [{ distance (m), temps (min) }], vmaKmh : VMA connue (optionnelle).
   * Lève une erreur si les données sont inexploitables ; renvoie des avertissements si elles sont suspectes.
   */
  function calibrer(perfs, vmaKmh) {
    const valides = perfs.filter(p => p.distance > 0 && p.temps > 0);
    if (!valides.length) throw new Error("Aucune performance valide : indiquez au moins une distance et un temps.");
    const ys = valides.map(p => p.distance / p.temps); // m/min
    valides.forEach((p, i) => {
      const v = kmh(ys[i]);
      if (v < VITESSE_KMH[0] || v > VITESSE_KMH[1]) throw new Error(`Vitesse irréaliste sur ${p.distance} m (${virgule(v)} km/h) : vérifiez la distance et le temps.`);
    });

    // La VMA connue est une donnée comme les autres, au point (6 min, VMA) : aucune n'est prioritaire
    const points = valides.map((p, i) => ({ i, x: Math.log(p.temps / REF_MIN), y: ys[i] }));
    if (vmaKmh > 0) points.push({ i: null, x: 0, y: vmaKmh * 1000 / 60 });
    // Deux données seulement : leurs distances doivent différer d'au moins 10 % (VMA = performance sur 6 min)
    if (points.length === 2) {
      const d = [...valides.map(p => p.distance), ...(vmaKmh > 0 ? [vmaKmh * 1000 / 60 * REF_MIN] : [])];
      const ecartDistances = (Math.max(...d) - Math.min(...d)) / Math.min(...d);
      if (ecartDistances < ECART_DISTANCE_MIN) {
        throw new Error(`Les deux données sont trop proches : l'écart entre les distances doit être d'au moins ${100 * ECART_DISTANCE_MIN} % (ici ${virgule(100 * ecartDistances)} %)`
          + `${vmaKmh > 0 ? `. La VMA compte comme une performance sur 6 min, soit ${metres(Math.round(d[1]))}` : ''}. Ajoutez une performance sur une distance plus éloignée.`);
      }
    }
    const reg = regression(points);
    if (!reg) throw new Error(vmaKmh > 0
      ? "Avec une VMA connue, il faut une performance d'une durée différente de 6 min."
      : "Il faut au moins deux durées différentes (ex. 1500 m et 10 km) pour calibrer le modèle, ou renseigner la VMA connue.");
    const V = reg.a, k = reg.b / reg.a;
    const r2 = points.length > 2 ? reg.r2 : null; // avec 2 points, la droite passe exactement par les deux
    if (k >= 0) throw new Error(`L'indice d'endurance calculé est positif ou nul (${virgule(100 * k)}) : les performances saisies ne peuvent pas être modélisées. Vérifiez les distances et les temps.`);

    // Cohérence (1) : une vitesse ne doit pas augmenter quand la distance augmente ; la VMA saisie
    // compte comme une performance (VMA × 6 min, en 6:00)
    const vVma = vmaKmh * 1000 / 60;
    const saisies = valides.map((p, i) => ({ distance: p.distance, v: ys[i], nom: `le ${metres(p.distance)} en ${formatTemps(p.temps)} (${virgule(kmh(ys[i]))} km/h)` }));
    if (vmaKmh > 0) saisies.push({ distance: vVma * REF_MIN, v: vVma, vma: true, nom: `la VMA saisie (${virgule(vmaKmh)} km/h, soit ${metres(Math.round(vVma * REF_MIN))} en 6:00)` });
    const violations = [];
    saisies.forEach(a => saisies.forEach(b => { if (b.distance > a.distance && b.v > a.v) violations.push([a, b]); }));

    // Cohérence (2) : une performance hors de la tendance des autres est une contre-performance
    // si son retrait rend les autres cohérentes entre elles (il faut alors au moins 3 points restants)
    const ecart = (d, q) => 100 * (q.y - (d.a + d.b * q.x)) / d.a; // points de % VMA
    const horsTendance = points.filter(q => q.i !== null && Math.abs(ecart(reg, q)) > ECART_MAX);
    let contre = null;
    if (horsTendance.length && points.length >= 4) {
      for (const q of points.filter(z => z.i !== null)) {
        const reste = points.filter(z => z !== q), d = regression(reste);
        if (!d || !reste.every(z => Math.abs(ecart(d, z)) <= ECART_MAX)) continue;
        const e = ecart(d, q);
        if (!contre || Math.abs(e) > Math.abs(contre.e)) contre = { i: q.i, e };
      }
    }
    const flagged = new Set(contre ? [contre.i] : horsTendance.map(q => q.i));
    const performances = valides.map((p, i) => ({ ...p, vitesseKmh: kmh(ys[i]), pctVvo2: 100 * ys[i] / V, probleme: flagged.has(i) }));

    // Avertissements
    const avertissements = [];
    const nomTemps = (p) => `${metres(p.distance)} en ${formatTemps(p.temps)}`;
    for (const [a, b] of violations) {
      avertissements.push(`Une vitesse ne peut pas augmenter quand la distance augmente : ${b.nom} est plus rapide que ${a.nom}. Vérifiez ces deux ${a.vma || b.vma ? 'saisies' : 'performances'}.`);
    }
    if (flagged.size) {
      const fautives = valides.filter((_, i) => flagged.has(i)), coherentes = valides.filter((_, i) => !flagged.has(i));
      const suite = coherentes.length > 1 ? ` Les autres performances (${enumere(coherentes.map(p => metres(p.distance)))}) sont cohérentes entre elles.` : '';
      if (contre) {
        const c = valides[contre.i], ampleur = virgule(Math.abs(contre.e));
        avertissements.push(contre.e < 0
          ? `Le ${nomTemps(c)} semble être une contre-performance : il est nettement plus lent que ce que vos autres résultats laissent attendre (${ampleur} points de % VMA). Il pèse sur les prédictions, qui sont donc moins fiables.${suite}`
          : `Le ${nomTemps(c)} est nettement plus rapide que ce que vos autres résultats laissent attendre (${ampleur} points de % VMA) : vérifiez cette saisie. Il pèse sur les prédictions, qui sont donc moins fiables.${suite}`);
      } else {
        avertissements.push(`Les performances saisies s'accordent mal entre elles, sans qu'une seule se détache clairement : ${enumere(fautives.map(p => `le ${nomTemps(p)}`))} ${fautives.length > 1 ? 'sont' : 'est'} à vérifier. Elles pèsent sur les prédictions, qui sont donc moins fiables.`);
      }
    }
    if (valides.some(p => p.temps < DUREE_MIN)) avertissements.push(`Une performance dure moins de ${DUREE_MIN} min : elle est hors de la plage de validité du modèle et peut peser fortement sur la VMA.`);
    if (valides.some(p => p.temps > LIMITE_MIN)) avertissements.push("Une performance dure plus de 5 h : le modèle n'est pas applicable à cette durée.");
    if (100 * k < IE_HABITUEL[0]) avertissements.push(`L'indice d'endurance calculé (${virgule(100 * k)}) est très éloigné des valeurs habituelles (en dessous de ${IE_HABITUEL[0]}) : vérifiez les temps saisis, en particulier l'écart entre les distances.`);
    if (100 * k > IE_HABITUEL[1]) avertissements.push(`L'indice d'endurance calculé (${virgule(100 * k)}) est anormalement proche de 0 : vérifiez les temps saisis.`);
    const distances = valides.map(p => p.distance);
    for (const d of new Set(distances)) {
      if (distances.filter(x => x === d).length > 1) avertissements.push(`Plusieurs performances sur ${d} m : vérifiez qu'il ne s'agit pas d'un doublon.`);
    }

    return { V, k, IE: 100 * k, r2, coherenceFaible: violations.length > 0 || flagged.size > 0, vvo2Kmh: kmh(V), performances, avertissements };
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
    if (res.vmaSaisie > 0) d.push(res.V * REF_MIN); // VMA connue = chrono de référence sur 6 min
    if (!d.length) return 'Indicative';
    const dMin = Math.min(...d), dMax = Math.max(...d);
    const extrapolation = distance > dMax ? (distance - dMax) / dMax : distance < dMin ? (dMin - distance) / dMin : 0;
    // Données incohérentes : un cran plus bas
    const i = SEUILS_FIABILITE.findIndex(([max]) => extrapolation <= max) + (res.coherenceFaible ? 1 : 0);
    return SEUILS_FIABILITE[Math.min(i, SEUILS_FIABILITE.length - 1)][1];
  }

  const prediction = (res, distance, temps) => {
    const v = distance / temps;
    return { distance, temps, allureMinKm: 1000 / v, vitesseKmh: kmh(v), fiabilite: fiabilitePrediction(res, distance) };
  };
  /** Chronos prédits pour une liste de distances (m) */
  const tablePredictions = (res, distances = DISTANCES_PREDITES) => distances.map(d => prediction(res, d, predireTemps(res, d)));
  /** Distances prédites (m) pour une liste de temps (min) */
  const tableDistances = (res, temps) => temps.map(t => prediction(res, vitesseMpm(res, t) * t, t));

  /** Zones : bornes en allure (min/km), null si la zone est ouverte. Z5 va de l'allure 1 h à la VMA, Z6 est au-delà de la VMA ;
      as et haut : bornes finies en % de l'allure 1 h (Z1 à 50 %, Z6 sur LARGEUR_Z6 points) pour convertir temps et distance */
  function zones(res) {
    const vRef = vitesseReference(res), pVma = 100 * res.V / vRef;
    return ZONES_DEF.map(z => {
      const pMin = z.id === 'Z6' ? pVma : z.pMin, pMax = z.id === 'Z5' ? pVma : z.pMax;
      return {
        ...z, pMin, pMax,
        bas: pMin ?? BORNE_BASSE, haut: pMax ?? pMin + LARGEUR_Z6,
        allureRapide: pMax === null ? null : 1000 / (vRef * pMax / 100),
        allureLente: pMin === null ? null : 1000 / (vRef * pMin / 100)
      };
    });
  }

  /** Plage d'une zone en % de l'allure 1 h : « < 65 % », « 65–80 % », « > 120 % » */
  const plageZone = (z) => (z.pMin === null ? `< ${Math.round(z.pMax)} %` : z.pMax === null ? `> ${Math.round(z.pMin)} %` : `${Math.round(z.pMin)}–${Math.round(z.pMax)} %`);

  /** Allures d'une zone (min/km) ; `court` pour les espaces réduits (barre des zones) */
  const allureZone = (z, court) => (z.pMin === null ? `${court ? '>' : 'plus lent que'} ${formatAllure(z.allureRapide)}`
    : z.pMax === null ? `${court ? '<' : 'plus rapide que'} ${formatAllure(z.allureLente)}`
    : `${formatAllure(z.allureRapide)}${court ? '–' : ' – '}${formatAllure(z.allureLente)}`);

  /* ---------- Profil : estimation de l'indice quand les données manquent ---------- */

  // Coefficients ajustés sur 1 848 coureurs amateurs (Vickers & Vertosick, BMC Sports Sci Med Rehabil 2016) :
  // indice médian −7,2 ; volume, âge et sexe n'expliquent qu'environ 7 % des écarts entre coureurs.
  const IE_MOYEN = -7.2;
  const INCERT_BASE = 2.5;     // incertitude de base (points d'IE), élargie par facteur non renseigné
  // Effet sur l'IE (points) selon chaque facteur. Un effet positif rapproche l'IE de 0 (endurance meilleure).
  // Points d'ancrage [valeur, effet] reliés par interpolation linéaire, constants au-delà des bornes.
  const ANCRES = {
    volume: [[10, -1], [30, -0.7], [50, -0.2], [70, 0.2], [90, 0.6], [110, 1.2]], // km / semaine
    age: [[18, -1], [27.5, 0], [42.5, 0.2], [60, 0.7]]                             // années
  };
  const EFFET_SEXE = { H: -0.2, F: 0.3 };
  const LIBELLES = { volume: ['Volume', ' km/sem'], age: ['Âge', ' ans'] };

  function effetInterpole(ancres, x) {
    const i = ancres.findIndex(([v]) => v >= x);
    if (i === 0) return ancres[0][1];
    if (i === -1) return ancres[ancres.length - 1][1];
    const [x0, y0] = ancres[i - 1], [x1, y1] = ancres[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  /**
   * Estime l'indice d'endurance à partir du profil : chaque facteur renseigné ajoute ou retire
   * des points à un coureur moyen. Un facteur absent n'agit pas, mais élargit l'incertitude.
   *   profil : { volume, age (nombres ou vides), sexe ('H', 'F' ou vide) }
   */
  function estimerIE(profil = {}) {
    let IE = IE_MOYEN, manquants = 0;
    const details = [];
    for (const [cle, ancres] of Object.entries(ANCRES)) {
      const brut = profil[cle], x = Number(brut);
      if (brut === '' || brut === null || brut === undefined || !Number.isFinite(x)) { manquants++; continue; }
      const effet = effetInterpole(ancres, x);
      IE += effet;
      details.push({ label: LIBELLES[cle][0], valeur: x + LIBELLES[cle][1], effet });
    }
    const effetSexe = EFFET_SEXE[profil.sexe];
    if (effetSexe === undefined) manquants++;
    else {
      IE += effetSexe;
      details.push({ label: 'Sexe', valeur: profil.sexe === 'F' ? 'femme' : 'homme', effet: effetSexe });
    }
    IE = Math.min(IE_HABITUEL[1], Math.max(IE_HABITUEL[0], IE));
    return { IE, base: IE_MOYEN, incertitude: INCERT_BASE + 0.5 * manquants, details, renseigne: details.length > 0 };
  }

  /**
   * Calcul avec repli sur le profil :
   *   - deux données ou plus (la VMA compte comme un chrono de 6 min) : calcul à partir des chronos ;
   *   - une seule donnée : la VMA (ou l'indice) vient du profil, qui doit alors être renseigné ;
   *   - chronos incohérents et profil renseigné : l'indice d'endurance vient du profil.
   */
  function calibrerComplet(perfs, vmaKmh, profil = {}, horsPlage = false) {
    const estimation = estimerIE(profil), k = estimation.IE / 100;
    const valides = perfs.filter(p => p.distance > 0 && p.temps > 0);
    let res, profilUtilise = false;

    // Effort hors de la plage de validité (5 min à 5 h) : refusé tant que l'utilisateur ne confirme pas (horsPlage = true)
    const dehors = valides.filter(p => p.temps < DUREE_MIN || p.temps > LIMITE_MIN);
    if (dehors.length && !horsPlage) {
      const err = new Error(`Hors de la plage de validité du modèle (${DUREE_MIN} min à ${LIMITE_MIN / 60} h) : ${enumere(dehors.map(p => `${metres(p.distance)} en ${formatTemps(p.temps)}`))}. Sur ces durées, l'indice d'endurance est peu fiable (alimentation, matériel, gestion de l'effort, ou effort trop court pour la VMA).`);
      err.horsPlage = true;
      err.cle = dehors.map(p => `${p.distance}@${p.temps}`).join('|');
      throw err;
    }

    if (valides.length && (vmaKmh > 0 || new Set(valides.map(p => p.temps)).size >= 2)) {
      res = calibrer(valides, vmaKmh);
    } else if (!valides.length && !(vmaKmh > 0)) {
      throw new Error("Renseignez au moins une performance ou votre VMA.");
    } else {
      if (!estimation.renseigne) throw new Error(MESSAGE_DONNEE_UNIQUE);
      const p = valides[0];
      const V = p ? (p.distance / p.temps) / (1 + k * Math.log(p.temps / REF_MIN)) : vmaKmh * 1000 / 60;
      if (!Number.isFinite(V) || kmh(V) < VITESSE_KMH[0] || kmh(V) > VITESSE_KMH[1]) throw new Error("La VMA estimée est irréaliste : vérifiez les données saisies.");
      res = {
        V, k, IE: 100 * k, r2: null, vvo2Kmh: kmh(V),
        performances: valides.map(q => ({ ...q, vitesseKmh: kmh(q.distance / q.temps), pctVvo2: 100 * (q.distance / q.temps) / V })),
        avertissements: [p ? "Un seul chrono : la VMA est déduite de l'indice estimé par votre profil, elle est donc indicative."
          : "Aucune performance saisie : l'indice d'endurance vient de votre profil, les prédictions sont indicatives."]
      };
      profilUtilise = true;
    }

    // Chronos incohérents : l'indice d'endurance vient du profil s'il est renseigné ; la VMA reste celle des données
    if (res.coherenceFaible && estimation.renseigne) {
      res = { ...res, k, IE: 100 * k, avertissements: [...res.avertissements, `Vos performances étant incohérentes, l'indice d'endurance utilisé pour les prédictions vient du profil (${virgule(estimation.IE)}) et non de vos chronos.`] };
      profilUtilise = true;
    }
    return { ...res, estimation, profilUtilise, ieDouteux: res.IE < IE_HABITUEL[0] || res.IE > IE_HABITUEL[1], vmaSaisie: vmaKmh > 0 ? vmaKmh : null };
  }

  const API = {
    parseTemps, parseDistance, calibrer, calibrerComplet, estimerIE, pctVma, tablePredictions, tableDistances, zones, plageZone, allureZone, vitesseReference,
    formatAllure, formatTemps, formatDuree
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Endurance = API;
})(typeof window !== 'undefined' ? window : globalThis);
