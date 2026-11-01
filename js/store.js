/* Wortschatz — Speicherung, Lernstand und Wiederholungslogik
   Klassisches Skript (kein Modul), damit die Seite auch per file:// läuft. */

(function (global) {
  'use strict';

  var SCHLUESSEL = 'wortschatz.v1';
  var INTERVALLE = [1, 3, 7, 14];

  /* localStorage kann fehlen (file://, Privatmodus, node) — dann Speicher im Arbeitsspeicher. */
  var SPEICHER = (function () {
    try {
      var s = global.localStorage;
      s.setItem('__ws_probe__', '1');
      s.removeItem('__ws_probe__');
      return s;
    } catch (e) {
      var daten = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(daten, k) ? daten[k] : null; },
        setItem: function (k, v) { daten[k] = String(v); },
        removeItem: function (k) { delete daten[k]; }
      };
    }
  })();

  function zwei(n) { return (n < 10 ? '0' : '') + n; }

  function alsDatum(d) {
    return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate());
  }

  function heute() { return alsDatum(new Date()); }

  function plusTage(tage, von) {
    var d = von ? new Date(von + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + tage);
    return alsDatum(d);
  }

  function leererStand() {
    return {
      version: 1,
      fortschritt: {},
      favoriten: [],
      eigene: [],
      log: {},
      verlauf: [],
      quiz: { richtig: 0, gesamt: 0, proTyp: {} },
      einstellungen: { theme: null, ziel: 12 }
    };
  }

  function normalisiere(roh) {
    var basis = leererStand();
    if (!roh || typeof roh !== 'object') return basis;
    var stand = {
      version: 1,
      fortschritt: roh.fortschritt && typeof roh.fortschritt === 'object' ? roh.fortschritt : {},
      favoriten: Array.isArray(roh.favoriten) ? roh.favoriten.filter(function (x) { return typeof x === 'string'; }) : [],
      eigene: Array.isArray(roh.eigene) ? roh.eigene.filter(function (w) { return w && w.id && w.wort; }) : [],
      log: roh.log && typeof roh.log === 'object' ? roh.log : {},
      verlauf: Array.isArray(roh.verlauf) ? roh.verlauf.slice(-60) : [],
      quiz: {
        richtig: roh.quiz && Number(roh.quiz.richtig) || 0,
        gesamt: roh.quiz && Number(roh.quiz.gesamt) || 0,
        proTyp: roh.quiz && roh.quiz.proTyp && typeof roh.quiz.proTyp === 'object' ? roh.quiz.proTyp : {}
      },
      einstellungen: {
        theme: roh.einstellungen && (roh.einstellungen.theme === 'dunkel' || roh.einstellungen.theme === 'hell') ? roh.einstellungen.theme : null,
        ziel: roh.einstellungen && [6, 12, 18, 24].indexOf(Number(roh.einstellungen.ziel)) > -1 ? Number(roh.einstellungen.ziel) : 12
      }
    };
    // Tagesprotokoll reparieren (ältere Stände können Felder vermissen)
    Object.keys(stand.log).forEach(function (tag) {
      var eintrag = stand.log[tag];
      if (!eintrag || typeof eintrag !== 'object') { delete stand.log[tag]; return; }
      ['gesehen', 'gewusst', 'unsicher', 'quiz', 'richtig', 'falsch', 'aktiv', 'aktivRichtig'].forEach(function (feld) {
        eintrag[feld] = Number(eintrag[feld]) || 0;
      });
    });
    // Fortschrittseinträge reparieren
    Object.keys(stand.fortschritt).forEach(function (id) {
      var p = stand.fortschritt[id];
      if (!p || typeof p !== 'object') { delete stand.fortschritt[id]; return; }
      p.stufe = Math.max(0, Math.min(4, Number(p.stufe) || 0));
      p.status = ['neu', 'lernen', 'unsicher', 'gelernt'].indexOf(p.status) > -1 ? p.status : 'neu';
      p.faellig = typeof p.faellig === 'string' ? p.faellig : heute();
      p.bekannt = p.bekannt === true;
      p.gesehen = Number(p.gesehen) || 0;
      p.gewusst = Number(p.gewusst) || 0;
      p.unsicher = Number(p.unsicher) || 0;
      p.beispiele = Array.isArray(p.beispiele) ? p.beispiele.filter(function (b) { return typeof b === 'string'; }) : [];
    });
    return stand;
  }

  function laden() {
    try {
      var roh = SPEICHER.getItem(SCHLUESSEL);
      if (!roh) return leererStand();
      return normalisiere(JSON.parse(roh));
    } catch (e) {
      return leererStand();
    }
  }

  var stand = laden();

  function speichern() {
    try {
      SPEICHER.setItem(SCHLUESSEL, JSON.stringify(stand));
      return true;
    } catch (e) {
      return false;
    }
  }

  function leererFortschritt() {
    return {
      status: 'neu',
      stufe: 0,
      faellig: heute(),
      zuletzt: null,
      gesehen: 0,
      gewusst: 0,
      unsicher: 0,
      bekannt: false,
      beispiele: []
    };
  }

  function fortschritt(id) {
    if (stand.fortschritt[id]) return stand.fortschritt[id];
    return leererFortschritt();
  }

  function tagesEintrag(datum) {
    var tag = datum || heute();
    if (!stand.log[tag]) {
      stand.log[tag] = { gesehen: 0, gewusst: 0, unsicher: 0, quiz: 0, richtig: 0, falsch: 0, aktiv: 0, aktivRichtig: 0 };
    }
    var eintrag = stand.log[tag];
    ['gesehen', 'gewusst', 'unsicher', 'quiz', 'richtig', 'falsch', 'aktiv', 'aktivRichtig'].forEach(function (feld) {
      eintrag[feld] = Number(eintrag[feld]) || 0;
    });
    return eintrag;
  }

  function logPlus(feld, anzahl) {
    tagesEintrag()[feld] += (anzahl === undefined ? 1 : anzahl);
    // Protokoll auf 60 Tage begrenzen
    var tage = Object.keys(stand.log).sort();
    while (tage.length > 60) {
      delete stand.log[tage.shift()];
    }
  }

  function verlaufPush(id, aktion) {
    stand.verlauf.push({ id: id, aktion: aktion, zeit: new Date().toISOString() });
    if (stand.verlauf.length > 60) stand.verlauf = stand.verlauf.slice(-60);
  }

  /* Antwort im Lernmodus: 'gewusst' | 'unsicher' | 'nochmal' */
  function antwort(id, wert) {
    var p = stand.fortschritt[id] || leererFortschritt();
    p.gesehen += 1;
    p.zuletzt = heute();

    if (wert === 'gewusst') {
      p.gewusst += 1;
      p.stufe = Math.min(4, p.stufe + 1);
      p.status = 'gelernt';
      p.bekannt = true;
      p.faellig = plusTage(INTERVALLE[Math.min(p.stufe, 4) - 1]);
      logPlus('gewusst');
    } else if (wert === 'unsicher') {
      p.unsicher += 1;
      p.stufe = Math.max(0, p.stufe - 1);
      p.status = 'unsicher';
      p.faellig = plusTage(1);
      logPlus('unsicher');
    } else {
      p.stufe = 0;
      p.status = 'lernen';
      p.faellig = heute();
      logPlus('unsicher');
    }

    logPlus('gesehen');
    stand.fortschritt[id] = p;
    verlaufPush(id, wert);
    speichern();
    return p;
  }

  function setzeBekannt(id, bekannt) {
    var p = stand.fortschritt[id] || leererFortschritt();
    if (bekannt) {
      p.bekannt = true;
      p.status = 'gelernt';
      p.stufe = 4;
      p.faellig = plusTage(INTERVALLE[3]);
    } else {
      p.bekannt = false;
      p.status = 'lernen';
      p.stufe = 0;
      p.faellig = heute();
    }
    p.zuletzt = heute();
    stand.fortschritt[id] = p;
    verlaufPush(id, bekannt ? 'bekannt' : 'unbekannt');
    speichern();
    return p;
  }

  function istFavorit(id) {
    return stand.favoriten.indexOf(id) > -1;
  }

  function toggleFavorit(id) {
    var i = stand.favoriten.indexOf(id);
    if (i > -1) stand.favoriten.splice(i, 1);
    else stand.favoriten.push(id);
    speichern();
    return istFavorit(id);
  }

  function setzeFavorit(id, wert) {
    if (wert && !istFavorit(id)) { stand.favoriten.push(id); speichern(); }
    if (!wert && istFavorit(id)) { toggleFavorit(id); }
  }

  function setzeEigenesBeispiel(id, text) {
    var p = stand.fortschritt[id] || leererFortschritt();
    p.beispiele = Array.isArray(p.beispiele) ? p.beispiele : [];
    p.beispiele.push(text);
    stand.fortschritt[id] = p;
    speichern();
    return p;
  }

  function loescheEigenesBeispiel(id, index) {
    var p = stand.fortschritt[id];
    if (!p || !Array.isArray(p.beispiele)) return;
    p.beispiele.splice(index, 1);
    speichern();
  }

  function eigenesWortHinzufuegen(daten) {
    var id = 'eigen-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    var wort = {
      id: id,
      wort: daten.wort,
      wortart: daten.wortart,
      bedeutung: daten.bedeutung,
      beispiele: daten.beispiele,
      luecke: daten.luecke,
      synonyme: daten.synonyme,
      register: daten.register,
      niveau: daten.niveau,
      kategorie: daten.kategorie,
      situation: daten.situation,
      hinweis: daten.hinweis || '',
      eigen: true
    };
    stand.eigene.push(wort);
    speichern();
    return wort;
  }

  function eigenesWortLoeschen(id) {
    stand.eigene = stand.eigene.filter(function (w) { return w.id !== id; });
    delete stand.fortschritt[id];
    var i = stand.favoriten.indexOf(id);
    if (i > -1) stand.favoriten.splice(i, 1);
    stand.verlauf = stand.verlauf.filter(function (v) { return v.id !== id; });
    speichern();
  }

  function logQuiz(richtig, typ) {
    stand.quiz.gesamt += 1;
    if (richtig) stand.quiz.richtig += 1;
    stand.quiz.proTyp[typ] = stand.quiz.proTyp[typ] || { richtig: 0, gesamt: 0 };
    stand.quiz.proTyp[typ].gesamt += 1;
    if (richtig) stand.quiz.proTyp[typ].richtig += 1;
    logPlus('quiz');
    logPlus(richtig ? 'richtig' : 'falsch');
    speichern();
  }

  function logAktiv(richtig) {
    logPlus('aktiv');
    if (richtig) logPlus('aktivRichtig');
    speichern();
  }

  function tagesStats(datum) {
    var e = stand.log[datum || heute()];
    return e ? e : { gesehen: 0, gewusst: 0, unsicher: 0, quiz: 0, richtig: 0, falsch: 0, aktiv: 0, aktivRichtig: 0 };
  }

  function serie() {
    var tag = new Date();
    // Heute zählt nur, wenn es Aktivität gab; sonst ab gestern zählen.
    var eintragHeute = stand.log[alsDatum(tag)];
    if (!eintragHeute || (eintragHeute.gesehen + eintragHeute.quiz + eintragHeute.aktiv) === 0) {
      tag.setDate(tag.getDate() - 1);
    }
    var anzahl = 0;
    for (var i = 0; i < 500; i++) {
      var e = stand.log[alsDatum(tag)];
      if (!e || (e.gesehen + e.quiz + e.aktiv) === 0) break;
      anzahl += 1;
      tag.setDate(tag.getDate() - 1);
    }
    return anzahl;
  }

  function exportStand() {
    return stand;
  }

  function resetFortschritt() {
    stand.fortschritt = {};
    stand.log = {};
    stand.verlauf = [];
    stand.quiz = { richtig: 0, gesamt: 0, proTyp: {} };
    speichern();
  }

  function einstellungen() {
    return stand.einstellungen;
  }

  function setzeEinstellung(schluessel, wert) {
    if (schluessel === 'ziel') {
      wert = [6, 12, 18, 24].indexOf(Number(wert)) > -1 ? Number(wert) : 12;
    }
    if (schluessel === 'theme') {
      wert = wert === 'dunkel' || wert === 'hell' ? wert : null;
    }
    stand.einstellungen[schluessel] = wert;
    speichern();
  }

  global.WSSTORE = {
    SCHLUESSEL: SCHLUESSEL,
    INTERVALLE: INTERVALLE,
    heute: heute,
    plusTage: plusTage,
    fortschritt: fortschritt,
    antwort: antwort,
    setzeBekannt: setzeBekannt,
    istFavorit: istFavorit,
    setzeFavorit: setzeFavorit,
    toggleFavorit: toggleFavorit,
    setzeEigenesBeispiel: setzeEigenesBeispiel,
    loescheEigenesBeispiel: loescheEigenesBeispiel,
    eigeneWoerter: function () { return stand.eigene.slice(); },
    eigenesWortHinzufuegen: eigenesWortHinzufuegen,
    eigenesWortLoeschen: eigenesWortLoeschen,
    logQuiz: logQuiz,
    logAktiv: logAktiv,
    tagesStats: tagesStats,
    serie: serie,
    verlauf: function () { return stand.verlauf.slice().reverse(); },
    favoriten: function () { return stand.favoriten.slice(); },
    fortschrittAlle: function () { return stand.fortschritt; },
    quizStand: function () { return stand.quiz; },
    einstellungen: einstellungen,
    setzeEinstellung: setzeEinstellung,
    resetFortschritt: resetFortschritt,
    exportStand: exportStand,
    speichern: speichern
  };
})(typeof window !== 'undefined' ? window : globalThis);
