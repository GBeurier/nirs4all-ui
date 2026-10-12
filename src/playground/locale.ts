/** UI strings of the Playground capsule (EN default, FR parallel; hosts may override any key). */

export type PlaygroundLocale = "en" | "fr";

export interface PlaygroundStrings {
  title: string;
  noDataset: string;
  noDatasetHint: string;
  pipeline: string;
  addStep: string;
  searchOperators: string;
  noOperatorMatch: string;
  rawData: string;
  rawDataHint: string;
  emptyPipeline: string;
  emptyPipelineHint: string;
  previewHere: string;
  previewAll: string;
  previewing: (step: string) => string;
  notApplied: string;
  enable: string;
  disable: string;
  remove: string;
  duplicate: string;
  moveUp: string;
  moveDown: string;
  advanced: string;
  undo: string;
  redo: string;
  clearPipeline: string;
  openInEditor: string;
  exportPipeline: string;
  changeDataset: string;
  samples: string;
  wavelengths: string;
  target: string;
  colorBy: string;
  none: string;
  scope: string;
  scopeAll: string;
  scopeSelection: string;
  views: string;
  layout: string;
  shortcuts: string;
  details: string;
  running: string;
  ready: string;
  failed: string;
  stale: string;
  selection: string;
  selected: (n: number, total: number) => string;
  noSelection: string;
  noSelectionHint: string;
  clear: string;
  invert: string;
  selectAll: string;
  save: string;
  keepOnly: string;
  exclude: string;
  exportIds: string;
  savedSelections: string;
  savedEmpty: string;
  apply: string;
  sample: string;
  meanSpectrum: string;
  rest: string;
  viewSpectra: string;
  viewScores: string;
  viewTarget: string;
  viewOutliers: string;
  viewLoadings: string;
  viewCorrelation: string;
  viewFolds: string;
  viewRepetitions: string;
  viewSamples: string;
  descSpectra: string;
  descScores: string;
  descTarget: string;
  descOutliers: string;
  descLoadings: string;
  descCorrelation: string;
  descFolds: string;
  descRepetitions: string;
  descSamples: string;
  modeLines: string;
  modeBands: string;
  modeDensity: string;
  bandMeanStd: string;
  bandQuantiles: string;
  compare: string;
  compareOff: string;
  compareSplit: string;
  compareOverlay: string;
  compareDiff: string;
  input: string;
  output: string;
  needsProjection: string;
  needsOutliers: string;
  needsLoadings: string;
  needsTarget: string;
  needsNumericTarget: string;
  needsFolds: string;
  needsRepetitions: string;
  cropTo: (from: string, to: string) => string;
  addCrop: string;
  axisX: string;
  axisY: string;
  component: string;
  ellipse: string;
  explained: string;
  limits: string;
  warnings: string;
  dimensions: (n: number, p: number) => string;
  stepShape: (n: number, p: number) => string;
  removedRows: (n: number) => string;
  taggedRows: (n: number) => string;
  hiddenBySelection: string;
  differenceUnavailable: string;
  viewVariance: string;
  viewGroupMeans: string;
  viewHeatmap: string;
  descVariance: string;
  descGroupMeans: string;
  descHeatmap: string;
  bandMinMax: string;
  absoluteDiff: string;
  ghostStyle: string;
  ghostEnvelope: string;
  ghostLines: string;
  curves: string;
  drawn: string;
  all: string;
  samplingRandom: string;
  samplingStratified: string;
  samplingCoverage: string;
  reshuffle: string;
  selectedOnly: string;
  lineWidth: string;
  lineOpacity: string;
  auto: string;
  statistics: string;
  statMean: string;
  statMedian: string;
  statStd: string;
  statMinMax: string;
  bandStatistic: string;
  wavelengthWindow: string;
  fullRange: string;
  invertAxis: string;
  view3d: string;
  axisZ: string;
  pointSize: string;
  sizeSmall: string;
  sizeMedium: string;
  sizeLarge: string;
  equalScale: string;
  showMean: string;
  showMedian: string;
  bins: string;
  logScale: string;
  groupBy: string;
  metric: string;
  reference: string;
  display: string;
  strip: string;
  histogram: string;
  sortBy: string;
  quantiles: string;
  threshold: string;
  thresholdHost: string;
  thresholdManual: string;
  thresholdOff: string;
  ranges: string;
  flaggedOnly: string;
  needsGroupColumn: string;
  centered: string;
  showBands: string;
  compareInput: string;
  selectionProfile: string;
  variability: string;
}

