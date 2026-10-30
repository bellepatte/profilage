// Assemble le plan d'entraînement en un seul fichier à déployer, plan.bundle.js, chargé par index.html.
// Sources (à modifier, jamais le fichier assemblé) : plan.js (moteur), plan-seances.js (séances communes), contraintes/*.js, methodes/*.js.
// Ordre : moteur, séances communes, contraintes, méthodes (ordre alphabétique dans chaque dossier : les méthodes et les contraintes
// s'enregistrent auprès du moteur, qui les classe lui-même). Chaque source garde sa propre fonction englobante.
// Usage, depuis le dossier du projet : node outils/assembler-plan.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const racine = path.join(__dirname, '..');
const dossier = (d) => fs.readdirSync(path.join(racine, d)).filter(f => f.endsWith('.js')).sort().map(f => `${d}/${f}`);
const sources = ['plan.js', 'plan-seances.js', ...dossier('contraintes'), ...dossier('methodes')];
const morceaux = sources.map(f => {
  const t = fs.readFileSync(path.join(racine, f), 'utf8');
  new vm.Script(t, { filename: f }); // erreur de syntaxe : arrêt avant d'écrire
  return `/* ===== ${f} ===== */\r\n${t.replace(/\s+$/, '')}\r\n`;
});
const entete = `/* plan.bundle.js : fichier assemblé par outils/assembler-plan.js. NE PAS MODIFIER : modifier les sources (${sources.length} fichiers :\r\n`
  + `   ${sources.join(', ')}),\r\n   puis relancer « node outils/assembler-plan.js ». */\r\n`;
fs.writeFileSync(path.join(racine, 'plan.bundle.js'), entete + morceaux.join('\r\n'));
console.log(`plan.bundle.js : ${sources.length} sources, ${Math.round(fs.statSync(path.join(racine, 'plan.bundle.js')).size / 1024)} Ko`);
