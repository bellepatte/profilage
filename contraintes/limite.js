/* Contrainte : longueur maximale d'une séance (étape 2, facultative, toutes méthodes), en durée ou en distance. Les séances de qualité
   trop longues sont raccourcies (reduire) et l'effort retiré reporté quand c'est possible ; les séances faciles sont plafonnées. Alertes de
   compatibilité avec l'objectif et le volume, champ de l'étape 2. Chargée après plan.js ; le moteur l'appelle par
   PlanCore.contraintes.limite (depasse est aussi fourni aux méthodes : PlanCore.depasse). */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, fD, aZ, echauffement, RETOUR, contexte, nbDoubles, OBJECTIFS, volumeMini, volumeMiniTxt } = PlanCore;
  const volRef = () => PlanCore.contraintes.volume.ref();
  const render = () => PlanCore.render();

  // Limite en durée, ou en distance convertie en durée à l'allure moyenne de Z2 (6 min/km sans profil). min : durée limite, km : distance
  // limite (null en durée), txt : texte des alertes
  // Minimum : 20 min (en km, la distance de 20 min à l'allure de Z2) ; maximum : 5 h ou 60 km
  const LIMITE_MIN = 20;
  const allureZ2 = (c) => (c.profil ? aZ(c, 'Z2') : 6);
  const bornesLimite = (c) => (state.limiteU === 'km' ? [Math.ceil(LIMITE_MIN / allureZ2(c) * 2) / 2, 60] : [LIMITE_MIN, 300]);
  function limiteDe(c) {
    if (!(state.limite > 0)) return null;
    const km = state.limiteU === 'km', allure = allureZ2(c), n = state.limite;
    const min = Math.max(LIMITE_MIN, km ? n * allure : n);
    return { min, km: km ? n : null, txt: km ? `${n.toLocaleString('fr-FR')} km${c.profil ? ` (≈ ${fD(min)})` : ''}` : fD(n) };
  }
  /** Séance (durée, et distance si la limite est en km) au-dessus de la limite c.limite */
  const depasse = (c, x) => !!c.limite && (x.duree > c.limite.min + 0.01 || !!(c.limite.km && x.km && x.km > c.limite.km + 0.01));
  /** Séance ramenée sous la limite : regen(k) la refait avec un travail multiplié par k (échauffement et retour au calme inchangés) */
  function reduire(c, x, regen) {
    const L = c.limite, fixe = (x.echauf ?? echauffement(c, x.zone)) + RETOUR;
    let k = 1, y = x;
    for (let n = 0; n < 8 && depasse(c, y); n++) {
      const r = [(L.min - fixe) / Math.max(1, y.duree - fixe)];
      if (L.km && y.km) r.push(L.km / y.km);
      k *= Math.max(0.3, Math.min(...r) * 0.97);
      y = regen(k);
    }
    return y;
  }

  /** Alertes : compatibilité avec l'objectif et le volume, puis effets sur le plan construit (lim : limite du contexte) */
  const alertes = ({ c, lim, semaines, parLimite, coupe, trop, clubs }) => {
    const aLimite = [];
      const nD = nbDoubles(), capacite = (state.seances + nD) * lim.min, W = semaines.length;
      const nom = OBJECTIFS.find(([k]) => k === c.goal)[2], pour = `${c.course ? '' : "une allure proche d'"}un ${nom}`;
      // 5 km et 10 km : la séance la plus longue doit couvrir au moins 80 % de la distance de l'objectif ; semi et marathon : c'est le volume hebdomadaire minimal de l'objectif (RAPPORT) qui compte
      const limKm = lim.km ?? lim.min / allureZ2(c), objKm = c.dist / 1000, minKm = Math.round(0.8 * objKm * 10) / 10, volMin = volumeMini(c) * 60;
      if ((c.goal === '5k' || c.goal === '10k') && limKm < minKm - 0.01) aLimite.push(`Limite incompatible avec l'objectif : pour ${pour}, la séance la plus longue devrait couvrir au moins ${minKm.toLocaleString('fr-FR')} km (80 % de la distance), or la longueur maximale est de ${lim.txt}${lim.km ? '' : ` (≈ ${(Math.round(limKm * 10) / 10).toLocaleString('fr-FR')} km)`}. Relevez la limite.`);
      const volumeKo = capacite < c.heures * 60 - 1;
      if ((c.goal === 'semi' || c.goal === 'marathon') && capacite < volMin - 1 && !(volumeKo && c.heures * 60 >= volMin)) aLimite.push(`Limite incompatible avec l'objectif : pour ${pour}, il faut au moins ${volumeMiniTxt(c)} par semaine (≈ ${fD(volMin)}), or ${state.seances} séance${state.seances > 1 ? 's' : ''}${nD ? ` et ${nD} doublé${nD > 1 ? 's' : ''}` : ''} de ${lim.txt} au plus font ${fD(capacite)}. Relevez la limite, ajoutez des jours de course ou des doublés.`);
      if (volumeKo) aLimite.push(`Limite incompatible avec le volume : ${state.seances} séance${state.seances > 1 ? 's' : ''}${nD ? ` et ${nD} doublé${nD > 1 ? 's' : ''}` : ''} de ${lim.txt} au plus font ${fD(capacite)} par semaine, sous les ${fD(c.heures * 60)} visés. Relevez la limite, ajoutez des jours de course ou des doublés, ou baissez le volume.`);
      else if (parLimite) aLimite.push(`La longueur maximale de ${lim.txt} plafonne la sortie longue et les footings : le volume réel reste sous ${volRef()} certaines semaines.`);
      const fixe = echauffement(c, 'Z5') + RETOUR;
      if (lim.min < fixe + 20) aLimite.push(`Avec ${lim.txt} au plus, l'échauffement et le retour au calme (${fixe} min) laissent très peu de place au travail de qualité.`);
      else if (coupe >= 1) aLimite.push(`La longueur maximale de ${lim.txt} raccourcit les séances de qualité : l'effort retiré est reporté sur d'autres séances quand c'est possible, mais ≈ ${fD(coupe / W)} d'effort par semaine en moyenne n'a pas pu être replacé, le temps en intensité visé n'est pas atteint.`);
      if (trop) aLimite.push(`Certaines séances de qualité ne peuvent pas être raccourcies davantage (répétitions trop longues pour la limite) : jusqu'à ${fD(trop)}, au-dessus de la longueur maximale de ${lim.txt}. Relevez la limite ou choisissez une autre méthode.`);
      clubs.filter(k => k.duree > lim.min + 0.01).forEach(k => aLimite.push(`La séance du club du ${k.jour} (${fD(k.duree)}) dépasse la longueur maximale de ${lim.txt} : elle est gardée telle quelle.`));
    return aLimite;
  };
  /** Champ de l'étape 2 (valeur, unité) */
  const afficher = () => {
    if (document.activeElement !== $('pl-limite')) $('pl-limite').value = state.limite ?? ''; // pas pendant la frappe
    document.querySelectorAll('#pl-limiteU button').forEach(b => b.classList.toggle('actif', b.dataset.u === state.limiteU));
  };

  PlanCore.depasse = depasse;
  PlanCore.contrainte('limite', { de: limiteDe, bornes: bornesLimite, depasse, reduire, alertes, afficher }); // avant les écouteurs : bornerLimite lit le contexte

  // Longueur maximale d'une séance : valeur facultative (vide = aucune) entre les bornes de l'unité ; changer d'unité convertit la valeur (allure moyenne de Z2)
  const bornerLimite = () => {
    const [a, b] = bornesLimite(contexte());
    if (state.limite !== null) state.limite = Math.min(b, Math.max(a, Math.round(state.limite * 10) / 10));
    $('pl-limite').min = a; $('pl-limite').max = b; $('pl-limite').step = state.limiteU === 'km' ? 0.5 : 5;
  };
  bornerLimite();
  $('pl-limite').addEventListener('input', e => {
    const v = parseFloat(e.target.value.replace(',', '.')), [a, b] = bornesLimite(contexte());
    if (e.target.value === '') { state.limite = null; render(); } else if (v >= a && v <= b) { state.limite = v; render(); }
  });
  $('pl-limite').addEventListener('change', () => { // hors bornes : ramené à la borne la plus proche à la sortie du champ
    const v = parseFloat($('pl-limite').value.replace(',', '.'));
    state.limite = Number.isFinite(v) ? v : null;
    bornerLimite();
    render();
    $('pl-limite').value = state.limite ?? '';
  });
  $('pl-limiteU').addEventListener('click', e => {
    const b = e.target.closest('[data-u]');
    if (!b || b.dataset.u === state.limiteU) return;
    const c = contexte(), allure = c.profil ? aZ(c, 'Z2') : 6; // min/km de conversion (Z2, ou 6 sans profil)
    if (state.limite !== null) state.limite = b.dataset.u === 'km' ? state.limite / allure : Math.round(state.limite * allure / 5) * 5;
    state.limiteU = b.dataset.u;
    bornerLimite();
    render();
  });

})();