export const PLAYGROUND_STRINGS_EN: PlaygroundStrings = {
  title: "Playground",
  noDataset: "No dataset loaded",
  noDatasetHint: "Pick a dataset to explore its spectra and try operator chains live.",
  pipeline: "Pipeline",
  addStep: "Add step",
  searchOperators: "Search operators… (↑↓ Enter)",
  noOperatorMatch: "No operator matches.",
  rawData: "Raw data",
  rawDataHint: "Input spectra, before any step",
  emptyPipeline: "Start a chain",
  emptyPipelineHint: "Add preprocessing, filters, splitters or augmentations — every view updates live.",
  previewHere: "Preview up to this step",
  previewAll: "Preview the whole chain",
  previewing: (step) => `Previewing up to ${step}`,
  notApplied: "not in preview",
  enable: "Enable step",
  disable: "Disable step",
  remove: "Remove step",
  duplicate: "Duplicate step",
  moveUp: "Move up",
  moveDown: "Move down",
  advanced: "Advanced",
  undo: "Undo",
  redo: "Redo",
  clearPipeline: "Clear pipeline",
  openInEditor: "Open in editor",
  exportPipeline: "Export",
  changeDataset: "Change",
  samples: "samples",
  wavelengths: "wavelengths",
  target: "Target",
  colorBy: "Color",
  none: "None",
  scope: "Show",
  scopeAll: "All",
  scopeSelection: "Selection",
  views: "Views",
  layout: "Layout",
  shortcuts: "Shortcuts",
  details: "Details",
  running: "Running",
  ready: "Ready",
  failed: "Failed",
  stale: "Showing previous result",
  selection: "Selection",
  selected: (n, total) => `${n.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} samples`,
  noSelection: "Nothing selected",
  noSelectionHint: "Click a curve or a point, drag a box, or use the lasso. Shift adds · Alt removes · Ctrl toggles.",
  clear: "Clear",
  invert: "Invert",
  selectAll: "Select all",
  save: "Save",
  keepOnly: "Keep only",
  exclude: "Exclude",
  exportIds: "Export ids",
  savedSelections: "Saved selections",
  savedEmpty: "Save a selection to compare groups later.",
  apply: "Apply",
  sample: "Sample",
  meanSpectrum: "Mean spectrum",
  rest: "rest",
  viewSpectra: "Spectra",
  viewScores: "Scores",
  viewTarget: "Target",
  viewOutliers: "Outlier map",
  viewLoadings: "Loadings",
  viewCorrelation: "Correlation r(λ)",
  viewFolds: "Splits & folds",
  viewRepetitions: "Replicates",
  viewSamples: "Samples",
  descSpectra: "All curves, envelopes or density · compare input/output",
  descScores: "PCA / UMAP projection with confidence ellipse",
  descTarget: "Target distribution linked to the selection",
  descOutliers: "Hotelling T² vs Q residuals with limits",
  descLoadings: "Component loadings over wavelengths",
  descCorrelation: "Correlation of each wavelength with the target",
  descFolds: "Fold composition and target balance",
  descRepetitions: "Spread of biological replicates",
  descSamples: "Searchable, sortable sample table",
  modeLines: "Lines",
  modeBands: "Bands",
  modeDensity: "Density",
  bandMeanStd: "Mean ± σ / 2σ",
  bandQuantiles: "Median · IQR · 5–95 %",
  compare: "Compare",
  compareOff: "Off",
  compareSplit: "Split",
  compareOverlay: "Ghost",
  compareDiff: "Diff",
  input: "Input",
  output: "Output",
  needsProjection: "The host did not return a projection for this pipeline.",
  needsOutliers: "The host did not return T² / Q diagnostics.",
  needsLoadings: "The host did not return loadings.",
  needsTarget: "The dataset has no target.",
  needsNumericTarget: "Correlation needs a numeric target.",
  needsFolds: "Add a splitter step to see folds.",
  needsRepetitions: "No replicate column, or the host returned no replicate distances.",
  cropTo: (from, to) => `Crop to ${from}–${to}`,
  addCrop: "Add crop step",
  axisX: "X",
  axisY: "Y",
  component: "PC",
  ellipse: "95 % ellipse",
  explained: "explained",
  limits: "Limits",
  warnings: "Warnings",
  dimensions: (n, p) => `${n.toLocaleString("en-US")} × ${p.toLocaleString("en-US")}`,
  stepShape: (n, p) => `${n}×${p}`,
  removedRows: (n) => `−${n} removed`,
  taggedRows: (n) => `${n} flagged`,
  hiddenBySelection: "Scope: selection only",
  differenceUnavailable: "Diff needs the same samples and wavelengths in input and output.",
  viewVariance: "Variability",
  viewGroupMeans: "Group means",
  viewHeatmap: "Heat map",
  descVariance: "Per-wavelength σ, CV or SNR · input vs output",
  descGroupMeans: "Mean spectrum ± σ of each color group",
  descHeatmap: "Samples × wavelengths raster, sorted",
  bandMinMax: "Min–max",
  absoluteDiff: "Absolute difference",
  ghostStyle: "Input drawn as",
  ghostEnvelope: "Envelope",
  ghostLines: "Curves",
  curves: "Curves",
  drawn: "Drawn",
  all: "All",
  samplingRandom: "Random",
  samplingStratified: "Stratified by target",
  samplingCoverage: "Max. coverage",
  reshuffle: "Reshuffle",
  selectedOnly: "Selected samples only",
  lineWidth: "Width",
  lineOpacity: "Opacity",
  auto: "Auto",
  statistics: "Statistics overlay",
  statMean: "Mean",
  statMedian: "Median",
  statStd: "± σ",
  statMinMax: "Min / max",
  bandStatistic: "Band statistic",
  wavelengthWindow: "Wavelength window",
  fullRange: "Full",
  invertAxis: "Reverse x axis",
  view3d: "3D",
  axisZ: "Z",
  pointSize: "Point size",
  sizeSmall: "S",
  sizeMedium: "M",
  sizeLarge: "L",
  equalScale: "Same scale on all axes",
  showMean: "Mean line",
  showMedian: "Median line",
  bins: "Bins (0 = auto)",
  logScale: "Log scale",
  groupBy: "Replicate column",
  metric: "Distance",
  reference: "Reference",
  display: "Display",
  strip: "Strip",
  histogram: "Histogram",
  sortBy: "Sort",
  quantiles: "Quantile lines",
  threshold: "Threshold",
  thresholdHost: "Host",
  thresholdManual: "Manual",
  thresholdOff: "None",
  ranges: "Group range bars",
  flaggedOnly: "Flagged groups only",
  needsGroupColumn: "Pick a replicate column in this view's options.",
  centered: "Subtract mean spectrum",
  showBands: "± σ envelopes",
  compareInput: "Show input",
  selectionProfile: "Show selection",
  variability: "Statistic",
};

