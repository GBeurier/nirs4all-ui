/** UI strings of the Inspector capsule (EN default, FR parallel; hosts may override any key). */

import { formatPercent, formatValue } from "../workbench/format.js";
import type { Insight } from "./insights.js";

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
  perspectiveOverview: string;
  perspectiveLandscape: string;
  perspectiveSteps: string;
  perspectivePredictions: string;
  perspectiveTuning: string;
  perspectiveCompare: string;
  perspectives: string;
  groupRanking: string;
  groupSteps: string;
  groupTuning: string;
  groupPredictions: string;
  viewOverview: string;
  viewTop: string;
  viewPareto: string;
  viewCompare: string;
  viewDatasets: string;
  viewFlow: string;
  viewOrder: string;
  viewAgreement: string;
  descOverview: string;
  descTop: string;
  descPareto: string;
  descCompare: string;
  descDatasets: string;
  descFlow: string;
  descOrder: string;
  descAgreement: string;
  bestChain: string;
  runnerUp: string;
  foldSpread: string;
  /** `n` = chains other than the best within one standard error. */
  tiedWithBest: (n: number) => string;
  tieRule: string;
  drivers: string;
  driversHint: string;
  findings: string;
  insightText: (insight: Insight) => string;
  topCount: string;
  tieZone: string;
  foldRange: string;
  paretoFront: string;
  fitTime: string;
  needsFitTime: string;
  needsCompare: string;
  reference: string;
  needsDatasets: string;
  meanRank: string;
  wins: string;
  showDataset: string;
  lens: string;
  lensRaw: string;
  lensRank: string;
  lensZ: string;
  sortBy: string;
  byDelta: string;
  byMedian: string;
  byCoverage: string;
  selectWith: (label: string, n: number) => string;
  bestAfter: string;
  bestBefore: string;
  notEnough: string;
  flowStyle: string;
  orbit: string;
  hub: string;
  depth: string;
  positionMode: string;
  phase: string;
  absolute: string;
  adjacentOnly: string;
  effectByPosition: string;
  effectByOrder: string;
  plotLayout: string;
  overlay: string;
  split: string;
  xAxis: string;
  observed: string;
  predicted: string;
  residualCorr: string;
  blend: string;
  agreementHint: (r: number) => string;
  needsTwoRegression: string;
  profileTitle: string;
  profileAbsent: string;
  profileHint: string;
  foldSd: string;
  mixedScales: string;
  median: string;
  better: string;
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
  perspectiveOverview: "Verdict",
  perspectiveLandscape: "Landscape",
  perspectiveSteps: "Steps",
  perspectivePredictions: "Predictions",
  perspectiveTuning: "Tuning",
  perspectiveCompare: "Compare",
  perspectives: "Perspectives",
  groupRanking: "Ranking",
  groupSteps: "Steps",
  groupTuning: "Tuning & cost",
  groupPredictions: "Predictions",
  viewOverview: "Verdict",
  viewTop: "Top chains",
  viewPareto: "Score vs cost",
  viewCompare: "Side by side",
  viewDatasets: "Across datasets",
  viewFlow: "Step flow",
  viewOrder: "Position & order",
  viewAgreement: "Error agreement",
  descOverview: "The best chain, how sure we are, what drives the score",
  descTop: "Best chains with their fold uncertainty — who is really tied",
  descPareto: "Score against fit time — the cheapest chains that lose nothing",
  descCompare: "Compared chains column by column: scores, steps, parameters",
  descDatasets: "Which models / steps win on every dataset (rank-based)",
  descFlow: "Navigate chains step by step: what comes before and after",
  descOrder: "Is a step better early or late, and after which other step",
  descAgreement: "Do two models make the same errors? Blend potential",
  bestChain: "Best chain",
  runnerUp: "Runner-up",
  foldSpread: "fold ±",
  tiedWithBest: (n) => (n === 0 ? "No other chain within one standard error" : `${n} other chain${n === 1 ? "" : "s"} within one standard error of the best`),
  tieRule: "One-SE rule: inside the band, differences are fold noise.",
  drivers: "What drives the score",
  driversHint: "Share of score variance explained by each factor (ω², bias-corrected)",
  findings: "Findings",
  insightText: (i) => {
    switch (i.kind) {
      case "ties":
        return `${i.count} chain${i.count === 1 ? " is" : "s are"} statistically tied with the best${i.simplest ? ` — fastest of them: ${i.simplest}` : ""}.`;
      case "clearWinner":
        return `Clear winner: ${formatValue(i.gap, 2)} standard errors ahead of ${i.runnerUp}.`;
      case "driver":
        return `${i.factor} explains ${formatPercent(i.share, 0)} of the score variance (best: ${i.level}).`;
      case "family":
        return `${i.leader} leads (${formatValue(i.score)}); ${i.next} is ${formatPercent(i.gain, 0)} behind.`;
      case "stepGain":
        return `${i.step} improves the median score by ${formatPercent(i.gain, 1)} (${i.n} chains).`;
      case "stepLoss":
        return `${i.step} degrades the median score by ${formatPercent(-i.gain, 1)} (${i.n} chains).`;
      case "overfit":
        return `${i.family} overfits: ${i.trainLabel} is ${formatPercent(i.gap, 0)} better than validation.`;
      case "testDrift":
        return i.tone === "warn" ? `The best chain loses ${formatPercent(-i.change, 0)} on ${i.testLabel}.` : `The best chain holds on ${i.testLabel} (${i.change >= 0 ? "+" : "−"}${formatPercent(Math.abs(i.change), 0)}).`;
      case "foldNoise":
        return `Unstable across folds: the best chain varies by ${formatPercent(i.cv, 0)} between folds.`;
    }
  },
  topCount: "Show",
  tieZone: "within 1 SE of best",
  foldRange: "fold min–max · mean ± sd",
  paretoFront: "Pareto front",
  fitTime: "Fit time",
  needsFitTime: "Needs chains with a fit time.",
  needsCompare: "Star (☆) chains to compare them side by side.",
  reference: "reference",
  needsDatasets: "Needs chains on at least two datasets.",
  meanRank: "Mean rank",
  wins: "Wins",
  showDataset: "Inspect this dataset",
  lens: "Lens",
  lensRaw: "Raw score",
  lensRank: "Rank in dataset",
  lensZ: "Z in dataset",
  sortBy: "Sort",
  byDelta: "Δ effect",
  byMedian: "Median",
  byCoverage: "Coverage",
  selectWith: (label, n) => `Select the ${n} chains with ${label}`,
  bestAfter: "Best when placed after…",
  bestBefore: "Best when followed by…",
  notEnough: "Not enough chains.",
  flowStyle: "Style",
  orbit: "Orbit",
  hub: "Hub",
  depth: "Depth",
  positionMode: "Position",
  phase: "Early / mid / late",
  absolute: "1st / 2nd / …",
  adjacentOnly: "Directly after only",
  effectByPosition: "Effect by position",
  effectByOrder: "Effect by order (row before column)",
  plotLayout: "Layout",
  overlay: "Overlay",
  split: "One per chain",
  xAxis: "X axis",
  observed: "Observed",
  predicted: "Predicted",
  residualCorr: "residual r",
  blend: "blend of both",
  agreementHint: (r) => (r > 0.85 ? "Same errors — blending will not help much." : r > 0.6 ? "Partly shared errors — a blend may help." : "Different errors — good blend / stacking candidates."),
  needsTwoRegression: "Compare two regression chains with predictions.",
  profileTitle: "Shared by the selection",
  profileAbsent: "Never used",
  profileHint: "share in selection vs all chains",
  foldSd: "± folds",
  mixedScales: "Scores of several datasets are mixed — rankings are only meaningful within one dataset.",
  median: "Median",
  better: "better",
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
  perspectiveOverview: "Verdict",
  perspectiveLandscape: "Paysage",
  perspectiveSteps: "Étapes",
  perspectivePredictions: "Prédictions",
  perspectiveTuning: "Réglages",
  perspectiveCompare: "Comparer",
  perspectives: "Perspectives",
  groupRanking: "Classement",
  groupSteps: "Étapes",
  groupTuning: "Réglages & coût",
  groupPredictions: "Prédictions",
  viewOverview: "Verdict",
  viewTop: "Meilleures chaînes",
  viewPareto: "Score vs coût",
  viewCompare: "Côte à côte",
  viewDatasets: "Entre jeux",
  viewFlow: "Flux d'étapes",
  viewOrder: "Position & ordre",
  viewAgreement: "Accord des erreurs",
  descOverview: "La meilleure chaîne, sa fiabilité, ce qui fait le score",
  descTop: "Meilleures chaînes avec leur incertitude par fold — qui est vraiment ex æquo",
  descPareto: "Score contre temps d'entraînement — les chaînes les moins chères sans perte",
  descCompare: "Chaînes comparées colonne par colonne : scores, étapes, paramètres",
  descDatasets: "Quels modèles / étapes gagnent sur chaque jeu (par rang)",
  descFlow: "Parcourir les chaînes étape par étape : avant et après",
  descOrder: "Une étape est-elle meilleure tôt ou tard, et après laquelle",
  descAgreement: "Deux modèles font-ils les mêmes erreurs ? Potentiel de mélange",
  bestChain: "Meilleure chaîne",
  runnerUp: "Deuxième",
  foldSpread: "fold ±",
  tiedWithBest: (n) => (n === 0 ? "Aucune autre chaîne à moins d'une erreur-type" : `${n} autre${n > 1 ? "s" : ""} chaîne${n > 1 ? "s" : ""} à moins d'une erreur-type de la meilleure`),
  tieRule: "Règle 1-SE : dans la bande, les écarts sont du bruit de fold.",
  drivers: "Ce qui fait le score",
  driversHint: "Part de variance du score expliquée par chaque facteur (ω², corrigé du biais)",
  findings: "Constats",
  insightText: (i) => {
    switch (i.kind) {
      case "ties":
        return `${i.count} chaîne${i.count > 1 ? "s sont" : " est"} statistiquement à égalité avec la meilleure${i.simplest ? ` — la plus rapide : ${i.simplest}` : ""}.`;
      case "clearWinner":
        return `Gagnante nette : ${formatValue(i.gap, 2)} erreurs-types devant ${i.runnerUp}.`;
      case "driver":
        return `${i.factor} explique ${formatPercent(i.share, 0)} de la variance du score (meilleur : ${i.level}).`;
      case "family":
        return `${i.leader} en tête (${formatValue(i.score)}) ; ${i.next} est ${formatPercent(i.gain, 0)} derrière.`;
      case "stepGain":
        return `${i.step} améliore le score médian de ${formatPercent(i.gain, 1)} (${i.n} chaînes).`;
      case "stepLoss":
        return `${i.step} dégrade le score médian de ${formatPercent(-i.gain, 1)} (${i.n} chaînes).`;
      case "overfit":
        return `${i.family} sur-apprend : ${i.trainLabel} est ${formatPercent(i.gap, 0)} meilleur que la validation.`;
      case "testDrift":
        return i.tone === "warn" ? `La meilleure chaîne perd ${formatPercent(-i.change, 0)} sur ${i.testLabel}.` : `La meilleure chaîne tient sur ${i.testLabel} (${i.change >= 0 ? "+" : "−"}${formatPercent(Math.abs(i.change), 0)}).`;
      case "foldNoise":
        return `Instable entre folds : la meilleure chaîne varie de ${formatPercent(i.cv, 0)} d'un fold à l'autre.`;
    }
  },
  topCount: "Afficher",
  tieZone: "à moins d'1 erreur-type de la meilleure",
  foldRange: "min–max des folds · moyenne ± écart-type",
  paretoFront: "Front de Pareto",
  fitTime: "Temps d'entraînement",
  needsFitTime: "Nécessite des chaînes avec un temps d'entraînement.",
  needsCompare: "Marquez (☆) des chaînes pour les comparer côte à côte.",
  reference: "référence",
  needsDatasets: "Nécessite des chaînes sur au moins deux jeux.",
  meanRank: "Rang moyen",
  wins: "Victoires",
  showDataset: "Inspecter ce jeu",
  lens: "Échelle",
  lensRaw: "Score brut",
  lensRank: "Rang dans le jeu",
  lensZ: "Z dans le jeu",
  sortBy: "Tri",
  byDelta: "Δ effet",
  byMedian: "Médiane",
  byCoverage: "Couverture",
  selectWith: (label, n) => `Sélectionner les ${n} chaînes avec ${label}`,
  bestAfter: "Meilleure placée après…",
  bestBefore: "Meilleure suivie de…",
  notEnough: "Pas assez de chaînes.",
  flowStyle: "Style",
  orbit: "Orbite",
  hub: "Moyeu",
  depth: "Profondeur",
  positionMode: "Position",
  phase: "Début / milieu / fin",
  absolute: "1re / 2e / …",
  adjacentOnly: "Juste après seulement",
  effectByPosition: "Effet selon la position",
  effectByOrder: "Effet selon l'ordre (ligne avant colonne)",
  plotLayout: "Disposition",
  overlay: "Superposé",
  split: "Une par chaîne",
  xAxis: "Axe X",
  observed: "Observé",
  predicted: "Prédit",
  residualCorr: "r des résidus",
  blend: "mélange des deux",
  agreementHint: (r) => (r > 0.85 ? "Mêmes erreurs — un mélange aidera peu." : r > 0.6 ? "Erreurs en partie communes — un mélange peut aider." : "Erreurs différentes — bons candidats au mélange / stacking."),
  needsTwoRegression: "Comparez deux chaînes de régression avec prédictions.",
  profileTitle: "Points communs de la sélection",
  profileAbsent: "Jamais utilisé",
  profileHint: "part dans la sélection vs toutes les chaînes",
  foldSd: "± folds",
  mixedScales: "Les scores de plusieurs jeux sont mélangés — un classement n'a de sens que dans un même jeu.",
  median: "Médiane",
  better: "meilleur",
};

export function resolveInspectorStrings(locale: InspectorLocale = "en", overrides?: Partial<InspectorStrings>): InspectorStrings {
  const base = locale === "fr" ? INSPECTOR_STRINGS_FR : INSPECTOR_STRINGS_EN;
  return overrides ? { ...base, ...overrides } : base;
}
