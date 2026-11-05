/* Export du plan affiché (window.Plan.donnees()) : PDF (impression du navigateur), CSV, Excel (.xlsx), JSON et entraînements
   structurés pour montres (fichiers FIT de type « workout », réunis dans une archive .zip). Sans dépendance : archive ZIP sans
   compression, classeur Office Open XML minimal, fichiers FIT écrits octet par octet (protocole FIT 1.0). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  /* ---------- Octets ---------- */

  /** Tableau d'octets écrit en petit-boutiste : f reçoit { u8, u16, u32, bytes } */
  function octets(f) {
    const b = [], w = { u8: v => b.push(v & 255), u16: v => b.push(v & 255, (v >>> 8) & 255), bytes: a => { for (const x of a) b.push(x); } };
    w.u32 = v => { w.u16(v & 0xFFFF); w.u16(v >>> 16); };
    f(w);
    return Uint8Array.from(b);
  }
  const concat = (l) => { const r = new Uint8Array(l.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of l) { r.set(x, o); o += x.length; } return r; };

  /* ---------- ZIP (sans compression) ---------- */

  const TABLE_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = TABLE_CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /** Archive ZIP « stockée » : fichiers [{ nom, donnees (Uint8Array) }], noms en UTF-8 */
  function zip(fichiers) {
    const d = new Date(), heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const corps = [], central = [];
    let offset = 0;
    for (const f of fichiers) {
      const nom = enc.encode(f.nom), crc = crc32(f.donnees), n = f.donnees.length;
      const commun = (w) => { w.u16(0x0800); w.u16(0); w.u16(heure); w.u16(date); w.u32(crc); w.u32(n); w.u32(n); w.u16(nom.length); w.u16(0); };
      const tete = octets(w => { w.u32(0x04034b50); w.u16(20); commun(w); w.bytes(nom); });
      central.push(octets(w => { w.u32(0x02014b50); w.u16(20); w.u16(20); commun(w); w.u16(0); w.u16(0); w.u16(0); w.u32(0); w.u32(offset); w.bytes(nom); }));
      corps.push(tete, f.donnees);
      offset += tete.length + n;
    }
    const taille = central.reduce((a, x) => a + x.length, 0);
    const fin = octets(w => { w.u32(0x06054b50); w.u16(0); w.u16(0); w.u16(fichiers.length); w.u16(fichiers.length); w.u32(taille); w.u32(offset); w.u16(0); });
    return concat([...corps, ...central, fin]);
  }

  /* ---------- Tableaux (CSV, Excel) ---------- */

  const ENTETE = ['Semaine', 'Type', 'Phase', 'Jour', 'Date', 'Moment', 'Séance', 'Zone', 'Durée (min)', 'Distance (km)', 'Description'];
  const lignes = (d) => d.semaines.flatMap(s => s.jours.flatMap(j => j.seances.map(x =>
    [s.numero, s.type, s.phase, j.jour, j.date || '', x.moment, x.nom, x.zone, x.dureeMin, x.km, x.description])));
  const allure = (m) => (m === null ? '' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} /km`);
  const parametres = (d) => [['Plan', d.titre], ['Allure', d.contexte.allure], ['Allure (min/km)', allure(d.contexte.allureMinKm)],
    ['Volume (h / semaine)', Math.round(d.contexte.volumeH * 10) / 10], ['Type de volume', { max: 'maxi', min: 'mini' }[d.contexte.typeVolume] || 'cible'], ['Jours de course', d.contexte.jours], ['Doublés', d.contexte.doubles],
    ['Semaines', d.contexte.semaines], ['Cycle', d.contexte.cycle], ['Difficulté (1re semaine)', `${d.contexte.difficulte}/10`],
    ...(d.contexte.limite ? [['Longueur maximale d\'une séance', d.contexte.limite]] : [])];

  /** CSV pour Excel en français : séparateur « ; », virgule décimale, UTF-8 avec BOM */
  function csv(d) {
    const champ = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + [ENTETE, ...lignes(d)].map(l => l.map(champ).join(';')).join('\r\n') + '\r\n';
  }

  /* ---------- Excel (.xlsx mis en forme) ---------- */

  // Styles : polices, fonds et cellules (index des cellXfs par nom). Couleurs de la charte (zones Z1 – Z6 en teinte claire, bandeaux de semaine)
  const POLICES = ['', '<b/>', '<b/><color rgb="FFFFFFFF"/>', '<i/><color rgb="FF4A5568"/>', '<b/><sz val="14"/><color rgb="FF0E6EE0"/>', '<color rgb="FF4A5568"/>'];
  const FONDS = { entete: 'E3F0FF', Charge: '1583FF', Décharge: '2F9E8F', Affûtage: '6B7F99', Compétition: 'C62828', qualite: 'F4F8FD',
    Z1: 'E1E5EB', Z2: 'DCE9F7', Z3: 'D5ECE9', Z4: 'DEECDB', Z5: 'F9ECCC', Z6: 'F7DDD5' };
  const NOMS_FONDS = Object.keys(FONDS);
  const XF = []; const S = {};
  const style = (nom, { police = 0, fond = null, bord = 0, fmt = 0, align = '' } = {}) => { S[nom] = XF.length; XF.push({ police, fond: fond ? NOMS_FONDS.indexOf(fond) + 2 : 0, bord, fmt, align }); };
  const HAUT = 'vertical="top" wrapText="1"';
  style('defaut');
  style('titre', { police: 4 });
  style('sous', { police: 3, align: 'vertical="top" wrapText="1"' });
  style('entete', { police: 1, fond: 'entete', bord: 1, align: 'vertical="center" wrapText="1"' });
  ['Charge', 'Décharge', 'Affûtage', 'Compétition'].forEach(t => style('sem' + t, { police: 2, fond: t, align: 'vertical="center"' }));
  style('note', { police: 3, align: HAUT });
  for (const q of ['', 'Q']) { // séance simple, séance de qualité (fond léger)
    const fond = q ? 'qualite' : null;
    style('txt' + q, { fond, bord: 1, align: HAUT });
    style('gras' + q, { police: 1, fond, bord: 1, align: HAUT });
    style('min' + q, { fond, bord: 1, fmt: 1, align: 'vertical="top"' });
    style('km' + q, { fond, bord: 1, fmt: 164, align: 'vertical="top"' });
  }
  style('etape', { police: 5, fond: 'qualite', bord: 1, align: 'vertical="top" indent="1"' });
  ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].forEach(z => style(z, { police: 1, fond: z, bord: 1, align: 'horizontal="center" vertical="top"' }));
  style('label', { police: 1, bord: 1, align: HAUT });
  style('nombre', { bord: 1, fmt: 164, align: 'vertical="top"' });
  const STYLES = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>` +
    `<fonts count="${POLICES.length}">${POLICES.map(p => `<font>${p}${p.includes('<sz') ? '' : '<sz val="11"/>'}<name val="Calibri"/></font>`).join('')}</fonts>` +
    `<fills count="${NOMS_FONDS.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${
      NOMS_FONDS.map(n => `<fill><patternFill patternType="solid"><fgColor rgb="FF${FONDS[n]}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD5DBE3"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XF.length}">${XF.map(x =>
      `<xf numFmtId="${x.fmt}" fontId="${x.police}" fillId="${x.fond}" borderId="${x.bord}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${x.align ? `<alignment ${x.align}/>` : ''}</xf>`).join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const fDate = (iso) => { const t = new Date(iso + 'T00:00:00Z'); return `${JOURS[t.getUTCDay()]} ${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
  const fDuree = (m) => { m = Math.round(m); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const fKm = (k) => String(Math.round(k * 10) / 10).replace('.', ',');
  const ALLURE = / ?\(([<>] )?(\d+:\d{2}(?:–\d+:\d{2})?) \/km(?:, Z[1-6])?\)/; // « (4:32–5:07 /km) », « (3:57 /km, Z5) », « (< 3:26 /km) »
  /** Parties d'une séance de qualité, d'après sa description (« Échauffement … · bloc · 2 min de trot · bloc · retour au calme … ») :
      [{ etape, contenu, zone, allure }] ; null pour une séance simple */
  const parties = (x) => {
    if (!/^Échauffement/.test(x.description) || !x.description.includes(' · ')) return null; // compétition (échauffement puis course) : une seule ligne
    let n = 0;
    const morceaux = x.description.replace(/\.$/, '').split(' · ');
    return morceaux.map((m, i) => {
      const etape = i === 0 ? 'Échauffement' : /^retour au calme/i.test(m) ? 'Retour au calme'
        : /^\d+ min (de trot|à l'arrêt)$/.test(m) ? 'Entre deux blocs' : `Bloc ${++n}`;
      const a = m.match(ALLURE), allure = a ? `${a[1] || ''}${a[2]} /km` : '', zone = (m.match(/\b(Z[1-6])\b/) || [])[1] || (etape.startsWith('Bloc') ? x.zone : '');
      return { etape, contenu: m.replace(ALLURE, '').replace(/^(Échauffement|retour au calme) /i, '').replace(/^./, c => c.toUpperCase()), zone, allure };
    }).map((p, _, a) => (a.filter(q => q.etape.startsWith('Bloc')).length === 1 && p.etape === 'Bloc 1' ? { ...p, etape: 'Bloc' } : p));
  };

  /** Feuille : lignes [{ c: [cellules], ht, fusion }] ; cellule = valeur ou { v, s } (s : nom de style) ; largeurs des colonnes, lignes figées */
  function feuille({ lignes: L, largeurs, figer = 0 }) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
    const fusions = [];
    const rows = L.map((l, i) => {
      const r = i + 1;
      if (l.fusion) fusions.push(`A${r}:${col(largeurs.length - 1)}${r}`);
      // hauteur : estimée d'après le texte le plus long rapporté à la largeur de sa colonne (Excel ne l'ajuste pas à l'ouverture)
      const lignesTexte = Math.max(1, ...l.c.map((x, j) => { const v = x && typeof x === 'object' ? x.v : x; return typeof v === 'string' ? Math.ceil(v.length / ((l.fusion ? largeurs.reduce((a, b) => a + b, 0) : largeurs[j]) * 1.1)) : 1; }));
      const ht = l.ht || (lignesTexte > 1 ? lignesTexte * 15 : 0);
      return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${l.c.map((x, j) => {
        const { v, s } = x && typeof x === 'object' ? x : { v: x, s: null };
        const att = `r="${col(j)}${r}"${s ? ` s="${S[s]}"` : ''}`;
        return v === null || v === undefined || v === '' ? (s ? `<c ${att}/>` : '')
          : typeof v === 'number' ? `<c ${att}><v>${v}</v></c>` : `<c ${att} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
      `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${figer ? `<pane ySplit="${figer}" topLeftCell="A${figer + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/><cols>${largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
      `<sheetData>${rows}</sheetData>${fusions.length ? `<mergeCells count="${fusions.length}">${fusions.map(f => `<mergeCell ref="${f}"/>`).join('')}</mergeCells>` : ''}` +
      `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  const zoneCell = (z, q = '') => ({ v: z, s: /^Z[1-6]$/.test(z) ? z : 'txt' + q });

  /** Feuille Plan : bandeau par semaine (type, phase, dates, temps, distance, notes), une ligne par séance, et pour une séance de qualité
      une sous-ligne par partie (échauffement, blocs de travail, transitions, retour au calme) avec sa zone et son allure */
  function feuillePlan(d) {
    const C = d.contexte, L = [];
    const vide = (n) => Array(n).fill('');
    L.push({ c: [{ v: d.titre, s: 'titre' }], fusion: true, ht: 24 });
    L.push({ c: [{ v: [C.allure, `${C.semaines} semaines`, `${C.jours} jours de course par semaine`, C.doubles ? `${C.doubles} doublé${C.doubles > 1 ? 's' : ''}` : '',
      `volume ${{ max: 'maxi', min: 'mini' }[C.typeVolume] || 'de référence'} ${fDuree(C.volumeH * 60)} par semaine`, /^cycle/i.test(C.cycle) ? C.cycle : `cycle ${C.cycle}`, C.limite ? `longueur maximale ${C.limite}` : ''].filter(Boolean).join(' · '), s: 'sous' }], fusion: true });
    L.push({ c: [] });
    L.push({ c: ['Jour', 'Moment', 'Séance', 'Zone', 'Durée (min)', 'Distance (km)', 'Partie', 'Déroulé', 'Allure'].map(v => ({ v, s: 'entete' })), ht: 30 });
    for (const s of d.semaines) {
      const dates = s.debut ? ` · du ${fDate(s.debut)} au ${fDate(s.fin)}` : '';
      const type = FONDS[s.type] ? s.type : 'Charge';
      L.push({ c: [{ v: `Semaine ${s.numero} · ${s.type}${s.phase ? ` · ${s.phase}` : ''}${dates} · ${fDuree(s.tempsMin)}${s.km ? ` · ≈ ${fKm(s.km)} km` : ''}`, s: 'sem' + type }, ...vide(8).map(() => ({ v: '', s: 'sem' + type }))], ht: 22, fusion: true });
      (s.notes || []).forEach(n => L.push({ c: [{ v: n, s: 'note' }], fusion: true }));
      for (const j of s.jours) j.seances.forEach((x, k) => {
        const P = parties(x), q = P ? 'Q' : '';
        L.push({ c: [{ v: k ? '' : j.date ? fDate(j.date) : `Jour ${j.jour}`, s: 'gras' + q }, { v: x.moment, s: 'txt' + q }, { v: x.nom, s: 'gras' + q }, zoneCell(x.zone, q),
          { v: x.dureeMin, s: 'min' + q }, { v: x.km ?? '', s: 'km' + q }, { v: '', s: 'txt' + q }, { v: P ? '' : x.description, s: 'txt' + q }, { v: '', s: 'txt' + q }] });
        (P || []).forEach(p => L.push({ c: [...vide(3).map(() => ({ v: '', s: 'txtQ' })), zoneCell(p.zone, 'Q'), ...vide(2).map(() => ({ v: '', s: 'txtQ' })),
          { v: p.etape, s: 'etape' }, { v: p.contenu, s: 'txtQ' }, { v: p.allure, s: 'txtQ' }] }));
      });
      L.push({ c: [] });
    }
    return feuille({ lignes: L, largeurs: [12, 11, 36, 7, 9, 10, 18, 70, 16], figer: 4 });
  }
  /** Feuille Semaines : une ligne par semaine (récapitulatif) */
  function feuilleSemaines(d) {
    const qual = (s) => s.jours.reduce((a, j) => a + j.seances.filter(x => parties(x)).length, 0);
    const L = [{ c: ['Semaine', 'Type', 'Phase', 'Début', 'Fin', 'Temps', 'Distance (km)', 'Séances', 'Séances de qualité', 'Notes'].map(v => ({ v, s: 'entete' })), ht: 30 },
      ...d.semaines.map(s => ({ c: [{ v: s.numero, s: 'label' }, { v: s.type, s: 'txt' }, { v: s.phase || '', s: 'txt' }, { v: s.debut ? fDate(s.debut) : '', s: 'txt' }, { v: s.fin ? fDate(s.fin) : '', s: 'txt' },
        { v: fDuree(s.tempsMin), s: 'txt' }, { v: s.km ?? '', s: 'nombre' }, { v: s.jours.reduce((a, j) => a + j.seances.length, 0), s: 'min' }, { v: qual(s), s: 'min' }, { v: (s.notes || []).join(' '), s: 'txt' }] }))];
    return feuille({ lignes: L, largeurs: [9, 12, 22, 11, 11, 10, 12, 9, 11, 70], figer: 1 });
  }
  const feuilleRepartition = (d) => feuille({ lignes: [{ c: ['Zone', 'Répartition visée (%)', 'Plan (%)'].map(v => ({ v, s: 'entete' })), ht: 30 },
    ...d.repartition.map(r => ({ c: [zoneCell(r.zone), { v: r.cible, s: 'nombre' }, { v: r.plan, s: 'nombre' }] }))], largeurs: [10, 14, 12], figer: 1 });
  const feuilleParametres = (d) => feuille({ lignes: parametres(d).map(([k, v]) => ({ c: [{ v: k, s: 'label' }, { v, s: 'txt' }] })), largeurs: [30, 60] });

  /** Classeur .xlsx (chaînes en ligne, styles) : feuilles Plan, Semaines, Répartition, Paramètres */
  function xlsx(d) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const feuilles = [['Plan', feuillePlan(d)], ['Semaines', feuilleSemaines(d)], ['Répartition', feuilleRepartition(d)], ['Paramètres', feuilleParametres(d)]];
    const xml = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
    const NS = 'http://schemas.openxmlformats.org', REL = `${NS}/officeDocument/2006/relationships`, n = feuilles.length;
    return zip([
      { nom: '[Content_Types].xml', donnees: xml(`<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
        feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
      { nom: '_rels/.rels', donnees: xml(`<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
      { nom: 'xl/workbook.xml', donnees: xml(`<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${feuilles.map(([nom], i) => `<sheet name="${esc(nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
      { nom: 'xl/_rels/workbook.xml.rels', donnees: xml(`<Relationships xmlns="${NS}/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`) },
      { nom: 'xl/styles.xml', donnees: xml(STYLES) },
      ...feuilles.map(([, contenu], i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, donnees: enc.encode(contenu) }))
    ]);
  }

  /* ---------- FIT (entraînements structurés pour montres) ---------- */

  const CRC_FIT = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  function crcFit(b) {
    let crc = 0;
    for (const x of b) for (const q of [x & 0xF, (x >> 4) & 0xF]) { const t = CRC_FIT[crc & 0xF]; crc = ((crc >> 4) & 0x0FFF) ^ t ^ CRC_FIT[q]; }
    return crc;
  }
  // Intensité des étapes (énumération FIT intensity) : 0 active, 1 repos, 2 échauffement, 3 retour au calme
  const INTENSITE = { effort: 0, footing: 0, recup: 1, echauffement: 2, retour: 3 };
  const NOM_ETAPE = { effort: 'Effort', footing: 'Footing', recup: 'Récupération', echauffement: 'Échauffement', retour: 'Retour au calme' };
  const NOM_FIT = 32, NOM_PAS = 24; // tailles des champs texte (octets, zéro final compris)
  /** Étapes à plat : une répétition devient ses étapes suivies d'une étape « répéter depuis l'étape debut, n fois » */
  const aplatir = (etapes, out = []) => {
    for (const e of etapes) {
      if (e.rep) { const debut = out.length; aplatir(e.etapes, out); out.push({ repete: true, debut, n: e.rep }); } else out.push(e);
    }
    return out;
  };
  /** Fichier FIT « workout » : file_id, workout, puis une étape workout_step par étape (durée en temps, cible d'allure en vitesse) */
  function fit(nom, etapes) {
    const pas = aplatir(etapes);
    const texte = (w, s, n) => { // UTF-8 tronqué sans couper un caractère, complété par des zéros
      const e = enc.encode(s);
      let k = Math.min(e.length, n - 1);
      while (k > 0 && (e[k] & 0xC0) === 0x80) k--;
      for (let i = 0; i < n; i++) w.u8(i < k ? e[i] : 0);
    };
    const def = (w, local, global, champs) => { w.u8(0x40 | local); w.u8(0); w.u8(0); w.u16(global); w.u8(champs.length); champs.forEach(([n, t, b]) => { w.u8(n); w.u8(t); w.u8(b); }); };
    const vitesse = (m) => Math.round(1e6 / (m * 60)); // allure (min/km) → mm/s
    const donnees = octets(w => {
      def(w, 0, 0, [[0, 1, 0x00], [1, 2, 0x84], [2, 2, 0x84], [3, 4, 0x8C], [4, 4, 0x86]]); // file_id
      w.u8(0); w.u8(5); w.u16(255); w.u16(0); w.u32((Math.random() * 0xFFFFFFFE + 1) >>> 0); w.u32(Math.round(Date.now() / 1000) - 631065600);
      def(w, 1, 26, [[4, 1, 0x00], [6, 2, 0x84], [8, NOM_FIT, 0x07]]); // workout : course à pied
      w.u8(1); w.u8(1); w.u16(pas.length); texte(w, nom, NOM_FIT);
      def(w, 2, 27, [[254, 2, 0x84], [0, NOM_PAS, 0x07], [1, 1, 0x00], [2, 4, 0x86], [3, 1, 0x00], [4, 4, 0x86], [5, 4, 0x86], [6, 4, 0x86], [7, 1, 0x00]]); // workout_step
      pas.forEach((e, i) => {
        w.u8(2); w.u16(i);
        if (e.repete) { texte(w, '', NOM_PAS); w.u8(6); w.u32(e.debut); w.u8(0xFF); w.u32(e.n); w.u32(0); w.u32(0); w.u8(0xFF); return; }
        const a = e.allure;
        texte(w, e.nom || NOM_ETAPE[e.t], NOM_PAS); w.u8(0); w.u32(Math.round(e.duree * 60000));
        w.u8(a ? 0 : 2); w.u32(0); w.u32(a ? vitesse(a[1]) : 0); w.u32(a ? vitesse(a[0]) : 0); w.u8(INTENSITE[e.t] ?? 0);
      });
    });
    const tete = octets(w => { w.u8(14); w.u8(0x10); w.u16(2100); w.u32(donnees.length); w.bytes(enc.encode('.FIT')); });
    const avecCrc = concat([tete, octets(w => w.u16(crcFit(tete))), donnees]);
    return concat([avecCrc, octets(w => w.u16(crcFit(avecCrc)))]);
  }
  /** Une séance par fichier FIT, nommés dans l'ordre du plan : S01-J2-a-seuil.fit (plan par date : 2026-11-04-a-seuil.fit) */
  function montres(d) {
    const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 30);
    return zip(d.semaines.flatMap(s => s.jours.flatMap(j => j.seances.map((x, k) => ({
      nom: `${j.date || `S${String(s.numero).padStart(2, '0')}-J${j.jour}`}${j.seances.length > 1 ? '-' + 'ab'[k] : ''}-${ascii(x.nom)}.fit`,
      donnees: fit(`S${s.numero}J${j.jour}${j.seances.length > 1 ? 'ab'[k] : ''} ${x.nom}`, x.etapes) })))));
  }

  /* ---------- Téléchargement et impression ---------- */

  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type })), a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const FORMATS = {
    csv: d => ['csv', csv(d), 'text/csv;charset=utf-8'],
    xlsx: d => ['xlsx', xlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    json: d => ['json', JSON.stringify(d, null, 2), 'application/json'],
    fit: d => ['fit.zip', montres(d), 'application/zip']
  };

  // Impression (PDF) : semaines dépliées et titre d'impression le temps de l'impression, puis état d'origine
  let ouverts = [];
  window.addEventListener('beforeprint', () => {
    const d = window.Plan.donnees();
    if (d) $('impression-titre').textContent = `${d.titre} · ${d.contexte.allure} · ${d.contexte.semaines} semaines · ${d.contexte.jours} jours par semaine`;
    ouverts = [...document.querySelectorAll('#vue-entrainement details')].map(x => [x, x.open]);
    ouverts.forEach(([x]) => { x.open = true; });
  });
  window.addEventListener('afterprint', () => ouverts.forEach(([x, o]) => { x.open = o; }));

  $('pl-export').addEventListener('click', e => {
    const b = e.target.closest('[data-format]'), d = window.Plan.donnees();
    if (!b || !d) return;
    if (b.dataset.format === 'pdf') { window.print(); return; }
    const [ext, contenu, type] = FORMATS[b.dataset.format](d);
    telecharger(`plan-entrainement-${new Date().toISOString().slice(0, 10)}.${ext}`, contenu, type);
  });

  window.Export = { csv, xlsx, fit, montres, zip }; // pour les tests (Node)
})();