export const PLAYGROUND_STRINGS_FR: PlaygroundStrings = {
  ...PLAYGROUND_STRINGS_EN,
  title: "Playground",
  noDataset: "Aucun jeu de données",
  noDatasetHint: "Choisissez un jeu de données pour explorer ses spectres et tester des chaînes d'opérateurs en direct.",
  pipeline: "Pipeline",
  addStep: "Ajouter une étape",
  searchOperators: "Rechercher un opérateur… (↑↓ Entrée)",
  noOperatorMatch: "Aucun opérateur ne correspond.",
  rawData: "Données brutes",
  rawDataHint: "Spectres d'entrée, avant toute étape",
  emptyPipeline: "Commencer une chaîne",
  emptyPipelineHint: "Ajoutez prétraitements, filtres, découpages ou augmentations — toutes les vues se mettent à jour en direct.",
  previewHere: "Prévisualiser jusqu'à cette étape",
  previewAll: "Prévisualiser toute la chaîne",
  previewing: (step) => `Aperçu jusqu'à ${step}`,
  notApplied: "hors aperçu",
  enable: "Activer l'étape",
  disable: "Désactiver l'étape",
  remove: "Supprimer l'étape",
  duplicate: "Dupliquer l'étape",
  moveUp: "Monter",
  moveDown: "Descendre",
  advanced: "Avancé",
  undo: "Annuler",
  redo: "Rétablir",
  clearPipeline: "Vider le pipeline",
  openInEditor: "Ouvrir dans l'éditeur",
  exportPipeline: "Exporter",
  changeDataset: "Changer",
  samples: "échantillons",
  wavelengths: "longueurs d'onde",
  target: "Cible",
  colorBy: "Couleur",
  none: "Aucune",
  scope: "Afficher",
  scopeAll: "Tout",
  scopeSelection: "Sélection",
  views: "Vues",
  layout: "Disposition",
  shortcuts: "Raccourcis",
  details: "Détails",
  running: "Calcul",
  ready: "Prêt",
  failed: "Échec",
  stale: "Résultat précédent affiché",
  selection: "Sélection",
  selected: (n, total) => `${n.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")} échantillons`,
  noSelection: "Aucune sélection",
  noSelectionHint: "Cliquez une courbe ou un point, tracez un cadre ou utilisez le lasso. Maj ajoute · Alt retire · Ctrl inverse.",
  clear: "Effacer",
  invert: "Inverser",
  selectAll: "Tout sélectionner",
  save: "Enregistrer",
  keepOnly: "Garder",
  exclude: "Exclure",
  exportIds: "Exporter les ids",
  savedSelections: "Sélections enregistrées",
  savedEmpty: "Enregistrez une sélection pour comparer des groupes plus tard.",
  apply: "Appliquer",
  sample: "Échantillon",
  meanSpectrum: "Spectre moyen",
  rest: "reste",
  viewSpectra: "Spectres",
  viewScores: "Scores",
  viewTarget: "Cible",
  viewOutliers: "Carte des atypiques",
  viewLoadings: "Loadings",
  viewCorrelation: "Corrélation r(λ)",
  viewFolds: "Découpages & folds",
  viewRepetitions: "Répétitions",
  viewSamples: "Échantillons",
  descSpectra: "Courbes, enveloppes ou densité · comparer entrée/sortie",
  descScores: "Projection ACP / UMAP avec ellipse de confiance",
  descTarget: "Distribution de la cible liée à la sélection",
  descOutliers: "T² de Hotelling vs résidus Q avec limites",
  descLoadings: "Loadings des composantes sur les longueurs d'onde",
  descCorrelation: "Corrélation de chaque longueur d'onde avec la cible",
  descFolds: "Composition des folds et équilibre de la cible",
  descRepetitions: "Dispersion des répétitions biologiques",
  descSamples: "Table d'échantillons triable et filtrable",
  modeLines: "Courbes",
  modeBands: "Bandes",
  modeDensity: "Densité",
  compare: "Comparer",
  compareOff: "Non",
  compareSplit: "Scindé",
  compareOverlay: "Fantôme",
  compareDiff: "Écart",
  input: "Entrée",
  output: "Sortie",
  needsProjection: "L'hôte n'a pas renvoyé de projection pour ce pipeline.",
  needsOutliers: "L'hôte n'a pas renvoyé les diagnostics T² / Q.",
  needsLoadings: "L'hôte n'a pas renvoyé de loadings.",
  needsTarget: "Le jeu de données n'a pas de cible.",
  needsNumericTarget: "La corrélation nécessite une cible numérique.",
  needsFolds: "Ajoutez une étape de découpage pour voir les folds.",
  needsRepetitions: "Pas de colonne de répétitions, ou pas de distances renvoyées par l'hôte.",
  cropTo: (from, to) => `Rogner à ${from}–${to}`,
  addCrop: "Ajouter une étape de rognage",
  ellipse: "ellipse 95 %",
  explained: "expliquée",
  limits: "Limites",
  warnings: "Avertissements",
  dimensions: (n, p) => `${n.toLocaleString("fr-FR")} × ${p.toLocaleString("fr-FR")}`,
  removedRows: (n) => `−${n} retirés`,
  taggedRows: (n) => `${n} signalés`,
  hiddenBySelection: "Portée : sélection seule",
  differenceUnavailable: "L'écart nécessite les mêmes échantillons et longueurs d'onde en entrée et en sortie.",
  viewVariance: "Variabilité",
  viewGroupMeans: "Moyennes par groupe",
  viewHeatmap: "Carte de chaleur",
  descVariance: "σ, CV ou SNR par longueur d'onde · entrée vs sortie",
  descGroupMeans: "Spectre moyen ± σ de chaque groupe de couleur",
  descHeatmap: "Matrice échantillons × longueurs d'onde, triée",
  bandMinMax: "Min–max",
  absoluteDiff: "Écart absolu",
  ghostStyle: "Entrée dessinée en",
  ghostEnvelope: "Enveloppe",
  ghostLines: "Courbes",
  curves: "Courbes",
  drawn: "Affichées",
  all: "Toutes",
  samplingRandom: "Aléatoire",
  samplingStratified: "Stratifié sur la cible",
  samplingCoverage: "Couverture max.",
  reshuffle: "Retirer au sort",
  selectedOnly: "Échantillons sélectionnés seuls",
  lineWidth: "Épaisseur",
  lineOpacity: "Opacité",
  auto: "Auto",
  statistics: "Statistiques superposées",
  statMean: "Moyenne",
  statMedian: "Médiane",
  statStd: "± σ",
  statMinMax: "Min / max",
  bandStatistic: "Statistique des bandes",
  wavelengthWindow: "Fenêtre spectrale",
  fullRange: "Complète",
  invertAxis: "Inverser l'axe x",
  view3d: "3D",
  axisZ: "Z",
  pointSize: "Taille des points",
  sizeSmall: "P",
  sizeMedium: "M",
  sizeLarge: "G",
  equalScale: "Même échelle sur tous les axes",
  showMean: "Ligne de moyenne",
  showMedian: "Ligne de médiane",
  bins: "Classes (0 = auto)",
  logScale: "Échelle log",
  groupBy: "Colonne de répétitions",
  metric: "Distance",
  reference: "Référence",
  display: "Affichage",
  strip: "Points",
  histogram: "Histogramme",
  sortBy: "Tri",
  quantiles: "Lignes de quantiles",
  threshold: "Seuil",
  thresholdHost: "Hôte",
  thresholdManual: "Manuel",
  thresholdOff: "Aucun",
  ranges: "Barres d'étendue par groupe",
  flaggedOnly: "Groupes signalés seuls",
  needsGroupColumn: "Choisissez une colonne de répétitions dans les options de la vue.",
  centered: "Soustraire le spectre moyen",
  showBands: "Enveloppes ± σ",
  compareInput: "Afficher l'entrée",
  selectionProfile: "Afficher la sélection",
  variability: "Statistique",
};

export function resolvePlaygroundStrings(locale: PlaygroundLocale = "en", overrides?: Partial<PlaygroundStrings>): PlaygroundStrings {
  const base = locale === "fr" ? PLAYGROUND_STRINGS_FR : PLAYGROUND_STRINGS_EN;
  return overrides ? { ...base, ...overrides } : base;
}
