/** UI strings of the Inspector capsule (EN default, FR parallel; hosts may override any key). */

export type InspectorLocale = "en" | "fr";

export interface InspectorStrings {
  title: string;
  noChains: string;
  noChainsHint: string;
  chains: string;
  searchChains: string;
  filters: string;
  groupBy: string;
  none: string;
  score: string;
  dataset: string;
  allDatasets: string;
  colorBy: string;
  compare: string;
  compareHint: string;
  compareAuto: string;
  compareSelected: string;
  addToCompare: string;
  removeFromCompare: string;
  clearCompare: string;
  views: string;
  shortcuts: string;
  details: string;
  selection: string;
  selectedChains: (n: number, total: number) => string;
  noSelection: string;
  noSelectionHint: string;
  clear: string;
  invert: string;
  selectAll: string;
  best: string;
  rank: string;
  folds: string;
  scoredOnly: string;
  resetFilters: string;
  chain: string;
  steps: string;
  params: string;
  allScores: string;
  open: string;
  openInPlayground: string;
  copyId: string;
  diffWith: (label: string) => string;
  onlyIn: (label: string) => string;
  samples: string;
  sampleSelection: (n: number) => string;
  loadingPredictions: string;
  needsPredictions: string;
  needsRegression: string;
  needsClassification: string;
  needsFolds: string;
  needsParams: string;
  needsTwoRefs: string;
  needsSteps: string;
  viewLandscape: string;
  viewHeatmap: string;
  viewGeneralization: string;
  viewParity: string;
  viewResiduals: string;
  viewFolds: string;
  viewHyperparams: string;
  viewEffects: string;
  viewConfusion: string;
  viewSamples: string;
  viewTable: string;
  descLandscape: string;
  descHeatmap: string;
  descGeneralization: string;
  descParity: string;
  descResiduals: string;
  descFolds: string;
  descHyperparams: string;
  descEffects: string;
  descConfusion: string;
  descSamples: string;
  descTable: string;
  rows: string;
  columns: string;
  aggregate: string;
  colorPoints: string;
  byChain: string;
  byPartition: string;
  byFold: string;
  partition: string;
  all: string;
  parameter: string;
  logScale: string;
  normalize: string;
  overfitting: string;
}

export const INSPECTOR_STRINGS_EN: InspectorStrings = {
  title: "Inspector",
  noChains: "No trained chains",
  noChainsHint: "Run pipelines (or load a result source) to inspect their chains and predictions.",
  chains: "Chains",
  searchChains: "Search model, step, dataset, run…",
  filters: "Filters",
  groupBy: "Group",
  none: "None",
  score: "Score",
  dataset: "Dataset",
  allDatasets: "All (mixed scales)",
  colorBy: "Color",
  compare: "Compare",
  compareHint: "Star chains (☆) to compare their predictions side by side.",
  compareAuto: "auto · best",
  compareSelected: "Compare selected",
  addToCompare: "Add to comparison",
  removeFromCompare: "Remove from comparison",
  clearCompare: "Clear comparison",
  views: "Views",
  shortcuts: "Shortcuts",
  details: "Details",
  selection: "Selection",
  selectedChains: (n, total) => `${n} of ${total} chains`,
  noSelection: "No chain selected",
  noSelectionHint: "Click a chain in the list or any chart; drag a box or lasso to select many. Shift adds · Alt removes · Ctrl toggles.",
  clear: "Clear",
  invert: "Invert",
  selectAll: "Select all",
  best: "Best",
  rank: "#",
  folds: "folds",
  scoredOnly: "Scored only",
  resetFilters: "Reset filters",
  chain: "Chain",
  steps: "Steps",
  params: "Hyper-parameters",
  allScores: "All scores",
  open: "Open",
  openInPlayground: "Open in Playground",
  copyId: "Copy id",
  diffWith: (label) => `Differences vs ${label}`,
  onlyIn: (label) => `only in ${label}`,
  samples: "Samples",
  sampleSelection: (n) => `${n} sample${n === 1 ? "" : "s"} selected`,
  loadingPredictions: "Loading predictions…",
  needsPredictions: "No predictions available for the compared chains.",
  needsRegression: "Needs a regression chain in the comparison.",
  needsClassification: "Needs a classification chain in the comparison.",
  needsFolds: "The compared chains have no per-fold scores for this reference.",
  needsParams: "No hyper-parameter varies across these chains.",
  needsTwoRefs: "Needs at least two score references (e.g. validation and test).",
  needsSteps: "Needs scored chains with steps.",
  viewLandscape: "Score landscape",
  viewHeatmap: "Pivot heatmap",
  viewGeneralization: "Generalization",
  viewParity: "Predicted vs observed",
  viewResiduals: "Residuals",
  viewFolds: "Fold stability",
  viewHyperparams: "Hyper-parameters",
  viewEffects: "Step effects",
  viewConfusion: "Confusion matrix",
  viewSamples: "Hard samples",
  viewTable: "Leaderboard",
  descLandscape: "Every chain's score, grouped — spot the winning families",
  descHeatmap: "Best / median score of two factors crossed",
  descGeneralization: "Validation vs test score per chain (overfitting)",
  descParity: "Per-sample predictions of the compared chains",
  descResiduals: "Residual structure, bias and spread",
  descFolds: "Per-fold scores of the compared chains",
  descHyperparams: "Score as a function of one hyper-parameter",
  descEffects: "Influence of each step across all chains",
  descConfusion: "Class confusions of a compared classifier",
  descSamples: "Samples all compared models get wrong",
  descTable: "Sortable table of every chain and score",
  rows: "Rows",
  columns: "Columns",
  aggregate: "Aggregate",
  colorPoints: "Points",
  byChain: "Chain",
  byPartition: "Partition",
  byFold: "Fold",
  partition: "Partition",
  all: "All",
  parameter: "Parameter",
  logScale: "Log scale",
  normalize: "Normalize rows",
  overfitting: "Above the diagonal: test worse than validation",
};

