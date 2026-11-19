(async () => {
  const $ = (id) => document.getElementById(id);
  const CHECKBOXES = ['autoChart', 'listingBadges', 'listingRecord', 'notify'];
  const SELECTS = ['chartRangeDays', 'checkIntervalHours'];

  const settings = await PC.getSettings();
  for (const id of CHECKBOXES) {
    $(id).checked = !!settings[id];
    $(id).addEventListener('change', () => PC.saveSettings({ [id]: $(id).checked }));
  }
  for (const id of SELECTS) {
    $(id).value = String(settings[id]);
    $(id).addEventListener('change', () => PC.saveSettings({ [id]: Number($(id).value) }));
  }

  async function renderStats() {
    const all = await chrome.storage.local.get(null);
    const hist = Object.entries(all).filter(([k]) => k.startsWith('h|'));
    const points = hist.reduce((n, [, v]) => n + ((v && v.points && v.points.length) || 0), 0);
    const watched = Object.keys(all.watch || {}).length;
    $('data-stats').textContent = `${hist.length} Produkte mit ${points} Preispunkten gespeichert · ${watched} auf der Merkliste.`;
  }

  const msg = (t) => {
    $('data-msg').textContent = t;
  };

  $('export').addEventListener('click', async () => {
    const data = await PC.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `preischeck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg('Export erstellt.');
  });

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = await PC.importAll(JSON.parse(await file.text()));
      msg(`Import erfolgreich: ${n} Produktverläufe übernommen.`);
      await renderStats();
    } catch (err) {
      msg(`Import fehlgeschlagen: ${err.message}`);
    }
    e.target.value = '';
  });

  $('clear').addEventListener('click', async () => {
    if (!confirm('Wirklich alle gespeicherten Preise, die Merkliste und Einstellungen löschen?')) return;
    await chrome.storage.local.clear();
    msg('Alle Daten gelöscht.');
    await renderStats();
  });

  await renderStats();
})();
