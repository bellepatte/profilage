/* Contrainte : cycle menstruel (facultatif, plan par date, toutes méthodes). Suivi des phases (règles, folliculaire, ovulation estimée,
   lutéale), jours sensibles choisis par l'utilisatrice où le placement évite la qualité si possible, mentions « à alléger », alertes santé,
   champs de l'étape 2 et pastilles de l'agenda. Chargée après plan.js ; le moteur l'appelle par PlanCore.contraintes.cycle. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, borne, parseDate, fDate, JOUR } = PlanCore;
  const render = () => PlanCore.render();

  // Valeurs par défaut pour les champs absents ou invalides (anciennes sauvegardes)
  {
    const r = state.regles && typeof state.regles === 'object' ? state.regles : {};
    state.regles = { actif: !!r.actif, debut: typeof r.debut === 'string' ? r.debut : '', duree: Number.isFinite(r.duree) ? borne(Math.round(r.duree), 15, 60) : 28,
      hormonale: !!r.hormonale, irregulier: !!r.irregulier, sensRegles: !!r.sensRegles, sensAvant: !!r.sensAvant };
  }

  // Repères seulement : la phase du cycle n'a qu'un effet trivial sur la performance, preuves de faible qualité, approche individuelle
  // conseillée (McNulty et al., Sports Med 2020). Règles J1 à J5, ovulation estimée à durée − 14 (± 1 jour), phase folliculaire avant,
  // lutéale après. Jours sensibles choisis par l'utilisatrice (J1 – J2, 3 derniers jours du cycle) : le plan y évite les séances de qualité
  // quand il le peut (préférence, pas interdiction), sans toucher au volume. Pas de suivi avec une contraception hormonale (pas de
  // phases naturelles) ni avec des cycles irréguliers (phases imprévisibles), seulement en plan par date.
  const REGLES_JOURS = 5;
  const PHASES = { regles: 'règles', folliculaire: 'phase folliculaire', ovulation: 'ovulation (estimée)', luteale: 'phase lutéale' };
  const suiviCycle = () => {
    const r = state.regles, d0 = parseDate(r.debut);
    return r.actif && !r.hormonale && !r.irregulier && Number.isFinite(d0) && state.horizon === 'date' ? { d0, n: r.duree } : null;
  };
  /** Jour du cycle (1 à n), phase et jour sensible à la date t */
  function phaseDu(t, s) {
    const j = ((Math.round((t - s.d0) / JOUR) % s.n) + s.n) % s.n + 1, ov = s.n - 14;
    const phase = j <= REGLES_JOURS ? 'regles' : Math.abs(j - ov) <= 1 ? 'ovulation' : j < ov ? 'folliculaire' : 'luteale';
    return { j, phase, sensible: (state.regles.sensRegles && j <= 2) || (state.regles.sensAvant && j > s.n - 3) };
  }
  /** Alertes du suivi du cycle : santé (cycles absents, longs, courts ou irréguliers) et conditions du suivi */
  function alertesCycle() {
    const r = state.regles, a = [];
    if (!r.actif) return a;
    const d0 = parseDate(r.debut), ecart = Number.isFinite(d0) ? Math.floor((Date.now() - d0) / JOUR) : null;
    const signes = [r.irregulier && 'cycles irréguliers ou absents', r.duree > 35 && `cycles longs (${r.duree} jours)`, r.duree < 21 && `cycles courts (${r.duree} jours)`,
      ecart > 90 && `plus de 3 mois depuis le début des dernières règles`].filter(Boolean);
    if (signes.length) a.push(`Santé : ${signes.join(', ')}. Chez une coureuse, des règles absentes ou très espacées peuvent signaler un déficit énergétique (RED-S), avec des risques pour les os et la santé. Parlez-en à un médecin ou une sage-femme.`);
    if (r.hormonale) a.push('Cycle menstruel : avec une contraception hormonale, il n\'y a pas de phases naturelles à suivre ; le plan n\'est pas adapté.');
    else if (r.irregulier) a.push('Cycle menstruel : avec des cycles irréguliers, les phases ne sont pas prévisibles ; le plan n\'est pas adapté.');
    else if (state.horizon !== 'date') a.push('Cycle menstruel : le suivi s\'applique au plan par date (étape 3, durée « Jusqu\'à la date de l\'objectif »).');
    else if (!Number.isFinite(d0)) a.push('Cycle menstruel : renseignez la date du début des dernières règles.');
    return a;
  }

  /** Courses (objectif ou compétitions intermédiaires) qui tombent sur un jour sensible : information, la date ne bouge pas */
  const alertesCourses = (datesCourses, cyc) => (cyc ? datesCourses.filter(t => phaseDu(t, cyc).sensible).map(t => `Cycle menstruel : la course du ${fDate(t)} tombe sur un de vos jours sensibles (${phaseDu(t, cyc).phase === 'regles' ? 'règles' : 'fin de cycle'}, estimation). La date ne se déplace pas : écoutez vos sensations à l'échauffement et adaptez votre objectif du jour si besoin.`) : []);
  /** Pastille de phase sous la date de l'agenda (cerclée les jours sensibles) */
  const pastille = (t, cyc) => {
    if (!cyc) return '';
    const p = phaseDu(t, cyc);
    return `<i class="cyc ${p.phase}${p.sensible ? ' sensible' : ''}" title="Cycle : J${p.j}, ${PHASES[p.phase]}${p.sensible ? ' (jour sensible : qualité évitée si possible)' : ''}"></i>`;
  };
  /** Jour du cycle et phase pour l'export */
  const infoJour = (t, cyc) => ({ jour: phaseDu(t, cyc).j, phase: PHASES[phaseDu(t, cyc).phase] });
  /** Champs de l'étape 2 */
  const afficher = () => {
    const R = state.regles;
    $('pl-reglesActif').checked = R.actif; $('pl-reglesBloc').hidden = !R.actif;
    $('pl-reglesDebut').value = R.debut; if (document.activeElement !== $('pl-reglesDuree')) $('pl-reglesDuree').value = R.duree;
    $('pl-reglesHormonale').checked = R.hormonale; $('pl-reglesIrregulier').checked = R.irregulier;
    $('pl-reglesSensRegles').checked = R.sensRegles; $('pl-reglesSensAvant').checked = R.sensAvant;
  };

  // Cycle menstruel : cases et champs de l'étape 2 (state.regles)
  [['actif', 'pl-reglesActif'], ['hormonale', 'pl-reglesHormonale'], ['irregulier', 'pl-reglesIrregulier'], ['sensRegles', 'pl-reglesSensRegles'], ['sensAvant', 'pl-reglesSensAvant']]
    .forEach(([k, id]) => $(id).addEventListener('change', e => { state.regles[k] = e.target.checked; render(); }));
  $('pl-reglesDebut').addEventListener('change', e => { state.regles.debut = e.target.value; render(); });
  $('pl-reglesDuree').addEventListener('change', e => { const v = Math.round(+e.target.value); if (v >= 15 && v <= 60) state.regles.duree = v; render(); });

  PlanCore.contrainte('cycle', { suivi: suiviCycle, phaseDu, alertes: alertesCycle, alertesCourses, pastille, infoJour, afficher });
})();
