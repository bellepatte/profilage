/* Balance : répartition du volume d'entraînement entre les 6 zones, selon l'objectif, avec la charge (TSS, Coggan)
   qui en résulte. Base : 80 % du volume en Z1+Z2, modulée par objectif pour que le TSS par heure reste équivalent.
   Les zones, la VMA et l'indice d'endurance viennent du profil calculé par la page (setProfil). */
(function () {
  'use strict';
  const E = window.Endurance;
  const $ = (id) => document.getElementById(id);
  const BORNES = [50, 130]; // bornes des zones ouvertes (Z1 et Z6), en % de l'allure 1 h, pour convertir temps et distance

  // rec : part de Z1 dans le volume d'endurance (Z1+Z2) ; hard : répartition (en %) du volume d'intensité entre Z3..Z6
  const GOALS = {
    '5k':       { label: '5 km',          dist: 5000,  rec: 20, hard: [15, 30, 40, 15] },
    '10k':      { label: '10 km',         dist: 10000, rec: 18, hard: [20, 40, 32, 8] },
    'semi':     { label: 'Semi-marathon', dist: 21097, rec: 15, hard: [35, 42, 18, 5] },
    'marathon': { label: 'Marathon',      dist: 42195, rec: 12, hard: [55, 32, 10, 3] }
  };
  // Intensité (IF) de chaque zone pour le TSS et la conversion en distance : allure médiane de la zone (milieu de ses bornes),
  // sauf Z1 et Z6 (zones ouvertes), fixées en % de l'allure 1 h
  const IF_FIXE = { Z1: 0.60, Z6: 1.25 };
  // Base : 80 % du volume en Z1+Z2 (≥ 80 % de faible intensité chez les coureurs de classe mondiale, Haugen et al. 2022 ; sources
  // dans CLAUDE.md). La charge par heure de référence est celle de cette base avec la répartition d'intensité du 10 km (REF_OBJECTIF)
  // et REC_REF % de Z1 ; la part facile de chaque objectif est ajustée (EASY_BORNES) pour retrouver cette charge.
  const EASY_BASE = 80, REF_OBJECTIF = '10k', REC_REF = 15, EASY_BORNES = [70, 95];
  // Volume : la charge par heure cible baisse de 5 % à chaque doublement du volume hebdomadaire au-delà de REF_HOURS (moins de
  // récupération possible : plus de facile) et augmente de même en dessous (davantage de temps de récupération : plus d'intensité).
  const REF_HOURS = 5, CHARGE_PAR_DOUBLING = 0.95;
  // Allure de l'objectif dans l'endurance : le poids de Z1 et de Z2 est multiplié par 1 + SPECIFIQUE_FACILE × gaussienne (même
  // écart-type que l'intensité) autour de l'allure de l'objectif ; Z2 prend de l'avance si l'allure de course y est.
  const SPECIFIQUE_FACILE = 2;
  const state = { volume: 5, unit: 'h', goal: '10k', easy: EASY_BASE, easyAuto: true, rec: 15, recAuto: true, profil: null };

  // Indice d'endurance : mauvais (≤ −10) → accent sur l'aérobie (intensité en Z3/Z4) ;
  // bon (≥ −4) → vitesse prioritaire (intensité en Z5/Z6) ; autour de IE_NEUTRE → toutes les filières.
  const IE_NEUTRE = -7, IE_AMPLEUR = 3; // biais = (IE − IE_NEUTRE) / IE_AMPLEUR, borné à [−1 ; 1]
  const HARD_PENTE_IE = 0.5; // pente du poids des zones Z3..Z6 selon le biais : exp(biais × pente × (rang − 1,5))
  const PACE_SPREAD = 0.15; // écart-type (fraction de l'allure 1 h) du poids gaussien autour de l'allure de l'objectif

  try {
    const s = JSON.parse(localStorage.getItem('balance') || '{}');
    for (const c of Object.keys(state)) if (c in s) state[c] = s[c];
  } catch (e) { /* stockage indisponible */ }
  const save = () => { try { localStorage.setItem('balance', JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } };

  const fmtTime = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
  const fmtKm = (km) => km.toFixed(1).replace('.', ',') + ' km';
  const fmtPct = (p) => (Math.round(p * 10) / 10).toString().replace('.', ',') + ' %';
  const fmtRange = (fmt, [lo, hi]) => (fmt(lo) === fmt(hi) ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`);

  /** Zones : bornes finies en % de l'allure 1 h (lo, hi), IF (iff) et, avec un profil, bornes et vitesse médiane en km/h (v, vmoy) */
  function zonesBornees(res) {
    const vRef = res ? E.vitesseReference(res) * 60 / 1000 : null;
    return E.zones(res || { V: 1, k: -0.06 }).map(z => {
      const lo = z.pMin ?? BORNES[0], hi = z.pMax ?? BORNES[1], iff = IF_FIXE[z.id] ?? (lo + hi) / 200;
      return { ...z, lo, hi, iff, v: res && [vRef * lo / 100, vRef * hi / 100], vmoy: res && vRef * iff };
    });
  }

  /** Biais de l'indice d'endurance : −1 aérobie à développer, +1 vitesse à développer, 0 sans profil */
  const biaisIE = () => (state.profil ? Math.max(-1, Math.min(1, (state.profil.IE - IE_NEUTRE) / IE_AMPLEUR)) : 0);

  /** Allure de l'objectif en fraction de l'allure 1 h ; null sans profil */
  function goalPct(goal = state.goal) {
    const p = state.profil;
    if (!p) return null;
    const v = E.tablePredictions(p, [GOALS[goal].dist])[0].vitesseKmh;
    const pct = v / (E.vitesseReference(p) * 60 / 1000);
    return Number.isFinite(pct) ? pct : null;
  }

  // Répartition du volume d'intensité entre Z3..Z6 : profil de l'objectif, recentré autour de la zone
  // d'allure de course (poids gaussien selon l'écart entre le milieu de chaque zone et l'allure objectif),
  // puis incliné par l'indice d'endurance.
  function hardWeights(Z, goal = state.goal) {
    const base = GOALS[goal].hard, p = goalPct(goal);
    if (p === null) return base.map(w => w / 100);
    const w = base.map((b, i) => {
      const z = Z[i + 2], d = ((z.lo + z.hi) / 200 - p) / PACE_SPREAD;
      return b * Math.exp(-d * d / 2 + biaisIE() * HARD_PENTE_IE * (i - 1.5));
    });
    const sum = w.reduce((s, x) => s + x, 0);
    return sum > 0 ? w.map(x => x / sum) : base.map(x => x / 100);
  }

  /** Part de Z1 dans l'endurance : valeur de l'objectif, réduite au profit de Z2 si l'allure de l'objectif est en Z2 (Z1 sinon) */
  function recObjectif(Z, goal = state.goal) {
    const p = goalPct(goal), r = GOALS[goal].rec / 100;
    if (p === null) return r;
    const gauss2 = (z, p) => (((z.lo + z.hi) / 200 - p) / PACE_SPREAD) ** 2;
    const poids = (z, part) => part * (1 + SPECIFIQUE_FACILE * Math.exp(-gauss2(z, p) / 2));
    const w1 = poids(Z[0], r), w2 = poids(Z[1], 1 - r);
    return w1 / (w1 + w2);
  }

  const weeklyHours = () => (state.unit === 'h' ? state.volume : state.volume / (state.profil ? state.profil.vvo2Kmh * 0.72 : 10));

  function render() {
    const profil = state.profil, Z = zonesBornees(profil), g = GOALS[state.goal];

    $('eq-profil').innerHTML = profil
      ? `Profil utilisé : VMA <strong>${profil.vvo2Kmh.toFixed(1).replace('.', ',')} km/h</strong> · indice d'endurance <strong>${profil.IE.toFixed(1).replace('.', ',')}</strong> · allure 1 h <strong>${E.formatAllure(1000 / E.vitesseReference(profil))} /km</strong>. <button type="button" class="lien" data-vue="profil">Modifier mes données</button>`
      : `Aucun profil : sans VMA, seules les proportions et l'unité saisie sont disponibles. <button type="button" class="lien" data-vue="profil">Saisir mes chronos</button>`;

    const recAuto = recObjectif(Z), recConseille = Math.round(recAuto * 100);
    if (state.recAuto) { state.rec = recConseille; $('eq-rec').value = recConseille; }
    $('eq-resetRec').textContent = state.recAuto ? 'auto (selon objectif)' : `revenir au conseillé (${recConseille} %)`;
    $('eq-recNote').textContent = `Conseillé : ${recConseille} % du volume d'endurance pour ${g.label} (${g.rec} % de base, ajusté selon l'allure de l'objectif : plus de Z2 si elle s'y trouve).`;

    // Coût en TSS par heure de chaque zone : IF² × 100 (Coggan, IF = allure médiane de la zone / allure 1 h = FTP)
    const ifZ = Z.map(z => z.iff), c = ifZ.map(x => x * x * 100);
    const coutFacile = (rec) => rec * c[0] + (1 - rec) * c[1];
    const coutDur = (w) => w.reduce((s, x, i) => s + x * c[i + 2], 0);
    const h = weeklyHours(), facteurVolume = h > 0 ? Math.pow(CHARGE_PAR_DOUBLING, Math.log2(h / REF_HOURS)) : 1;
    const cible = facteurVolume * (EASY_BASE / 100 * coutFacile(REC_REF / 100) + (1 - EASY_BASE / 100) * coutDur(GOALS[REF_OBJECTIF].hard.map(x => x / 100)));
    const w = hardWeights(Z), rec = state.recAuto ? recAuto : state.rec / 100, cF = coutFacile(rec), cD = coutDur(w);
    // Part facile qui ramène la charge par heure à la cible : e × cF + (1 − e) × cD = cible
    // Si l'allure de l'objectif est en zone facile (Z1/Z2), le travail spécifique est de l'endurance : la charge n'est plus tenue
    // à l'équivalence et la part facile reste au moins égale à la base.
    const gp = goalPct(), allureFacile = gp !== null && gp * 100 < Z[1].hi;
    const plancher = allureFacile ? EASY_BASE : EASY_BORNES[0];
    const eAuto = Math.min(EASY_BORNES[1], Math.max(plancher, 100 * (cD - cible) / (cD - cF))) / 100;
    if (state.easyAuto) { state.easy = Math.round(eAuto * 100); $('eq-easy').value = state.easy; }
    const easy = state.easyAuto ? eAuto : state.easy / 100;
    $('eq-resetEasy').textContent = state.easyAuto ? 'auto (charge équivalente)' : `revenir au conseillé (${Math.round(eAuto * 100)} %)`;
    $('eq-easyNote').textContent = `Base : ${EASY_BASE} % du volume en Z1+Z2. Pour ${g.label} à ≈ ${fmtTime(h)}/semaine, ${Math.round(eAuto * 100)} % : le temps d'intensité est ajusté pour que la charge reste ` +
      `équivalente d'un objectif à l'autre (≈ ${Math.round(cible)} TSS par heure : une heure en Z5 coûte plus de TSS qu'une heure en Z3)${allureFacile ? `. L'allure ${g.label} est en zone facile : le travail spécifique est de l'endurance, la part facile reste au moins à ${EASY_BASE} %, quitte à charger moins que les autres objectifs` : ''}, et elle baisse de ${Math.round((1 - CHARGE_PAR_DOUBLING) * 100)} % à chaque doublement du volume au-delà de ${REF_HOURS} h (davantage de facile, moins de récupération possible).`;

    // Parts de temps (t) et de TSS (f) de chaque zone
    const t = [easy * rec, easy * (1 - rec), ...w.map(p => (1 - easy) * p)];
    const tssH = t.reduce((s, x, i) => s + x * c[i], 0), f = t.map((x, i) => x * c[i] / tssH);

    const isH = state.unit === 'h';
    // Chaque valeur est une fourchette [bas, haut] : la grandeur saisie est exacte (bas = haut),
    // la grandeur convertie va de l'allure basse à l'allure haute de la zone.
    let rows, heures = null; // heures : durée exacte de chaque zone, pour le TSS (inconnue en km sans profil)
    if (isH) {
      heures = t.map(x => state.volume * x);
      rows = Z.map((z, i) => ({ h: [heures[i], heures[i]], km: profil ? [heures[i] * z.v[0], heures[i] * z.v[1]] : null }));
    } else if (profil) {
      // km donnés : on répartit le temps (allure médiane) pour atteindre le kilométrage total,
      // puis on encadre le temps de chaque zone avec ses bornes d'allure
      const totalH = state.volume / Z.reduce((s, z, i) => s + t[i] * z.vmoy, 0);
      heures = t.map(x => totalH * x);
      rows = Z.map((z, i) => {
        const km = heures[i] * z.vmoy;
        return { h: [km / z.v[1], km / z.v[0]], km: [km, km] };
      });
    } else {
      rows = Z.map((z, i) => { const km = state.volume * t[i]; return { h: null, km: [km, km] }; });
    }
    const tss = heures && heures.map((h, i) => h * c[i]), tssTot = tss ? tss.reduce((s, x) => s + x, 0) : 0;

    const showH = rows[0].h !== null, showKm = rows[0].km !== null;
    $('eq-bar').innerHTML = Z.map((z, i) =>
      `<div class="segment${i === 2 ? ' sep' : ''}" style="flex:${t[i] * 100};background:var(--z${i + 1})" title="${z.id} ${z.nom} : ${fmtPct(t[i] * 100)} du volume, ${fmtPct(f[i] * 100)} du TSS">${t[i] > 0.05 ? z.id : ''}</div>`).join('');

    const sum = (rs, k) => rs.reduce((s, r) => [s[0] + r[k][0], s[1] + r[k][1]], [0, 0]);
    const part = (rs) => [showH && fmtRange(fmtTime, sum(rs, 'h')), showKm && fmtRange(fmtKm, sum(rs, 'km'))].filter(Boolean).join(' · ');
    $('eq-easyTot').textContent = `Endurance ${state.easy} % du volume — ${part(rows.slice(0, 2))}`;
    $('eq-hardTot').textContent = `Intensité ${100 - state.easy} % du volume — ${part(rows.slice(2))}`;

    $('eq-thead').innerHTML = '<th>Zone</th><th></th><th class="num">% volume</th>' + (showH ? '<th class="num">Temps</th>' : '') + (showKm ? '<th class="num">Distance</th>' : '') +
      (profil ? '<th class="num">Allure (min/km)</th>' : '') + '<th class="num">% allure 1 h</th>' +
      (tss ? '<th class="num">TSS</th><th class="num">% TSS</th>' : '');
    $('eq-tbody').innerHTML = Z.map((z, i) => `<tr>
      <td><span class="pastille" style="background:var(--z${i + 1})"></span><strong>${z.id}</strong></td>
      <td class="sous">${z.nom}</td>
      <td class="num">${fmtPct(t[i] * 100)}</td>
      ${showH ? `<td class="num">${fmtRange(fmtTime, rows[i].h)}</td>` : ''}
      ${showKm ? `<td class="num">${fmtRange(fmtKm, rows[i].km)}</td>` : ''}
      ${profil ? `<td class="num">${E.allureZone(z, true)}</td>` : ''}
      <td class="num">${E.plageZone(z)}</td>
      ${tss ? `<td class="num">${Math.round(tss[i])}</td><td class="num">${fmtPct(f[i] * 100)}</td>` : ''}
    </tr>`).join('');
    // Allure moyenne du total : temps total / distance totale, de la plus rapide à la plus lente
    const allureTot = profil && [sum(rows, 'h')[0] * 60 / sum(rows, 'km')[1], sum(rows, 'h')[1] * 60 / sum(rows, 'km')[0]];
    $('eq-tfoot').innerHTML = '<td>Total</td><td></td><td class="num">100 %</td>' +
      (showH ? `<td class="num">${fmtRange(fmtTime, sum(rows, 'h'))}</td>` : '') +
      (showKm ? `<td class="num">${fmtRange(fmtKm, sum(rows, 'km'))}</td>` : '') +
      (profil ? `<td class="num">${fmtRange(E.formatAllure, [allureTot[0], allureTot[1]])}</td>` : '') + '<td></td>' +
      (tss ? `<td class="num">${Math.round(tssTot)}</td><td class="num">100 %</td>` : '');

    $('eq-note').textContent = "Charge (Coggan) : TSS = durée (h) × IF² × 100, avec IF = allure médiane de la zone / allure 1 h (Z1 : 60 %, Z6 : 125 %) (équivalent du FTP) ; 100 = 1 h à l'allure 1 h. " +
      "La part facile de chaque objectif est ajustée pour que le TSS par heure reste équivalent." + (profil
      ? (isH ? " Fourchettes de distance calculées avec l'allure basse et l'allure haute de chaque zone."
          : " Kilométrage réparti avec l'allure médiane de chaque zone ; fourchettes de temps calculées avec ses allures basse et haute.")
        + " Le temps d'intensité inclut uniquement l'effort, pas les récupérations entre fractions. Z1 et Z6 sont bornées à 50 % et 130 % de l'allure 1 h."
      : " Renseignez votre profil pour obtenir les allures par zone et la conversion temps ↔ distance.");

    $('eq-zoneNote').textContent = gp === null
      ? "Renseignez votre profil pour centrer l'intensité sur l'allure de l'objectif."
      : `Allure ${g.label} ≈ ${fmtPct(gp * 100)} de l'allure 1 h (${(Z.find(z => gp * 100 < z.hi) || Z[5]).id}) : le volume d'intensité est réparti autour de cette zone.`;

    const b = biaisIE();
    $('eq-biais').textContent = !profil ? '' : b <= -1 / 3
      ? "Indice d'endurance à développer : accent sur le travail aérobie, avec une intensité plutôt en Z3-Z4."
      : b >= 1 / 3 ? "Bonne endurance : la vitesse est prioritaire, avec une intensité plutôt en Z5-Z6."
      : "Profil équilibré : toutes les filières sont travaillées.";

    $('eq-easyLbl').textContent = `${state.easy} % / ${100 - state.easy} %`;
    $('eq-recLbl').textContent = `${state.rec} %`;
    save();
  }

  // Initialisation des contrôles
  $('eq-goal').innerHTML = Object.entries(GOALS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('');
  $('eq-goal').value = state.goal;
  $('eq-volume').value = state.volume;
  $('eq-easy').value = state.easy;
  $('eq-rec').value = state.rec;
  document.querySelectorAll('#eq-unit button').forEach(b => b.classList.toggle('actif', b.dataset.u === state.unit));

  $('eq-volume').addEventListener('input', e => { state.volume = Math.max(0, +e.target.value || 0); render(); });
  $('eq-easy').addEventListener('input', e => { state.easy = +e.target.value; state.easyAuto = false; render(); });
  $('eq-rec').addEventListener('input', e => { state.rec = +e.target.value; state.recAuto = false; render(); });
  $('eq-goal').addEventListener('change', e => { state.goal = e.target.value; state.recAuto = true; render(); });
  $('eq-resetEasy').addEventListener('click', () => { state.easyAuto = true; render(); });
  $('eq-resetRec').addEventListener('click', () => { state.recAuto = true; render(); });
  $('eq-unit').addEventListener('click', e => {
    const u = e.target.dataset.u;
    if (!u) return;
    state.unit = u;
    document.querySelectorAll('#eq-unit button').forEach(b => b.classList.toggle('actif', b === e.target));
    render();
  });

  /** Reçoit le dernier profil calculé par la page (VMA, indice d'endurance, zones) */
  function setProfil(res) {
    state.profil = { V: res.V, k: res.k, IE: res.IE, vvo2Kmh: res.vvo2Kmh, performances: [] };
    render();
  }

  window.Balance = { setProfil };
  render();
})();
