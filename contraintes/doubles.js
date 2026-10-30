/* Contrainte : doublés (deux séances le même jour, étape 2, toutes méthodes). Nombre de doublés (6 au plus, autant que de jours de course),
   jours qui les reçoivent (jours à une seule séance : faciles d'abord, puis de qualité), moment de la séance d'intensité, alertes. La durée de
   la 2e séance est fixée par la méthode. Chargée après plan.js ; le moteur l'appelle par PlanCore.contraintes.doubles. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, footing } = PlanCore;
  const render = () => PlanCore.render();

  /** Nombre de doublés : chaque jour de course peut être doublé, 6 au plus */
  const nombre = () => Math.min(state.doubles, state.seances, 6);
  /** Pose les 2es séances (footings de durée secD[m], ou min(dD, dF)) sur des jours à une seule séance : d'abord les jours faciles, puis les
      jours de qualité (footing en plus) ; jamais deux séances de qualité le même jour (le double seuil de la méthode norvégienne, prévu par la
      méthode, est posé à part), jamais le jour de la plus grosse séance de la semaine (sortie longue, séance longue facile ou séance de qualité
      plus longue : une séance strictement plus longue que toutes les autres, séances du club comprises ; à égalité, aucune) ; la méthode réduit le nombre de doublés s'il
      n'y a pas assez de jours */
  const placer = ({ jours, dernier, club = [], nD, secD, dD, dF, c }) => {
    const toutes = [...jours.flat(), ...dernier, ...club], max = Math.max(...toutes.map(x => x.duree)), tete = toutes.filter(x => x.duree === max);
    const grosse = tete.length === 1 ? tete[0] : null;
    const libres = jours.filter(j => j.length === 1 && !j.includes(grosse));
    [...libres.filter(j => !j[0].qualite), ...libres.filter(j => j[0].qualite)].slice(0, nD)
      .forEach((j, m) => j.push(footing(secD ? secD[m] : Math.min(dD, dF), c)));
  };
  /** Alertes : doublés peu utiles (en dessous de utiles séances par semaine, ou de volumeMin heures) */
  const alertes = ({ nD, total, c, utiles, volumeMin }) => {
    const a = [];
    if (nD && utiles && total < utiles) a.push(`Les doublés servent à libérer des jours de repos : ils sont utiles à partir de ${utiles} séances par semaine (${total} ici).`);
    if (nD && !utiles && c.heures < volumeMin) a.push(`Les doublés servent surtout à absorber un gros volume : sous ≈ ${volumeMin} h par semaine, des séances simples un peu plus longues apportent autant, avec plus de récupération.`);
    return a;
  };
  /** Séances d'un jour avec leur moment : un doublé place la séance d'intensité selon state.moment ;
      deux séances de même nature (double seuil, deux footings) restent matin / soir */
  const moments = (j) => {
    if (j.length < 2) return [['', j[0]]];
    if (j.every(x => x.nom === 'Course')) return j.map((x, m) => [m ? `${m + 1}e course` : '1re course', x]); // plusieurs courses le même jour
    const q =j.filter(x => x.qualite), f = j.filter(x => !x.qualite);
    if (q.length !== 1) return j.map((x, m) => [m ? 'Soir' : 'Matin', x]);
    return { matin: [['Matin', q[0]], ['Soir', f[0]]], soir: [['Matin', f[0]], ['Soir', q[0]]],
      midi: [['Midi', q[0]], ['Matin ou soir', f[0]]], indifferent: [['', q[0]], ['', f[0]]] }[state.moment];
  };

  /** Doublés possibles : autant que de jours de course, 6 au plus ; la liste suit le nombre de jours */
  const options = () => {
    const max = Math.min(6, state.seances), sel = $('pl-doubles');
    state.doubles = Math.min(state.doubles, max);
    if (sel.options.length !== max + 1) sel.innerHTML = Array.from({ length: max + 1 }, (_, n) => `<option value="${n}">${n ? `${n} jour${n > 1 ? 's' : ''}` : 'Aucun'}</option>`).join('');
    sel.value = state.doubles;
  };
  /** Moment de la séance d'intensité (affiché s'il y a des doublés) */
  const afficher = () => {
    $('pl-momentBloc').hidden = !nombre();
  };

  PlanCore.contrainte('doubles', { nombre, placer, alertes, moments, options, afficher });
  options();
  $('pl-moment').value = state.moment;
  $('pl-moment').addEventListener('change', e => { state.moment = e.target.value; render(); });
})();
