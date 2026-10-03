'use strict';

// Hunspell reads dictionary-ro@3.0.0 as published (a prefix and a suffix
// may share a flag there, which the old nspell engine needed converting).
// What stays: accept legacy cedillas and decomposed accents without editing
// the text or stripping meaningful diacritics. Suggestions use standard
// spelling.
function normalizeRomanianWord(word) {
  return word.normalize('NFC').replace(/[şţŞŢ]/g, (c) =>
    ({ 'ş': 'ș', 'ţ': 'ț', 'Ş': 'Ș', 'Ţ': 'Ț' })[c]);
}

module.exports = { normalizeRomanianWord };