export const INSPECTOR_STRINGS_FR: InspectorStrings = {
  ...INSPECTOR_STRINGS_EN,
  title: "Inspector",
  noChains: "Aucune chaîne entraînée",
  noChainsHint: "Lancez des pipelines (ou chargez une source de résultats) pour inspecter leurs chaînes et prédictions.",
  chains: "Chaînes",
  searchChains: "Rechercher modèle, étape, jeu, run…",
  filters: "Filtres",
  groupBy: "Grouper",
  none: "Aucun",
  score: "Score",
  dataset: "Jeu",
  allDatasets: "Tous (échelles mêlées)",
  colorBy: "Couleur",
  compare: "Comparer",
  compareHint: "Marquez des chaînes (☆) pour comparer leurs prédictions côte à côte.",
  compareAuto: "auto · meilleure",
  compareSelected: "Comparer la sélection",
  addToCompare: "Ajouter à la comparaison",
  removeFromCompare: "Retirer de la comparaison",
  clearCompare: "Vider la comparaison",
  views: "Vues",
  shortcuts: "Raccourcis",
  details: "Détails",
  selection: "Sélection",
  selectedChains: (n, total) => `${n} sur ${total} chaînes`,
  noSelection: "Aucune chaîne sélectionnée",
  noSelectionHint: "Cliquez une chaîne dans la liste ou un graphique ; tracez un cadre ou un lasso pour en sélectionner plusieurs. Maj ajoute · Alt retire · Ctrl inverse.",
  clear: "Effacer",
  invert: "Inverser",
  selectAll: "Tout sélectionner",
  best: "Meilleure",
  folds: "folds",
  scoredOnly: "Scorées seulement",
  resetFilters: "Réinitialiser",
  chain: "Chaîne",
  steps: "Étapes",
  params: "Hyper-paramètres",
  allScores: "Tous les scores",
  open: "Ouvrir",
  openInPlayground: "Ouvrir dans le Playground",
  copyId: "Copier l'id",
  diffWith: (label) => `Différences avec ${label}`,
  onlyIn: (label) => `seulement dans ${label}`,
  samples: "Échantillons",
  sampleSelection: (n) => `${n} échantillon${n > 1 ? "s" : ""} sélectionné${n > 1 ? "s" : ""}`,
  loadingPredictions: "Chargement des prédictions…",
  needsPredictions: "Aucune prédiction disponible pour les chaînes comparées.",
  needsRegression: "Nécessite une chaîne de régression dans la comparaison.",
  needsClassification: "Nécessite une chaîne de classification dans la comparaison.",
  needsFolds: "Les chaînes comparées n'ont pas de scores par fold pour cette référence.",
  needsParams: "Aucun hyper-paramètre ne varie entre ces chaînes.",
  needsTwoRefs: "Nécessite au moins deux références de score (ex. validation et test).",
  needsSteps: "Nécessite des chaînes scorées avec leurs étapes.",
  viewLandscape: "Paysage des scores",
  viewHeatmap: "Carte croisée",
  viewGeneralization: "Généralisation",
  viewParity: "Prédit vs observé",
  viewResiduals: "Résidus",
  viewFolds: "Stabilité par fold",
  viewHyperparams: "Hyper-paramètres",
  viewEffects: "Effets des étapes",
  viewConfusion: "Matrice de confusion",
  viewSamples: "Échantillons difficiles",
  viewTable: "Classement",
  descLandscape: "Le score de chaque chaîne, groupé — repérez les familles gagnantes",
  descHeatmap: "Meilleur / médian score de deux facteurs croisés",
  descGeneralization: "Score validation vs test par chaîne (sur-apprentissage)",
  descParity: "Prédictions par échantillon des chaînes comparées",
  descResiduals: "Structure, biais et dispersion des résidus",
  descFolds: "Scores par fold des chaînes comparées",
  descHyperparams: "Score en fonction d'un hyper-paramètre",
  descEffects: "Influence de chaque étape sur l'ensemble des chaînes",
  descConfusion: "Confusions de classes d'un classifieur comparé",
  descSamples: "Échantillons mal prédits par tous les modèles comparés",
  descTable: "Table triable de toutes les chaînes et scores",
  rows: "Lignes",
  columns: "Colonnes",
  aggregate: "Agrégat",
  colorPoints: "Points",
  byChain: "Chaîne",
  byPartition: "Partition",
  byFold: "Fold",
  partition: "Partition",
  all: "Tout",
  parameter: "Paramètre",
  logScale: "Échelle log",
  normalize: "Normaliser les lignes",
  overfitting: "Au-dessus de la diagonale : test moins bon que validation",
};

export function resolveInspectorStrings(locale: InspectorLocale = "en", overrides?: Partial<InspectorStrings>): InspectorStrings {
  const base = locale === "fr" ? INSPECTOR_STRINGS_FR : INSPECTOR_STRINGS_EN;
  return overrides ? { ...base, ...overrides } : base;
}
